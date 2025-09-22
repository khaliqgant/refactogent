import { Command } from 'commander';
import { Logger } from '../utils/logger.js';
import { FunctionRefactorer } from '../refactoring/function-refactorer.js';
import { DiffGenerator } from '../refactoring/diff-generator.js';

interface FunctionRefactorOptions {
  target: string;
  operation: 'extract' | 'inline' | 'both';
  output?: string;
  verbose?: boolean;
  dryRun?: boolean;
}

/**
 * Function extraction and inlining command
 * Demonstrates RefactoGent's advanced refactoring capabilities
 */
export function createFunctionRefactorCommand(): Command {
  const command = new Command('function-refactor');

  command
    .description('Extract functions from code blocks or inline small functions')
    .option('-t, --target <path>', 'Target file or directory to refactor')
    .option('-o, --operation <type>', 'Operation type: extract | inline | both', 'both')
    .option('--output <path>', 'Output directory for refactored code')
    .option('-v, --verbose', 'Enable verbose output')
    .option('--dry-run', 'Analyze without making changes')
    .action(async (options: FunctionRefactorOptions) => {
      const logger = new Logger(!!options.verbose);

      try {
        logger.info('Starting function refactoring analysis', {
          target: options.target,
          operation: options.operation,
          dryRun: options.dryRun,
        });

        const refactorer = new FunctionRefactorer(logger);
        const diffGenerator = new DiffGenerator(logger);

        if (options.operation === 'extract' || options.operation === 'both') {
          // Find function extraction candidates
          logger.info('Finding function extraction candidates...');
          const extractionCandidates = await refactorer.findExtractionCandidates(options.target, {
            minComplexity: 5,
            minLines: 3,
            maxLines: 20,
          });

          logger.info('Found extraction candidates', {
            count: extractionCandidates.length,
            candidates: extractionCandidates.map(c => ({
              id: c.id,
              complexity: c.complexity,
              suggestedName: c.suggestedName,
              confidence: c.confidence,
            })),
          });

          // Process extraction candidates
          for (const candidate of extractionCandidates) {
            if (candidate.confidence > 70) {
              // Only process high-confidence candidates
              logger.info('Processing extraction candidate', {
                id: candidate.id,
                suggestedName: candidate.suggestedName,
                confidence: candidate.confidence,
              });

              if (!options.dryRun) {
                const operation = await refactorer.extractFunction(
                  candidate,
                  candidate.suggestedName,
                  {
                    insertionPoint: 'before',
                    makeAsync: false,
                    addDocumentation: true,
                  }
                );

                // Generate diff for the operation
                const diff = await diffGenerator.generateDiff(operation.changes);

                logger.info('Extraction operation completed', {
                  newFunctionName: operation.newFunctionName,
                  changes: operation.changes.length,
                  diffSize: diff.length,
                });
              }
            }
          }
        }

        if (options.operation === 'inline' || options.operation === 'both') {
          // Find function inline candidates
          logger.info('Finding function inline candidates...');
          const inlineCandidates = await refactorer.findInlineCandidates(options.target, {
            maxComplexity: 10,
            maxLines: 15,
            minCallSites: 1,
          });

          logger.info('Found inline candidates', {
            count: inlineCandidates.length,
            candidates: inlineCandidates.map(c => ({
              id: c.id,
              functionName: c.functionName,
              callSites: c.callSites.length,
              inlineability: c.inlineability,
            })),
          });

          // Process inline candidates
          for (const candidate of inlineCandidates) {
            if (candidate.inlineability > 60) {
              // Only process high-inlineability candidates
              logger.info('Processing inline candidate', {
                id: candidate.id,
                functionName: candidate.functionName,
                inlineability: candidate.inlineability,
              });

              if (!options.dryRun) {
                const operation = await refactorer.inlineFunction(candidate, {
                  removeFunctionDeclaration: true,
                  preserveComments: true,
                });

                // Generate diff for the operation
                const diff = await diffGenerator.generateDiff(operation.changes);

                logger.info('Inline operation completed', {
                  functionName: candidate.functionName,
                  callSitesInlined: operation.callSitesToInline.length,
                  changes: operation.changes.length,
                  diffSize: diff.length,
                });
              }
            }
          }
        }

        logger.info('Function refactoring analysis completed', {
          operation: options.operation,
          dryRun: options.dryRun,
        });

        if (options.dryRun) {
          console.log('\n🔍 Dry run completed - no changes made');
          console.log('Use without --dry-run to apply changes');
        } else {
          console.log('\n✅ Function refactoring completed');
          console.log('Check the output directory for refactored code');
        }
      } catch (error) {
        logger.error('Function refactoring failed', {
          error: error instanceof Error ? error.message : String(error),
        });
        process.exit(1);
      }
    });

  return command;
}
