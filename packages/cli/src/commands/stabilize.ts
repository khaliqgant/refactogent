import { BaseCommand } from './base.js';
import { CommandResult } from '../types/index.js';

interface StabilizeOptions {
  routes: string;
  cli: string;
}

export class StabilizeCommand extends BaseCommand {
  async execute(options: StabilizeOptions): Promise<CommandResult> {
    this.validateContext();

    this.logger.info('Starting project stabilization');

    const routeCount = parseInt(options.routes, 10);
    const cliCount = parseInt(options.cli, 10);

    this.logger.debug('Stabilization parameters', {
      routes: routeCount,
      cli: cliCount,
      projectType: this.context!.projectInfo.type,
    });

    // Generate stabilization report
    const report = this.generateStabilizationReport(routeCount, cliCount);
    const reportPath = this.writeOutput('stabilize-report.md', report);

    // Generate characterization test plan
    const testPlan = this.generateTestPlan(routeCount, cliCount);
    const testPlanPath = this.writeOutput('test-plan.json', JSON.stringify(testPlan, null, 2));

    this.logger.success('Project stabilization analysis complete');

    return this.success(
      `Generated stabilization plan for ${routeCount} routes and ${cliCount} CLI commands`,
      [reportPath, testPlanPath],
      { routeCount, cliCount, projectType: this.context!.projectInfo.type }
    );
  }

  private generateStabilizationReport(routeCount: number, cliCount: number): string {
    const { projectInfo, config } = this.context!;

    return `# Project Stabilization Report

## Project Analysis
- **Path**: ${projectInfo.path}
- **Type**: ${projectInfo.type}
- **Languages**: ${projectInfo.languages.join(', ')}
- **Has Tests**: ${projectInfo.hasTests ? 'Yes' : 'No'}
- **Has Config**: ${projectInfo.hasConfig ? 'Yes' : 'No'}

## Stabilization Plan
- **HTTP Routes to Characterize**: ${routeCount}
- **CLI Commands to Characterize**: ${cliCount}
- **Safety Gates Enabled**: ${config.gates.requireCharacterizationTests ? 'Yes' : 'No'}

## Next Steps
1. Review the generated test plan in \`test-plan.json\`
2. Run characterization tests to establish baseline behavior
3. Verify all safety gates are configured correctly
4. Proceed with refactoring operations

## Safety Considerations
- Characterization tests will capture current behavior
- No code changes will be made during stabilization
- All tests must pass before refactoring begins
- Coverage baseline will be established

Generated at: ${new Date().toISOString()}
`;
  }

  private generateTestPlan(routeCount: number, cliCount: number) {
    const { projectInfo } = this.context!;

    const plan = {
      projectType: projectInfo.type,
      languages: projectInfo.languages,
      characterizationTests: {
        http: {
          enabled: routeCount > 0,
          routesToTest: routeCount,
          methods: ['GET', 'POST', 'PUT', 'DELETE'],
          status: 'planned',
        },
        cli: {
          enabled: cliCount > 0,
          commandsToTest: cliCount,
          status: 'planned',
        },
        library: {
          enabled: true,
          status: 'planned',
        },
      },
      safetyChecks: {
        buildValidation: true,
        testExecution: true,
        coverageAnalysis: true,
        semanticEquivalence: routeCount > 0,
      },
      timeline: {
        created: new Date().toISOString(),
        estimatedDuration: '15-30 minutes',
        phases: [
          'Project analysis',
          'Test generation',
          'Baseline establishment',
          'Safety validation',
        ],
      },
    };

    return plan;
  }
}
