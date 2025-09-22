import { Command } from 'commander';
import { BaseCommand } from './base.js';
import { CommandResult, RefactoringMode } from '../types/index.js';
import { TransformationEngine, TransformationPlan } from '../refactoring/transformation-engine.js';
import { Logger } from '../utils/logger.js';
import fs from 'fs';
import path from 'path';

interface TransformOptions {
  transformations?: string[];
  files?: string[];
  output?: string;
  dryRun?: boolean;
  createRollback?: boolean;
  stopOnError?: boolean;
  resolveConflicts?: boolean;
  optimizeOrder?: boolean;
  validate?: boolean;
}

export class TransformCommand extends BaseCommand {
  private engine: TransformationEngine;

  constructor(logger: Logger) {
    super(logger);
    this.engine = new TransformationEngine(logger);
  }

  async execute(options: TransformOptions): Promise<CommandResult> {
    this.validateContext();

    const outputDir = options.output || path.join(this.context!.outputDir, 'transformations');
    const projectPath = this.context!.projectInfo.path;

    this.logger.info('Starting transformation execution', {
      transformations: options.transformations?.length || 0,
      files: options.files?.length || 0,
      dryRun: options.dryRun,
    });

    try {
      // Get available transformations if none specified
      if (!options.transformations || options.transformations.length === 0) {
        const available = await this.engine.getAvailableTransformations();
        console.log('\n📋 Available Transformations:');
        available.forEach(t => {
          console.log(`  ${t.id}: ${t.name} (${t.category}, ${t.riskLevel} risk)`);
          console.log(`    ${t.description}`);
        });
        return this.success('Listed available transformations', [], {
          availableTransformations: available.length,
        });
      }

      // Find files to transform
      const filesToTransform = options.files?.length
        ? options.files.map(f => path.resolve(f))
        : this.findSourceFiles(projectPath);

      if (filesToTransform.length === 0) {
        return this.failure('No files found to transform');
      }

      // Create transformation plan
      const plan = await this.engine.createTransformationPlan(options.transformations, {
        resolveConflicts: options.resolveConflicts,
        optimizeOrder: options.optimizeOrder,
      });

      // Validate plan if requested
      if (options.validate) {
        const validation = await this.engine.validatePlan(plan, filesToTransform);

        if (!validation.valid) {
          const errorReport = this.generateValidationReport(validation, outputDir);
          return this.failure(`Plan validation failed. See ${errorReport} for details`);
        }

        if (validation.warnings.length > 0) {
          console.log('\n⚠️  Plan Warnings:');
          validation.warnings.forEach(warning => {
            console.log(`  - ${warning.message}`);
            if (warning.suggestion) {
              console.log(`    Suggestion: ${warning.suggestion}`);
            }
          });
        }
      }

      // Show plan summary
      console.log('\n📋 Transformation Plan:');
      console.log(`  ID: ${plan.id}`);
      console.log(`  Transformations: ${plan.transformations.length}`);
      console.log(`  Execution Order: ${plan.executionOrder.join(' → ')}`);
      console.log(
        `  Estimated Impact: ${plan.estimatedImpact.filesAffected} files, ${plan.estimatedImpact.linesChanged} lines`
      );
      console.log(`  Risk Score: ${plan.estimatedImpact.riskScore}/100`);

      if (plan.conflicts.length > 0) {
        console.log(`  Conflicts: ${plan.conflicts.length}`);
        plan.conflicts.forEach(conflict => {
          console.log(
            `    - ${conflict.transformationA} ↔ ${conflict.transformationB}: ${conflict.resolution}`
          );
        });
      }

      // Execute plan
      const result = await this.engine.executePlan(plan, filesToTransform, {
        dryRun: options.dryRun,
        createRollbackPlan: options.createRollback,
        stopOnError: options.stopOnError,
      });

      // Ensure output directory exists
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const generatedFiles: string[] = [];

      // Generate execution report
      const executionReport = this.generateExecutionReport(result, plan);
      const reportFile = path.join(outputDir, `execution-report-${plan.id}.md`);
      fs.writeFileSync(reportFile, executionReport);
      generatedFiles.push(reportFile);

      // Save rollback plan if created
      if (result.rollbackPlan) {
        const rollbackFile = path.join(outputDir, `rollback-${result.rollbackPlan.id}.json`);
        fs.writeFileSync(rollbackFile, JSON.stringify(result.rollbackPlan, null, 2));
        generatedFiles.push(rollbackFile);
      }

      // Generate transformation summary
      const summaryFile = path.join(outputDir, `transformation-summary-${plan.id}.json`);
      const summary = {
        plan,
        result,
        timestamp: new Date().toISOString(),
        files: filesToTransform.map(f => path.relative(projectPath, f)),
      };
      fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
      generatedFiles.push(summaryFile);

      this.logger.success('Transformation execution completed', {
        planId: plan.id,
        success: result.success,
        totalChanges: result.summary.totalChanges,
        executionTime: result.summary.executionTime,
      });

      const message = options.dryRun
        ? `Analyzed ${result.summary.totalTransformations} transformations (dry run)`
        : `Applied ${result.summary.successfulTransformations}/${result.summary.totalTransformations} transformations`;

      return this.success(message, generatedFiles, {
        planId: plan.id,
        success: result.success,
        totalTransformations: result.summary.totalTransformations,
        successfulTransformations: result.summary.successfulTransformations,
        failedTransformations: result.summary.failedTransformations,
        totalChanges: result.summary.totalChanges,
        executionTime: result.summary.executionTime,
        rollbackAvailable: !!result.rollbackPlan,
        outputDir,
      });
    } catch (error) {
      return this.failure(
        `Transformation failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private findSourceFiles(projectPath: string): string[] {
    const files: string[] = [];
    const extensions = ['.ts', '.tsx', '.js', '.jsx'];

    const searchDir = (dir: string) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          if (entry.isFile()) {
            const ext = path.extname(entry.name);
            if (extensions.includes(ext)) {
              files.push(fullPath);
            }
          } else if (
            entry.isDirectory() &&
            !['node_modules', '.git', 'dist', 'build', '.refactogent'].includes(entry.name)
          ) {
            searchDir(fullPath);
          }
        }
      } catch (error) {
        this.logger.debug('Error reading directory', { dir, error });
      }
    };

    searchDir(projectPath);
    return files.slice(0, 10); // Limit for safety
  }

  private generateValidationReport(validation: any, outputDir: string): string {
    const reportContent = `# Transformation Plan Validation Report

## Summary
- **Valid**: ${validation.valid ? 'Yes' : 'No'}
- **Issues**: ${validation.issues.length}
- **Warnings**: ${validation.warnings.length}
- **Suggestions**: ${validation.suggestions.length}

## Issues
${validation.issues
  .map(
    (issue: any) => `
### ${issue.severity.toUpperCase()}: ${issue.message}
${issue.code ? `**Code**: ${issue.code}` : ''}
${issue.location ? `**Location**: Line ${issue.location.line}, Column ${issue.location.column}` : ''}
`
  )
  .join('')}

## Warnings
${validation.warnings
  .map(
    (warning: any) => `
- **${warning.message}**
${warning.suggestion ? `  - Suggestion: ${warning.suggestion}` : ''}
${warning.location ? `  - Location: Line ${warning.location.line}, Column ${warning.location.column}` : ''}
`
  )
  .join('')}

## Suggestions
${validation.suggestions.map((suggestion: string) => `- ${suggestion}`).join('\n')}

Generated at: ${new Date().toISOString()}
`;

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const reportFile = path.join(outputDir, 'validation-report.md');
    fs.writeFileSync(reportFile, reportContent);
    return reportFile;
  }

  private generateExecutionReport(result: any, plan: any): string {
    const successfulResults = result.results.filter((r: any) => r.success);
    const failedResults = result.results.filter((r: any) => !r.success);

    return `# Transformation Execution Report

## Summary
- **Plan ID**: ${result.planId}
- **Success**: ${result.success ? 'Yes' : 'No'}
- **Total Transformations**: ${result.summary.totalTransformations}
- **Successful**: ${result.summary.successfulTransformations}
- **Failed**: ${result.summary.failedTransformations}
- **Total Changes**: ${result.summary.totalChanges}
- **Execution Time**: ${result.summary.executionTime}ms
- **Rollback Available**: ${result.rollbackPlan ? 'Yes' : 'No'}

## Plan Details
- **Transformations**: ${plan.transformations.join(', ')}
- **Execution Order**: ${plan.executionOrder.join(' → ')}
- **Estimated Impact**: ${plan.estimatedImpact.filesAffected} files, ${plan.estimatedImpact.linesChanged} lines
- **Risk Score**: ${plan.estimatedImpact.riskScore}/100

${
  plan.conflicts.length > 0
    ? `
## Conflicts Resolved
${plan.conflicts
  .map(
    (conflict: any) => `
- **${conflict.transformationA}** ↔ **${conflict.transformationB}**
  - Resolution: ${conflict.resolution}
  - Reason: ${conflict.reason}
`
  )
  .join('')}
`
    : ''
}

## Successful Transformations (${successfulResults.length})
${successfulResults
  .map(
    (r: any) => `
### ${r.transformationId}
- **Changes**: ${r.changes.length}
- **Syntax Valid**: ${r.syntaxValid ? 'Yes' : 'No'}
- **Semantic Valid**: ${r.semanticValid ? 'Yes' : 'No'}
- **Lines Changed**: ${r.metrics.linesChanged}
- **Execution Time**: ${r.metrics.performance.executionTime}ms
- **Memory Usage**: ${Math.round(r.metrics.performance.memoryUsage / 1024)}KB

**Changes Applied:**
${r.changes.map((change: any) => `- ${change.description} (${change.confidence}% confidence, ${change.riskLevel} risk)`).join('\n')}
`
  )
  .join('')}

${
  failedResults.length > 0
    ? `
## Failed Transformations (${failedResults.length})
${failedResults
  .map(
    (r: any) => `
### ${r.transformationId}
- **Syntax Valid**: ${r.syntaxValid ? 'Yes' : 'No'}
- **Semantic Valid**: ${r.semanticValid ? 'Yes' : 'No'}

**Diagnostics:**
${r.diagnostics.map((d: string) => `- ${d}`).join('\n')}
`
  )
  .join('')}
`
    : ''
}

## Performance Metrics
- **Average Execution Time**: ${Math.round(result.results.reduce((sum: number, r: any) => sum + r.metrics.performance.executionTime, 0) / result.results.length)}ms
- **Total Memory Usage**: ${Math.round(result.results.reduce((sum: number, r: any) => sum + r.metrics.performance.memoryUsage, 0) / 1024)}KB
- **Complexity Impact**: ${this.calculateComplexityImpact(result.results)}

${
  result.rollbackPlan
    ? `
## Rollback Information
- **Rollback Plan ID**: ${result.rollbackPlan.id}
- **Rollback File**: rollback-${result.rollbackPlan.id}.json
- **To Rollback**: Use \`refactogent rollback --plan rollback-${result.rollbackPlan.id}.json\`
`
    : ''
}

## Next Steps
1. Review the applied changes using \`git diff\`
2. Run your test suite to verify functionality
3. Commit changes if satisfied: \`git add . && git commit -m "refactor: applied transformations"\`
${result.rollbackPlan ? '4. Keep rollback plan safe in case reversal is needed' : ''}

Generated at: ${new Date().toISOString()}
`;
  }

  private calculateComplexityImpact(results: any[]): string {
    const totalBefore = results.reduce((sum, r) => sum + r.metrics.complexity.before, 0);
    const totalAfter = results.reduce((sum, r) => sum + r.metrics.complexity.after, 0);
    const change = totalAfter - totalBefore;
    const percentage = totalBefore > 0 ? Math.round((change / totalBefore) * 100) : 0;

    if (change > 0) {
      return `Increased by ${change} (${percentage}%)`;
    } else if (change < 0) {
      return `Reduced by ${Math.abs(change)} (${Math.abs(percentage)}%)`;
    } else {
      return 'No change';
    }
  }
}

/**
 * Create the transform command for the CLI
 */
export function createTransformCommand(): Command {
  const command = new Command('transform')
    .description('Execute advanced AST-based code transformations')
    .option('--transformations <ids...>', 'Transformation IDs to apply')
    .option('--files <files...>', 'Specific files to transform')
    .option('--output <dir>', 'Output directory for reports')
    .option('--dry-run', 'Analyze transformations without applying changes')
    .option('--create-rollback', 'Create rollback plan for reverting changes')
    .option('--stop-on-error', 'Stop execution on first error')
    .option('--resolve-conflicts', 'Automatically resolve transformation conflicts')
    .option('--optimize-order', 'Optimize transformation execution order')
    .option('--validate', 'Validate transformation plan before execution')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.parent?.parent?.opts() || {};

      // Initialize CLI context
      const logger = new Logger(globalOpts.verbose);

      try {
        // Create command instance
        const transformCommand = new TransformCommand(logger);

        // Set up minimal context
        const projectPath = globalOpts.project || process.cwd();
        const outputDir = path.resolve(projectPath, globalOpts.output || '.refactogent/out');

        // Ensure output directory exists
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }

        // Mock context for this command
        const context = {
          config: {
            version: '1.0',
            maxPrLoc: 300,
            branchPrefix: 'refactor/',
            protectedPaths: [],
            modesAllowed: [
              'organize-only',
              'name-hygiene',
              'tests-first',
              'micro-simplify',
            ] as RefactoringMode[],
            gates: {
              requireCharacterizationTests: true,
              requireGreenCi: true,
              minLineCoverageDelta: '0%',
              minBranchCoverageDelta: '0%',
              mutationScoreThreshold: 80,
              forbidPublicApiChanges: false,
              forbidDependencyChanges: false,
            },
            languages: {
              typescript: { build: 'tsc', test: 'jest', lints: ['eslint'] },
              javascript: { build: 'babel', test: 'jest', lints: ['eslint'] },
            },
          },
          projectInfo: {
            path: projectPath,
            type: 'mixed' as const,
            languages: ['typescript', 'javascript'],
            hasTests: true,
            hasConfig: false,
          },
          outputDir,
          verbose: globalOpts.verbose || false,
        };

        transformCommand.setContext(context);

        // Execute command
        const result = await transformCommand.execute({
          transformations: opts.transformations,
          files: opts.files,
          output: opts.output,
          dryRun: opts.dryRun,
          createRollback: opts.createRollback,
          stopOnError: opts.stopOnError,
          resolveConflicts: opts.resolveConflicts,
          optimizeOrder: opts.optimizeOrder,
          validate: opts.validate,
        });

        if (result.success) {
          console.log(`✅ ${result.message}`);
          if (result.artifacts && result.artifacts.length > 0) {
            console.log(`📁 Generated files: ${result.artifacts.length} files`);
            console.log(`📂 Output directory: ${result.data?.outputDir}`);
          }
          if (result.data) {
            if (result.data.totalTransformations) {
              console.log(
                `🔄 Transformations: ${result.data.successfulTransformations}/${result.data.totalTransformations} successful`
              );
            }
            if (result.data.totalChanges) {
              console.log(`📝 Changes: ${result.data.totalChanges}`);
            }
            if (result.data.rollbackAvailable) {
              console.log(`🔙 Rollback plan available`);
            }
          }
        } else {
          console.error(`❌ ${result.message}`);
          process.exit(1);
        }
      } catch (error) {
        logger.error('Transformation failed', { error });
        console.error(
          `❌ Transformation failed: ${error instanceof Error ? error.message : String(error)}`
        );
        process.exit(1);
      }
    });

  return command;
}
