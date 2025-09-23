import { Logger } from '../utils/logger.js';
import { RefactoGentMetrics } from '../observability/metrics.js';
import { RefactoGentTracer } from '../observability/tracing.js';
import { RefactoGentConfig } from '../config/refactogent-schema.js';

export interface SafetyGateResult {
  passed: boolean;
  violations: SafetyViolation[];
  warnings: SafetyWarning[];
  score: number;
  recommendations: string[];
}

export interface SafetyViolation {
  type: 'content' | 'security' | 'bias' | 'harmful' | 'inappropriate';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  details: string;
  confidence: number;
}

export interface SafetyWarning {
  type: 'quality' | 'consistency' | 'best-practice';
  message: string;
  suggestion: string;
  confidence: number;
}

export interface SafetyGateOptions {
  enableContentFiltering?: boolean;
  enableSecurityScanning?: boolean;
  enableBiasDetection?: boolean;
  enableHarmfulContentDetection?: boolean;
  enableQualityChecks?: boolean;
  strictMode?: boolean;
  customRules?: string[];
}

/**
 * LLM safety gates for content filtering and quality assurance
 */
export class LLMSafetyGates {
  private logger: Logger;
  private metrics: RefactoGentMetrics;
  private tracer: RefactoGentTracer;
  private config: RefactoGentConfig;

  constructor(
    logger: Logger,
    metrics: RefactoGentMetrics,
    tracer: RefactoGentTracer,
    config: RefactoGentConfig
  ) {
    this.logger = logger;
    this.metrics = metrics;
    this.tracer = tracer;
    this.config = config;
  }

  /**
   * Check content against safety gates
   */
  async checkContent(
    content: string,
    context?: string,
    options: SafetyGateOptions = {}
  ): Promise<SafetyGateResult> {
    const span = this.tracer.startAnalysisTrace('.', 'safety-gate-check');

    try {
      this.logger.info('Running safety gate checks', {
        contentLength: content.length,
        hasContext: !!context,
        options
      });

      const violations: SafetyViolation[] = [];
      const warnings: SafetyWarning[] = [];

      // Content filtering
      if (options.enableContentFiltering !== false) {
        const contentViolations = await this.checkContentFiltering(content);
        violations.push(...contentViolations);
      }

      // Security scanning
      if (options.enableSecurityScanning !== false) {
        const securityViolations = await this.checkSecurityIssues(content);
        violations.push(...securityViolations);
      }

      // Bias detection
      if (options.enableBiasDetection !== false) {
        const biasViolations = await this.checkBias(content);
        violations.push(...biasViolations);
      }

      // Harmful content detection
      if (options.enableHarmfulContentDetection !== false) {
        const harmfulViolations = await this.checkHarmfulContent(content);
        violations.push(...harmfulViolations);
      }

      // Quality checks
      if (options.enableQualityChecks !== false) {
        const qualityWarnings = await this.checkQuality(content);
        warnings.push(...qualityWarnings);
      }

      // Custom rules
      if (options.customRules && options.customRules.length > 0) {
        const customViolations = await this.checkCustomRules(content, options.customRules);
        violations.push(...customViolations);
      }

      // Calculate safety score
      const score = this.calculateSafetyScore(violations, warnings);
      const passed = this.determinePassed(violations, warnings, options.strictMode);

      // Generate recommendations
      const recommendations = this.generateRecommendations(violations, warnings);

      const result: SafetyGateResult = {
        passed,
        violations,
        warnings,
        score,
        recommendations
      };

      this.tracer.recordSuccess(
        span,
        `Safety gate check completed: ${violations.length} violations, ${warnings.length} warnings`
      );

      this.metrics.recordSafetyViolation('safety');

      return result;
    } catch (error) {
      this.tracer.recordError(span, error as Error, 'Safety gate check failed');
      throw error;
    }
  }

  /**
   * Check content filtering
   */
  private async checkContentFiltering(content: string): Promise<SafetyViolation[]> {
    const violations: SafetyViolation[] = [];
    const inappropriatePatterns = [
      /inappropriate|offensive|harmful/i,
      /hate|discrimination|racism/i,
      /violence|threat|danger/i
    ];

    for (const pattern of inappropriatePatterns) {
      if (pattern.test(content)) {
        violations.push({
          type: 'inappropriate',
          severity: 'medium',
          message: 'Potentially inappropriate content detected',
          details: `Content matches pattern: ${pattern.source}`,
          confidence: 0.8
        });
      }
    }

    return violations;
  }

  /**
   * Check security issues
   */
  private async checkSecurityIssues(content: string): Promise<SafetyViolation[]> {
    const violations: SafetyViolation[] = [];
    const securityPatterns = [
      /password|secret|key|token/i,
      /sql.*injection|script.*injection/i,
      /eval\(|exec\(|system\(/i,
      /dangerous|unsafe|vulnerable/i
    ];

    for (const pattern of securityPatterns) {
      if (pattern.test(content)) {
        violations.push({
          type: 'security',
          severity: 'high',
          message: 'Potential security issue detected',
          details: `Content matches security pattern: ${pattern.source}`,
          confidence: 0.9
        });
      }
    }

    return violations;
  }

  /**
   * Check for bias
   */
  private async checkBias(content: string): Promise<SafetyViolation[]> {
    const violations: SafetyViolation[] = [];
    const biasPatterns = [
      /stereotypical|biased|discriminatory/i,
      /gender.*assumption|race.*assumption/i,
      /unfair|prejudiced/i
    ];

    for (const pattern of biasPatterns) {
      if (pattern.test(content)) {
        violations.push({
          type: 'bias',
          severity: 'medium',
          message: 'Potential bias detected',
          details: `Content matches bias pattern: ${pattern.source}`,
          confidence: 0.7
        });
      }
    }

    return violations;
  }

  /**
   * Check for harmful content
   */
  private async checkHarmfulContent(content: string): Promise<SafetyViolation[]> {
    const violations: SafetyViolation[] = [];
    const harmfulPatterns = [
      /self.*harm|suicide|kill.*self/i,
      /violence|weapon|danger/i,
      /illegal|criminal|fraud/i
    ];

    for (const pattern of harmfulPatterns) {
      if (pattern.test(content)) {
        violations.push({
          type: 'harmful',
          severity: 'critical',
          message: 'Potentially harmful content detected',
          details: `Content matches harmful pattern: ${pattern.source}`,
          confidence: 0.9
        });
      }
    }

    return violations;
  }

  /**
   * Check quality
   */
  private async checkQuality(content: string): Promise<SafetyWarning[]> {
    const warnings: SafetyWarning[] = [];

    // Check for code quality issues
    if (content.includes('TODO') || content.includes('FIXME')) {
      warnings.push({
        type: 'quality',
        message: 'Code contains TODO or FIXME comments',
        suggestion: 'Consider addressing pending items before deployment',
        confidence: 0.8
      });
    }

    if (content.includes('console.log') || content.includes('debugger')) {
      warnings.push({
        type: 'quality',
        message: 'Code contains debugging statements',
        suggestion: 'Remove debugging statements before production',
        confidence: 0.9
      });
    }

    // Check for consistency
    if (content.includes('var ') && content.includes('let ') && content.includes('const ')) {
      warnings.push({
        type: 'consistency',
        message: 'Mixed variable declarations detected',
        suggestion: 'Use consistent variable declaration style',
        confidence: 0.7
      });
    }

    return warnings;
  }

  /**
   * Check custom rules
   */
  private async checkCustomRules(content: string, rules: string[]): Promise<SafetyViolation[]> {
    const violations: SafetyViolation[] = [];

    for (const rule of rules) {
      try {
        const pattern = new RegExp(rule, 'i');
        if (pattern.test(content)) {
          violations.push({
            type: 'content',
            severity: 'medium',
            message: 'Content matches custom rule',
            details: `Rule: ${rule}`,
            confidence: 0.8
          });
        }
      } catch (error) {
        this.logger.warn('Invalid custom rule pattern', { rule, error });
      }
    }

    return violations;
  }

  /**
   * Calculate safety score
   */
  private calculateSafetyScore(violations: SafetyViolation[], warnings: SafetyWarning[]): number {
    let score = 100;

    // Deduct points for violations
    for (const violation of violations) {
      switch (violation.severity) {
        case 'low':
          score -= 5;
          break;
        case 'medium':
          score -= 15;
          break;
        case 'high':
          score -= 30;
          break;
        case 'critical':
          score -= 50;
          break;
      }
    }

    // Deduct points for warnings
    for (const warning of warnings) {
      score -= 2;
    }

    return Math.max(0, score);
  }

  /**
   * Determine if content passed safety gates
   */
  private determinePassed(
    violations: SafetyViolation[],
    warnings: SafetyWarning[],
    strictMode?: boolean
  ): boolean {
    if (strictMode) {
      return violations.length === 0 && warnings.length === 0;
    }

    // Allow low severity violations and warnings
    const criticalViolations = violations.filter(v => v.severity === 'critical');
    const highViolations = violations.filter(v => v.severity === 'high');

    return criticalViolations.length === 0 && highViolations.length === 0;
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    violations: SafetyViolation[],
    warnings: SafetyWarning[]
  ): string[] {
    const recommendations: string[] = [];

    if (violations.length > 0) {
      recommendations.push('Review and address all safety violations before proceeding');
    }

    if (warnings.length > 0) {
      recommendations.push('Consider addressing quality warnings for better code quality');
    }

    if (violations.some(v => v.type === 'security')) {
      recommendations.push('Conduct security review of the generated content');
    }

    if (violations.some(v => v.type === 'bias')) {
      recommendations.push('Review content for potential bias and ensure fairness');
    }

    if (warnings.some(w => w.type === 'quality')) {
      recommendations.push('Follow code quality best practices and standards');
    }

    return recommendations;
  }

  /**
   * Get safety gate statistics
   */
  async getSafetyStats(): Promise<{
    totalChecks: number;
    passedChecks: number;
    failedChecks: number;
    averageScore: number;
    violationTypes: Record<string, number>;
    warningTypes: Record<string, number>;
  }> {
    return {
      totalChecks: 0,
      passedChecks: 0,
      failedChecks: 0,
      averageScore: 0,
      violationTypes: {},
      warningTypes: {}
    };
  }

  /**
   * Execute validation pipeline
   */
  async executeValidationPipeline(
    task: any,
    contextPackage: any,
    options: any = {}
  ): Promise<any> {
    const span = this.tracer.startAnalysisTrace('.', 'validation-pipeline');

    try {
      this.logger.info('Executing validation pipeline', { taskId: task.id });

      // Run safety checks
      const safetyResult = await this.checkSafety(task.content, options);
      
      // Run content validation
      const contentResult = await this.validateContent(task.content, options);
      
      // Run security checks
      const securityResult = await this.checkSecurityIssues(task.content);

      const result = {
        passed: safetyResult.passed && contentResult.passed && securityResult.length === 0,
        safety: safetyResult,
        content: contentResult,
        security: securityResult,
        taskId: task.id
      };

      this.tracer.recordSuccess(span, `Validation pipeline completed for task ${task.id}`);
      return result;
    } catch (error) {
      this.tracer.recordError(span, error as Error, 'Validation pipeline failed');
      throw error;
    }
  }

  private async validateContent(content: string, options: any): Promise<any> {
    // Simple content validation - in real implementation would be more sophisticated
    return {
      passed: true,
      score: 0.9,
      issues: []
    };
  }

  /**
   * Check safety of content
   */
  async checkSafety(content: string, options: any = {}): Promise<any> {
    const span = this.tracer.startAnalysisTrace('.', 'safety-check');

    try {
      // Simple safety check - in real implementation would be more sophisticated
      const violations: string[] = [];
      
      // Check for harmful content
      if (content.includes('harmful') || content.includes('dangerous')) {
        violations.push('Potentially harmful content detected');
      }
      
      return {
        passed: violations.length === 0,
        score: violations.length === 0 ? 1.0 : 0.5,
        violations
      };
    } catch (error) {
      this.tracer.recordError(span, error as Error, 'Safety check failed');
      throw error;
    }
  }

  async close(): Promise<void> {
    this.logger.info('Closing LLM safety gates');
  }
}