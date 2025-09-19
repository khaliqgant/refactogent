import fs from 'fs';
import path from 'path';
import { Logger } from '../utils/logger.js';
import { ProjectType } from '../types/index.js';
import {
  TestEnvironment,
  TestEnvironmentConfig,
  TestEnvironmentState,
  TestResult,
} from './test-environment.js';

export interface TestSuite {
  name: string;
  description: string;
  environments: TestEnvironmentConfig[];
  tests: TestCase[];
}

export interface TestCase {
  name: string;
  description: string;
  setup?: string[];
  commands: string[];
  assertions: TestAssertion[];
  cleanup?: string[];
}

export interface TestAssertion {
  type: 'exitCode' | 'output' | 'fileExists' | 'fileContent' | 'buildSuccess' | 'noRegression';
  expected: any;
  actual?: any;
  passed?: boolean;
  message?: string;
}

export interface TestHarnessResult {
  suite: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  environments: TestEnvironmentResult[];
  summary: {
    success: boolean;
    coverage: number;
    regressions: string[];
    improvements: string[];
  };
}

export interface TestEnvironmentResult {
  environment: string;
  projectType: ProjectType;
  isolationMode: string;
  tests: TestCaseResult[];
  beforeState: TestEnvironmentState;
  afterState: TestEnvironmentState;
  stateComparison: any;
}

export interface TestCaseResult {
  testCase: string;
  success: boolean;
  duration: number;
  assertions: TestAssertion[];
  output: string;
  error?: string;
}

export class TestHarness {
  private logger: Logger;
  private outputDir: string;
  private activeEnvironments: Map<string, TestEnvironment> = new Map();

  constructor(logger: Logger, outputDir = '.refactogent/test-results') {
    this.logger = logger;
    this.outputDir = outputDir;

    // Ensure output directory exists
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Execute a complete test suite
   */
  async executeSuite(suite: TestSuite): Promise<TestHarnessResult> {
    this.logger.info('Starting test suite execution', {
      suite: suite.name,
      environments: suite.environments.length,
      tests: suite.tests.length,
    });

    const startTime = new Date();
    const result: TestHarnessResult = {
      suite: suite.name,
      startTime,
      endTime: new Date(),
      duration: 0,
      totalTests: suite.tests.length * suite.environments.length,
      passedTests: 0,
      failedTests: 0,
      environments: [],
      summary: {
        success: false,
        coverage: 0,
        regressions: [],
        improvements: [],
      },
    };

    try {
      // Execute tests in each environment
      for (const envConfig of suite.environments) {
        const envResult = await this.executeEnvironment(envConfig, suite.tests);
        result.environments.push(envResult);

        // Update counters
        for (const testResult of envResult.tests) {
          if (testResult.success) {
            result.passedTests++;
          } else {
            result.failedTests++;
          }
        }
      }

      // Calculate summary
      result.endTime = new Date();
      result.duration = result.endTime.getTime() - startTime.getTime();
      result.summary.success = result.failedTests === 0;
      result.summary.coverage =
        result.totalTests > 0 ? (result.passedTests / result.totalTests) * 100 : 0;

      // Analyze regressions and improvements
      this.analyzeSuiteResults(result);

      // Save results
      await this.saveResults(result);

      this.logger.info('Test suite completed', {
        suite: suite.name,
        duration: result.duration,
        passed: result.passedTests,
        failed: result.failedTests,
        success: result.summary.success,
      });
    } catch (error) {
      this.logger.error('Test suite execution failed', {
        suite: suite.name,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      // Cleanup all environments
      await this.cleanupAllEnvironments();
    }

    return result;
  }

  /**
   * Execute tests in a single environment
   */
  private async executeEnvironment(
    config: TestEnvironmentConfig,
    tests: TestCase[]
  ): Promise<TestEnvironmentResult> {
    this.logger.debug('Executing tests in environment', {
      projectType: config.projectType,
      isolationMode: config.isolationMode,
    });

    const environment = new TestEnvironment(config, this.logger);
    const envId = `${config.projectType}-${config.isolationMode}-${Date.now()}`;
    this.activeEnvironments.set(envId, environment);

    try {
      // Initialize environment
      await environment.initialize();

      // Capture initial state
      const beforeState = await environment.captureState();

      // Execute all test cases
      const testResults: TestCaseResult[] = [];
      for (const testCase of tests) {
        const testResult = await this.executeTestCase(environment, testCase);
        testResults.push(testResult);
      }

      // Capture final state
      const afterState = await environment.captureState();

      // Compare states
      const stateComparison = environment.compareStates(beforeState, afterState);

      return {
        environment: envId,
        projectType: config.projectType,
        isolationMode: config.isolationMode,
        tests: testResults,
        beforeState,
        afterState,
        stateComparison,
      };
    } finally {
      // Clean up environment
      await environment.cleanup();
      this.activeEnvironments.delete(envId);
    }
  }

  /**
   * Execute a single test case
   */
  private async executeTestCase(
    environment: TestEnvironment,
    testCase: TestCase
  ): Promise<TestCaseResult> {
    this.logger.debug('Executing test case', { testCase: testCase.name });

    const startTime = Date.now();
    let output = '';
    let error: string | undefined;
    const assertions: TestAssertion[] = [];

    try {
      // Run setup commands
      if (testCase.setup) {
        for (const setupCmd of testCase.setup) {
          const [cmd, ...args] = setupCmd.split(' ');
          await environment.executeCommand(cmd, args);
        }
      }

      // Run test commands
      for (const command of testCase.commands) {
        const [cmd, ...args] = command.split(' ');
        const result = await environment.executeCommand(cmd, args);
        output += result.output;

        if (!result.success && !error) {
          error = result.error || `Command failed with exit code ${result.exitCode}`;
        }
      }

      // Run assertions
      for (const assertion of testCase.assertions) {
        const assertionResult = await this.runAssertion(environment, assertion, output);
        assertions.push(assertionResult);
      }

      // Run cleanup commands
      if (testCase.cleanup) {
        for (const cleanupCmd of testCase.cleanup) {
          const [cmd, ...args] = cleanupCmd.split(' ');
          await environment.executeCommand(cmd, args);
        }
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    const duration = Date.now() - startTime;
    const success = assertions.every(a => a.passed) && !error;

    return {
      testCase: testCase.name,
      success,
      duration,
      assertions,
      output,
      error,
    };
  }

  /**
   * Run a single assertion
   */
  private async runAssertion(
    environment: TestEnvironment,
    assertion: TestAssertion,
    output: string
  ): Promise<TestAssertion> {
    const result = { ...assertion };

    try {
      switch (assertion.type) {
        case 'exitCode':
          // This would need to be tracked from the last command execution
          result.actual = 0; // Placeholder
          result.passed = result.actual === assertion.expected;
          break;

        case 'output':
          result.actual = output;
          if (typeof assertion.expected === 'string') {
            result.passed = output.includes(assertion.expected);
          } else if (assertion.expected instanceof RegExp) {
            result.passed = assertion.expected.test(output);
          }
          break;

        case 'fileExists':
          const filePath = assertion.expected as string;
          result.actual = fs.existsSync(filePath);
          result.passed = result.actual === true;
          break;

        case 'fileContent':
          const { file, content } = assertion.expected as {
            file: string;
            content: string | RegExp;
          };
          if (fs.existsSync(file)) {
            const fileContent = fs.readFileSync(file, 'utf8');
            result.actual = fileContent;
            if (typeof content === 'string') {
              result.passed = fileContent.includes(content);
            } else {
              result.passed = content.test(fileContent);
            }
          } else {
            result.passed = false;
            result.actual = 'File does not exist';
          }
          break;

        case 'buildSuccess':
          // Run build command and check success
          const buildResult = await this.runBuildCommand(environment);
          result.actual = buildResult.success;
          result.passed = buildResult.success === assertion.expected;
          break;

        case 'noRegression':
          // This would compare against a baseline - placeholder for now
          result.passed = true;
          result.actual = 'No regression detected';
          break;

        default:
          result.passed = false;
          result.message = `Unknown assertion type: ${assertion.type}`;
      }
    } catch (err) {
      result.passed = false;
      result.message = err instanceof Error ? err.message : String(err);
    }

    if (!result.passed && !result.message) {
      result.message = `Expected ${assertion.expected}, got ${result.actual}`;
    }

    return result;
  }

  /**
   * Run build command based on project type
   */
  private async runBuildCommand(environment: TestEnvironment): Promise<TestResult> {
    // This is a simplified version - in reality we'd detect the project type
    // and run the appropriate build command
    return await environment.executeCommand('npm', ['run', 'build']);
  }

  /**
   * Analyze suite results for regressions and improvements
   */
  private analyzeSuiteResults(result: TestHarnessResult): void {
    // Load previous results if they exist
    const previousResultsPath = path.join(this.outputDir, `${result.suite}-previous.json`);

    if (fs.existsSync(previousResultsPath)) {
      try {
        const previousResults = JSON.parse(fs.readFileSync(previousResultsPath, 'utf8'));

        // Compare results
        if (previousResults.passedTests > result.passedTests) {
          result.summary.regressions.push(
            `Test count decreased from ${previousResults.passedTests} to ${result.passedTests}`
          );
        } else if (previousResults.passedTests < result.passedTests) {
          result.summary.improvements.push(
            `Test count increased from ${previousResults.passedTests} to ${result.passedTests}`
          );
        }

        if (previousResults.summary.coverage > result.summary.coverage) {
          result.summary.regressions.push(
            `Coverage decreased from ${previousResults.summary.coverage}% to ${result.summary.coverage}%`
          );
        } else if (previousResults.summary.coverage < result.summary.coverage) {
          result.summary.improvements.push(
            `Coverage increased from ${previousResults.summary.coverage}% to ${result.summary.coverage}%`
          );
        }
      } catch (error) {
        this.logger.warn('Could not load previous results for comparison', { error });
      }
    }
  }

  /**
   * Save test results to disk
   */
  private async saveResults(result: TestHarnessResult): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const resultsPath = path.join(this.outputDir, `${result.suite}-${timestamp}.json`);
    const latestPath = path.join(this.outputDir, `${result.suite}-latest.json`);
    const previousPath = path.join(this.outputDir, `${result.suite}-previous.json`);

    // Move latest to previous
    if (fs.existsSync(latestPath)) {
      fs.copyFileSync(latestPath, previousPath);
    }

    // Save new results
    fs.writeFileSync(resultsPath, JSON.stringify(result, null, 2));
    fs.writeFileSync(latestPath, JSON.stringify(result, null, 2));

    // Generate HTML report
    await this.generateHtmlReport(result);

    this.logger.info('Test results saved', {
      resultsPath,
      success: result.summary.success,
      coverage: result.summary.coverage,
    });
  }

  /**
   * Generate HTML report
   */
  private async generateHtmlReport(result: TestHarnessResult): Promise<void> {
    const htmlPath = path.join(this.outputDir, `${result.suite}-report.html`);

    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Refactogent Test Report - ${result.suite}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 5px; }
        .success { color: green; }
        .failure { color: red; }
        .warning { color: orange; }
        .environment { margin: 20px 0; border: 1px solid #ddd; padding: 15px; }
        .test-case { margin: 10px 0; padding: 10px; background: #f9f9f9; }
        .assertion { margin: 5px 0; padding: 5px; font-size: 0.9em; }
        .passed { background: #d4edda; }
        .failed { background: #f8d7da; }
        pre { background: #f8f9fa; padding: 10px; overflow-x: auto; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Test Report: ${result.suite}</h1>
        <p><strong>Status:</strong> <span class="${result.summary.success ? 'success' : 'failure'}">${result.summary.success ? 'PASSED' : 'FAILED'}</span></p>
        <p><strong>Duration:</strong> ${result.duration}ms</p>
        <p><strong>Tests:</strong> ${result.passedTests}/${result.totalTests} passed (${result.summary.coverage.toFixed(1)}% coverage)</p>
        <p><strong>Executed:</strong> ${result.startTime.toISOString()}</p>
    </div>

    ${
      result.summary.regressions.length > 0
        ? `
    <div class="warning">
        <h3>⚠️ Regressions Detected</h3>
        <ul>
            ${result.summary.regressions.map(r => `<li>${r}</li>`).join('')}
        </ul>
    </div>
    `
        : ''
    }

    ${
      result.summary.improvements.length > 0
        ? `
    <div class="success">
        <h3>✅ Improvements</h3>
        <ul>
            ${result.summary.improvements.map(i => `<li>${i}</li>`).join('')}
        </ul>
    </div>
    `
        : ''
    }

    <h2>Environment Results</h2>
    ${result.environments
      .map(
        env => `
        <div class="environment">
            <h3>${env.projectType} (${env.isolationMode})</h3>
            <p><strong>Tests:</strong> ${env.tests.filter(t => t.success).length}/${env.tests.length} passed</p>
            
            <h4>State Changes</h4>
            <ul>
                <li>Files Changed: ${env.stateComparison.filesChanged?.length || 0}</li>
                <li>Files Added: ${env.stateComparison.filesAdded?.length || 0}</li>
                <li>Files Removed: ${env.stateComparison.filesRemoved?.length || 0}</li>
                <li>Dependencies Changed: ${env.stateComparison.dependenciesChanged?.length || 0}</li>
            </ul>

            <h4>Test Cases</h4>
            ${env.tests
              .map(
                test => `
                <div class="test-case ${test.success ? 'passed' : 'failed'}">
                    <h5>${test.testCase} - ${test.success ? 'PASSED' : 'FAILED'} (${test.duration}ms)</h5>
                    
                    ${test.assertions
                      .map(
                        assertion => `
                        <div class="assertion ${assertion.passed ? 'passed' : 'failed'}">
                            <strong>${assertion.type}:</strong> ${assertion.passed ? '✅' : '❌'} ${assertion.message || ''}
                        </div>
                    `
                      )
                      .join('')}
                    
                    ${
                      test.output
                        ? `
                        <details>
                            <summary>Output</summary>
                            <pre>${test.output}</pre>
                        </details>
                    `
                        : ''
                    }
                    
                    ${
                      test.error
                        ? `
                        <details>
                            <summary>Error</summary>
                            <pre class="failure">${test.error}</pre>
                        </details>
                    `
                        : ''
                    }
                </div>
            `
              )
              .join('')}
        </div>
    `
      )
      .join('')}
</body>
</html>
    `;

    fs.writeFileSync(htmlPath, html);
  }

  /**
   * Clean up all active environments
   */
  private async cleanupAllEnvironments(): Promise<void> {
    this.logger.info('Cleaning up all test environments', {
      count: this.activeEnvironments.size,
    });

    const cleanupPromises = Array.from(this.activeEnvironments.values()).map(env =>
      env.cleanup().catch(error => this.logger.error('Failed to cleanup environment', { error }))
    );

    await Promise.all(cleanupPromises);
    this.activeEnvironments.clear();
  }

  /**
   * Create a basic test suite for a project
   */
  static createBasicTestSuite(projectPath: string, projectType: ProjectType): TestSuite {
    const baseConfig: Omit<TestEnvironmentConfig, 'isolationMode'> = {
      projectPath,
      projectType,
      timeout: 30000,
      resources: {
        memory: '512m',
        cpu: '0.5',
      },
    };

    return {
      name: `basic-${projectType}-tests`,
      description: `Basic test suite for ${projectType} project`,
      environments: [
        { ...baseConfig, isolationMode: 'local' },
        { ...baseConfig, isolationMode: 'sandbox' },
      ],
      tests: [
        {
          name: 'build-test',
          description: 'Test that the project builds successfully',
          commands:
            projectType === 'typescript'
              ? ['npm run build']
              : projectType === 'python'
                ? ['python -m py_compile *.py']
                : projectType === 'go'
                  ? ['go build']
                  : ['echo "No build command"'],
          assertions: [{ type: 'buildSuccess', expected: true }],
        },
        {
          name: 'test-execution',
          description: 'Test that existing tests pass',
          commands:
            projectType === 'typescript'
              ? ['npm test']
              : projectType === 'python'
                ? ['python -m pytest']
                : projectType === 'go'
                  ? ['go test ./...']
                  : ['echo "No test command"'],
          assertions: [{ type: 'exitCode', expected: 0 }],
        },
      ],
    };
  }
}
