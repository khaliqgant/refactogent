import { Command } from 'commander';
import { Logger } from '../utils/logger.js';
import { ComparisonEngine } from '../comparison/comparison-engine.js';
import { QualityMetrics } from '../comparison/quality-metrics.js';
import { TestCaseGenerator } from '../comparison/test-case-generator.js';

interface CompareOptions {
  target: string;
  baseline?: string;
  output?: string;
  metrics?: string[];
  verbose?: boolean;
}

/**
 * Compare RefactoGent refactoring quality against Cursor/Claude
 * This command demonstrates RefactoGent's competitive advantage
 */
export function createCompareCommand(): Command {
  const command = new Command('compare');

  command
    .description('Compare RefactoGent refactoring quality against other tools')
    .option('-t, --target <path>', 'Target project or file to refactor')
    .option('-b, --baseline <path>', 'Baseline refactoring result for comparison')
    .option('-o, --output <path>', 'Output directory for comparison results')
    .option('-m, --metrics <metrics>', 'Comma-separated list of metrics to evaluate')
    .option('-v, --verbose', 'Enable verbose output')
    .action(async (options: CompareOptions) => {
      const logger = new Logger(!!options.verbose);

      try {
        logger.info('Starting competitive comparison analysis', {
          target: options.target,
          baseline: options.baseline,
          output: options.output,
        });

        // Initialize comparison engine
        const comparisonEngine = new ComparisonEngine(logger);
        const qualityMetrics = new QualityMetrics(logger);
        const testCaseGenerator = new TestCaseGenerator(logger);

        // Generate standardized test cases
        logger.info('Generating standardized test cases...');
        const testCases = await testCaseGenerator.generateTestCases(options.target);

        // Run RefactoGent analysis
        logger.info('Running RefactoGent analysis...');
        const refactogentResults = await comparisonEngine.runRefactoGentAnalysis(
          testCases,
          options.target
        );

        // Run baseline comparison (Cursor/Claude simulation)
        logger.info('Running baseline comparison...');
        const baselineResults = await comparisonEngine.runBaselineAnalysis(
          testCases,
          options.baseline || 'cursor'
        );

        // Calculate quality metrics
        logger.info('Calculating quality metrics...');
        const metrics = await qualityMetrics.calculateMetrics(
          refactogentResults,
          baselineResults,
          options.metrics || ['correctness', 'safety', 'style', 'performance']
        );

        // Generate comparison report
        logger.info('Generating comparison report...');
        const report = await comparisonEngine.generateComparisonReport(
          refactogentResults,
          baselineResults,
          metrics,
          options.output || './comparison-results'
        );

        logger.info('Comparison analysis completed', {
          reportPath: report.path,
          metrics: metrics.summary,
        });

        // Display key competitive advantages
        console.log('\n🏆 RefactoGent Competitive Advantages:');
        console.log(
          `✅ Correctness: ${metrics.correctness.score}% vs ${baselineResults.correctness}%`
        );
        console.log(`✅ Safety: ${metrics.safety.score}% vs ${baselineResults.safety}%`);
        console.log(`✅ Style Consistency: ${metrics.style.score}% vs ${baselineResults.style}%`);
        console.log(
          `✅ Performance: ${metrics.performance.score}% vs ${baselineResults.performance}%`
        );

        if (metrics.overall.score > baselineResults.overall) {
          console.log(
            `\n🎯 RefactoGent outperforms baseline by ${metrics.overall.score - baselineResults.overall}%`
          );
        }
      } catch (error) {
        logger.error('Comparison analysis failed', {
          error: error instanceof Error ? error.message : String(error),
        });
        process.exit(1);
      }
    });

  return command;
}
