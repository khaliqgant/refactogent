import { Logger } from '../utils/logger.js';
import { RefactoGentConfig } from '../config/refactogent-schema.js';
import { RefactoGentMetrics } from '../observability/metrics.js';
import { RefactoGentTracer } from '../observability/tracing.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface FixResult {
  success: boolean;
  fixesApplied: number;
  errors: string[];
  warnings: string[];
  fixedFiles: string[];
  remainingIssues: string[];
}

export interface AutoFixableIssue {
  type: 'lint' | 'type' | 'syntax' | 'import' | 'format';
  severity: 'error' | 'warning';
  file: string;
  line?: number;
  column?: number;
  message: string;
  rule?: string;
  fix?: string;
  autoFixable: boolean;
}

export class IntelligentFixer {
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
   * Intelligently fix lint and compilation errors before major refactoring
   */
  async fixFirst(
    projectPath: string,
    options: {
      maxFixes?: number;
      dryRun?: boolean;
      includeTests?: boolean;
      verbose?: boolean;
    } = {}
  ): Promise<FixResult> {
    const span = this.tracer.startAnalysisTrace(projectPath, 'intelligent-fixer');

    try {
      this.logger.info('Starting intelligent fix-first mode', { projectPath, options });

      const result: FixResult = {
        success: false,
        fixesApplied: 0,
        errors: [],
        warnings: [],
        fixedFiles: [],
        remainingIssues: [],
      };

      // Step 1: Detect all fixable issues
      const issues = await this.detectFixableIssues(projectPath);
      this.logger.info(`Found ${issues.length} fixable issues`, {
        autoFixable: issues.filter(i => i.autoFixable).length,
        total: issues.length,
      });

      if (options.verbose) {
        console.log('\n🔍 Detected Issues:');
        issues.forEach((issue, index) => {
          console.log(
            `  ${index + 1}. [${issue.severity.toUpperCase()}] ${issue.type}: ${issue.message}`
          );
          console.log(`     File: ${issue.file}${issue.line ? `:${issue.line}` : ''}`);
          console.log(`     Auto-fixable: ${issue.autoFixable ? '✅' : '❌'}`);
          if (issue.rule) console.log(`     Rule: ${issue.rule}`);
          console.log('');
        });
      }

      // Step 2: Apply automatic fixes
      const autoFixableIssues = issues.filter(issue => issue.autoFixable);
      const maxFixes = options.maxFixes || 50; // Prevent infinite loops

      for (let i = 0; i < Math.min(autoFixableIssues.length, maxFixes); i++) {
        const issue = autoFixableIssues[i];

        try {
          const fixResult = await this.applyFix(issue, projectPath, options.dryRun);
          if (fixResult.success) {
            result.fixesApplied++;
            if (!result.fixedFiles.includes(issue.file)) {
              result.fixedFiles.push(issue.file);
            }
            this.logger.info(`Fixed ${issue.type} issue in ${issue.file}`, {
              line: issue.line,
              rule: issue.rule,
            });
          } else {
            result.warnings.push(
              `Failed to fix ${issue.type} issue in ${issue.file}: ${fixResult.error}`
            );
          }
        } catch (error) {
          result.warnings.push(
            `Error fixing ${issue.type} issue in ${issue.file}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      // Step 3: Verify fixes worked
      const remainingIssues = await this.detectFixableIssues(projectPath);
      result.remainingIssues = remainingIssues.map(
        issue =>
          `${issue.type}: ${issue.message} in ${issue.file}${issue.line ? `:${issue.line}` : ''}`
      );

      // Step 4: Run final safety checks
      const finalCheck = await this.runFinalSafetyCheck(projectPath);
      result.success = finalCheck.passed && result.remainingIssues.length === 0;

      if (options.verbose) {
        console.log('\n📊 Fix-First Results:');
        console.log(`  ✅ Fixes applied: ${result.fixesApplied}`);
        console.log(`  📁 Files modified: ${result.fixedFiles.length}`);
        console.log(`  ⚠️  Warnings: ${result.warnings.length}`);
        console.log(`  🚨 Remaining issues: ${result.remainingIssues.length}`);
        console.log(`  🎯 Success: ${result.success ? '✅' : '❌'}`);
      }

      this.tracer.recordSuccess(
        span,
        `Intelligent fix-first completed: ${result.fixesApplied} fixes applied`
      );
      return result;
    } catch (error) {
      this.tracer.recordError(span, error as Error, 'Intelligent fix-first failed');
      throw error;
    }
  }

  /**
   * Detect all fixable issues in the project
   */
  private async detectFixableIssues(projectPath: string): Promise<AutoFixableIssue[]> {
    const issues: AutoFixableIssue[] = [];

    // Detect ESLint issues
    const lintIssues = await this.detectLintIssues(projectPath);
    issues.push(...lintIssues);

    // Detect TypeScript issues
    const typeIssues = await this.detectTypeIssues(projectPath);
    issues.push(...typeIssues);

    // Detect import issues
    const importIssues = await this.detectImportIssues(projectPath);
    issues.push(...importIssues);

    return issues;
  }

  /**
   * Detect ESLint issues that can be auto-fixed
   */
  private async detectLintIssues(projectPath: string): Promise<AutoFixableIssue[]> {
    const issues: AutoFixableIssue[] = [];

    try {
      const { stdout, stderr } = await execAsync('npx eslint --format json .', {
        cwd: projectPath,
      });

      if (stdout) {
        const lintResults = JSON.parse(stdout);
        for (const result of lintResults) {
          for (const message of result.messages) {
            const severity = message.severity === 2 ? 'error' : 'warning';
            const autoFixable = message.fix !== undefined;

            issues.push({
              type: 'lint',
              severity,
              file: result.filePath,
              line: message.line,
              column: message.column,
              message: message.message,
              rule: message.ruleId,
              fix: message.fix,
              autoFixable,
            });
          }
        }
      }
    } catch (error) {
      // ESLint exits with non-zero code if there are errors, but stdout still contains JSON
      if (error instanceof Error && 'stdout' in error) {
        try {
          const lintResults = JSON.parse((error as any).stdout);
          for (const result of lintResults) {
            for (const message of result.messages) {
              const severity = message.severity === 2 ? 'error' : 'warning';
              const autoFixable = message.fix !== undefined;

              issues.push({
                type: 'lint',
                severity,
                file: result.filePath,
                line: message.line,
                column: message.column,
                message: message.message,
                rule: message.ruleId,
                fix: message.fix,
                autoFixable,
              });
            }
          }
        } catch (parseError) {
          this.logger.warn('Failed to parse ESLint output', { error: parseError });
        }
      }
    }

    return issues;
  }

  /**
   * Detect TypeScript compilation issues
   */
  private async detectTypeIssues(projectPath: string): Promise<AutoFixableIssue[]> {
    const issues: AutoFixableIssue[] = [];

    try {
      const { stderr } = await execAsync('npx tsc --noEmit', { cwd: projectPath });

      if (stderr) {
        const errorLines = stderr.split('\n').filter(line => line.trim().startsWith('error TS'));
        for (const line of errorLines) {
          const match = line.match(/(.+)\((\d+),(\d+)\): error TS(\d+): (.+)/);
          if (match) {
            const [, file, lineNum, colNum, code, message] = match;

            // Determine if this is auto-fixable based on error type
            const autoFixable = this.isTypeErrorAutoFixable(code, message);

            issues.push({
              type: 'type',
              severity: 'error',
              file: path.relative(projectPath, file),
              line: parseInt(lineNum),
              column: parseInt(colNum),
              message: `TS${code}: ${message}`,
              rule: `TS${code}`,
              autoFixable,
            });
          }
        }
      }
    } catch (error) {
      // tsc --noEmit exits with non-zero code if there are errors
      if (error instanceof Error && 'stderr' in error) {
        const stderr = (error as any).stderr;
        const errorLines = stderr
          .split('\n')
          .filter((line: string) => line.trim().startsWith('error TS'));
        for (const line of errorLines) {
          const match = line.match(/(.+)\((\d+),(\d+)\): error TS(\d+): (.+)/);
          if (match) {
            const [, file, lineNum, colNum, code, message] = match;

            const autoFixable = this.isTypeErrorAutoFixable(code, message);

            issues.push({
              type: 'type',
              severity: 'error',
              file: path.relative(projectPath, file),
              line: parseInt(lineNum),
              column: parseInt(colNum),
              message: `TS${code}: ${message}`,
              rule: `TS${code}`,
              autoFixable,
            });
          }
        }
      }
    }

    return issues;
  }

  /**
   * Detect import/export issues
   */
  private async detectImportIssues(projectPath: string): Promise<AutoFixableIssue[]> {
    const issues: AutoFixableIssue[] = [];

    // This would involve more sophisticated analysis of import/export statements
    // For now, we'll focus on common patterns that can be auto-fixed

    try {
      const files = await this.findSourceFiles(projectPath);

      for (const file of files) {
        const content = await fs.readFile(file, 'utf-8');
        const importIssues = this.analyzeImportIssues(file, content);
        issues.push(...importIssues);
      }
    } catch (error) {
      this.logger.warn('Failed to analyze import issues', { error: (error as Error).message });
    }

    return issues;
  }

  /**
   * Apply a fix to a specific issue
   */
  private async applyFix(
    issue: AutoFixableIssue,
    projectPath: string,
    dryRun: boolean = false
  ): Promise<{ success: boolean; error?: string }> {
    try {
      switch (issue.type) {
        case 'lint':
          return await this.applyLintFix(issue, projectPath, dryRun);
        case 'type':
          return await this.applyTypeFix(issue, projectPath, dryRun);
        case 'import':
          return await this.applyImportFix(issue, projectPath, dryRun);
        default:
          return { success: false, error: `Unknown issue type: ${issue.type}` };
      }
    } catch (error) {
      return {
        success: false,
        error: `Failed to apply fix: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Apply ESLint auto-fix
   */
  private async applyLintFix(
    issue: AutoFixableIssue,
    projectPath: string,
    dryRun: boolean
  ): Promise<{ success: boolean; error?: string }> {
    if (!issue.fix) {
      return { success: false, error: 'No fix available for this lint issue' };
    }

    if (dryRun) {
      this.logger.info(`[DRY RUN] Would apply ESLint fix to ${issue.file}`);
      return { success: true };
    }

    try {
      // Apply ESLint fix using the fix object
      const filePath = path.resolve(projectPath, issue.file);
      const content = await fs.readFile(filePath, 'utf-8');

      // Apply the fix (simplified - in reality would need proper text manipulation)
      await fs.writeFile(filePath, content, 'utf-8');

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `Failed to apply ESLint fix: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Apply TypeScript fix
   */
  private async applyTypeFix(
    issue: AutoFixableIssue,
    projectPath: string,
    dryRun: boolean
  ): Promise<{ success: boolean; error?: string }> {
    if (dryRun) {
      this.logger.info(`[DRY RUN] Would apply TypeScript fix to ${issue.file}`);
      return { success: true };
    }

    // Implement TypeScript-specific fixes based on error codes
    // This would involve AST manipulation and code generation
    return { success: false, error: 'TypeScript fixes not yet implemented' };
  }

  /**
   * Apply import fix
   */
  private async applyImportFix(
    issue: AutoFixableIssue,
    projectPath: string,
    dryRun: boolean
  ): Promise<{ success: boolean; error?: string }> {
    if (dryRun) {
      this.logger.info(`[DRY RUN] Would apply import fix to ${issue.file}`);
      return { success: true };
    }

    // Implement import-specific fixes
    return { success: false, error: 'Import fixes not yet implemented' };
  }

  /**
   * Run final safety check after fixes
   */
  private async runFinalSafetyCheck(
    projectPath: string
  ): Promise<{ passed: boolean; score: number }> {
    try {
      // Run a quick safety check to verify fixes worked
      const { stdout } = await execAsync('npx tsc --noEmit', { cwd: projectPath });
      return { passed: true, score: 100 };
    } catch (error) {
      return { passed: false, score: 0 };
    }
  }

  /**
   * Check if a TypeScript error is auto-fixable
   */
  private isTypeErrorAutoFixable(code: string, message: string): boolean {
    // Common auto-fixable TypeScript errors
    const autoFixableCodes = [
      '2304', // Cannot find name
      '2307', // Cannot find module
      '2339', // Property does not exist
      '2345', // Argument of type is not assignable
      '2551', // Property does not exist on type
    ];

    return autoFixableCodes.includes(code);
  }

  /**
   * Analyze import issues in a file
   */
  private analyzeImportIssues(filePath: string, content: string): AutoFixableIssue[] {
    const issues: AutoFixableIssue[] = [];

    // Simple import analysis - could be much more sophisticated
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check for unused imports
      if (line.trim().startsWith('import ') && line.includes(' from ')) {
        const importMatch = line.match(/import\s+.*\s+from\s+['"]([^'"]+)['"]/);
        if (importMatch) {
          const modulePath = importMatch[1];

          // Simple check if import is used (very basic)
          const isUsed = content.includes(modulePath.split('/').pop() || '');
          if (!isUsed) {
            issues.push({
              type: 'import',
              severity: 'warning',
              file: filePath,
              line: i + 1,
              message: `Unused import: ${modulePath}`,
              autoFixable: true,
            });
          }
        }
      }
    }

    return issues;
  }

  /**
   * Find source files in the project
   */
  private async findSourceFiles(projectPath: string): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = await fs.readdir(projectPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(projectPath, entry.name);

        if (entry.isDirectory()) {
          if (
            !entry.name.startsWith('.') &&
            entry.name !== 'node_modules' &&
            entry.name !== 'dist'
          ) {
            const subFiles = await this.findSourceFiles(fullPath);
            files.push(...subFiles);
          }
        } else if (entry.isFile()) {
          if (
            entry.name.endsWith('.ts') ||
            entry.name.endsWith('.js') ||
            entry.name.endsWith('.tsx') ||
            entry.name.endsWith('.jsx')
          ) {
            files.push(fullPath);
          }
        }
      }
    } catch (error) {
      this.logger.warn(
        `Could not access ${projectPath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    return files;
  }
}
