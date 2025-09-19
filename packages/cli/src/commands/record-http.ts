import { Command } from 'commander';
import { BaseCommand } from './base.js';
import { CommandResult, RefactoringMode } from '../types/index.js';
import { HTTPRecorder, RecordingOptions } from '../characterization/http-recorder.js';
import { Logger } from '../utils/logger.js';
import fs from 'fs';
import path from 'path';

interface RecordHTTPOptions {
  baseUrl: string;
  routes?: string[];
  output?: string;
  format?: 'jest' | 'playwright';
  timeout?: number;
  maxInteractions?: number;
  auth?: {
    type: 'bearer' | 'basic' | 'cookie';
    token?: string;
    username?: string;
    password?: string;
    loginUrl?: string;
  };
  tolerance?: {
    ignoreFields?: string[];
    ignoreHeaders?: string[];
  };
}

export class RecordHTTPCommand extends BaseCommand {
  private recorder: HTTPRecorder;

  constructor(logger: Logger) {
    super(logger);
    this.recorder = new HTTPRecorder(logger);
  }

  async execute(options: RecordHTTPOptions): Promise<CommandResult> {
    this.validateContext();

    const outputDir = options.output || path.join(this.context!.outputDir, 'characterization-tests');
    const routes = options.routes || ['/'];
    const format = options.format || 'jest';

    this.logger.info('Starting HTTP characterization recording', {
      baseUrl: options.baseUrl,
      routes: routes.length,
      format,
      outputDir,
    });

    try {
      // Prepare recording options
      const recordingOptions: RecordingOptions = {
        baseUrl: options.baseUrl,
        routes,
        timeout: options.timeout || 30000,
        maxInteractions: options.maxInteractions || 100,
        ignorePatterns: [
          '.*\\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf)$',
          '.*/static/.*',
          '.*/assets/.*',
        ],
        tolerance: options.tolerance,
      };

      // Set up authentication if provided
      if (options.auth) {
        recordingOptions.authentication = {
          type: options.auth.type,
          credentials: {
            ...(options.auth.token && { token: options.auth.token }),
            ...(options.auth.username && { username: options.auth.username }),
            ...(options.auth.password && { password: options.auth.password }),
          },
          ...(options.auth.loginUrl && { loginUrl: options.auth.loginUrl }),
        };
      }

      // Start recording
      const sessionId = await this.recorder.startRecording(recordingOptions);

      // Record routes
      const interactions = await this.recorder.recordRoutes(routes, {
        timeout: options.timeout,
      });

      // Stop recording and get session data
      const session = await this.recorder.stopRecording();

      // Generate golden tests
      const generatedFiles = this.recorder.generateGoldenTests(session, {
        outputDir,
        testFramework: format,
        tolerance: options.tolerance,
      });

      // Save session data
      const sessionFile = path.join(outputDir, `session-${sessionId}.json`);
      fs.writeFileSync(sessionFile, JSON.stringify(session, null, 2));
      generatedFiles.push(sessionFile);

      // Generate summary report
      const summaryReport = this.generateSummaryReport(session, generatedFiles, outputDir);
      const summaryFile = path.join(outputDir, 'recording-summary.md');
      fs.writeFileSync(summaryFile, summaryReport);
      generatedFiles.push(summaryFile);

      this.logger.success('HTTP characterization recording completed', {
        sessionId,
        interactions: interactions.length,
        routes: routes.length,
        files: generatedFiles.length,
      });

      return this.success(
        `Recorded ${interactions.length} HTTP interactions across ${routes.length} routes`,
        generatedFiles,
        {
          sessionId,
          interactions: interactions.length,
          routes: routes.length,
          files: generatedFiles.length,
          outputDir,
        }
      );

    } catch (error) {
      return this.failure(`HTTP recording failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private generateSummaryReport(
    session: any,
    generatedFiles: string[],
    outputDir: string
  ): string {
    const duration = session.endTime - session.startTime;
    const routeGroups = this.groupInteractionsByRoute(session.interactions);

    return `# HTTP Characterization Recording Summary

## Session Information
- **Session ID**: ${session.id}
- **Base URL**: ${session.baseUrl}
- **Duration**: ${Math.round(duration / 1000)}s
- **Total Interactions**: ${session.interactions.length}
- **Routes Recorded**: ${Object.keys(routeGroups).length}

## Recorded Routes
${Object.entries(routeGroups).map(([route, interactions]: [string, any[]]) => `
### ${route}
- **Interactions**: ${interactions.length}
- **Methods**: ${[...new Set(interactions.map(i => i.request.method))].join(', ')}
- **Status Codes**: ${[...new Set(interactions.map(i => i.response.status))].join(', ')}
- **Avg Duration**: ${Math.round(interactions.reduce((sum, i) => sum + i.response.duration, 0) / interactions.length)}ms
`).join('')}

## Generated Files
${generatedFiles.map(file => `- ${path.relative(outputDir, file)}`).join('\n')}

## Usage Instructions

### Running Tests
\`\`\`bash
# For Jest tests
npm test -- --testPathPattern=characterization

# For Playwright tests
npx playwright test characterization
\`\`\`

### Updating Golden Files
When legitimate changes are made to the API:
1. Review the failing tests to understand what changed
2. If changes are expected, update the golden files:
   \`\`\`bash
   # Re-record the session
   refactogent record-http --base-url ${session.baseUrl} --output ${path.relative(process.cwd(), outputDir)}
   \`\`\`

### Tolerance Configuration
The tests include tolerance for dynamic fields. You can customize this by:
- Adding field names to ignore in the \`ignoreFields\` array
- Modifying the \`normalizeResponse\` function for custom logic

## Safety Notes
- These tests capture the current behavior of your API
- They will fail if the API behavior changes
- Review failures carefully - they might indicate breaking changes
- Update tests only after confirming changes are intentional

Generated at: ${new Date().toISOString()}
`;
  }

  private groupInteractionsByRoute(interactions: any[]): Record<string, any[]> {
    const groups: Record<string, any[]> = {};
    
    for (const interaction of interactions) {
      const route = interaction.route;
      if (!groups[route]) {
        groups[route] = [];
      }
      groups[route].push(interaction);
    }
    
    return groups;
  }
}

/**
 * Create the record-http command for the CLI
 */
export function createRecordHTTPCommand(): Command {
  const command = new Command('record-http')
    .description('Record HTTP interactions and generate characterization tests')
    .requiredOption('--base-url <url>', 'Base URL of the application to record')
    .option('--routes <routes...>', 'Specific routes to record (default: ["/"])')
    .option('--output <dir>', 'Output directory for generated tests')
    .option('--format <format>', 'Test framework: jest | playwright', 'jest')
    .option('--timeout <ms>', 'Request timeout in milliseconds', '30000')
    .option('--max-interactions <n>', 'Maximum interactions to record', '100')
    .option('--auth-type <type>', 'Authentication type: bearer | basic | cookie')
    .option('--auth-token <token>', 'Bearer token for authentication')
    .option('--auth-username <username>', 'Username for basic auth')
    .option('--auth-password <password>', 'Password for basic auth')
    .option('--auth-login-url <url>', 'Login URL for cookie auth')
    .option('--ignore-fields <fields...>', 'JSON fields to ignore in comparisons')
    .option('--ignore-headers <headers...>', 'HTTP headers to ignore in comparisons')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.parent?.parent?.opts() || {};
      
      // Initialize CLI context
      const logger = new Logger(globalOpts.verbose);
      
      try {
        // Create command instance
        const recordCommand = new RecordHTTPCommand(logger);
        
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
        
        // Prepare authentication options
        let auth: any = undefined;
        if (opts.authType) {
          auth = {
            type: opts.authType,
            token: opts.authToken,
            username: opts.authUsername,
            password: opts.authPassword,
            loginUrl: opts.authLoginUrl,
          };
        }

        // Prepare tolerance options
        const tolerance: any = {};
        if (opts.ignoreFields) {
          tolerance.ignoreFields = opts.ignoreFields;
        }
        if (opts.ignoreHeaders) {
          tolerance.ignoreHeaders = opts.ignoreHeaders;
        }

        // Execute command
        const result = await recordCommand.execute({
          baseUrl: opts.baseUrl,
          routes: opts.routes,
          output: opts.output,
          format: opts.format,
          timeout: parseInt(opts.timeout, 10),
          maxInteractions: parseInt(opts.maxInteractions, 10),
          auth,
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
            console.log(`📊 Interactions: ${result.data.interactions}`);
            console.log(`🛣️  Routes: ${result.data.routes}`);
          }
        } else {
          console.error(`❌ ${result.message}`);
          process.exit(1);
        }
      } catch (error) {
        logger.error('HTTP recording failed', { error });
        console.error(`❌ HTTP recording failed: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    });

  return command;
}