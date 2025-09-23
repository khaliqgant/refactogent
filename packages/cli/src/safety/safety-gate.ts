import { Logger } from '../utils/logger.js';
import { RefactoGentConfig } from '../config/refactogent-schema.js';
import { RefactoGentMetrics } from '../observability/metrics.js';
import { RefactoGentTracer } from '../observability/tracing.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface SafetyCheckResult {
  passed: boolean;
  score: number;
  violations: SafetyViolation[];
  warnings: SafetyWarning[];
  recommendations: string[];
}

export interface SafetyViolation {
  type: 'critical' | 'high' | 'medium' | 'low';
  category: 'syntax' | 'type' | 'lint' | 'test' | 'security' | 'performance';
  message: string;
  file?: string;
  line?: number;
  column?: number;
  rule?: string;
  fix?: string;
}

export interface SafetyWarning {
  type: 'warning' | 'info';
  category: 'style' | 'best-practice' | 'deprecation' | 'performance';
  message: string;
  file?: string;
  line?: number;
  column?: number;
  suggestion?: string;
}

export interface TestResult {
  passed: boolean;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  coverage?: number;
  duration: number;
  failures: TestFailure[];
}

export interface TestFailure {
  test: string;
  file: string;
  line: number;
  message: string;
  stack?: string;
}

export class SafetyGate {
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
   * Run comprehensive safety checks
   */
  async runSafetyChecks(
    projectPath: string,
    changedFiles: string[] = [],
    options: { verbose?: boolean } = {}
  ): Promise<SafetyCheckResult> {
    const span = this.tracer.startAnalysisTrace(projectPath, 'safety-gate');

    try {
      this.logger.info('Starting safety gate checks', {
        projectPath,
        changedFiles,
        verbose: options.verbose,
      });

      const violations: SafetyViolation[] = [];
      const warnings: SafetyWarning[] = [];
      const recommendations: string[] = [];

      // Run syntax and type checking
      const syntaxResult = await this.checkSyntax(projectPath, changedFiles);
      violations.push(...syntaxResult.violations);
      warnings.push(...syntaxResult.warnings);

      // Run linting
      const lintResult = await this.checkLinting(projectPath, changedFiles);
      violations.push(...lintResult.violations);
      warnings.push(...lintResult.warnings);

      // Run tests
      const testResult = await this.runTests(projectPath);
      if (!testResult.passed) {
        violations.push({
          type: 'critical',
          category: 'test',
          message: `${testResult.failedTests} tests failed`,
          rule: 'test-failure',
        });
      }

      // Check coverage
      if (
        testResult.coverage &&
        testResult.coverage < (this.config.testing?.thresholds?.coverage || 80)
      ) {
        violations.push({
          type: 'medium',
          category: 'test',
          message: `Test coverage ${testResult.coverage}% is below threshold ${this.config.testing?.thresholds?.coverage || 80}%`,
          rule: 'coverage-threshold',
        });
      }

      // Security checks
      const securityResult = await this.checkSecurity(projectPath, changedFiles);
      violations.push(...securityResult.violations);
      warnings.push(...securityResult.warnings);

      // Performance checks
      const performanceResult = await this.checkPerformance(projectPath, changedFiles);
      violations.push(...performanceResult.violations);
      warnings.push(...performanceResult.warnings);

      // Calculate safety score
      const score = this.calculateSafetyScore(violations, warnings);
      const passed = this.determinePassed(violations, score);

      // Generate recommendations
      recommendations.push(...this.generateRecommendations(violations, warnings));

      const result: SafetyCheckResult = {
        passed,
        score,
        violations,
        warnings,
        recommendations,
      };

      // Record metrics
      this.recordSafetyMetrics(result);

      this.tracer.recordSuccess(span, `Safety checks completed with score ${score}`);

      this.logger.info('Safety gate checks completed', {
        passed,
        score,
        violations: violations.length,
        warnings: warnings.length,
      });

      // Add verbose output if requested
      if (options.verbose) {
        console.log('\n🔍 Verbose Safety Check Results:');
        console.log(`Found ${violations.length} violations and ${warnings.length} warnings`);

        if (violations.length > 0) {
          console.log('\n📋 Violations:');
          violations.forEach((violation, index) => {
            console.log(
              `  ${index + 1}. [${violation.type.toUpperCase()}] ${violation.category}: ${violation.message}`
            );
            if (violation.file) {
              console.log(
                `     File: ${violation.file}${violation.line ? `:${violation.line}` : ''}`
              );
            }
            if (violation.rule) {
              console.log(`     Rule: ${violation.rule}`);
            }
          });
        }

        if (warnings.length > 0) {
          console.log('\n⚠️ Warnings:');
          warnings.forEach((warning, index) => {
            console.log(
              `  ${index + 1}. [${warning.type.toUpperCase()}] ${warning.category}: ${warning.message}`
            );
            if (warning.file) {
              console.log(`     File: ${warning.file}${warning.line ? `:${warning.line}` : ''}`);
            }
          });
        }
      }

      return result;
    } catch (error) {
      this.tracer.recordError(span, error as Error, 'Safety gate checks failed');
      throw error;
    }
  }

  /**
   * Check syntax and type errors
   */
  private async checkSyntax(
    projectPath: string,
    changedFiles: string[]
  ): Promise<{ violations: SafetyViolation[]; warnings: SafetyWarning[] }> {
    const violations: SafetyViolation[] = [];
    const warnings: SafetyWarning[] = [];

    try {
      // Run TypeScript compiler
      const { stdout, stderr } = await execAsync('npx tsc --noEmit', { cwd: projectPath });

      if (stderr) {
        const errors = this.parseTypeScriptErrors(stderr);
        for (const error of errors) {
          violations.push({
            type: 'high',
            category: 'type',
            message: error.message,
            file: error.file,
            line: error.line,
            column: error.column,
            rule: 'typescript-error',
          });
        }
      }
    } catch (error) {
      this.logger.warn('TypeScript check failed', { error: (error as Error).message });
    }

    return { violations, warnings };
  }

  /**
   * Check linting
   */
  private async checkLinting(
    projectPath: string,
    changedFiles: string[]
  ): Promise<{ violations: SafetyViolation[]; warnings: SafetyWarning[] }> {
    const violations: SafetyViolation[] = [];
    const warnings: SafetyWarning[] = [];

    try {
      // Try ESLint first
      const { stdout, stderr } = await execAsync('npx eslint --format json .', {
        cwd: projectPath,
      });

      if (stdout) {
        const lintResults = JSON.parse(stdout);
        for (const result of lintResults) {
          for (const message of result.messages) {
            const severity = message.severity === 2 ? 'high' : 'medium';
            const category = message.ruleId?.includes('security') ? 'security' : 'lint';

            violations.push({
              type: severity as any,
              category: category as any,
              message: message.message,
              file: result.filePath,
              line: message.line,
              column: message.column,
              rule: message.ruleId,
            });
          }
        }
      }
    } catch (error) {
      this.logger.warn('ESLint check failed', { error: (error as Error).message });
    }

    return { violations, warnings };
  }

  /**
   * Run tests
   */
  private async runTests(projectPath: string): Promise<TestResult> {
    try {
      const testCommand = this.config.testing?.commands?.unit || 'npm test';
      const { stdout, stderr } = await execAsync(testCommand, { cwd: projectPath });

      // Parse test results (simplified)
      const testResult: TestResult = {
        passed: !stderr.includes('FAIL'),
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        skippedTests: 0,
        coverage: 0,
        duration: 0,
        failures: [],
      };

      // Extract test statistics from output
      const passedMatch = stdout.match(/(\d+) passing/);
      const failedMatch = stdout.match(/(\d+) failing/);
      const skippedMatch = stdout.match(/(\d+) pending/);
      const coverageMatch = stdout.match(/(\d+\.?\d*)%/);

      if (passedMatch) testResult.passedTests = parseInt(passedMatch[1]);
      if (failedMatch) testResult.failedTests = parseInt(failedMatch[1]);
      if (skippedMatch) testResult.skippedTests = parseInt(skippedMatch[1]);
      if (coverageMatch) testResult.coverage = parseFloat(coverageMatch[1]);

      testResult.totalTests =
        testResult.passedTests + testResult.failedTests + testResult.skippedTests;

      return testResult;
    } catch (error) {
      this.logger.warn('Test execution failed', { error: (error as Error).message });
      return {
        passed: false,
        totalTests: 0,
        passedTests: 0,
        failedTests: 1,
        skippedTests: 0,
        duration: 0,
        failures: [
          {
            test: 'Test execution',
            file: 'unknown',
            line: 0,
            message: (error as Error).message,
          },
        ],
      };
    }
  }

  /**
   * Check security issues
   */
  private async checkSecurity(
    projectPath: string,
    changedFiles: string[]
  ): Promise<{ violations: SafetyViolation[]; warnings: SafetyWarning[] }> {
    const violations: SafetyViolation[] = [];
    const warnings: SafetyWarning[] = [];

    try {
      // Check for common security issues in changed files
      for (const file of changedFiles) {
        const content = await fs.readFile(file, 'utf-8');

        // Check for hardcoded secrets
        const secretPatterns = [
          /password\s*=\s*['"][^'"]+['"]/gi,
          /api[_-]?key\s*=\s*['"][^'"]+['"]/gi,
          /secret\s*=\s*['"][^'"]+['"]/gi,
          /token\s*=\s*['"][^'"]+['"]/gi,
        ];

        for (const pattern of secretPatterns) {
          const matches = content.match(pattern);
          if (matches) {
            violations.push({
              type: 'critical',
              category: 'security',
              message: 'Potential hardcoded secret detected',
              file,
              rule: 'hardcoded-secret',
              fix: 'Use environment variables or secure configuration',
            });
          }
        }

        // Check for dangerous functions
        const dangerousPatterns = [/eval\s*\(/gi, /innerHTML\s*=/gi, /document\.write/gi];

        for (const pattern of dangerousPatterns) {
          const matches = content.match(pattern);
          if (matches) {
            warnings.push({
              type: 'warning',
              category: 'best-practice',
              message: 'Potentially dangerous function usage detected',
              file,
              suggestion: 'Review for security implications',
            });
          }
        }
      }
    } catch (error) {
      this.logger.warn('Security check failed', { error: (error as Error).message });
    }

    return { violations, warnings };
  }

  /**
   * Check performance issues
   */
  private async checkPerformance(
    projectPath: string,
    changedFiles: string[]
  ): Promise<{ violations: SafetyViolation[]; warnings: SafetyWarning[] }> {
    const violations: SafetyViolation[] = [];
    const warnings: SafetyWarning[] = [];

    try {
      for (const file of changedFiles) {
        const content = await fs.readFile(file, 'utf-8');

        // Check for performance anti-patterns
        const performancePatterns = [
          /for\s*\(\s*var\s+\w+\s*=\s*0\s*;\s*\w+\s*<\s*array\.length\s*;\s*\w+\+\+\)/gi,
          /document\.getElementById/gi,
          /innerHTML\s*=/gi,
        ];

        for (const pattern of performancePatterns) {
          const matches = content.match(pattern);
          if (matches) {
            warnings.push({
              type: 'warning',
              category: 'performance',
              message: 'Potential performance issue detected',
              file,
              suggestion: 'Consider optimization',
            });
          }
        }
      }
    } catch (error) {
      this.logger.warn('Performance check failed', { error: (error as Error).message });
    }

    return { violations, warnings };
  }

  /**
   * Parse TypeScript errors
   */
  private parseTypeScriptErrors(
    stderr: string
  ): Array<{ message: string; file?: string; line?: number; column?: number }> {
    const errors: Array<{ message: string; file?: string; line?: number; column?: number }> = [];
    const lines = stderr.split('\n');

    for (const line of lines) {
      const match = line.match(/^(.+?)\((\d+),(\d+)\):\s*(.+)$/);
      if (match) {
        errors.push({
          file: match[1],
          line: parseInt(match[2]),
          column: parseInt(match[3]),
          message: match[4],
        });
      }
    }

    return errors;
  }

  /**
   * Calculate safety score
   */
  private calculateSafetyScore(violations: SafetyViolation[], warnings: SafetyWarning[]): number {
    let score = 100;

    for (const violation of violations) {
      switch (violation.type) {
        case 'critical':
          score -= 25;
          break;
        case 'high':
          score -= 15;
          break;
        case 'medium':
          score -= 10;
          break;
        case 'low':
          score -= 5;
          break;
      }
    }

    for (const warning of warnings) {
      score -= 2;
    }

    return Math.max(0, score);
  }

  /**
   * Determine if checks passed
   */
  private determinePassed(violations: SafetyViolation[], score: number): boolean {
    const criticalViolations = violations.filter(v => v.type === 'critical').length;
    const highViolations = violations.filter(v => v.type === 'high').length;

    return criticalViolations === 0 && highViolations === 0 && score >= 70;
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    violations: SafetyViolation[],
    warnings: SafetyWarning[]
  ): string[] {
    const recommendations: string[] = [];

    const criticalViolations = violations.filter(v => v.type === 'critical');
    const highViolations = violations.filter(v => v.type === 'high');

    if (criticalViolations.length > 0) {
      recommendations.push('Fix critical violations before proceeding');
    }

    if (highViolations.length > 0) {
      recommendations.push('Address high-priority violations');
    }

    const typeErrors = violations.filter(v => v.category === 'type');
    if (typeErrors.length > 0) {
      recommendations.push('Fix TypeScript errors');
    }

    const testFailures = violations.filter(v => v.category === 'test');
    if (testFailures.length > 0) {
      recommendations.push('Fix failing tests');
    }

    const securityIssues = violations.filter(v => v.category === 'security');
    if (securityIssues.length > 0) {
      recommendations.push('Address security issues');
    }

    return recommendations;
  }

  /**
   * Record safety metrics
   */
  private recordSafetyMetrics(result: SafetyCheckResult): void {
    for (const violation of result.violations) {
      this.metrics.recordSafetyViolation('safety');
    }

    const testFailures = result.violations.filter(v => v.category === 'test').length;
    const typeErrors = result.violations.filter(v => v.category === 'type').length;
    const lintErrors = result.violations.filter(v => v.category === 'lint').length;

    for (let i = 0; i < testFailures; i++) {
      this.metrics.recordSafetyViolation('test');
    }

    for (let i = 0; i < typeErrors; i++) {
      this.metrics.recordSafetyViolation('type');
    }

    for (let i = 0; i < lintErrors; i++) {
      this.metrics.recordSafetyViolation('lint');
    }
  }
}
