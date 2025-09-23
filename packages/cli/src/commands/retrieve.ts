import { Command } from 'commander';
import { Logger } from '../utils/logger.js';
import { RefactoGentMetrics } from '../observability/metrics.js';
import { RefactoGentTracer } from '../observability/tracing.js';
import { ConfigLoader } from '../config/config-loader.js';
import { RetrievalService, RetrievalServiceOptions } from '../retrieval/retrieval-service.js';
import { RetrievalQuery } from '../retrieval/retrieval-orchestrator.js';
import chalk from 'chalk';

interface RetrieveOptions {
  intent: string;
  context: string;
  filePath?: string;
  symbolId?: string;
  maxResults?: string;
  tokenBudget?: string;
  includeTests?: boolean;
  includeConfigs?: boolean;
  format?: 'json' | 'detailed' | 'simple';
  output?: string;
  noGrounding?: boolean;
  noPacking?: boolean;
  noHybrid?: boolean;
  noRoleSegmentation?: boolean;
  citationFormat?: 'inline' | 'reference' | 'both';
}

export function createRetrieveCommand(): Command {
  const command = new Command('retrieve')
    .description('Perform hybrid retrieval with grounding checks and context packing')
    .option(
      '-i, --intent <intent>',
      'Intent of the query (refactor, extract, inline, rename, optimize, test, document)',
      'refactor'
    )
    .option('-c, --context <context>', 'Context description for the query')
    .option('-f, --file-path <path>', 'Specific file path to focus on')
    .option('-s, --symbol-id <id>', 'Specific symbol ID to focus on')
    .option('-m, --max-results <number>', 'Maximum number of results', '20')
    .option('-t, --token-budget <number>', 'Token budget for context', '4000')
    .option('--include-tests', 'Include test files in retrieval')
    .option('--include-configs', 'Include configuration files in retrieval')
    .option('--format <format>', 'Output format (json|detailed|simple)', 'detailed')
    .option('-o, --output <file>', 'Output file for results')
    .option('--no-grounding', 'Skip grounding checks')
    .option('--no-packing', 'Skip context packing')
    .option('--no-hybrid', 'Use simple retrieval instead of hybrid')
    .option('--no-role-segmentation', 'Disable role segmentation in context')
    .option('--citation-format <format>', 'Citation format (inline|reference|both)', 'both')
    .action(async (options: RetrieveOptions) => {
      const logger = new Logger();
      const metrics = new RefactoGentMetrics(logger);
      const tracer = new RefactoGentTracer(logger);
      const configLoader = new ConfigLoader(logger);

      try {
        const config = await configLoader.loadConfig(process.cwd());
        const retrievalService = new RetrievalService(logger, metrics, tracer, config as any);

        if (!options.context) {
          console.error('❌ Context is required. Use --context "your query here"');
          process.exit(1);
        }

        const query: RetrievalQuery = {
          intent: options.intent,
          context: options.context,
          filePath: options.filePath,
          symbolId: options.symbolId,
          maxResults: parseInt(options.maxResults || '20'),
          tokenBudget: parseInt(options.tokenBudget || '4000'),
          includeTests: options.includeTests,
          includeConfigs: options.includeConfigs,
        };

        const serviceOptions: RetrievalServiceOptions = {
          maxTokens: parseInt(options.tokenBudget || '4000'),
          includeGroundingChecks: !options.noGrounding,
          includeContextPacking: !options.noPacking,
          hybridRetrieval: !options.noHybrid,
          roleSegmentation: !options.noRoleSegmentation,
          citationFormat: options.citationFormat as any,
        };

        if (options.format !== 'json') {
          logger.info('Starting retrieval', {
            intent: query.intent,
            context: query.context.substring(0, 100),
            maxResults: query.maxResults,
            tokenBudget: query.tokenBudget,
          });
        }

        const result = await retrievalService.retrieve(query, serviceOptions);

        // Output results
        await outputResults(result, options, logger);

        if (options.format !== 'json') {
          logger.info('Retrieval completed', {
            totalTokens: result.metadata.totalTokens,
            confidence: result.metadata.confidence.toFixed(2),
            citations: result.metadata.citations,
            processingTime: result.metadata.totalProcessingTime,
          });
        }

        await retrievalService.close();
      } catch (error) {
        console.error('❌ Retrieval failed:', error);
        process.exit(1);
      }
    });

  return command;
}

async function outputResults(result: any, options: RetrieveOptions, logger: Logger): Promise<void> {
  if (options.format === 'json') {
    const output = JSON.stringify(result, null, 2);

    if (options.output) {
      const fs = await import('fs/promises');
      const path = await import('path');

      const outputDir = path.dirname(options.output);
      await fs.mkdir(outputDir, { recursive: true });
      await fs.writeFile(options.output, output, 'utf8');
    } else {
      console.log(output);
    }
    return;
  }

  // Console output for detailed and simple formats
  console.log(chalk.bold.blue('\n🔍 Retrieval Results\n'));

  // Summary
  console.log(chalk.bold('📊 Summary:'));
  console.log(`  Intent: ${chalk.yellow(result.query.intent)}`);
  console.log(`  Context: ${chalk.cyan(result.query.context.substring(0, 100))}...`);
  console.log(`  Results: ${chalk.green(result.retrievalResult.chunks.length)} chunks`);
  console.log(`  Tokens: ${chalk.magenta(result.metadata.totalTokens.toLocaleString())}`);
  console.log(`  Confidence: ${chalk.yellow((result.metadata.confidence * 100).toFixed(1))}%`);
  console.log(`  Processing Time: ${chalk.blue(result.metadata.totalProcessingTime)}ms`);

  // Grounding results
  if (result.groundingResult) {
    console.log(chalk.bold('\n🔍 Grounding Results:'));
    console.log(`  Valid: ${result.groundingResult.isValid ? chalk.green('✓') : chalk.red('✗')}`);
    console.log(
      `  Confidence: ${chalk.yellow((result.groundingResult.confidence * 100).toFixed(1))}%`
    );
    console.log(`  Issues: ${chalk.red(result.groundingResult.issues.length)}`);
    console.log(
      `  Verified Symbols: ${chalk.green(result.groundingResult.verifiedSymbols.length)}`
    );

    if (result.groundingResult.issues.length > 0) {
      console.log(chalk.bold('\n⚠️ Issues:'));
      for (const issue of result.groundingResult.issues) {
        const severityColor =
          issue.severity === 'critical'
            ? chalk.red
            : issue.severity === 'high'
              ? chalk.yellow
              : issue.severity === 'medium'
                ? chalk.blue
                : chalk.gray;
        console.log(`  ${severityColor(issue.severity.toUpperCase())}: ${issue.message}`);
        if (issue.filePath) {
          console.log(
            `    File: ${issue.filePath}${issue.lineNumber ? `:${issue.lineNumber}` : ''}`
          );
        }
      }
    }

    if (result.groundingResult.suggestions.length > 0) {
      console.log(chalk.bold('\n💡 Suggestions:'));
      for (const suggestion of result.groundingResult.suggestions) {
        console.log(`  • ${suggestion}`);
      }
    }
  }

  // Context sections
  if (result.packedContext && options.format === 'detailed') {
    console.log(chalk.bold('\n📝 Context Sections:'));
    for (const section of result.packedContext.sections) {
      console.log(`  ${chalk.cyan(section.role.toUpperCase())}: ${section.tokenCount} tokens`);
    }
  }

  // Citations
  if (result.metadata.citations > 0) {
    console.log(chalk.bold('\n📚 Citations:'));
    const citations = result.packedContext?.citations || result.retrievalResult.citations;
    for (let i = 0; i < Math.min(citations.length, 5); i++) {
      const citation = citations[i];
      console.log(`  ${i + 1}. ${citation.filePath}:${citation.lineNumber}`);
      if (citation.symbolName) {
        console.log(`     Symbol: ${citation.symbolName}`);
      }
      console.log(`     Context: ${citation.context.substring(0, 80)}...`);
    }
    if (citations.length > 5) {
      console.log(`  ... and ${citations.length - 5} more`);
    }
  }

  // Final prompt preview
  if (options.format === 'detailed') {
    console.log(chalk.bold('\n📄 Final Prompt Preview:'));
    const preview = result.finalPrompt.substring(0, 500);
    console.log(chalk.gray(preview));
    if (result.finalPrompt.length > 500) {
      console.log(chalk.gray('... (truncated)'));
    }
  }
}
