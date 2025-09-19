#!/usr/bin/env node

import { Command } from 'commander';
import path from 'path';
import { Logger } from './utils/logger.js';
import { ConfigLoader } from './utils/config.js';
import { ProjectAnalyzer } from './utils/project.js';
import { StabilizeCommand } from './commands/stabilize.js';
import { PlanCommand } from './commands/plan.js';
import { ApplyCommand } from './commands/apply.js';
import { GenerateCommand } from './commands/generate.js';
import { TestCommand } from './commands/test.js';
import { AnalyzeCommand } from './commands/analyze.js';
import { ASTAnalyzeCommand } from './commands/ast-analyze.js';
import { createSafetyAnalyzeCommand } from './commands/safety-analyze.js';
import { createCoverageAnalyzeCommand } from './commands/coverage-analyze.js';
import { createRefactorSuggestCommand } from './commands/refactor-suggest.js';
import { CommandContext, RefactoringMode } from './types/index.js';

const program = new Command();

// Global options
program
  .name('refactogent')
  .description('Refactogent CLI — safe, local-first refactoring assistant')
  .version('0.1.0')
  .option('-v, --verbose', 'Enable verbose logging')
  .option('-o, --output <dir>', 'Output directory', '.refactogent/out')
  .option('-p, --project <path>', 'Project path', process.cwd());

// Initialize CLI
async function initializeCLI(options: any): Promise<CommandContext> {
  const logger = new Logger(options.verbose);
  const configLoader = new ConfigLoader(logger);
  const projectAnalyzer = new ProjectAnalyzer(logger);

  logger.debug('Initializing Refactogent CLI', {
    projectPath: options.project,
    outputDir: options.output,
    verbose: options.verbose,
  });

  try {
    // Analyze project
    const projectInfo = await projectAnalyzer.analyzeProject(options.project);

    // Load configuration
    const config = await configLoader.loadConfig(options.project);

    // Create context - output dir should be relative to project path
    const outputDir = path.isAbsolute(options.output)
      ? options.output
      : path.resolve(options.project, options.output);

    const context: CommandContext = {
      config,
      projectInfo,
      outputDir,
      verbose: options.verbose,
    };

    logger.success('CLI initialized successfully');
    return context;
  } catch (error) {
    logger.error('Failed to initialize CLI', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

// Stabilize command
program
  .command('stabilize')
  .description('Generate characterization tests for routes/CLI/library surfaces (no code changes)')
  .option('--routes <n>', 'Number of HTTP routes to record', '10')
  .option('--cli <n>', 'Number of CLI commands to record', '0')
  .action(async (opts, command) => {
    const globalOpts = command.parent.opts();
    const context = await initializeCLI(globalOpts);

    const stabilizeCommand = new StabilizeCommand(new Logger(context.verbose));
    stabilizeCommand.setContext(context);

    const result = await stabilizeCommand.execute(opts);

    if (result.success) {
      console.log(`✅ ${result.message}`);
      if (result.artifacts) {
        console.log(`📁 Generated files: ${result.artifacts.join(', ')}`);
      }
    } else {
      console.error(`❌ ${result.message}`);
      process.exit(1);
    }
  });

// Plan command
program
  .command('plan')
  .description('Propose safe refactoring operations (no code changes)')
  .option(
    '--mode <mode>',
    'Refactoring mode: organize-only | name-hygiene | tests-first | micro-simplify',
    'organize-only'
  )
  .action(async (opts, command) => {
    const globalOpts = command.parent.opts();
    const context = await initializeCLI(globalOpts);

    // Validate mode
    const validModes: RefactoringMode[] = [
      'organize-only',
      'name-hygiene',
      'tests-first',
      'micro-simplify',
    ];
    if (!validModes.includes(opts.mode as RefactoringMode)) {
      console.error(`❌ Invalid mode: ${opts.mode}. Valid modes: ${validModes.join(', ')}`);
      process.exit(1);
    }

    const planCommand = new PlanCommand(new Logger(context.verbose));
    planCommand.setContext(context);

    const result = await planCommand.execute(opts);

    if (result.success) {
      console.log(`✅ ${result.message}`);
      if (result.artifacts) {
        console.log(`📁 Generated files: ${result.artifacts.join(', ')}`);
      }
    } else {
      console.error(`❌ ${result.message}`);
      process.exit(1);
    }
  });

// Apply command
program
  .command('apply')
  .description('Apply planned changes to a new branch')
  .option('--branch <name>', 'Branch name', 'refactor/sample')
  .option('--plan <file>', 'Path to refactoring plan file')
  .option('--dry-run', 'Analyze changes without modifying files')
  .option('--max-files <n>', 'Maximum number of files to modify', '5')
  .action(async (opts, command) => {
    const globalOpts = command.parent.opts();
    const context = await initializeCLI(globalOpts);

    // Parse max-files option
    opts.maxFiles = parseInt(opts.maxFiles, 10);

    const applyCommand = new ApplyCommand(new Logger(context.verbose));
    applyCommand.setContext(context);

    const result = await applyCommand.execute(opts);

    if (result.success) {
      console.log(`✅ ${result.message}`);
      if (result.artifacts) {
        console.log(`📁 Generated files: ${result.artifacts.join(', ')}`);
      }
      if (result.data?.filesModified > 0) {
        console.log(`🔧 Modified ${result.data.filesModified} files`);
        console.log(`💾 Backups created in .refactogent/backups/`);
      }
    } else {
      console.error(`❌ ${result.message}`);
      process.exit(1);
    }
  });

// Patch command (stub for now)
program
  .command('patch')
  .description('Emit a git patch and PR-ready description without touching remotes')
  .action(async (opts, command) => {
    const globalOpts = command.parent.opts();
    const context = await initializeCLI(globalOpts);

    console.log(`🚧 Patch command not yet implemented`);
    console.log(`Output directory: ${context.outputDir}`);
  });

// Revert command (stub for now)
program
  .command('revert')
  .description('Revert from a generated patch')
  .option('--from <patch>', 'Patch path', '.refactogent/out/change.patch')
  .action(async (opts, command) => {
    const globalOpts = command.parent.opts();
    await initializeCLI(globalOpts);

    console.log(`🚧 Revert command not yet implemented`);
    console.log(`Would revert from: ${opts.from}`);
  });

// Generate command
program
  .command('generate')
  .description('Generate sample projects for testing Refactogent')
  .option('--name <name>', 'Project name', 'sample-project')
  .option('--type <type>', 'Project type: typescript | python | go', 'typescript')
  .option('--complexity <level>', 'Complexity: simple | medium | complex', 'medium')
  .option('--tests', 'Include test files')
  .option('--config', 'Include Refactogent configuration')
  .option('--suite', 'Generate full test suite (multiple projects)')
  .option('--output <dir>', 'Output directory', './test-projects')
  .action(async (opts, command) => {
    const globalOpts = command.parent.opts();
    // Don't need full CLI initialization for generate command

    const generateCommand = new GenerateCommand(new Logger(globalOpts.verbose));

    const result = await generateCommand.execute({
      name: opts.name,
      type: opts.type,
      complexity: opts.complexity,
      hasTests: opts.tests,
      hasConfig: opts.config,
      suite: opts.suite,
      output: opts.output,
    });

    if (result.success) {
      console.log(`✅ ${result.message}`);
      if (result.data?.projectCount) {
        console.log(
          `📁 Generated ${result.data.projectCount} projects in ${result.data.outputDir}`
        );
        console.log(`Projects: ${result.data.projects.join(', ')}`);
      } else if (result.data?.projectPath) {
        console.log(`📁 Project created at: ${result.data.projectPath}`);
      }
    } else {
      console.error(`❌ ${result.message}`);
      process.exit(1);
    }
  });

// Test command
program
  .command('test')
  .description('Run test harness to validate refactoring operations')
  .option('--suite <path>', 'Path to test suite JSON file')
  .option('--isolation <mode>', 'Isolation mode: local | sandbox | docker', 'local')
  .option('--timeout <ms>', 'Test timeout in milliseconds', '30000')
  .option('--generate-suite', 'Generate a comprehensive test suite')
  .action(async (opts, command) => {
    const globalOpts = command.parent.opts();
    const context = await initializeCLI(globalOpts);

    const testCommand = new TestCommand(new Logger(context.verbose));
    testCommand.setContext(context);

    const result = await testCommand.execute({
      project: globalOpts.project,
      suite: opts.suite,
      isolation: opts.isolation,
      timeout: parseInt(opts.timeout),
      output: globalOpts.output,
      generateSuite: opts.generateSuite,
      verbose: globalOpts.verbose,
    });

    if (result.success) {
      console.log(`✅ ${result.message}`);
      if (result.data) {
        console.log(
          `📊 Results: ${result.data.passed}/${result.data.passed + result.data.failed} tests passed`
        );
        console.log(`📈 Coverage: ${result.data.coverage.toFixed(1)}%`);
        if (result.data.reportPath) {
          console.log(`📄 Report: ${result.data.reportPath}`);
        }
      }
    } else {
      console.error(`❌ ${result.message}`);
      process.exit(1);
    }
  });

// Analyze command
program
  .command('analyze')
  .description('Generate comprehensive project analysis and health report')
  .option('--format <format>', 'Output format: json | html | markdown', 'html')
  .option('--detailed', 'Include detailed analysis information')
  .action(async (opts, command) => {
    const globalOpts = command.parent.opts();
    const context = await initializeCLI(globalOpts);

    const analyzeCommand = new AnalyzeCommand(new Logger(context.verbose));
    analyzeCommand.setContext(context);

    const result = await analyzeCommand.execute({
      project: globalOpts.project,
      output: globalOpts.output,
      format: opts.format,
      detailed: opts.detailed,
      verbose: globalOpts.verbose,
    });

    if (result.success) {
      console.log(`✅ ${result.message}`);
      if (result.data) {
        console.log(
          `📊 Analysis complete: ${result.data.totalFiles} files, ${result.data.dependencies} dependencies`
        );
        console.log(`🏥 Health Score: ${result.data.maintainabilityIndex}/100`);
        if (result.data.riskFactors > 0) {
          console.log(`⚠️  ${result.data.riskFactors} risk factors identified`);
        }
        console.log(`📄 Report: ${result.data.reportPath}`);
      }
    } else {
      console.error(`❌ ${result.message}`);
      process.exit(1);
    }
  });

// AST Analyze command
program
  .command('ast')
  .description('Perform comprehensive AST analysis across languages')
  .option('--format <format>', 'Output format: json | html | markdown', 'html')
  .option('--symbols', 'Include detailed symbol analysis')
  .option('--complexity', 'Include complexity analysis')
  .option('--dependencies', 'Include dependency analysis')
  .action(async (opts, command) => {
    const globalOpts = command.parent.opts();
    const context = await initializeCLI(globalOpts);

    const astAnalyzeCommand = new ASTAnalyzeCommand(new Logger(context.verbose));
    astAnalyzeCommand.setContext(context);

    const result = await astAnalyzeCommand.execute({
      project: globalOpts.project,
      output: globalOpts.output,
      format: opts.format,
      symbols: opts.symbols,
      complexity: opts.complexity,
      dependencies: opts.dependencies,
      verbose: globalOpts.verbose,
    });

    if (result.success) {
      console.log(`✅ ${result.message}`);
      if (result.data) {
        console.log(`🔍 Languages: ${result.data.languages.join(', ')}`);
        console.log(
          `📊 Symbols: ${result.data.totalSymbols} across ${result.data.totalFiles} files`
        );
        console.log(`🏗️  Architecture Score: ${result.data.architecturalScore}/100`);
        if (result.data.recommendations > 0) {
          console.log(`💡 ${result.data.recommendations} recommendations generated`);
        }
        console.log(`📄 Report: ${result.data.reportPath}`);
      }
    } else {
      console.error(`❌ ${result.message}`);
      process.exit(1);
    }
  });

// Safety Analyze command
program.addCommand(createSafetyAnalyzeCommand());

// Coverage Analyze command
program.addCommand(createCoverageAnalyzeCommand());

// Refactor Suggest command
program.addCommand(createRefactorSuggestCommand());

// LSP command (stub for now)
program
  .command('lsp')
  .description('Start a minimal JSON-RPC server for IDE integration (stdio)')
  .action(async (opts, command) => {
    const globalOpts = command.parent.opts();
    await initializeCLI(globalOpts);

    console.log('🚧 LSP server not yet implemented');
    console.log('Refactogent LSP stub running on stdio.');

    // Keep the basic echo functionality for now
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => {
      try {
        const msg = JSON.parse(chunk.toString());
        const res = { jsonrpc: '2.0', id: msg.id, result: { ok: true, echo: msg } };
        process.stdout.write(JSON.stringify(res) + '\n');
      } catch {
        // ignore
      }
    });
  });

// Error handling
program.configureHelp({
  sortSubcommands: true,
});

program.showHelpAfterError();

// Parse command line arguments
program.parse(process.argv);
