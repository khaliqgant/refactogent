import { Command } from 'commander';
import { BaseCommand } from './base.js';
import { CommandResult, RefactoringMode } from '../types/index.js';
import { SymbolRenamer, RenameOptions } from '../refactoring/symbol-renamer.js';
import { Logger } from '../utils/logger.js';
import fs from 'fs';
import path from 'path';

interface RenameSymbolOptions {
  file: string;
  symbol: string;
  newName: string;
  line?: number;
  column?: number;
  includeComments?: boolean;
  includeStringLiterals?: boolean;
  updateImports?: boolean;
  updateExports?: boolean;
  dryRun?: boolean;
  createBackup?: boolean;
  output?: string;
  validate?: boolean;
}

export class RenameSymbolCommand extends BaseCommand {
  private renamer: SymbolRenamer;

  constructor(logger: Logger) {
    super(logger);
    this.renamer = new SymbolRenamer(logger);
  }

  async execute(options: RenameSymbolOptions): Promise<CommandResult> {
    this.validateContext();

    const outputDir = options.output || path.join(this.context!.outputDir, 'symbol-rename');
    const filePath = path.resolve(options.file);

    this.logger.info('Starting symbol rename operation', {
      file: options.file,
      symbol: options.symbol,
      newName: options.newName,
      dryRun: options.dryRun,
    });

    try {
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        return this.failure(`File not found: ${options.file}`);
      }

      // Analyze the symbol
      const position =
        options.line && options.column ? { line: options.line, column: options.column } : undefined;

      const symbolInfo = await this.renamer.analyzeSymbol(filePath, options.symbol, position);

      if (!symbolInfo) {
        return this.failure(`Symbol "${options.symbol}" not found in ${options.file}`);
      }

      // Show symbol analysis
      console.log('\n🔍 Symbol Analysis:');
      console.log(`  Name: ${symbolInfo.name}`);
      console.log(`  Kind: ${symbolInfo.kind}`);
      console.log(`  Scope: ${symbolInfo.scope}`);
      console.log(
        `  Declaration: ${path.relative(process.cwd(), symbolInfo.declarationFile)}:${symbolInfo.declarationPosition.line}:${symbolInfo.declarationPosition.column}`
      );
      console.log(`  References: ${symbolInfo.references.length}`);
      console.log(`  Imports: ${symbolInfo.imports.length}`);
      console.log(`  Exports: ${symbolInfo.exports.length}`);

      // Validate rename if requested
      if (options.validate) {
        const validation = this.renamer.validateRename(symbolInfo, options.newName, {
          includeComments: options.includeComments,
          includeStringLiterals: options.includeStringLiterals,
          updateImports: options.updateImports,
          updateExports: options.updateExports,
        });

        console.log('\n✅ Validation Results:');
        console.log(`  Valid: ${validation.valid ? 'Yes' : 'No'}`);

        if (validation.conflicts.length > 0) {
          console.log(`  Conflicts: ${validation.conflicts.length}`);
          validation.conflicts.forEach(conflict => {
            const icon =
              conflict.severity === 'error' ? '❌' : conflict.severity === 'warning' ? '⚠️' : 'ℹ️';
            console.log(`    ${icon} ${conflict.message}`);
            if (conflict.suggestion) {
              console.log(`      Suggestion: ${conflict.suggestion}`);
            }
          });
        }

        if (validation.warnings.length > 0) {
          console.log(`  Warnings: ${validation.warnings.length}`);
          validation.warnings.forEach(warning => {
            console.log(`    ⚠️ ${warning}`);
          });
        }

        if (validation.suggestions.length > 0) {
          console.log(`  Suggestions: ${validation.suggestions.length}`);
          validation.suggestions.forEach(suggestion => {
            console.log(`    💡 ${suggestion}`);
          });
        }

        if (!validation.valid) {
          return this.failure(
            'Rename validation failed. Please resolve conflicts before proceeding.'
          );
        }
      }

      // Plan the rename operation
      const renameOptions: RenameOptions = {
        includeComments: options.includeComments,
        includeStringLiterals: options.includeStringLiterals,
        updateImports: options.updateImports !== false, // Default to true
        updateExports: options.updateExports !== false, // Default to true
        dryRun: options.dryRun,
        createBackup: options.createBackup !== false, // Default to true
      };

      const operation = await this.renamer.planRename(symbolInfo, options.newName, renameOptions);

      // Show operation plan
      console.log('\n📋 Rename Plan:');
      console.log(`  Old Name: ${operation.symbol.name}`);
      console.log(`  New Name: ${operation.newName}`);
      console.log(`  Files Affected: ${operation.impact.filesAffected}`);
      console.log(`  References Updated: ${operation.impact.referencesUpdated}`);
      console.log(`  Imports Updated: ${operation.impact.importsUpdated}`);
      console.log(`  Exports Updated: ${operation.impact.exportsUpdated}`);
      console.log(`  Total Changes: ${operation.changes.length}`);

      if (operation.conflicts.length > 0) {
        console.log(`  Conflicts: ${operation.conflicts.length}`);
        operation.conflicts.forEach(conflict => {
          const icon = conflict.severity === 'error' ? '❌' : '⚠️';
          console.log(`    ${icon} ${conflict.message}`);
        });
      }

      // Execute the rename
      const success = await this.renamer.executeRename(operation, renameOptions);

      if (!success) {
        return this.failure('Rename operation failed');
      }

      // Ensure output directory exists
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const generatedFiles: string[] = [];

      // Generate operation report
      const report = this.generateRenameReport(operation, success);
      const reportFile = path.join(outputDir, `rename-${options.symbol}-to-${options.newName}.md`);
      fs.writeFileSync(reportFile, report);
      generatedFiles.push(reportFile);

      // Generate change summary
      const changeSummary = {
        operation: {
          oldName: operation.symbol.name,
          newName: operation.newName,
          symbolKind: operation.symbol.kind,
          symbolScope: operation.symbol.scope,
        },
        impact: operation.impact,
        changes: operation.changes.map(change => ({
          file: path.relative(process.cwd(), change.filePath),
          line: change.position.line,
          column: change.position.column,
          type: change.changeType,
          confidence: change.confidence,
        })),
        conflicts: operation.conflicts,
        timestamp: new Date().toISOString(),
      };

      const summaryFile = path.join(outputDir, `rename-summary-${Date.now()}.json`);
      fs.writeFileSync(summaryFile, JSON.stringify(changeSummary, null, 2));
      generatedFiles.push(summaryFile);

      this.logger.success('Symbol rename completed', {
        oldName: operation.symbol.name,
        newName: operation.newName,
        filesAffected: operation.impact.filesAffected,
        totalChanges: operation.changes.length,
        dryRun: options.dryRun,
      });

      const message = options.dryRun
        ? `Analyzed rename of "${options.symbol}" to "${options.newName}" (dry run)`
        : `Successfully renamed "${options.symbol}" to "${options.newName}"`;

      return this.success(message, generatedFiles, {
        oldName: operation.symbol.name,
        newName: operation.newName,
        symbolKind: operation.symbol.kind,
        symbolScope: operation.symbol.scope,
        filesAffected: operation.impact.filesAffected,
        referencesUpdated: operation.impact.referencesUpdated,
        importsUpdated: operation.impact.importsUpdated,
        exportsUpdated: operation.impact.exportsUpdated,
        totalChanges: operation.changes.length,
        conflicts: operation.conflicts.length,
        dryRun: options.dryRun,
        outputDir,
      });
    } catch (error) {
      return this.failure(
        `Symbol rename failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private generateRenameReport(operation: any, success: boolean): string {
    const filesAffected = new Set(operation.changes.map((c: any) => c.filePath));

    return `# Symbol Rename Report

## Summary
- **Operation**: ${success ? 'Successful' : 'Failed'}
- **Old Name**: ${operation.symbol.name}
- **New Name**: ${operation.newName}
- **Symbol Kind**: ${operation.symbol.kind}
- **Symbol Scope**: ${operation.symbol.scope}
- **Files Affected**: ${operation.impact.filesAffected}
- **Total Changes**: ${operation.changes.length}

## Impact Analysis
- **References Updated**: ${operation.impact.referencesUpdated}
- **Imports Updated**: ${operation.impact.importsUpdated}
- **Exports Updated**: ${operation.impact.exportsUpdated}

## Symbol Information
- **Declaration File**: ${operation.symbol.declarationFile}
- **Declaration Position**: Line ${operation.symbol.declarationPosition.line}, Column ${operation.symbol.declarationPosition.column}
- **Total References**: ${operation.symbol.references.length}
- **Import Statements**: ${operation.symbol.imports.length}
- **Export Statements**: ${operation.symbol.exports.length}

## Files Modified
${Array.from(filesAffected)
  .map(file => {
    const fileChanges = operation.changes.filter((c: any) => c.filePath === (file as string));
    return `
### ${path.relative(process.cwd(), file as string)}
- **Changes**: ${fileChanges.length}
- **Change Types**: ${[...new Set(fileChanges.map((c: any) => c.changeType))].join(', ')}

**Detailed Changes:**
${fileChanges.map((change: any) => `- Line ${change.position.line}: ${change.originalText} → ${change.newText} (${change.confidence}% confidence)`).join('\n')}
`;
  })
  .join('')}

${
  operation.conflicts.length > 0
    ? `
## Conflicts and Issues
${operation.conflicts
  .map(
    (conflict: any) => `
### ${conflict.severity.toUpperCase()}: ${conflict.type}
- **Message**: ${conflict.message}
${conflict.suggestion ? `- **Suggestion**: ${conflict.suggestion}` : ''}
${conflict.location ? `- **Location**: ${conflict.location.filePath}:${conflict.location.line}:${conflict.location.column}` : ''}
`
  )
  .join('')}
`
    : ''
}

## Safety Considerations
- **Backup Created**: ${success ? 'Yes' : 'No'}
- **Syntax Validation**: Recommended after rename
- **Test Execution**: Recommended to verify functionality

## Next Steps
1. **Review Changes**: Use \`git diff\` to review all modifications
2. **Run Tests**: Execute your test suite to verify functionality
3. **Check Imports**: Verify that all import/export statements are correct
4. **Build Project**: Ensure the project still compiles successfully
5. **Commit Changes**: If satisfied, commit with: \`git add . && git commit -m "refactor: rename ${operation.symbol.name} to ${operation.newName}"\`

## Rollback Instructions
If you need to revert the changes:
1. Use git to revert: \`git checkout -- .\`
2. Or restore from backup files (*.backup.* in the same directories)

Generated at: ${new Date().toISOString()}
`;
  }
}

/**
 * Create the rename-symbol command for the CLI
 */
export function createRenameSymbolCommand(): Command {
  const command = new Command('rename-symbol')
    .description('Rename symbols with cross-reference updates')
    .requiredOption('--file <path>', 'File containing the symbol to rename')
    .requiredOption('--symbol <name>', 'Name of the symbol to rename')
    .requiredOption('--new-name <name>', 'New name for the symbol')
    .option('--line <number>', 'Line number of the symbol (for disambiguation)')
    .option('--column <number>', 'Column number of the symbol (for disambiguation)')
    .option('--include-comments', 'Include symbol references in comments')
    .option('--include-string-literals', 'Include symbol references in string literals')
    .option('--no-update-imports', 'Skip updating import statements')
    .option('--no-update-exports', 'Skip updating export statements')
    .option('--dry-run', 'Analyze rename without applying changes')
    .option('--no-create-backup', 'Skip creating backup files')
    .option('--output <dir>', 'Output directory for reports')
    .option('--validate', 'Validate rename operation before execution')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.parent?.parent?.opts() || {};

      // Initialize CLI context
      const logger = new Logger(globalOpts.verbose);

      try {
        // Create command instance
        const renameCommand = new RenameSymbolCommand(logger);

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

        renameCommand.setContext(context);

        // Execute command
        const result = await renameCommand.execute({
          file: opts.file,
          symbol: opts.symbol,
          newName: opts.newName,
          line: opts.line ? parseInt(opts.line, 10) : undefined,
          column: opts.column ? parseInt(opts.column, 10) : undefined,
          includeComments: opts.includeComments,
          includeStringLiterals: opts.includeStringLiterals,
          updateImports: opts.updateImports,
          updateExports: opts.updateExports,
          dryRun: opts.dryRun,
          createBackup: opts.createBackup,
          output: opts.output,
          validate: opts.validate,
        });

        if (result.success) {
          console.log(`✅ ${result.message}`);
          if (result.artifacts && result.artifacts.length > 0) {
            console.log(`📁 Generated files: ${result.artifacts.length} files`);
            console.log(`📂 Output directory: ${result.data?.outputDir}`);
          }
          if (result.data) {
            console.log(
              `🔄 Symbol: ${result.data.oldName} → ${result.data.newName} (${result.data.symbolKind})`
            );
            console.log(
              `📊 Impact: ${result.data.filesAffected} files, ${result.data.totalChanges} changes`
            );
            if (result.data.conflicts > 0) {
              console.log(`⚠️ Conflicts: ${result.data.conflicts}`);
            }
          }
        } else {
          console.error(`❌ ${result.message}`);
          process.exit(1);
        }
      } catch (error) {
        logger.error('Symbol rename failed', { error });
        console.error(
          `❌ Symbol rename failed: ${error instanceof Error ? error.message : String(error)}`
        );
        process.exit(1);
      }
    });

  return command;
}
