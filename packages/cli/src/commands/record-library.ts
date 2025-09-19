import { Command } from 'commander';
import { BaseCommand } from './base.js';
import { CommandResult, RefactoringMode } from '../types/index.js';
import { LibraryRecorder, LibraryRecordingOptions } from '../characterization/library-recorder.js';
import { Logger } from '../utils/logger.js';
import fs from 'fs';
import path from 'path';

interface RecordLibraryOptions {
  include?: string[];
  exclude?: string[];
  output?: string;
  format?: 'jest' | 'vitest';
  propertyTesting?: boolean;
  propertyLibrary?: 'fast-check' | 'jsverify';
  maxTestCases?: number;
  includePrivate?: boolean;
}

export class RecordLibraryCommand extends BaseCommand {
  private recorder: LibraryRecorder;

  constructor(logger: Logger) {
    super(logger);
    this.recorder = new LibraryRecorder(logger);
  }

  async execute(options: RecordLibraryOptions): Promise<CommandResult> {
    this.validateContext();

    const outputDir = options.output || path.join(this.context!.outputDir, 'library-characterization-tests');
    const format = options.format || 'jest';
    const projectPath = this.context!.projectInfo.path;

    this.logger.info('Starting library function characterization recording', {
      projectPath,
      format,
      outputDir,
      propertyTesting: options.propertyTesting,
    });

    try {
      // Prepare recording options
      const recordingOptions: LibraryRecordingOptions = {
        projectPath,
        includePatterns: options.include,
        excludePatterns: options.exclude,
        testFramework: format,
        propertyTesting: options.propertyTesting,
        propertyTestingLibrary: options.propertyLibrary,
        maxTestCases: options.maxTestCases || 5,
        includePrivate: options.includePrivate,
      };

      // Start recording
      const sessionId = await this.recorder.startRecording(recordingOptions);

      // Analyze functions
      const functions = await this.recorder.recordFunctions(recordingOptions);

      if (functions.length === 0) {
        return this.failure('No functions found to characterize. Check your include/exclude patterns.');
      }

      // Generate test cases
      const testCases = await this.recorder.generateTestCases(recordingOptions);

      // Stop recording and get session data
      const session = await this.recorder.stopRecording();

      // Generate characterization tests
      const generatedFiles = this.recorder.generateCharacterizationTests(session, {
        outputDir,
        testFramework: format,
        includePropertyTests: options.propertyTesting,
      });

      // Save session data
      const sessionFile = path.join(outputDir, `library-session-${sessionId}.json`);
      fs.writeFileSync(sessionFile, JSON.stringify(session, null, 2));
      generatedFiles.push(sessionFile);

      // Generate summary report
      const summaryReport = this.generateSummaryReport(session, generatedFiles, outputDir);
      const summaryFile = path.join(outputDir, 'library-recording-summary.md');
      fs.writeFileSync(summaryFile, summaryReport);
      generatedFiles.push(summaryFile);

      // Generate setup instructions
      const setupInstructions = this.generateSetupInstructions(session, outputDir);
      const setupFile = path.join(outputDir, 'SETUP.md');
      fs.writeFileSync(setupFile, setupInstructions);
      generatedFiles.push(setupFile);

      this.logger.success('Library characterization recording completed', {
        sessionId,
        functions: functions.length,
        testCases: testCases.length,
        files: generatedFiles.length,
      });

      return this.success(
        `Generated characterization tests for ${functions.length} functions with ${testCases.length} test cases`,
        generatedFiles,
        {
          sessionId,
          functions: functions.length,
          testCases: testCases.length,
          files: generatedFiles.length,
          outputDir,
        }
      );

    } catch (error) {
      return this.failure(`Library recording failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private generateSummaryReport(
    session: any,
    generatedFiles: string[],
    outputDir: string
  ): string {
    const duration = session.endTime - session.startTime;
    const fileGroups = this.groupFunctionsByFile(session.functions);
    const exportedFunctions = session.functions.filter((f: any) => f.isExported);
    const asyncFunctions = session.functions.filter((f: any) => f.isAsync);

    return `# Library Characterization Recording Summary

## Session Information
- **Session ID**: ${session.id}
- **Project Path**: ${session.projectPath}
- **Duration**: ${Math.round(duration / 1000)}s
- **Language**: ${session.metadata.language}
- **Test Framework**: ${session.metadata.testFramework}
- **Property Testing**: ${session.metadata.propertyTestingLibrary || 'Disabled'}

## Function Analysis
- **Total Functions**: ${session.functions.length}
- **Exported Functions**: ${exportedFunctions.length}
- **Async Functions**: ${asyncFunctions.length}
- **Files Analyzed**: ${Object.keys(fileGroups).length}
- **Test Cases Generated**: ${session.testCases.length}

## Functions by File
${Object.entries(fileGroups).map(([filePath, functions]: [string, any[]]) => `
### ${path.relative(session.projectPath, filePath)}
- **Functions**: ${functions.length}
- **Exported**: ${functions.filter(f => f.isExported).length}
- **Async**: ${functions.filter(f => f.isAsync).length}
- **Function Names**: ${functions.map(f => f.name).join(', ')}
`).join('')}

## Test Case Distribution
${this.getTestCaseDistribution(session.testCases).map(([strategy, count]) => `
- **${strategy}**: ${count} test cases`).join('')}

## Generated Files
${generatedFiles.map(file => `- ${path.relative(outputDir, file)}`).join('\n')}

## Usage Instructions

### Running Tests
\`\`\`bash
# For Jest tests
npm test -- --testPathPattern=characterization

# For Vitest tests
npx vitest library
\`\`\`

### Capturing Initial Behavior
The generated tests are characterization tests that capture current behavior:

1. **First Run**: Tests will log actual outputs for review
2. **Update Golden Data**: Modify \`test-data.json\` with expected outputs
3. **Subsequent Runs**: Tests will validate against captured behavior

### Property Testing
${session.metadata.propertyTestingLibrary ? `
Property-based tests use ${session.metadata.propertyTestingLibrary}:
\`\`\`bash
npm install --save-dev ${session.metadata.propertyTestingLibrary}
\`\`\`
` : 'Property testing is disabled. Enable with --property-testing flag.'}

### Updating Tests
When function behavior legitimately changes:
1. Review failing tests to understand changes
2. Update expected outputs in \`test-data.json\`
3. Re-run tests to verify new behavior

## Safety Notes
- These tests capture current function behavior
- They will fail if function behavior changes
- Review failures carefully - they might indicate breaking changes
- Some functions may have non-deterministic behavior
- Consider mocking external dependencies for consistent results

## Next Steps
1. Review generated test cases in \`test-data.json\`
2. Run tests to capture initial behavior
3. Update expected outputs based on review
4. Integrate tests into your CI/CD pipeline

Generated at: ${new Date().toISOString()}
`;
  }

  private generateSetupInstructions(session: any, outputDir: string): string {
    return `# Library Characterization Tests Setup

## Installation

### Dependencies
\`\`\`bash
# Install test framework
npm install --save-dev ${session.metadata.testFramework}

${session.metadata.propertyTestingLibrary ? `# Install property testing library
npm install --save-dev ${session.metadata.propertyTestingLibrary}` : ''}
\`\`\`

### Test Configuration
Add to your \`package.json\`:
\`\`\`json
{
  "scripts": {
    "test:characterization": "${session.metadata.testFramework === 'jest' ? 'jest' : 'vitest'} ${path.relative(session.projectPath, outputDir)}",
    "test:char": "npm run test:characterization"
  }
}
\`\`\`

## Initial Setup Process

### 1. Review Generated Functions
Check \`library-recording-summary.md\` to see which functions were analyzed:
- ${session.functions.length} functions found
- ${session.functions.filter((f: any) => f.isExported).length} exported functions
- ${session.testCases.length} test cases generated

### 2. Run Initial Tests
\`\`\`bash
npm run test:characterization
\`\`\`

This will:
- Execute all test cases
- Log actual outputs to console
- Show which tests need expected values

### 3. Capture Expected Behavior
1. Review the console output from test runs
2. For each test case, decide if the output is correct
3. Update \`test-data.json\` with expected outputs:

\`\`\`json
{
  "id": "test-1",
  "functionName": "myFunction",
  "inputs": [1, 2],
  "expectedOutput": 3,
  "expectsError": false,
  "metadata": {
    "generationStrategy": "boundary",
    "description": "Boundary value test case 1"
  }
}
\`\`\`

### 4. Validate Tests
\`\`\`bash
npm run test:characterization
\`\`\`

All tests should now pass with the captured expected values.

## Maintenance

### Adding New Test Cases
1. Edit \`test-data.json\` to add new test cases
2. Follow the existing format
3. Run tests to validate

### Handling Function Changes
When functions are modified:
1. Tests will fail showing actual vs expected
2. Review changes to ensure they're intentional
3. Update expected values if changes are correct
4. Re-run tests to validate

### Property Testing
${session.metadata.propertyTestingLibrary ? `
Property-based tests automatically generate inputs and test invariants:
- Tests run with many random inputs
- Failures show minimal failing cases
- Useful for finding edge cases
` : `
To enable property testing:
1. Re-run with \`--property-testing\` flag
2. Install property testing library
3. Review generated property tests
`}

## Integration with CI/CD

Add to your CI pipeline:
\`\`\`yaml
- name: Run Characterization Tests
  run: npm run test:characterization
\`\`\`

This ensures function behavior doesn't change unexpectedly.

## Troubleshooting

### Tests Fail on First Run
This is expected! Characterization tests need initial behavior capture.

### Non-Deterministic Functions
For functions with random or time-based behavior:
1. Mock external dependencies
2. Use tolerance in comparisons
3. Focus on testing invariants rather than exact outputs

### Large Test Data
If \`test-data.json\` becomes large:
1. Split into multiple files
2. Use test case filtering
3. Focus on critical functions

Generated at: ${new Date().toISOString()}
`;
  }

  private groupFunctionsByFile(functions: any[]): Record<string, any[]> {
    const groups: Record<string, any[]> = {};
    
    for (const func of functions) {
      if (!groups[func.filePath]) {
        groups[func.filePath] = [];
      }
      groups[func.filePath].push(func);
    }
    
    return groups;
  }

  private getTestCaseDistribution(testCases: any[]): [string, number][] {
    const distribution: Record<string, number> = {};
    
    for (const testCase of testCases) {
      const strategy = testCase.metadata.generationStrategy;
      distribution[strategy] = (distribution[strategy] || 0) + 1;
    }
    
    return Object.entries(distribution);
  }
}

/**
 * Create the record-library command for the CLI
 */
export function createRecordLibraryCommand(): Command {
  const command = new Command('record-library')
    .description('Record library functions and generate characterization tests')
    .option('--include <patterns...>', 'File patterns to include (e.g., "src/**/*.ts")')
    .option('--exclude <patterns...>', 'File patterns to exclude (e.g., "**/*.test.ts")')
    .option('--output <dir>', 'Output directory for generated tests')
    .option('--format <format>', 'Test framework: jest | vitest', 'jest')
    .option('--property-testing', 'Enable property-based testing')
    .option('--property-library <lib>', 'Property testing library: fast-check | jsverify', 'fast-check')
    .option('--max-test-cases <n>', 'Maximum test cases per function', '5')
    .option('--include-private', 'Include non-exported functions')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.parent?.parent?.opts() || {};
      
      // Initialize CLI context
      const logger = new Logger(globalOpts.verbose);
      
      try {
        // Create command instance
        const recordCommand = new RecordLibraryCommand(logger);
        
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
            modesAllowed: ['organize-only', 'name-hygiene', 'tests-first', 'micro-simplify'] as RefactoringMode[],
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
            }
          },
          projectInfo: { 
            path: projectPath, 
            type: 'mixed' as const, 
            languages: ['typescript', 'javascript'], 
            hasTests: true, 
            hasConfig: false 
          },
          outputDir,
          verbose: globalOpts.verbose || false,
        };
        
        recordCommand.setContext(context);
        
        // Execute command
        const result = await recordCommand.execute({
          include: opts.include,
          exclude: opts.exclude,
          output: opts.output,
          format: opts.format,
          propertyTesting: opts.propertyTesting,
          propertyLibrary: opts.propertyLibrary,
          maxTestCases: parseInt(opts.maxTestCases, 10),
          includePrivate: opts.includePrivate,
        });
        
        if (result.success) {
          console.log(`✅ ${result.message}`);
          if (result.artifacts) {
            console.log(`📁 Generated files: ${result.artifacts.length} files`);
            console.log(`📂 Output directory: ${result.data?.outputDir}`);
          }
          if (result.data) {
            console.log(`🎬 Session: ${result.data.sessionId}`);
            console.log(`🔧 Functions: ${result.data.functions}`);
            console.log(`🧪 Test Cases: ${result.data.testCases}`);
          }
        } else {
          console.error(`❌ ${result.message}`);
          process.exit(1);
        }
      } catch (error) {
        logger.error('Library recording failed', { error });
        console.error(`❌ Library recording failed: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    });

  return command;
}