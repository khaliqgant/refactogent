import { BaseCommand } from './base.js';
import { CommandResult } from '../types/index.js';
import { SimpleTransformer, TransformationResult } from '../transformers/simple-transformer.js';
import { ASTTransformer, ASTTransformationResult } from '../transformers/ast-transformer.js';
import { FileManager } from '../utils/file-manager.js';
import fs from 'fs';
import path from 'path';

interface ApplyOptions {
  branch: string;
  planFile?: string;
  dryRun?: boolean;
  maxFiles?: number;
}

export class ApplyCommand extends BaseCommand {
  private codeTransformer: SimpleTransformer;
  private astTransformer: ASTTransformer;
  private fileManager: FileManager;

  constructor(logger: any) {
    super(logger);
    this.codeTransformer = new SimpleTransformer(logger);
    this.astTransformer = new ASTTransformer(logger);
    this.fileManager = new FileManager(logger);
  }

  async execute(options: ApplyOptions): Promise<CommandResult> {
    this.validateContext();

    const isDryRun = options.dryRun || false;
    const maxFiles = options.maxFiles || 5;

    this.logger.info('Starting refactoring execution', {
      branch: options.branch,
      dryRun: isDryRun,
      maxFiles,
    });

    // Load the plan
    const plan = await this.loadPlan(options.planFile);
    if (!plan) {
      return this.failure('No refactoring plan found. Run `refactogent plan` first.');
    }

    this.logger.info('Loaded refactoring plan', {
      mode: plan.mode,
      operations: plan.operations?.length || 0,
    });

    // Clean up old backups
    this.fileManager.cleanupOldBackups(this.context!.projectInfo.path);

    // Execute each operation
    const results = [];
    const modifiedFiles: string[] = [];

    for (const operation of plan.operations || []) {
      this.logger.info('Executing operation', { type: operation.type });

      const result = await this.executeOperation(operation, isDryRun, maxFiles);
      results.push(result);

      if (result.modifiedFiles) {
        modifiedFiles.push(...result.modifiedFiles);
      }

      if (!result.success) {
        this.logger.error('Operation failed', {
          type: operation.type,
          error: result.message,
        });

        // Restore any modified files if not dry run
        if (!isDryRun && modifiedFiles.length > 0) {
          this.logger.info('Rolling back changes due to failure');
          for (const file of modifiedFiles) {
            this.fileManager.restoreFromBackup(file);
          }
        }

        return this.failure(`Failed to execute ${operation.type}: ${result.message}`);
      }
    }

    // Generate execution report
    const report = this.generateExecutionReport(plan, results, isDryRun, modifiedFiles);
    const reportPath = this.writeOutput('execution-report.md', report);

    // Generate backup info if files were modified
    if (!isDryRun && modifiedFiles.length > 0) {
      const backupInfo = this.generateBackupInfo();
      const backupPath = this.writeOutput('backup-info.json', JSON.stringify(backupInfo, null, 2));

      this.logger.success('Refactoring execution completed with file modifications', {
        modifiedFiles: modifiedFiles.length,
        backupsCreated: this.fileManager.getBackups().length,
      });

      return this.success(
        `Successfully executed ${results.length} operations and modified ${modifiedFiles.length} files`,
        [reportPath, backupPath],
        {
          branch: options.branch,
          operationsExecuted: results.length,
          filesModified: modifiedFiles.length,
          mode: plan.mode,
          dryRun: isDryRun,
        }
      );
    } else {
      this.logger.success('Refactoring execution completed (analysis only)');

      return this.success(`Successfully analyzed ${results.length} operations`, [reportPath], {
        branch: options.branch,
        operationsExecuted: results.length,
        mode: plan.mode,
        dryRun: isDryRun,
      });
    }
  }

  private async loadPlan(planFile?: string): Promise<any> {
    const planPath = planFile || path.join(this.context!.outputDir, 'refactoring-plan.json');

    if (!fs.existsSync(planPath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(planPath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      this.logger.error('Failed to load plan', {
        path: planPath,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private async executeOperation(
    operation: any,
    isDryRun: boolean,
    maxFiles: number
  ): Promise<{ success: boolean; message: string; changes?: string[]; modifiedFiles?: string[] }> {
    switch (operation.type) {
      case 'constant-extraction':
        return this.executeConstantExtraction(isDryRun, maxFiles);
      case 'variable-naming':
        return this.executeVariableNaming(isDryRun, maxFiles);
      case 'import-cleanup':
        return this.executeImportCleanup(isDryRun, maxFiles);
      case 'conditional-simplification':
        return this.executeConditionalSimplification(isDryRun, maxFiles);
      default:
        return {
          success: true,
          message: `${operation.type} analysis complete`,
          changes: [`Analyzed ${operation.type} opportunities`],
          modifiedFiles: [],
        };
    }
  }

  private async executeConstantExtraction(
    isDryRun: boolean,
    maxFiles: number
  ): Promise<{ success: boolean; message: string; changes?: string[]; modifiedFiles?: string[] }> {
    const { projectInfo } = this.context!;
    const changes = [];
    const modifiedFiles: string[] = [];

    const files = this.findSourceFiles(projectInfo.path, ['.ts', '.js', '.tsx', '.jsx']);

    for (const file of files.slice(0, maxFiles)) {
      const canModify = this.fileManager.canModifyFile(file);
      if (!canModify.canModify) {
        continue;
      }

      try {
        // Use AST transformer for TypeScript/JavaScript files
        const result = await this.astTransformer.transformCode(file, ['extract-constants']);

        if (result.success && result.transformedCode && result.changes.length > 0) {
          changes.push(`${path.basename(file)}: ${result.changes.length} constants extracted`);

          if (!isDryRun) {
            const applied = this.fileManager.applyChanges(file, result.transformedCode);
            if (applied) {
              modifiedFiles.push(file);
              changes.push(`✅ Extracted constants in ${path.basename(file)}`);
            }
          } else {
            result.changes.forEach(change => {
              changes.push(`  - ${change.description} (confidence: ${change.confidence}%, risk: ${change.riskLevel})`);
            });
          }
        }

        // Log diagnostics if any
        if (result.diagnostics && result.diagnostics.length > 0) {
          result.diagnostics.forEach(diagnostic => {
            this.logger.debug('Transformation diagnostic', { file, diagnostic });
          });
        }
      } catch (error) {
        this.logger.warn('Failed to process file for constant extraction', { file });
      }
    }

    return {
      success: true,
      message: `Constant extraction ${isDryRun ? 'analysis' : 'execution'} complete. Processed ${maxFiles} files.`,
      changes,
      modifiedFiles,
    };
  }

  private async executeVariableNaming(
    isDryRun: boolean,
    maxFiles: number
  ): Promise<{ success: boolean; message: string; changes?: string[]; modifiedFiles?: string[] }> {
    const { projectInfo } = this.context!;
    const changes = [];
    const modifiedFiles: string[] = [];

    const files = this.findSourceFiles(projectInfo.path, ['.ts', '.js', '.tsx', '.jsx']);

    for (const file of files.slice(0, maxFiles)) {
      const canModify = this.fileManager.canModifyFile(file);
      if (!canModify.canModify) {
        continue;
      }

      try {
        // Use AST transformer for TypeScript/JavaScript files
        const result = await this.astTransformer.transformCode(file, ['improve-naming']);

        if (result.success && result.transformedCode && result.changes.length > 0) {
          changes.push(`${path.basename(file)}: ${result.changes.length} naming improvements`);

          if (!isDryRun) {
            const applied = this.fileManager.applyChanges(file, result.transformedCode);
            if (applied) {
              modifiedFiles.push(file);
              changes.push(`✅ Applied naming improvements to ${path.basename(file)}`);
            }
          } else {
            result.changes.forEach(change => {
              changes.push(`  - ${change.description} (confidence: ${change.confidence}%, risk: ${change.riskLevel})`);
            });
          }
        }

        // Log diagnostics if any
        if (result.diagnostics && result.diagnostics.length > 0) {
          result.diagnostics.forEach(diagnostic => {
            this.logger.debug('Transformation diagnostic', { file, diagnostic });
          });
        }
      } catch (error) {
        this.logger.warn('Failed to process file for naming improvements', { file });
      }
    }

    return {
      success: true,
      message: `Variable naming ${isDryRun ? 'analysis' : 'execution'} complete. Processed ${maxFiles} files.`,
      changes,
      modifiedFiles,
    };
  }

  private async executeImportCleanup(
    isDryRun: boolean,
    maxFiles: number
  ): Promise<{ success: boolean; message: string; changes?: string[]; modifiedFiles?: string[] }> {
    const { projectInfo } = this.context!;
    const changes = [];
    const modifiedFiles: string[] = [];

    if (projectInfo.type === 'typescript' || projectInfo.type === 'mixed') {
      const files = this.findSourceFiles(projectInfo.path, ['.ts', '.tsx', '.js', '.jsx']);

      for (const file of files.slice(0, maxFiles)) {
        const canModify = this.fileManager.canModifyFile(file);
        if (!canModify.canModify) {
          continue;
        }

        try {
          // Use AST transformer for TypeScript/JavaScript files
          const result = await this.astTransformer.transformCode(file, ['remove-unused-imports']);

          if (result.success && result.transformedCode && result.changes.length > 0) {
            changes.push(`${path.basename(file)}: ${result.changes.length} import improvements`);

            if (!isDryRun) {
              const applied = this.fileManager.applyChanges(file, result.transformedCode);
              if (applied) {
                modifiedFiles.push(file);
                changes.push(`✅ Applied import cleanup to ${path.basename(file)}`);
              }
            } else {
              result.changes.forEach(change => {
                changes.push(`  - ${change.description} (confidence: ${change.confidence}%, risk: ${change.riskLevel})`);
              });
            }
          }

          // Log diagnostics if any
          if (result.diagnostics && result.diagnostics.length > 0) {
            result.diagnostics.forEach(diagnostic => {
              this.logger.debug('Transformation diagnostic', { file, diagnostic });
            });
          }
        } catch (error) {
          this.logger.warn('Failed to process file for import cleanup', { file });
        }
      }
    }

    return {
      success: true,
      message: `Import cleanup ${isDryRun ? 'analysis' : 'execution'} complete. Processed ${maxFiles} files.`,
      changes,
      modifiedFiles,
    };
  }

  private async executeConditionalSimplification(
    isDryRun: boolean,
    maxFiles: number
  ): Promise<{ success: boolean; message: string; changes?: string[]; modifiedFiles?: string[] }> {
    const { projectInfo } = this.context!;
    const changes = [];
    const modifiedFiles: string[] = [];

    const files = this.findSourceFiles(projectInfo.path, ['.ts', '.js', '.tsx', '.jsx']);

    for (const file of files.slice(0, maxFiles)) {
      const canModify = this.fileManager.canModifyFile(file);
      if (!canModify.canModify) {
        continue;
      }

      try {
        // Use AST transformer for TypeScript/JavaScript files
        const result = await this.astTransformer.transformCode(file, ['simplify-conditionals']);

        if (result.success && result.transformedCode && result.changes.length > 0) {
          changes.push(`${path.basename(file)}: ${result.changes.length} conditionals simplified`);

          if (!isDryRun) {
            const applied = this.fileManager.applyChanges(file, result.transformedCode);
            if (applied) {
              modifiedFiles.push(file);
              changes.push(`✅ Simplified conditionals in ${path.basename(file)}`);
            }
          } else {
            result.changes.forEach(change => {
              changes.push(`  - ${change.description} (confidence: ${change.confidence}%, risk: ${change.riskLevel})`);
            });
          }
        }

        // Log diagnostics if any
        if (result.diagnostics && result.diagnostics.length > 0) {
          result.diagnostics.forEach(diagnostic => {
            this.logger.debug('Transformation diagnostic', { file, diagnostic });
          });
        }
      } catch (error) {
        this.logger.warn('Failed to process file for conditional simplification', { file });
      }
    }

    return {
      success: true,
      message: `Conditional simplification ${isDryRun ? 'analysis' : 'execution'} complete. Processed ${maxFiles} files.`,
      changes,
      modifiedFiles,
    };
  }

  private findSourceFiles(projectPath: string, extensions: string[]): string[] {
    const files: string[] = [];

    try {
      const entries = fs.readdirSync(projectPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (extensions.includes(ext)) {
            files.push(path.join(projectPath, entry.name));
          }
        } else if (
          entry.isDirectory() &&
          !['node_modules', '.git', 'dist', 'build'].includes(entry.name)
        ) {
          const subFiles = this.findSourceFiles(path.join(projectPath, entry.name), extensions);
          files.push(...subFiles);
        }
      }
    } catch (error) {
      this.logger.debug('Error reading directory', { path: projectPath, error });
    }

    return files;
  }

  private generateExecutionReport(
    plan: any,
    results: any[],
    isDryRun: boolean,
    modifiedFiles: string[]
  ): string {
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    return `# Refactoring Execution Report

## Summary
- **Mode**: ${plan.mode}
- **Execution Type**: ${isDryRun ? 'Dry Run (Analysis Only)' : 'Live Execution'}
- **Operations Executed**: ${results.length}
- **Successful**: ${successCount}
- **Failed**: ${failureCount}
- **Files Modified**: ${modifiedFiles.length}
- **Project Type**: ${plan.projectType}

## Operation Results
${results
  .map(
    (result, index) => `
### Operation ${index + 1}
- **Status**: ${result.success ? '✅ Success' : '❌ Failed'}
- **Message**: ${result.message}
${result.changes ? `- **Changes**: ${result.changes.length} items ${isDryRun ? 'identified' : 'applied'}` : ''}
${result.changes ? result.changes.map((change: string) => `  - ${change}`).join('\n') : ''}
`
  )
  .join('\n')}

${
  modifiedFiles.length > 0
    ? `
## Modified Files
${modifiedFiles.map(file => `- ${path.relative(this.context!.projectInfo.path, file)}`).join('\n')}
`
    : ''
}

## Next Steps
${
  isDryRun
    ? `
1. Review the analysis results above
2. Run without --dry-run to apply changes: \`refactogent apply --branch ${plan.mode}\`
3. Test thoroughly after applying changes
4. Commit changes with descriptive messages
`
    : `
1. Review the applied changes above
2. Run your test suite to verify everything works
3. Commit the changes: \`git add . && git commit -m "refactor: ${plan.mode} improvements"\`
4. Push to remote if satisfied with results
`
}

## Safety Notes
${
  isDryRun
    ? `
- This was a dry run - no files were modified
- All suggestions should be reviewed before implementation
- Run full test suite after making changes
`
    : `
- Backups were created for all modified files in .refactogent/backups/
- Run tests immediately to verify changes
- Use \`git diff\` to review all changes before committing
- Restore from backup if needed using the backup-info.json file
`
}

Generated at: ${new Date().toISOString()}
`;
  }

  private generateBackupInfo() {
    const backups = this.fileManager.getBackups();
    return {
      timestamp: new Date().toISOString(),
      backupCount: backups.length,
      backups: backups.map(backup => ({
        originalFile: path.relative(this.context!.projectInfo.path, backup.originalPath),
        backupFile: path.relative(this.context!.projectInfo.path, backup.backupPath),
        timestamp: backup.timestamp,
      })),
      restoreInstructions: {
        manual: 'Copy backup files back to original locations',
        cli: 'Use refactogent restore command (future feature)',
      },
    };
  }
}
