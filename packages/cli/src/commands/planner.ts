import { Command } from 'commander';
import { Logger } from '../utils/logger.js';
import { RefactoGentMetrics } from '../observability/metrics.js';
import { RefactoGentTracer } from '../observability/tracing.js';
import { ConfigLoader } from '../config/config-loader.js';
import { PlannerService, PlannerServiceOptions } from '../planner/planner-service.js';

export interface PlannerCommandOptions {
  input: string;
  context?: string;
  projectPath?: string;
  maxRetries?: number;
  enableParallelism?: boolean;
  includeRollback?: boolean;
  validatePlan?: boolean;
  dryRun?: boolean;
  timeout?: number;
  format?: 'json' | 'yaml' | 'text';
  verbose?: boolean;
}

/**
 * Create the planner CLI command
 */
export function createPlannerCommand(): Command {
  const plannerCommand = new Command('planner')
    .description('Plan and execute multi-tool operations with intent classification')
    .option('-i, --input <input>', 'Natural language input describing the desired operation')
    .option('-c, --context <context>', 'Additional context for the operation')
    .option('-p, --project-path <path>', 'Project path to operate on', '.')
    .option('--max-retries <number>', 'Maximum number of retries for failed operations', '3')
    .option('--enable-parallelism', 'Enable parallel execution of compatible tools')
    .option('--include-rollback', 'Include rollback plans for operations')
    .option('--validate-plan', 'Validate plan before execution')
    .option('--dry-run', 'Show what would be done without making changes')
    .option('--timeout <seconds>', 'Timeout for the entire operation', '300')
    .option('-f, --format <format>', 'Output format', 'text')
    .option('-v, --verbose', 'Show detailed execution information')
    .action(async (options: PlannerCommandOptions) => {
      const logger = new Logger();
      const metrics = new RefactoGentMetrics(logger);
      const tracer = new RefactoGentTracer(logger);
      const configLoader = new ConfigLoader(logger);

      try {
        const config = await configLoader.loadConfig(process.cwd());
        const plannerService = new PlannerService(logger, metrics, tracer, config as any);

        if (!options.input) {
          console.error('❌ Input is required. Use --input to specify the operation.');
          process.exit(1);
        }

        const plannerOptions: PlannerServiceOptions = {
          maxRetries: parseInt(options.maxRetries?.toString() || '3'),
          enableParallelism: options.enableParallelism,
          includeRollback: options.includeRollback,
          validatePlan: options.validatePlan,
          dryRun: options.dryRun,
          timeout: parseInt(options.timeout?.toString() || '300') * 1000
        };

        if (options.verbose) {
          console.log('🚀 Starting planner execution...');
          console.log(`📝 Input: ${options.input}`);
          if (options.context) {
            console.log(`📋 Context: ${options.context}`);
          }
          console.log(`📁 Project: ${options.projectPath || '.'}`);
          console.log(`⚙️  Options:`, plannerOptions);
        }

        const result = await plannerService.execute(
          options.input,
          options.context || '',
          options.projectPath || '.',
          plannerOptions
        );

        if (options.format === 'json') {
          console.log(JSON.stringify(result, null, 2));
        } else if (options.format === 'yaml') {
          // Simple YAML output
          console.log('success:', result.success);
          console.log('executionTime:', result.executionTime);
          console.log('errors:', result.errors);
          console.log('warnings:', result.warnings);
        } else {
          // Text output
          if (result.success) {
            console.log('✅ Planner execution completed successfully');
          } else {
            console.log('⚠️  Planner execution completed with issues');
          }

          console.log(`⏱️  Execution time: ${result.executionTime}ms`);
          console.log(`📊 Plan nodes: ${result.planGraph.nodes.size}`);
          console.log(`🔗 Plan edges: ${result.planGraph.edges.size}`);
          console.log(`⏰ Estimated time: ${result.planGraph.estimatedTotalTime} minutes`);

          if (result.patchSet) {
            console.log(`📦 Patch set created: ${result.patchSet.id}`);
            console.log(`📝 Patches: ${result.patchSet.patches.length}`);
            console.log(`📁 Files affected: ${result.patchSet.metadata.filesAffected}`);
          }

          if (result.errors.length > 0) {
            console.log('\n❌ Errors:');
            result.errors.forEach((error, index) => {
              console.log(`  ${index + 1}. ${error}`);
            });
          }

          if (result.warnings.length > 0) {
            console.log('\n⚠️  Warnings:');
            result.warnings.forEach((warning, index) => {
              console.log(`  ${index + 1}. ${warning}`);
            });
          }

          if (options.verbose) {
            console.log('\n🔧 Tool execution results:');
            for (const [nodeId, toolResult] of result.executionResults) {
              const status = toolResult.success ? '✅' : '❌';
              console.log(`  ${status} ${nodeId}: ${toolResult.executionTime}ms`);
              if (!toolResult.success && toolResult.error) {
                console.log(`    Error: ${toolResult.error}`);
              }
            }
          }
        }

        await plannerService.close();
      } catch (error) {
        console.error('❌ Planner execution failed:', error);
        process.exit(1);
      }
    });

  return plannerCommand;
}
