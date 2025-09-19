import { Command } from 'commander';
import { BaseCommand } from './base.js';
import { CommandResult, RefactoringMode } from '../types/index.js';
import { CLIRecorder, CLICommand, CLIRecordingOptions } from '../characterization/cli-recorder.js';
import { Logger } from '../utils/logger.js';
import fs from 'fs';
import path from 'path';

interface RecordCLIOptions {
  commands?: string[];
  commandsFile?: string;
  output?: string;
  format?: 'jest' | 'vitest';
  timeout?: number;
  tolerance?: {
    ignoreExitCode?: boolean;
    ignoreStderr?: boolean;
    normalizeTimestamps?: boolean;
    normalizePaths?: boolean;
    ignorePatterns?: string[];
  };
}

export class RecordCLICommand extends BaseCommand {
  private recorder: CLIRecorder;

  constructor(logger: Logger) {
    super(logger);
    this.recorder = new CLIRecorder(logger);
  }

  async execute(options: RecordCLIOptions): Promise<CommandResult> {
    this.validateContext();

    const outputDir =
      options.output || path.join(this.context!.outputDir, 'cli-characterization-tests');
    const format = options.format || 'jest';
    const projectPath = this.context!.projectInfo.path;

    this.logger.info('Starting CLI characterization recording', {
      projectPath,
      format,
      outputDir,
    });

    try {
      // Parse commands
      const commands = await this.parseCommands(options, projectPath);

      if (commands.length === 0) {
        return this.failure('No commands specified. Use --commands or --commands-file option.');
      }

      // Prepare recording options
      const recordingOptions: CLIRecordingOptions = {
        projectPath,
        commands,
        timeout: options.timeout || 30000,
        tolerance: options.tolerance,
      };

      // Start recording
      const sessionId = await this.recorder.startRecording(recordingOptions);

      // Record commands
      const executions = await this.recorder.recordCommands(commands);

      // Stop recording and get session data
      const session = await this.recorder.stopRecording();

      // Generate golden tests
      const generatedFiles = this.recorder.generateGoldenTests(session, {
        outputDir,
        testFramework: format,
        tolerance: options.tolerance,
      });

      // Save session data
      const sessionFile = path.join(outputDir, `cli-session-${sessionId}.json`);
      fs.writeFileSync(sessionFile, JSON.stringify(session, null, 2));
      generatedFiles.push(sessionFile);

      // Generate summary report
      const summaryReport = this.generateSummaryReport(session, generatedFiles, outputDir);
      const summaryFile = path.join(outputDir, 'cli-recording-summary.md');
      fs.writeFileSync(summaryFile, summaryReport);
      generatedFiles.push(summaryFile);

      this.logger.success('CLI characterization recording completed', {
        sessionId,
        executions: executions.length,
        commands: commands.length,
        files: generatedFiles.length,
      });

      return this.success(
        `Recorded ${executions.length} CLI executions for ${commands.length} commands`,
        generatedFiles,
        {
          sessionId,
          executions: executions.length,
          commands: commands.length,
          files: generatedFiles.length,
          outputDir,
        }
      );
    } catch (error) {
      return this.failure(
        `CLI recording failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async parseCommands(
    options: RecordCLIOptions,
    projectPath: string
  ): Promise<CLICommand[]> {
    const commands: CLICommand[] = [];

    // Parse from command line arguments
    if (options.commands) {
      for (const cmdString of options.commands) {
        const parts = cmdString.trim().split(/\s+/);
        if (parts.length > 0) {
          commands.push({
            command: parts[0],
            args: parts.slice(1),
            workingDirectory: projectPath,
          });
        }
      }
    }

    // Parse from commands file
    if (options.commandsFile) {
      const commandsFilePath = path.resolve(options.commandsFile);
      if (fs.existsSync(commandsFilePath)) {
        const fileContent = fs.readFileSync(commandsFilePath, 'utf8');

        try {
          // Try parsing as JSON first
          const jsonCommands = JSON.parse(fileContent);
          if (Array.isArray(jsonCommands)) {
            commands.push(
              ...jsonCommands.map(cmd => ({
                command: cmd.command || cmd.cmd,
                args: cmd.args || [],
                workingDirectory: cmd.workingDirectory || cmd.cwd || projectPath,
                environment: cmd.environment || cmd.env,
                timeout: cmd.timeout,
              }))
            );
          }
        } catch {
          // Fall back to parsing as line-separated commands
          const lines = fileContent
            .split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'));

          for (const line of lines) {
            const parts = line.split(/\s+/);
            if (parts.length > 0) {
              commands.push({
                command: parts[0],
                args: parts.slice(1),
                workingDirectory: projectPath,
              });
            }
          }
        }
      } else {
        throw new Error(`Commands file not found: ${commandsFilePath}`);
      }
    }

    // Add default commands if none specified
    if (commands.length === 0) {
      const defaultCommands = this.getDefaultCommands(projectPath);
      commands.push(...defaultCommands);
    }

    return commands;
  }

  private getDefaultCommands(projectPath: string): CLICommand[] {
    const commands: CLICommand[] = [];

    // Check for package.json scripts
    const packageJsonPath = path.join(projectPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        const scripts = packageJson.scripts || {};

        // Add common npm scripts
        const commonScripts = ['test', 'build', 'lint', 'start', 'dev'];
        for (const script of commonScripts) {
          if (scripts[script]) {
            commands.push({
              command: 'npm',
              args: ['run', script],
              workingDirectory: projectPath,
            });
          }
        }

        // Add npm install
        commands.push({
          command: 'npm',
          args: ['install', '--dry-run'],
          workingDirectory: projectPath,
        });
      } catch (error) {
        this.logger.debug('Failed to parse package.json', { error });
      }
    }

    // Check for Python projects
    const requirementsPath = path.join(projectPath, 'requirements.txt');
    const pyprojectPath = path.join(projectPath, 'pyproject.toml');
    if (fs.existsSync(requirementsPath) || fs.existsSync(pyprojectPath)) {
      commands.push(
        {
          command: 'python',
          args: ['--version'],
          workingDirectory: projectPath,
        },
        {
          command: 'pip',
          args: ['list'],
          workingDirectory: projectPath,
        }
      );

      if (fs.existsSync(requirementsPath)) {
        commands.push({
          command: 'pip',
          args: ['install', '-r', 'requirements.txt', '--dry-run'],
          workingDirectory: projectPath,
        });
      }
    }

    // Check for Go projects
    const goModPath = path.join(projectPath, 'go.mod');
    if (fs.existsSync(goModPath)) {
      commands.push(
        {
          command: 'go',
          args: ['version'],
          workingDirectory: projectPath,
        },
        {
          command: 'go',
          args: ['mod', 'tidy', '-v'],
          workingDirectory: projectPath,
        },
        {
          command: 'go',
          args: ['build', '-v'],
          workingDirectory: projectPath,
        }
      );
    }

    // Add git commands if it's a git repository
    const gitPath = path.join(projectPath, '.git');
    if (fs.existsSync(gitPath)) {
      commands.push(
        {
          command: 'git',
          args: ['status', '--porcelain'],
          workingDirectory: projectPath,
        },
        {
          command: 'git',
          args: ['log', '--oneline', '-5'],
          workingDirectory: projectPath,
        }
      );
    }

    return commands;
  }

  private generateSummaryReport(session: any, generatedFiles: string[], outputDir: string): string {
    const duration = session.endTime - session.startTime;
    const commandGroups = this.groupExecutionsByCommand(session.executions);
    const successfulExecutions = session.executions.filter((e: any) => e.result.exitCode === 0);
    const failedExecutions = session.executions.filter((e: any) => e.result.exitCode !== 0);

    return `# CLI Characterization Recording Summary

## Session Information
- **Session ID**: ${session.id}
- **Project Path**: ${session.projectPath}
- **Duration**: ${Math.round(duration / 1000)}s
- **Total Executions**: ${session.executions.length}
- **Successful**: ${successfulExecutions.length}
- **Failed**: ${failedExecutions.length}
- **Unique Commands**: ${Object.keys(commandGroups).length}

## Recorded Commands
${Object.entries(commandGroups)
  .map(
    ([command, executions]: [string, any[]]) => `
### ${command}
- **Executions**: ${executions.length}
- **Success Rate**: ${Math.round((executions.filter(e => e.result.exitCode === 0).length / executions.length) * 100)}%
- **Avg Duration**: ${Math.round(executions.reduce((sum, e) => sum + e.duration, 0) / executions.length)}ms
- **Exit Codes**: ${[...new Set(executions.map(e => e.result.exitCode))].join(', ')}
`
  )
  .join('')}

## Environment Information
- **Platform**: ${session.metadata.platform}
- **Node Version**: ${session.metadata.nodeVersion}

## Generated Files
${generatedFiles.map(file => `- ${path.relative(outputDir, file)}`).join('\n')}

## Usage Instructions

### Running Tests
\`\`\`bash
# For Jest tests
npm test -- --testPathPattern=cli

# For Vitest tests
npx vitest cli
\`\`\`

### Updating Golden Files
When CLI behavior legitimately changes:
1. Review the failing tests to understand what changed
2. If changes are expected, re-record:
   \`\`\`bash
   refactogent record-cli --output ${path.relative(process.cwd(), outputDir)}
   \`\`\`

### Tolerance Configuration
The tests support various tolerance options:
- \`ignoreExitCode\`: Ignore exit code differences
- \`ignoreStderr\`: Ignore stderr output differences
- \`normalizeTimestamps\`: Replace timestamps with placeholders
- \`normalizePaths\`: Replace absolute paths with placeholders

## Safety Notes
- These tests capture the current CLI behavior
- They will fail if command output changes
- Review failures carefully - they might indicate breaking changes
- Some commands may have non-deterministic output (timestamps, temp paths)
- Consider using tolerance options for dynamic content

Generated at: ${new Date().toISOString()}
`;
  }

  private groupExecutionsByCommand(executions: any[]): Record<string, any[]> {
    const groups: Record<string, any[]> = {};

    for (const execution of executions) {
      const key = `${execution.command.command} ${execution.command.args.join(' ')}`;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(execution);
    }

    return groups;
  }
}

/**
 * Create the record-cli command for the CLI
 */
export function createRecordCLICommand(): Command {
  const command = new Command('record-cli')
    .description('Record CLI command executions and generate characterization tests')
    .option('--commands <commands...>', 'CLI commands to record (e.g., "npm test" "npm build")')
    .option('--commands-file <file>', 'File containing commands to record (JSON or line-separated)')
    .option('--output <dir>', 'Output directory for generated tests')
    .option('--format <format>', 'Test framework: jest | vitest', 'jest')
    .option('--timeout <ms>', 'Command timeout in milliseconds', '30000')
    .option('--ignore-exit-code', 'Ignore exit code differences in tests')
    .option('--ignore-stderr', 'Ignore stderr differences in tests')
    .option('--normalize-timestamps', 'Normalize timestamps in output')
    .option('--normalize-paths', 'Normalize file paths in output')
    .option('--ignore-patterns <patterns...>', 'Regex patterns to ignore in output')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.parent?.parent?.opts() || {};

      // Initialize CLI context
      const logger = new Logger(globalOpts.verbose);

      try {
        // Create command instance
        const recordCommand = new RecordCLICommand(logger);

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

        recordCommand.setContext(context);

        // Prepare tolerance options
        const tolerance: any = {};
        if (opts.ignoreExitCode) tolerance.ignoreExitCode = true;
        if (opts.ignoreStderr) tolerance.ignoreStderr = true;
        if (opts.normalizeTimestamps) tolerance.normalizeTimestamps = true;
        if (opts.normalizePaths) tolerance.normalizePaths = true;
        if (opts.ignorePatterns) tolerance.ignorePatterns = opts.ignorePatterns;

        // Execute command
        const result = await recordCommand.execute({
          commands: opts.commands,
          commandsFile: opts.commandsFile,
          output: opts.output,
          format: opts.format,
          timeout: parseInt(opts.timeout, 10),
          tolerance: Object.keys(tolerance).length > 0 ? tolerance : undefined,
        });

        if (result.success) {
          console.log(`✅ ${result.message}`);
          if (result.artifacts) {
            console.log(`📁 Generated files: ${result.artifacts.length} files`);
            console.log(`📂 Output directory: ${result.data?.outputDir}`);
          }
          if (result.data) {
            console.log(`🎬 Session: ${result.data.sessionId}`);
            console.log(`📊 Executions: ${result.data.executions}`);
            console.log(`⚡ Commands: ${result.data.commands}`);
          }
        } else {
          console.error(`❌ ${result.message}`);
          process.exit(1);
        }
      } catch (error) {
        logger.error('CLI recording failed', { error });
        console.error(
          `❌ CLI recording failed: ${error instanceof Error ? error.message : String(error)}`
        );
        process.exit(1);
      }
    });

  return command;
}
