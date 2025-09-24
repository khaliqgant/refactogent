import { Command } from 'commander';
import { Logger } from '../utils/logger.js';
import { RefactoGentMetrics } from '../observability/metrics.js';
import { RefactoGentTracer } from '../observability/tracing.js';
import { ConfigLoader } from '../config/config-loader.js';
import { InteractiveFeatures, InteractiveOptions } from '../ux/interactive-features.js';

export interface PlanOptions {
  query: string;
  projectPath?: string;
  dryRun?: boolean;
  showSteps?: boolean;
  showRisk?: boolean;
  showDependencies?: boolean;
  format?: 'text' | 'json' | 'yaml';
  output?: string;
}

export function createPlanCommand(): Command {
  const planCommand = new Command('plan')
    .description('Generate and preview refactoring plan (dry-run)')
    .requiredOption('-q, --query <query>', 'Query to generate plan for')
    .option('--project-path <path>', 'Project path', process.cwd())
    .option('--dry-run', 'Show plan without executing', true)
    .option('--show-steps', 'Show detailed steps', true)
    .option('--show-risk', 'Show risk assessment', true)
    .option('--show-dependencies', 'Show step dependencies', true)
    .option('-f, --format <format>', 'Output format (text, json, yaml)', 'text')
    .option('-o, --output <file>', 'Output file path')
    .action(async (options: PlanOptions) => {
      const logger = new Logger();
      const metrics = new RefactoGentMetrics(logger);
      const tracer = new RefactoGentTracer(logger);
      const configLoader = new ConfigLoader(logger);

      try {
        // Load configuration
        const config = await configLoader.loadConfig(options.projectPath || process.cwd());

        // Initialize interactive features
        const interactiveFeatures = new InteractiveFeatures(logger, metrics, tracer, config);

        // Generate plan preview
        logger.info('Generating plan preview', {
          query: options.query,
          projectPath: options.projectPath,
        });

        const interactiveOptions: InteractiveOptions = {
          enableCitations: true,
          enableHover: true,
          enableReGround: true,
          enablePlanPreview: true,
          maxCitations: 10,
          hoverDelay: 500,
        };

        const plan = await interactiveFeatures.generatePlanPreview(
          options.query,
          options.projectPath || process.cwd(),
          interactiveOptions
        );

        // Format output based on format option
        let output: string;
        switch (options.format) {
          case 'json':
            output = JSON.stringify(plan, null, 2);
            break;
          case 'yaml':
            const yaml = await import('js-yaml');
            output = yaml.dump(plan);
            break;
          case 'text':
          default:
            output = interactiveFeatures.formatPlanPreview(plan);
            break;
        }

        // Output to file or console
        if (options.output) {
          const fs = await import('fs/promises');
          await fs.writeFile(options.output, output);
          logger.info('Plan saved to file', { file: options.output });
        } else {
          console.log(output);
        }

        // Show additional information if requested
        if (options.showSteps) {
          console.log('\n📝 Detailed Steps:');
          console.log('='.repeat(50));
          plan.steps.forEach((step, index) => {
            console.log(`${index + 1}. ${step.name}`);
            console.log(`   Description: ${step.description}`);
            console.log(`   Type: ${step.type}`);
            console.log(`   Estimated Time: ${step.estimatedTime} minutes`);
            console.log(`   Risk Level: ${step.riskLevel}`);
            if (step.dependencies.length > 0) {
              console.log(`   Dependencies: ${step.dependencies.join(', ')}`);
            }
            if (step.rollbackPlan) {
              console.log(`   Rollback Plan: ${step.rollbackPlan}`);
            }
            console.log();
          });
        }

        if (options.showRisk) {
          console.log('\n⚠️ Risk Assessment:');
          console.log('='.repeat(50));
          console.log(`Overall Risk: ${plan.riskLevel.toUpperCase()}`);
          console.log(`Rollback Points: ${plan.rollbackPoints.length}`);
          console.log(`Dependencies: ${plan.dependencies.length}`);
          console.log();
        }

        if (options.showDependencies) {
          console.log('\n🔗 Dependencies:');
          console.log('='.repeat(50));
          plan.dependencies.forEach((dep, index) => {
            console.log(`${index + 1}. ${dep}`);
          });
          console.log();
        }

        logger.info('Plan preview completed successfully');
      } catch (error) {
        logger.error('Plan command failed', {
          error: error instanceof Error ? error.message : String(error),
        });
        process.exit(1);
      }
    });

  return planCommand;
}
