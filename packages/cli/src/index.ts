#!/usr/bin/env node

import { Command } from 'commander';
import { Logger } from './utils/logger.js';
import { OutputFormatter } from './utils/output-formatter.js';
import { CodebaseIndexer, RefactorableFile } from '@refactogent/core';

const program = new Command();

// Global options
program
  .name('refactogent')
  .description('RefactoGent CLI — AI-powered refactoring with deterministic pre-analysis')
  .version('1.0.1')
  .option('-v, --verbose', 'Enable verbose logging')
  .option('-o, --output <dir>', 'Output directory', '.refactogent/out')
  .option('-p, --project <path>', 'Project path', process.cwd());


program
  .command('refactor')
  .description('Complete refactoring workflow: analyze + suggest + apply AI-powered changes')
  .argument('[path]', 'Path to analyze and refactor', '.')
  .option('-o, --output <file>', 'Output file for results')
  .option('-f, --format <format>', 'Output format (json|table|detailed)', 'detailed')
  .option('--include-tests', 'Include test creation in workflow')
  .option('--include-critique', 'Include validation critique in workflow')
  .option('--dry-run', 'Analyze without making changes')
  .option('--debug', 'Enable detailed debugging output showing LLM interactions')
  .action(async (path, options, command) => {
    const globalOpts = command.parent.opts();
    const logger = new Logger(globalOpts.verbose);

    try {
      // Display header
      logger.log(OutputFormatter.header('RefactoGent: Complete AI-Powered Refactoring Workflow'));

      /**
       * 1. First we need to index the project files which files can be refactored
       * 2. Then we will abstract out the types if they exist in the same file as
       * an implementation
       * 3. Then we will fix unused variables and function arguments
       */

      // Step 1: Index the codebase
      logger.log(OutputFormatter.info('Starting codebase indexing...'));

      // Log debug information if verbose
      logger.debug('Indexer configuration', {
        rootPath: path,
        includeTests: options.includeTests || false,
        verbose: globalOpts.verbose
      });

      const indexer = new CodebaseIndexer({
        rootPath: path,
        includeTests: options.includeTests || false
      });

      const refactorableFiles: RefactorableFile[] = await indexer.indexCodebase();
      const stats = indexer.getIndexingStats(refactorableFiles);

      // Display success message
      logger.log(OutputFormatter.success(`Successfully indexed ${stats.totalFiles} files with ${stats.totalSymbols} symbols`));

      // Display statistics
      logger.log(OutputFormatter.stats(stats));

      // Display sample files
      logger.log(OutputFormatter.fileList(refactorableFiles));

      // TODO: Step 2 - Abstract types from implementations
      // TODO: Step 3 - Fix unused variables and function arguments

    } catch (error) {
      // Display error message
      logger.log(OutputFormatter.error('Refactoring workflow failed'));

      // Log detailed error if verbose
      logger.error('Refactoring workflow failed', {
        error: error instanceof Error ? error.message : String(error),
      });

      process.exit(1);
    }
  });



// Configure help
program.configureHelp({
  sortSubcommands: true,
});
program.showHelpAfterError();

// Add custom help handler
program.on('--help', () => {
  const logger = new Logger();
  logger.log(OutputFormatter.help());
});

// Parse command line arguments
program.parse(process.argv);
