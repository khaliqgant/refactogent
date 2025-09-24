import { Command } from 'commander';
import { Logger } from '../utils/logger.js';
import { RefactoGentMetrics } from '../observability/metrics.js';
import { RefactoGentTracer } from '../observability/tracing.js';
import { ConfigLoader } from '../config/config-loader.js';
import { CLITUI } from '../ux/cli-tui.js';

export interface TUIOptions {
  theme?: 'light' | 'dark' | 'auto';
  showProgress?: boolean;
  showCitations?: boolean;
  showPlan?: boolean;
  interactive?: boolean;
  width?: number;
  height?: number;
  query?: string;
  projectPath?: string;
}

export function createTUICommand(): Command {
  const tuiCommand = new Command('tui')
    .description('Start interactive TUI interface for RefactoGent')
    .option('-t, --theme <theme>', 'UI theme (light, dark, auto)', 'auto')
    .option('-p, --show-progress', 'Show progress indicators', true)
    .option('-c, --show-citations', 'Show citations', true)
    .option('-l, --show-plan', 'Show plan preview', true)
    .option('-i, --interactive', 'Enable interactive mode', true)
    .option('-w, --width <width>', 'Terminal width', '80')
    .option('-h, --height <height>', 'Terminal height', '24')
    .option('-q, --query <query>', 'Initial query to process')
    .option('--project-path <path>', 'Project path', process.cwd())
    .action(async (options: TUIOptions) => {
      const logger = new Logger();
      const metrics = new RefactoGentMetrics(logger);
      const tracer = new RefactoGentTracer(logger);
      const configLoader = new ConfigLoader(logger);

      try {
        // Load configuration
        const config = await configLoader.loadConfig(options.projectPath || process.cwd());

        // Initialize TUI
        const tui = new CLITUI(logger, metrics, tracer, config);
        await tui.initialize({
          theme: options.theme as 'light' | 'dark' | 'auto',
          showProgress: options.showProgress,
          showCitations: options.showCitations,
          showPlan: options.showPlan,
          interactive: options.interactive,
          width: parseInt(options.width?.toString() || '80'),
          height: parseInt(options.height?.toString() || '24'),
        });

        // Start interactive session if query is provided
        if (options.query) {
          await tui.startInteractiveSession(options.query, options.projectPath || process.cwd(), {
            theme: options.theme as 'light' | 'dark' | 'auto',
            showProgress: options.showProgress,
            showCitations: options.showCitations,
            showPlan: options.showPlan,
            interactive: options.interactive,
            width: parseInt(options.width?.toString() || '80'),
            height: parseInt(options.height?.toString() || '24'),
          });
        } else {
          // Show welcome screen
          console.log('Welcome to RefactoGent TUI!');
          console.log('Enter a query to get started:');
          console.log();
        }

        // Handle user input in interactive mode
        if (options.interactive) {
          const readline = await import('readline');
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
          });

          rl.on('line', async input => {
            if (input.trim() === 'exit' || input.trim() === 'quit') {
              await tui.cleanup();
              rl.close();
              process.exit(0);
            } else if (input.trim() === 'help') {
              console.log('Available commands:');
              console.log('  help - Show this help message');
              console.log('  exit/quit - Exit the TUI');
              console.log('  <query> - Process a query');
              console.log();
            } else if (input.trim()) {
              await tui.startInteractiveSession(
                input.trim(),
                options.projectPath || process.cwd(),
                {
                  theme: options.theme as 'light' | 'dark' | 'auto',
                  showProgress: options.showProgress,
                  showCitations: options.showCitations,
                  showPlan: options.showPlan,
                  interactive: options.interactive,
              width: parseInt(options.width?.toString() || '80'),
              height: parseInt(options.height?.toString() || '24'),
                }
              );
            }
          });

          rl.on('close', async () => {
            await tui.cleanup();
            process.exit(0);
          });
        }

        // Clean up on exit
        process.on('SIGINT', async () => {
          await tui.cleanup();
          process.exit(0);
        });

        process.on('SIGTERM', async () => {
          await tui.cleanup();
          process.exit(0);
        });
      } catch (error) {
        logger.error('TUI command failed', {
          error: error instanceof Error ? error.message : String(error),
        });
        process.exit(1);
      }
    });

  return tuiCommand;
}
