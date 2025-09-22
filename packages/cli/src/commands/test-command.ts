import { BaseCommand } from './base.js';
import { TestHarness, TestSuite } from '../test-harness/test-harness.js';
import { ProjectAnalyzer } from '../utils/project.js';
import fs from 'fs';
import path from 'path';

interface TestOptions {
  project: string;
  suite?: string;
  isolation: 'local' | 'sandbox' | 'docker';
  timeout: number;
  output: string;
  generateSuite: boolean;
  verbose: boolean;
}

export class TestCommand extends BaseCommand {
  async execute(options: TestOptions): Promise<any> {
    try {
      this.logger.info('Starting test harness execution', {
        project: options.project,
        suite: options.suite,
        isolation: options.isolation,
      });

      // Analyze project
      const projectAnalyzer = new ProjectAnalyzer(this.logger);
      const projectInfo = await projectAnalyzer.analyzeProject(options.project);

      if (!projectInfo) {
        return this.failure('Could not analyze project structure');
      }

      // Initialize test harness
      const testHarness = new TestHarness(this.logger, options.output);

      let testSuite: TestSuite;

      if (options.suite) {
        // Load existing test suite
        testSuite = await this.loadTestSuite(options.suite);
      } else if (options.generateSuite) {
        // Generate a basic test suite
        testSuite = TestHarness.createBasicTestSuite(options.project, projectInfo.type);

        // Save the generated suite
        const suitePath = path.join(options.output, `${testSuite.name}.json`);
        fs.writeFileSync(suitePath, JSON.stringify(testSuite, null, 2));

        this.logger.info('Generated test suite', { suitePath });
      } else {
        // Create a minimal test suite
        testSuite = TestHarness.createBasicTestSuite(options.project, projectInfo.type);
      }

      // Update environment configurations with user options
      testSuite.environments = testSuite.environments.map(env => ({
        ...env,
        isolationMode: options.isolation,
        timeout: options.timeout,
      }));

      // Execute test suite
      const result = await testHarness.executeSuite(testSuite);

      // Display results
      console.log('\n🧪 Test Harness Results');
      console.log('========================');
      console.log(`Suite: ${result.suite}`);
      console.log(`Duration: ${result.duration}ms`);
      console.log(`Tests: ${result.passedTests}/${result.totalTests} passed`);
      console.log(`Coverage: ${result.summary.coverage.toFixed(1)}%`);
      console.log(`Status: ${result.summary.success ? '✅ PASSED' : '❌ FAILED'}`);

      if (result.summary.regressions.length > 0) {
        console.log('\n⚠️  Regressions:');
        result.summary.regressions.forEach(regression => {
          console.log(`  - ${regression}`);
        });
      }

      if (result.summary.improvements.length > 0) {
        console.log('\n✨ Improvements:');
        result.summary.improvements.forEach(improvement => {
          console.log(`  - ${improvement}`);
        });
      }

      // Show environment details if verbose
      if (options.verbose) {
        console.log('\n📊 Environment Details:');
        result.environments.forEach(env => {
          console.log(`\n${env.projectType} (${env.isolationMode}):`);
          console.log(
            `  Tests: ${env.tests.filter(t => t.success).length}/${env.tests.length} passed`
          );
          console.log(`  State changes:`);
          console.log(`    Files changed: ${env.stateComparison.filesChanged?.length || 0}`);
          console.log(`    Files added: ${env.stateComparison.filesAdded?.length || 0}`);
          console.log(`    Files removed: ${env.stateComparison.filesRemoved?.length || 0}`);
          console.log(
            `    Dependencies changed: ${env.stateComparison.dependenciesChanged?.length || 0}`
          );

          env.tests.forEach(test => {
            const status = test.success ? '✅' : '❌';
            console.log(`    ${status} ${test.testCase} (${test.duration}ms)`);

            if (!test.success && test.error) {
              console.log(`      Error: ${test.error}`);
            }
          });
        });
      }

      const reportPath = path.join(options.output, `${result.suite}-report.html`);
      console.log(`\n📄 Detailed report: ${reportPath}`);

      return this.success('Test harness completed', [reportPath], {
        passed: result.passedTests,
        failed: result.failedTests,
        coverage: result.summary.coverage,
        success: result.summary.success,
        reportPath,
      });
    } catch (error) {
      this.logger.error('Test harness execution failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return this.failure(
        `Test execution failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async loadTestSuite(suitePath: string): Promise<TestSuite> {
    if (!fs.existsSync(suitePath)) {
      throw new Error(`Test suite file not found: ${suitePath}`);
    }

    try {
      const content = fs.readFileSync(suitePath, 'utf8');
      const suite = JSON.parse(content) as TestSuite;

      // Validate suite structure
      if (!suite.name || !suite.environments || !suite.tests) {
        throw new Error('Invalid test suite format');
      }

      return suite;
    } catch (error) {
      throw new Error(
        `Failed to load test suite: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Generate a comprehensive test suite for a project
   */
  async generateComprehensiveTestSuite(
    projectPath: string,
    outputPath: string
  ): Promise<TestSuite> {
    const projectAnalyzer = new ProjectAnalyzer(this.logger);
    const projectInfo = await projectAnalyzer.analyzeProject(projectPath);

    if (!projectInfo) {
      throw new Error('Could not analyze project');
    }

    const suite: TestSuite = {
      name: `comprehensive-${projectInfo.type}-tests`,
      description: `Comprehensive test suite for ${projectInfo.type} project`,
      environments: [
        {
          projectPath,
          projectType: projectInfo.type,
          isolationMode: 'local',
          timeout: 60000,
          resources: { memory: '1g', cpu: '1.0' },
        },
        {
          projectPath,
          projectType: projectInfo.type,
          isolationMode: 'sandbox',
          timeout: 60000,
          resources: { memory: '1g', cpu: '1.0' },
        },
        {
          projectPath,
          projectType: projectInfo.type,
          isolationMode: 'docker',
          timeout: 120000,
          resources: { memory: '2g', cpu: '2.0' },
        },
      ],
      tests: [],
    };

    // Add basic tests
    suite.tests.push(
      {
        name: 'dependency-installation',
        description: 'Test that dependencies can be installed',
        commands: this.getDependencyInstallCommands(projectInfo.type),
        assertions: [
          { type: 'exitCode', expected: 0 },
          { type: 'fileExists', expected: this.getDependencyLockFile(projectInfo.type) },
        ],
      },
      {
        name: 'build-process',
        description: 'Test the build process',
        commands: this.getBuildCommands(projectInfo.type),
        assertions: [
          { type: 'buildSuccess', expected: true },
          { type: 'fileExists', expected: this.getBuildOutputDir(projectInfo.type) },
        ],
      },
      {
        name: 'test-execution',
        description: 'Run existing tests',
        commands: this.getTestCommands(projectInfo.type),
        assertions: [{ type: 'exitCode', expected: 0 }],
      }
    );

    // Add project-specific tests
    if (projectInfo.hasTests) {
      suite.tests.push({
        name: 'test-coverage',
        description: 'Check test coverage',
        commands: this.getCoverageCommands(projectInfo.type),
        assertions: [{ type: 'output', expected: /coverage|%/ }],
      });
    }

    if (projectInfo.hasConfig) {
      // Using hasConfig as a proxy for linting capability
      suite.tests.push({
        name: 'linting',
        description: 'Run linting checks',
        commands: this.getLintCommands(projectInfo.type),
        assertions: [{ type: 'exitCode', expected: 0 }],
      });
    }

    // Add safety tests
    suite.tests.push(
      {
        name: 'file-integrity',
        description: 'Verify no unexpected file changes',
        commands: ['echo "File integrity check"'],
        assertions: [{ type: 'noRegression', expected: true }],
      },
      {
        name: 'dependency-integrity',
        description: 'Verify dependency versions are stable',
        commands: ['echo "Dependency integrity check"'],
        assertions: [{ type: 'noRegression', expected: true }],
      }
    );

    // Save suite to file
    fs.writeFileSync(outputPath, JSON.stringify(suite, null, 2));

    return suite;
  }

  private getDependencyInstallCommands(projectType: string): string[] {
    switch (projectType) {
      case 'typescript':
        return ['npm install'];
      case 'python':
        return ['pip install -r requirements.txt'];
      case 'go':
        return ['go mod download'];
      default:
        return ['echo "No dependency install command"'];
    }
  }

  private getDependencyLockFile(projectType: string): string {
    switch (projectType) {
      case 'typescript':
        return 'package-lock.json';
      case 'python':
        return 'requirements.txt';
      case 'go':
        return 'go.sum';
      default:
        return 'package.json';
    }
  }

  private getBuildCommands(projectType: string): string[] {
    switch (projectType) {
      case 'typescript':
        return ['npm run build'];
      case 'python':
        return ['python -m py_compile *.py'];
      case 'go':
        return ['go build'];
      default:
        return ['echo "No build command"'];
    }
  }

  private getBuildOutputDir(projectType: string): string {
    switch (projectType) {
      case 'typescript':
        return 'dist';
      case 'python':
        return '__pycache__';
      case 'go':
        return '.'; // Go builds to current directory by default
      default:
        return 'build';
    }
  }

  private getTestCommands(projectType: string): string[] {
    switch (projectType) {
      case 'typescript':
        return ['npm test'];
      case 'python':
        return ['python -m pytest'];
      case 'go':
        return ['go test ./...'];
      default:
        return ['echo "No test command"'];
    }
  }

  private getCoverageCommands(projectType: string): string[] {
    switch (projectType) {
      case 'typescript':
        return ['npm run test:coverage'];
      case 'python':
        return ['python -m pytest --cov'];
      case 'go':
        return ['go test -cover ./...'];
      default:
        return ['echo "No coverage command"'];
    }
  }

  private getLintCommands(projectType: string): string[] {
    switch (projectType) {
      case 'typescript':
        return ['npm run lint'];
      case 'python':
        return ['flake8 .', 'black --check .'];
      case 'go':
        return ['go vet ./...', 'golint ./...'];
      default:
        return ['echo "No lint command"'];
    }
  }
}
