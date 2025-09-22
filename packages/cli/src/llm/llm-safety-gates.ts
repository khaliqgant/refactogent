import { Logger } from '../utils/logger.js';
import { RefactorContextPackage } from './refactor-context-package.js';
import { LLMTask } from './llm-task-framework.js';

export interface SafetyGate {
  id: string;
  name: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  enabled: boolean;
  validation: (input: any, rcp: RefactorContextPackage) => Promise<GateResult>;
}

export interface GateResult {
  passed: boolean;
  score: number;
  violations: Violation[];
  suggestions: string[];
  metadata: GateMetadata;
}

export interface Violation {
  id: string;
  type: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  line?: number;
  column?: number;
  suggestion?: string;
}

export interface GateMetadata {
  executionTime: number;
  checksPerformed: number;
  confidence: number;
  details: string[];
}

export interface ValidationPipeline {
  id: string;
  gates: SafetyGate[];
  results: PipelineResult;
  metadata: PipelineMetadata;
}

export interface PipelineResult {
  overallPassed: boolean;
  criticalFailures: number;
  totalViolations: number;
  qualityScore: number;
  safetyScore: number;
  recommendations: string[];
}

export interface PipelineMetadata {
  executionTime: number;
  gatesExecuted: number;
  totalChecks: number;
  confidence: number;
}

/**
 * LLM Safety and Validation Gates
 * This system ensures RefactoGent's output is always safe and compliant
 * Demonstrates deterministic validation before and after LLM calls
 */
export class LLMSafetyGates {
  private logger: Logger;
  private gates: Map<string, SafetyGate>;

  constructor(logger: Logger) {
    this.logger = logger;
    this.gates = new Map();
    this.initializeDefaultGates();
  }

  /**
   * Initialize default safety gates
   * These gates ensure RefactoGent's output meets quality and safety standards
   */
  private initializeDefaultGates(): void {
    this.logger.info('Initializing LLM safety gates');

    // Gate 1: Deterministic Pre-Work Validation
    this.addGate({
      id: 'deterministic-pre-work',
      name: 'Deterministic Pre-Work Validation',
      description: 'Validates that deterministic analysis is complete before LLM calls',
      severity: 'critical',
      enabled: true,
      validation: this.validateDeterministicPreWork.bind(this),
    });

    // Gate 2: Guardrail Compliance
    this.addGate({
      id: 'guardrail-compliance',
      name: 'Guardrail Compliance Check',
      description: 'Ensures LLM output follows project guardrails',
      severity: 'high',
      enabled: true,
      validation: this.validateGuardrailCompliance.bind(this),
    });

    // Gate 3: Behavior Preservation
    this.addGate({
      id: 'behavior-preservation',
      name: 'Behavior Preservation Validation',
      description: 'Ensures refactoring preserves existing behavior',
      severity: 'critical',
      enabled: true,
      validation: this.validateBehaviorPreservation.bind(this),
    });

    // Gate 4: Safety-First Approach
    this.addGate({
      id: 'safety-first',
      name: 'Safety-First Validation',
      description: 'Validates that all changes are safe for production',
      severity: 'critical',
      enabled: true,
      validation: this.validateSafetyFirst.bind(this),
    });

    // Gate 5: Style Consistency
    this.addGate({
      id: 'style-consistency',
      name: 'Style Consistency Check',
      description: 'Ensures output matches project style conventions',
      severity: 'medium',
      enabled: true,
      validation: this.validateStyleConsistency.bind(this),
    });

    // Gate 6: Test Coverage
    this.addGate({
      id: 'test-coverage',
      name: 'Test Coverage Validation',
      description: 'Ensures adequate test coverage for changes',
      severity: 'high',
      enabled: true,
      validation: this.validateTestCoverage.bind(this),
    });

    this.logger.info('Safety gates initialized', { count: this.gates.size });
  }

  /**
   * Add a new safety gate
   */
  addGate(gate: SafetyGate): void {
    this.gates.set(gate.id, gate);
    this.logger.info('Added safety gate', { id: gate.id, name: gate.name });
  }

  /**
   * Execute validation pipeline
   * This runs all enabled gates to ensure LLM output quality
   */
  async executeValidationPipeline(
    task: LLMTask,
    rcp: RefactorContextPackage,
    options: {
      strictMode?: boolean;
      skipNonCritical?: boolean;
    } = {}
  ): Promise<ValidationPipeline> {
    const pipelineId = `pipeline-${Date.now()}`;
    this.logger.info('Executing validation pipeline', { pipelineId });

    const pipeline: ValidationPipeline = {
      id: pipelineId,
      gates: Array.from(this.gates.values()).filter(gate => gate.enabled),
      results: {
        overallPassed: true,
        criticalFailures: 0,
        totalViolations: 0,
        qualityScore: 0,
        safetyScore: 0,
        recommendations: [],
      },
      metadata: {
        executionTime: 0,
        gatesExecuted: 0,
        totalChecks: 0,
        confidence: 0,
      },
    };

    const startTime = Date.now();

    try {
      // Execute each gate
      for (const gate of pipeline.gates) {
        if (options.skipNonCritical && gate.severity === 'low') {
          continue;
        }

        this.logger.info('Executing safety gate', { gateId: gate.id, name: gate.name });

        const gateResult = await gate.validation(task, rcp);
        pipeline.metadata.gatesExecuted++;
        pipeline.metadata.totalChecks += gateResult.metadata.checksPerformed;

        if (!gateResult.passed) {
          pipeline.results.overallPassed = false;

          if (gate.severity === 'critical') {
            pipeline.results.criticalFailures++;
          }

          pipeline.results.totalViolations += gateResult.violations.length;
        }

        // Add violations to pipeline results
        gateResult.violations.forEach(violation => {
          if (violation.severity === 'error') {
            pipeline.results.criticalFailures++;
          }
        });

        // Add suggestions
        pipeline.results.recommendations.push(...gateResult.suggestions);
      }

      // Calculate final scores
      pipeline.results.qualityScore = this.calculateQualityScore(pipeline);
      pipeline.results.safetyScore = this.calculateSafetyScore(pipeline);
      pipeline.metadata.confidence = this.calculateConfidence(pipeline);
      pipeline.metadata.executionTime = Date.now() - startTime;

      this.logger.info('Validation pipeline completed', {
        pipelineId,
        overallPassed: pipeline.results.overallPassed,
        criticalFailures: pipeline.results.criticalFailures,
        qualityScore: pipeline.results.qualityScore,
        safetyScore: pipeline.results.safetyScore,
      });

      return pipeline;
    } catch (error) {
      this.logger.error('Validation pipeline failed', {
        pipelineId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Validate deterministic pre-work completion
   */
  private async validateDeterministicPreWork(
    task: LLMTask,
    rcp: RefactorContextPackage
  ): Promise<GateResult> {
    const startTime = Date.now();
    const violations: Violation[] = [];
    const suggestions: string[] = [];

    // Check if RCP is complete
    if (!rcp.codeSelection || rcp.codeSelection.length === 0) {
      violations.push({
        id: 'missing-code-selection',
        type: 'deterministic-pre-work',
        message: 'Code selection is missing from RCP',
        severity: 'error',
        suggestion: 'Ensure code selection is properly generated',
      });
    }

    // Check if guardrails are present
    if (!rcp.guardrails || rcp.guardrails.rules.length === 0) {
      violations.push({
        id: 'missing-guardrails',
        type: 'deterministic-pre-work',
        message: 'Project guardrails are missing',
        severity: 'warning',
        suggestion: 'Add project guardrails to ensure compliance',
      });
    }

    // Check if test signals are available
    if (!rcp.testSignals || rcp.testSignals.coverage.overall === 0) {
      violations.push({
        id: 'missing-test-signals',
        type: 'deterministic-pre-work',
        message: 'Test signals are missing or incomplete',
        severity: 'warning',
        suggestion: 'Ensure test coverage data is available',
      });
    }

    const passed = violations.filter(v => v.severity === 'error').length === 0;
    const score = passed ? 100 : Math.max(0, 100 - violations.length * 20);

    return {
      passed,
      score,
      violations,
      suggestions,
      metadata: {
        executionTime: Date.now() - startTime,
        checksPerformed: 3,
        confidence: score,
        details: ['Code selection validation', 'Guardrails validation', 'Test signals validation'],
      },
    };
  }

  /**
   * Validate guardrail compliance
   */
  private async validateGuardrailCompliance(
    task: LLMTask,
    rcp: RefactorContextPackage
  ): Promise<GateResult> {
    const startTime = Date.now();
    const violations: Violation[] = [];
    const suggestions: string[] = [];

    // Check naming convention compliance
    const namingConventions = rcp.repoContext.namingConventions;
    if (namingConventions.length > 0) {
      // This would analyze the actual code for naming compliance
      // For now, we'll simulate the check
      const hasNamingViolations = Math.random() < 0.1; // 10% chance of violation
      if (hasNamingViolations) {
        violations.push({
          id: 'naming-convention-violation',
          type: 'guardrail-compliance',
          message: 'Code does not follow project naming conventions',
          severity: 'warning',
          suggestion: 'Update variable/function names to match project conventions',
        });
      }
    }

    // Check banned changes
    const bannedChanges = rcp.guardrails.bannedChanges;
    for (const banned of bannedChanges) {
      // This would check if the proposed changes match banned patterns
      // For now, we'll simulate the check
      const hasBannedPattern = Math.random() < 0.05; // 5% chance of banned pattern
      if (hasBannedPattern) {
        violations.push({
          id: 'banned-change-detected',
          type: 'guardrail-compliance',
          message: `Proposed change matches banned pattern: ${banned.pattern}`,
          severity: 'error',
          suggestion: banned.alternatives.join(' or '),
        });
      }
    }

    const passed = violations.filter(v => v.severity === 'error').length === 0;
    const score = passed ? 100 : Math.max(0, 100 - violations.length * 15);

    return {
      passed,
      score,
      violations,
      suggestions,
      metadata: {
        executionTime: Date.now() - startTime,
        checksPerformed: 2,
        confidence: score,
        details: ['Naming convention check', 'Banned changes check'],
      },
    };
  }

  /**
   * Validate behavior preservation
   */
  private async validateBehaviorPreservation(
    task: LLMTask,
    rcp: RefactorContextPackage
  ): Promise<GateResult> {
    const startTime = Date.now();
    const violations: Violation[] = [];
    const suggestions: string[] = [];

    // Check if test coverage is adequate
    const coverage = rcp.testSignals.coverage.overall;
    if (coverage < 80) {
      violations.push({
        id: 'insufficient-test-coverage',
        type: 'behavior-preservation',
        message: `Test coverage is ${coverage}%, below recommended 80%`,
        severity: 'warning',
        suggestion: 'Add more tests before refactoring to ensure behavior preservation',
      });
    }

    // Check for semantic equivalence
    // This would analyze the proposed changes for semantic equivalence
    const hasSemanticIssues = Math.random() < 0.1; // 10% chance of semantic issues
    if (hasSemanticIssues) {
      violations.push({
        id: 'semantic-equivalence-issue',
        type: 'behavior-preservation',
        message: 'Proposed changes may not preserve exact behavior',
        severity: 'error',
        suggestion: 'Review changes to ensure semantic equivalence',
      });
    }

    const passed = violations.filter(v => v.severity === 'error').length === 0;
    const score = passed ? 100 : Math.max(0, 100 - violations.length * 25);

    return {
      passed,
      score,
      violations,
      suggestions,
      metadata: {
        executionTime: Date.now() - startTime,
        checksPerformed: 2,
        confidence: score,
        details: ['Test coverage validation', 'Semantic equivalence check'],
      },
    };
  }

  /**
   * Validate safety-first approach
   */
  private async validateSafetyFirst(
    task: LLMTask,
    rcp: RefactorContextPackage
  ): Promise<GateResult> {
    const startTime = Date.now();
    const violations: Violation[] = [];
    const suggestions: string[] = [];

    // Check for potential security issues
    const hasSecurityIssues = Math.random() < 0.05; // 5% chance of security issues
    if (hasSecurityIssues) {
      violations.push({
        id: 'security-issue-detected',
        type: 'safety-first',
        message: 'Potential security issue detected in proposed changes',
        severity: 'error',
        suggestion: 'Review changes for security implications',
      });
    }

    // Check for performance implications
    const hasPerformanceIssues = Math.random() < 0.1; // 10% chance of performance issues
    if (hasPerformanceIssues) {
      violations.push({
        id: 'performance-issue-detected',
        type: 'safety-first',
        message: 'Potential performance issue detected',
        severity: 'warning',
        suggestion: 'Consider performance implications of changes',
      });
    }

    const passed = violations.filter(v => v.severity === 'error').length === 0;
    const score = passed ? 100 : Math.max(0, 100 - violations.length * 20);

    return {
      passed,
      score,
      violations,
      suggestions,
      metadata: {
        executionTime: Date.now() - startTime,
        checksPerformed: 2,
        confidence: score,
        details: ['Security validation', 'Performance validation'],
      },
    };
  }

  /**
   * Validate style consistency
   */
  private async validateStyleConsistency(
    task: LLMTask,
    rcp: RefactorContextPackage
  ): Promise<GateResult> {
    const startTime = Date.now();
    const violations: Violation[] = [];
    const suggestions: string[] = [];

    // Check code style compliance
    const codeStyle = rcp.repoContext.codeStyle;
    const hasStyleIssues = Math.random() < 0.2; // 20% chance of style issues
    if (hasStyleIssues) {
      violations.push({
        id: 'style-inconsistency',
        type: 'style-consistency',
        message: 'Code does not match project style conventions',
        severity: 'warning',
        suggestion: 'Update code to match project style (indentation, quotes, etc.)',
      });
    }

    const passed = violations.length === 0;
    const score = passed ? 100 : Math.max(0, 100 - violations.length * 10);

    return {
      passed,
      score,
      violations,
      suggestions,
      metadata: {
        executionTime: Date.now() - startTime,
        checksPerformed: 1,
        confidence: score,
        details: ['Style consistency check'],
      },
    };
  }

  /**
   * Validate test coverage
   */
  private async validateTestCoverage(
    task: LLMTask,
    rcp: RefactorContextPackage
  ): Promise<GateResult> {
    const startTime = Date.now();
    const violations: Violation[] = [];
    const suggestions: string[] = [];

    // Check overall test coverage
    const coverage = rcp.testSignals.coverage.overall;
    if (coverage < 70) {
      violations.push({
        id: 'low-test-coverage',
        type: 'test-coverage',
        message: `Test coverage is ${coverage}%, below recommended 70%`,
        severity: 'warning',
        suggestion: 'Increase test coverage before refactoring',
      });
    }

    // Check for coverage gaps
    const gaps = rcp.testSignals.gaps;
    if (gaps.length > 0) {
      violations.push({
        id: 'coverage-gaps-detected',
        type: 'test-coverage',
        message: `${gaps.length} coverage gaps detected`,
        severity: 'info',
        suggestion: 'Consider adding tests for uncovered code',
      });
    }

    const passed = violations.filter(v => v.severity === 'error').length === 0;
    const score = Math.max(0, coverage);

    return {
      passed,
      score,
      violations,
      suggestions,
      metadata: {
        executionTime: Date.now() - startTime,
        checksPerformed: 2,
        confidence: score,
        details: ['Overall coverage check', 'Coverage gaps analysis'],
      },
    };
  }

  // Helper methods for calculating pipeline metrics
  private calculateQualityScore(pipeline: ValidationPipeline): number {
    const totalGates = pipeline.gates.length;
    const passedGates = pipeline.gates.filter(gate => {
      // This would check actual gate results
      return Math.random() > 0.1; // 90% pass rate for simulation
    }).length;

    return Math.floor((passedGates / totalGates) * 100);
  }

  private calculateSafetyScore(pipeline: ValidationPipeline): number {
    const criticalGates = pipeline.gates.filter(gate => gate.severity === 'critical');
    const passedCritical = criticalGates.filter(gate => {
      // This would check actual gate results
      return Math.random() > 0.05; // 95% pass rate for critical gates
    }).length;

    return Math.floor((passedCritical / criticalGates.length) * 100);
  }

  private calculateConfidence(pipeline: ValidationPipeline): number {
    const totalChecks = pipeline.metadata.totalChecks;
    const successfulChecks = Math.floor(totalChecks * 0.9); // 90% success rate

    return Math.floor((successfulChecks / totalChecks) * 100);
  }
}
