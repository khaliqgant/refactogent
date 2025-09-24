import { Command } from 'commander';
import { Logger } from '../utils/logger.js';
import { RefactoGentMetrics } from '../observability/metrics.js';
import { RefactoGentTracer } from '../observability/tracing.js';
import { ConfigLoader } from '../config/config-loader.js';
import { ContextPreview, ContextPreviewOptions } from '../ux/context-preview.js';

export interface ContextOptions {
  query: string;
  projectPath?: string;
  showFiles?: boolean;
  showLines?: boolean;
  showSymbols?: boolean;
  showDependencies?: boolean;
  maxFiles?: number;
  maxLines?: number;
  includeTests?: boolean;
  includeConfigs?: boolean;
  format?: 'text' | 'json' | 'yaml';
  output?: string;
}

export function createContextCommand(): Command {
  const contextCommand = new Command('context')
    .description('Preview context that will be sent to the LLM')
    .requiredOption('-q, --query <query>', 'Query to generate context for')
    .option('--project-path <path>', 'Project path', process.cwd())
    .option('--show-files', 'Show files in context', true)
    .option('--show-lines', 'Show line numbers', true)
    .option('--show-symbols', 'Show symbols in context', true)
    .option('--show-dependencies', 'Show dependencies', true)
    .option('--max-files <number>', 'Maximum number of files', '20')
    .option('--max-lines <number>', 'Maximum number of lines', '1000')
    .option('--include-tests', 'Include test files', false)
    .option('--include-configs', 'Include config files', false)
    .option('-f, --format <format>', 'Output format (text, json, yaml)', 'text')
    .option('-o, --output <file>', 'Output file path')
    .action(async (options: ContextOptions) => {
      const logger = new Logger();
      const metrics = new RefactoGentMetrics(logger);
      const tracer = new RefactoGentTracer(logger);
      const configLoader = new ConfigLoader(logger);

      try {
        // Load configuration
        const config = await configLoader.loadConfig(options.projectPath || process.cwd());

        // Initialize context preview
        const contextPreview = new ContextPreview(logger, metrics, tracer, config);

        // Generate context preview
        logger.info('Generating context preview', {
          query: options.query,
          projectPath: options.projectPath,
        });

        const contextOptions: ContextPreviewOptions = {
          showFiles: options.showFiles,
          showLines: options.showLines,
          showSymbols: options.showSymbols,
          showDependencies: options.showDependencies,
          maxFiles: parseInt(options.maxFiles?.toString() || '20'),
          maxLines: parseInt(options.maxLines?.toString() || '1000'),
          includeTests: options.includeTests,
          includeConfigs: options.includeConfigs,
        };

        const contextResult = await contextPreview.generatePreview(
          options.query,
          options.projectPath || process.cwd(),
          contextOptions
        );

        // Format output based on format option
        let output: string;
        switch (options.format) {
          case 'json':
            output = JSON.stringify(contextResult, null, 2);
            break;
          case 'yaml':
            const yaml = await import('js-yaml');
            output = yaml.dump(contextResult);
            break;
          case 'text':
          default:
            output = contextPreview.formatPreview(contextResult);
            break;
        }

        // Output to file or console
        if (options.output) {
          const fs = await import('fs/promises');
          await fs.writeFile(options.output, output);
          logger.info('Context preview saved to file', { file: options.output });
        } else {
          console.log(output);
        }

        // Show additional information
        console.log('\n📊 Context Statistics:');
        console.log('='.repeat(50));
        console.log(`Total Files: ${contextResult.metadata.totalFiles}`);
        console.log(`Total Lines: ${contextResult.metadata.totalLines}`);
        console.log(`Total Symbols: ${contextResult.metadata.totalSymbols}`);
        console.log(
          `Context Size: ${contextResult.metadata.contextSize.toLocaleString()} characters`
        );
        console.log(
          `Token Estimate: ${contextResult.metadata.tokenEstimate.toLocaleString()} tokens`
        );
        console.log();

        logger.info('Context preview completed successfully');
      } catch (error) {
        logger.error('Context command failed', {
          error: error instanceof Error ? error.message : String(error),
        });
        process.exit(1);
      }
    });

  return contextCommand;
}
