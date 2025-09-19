import fs from 'fs';
import path from 'path';
import { Logger } from '../utils/logger.js';

export interface TestValidationResult {
  testFile: string;
  status: 'valid' | 'invalid' | 'outdated' | 'redundant';
  issues: ValidationIssue[];
  suggestions: ValidationSuggestion[];
  quality: {
    coverage: number; // 0-100
    maintainability: number; // 0-100
    reliability: number; // 0-100
    overall: number; // 0-100
  };
}

export interface ValidationIssue {
  type: 'syntax' | 'logic' | 'performance' | 'maintenance' | 'coverage';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  location?: {
    line: number;
    column: number;
  };
  suggestion?: string;
}

export interface ValidationSuggestion {
  type: 'optimization' | 'cleanup' | 'enhancement' | 'refactor';
  priority: 'low' | 'medium' | 'high';
  message: string;
  implementation?: string;
}

export interface TestMaintenanceReport {
  totalTests: number;
  validTests: number;
  invalidTests: number;
  outdatedTests: number;
  redundantTests: number;
  averageQuality: number;
  recommendations: MaintenanceRecommendation[];
}

export interface MaintenanceRecommendation {
  action: 'update' | 'remove' | 'merge' | 'split' | 'optimize';
  target: string;
  reason: string;
  impact: 'low' | 'medium' | 'high';
  effort: 'low' | 'medium' | 'high';
}

export interface ValidationOptions {
  testDirectory: string;
  tolerance?: {
    maxTestAge?: number; // days
    minCoverage?: number; // percentage
    maxDuplication?: number; // percentage
  };
  includePatterns?: string[];
  excludePatterns?: string[];
}

export class TestValidator {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Validate characterization tests
   */
  async validateTests(options: ValidationOptions): Promise<TestValidationResult[]> {
    this.logger.info('Starting test validation', {
      directory: options.testDirectory,
    });

    const testFiles = this.findTestFiles(options);
    const results: TestValidationResult[] = [];

    for (const testFile of testFiles) {
      try {
        this.logger.debug('Validating test file', { testFile });
        const result = await this.validateTestFile(testFile, options);
        results.push(result);
      } catch (error) {
        this.logger.warn('Failed to validate test file', {
          testFile,
          error: error instanceof Error ? error.message : String(error),
        });

        results.push({
          testFile,
          status: 'invalid',
          issues: [
            {
              type: 'syntax',
              severity: 'critical',
              message: `Failed to parse test file: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          suggestions: [],
          quality: { coverage: 0, maintainability: 0, reliability: 0, overall: 0 },
        });
      }
    }

    this.logger.info('Test validation completed', {
      totalTests: results.length,
      validTests: results.filter(r => r.status === 'valid').length,
    });

    return results;
  }

  /**
   * Generate maintenance report
   */
  generateMaintenanceReport(validationResults: TestValidationResult[]): TestMaintenanceReport {
    const totalTests = validationResults.length;
    const validTests = validationResults.filter(r => r.status === 'valid').length;
    const invalidTests = validationResults.filter(r => r.status === 'invalid').length;
    const outdatedTests = validationResults.filter(r => r.status === 'outdated').length;
    const redundantTests = validationResults.filter(r => r.status === 'redundant').length;

    const averageQuality =
      totalTests > 0
        ? validationResults.reduce((sum, r) => sum + r.quality.overall, 0) / totalTests
        : 0;

    const recommendations = this.generateMaintenanceRecommendations(validationResults);

    return {
      totalTests,
      validTests,
      invalidTests,
      outdatedTests,
      redundantTests,
      averageQuality,
      recommendations,
    };
  }

  /**
   * Update tests based on validation results
   */
  async updateTests(
    validationResults: TestValidationResult[],
    options: {
      autoFix?: boolean;
      backupOriginals?: boolean;
      outputDir?: string;
    } = {}
  ): Promise<string[]> {
    const updatedFiles: string[] = [];
    const { autoFix = false, backupOriginals = true, outputDir } = options;

    for (const result of validationResults) {
      if (result.status === 'invalid' || result.status === 'outdated') {
        try {
          if (backupOriginals) {
            await this.backupTestFile(result.testFile);
          }

          if (autoFix) {
            const updated = await this.applyAutoFixes(result);
            if (updated) {
              updatedFiles.push(result.testFile);
            }
          } else if (outputDir) {
            const updatedContent = await this.generateUpdatedTest(result);
            const outputPath = path.join(outputDir, path.basename(result.testFile));
            fs.writeFileSync(outputPath, updatedContent);
            updatedFiles.push(outputPath);
          }
        } catch (error) {
          this.logger.warn('Failed to update test file', {
            testFile: result.testFile,
            error,
          });
        }
      }
    }

    return updatedFiles;
  }

  /**
   * Validate a single test file
   */
  private async validateTestFile(
    testFile: string,
    options: ValidationOptions
  ): Promise<TestValidationResult> {
    const content = fs.readFileSync(testFile, 'utf8');
    const stats = fs.statSync(testFile);

    const issues: ValidationIssue[] = [];
    const suggestions: ValidationSuggestion[] = [];

    // Check file age
    const ageInDays = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);
    const maxAge = options.tolerance?.maxTestAge || 90;

    if (ageInDays > maxAge) {
      issues.push({
        type: 'maintenance',
        severity: 'medium',
        message: `Test file is ${Math.round(ageInDays)} days old (max: ${maxAge})`,
        suggestion: 'Review and update test cases to ensure they reflect current behavior',
      });
    }

    // Syntax validation
    const syntaxIssues = this.validateSyntax(content);
    issues.push(...syntaxIssues);

    // Logic validation
    const logicIssues = this.validateLogic(content);
    issues.push(...logicIssues);

    // Performance validation
    const performanceIssues = this.validatePerformance(content);
    issues.push(...performanceIssues);

    // Coverage analysis
    const coverageAnalysis = this.analyzeCoverage(content);
    if (coverageAnalysis.coverage < (options.tolerance?.minCoverage || 80)) {
      issues.push({
        type: 'coverage',
        severity: 'medium',
        message: `Low test coverage: ${coverageAnalysis.coverage}%`,
        suggestion: 'Add more test cases to improve coverage',
      });
    }

    // Duplication analysis
    const duplicationAnalysis = this.analyzeDuplication(content);
    if (duplicationAnalysis.percentage > (options.tolerance?.maxDuplication || 30)) {
      issues.push({
        type: 'maintenance',
        severity: 'low',
        message: `High code duplication: ${duplicationAnalysis.percentage}%`,
        suggestion: 'Extract common test utilities to reduce duplication',
      });
    }

    // Generate suggestions
    suggestions.push(...this.generateSuggestions(content, issues));

    // Calculate quality metrics
    const quality = this.calculateQuality(content, issues, coverageAnalysis);

    // Determine status
    const status = this.determineStatus(issues, quality, ageInDays, maxAge);

    return {
      testFile,
      status,
      issues,
      suggestions,
      quality,
    };
  }

  /**
   * Validate syntax
   */
  private validateSyntax(content: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    try {
      // Basic syntax checks
      if (content.includes('describe(') && !content.includes('test(') && !content.includes('it(')) {
        issues.push({
          type: 'syntax',
          severity: 'high',
          message: 'Test suite has describe blocks but no test cases',
          suggestion: 'Add test() or it() blocks with actual test cases',
        });
      }

      // Check for common syntax errors
      const openBraces = (content.match(/\{/g) || []).length;
      const closeBraces = (content.match(/\}/g) || []).length;
      if (openBraces !== closeBraces) {
        issues.push({
          type: 'syntax',
          severity: 'critical',
          message: 'Mismatched braces in test file',
          suggestion: 'Check for missing or extra braces',
        });
      }

      // Check for async/await usage
      if (content.includes('await ') && !content.includes('async ')) {
        issues.push({
          type: 'syntax',
          severity: 'high',
          message: 'Using await without async function',
          suggestion: 'Mark test functions as async when using await',
        });
      }
    } catch (error) {
      issues.push({
        type: 'syntax',
        severity: 'critical',
        message: `Syntax validation failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }

    return issues;
  }

  /**
   * Validate logic
   */
  private validateLogic(content: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // Check for empty test cases
    const emptyTestRegex = /test\([^)]+\)\s*=>\s*\{\s*\}/g;
    const emptyTests = content.match(emptyTestRegex);
    if (emptyTests && emptyTests.length > 0) {
      issues.push({
        type: 'logic',
        severity: 'high',
        message: `Found ${emptyTests.length} empty test case(s)`,
        suggestion: 'Implement test logic or remove empty test cases',
      });
    }

    // Check for missing assertions
    const testBlocks = content.match(/test\([^{]+\{[^}]+\}/g) || [];
    const testsWithoutAssertions = testBlocks.filter(
      block => !block.includes('expect(') && !block.includes('assert') && !block.includes('should')
    );

    if (testsWithoutAssertions.length > 0) {
      issues.push({
        type: 'logic',
        severity: 'high',
        message: `Found ${testsWithoutAssertions.length} test(s) without assertions`,
        suggestion: 'Add expect() statements to validate test outcomes',
      });
    }

    // Check for hardcoded values
    const hardcodedRegex = /expect\([^)]+\)\.toBe\((["'])[^"']+\1\)/g;
    const hardcodedValues = content.match(hardcodedRegex);
    if (hardcodedValues && hardcodedValues.length > 5) {
      issues.push({
        type: 'logic',
        severity: 'low',
        message: 'Many hardcoded expected values detected',
        suggestion: 'Consider using test data files or computed expected values',
      });
    }

    return issues;
  }

  /**
   * Validate performance
   */
  private validatePerformance(content: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // Check for synchronous operations in async tests
    if (content.includes('async') && content.includes('fs.readFileSync')) {
      issues.push({
        type: 'performance',
        severity: 'medium',
        message: 'Using synchronous file operations in async tests',
        suggestion: 'Use async file operations (fs.promises) for better performance',
      });
    }

    // Check for large test data
    const lines = content.split('\n');
    if (lines.length > 1000) {
      issues.push({
        type: 'performance',
        severity: 'low',
        message: `Large test file (${lines.length} lines)`,
        suggestion: 'Consider splitting into smaller test files',
      });
    }

    // Check for nested loops in tests
    const nestedLoopRegex = /for\s*\([^{]+\{[^}]*for\s*\(/g;
    if (nestedLoopRegex.test(content)) {
      issues.push({
        type: 'performance',
        severity: 'medium',
        message: 'Nested loops detected in test code',
        suggestion: 'Consider optimizing test logic or using test data generators',
      });
    }

    return issues;
  }

  /**
   * Analyze test coverage
   */
  private analyzeCoverage(content: string): { coverage: number; details: any } {
    // Simplified coverage analysis
    const testCases = (content.match(/test\(/g) || []).length;
    const assertions = (content.match(/expect\(/g) || []).length;
    const functions = (content.match(/function\s+\w+/g) || []).length;

    // Rough coverage estimate
    const coverage = testCases > 0 ? Math.min(100, (assertions / testCases) * 50) : 0;

    return {
      coverage,
      details: {
        testCases,
        assertions,
        functions,
        assertionsPerTest: testCases > 0 ? assertions / testCases : 0,
      },
    };
  }

  /**
   * Analyze code duplication
   */
  private analyzeDuplication(content: string): { percentage: number; details: any } {
    const lines = content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line);
    const uniqueLines = new Set(lines);

    const duplicationPercentage =
      lines.length > 0 ? ((lines.length - uniqueLines.size) / lines.length) * 100 : 0;

    return {
      percentage: duplicationPercentage,
      details: {
        totalLines: lines.length,
        uniqueLines: uniqueLines.size,
        duplicatedLines: lines.length - uniqueLines.size,
      },
    };
  }

  /**
   * Generate suggestions
   */
  private generateSuggestions(content: string, issues: ValidationIssue[]): ValidationSuggestion[] {
    const suggestions: ValidationSuggestion[] = [];

    // Suggest test organization improvements
    if (!content.includes('describe(')) {
      suggestions.push({
        type: 'enhancement',
        priority: 'medium',
        message: 'Add describe blocks to organize tests',
        implementation: 'Group related tests using describe() blocks',
      });
    }

    // Suggest setup/teardown
    if (content.includes('beforeEach') || content.includes('afterEach')) {
      // Good practice already in place
    } else if ((content.match(/const\s+\w+\s*=/g) || []).length > 3) {
      suggestions.push({
        type: 'optimization',
        priority: 'low',
        message: 'Consider using beforeEach for common test setup',
        implementation: 'Move repeated setup code to beforeEach() hooks',
      });
    }

    // Suggest parameterized tests
    const similarTests = this.findSimilarTests(content);
    if (similarTests.length > 2) {
      suggestions.push({
        type: 'refactor',
        priority: 'medium',
        message: `Found ${similarTests.length} similar tests that could be parameterized`,
        implementation: 'Use test.each() or similar patterns for parameterized tests',
      });
    }

    return suggestions;
  }

  /**
   * Calculate quality metrics
   */
  private calculateQuality(
    content: string,
    issues: ValidationIssue[],
    coverageAnalysis: any
  ): { coverage: number; maintainability: number; reliability: number; overall: number } {
    const coverage = coverageAnalysis.coverage;

    // Maintainability based on issues and code structure
    const criticalIssues = issues.filter(i => i.severity === 'critical').length;
    const highIssues = issues.filter(i => i.severity === 'high').length;
    const maintainability = Math.max(0, 100 - criticalIssues * 30 - highIssues * 15);

    // Reliability based on test structure
    const hasAssertions = content.includes('expect(');
    const hasErrorHandling = content.includes('try') || content.includes('catch');
    const reliability =
      (hasAssertions ? 50 : 0) +
      (hasErrorHandling ? 30 : 0) +
      (issues.length === 0 ? 20 : Math.max(0, 20 - issues.length * 2));

    // Overall quality
    const overall = coverage * 0.3 + maintainability * 0.4 + reliability * 0.3;

    return {
      coverage,
      maintainability,
      reliability,
      overall,
    };
  }

  /**
   * Determine test status
   */
  private determineStatus(
    issues: ValidationIssue[],
    quality: any,
    ageInDays: number,
    maxAge: number
  ): 'valid' | 'invalid' | 'outdated' | 'redundant' {
    const criticalIssues = issues.filter(i => i.severity === 'critical');
    const highIssues = issues.filter(i => i.severity === 'high');

    if (criticalIssues.length > 0) {
      return 'invalid';
    }

    if (ageInDays > maxAge || quality.overall < 50) {
      return 'outdated';
    }

    if (highIssues.length > 3 || quality.overall < 30) {
      return 'redundant';
    }

    return 'valid';
  }

  /**
   * Generate maintenance recommendations
   */
  private generateMaintenanceRecommendations(
    validationResults: TestValidationResult[]
  ): MaintenanceRecommendation[] {
    const recommendations: MaintenanceRecommendation[] = [];

    // Recommend removing invalid tests
    const invalidTests = validationResults.filter(r => r.status === 'invalid');
    if (invalidTests.length > 0) {
      recommendations.push({
        action: 'remove',
        target: `${invalidTests.length} invalid test files`,
        reason: 'Tests have critical syntax or logic errors',
        impact: 'high',
        effort: 'low',
      });
    }

    // Recommend updating outdated tests
    const outdatedTests = validationResults.filter(r => r.status === 'outdated');
    if (outdatedTests.length > 0) {
      recommendations.push({
        action: 'update',
        target: `${outdatedTests.length} outdated test files`,
        reason: 'Tests are old or have low quality scores',
        impact: 'medium',
        effort: 'medium',
      });
    }

    // Recommend merging redundant tests
    const redundantTests = validationResults.filter(r => r.status === 'redundant');
    if (redundantTests.length > 2) {
      recommendations.push({
        action: 'merge',
        target: `${redundantTests.length} redundant test files`,
        reason: 'Tests have overlapping coverage or low value',
        impact: 'low',
        effort: 'medium',
      });
    }

    return recommendations;
  }

  /**
   * Find test files
   */
  private findTestFiles(options: ValidationOptions): string[] {
    const files: string[] = [];
    const includePatterns = options.includePatterns || ['**/*.test.js', '**/*.spec.js'];
    const excludePatterns = options.excludePatterns || ['**/node_modules/**'];

    const searchDir = (dir: string) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relativePath = path.relative(options.testDirectory, fullPath);

          // Check exclude patterns
          if (excludePatterns.some(pattern => this.matchesPattern(relativePath, pattern))) {
            continue;
          }

          if (entry.isFile()) {
            // Check include patterns
            if (includePatterns.some(pattern => this.matchesPattern(relativePath, pattern))) {
              files.push(fullPath);
            }
          } else if (entry.isDirectory()) {
            searchDir(fullPath);
          }
        }
      } catch (error) {
        this.logger.debug('Error reading directory', { dir, error });
      }
    };

    searchDir(options.testDirectory);
    return files;
  }

  /**
   * Find similar tests (simplified)
   */
  private findSimilarTests(content: string): string[] {
    const testBlocks = content.match(/test\([^{]+\{[^}]+\}/g) || [];
    const similar: string[] = [];

    // Simple similarity check based on structure
    for (let i = 0; i < testBlocks.length; i++) {
      for (let j = i + 1; j < testBlocks.length; j++) {
        const similarity = this.calculateSimilarity(testBlocks[i], testBlocks[j]);
        if (similarity > 0.7) {
          similar.push(testBlocks[i]);
          break;
        }
      }
    }

    return similar;
  }

  /**
   * Calculate similarity between two strings
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const words1 = str1.split(/\s+/);
    const words2 = str2.split(/\s+/);
    const commonWords = words1.filter(word => words2.includes(word));

    return commonWords.length / Math.max(words1.length, words2.length);
  }

  /**
   * Check if path matches pattern
   */
  private matchesPattern(filePath: string, pattern: string): boolean {
    const regexPattern = pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*').replace(/\?/g, '.');

    return new RegExp(`^${regexPattern}$`).test(filePath);
  }

  /**
   * Backup test file
   */
  private async backupTestFile(testFile: string): Promise<void> {
    const backupPath = `${testFile}.backup.${Date.now()}`;
    fs.copyFileSync(testFile, backupPath);
    this.logger.debug('Created backup', { original: testFile, backup: backupPath });
  }

  /**
   * Apply automatic fixes
   */
  private async applyAutoFixes(result: TestValidationResult): Promise<boolean> {
    // This would implement automatic fixes for common issues
    // For now, just log what would be fixed
    this.logger.info('Auto-fix not implemented', {
      testFile: result.testFile,
      issues: result.issues.length,
    });
    return false;
  }

  /**
   * Generate updated test content
   */
  private async generateUpdatedTest(result: TestValidationResult): Promise<string> {
    const content = fs.readFileSync(result.testFile, 'utf8');

    // This would implement test updates based on validation results
    // For now, just return original content with comments
    const header = `// Updated test file - ${new Date().toISOString()}\n// Issues found: ${result.issues.length}\n// Suggestions: ${result.suggestions.length}\n\n`;

    return header + content;
  }
}
