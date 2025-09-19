import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import { Logger } from '../utils/logger.js';

export interface CLICommand {
  command: string;
  args: string[];
  workingDirectory: string;
  environment?: Record<string, string>;
  timeout?: number;
}

export interface CLIExecution {
  id: string;
  command: CLICommand;
  result: CLIResult;
  timestamp: number;
  duration: number;
}

export interface CLIResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  error?: string;
}

export interface CLIRecordingSession {
  id: string;
  projectPath: string;
  startTime: number;
  endTime?: number;
  executions: CLIExecution[];
  metadata: {
    platform: string;
    nodeVersion: string;
    environment: Record<string, string>;
  };
}

export interface CLIRecordingOptions {
  projectPath: string;
  commands: CLICommand[];
  timeout?: number;
  environment?: Record<string, string>;
  tolerance?: {
    ignoreExitCode?: boolean;
    ignoreStderr?: boolean;
    normalizeTimestamps?: boolean;
    normalizePaths?: boolean;
    ignorePatterns?: string[];
  };
}

export class CLIRecorder {
  private logger: Logger;
  private session?: CLIRecordingSession;
  private executionCount = 0;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Start recording CLI command executions
   */
  async startRecording(options: CLIRecordingOptions): Promise<string> {
    this.logger.info('Starting CLI recording session', { 
      projectPath: options.projectPath,
      commands: options.commands.length 
    });

    const sessionId = `cli-session-${Date.now()}`;
    this.session = {
      id: sessionId,
      projectPath: options.projectPath,
      startTime: Date.now(),
      executions: [],
      metadata: {
        platform: process.platform,
        nodeVersion: process.version,
        environment: Object.fromEntries(
          Object.entries({ ...process.env, ...options.environment })
            .filter(([_, value]) => value !== undefined)
        ) as Record<string, string>,
      },
    };

    this.logger.info('CLI recording session started', { sessionId });
    return sessionId;
  }

  /**
   * Record execution of CLI commands
   */
  async recordCommands(commands: CLICommand[]): Promise<CLIExecution[]> {
    if (!this.session) {
      throw new Error('Recording session not started');
    }

    const executions: CLIExecution[] = [];

    for (const command of commands) {
      try {
        this.logger.info('Recording CLI command', { 
          command: command.command,
          args: command.args 
        });

        const execution = await this.executeCommand(command);
        executions.push(execution);
        this.session.executions.push(execution);

        this.logger.info('CLI command recorded', {
          id: execution.id,
          exitCode: execution.result.exitCode,
          duration: execution.duration,
        });

      } catch (error) {
        this.logger.warn('Failed to record CLI command', { 
          command: command.command,
          error: error instanceof Error ? error.message : String(error) 
        });
      }
    }

    return executions;
  }

  /**
   * Stop recording and return session data
   */
  async stopRecording(): Promise<CLIRecordingSession> {
    if (!this.session) {
      throw new Error('No recording session active');
    }

    this.session.endTime = Date.now();

    this.logger.info('CLI recording session completed', {
      sessionId: this.session.id,
      executions: this.session.executions.length,
      duration: this.session.endTime - this.session.startTime,
    });

    const completedSession = this.session;
    this.session = undefined;

    return completedSession;
  }

  /**
   * Generate golden tests from recorded session
   */
  generateGoldenTests(
    session: CLIRecordingSession,
    options: {
      outputDir: string;
      testFramework?: 'jest' | 'mocha' | 'vitest';
      tolerance?: {
        ignoreExitCode?: boolean;
        ignoreStderr?: boolean;
        normalizeTimestamps?: boolean;
        normalizePaths?: boolean;
        ignorePatterns?: string[];
      };
    }
  ): string[] {
    const { outputDir, testFramework = 'jest', tolerance } = options;
    const generatedFiles: string[] = [];

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Group executions by command
    const commandGroups = this.groupExecutionsByCommand(session.executions);

    for (const [commandKey, executions] of Object.entries(commandGroups)) {
      const testFileName = this.sanitizeFileName(`${commandKey}.cli.test.js`);
      const testFilePath = path.join(outputDir, testFileName);

      const testContent = this.generateTestFile(
        commandKey,
        executions,
        session,
        testFramework,
        tolerance
      );

      fs.writeFileSync(testFilePath, testContent);
      generatedFiles.push(testFilePath);

      // Generate golden result files
      executions.forEach((execution, index) => {
        const goldenFileName = this.sanitizeFileName(
          `${commandKey}.${index}.golden.json`
        );
        const goldenFilePath = path.join(outputDir, goldenFileName);

        const goldenData = this.createGoldenResult(execution, tolerance);
        fs.writeFileSync(goldenFilePath, JSON.stringify(goldenData, null, 2));
        generatedFiles.push(goldenFilePath);
      });
    }

    this.logger.info('Generated CLI golden tests', {
      commands: Object.keys(commandGroups).length,
      files: generatedFiles.length,
      outputDir,
    });

    return generatedFiles;
  }

  /**
   * Execute a single CLI command
   */
  private async executeCommand(command: CLICommand): Promise<CLIExecution> {
    const startTime = Date.now();
    const executionId = `execution-${this.executionCount++}`;

    return new Promise((resolve, reject) => {
      const timeout = command.timeout || 30000;
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const child: ChildProcess = spawn(command.command, command.args, {
        cwd: command.workingDirectory,
        env: {
          ...process.env,
          ...command.environment,
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Set up timeout
      const timeoutHandle = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
      }, timeout);

      // Collect stdout
      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      // Collect stderr
      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      // Handle completion
      child.on('close', (code) => {
        clearTimeout(timeoutHandle);
        const endTime = Date.now();

        const execution: CLIExecution = {
          id: executionId,
          command,
          result: {
            exitCode: timedOut ? -1 : (code || 0),
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            error: timedOut ? 'Command timed out' : undefined,
          },
          timestamp: startTime,
          duration: endTime - startTime,
        };

        resolve(execution);
      });

      // Handle errors
      child.on('error', (error) => {
        clearTimeout(timeoutHandle);
        const endTime = Date.now();

        const execution: CLIExecution = {
          id: executionId,
          command,
          result: {
            exitCode: -1,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            error: error.message,
          },
          timestamp: startTime,
          duration: endTime - startTime,
        };

        resolve(execution); // Don't reject, we want to record failed executions too
      });
    });
  }

  /**
   * Group executions by command signature
   */
  private groupExecutionsByCommand(executions: CLIExecution[]): Record<string, CLIExecution[]> {
    const groups: Record<string, CLIExecution[]> = {};
    
    for (const execution of executions) {
      const key = `${execution.command.command}_${execution.command.args.join('_')}`;
      const sanitizedKey = this.sanitizeFileName(key);
      
      if (!groups[sanitizedKey]) {
        groups[sanitizedKey] = [];
      }
      groups[sanitizedKey].push(execution);
    }
    
    return groups;
  }

  /**
   * Generate test file content
   */
  private generateTestFile(
    commandKey: string,
    executions: CLIExecution[],
    session: CLIRecordingSession,
    framework: string,
    tolerance?: any
  ): string {
    const testName = `CLI characterization test for ${commandKey}`;
    
    if (framework === 'jest') {
      return this.generateJestTest(testName, commandKey, executions, session, tolerance);
    } else if (framework === 'vitest') {
      return this.generateVitestTest(testName, commandKey, executions, session, tolerance);
    }
    
    return this.generateJestTest(testName, commandKey, executions, session, tolerance);
  }

  /**
   * Generate Jest test
   */
  private generateJestTest(
    testName: string,
    commandKey: string,
    executions: CLIExecution[],
    session: CLIRecordingSession,
    tolerance?: any
  ): string {
    return `// Generated CLI characterization test for ${commandKey}
// Generated at: ${new Date().toISOString()}

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

describe('${testName}', () => {
  const projectPath = '${session.projectPath}';
  
  // Helper function to execute CLI command
  async function executeCommand(command, args, options = {}) {
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      
      const child = spawn(command, args, {
        cwd: options.cwd || projectPath,
        env: { ...process.env, ...options.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      child.on('close', (code) => {
        resolve({
          exitCode: code || 0,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
        });
      });
      
      child.on('error', (error) => {
        resolve({
          exitCode: -1,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          error: error.message,
        });
      });
    });
  }

${executions.map((execution, index) => `
  test('${execution.command.command} ${execution.command.args.join(' ')} - execution ${index + 1}', async () => {
    const goldenPath = path.join(__dirname, '${this.sanitizeFileName(`${commandKey}.${index}.golden.json`)}');
    const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));
    
    const result = await executeCommand(
      '${execution.command.command}',
      ${JSON.stringify(execution.command.args)},
      {
        cwd: '${execution.command.workingDirectory}',
        ${execution.command.environment ? `env: ${JSON.stringify(execution.command.environment)},` : ''}
      }
    );
    
    ${tolerance?.ignoreExitCode ? 
      '// Exit code ignored due to tolerance settings' :
      'expect(result.exitCode).toBe(golden.exitCode);'
    }
    
    ${tolerance?.ignoreStderr ? 
      '// Stderr ignored due to tolerance settings' :
      'expect(normalizeOutput(result.stderr)).toBe(normalizeOutput(golden.stderr));'
    }
    
    expect(normalizeOutput(result.stdout)).toBe(normalizeOutput(golden.stdout));
  }, 30000);`).join('\n')}

  // Helper function to normalize output for comparison
  function normalizeOutput(output) {
    if (!output) return '';
    
    let normalized = output;
    
    ${tolerance?.normalizeTimestamps ? `
    // Normalize timestamps
    normalized = normalized.replace(/\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z/g, 'TIMESTAMP');
    normalized = normalized.replace(/\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}/g, 'TIMESTAMP');
    ` : ''}
    
    ${tolerance?.normalizePaths ? `
    // Normalize file paths
    normalized = normalized.replace(/${session.projectPath.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}/g, 'PROJECT_ROOT');
    normalized = normalized.replace(/\\/[^\\s]+\\/node_modules\\//g, '/PROJECT_ROOT/node_modules/');
    ` : ''}
    
    ${tolerance?.ignorePatterns ? `
    // Apply ignore patterns
    const ignorePatterns = ${JSON.stringify(tolerance.ignorePatterns)};
    ignorePatterns.forEach(pattern => {
      const regex = new RegExp(pattern, 'g');
      normalized = normalized.replace(regex, 'IGNORED');
    });
    ` : ''}
    
    return normalized.trim();
  }
});
`;
  }

  /**
   * Generate Vitest test
   */
  private generateVitestTest(
    testName: string,
    commandKey: string,
    executions: CLIExecution[],
    session: CLIRecordingSession,
    tolerance?: any
  ): string {
    return `// Generated Vitest CLI characterization test for ${commandKey}
// Generated at: ${new Date().toISOString()}

import { describe, test, expect } from 'vitest';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

describe('${testName}', () => {
  const projectPath = '${session.projectPath}';
  
  // Helper function to execute CLI command
  async function executeCommand(command: string, args: string[], options: any = {}) {
    return new Promise<any>((resolve) => {
      let stdout = '';
      let stderr = '';
      
      const child = spawn(command, args, {
        cwd: options.cwd || projectPath,
        env: { ...process.env, ...options.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      
      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });
      
      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });
      
      child.on('close', (code) => {
        resolve({
          exitCode: code || 0,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
        });
      });
      
      child.on('error', (error) => {
        resolve({
          exitCode: -1,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          error: error.message,
        });
      });
    });
  }

${executions.map((execution, index) => `
  test('${execution.command.command} ${execution.command.args.join(' ')} - execution ${index + 1}', async () => {
    const goldenPath = path.join(__dirname, '${this.sanitizeFileName(`${commandKey}.${index}.golden.json`)}');
    const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));
    
    const result = await executeCommand(
      '${execution.command.command}',
      ${JSON.stringify(execution.command.args)},
      {
        cwd: '${execution.command.workingDirectory}',
        ${execution.command.environment ? `env: ${JSON.stringify(execution.command.environment)},` : ''}
      }
    );
    
    ${tolerance?.ignoreExitCode ? 
      '// Exit code ignored due to tolerance settings' :
      'expect(result.exitCode).toBe(golden.exitCode);'
    }
    
    ${tolerance?.ignoreStderr ? 
      '// Stderr ignored due to tolerance settings' :
      'expect(normalizeOutput(result.stderr)).toBe(normalizeOutput(golden.stderr));'
    }
    
    expect(normalizeOutput(result.stdout)).toBe(normalizeOutput(golden.stdout));
  }, 30000);`).join('\n')}

  function normalizeOutput(output: string): string {
    if (!output) return '';
    
    let normalized = output;
    
    ${tolerance?.normalizeTimestamps ? `
    normalized = normalized.replace(/\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z/g, 'TIMESTAMP');
    normalized = normalized.replace(/\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}/g, 'TIMESTAMP');
    ` : ''}
    
    ${tolerance?.normalizePaths ? `
    normalized = normalized.replace(/${session.projectPath.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}/g, 'PROJECT_ROOT');
    normalized = normalized.replace(/\\/[^\\s]+\\/node_modules\\//g, '/PROJECT_ROOT/node_modules/');
    ` : ''}
    
    return normalized.trim();
  }
});
`;
  }

  /**
   * Create golden result data
   */
  private createGoldenResult(execution: CLIExecution, tolerance?: any): any {
    return {
      exitCode: execution.result.exitCode,
      stdout: execution.result.stdout,
      stderr: execution.result.stderr,
      error: execution.result.error,
      metadata: {
        command: execution.command.command,
        args: execution.command.args,
        workingDirectory: execution.command.workingDirectory,
        timestamp: execution.timestamp,
        duration: execution.duration,
      },
    };
  }

  /**
   * Sanitize filename for filesystem
   */
  private sanitizeFileName(filename: string): string {
    return filename
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }
}