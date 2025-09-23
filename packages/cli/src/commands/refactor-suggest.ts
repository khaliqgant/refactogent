import { Command } from 'commander';
import { Logger } from '../utils/logger.js';
import { SuggestionEngine, SuggestionEngineOptions } from '../refactoring/suggestion-engine.js';
import { ASTService } from '../analysis/ast-service.js';
import { CoverageService } from '../analysis/coverage-service.js';
import { ProjectAnalyzer } from '../utils/project.js';
import chalk from 'chalk';

// Constants
const DEFAULT_MAX_SUGGESTIONS = 10;
const DEFAULT_SKILL_LEVEL = 'intermediate';
const DEFAULT_FORMAT = 'detailed';
const DEFAULT_PRIORITIZE = 'safety';

// Mock safety score constants
const MOCK_SAFETY_SCORES = {
  OVERALL: 75,
  COMPLEXITY: {
    score: 70,
    weight: 0.25,
    details: 'Moderate complexity',
    riskLevel: 'medium' as const,
  },
  TEST_COVERAGE: { score: 80, weight: 0.3, details: 'Good coverage', riskLevel: 'low' as const },
  API_EXPOSURE: {
    score: 85,
    weight: 0.2,
    details: 'Reasonable API surface',
    riskLevel: 'low' as const,
  },
  DEPENDENCY_RISK: {
    score: 90,
    weight: 0.15,
    details: 'Low dependency risk',
    riskLevel: 'low' as const,
  },
  CHANGE_FREQUENCY: {
    score: 95,
    weight: 0.1,
    details: 'Stable changes',
    riskLevel: 'low' as const,
  },
} as const;

interface RefactorSuggestOptions {
  output?: string;
  format?: 'json' | 'table' | 'detailed';
  prioritize?: 'safety' | 'impact' | 'effort' | 'readiness';
  maxSuggestions?: string;
  skillLevel?: 'beginner' | 'intermediate' | 'advanced';
  includeRisky?: boolean;
  quickWinsOnly?: boolean;
  categories?: string;
  focusAreas?: string;
}

export function createRefactorSuggestCommand(): Command {
  const command = new Command('refactor-suggest')
    .description('Generate intelligent refactoring suggestions for your codebase')
    .argument('[path]', 'Path to analyze (defaults to current directory)', '.')
    .option('-o, --output <file>', 'Output file for results')
    .option('-f, --format <format>', 'Output format (json|table|detailed)', DEFAULT_FORMAT)
    .option(
      '-p, --prioritize <criteria>',
      'Prioritization criteria (safety|impact|effort|readiness)',
      DEFAULT_PRIORITIZE
    )
    .option(
      '-m, --max-suggestions <number>',
      'Maximum number of suggestions',
      DEFAULT_MAX_SUGGESTIONS.toString()
    )
    .option(
      '-s, --skill-level <level>',
      'Skill level (beginner|intermediate|advanced)',
      DEFAULT_SKILL_LEVEL
    )
    .option('--include-risky', 'Include risky refactoring suggestions')
    .option('--quick-wins-only', 'Show only quick win opportunities')
    .option('-c, --categories <categories>', 'Comma-separated list of categories to focus on')
    .option(
      '--focus-areas <areas>',
      'Comma-separated list of file patterns or directories to focus on'
    )
    .action(async (path: string, options: RefactorSuggestOptions) => {
      // Suppress logging for JSON output to avoid mixing with JSON
      const logger = new Logger(options.format !== 'json');

      try {
        await executeRefactorSuggest(path, options, logger);
      } catch (error) {
        if (options.format === 'json') {
          // For JSON output, write error to stderr and exit with proper JSON
          console.error(
            JSON.stringify({ error: error instanceof Error ? error.message : String(error) })
          );
          process.exit(1);
        } else {
          logger.error('Failed to generate refactoring suggestions', { error });
          process.exit(1);
        }
      }
    });

  return command;
}

async function executeRefactorSuggest(
  projectPath: string,
  options: RefactorSuggestOptions,
  logger: Logger
): Promise<void> {
  // Validate inputs
  if (!projectPath || typeof projectPath !== 'string') {
    throw new Error('Valid project path is required');
  }

  // Resolve and validate project path
  const fs = await import('fs/promises');
  const path = await import('path');
  const resolvedPath = path.resolve(projectPath);

  try {
    const stats = await fs.stat(resolvedPath);
    if (!stats.isDirectory()) {
      throw new Error(`Project path must be a directory: ${resolvedPath}`);
    }
  } catch (error) {
    throw new Error(`Cannot access project path: ${resolvedPath}`);
  }

  if (options.format !== 'json') {
    logger.info('Starting refactoring suggestion analysis', {
      projectPath: resolvedPath,
      options,
    });
  }

  // Analyze project
  const projectAnalyzer = new ProjectAnalyzer(
    options.format === 'json' ? new Logger(false) : logger
  );
  const projectInfo = await projectAnalyzer.analyzeProject(resolvedPath);

  // Initialize services with silent logger for JSON output
  const serviceLogger = options.format === 'json' ? new Logger(false) : logger;
  const astService = new ASTService(serviceLogger);
  // const safetyService = new SafetyService(serviceLogger);
  const coverageService = new CoverageService(serviceLogger);
  const suggestionEngine = new SuggestionEngine(serviceLogger);

  // Analyze project AST
  if (options.format !== 'json') {
    logger.info('Analyzing project structure...');
  }
  const projectType = projectInfo.type;
  let projectAST;

  try {
    projectAST = await astService.analyzeProject(resolvedPath, projectType);
  } catch (error) {
    logger.error('Failed to analyze project structure', { error });
    throw new Error(
      `AST analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }

  // Calculate safety score (mock for now)
  if (options.format !== 'json') {
    logger.info('Calculating safety scores...');
  }
  const safetyScore = {
    overall: MOCK_SAFETY_SCORES.OVERALL,
    complexity: MOCK_SAFETY_SCORES.COMPLEXITY,
    testCoverage: MOCK_SAFETY_SCORES.TEST_COVERAGE,
    apiExposure: MOCK_SAFETY_SCORES.API_EXPOSURE,
    dependencyRisk: MOCK_SAFETY_SCORES.DEPENDENCY_RISK,
    changeFrequency: MOCK_SAFETY_SCORES.CHANGE_FREQUENCY,
    recommendations: [],
  };

  // Get coverage report (optional)
  let coverageReport;
  try {
    if (options.format !== 'json') {
      logger.info('Analyzing test coverage...');
    }
    const coverageResult = await coverageService.analyzeCoverageWithIntegration(
      resolvedPath,
      projectType
    );
    coverageReport = coverageResult.report;
  } catch (error) {
    if (options.format !== 'json') {
      logger.warn('Could not analyze test coverage', {
        error: error instanceof Error ? error.message : 'Unknown error',
        projectType,
      });
    }
  }

  // Validate and configure suggestion engine options
  const maxSuggestions = options.maxSuggestions
    ? parseInt(options.maxSuggestions, 10)
    : DEFAULT_MAX_SUGGESTIONS;
  if (isNaN(maxSuggestions) || maxSuggestions < 1 || maxSuggestions > 100) {
    throw new Error('Max suggestions must be a number between 1 and 100');
  }

  const validPriorities = ['safety', 'impact', 'effort', 'readiness'] as const;
  const validSkillLevels = ['beginner', 'intermediate', 'advanced'] as const;
  const validFormats = ['json', 'table', 'detailed'] as const;

  if (options.prioritize && !validPriorities.includes(options.prioritize as any)) {
    throw new Error(`Invalid prioritize option. Must be one of: ${validPriorities.join(', ')}`);
  }

  if (options.skillLevel && !validSkillLevels.includes(options.skillLevel as any)) {
    throw new Error(`Invalid skill level. Must be one of: ${validSkillLevels.join(', ')}`);
  }

  if (options.format && !validFormats.includes(options.format as any)) {
    throw new Error(`Invalid format. Must be one of: ${validFormats.join(', ')}`);
  }

  const engineOptions: SuggestionEngineOptions = {
    prioritizeBy: (options.prioritize as any) || DEFAULT_PRIORITIZE,
    maxSuggestions,
    skillLevel: (options.skillLevel as any) || DEFAULT_SKILL_LEVEL,
    includeExperimental: options.includeRisky || false,
    timeConstraint: options.quickWinsOnly ? 'quick_wins' : 'moderate',
  };

  if (options.categories) {
    engineOptions.focusAreas = options.categories.split(',').map(c => c.trim());
  }

  if (options.focusAreas) {
    engineOptions.focusAreas = options.focusAreas.split(',').map(a => a.trim());
  }

  // Extract the first ProjectAST from the unified analysis
  const projectASTMap = projectAST.astByLanguage;
  const firstProjectAST = projectASTMap.values().next().value;

  if (!firstProjectAST) {
    throw new Error('No AST data found for project');
  }

  // Generate suggestions
  if (options.format !== 'json') {
    logger.info('Generating refactoring suggestions...');
  }
  const suggestionResult = await suggestionEngine.generateSuggestions(
    firstProjectAST,
    safetyScore,
    coverageReport,
    engineOptions
  );

  // Output results
  await outputResults(suggestionResult, options, logger);

  if (options.format !== 'json') {
    logger.info('Refactoring suggestion analysis completed', {
      totalSuggestions: suggestionResult.summary.totalSuggestions,
      readySuggestions: suggestionResult.summary.readySuggestions,
      quickWins: suggestionResult.summary.quickWins,
    });
  }
}

async function outputResults(
  result: any,
  options: RefactorSuggestOptions,
  logger: Logger
): Promise<void> {
  const { suggestions, summary, quickWins, recommendations, roadmap } = result;

  if (options.format === 'json') {
    const output = JSON.stringify(result, null, 2);

    if (options.output) {
      try {
        const fs = await import('fs/promises');
        const path = await import('path');

        // Ensure the directory exists
        const outputDir = path.dirname(options.output);
        await fs.mkdir(outputDir, { recursive: true });

        // Write the file
        await fs.writeFile(options.output, output, 'utf8');

        // Don't log to console when outputting JSON to file
      } catch (error) {
        // If file writing fails, output to console instead
        console.error(
          `Error writing to file ${options.output}: ${error instanceof Error ? error.message : String(error)}`
        );
        console.log(output);
      }
    } else {
      console.log(output);
    }
    return;
  }

  // Console output for table and detailed formats
  console.log(chalk.bold.blue('\\n🔧 Refactoring Suggestions Analysis\\n'));

  // Summary
  console.log(chalk.bold('📊 Summary:'));
  console.log(`  Total Suggestions: ${chalk.yellow(summary.totalSuggestions)}`);
  console.log(`  Ready to Implement: ${chalk.green(summary.readySuggestions)}`);
  console.log(`  Quick Wins: ${chalk.cyan(summary.quickWins)}`);
  console.log(`  High Impact: ${chalk.magenta(summary.highImpactSuggestions)}`);
  console.log(`  Average Impact Score: ${chalk.yellow(summary.averageImpact.toFixed(1))}/100`);
  console.log(`  Average Risk Score: ${chalk.red(summary.averageRisk.toFixed(1))}/100`);
  console.log(`  Estimated Total Hours: ${chalk.blue(summary.estimatedTotalHours.toFixed(1))}\\n`);

  // Quick Wins
  if (quickWins.length > 0) {
    console.log(chalk.bold.green('⚡ Quick Wins (≤ 1 day, high safety):'));
    quickWins.forEach((suggestion: any, index: number) => {
      const { opportunity, impact, timeline } = suggestion;
      console.log(`  ${index + 1}. ${chalk.cyan(opportunity.pattern.name)}`);
      console.log(`     ${opportunity.description}`);
      console.log(`     📍 ${opportunity.location.filePath}:${opportunity.location.startLine}`);
      console.log(`     💪 Impact: ${chalk.yellow(impact.overallBenefit.toFixed(1))}/100`);
      console.log(`     ⏱️  Time: ${chalk.blue(timeline.estimatedDays)} days`);
      console.log(`     🛡️  Safety: ${chalk.green(opportunity.safetyRating)}/100\\n`);
    });
  }

  // Top Suggestions (detailed format)
  if (options.format === 'detailed' && suggestions.length > 0) {
    console.log(chalk.bold('🎯 Top Refactoring Suggestions:\\n'));

    const topSuggestions = suggestions.slice(0, Math.min(5, suggestions.length));

    topSuggestions.forEach((suggestion: any, index: number) => {
      const { opportunity, priority, readiness, impact, implementation } = suggestion;

      console.log(chalk.bold(`${index + 1}. ${opportunity.pattern.name}`));
      console.log(`   ${opportunity.description}`);
      console.log(
        `   📍 Location: ${opportunity.location.filePath}:${opportunity.location.startLine}-${opportunity.location.endLine}`
      );
      console.log(`   🏷️  Category: ${chalk.blue(opportunity.pattern.category)}`);
      console.log(`   ⚡ Priority: ${getPriorityColor(priority)(priority.toUpperCase())}`);
      console.log(`   🎯 Confidence: ${chalk.yellow(opportunity.confidence)}/100`);
      console.log(`   🛡️  Safety Rating: ${chalk.green(opportunity.safetyRating)}/100`);
      console.log(`   💪 Impact Score: ${chalk.magenta(impact.overallBenefit.toFixed(1))}/100`);
      console.log(`   ⏱️  Estimated Effort: ${chalk.blue(opportunity.estimatedEffort)}`);
      console.log(`   📅 Timeline: ${chalk.cyan(implementation.totalEstimatedHours)} hours`);

      // Readiness status
      if (readiness.isReady) {
        console.log(`   ✅ Status: ${chalk.green('Ready to implement')}`);
      } else {
        console.log(`   ⚠️  Status: ${chalk.red('Blocked')} - ${readiness.blockers.join(', ')}`);
      }

      // Benefits
      if (opportunity.pattern.benefits.length > 0) {
        console.log(`   📈 Benefits: ${opportunity.pattern.benefits.join(', ')}`);
      }

      // Risks
      if (opportunity.risks.length > 0) {
        const highRisks = opportunity.risks.filter(
          (r: any) => r.severity === 'high' || r.severity === 'critical'
        );
        if (highRisks.length > 0) {
          console.log(`   ⚠️  Risks: ${highRisks.map((r: any) => r.description).join(', ')}`);
        }
      }

      console.log(''); // Empty line between suggestions
    });
  }

  // Recommendations
  if (recommendations.length > 0) {
    console.log(chalk.bold.yellow('💡 Recommendations:'));
    recommendations.forEach((rec: string, index: number) => {
      console.log(`  ${index + 1}. ${rec}`);
    });
    console.log('');
  }

  // Roadmap
  if (roadmap.phases.length > 0) {
    console.log(chalk.bold.blue('🗺️  Refactoring Roadmap:'));
    roadmap.phases.forEach((phase: any, index: number) => {
      console.log(`  Phase ${index + 1}: ${chalk.cyan(phase.name)} (${phase.estimatedDays} days)`);
      console.log(`    ${phase.description}`);
      console.log(`    Suggestions: ${phase.suggestions.length}`);
      if (phase.prerequisites.length > 0) {
        console.log(`    Prerequisites: ${phase.prerequisites.join(', ')}`);
      }
      console.log('');
    });
  }

  // Next Steps
  console.log(chalk.bold.green('🚀 Next Steps:'));
  if (quickWins.length > 0) {
    console.log(`  1. Start with quick wins: ${quickWins.length} opportunities available`);
    console.log(`  2. Create a backup/commit before making changes`);
    console.log(`  3. Implement the highest priority suggestion first`);
    console.log(`  4. Run tests after each refactoring to ensure behavior is preserved`);
  } else if (summary.readySuggestions > 0) {
    console.log(`  1. Review the ${summary.readySuggestions} ready suggestions`);
    console.log(`  2. Address any blockers for higher-impact suggestions`);
    console.log(`  3. Start with the safest, highest-confidence opportunities`);
  } else {
    console.log(`  1. Address blockers preventing refactoring (test coverage, syntax errors)`);
    console.log(`  2. Focus on improving code quality fundamentals first`);
    console.log(`  3. Re-run analysis after improvements`);
  }

  if (options.output) {
    const fs = await import('fs/promises');
    const output = JSON.stringify(result, null, 2);
    await fs.writeFile(options.output, output);
    console.log(`\\n📄 Detailed results saved to: ${chalk.blue(options.output)}`);
  }
}

function getPriorityColor(priority: string) {
  switch (priority) {
    case 'critical':
      return chalk.red.bold;
    case 'high':
      return chalk.red;
    case 'medium':
      return chalk.yellow;
    case 'low':
      return chalk.gray;
    default:
      return chalk.white;
  }
}
