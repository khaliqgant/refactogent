import { Command } from 'commander';
import { Logger } from '../utils/logger.js';
import { CoverageService } from '../analysis/coverage-service.js';
import { ProjectAnalyzer } from '../utils/project.js';
import { ProjectType } from '../types/index.js';
import * as fs from 'fs';
import * as path from 'path';

export function createCoverageAnalyzeCommand(): Command {
  const command = new Command('coverage-analyze');

  command
    .description('Analyze test coverage and generate comprehensive reports')
    .argument('[project-path]', 'Path to project directory', '.')
    .option('-g, --generate', 'Generate new coverage data', false)
    .option('-r, --regression', 'Include regression analysis', false)
    .option('--threshold <number>', 'Coverage threshold percentage', '70')
    .option('--format <format>', 'Output format (console|json|html)', 'console')
    .option('-o, --output <file>', 'Output file for report')
    .option('--exclude <patterns>', 'Exclude patterns (comma-separated)')
    .option('--include <patterns>', 'Include patterns (comma-separated)')
    .option('-v, --verbose', 'Verbose logging', false)
    .action(async (projectPath: string, options) => {
      const logger = new Logger(options.verbose);

      try {
        logger.info('Starting coverage analysis', { projectPath, options });

        // Validate project path
        const resolvedPath = path.resolve(projectPath);
        if (!fs.existsSync(resolvedPath)) {
          logger.error('Project path does not exist', { projectPath: resolvedPath });
          process.exit(1);
        }

        // Analyze project to determine type
        const projectAnalyzer = new ProjectAnalyzer(logger);
        const projectInfo = await projectAnalyzer.analyzeProject(resolvedPath);

        if (projectInfo.type === 'unknown') {
          logger.error('Could not determine project type for coverage analysis');
          process.exit(1);
        }

        logger.info('Detected project type', { type: projectInfo.type });

        // Configure coverage options
        const coverageOptions = {
          threshold: parseInt(options.threshold),
          includeRegression: options.regression,
          generateReport: options.format === 'html',
          excludePatterns: options.exclude ? options.exclude.split(',') : undefined,
          includePatterns: options.include ? options.include.split(',') : undefined,
        };

        // Perform coverage analysis
        const coverageService = new CoverageService(logger);
        const result = await coverageService.analyzeCoverageWithIntegration(
          resolvedPath,
          projectInfo.type as ProjectType,
          coverageOptions
        );

        // Output results based on format
        switch (options.format) {
          case 'json':
            await outputJson(result, options.output, logger);
            break;
          case 'html':
            await outputHtml(result, options.output, logger);
            break;
          default:
            outputConsole(result, logger);
        }

        // Exit with appropriate code based on coverage
        const exitCode =
          result.report.overallCoverage.linePercentage < parseInt(options.threshold) ? 1 : 0;
        process.exit(exitCode);
      } catch (error) {
        logger.error('Coverage analysis failed', {
          error: error instanceof Error ? error.message : String(error),
        });
        process.exit(1);
      }
    });

  return command;
}

async function outputJson(result: any, outputFile?: string, logger?: Logger): Promise<void> {
  const jsonOutput = JSON.stringify(
    {
      report: result.report,
      visualization: result.visualization.jsonData,
      safetyImpact: result.safetyImpact,
      actionItems: result.actionItems,
    },
    null,
    2
  );

  if (outputFile) {
    try {
      fs.writeFileSync(outputFile, jsonOutput);
      logger?.info('Coverage report written to file', { outputFile });
    } catch (error) {
      logger?.error('Failed to write file', {
        outputFile,
        error: error instanceof Error ? error.message : String(error),
      });
      console.log(jsonOutput);
    }
  } else {
    console.log(jsonOutput);
  }
}

async function outputHtml(result: any, outputFile?: string, logger?: Logger): Promise<void> {
  const htmlOutput = result.visualization.htmlReport || 'HTML report not generated';

  const fileName = outputFile || 'coverage-report.html';

  try {
    fs.writeFileSync(fileName, htmlOutput);
    logger?.info('HTML coverage report written to file', { outputFile: fileName });
    console.log(`📄 HTML report generated: ${fileName}`);
  } catch (error) {
    logger?.error('Failed to write HTML file', {
      outputFile: fileName,
      error: error instanceof Error ? error.message : String(error),
    });
    console.log('Failed to write HTML report');
  }
}

function outputConsole(result: any, logger: Logger): void {
  const { report, safetyImpact, actionItems } = result;

  console.log('\n📊 Test Coverage Analysis Report');
  console.log('=================================\n');

  // Overall Coverage Summary
  console.log('📈 Overall Coverage:');
  console.log(
    `   Lines:      ${report.overallCoverage.linePercentage.toFixed(1)}% (${report.overallCoverage.linesCovered}/${report.overallCoverage.totalLines})`
  );
  console.log(
    `   Branches:   ${report.overallCoverage.branchPercentage.toFixed(1)}% (${report.overallCoverage.branchesCovered}/${report.overallCoverage.totalBranches})`
  );
  console.log(
    `   Functions:  ${report.overallCoverage.functionPercentage.toFixed(1)}% (${report.overallCoverage.functionsCovered}/${report.overallCoverage.totalFunctions})`
  );
  console.log(
    `   Statements: ${report.overallCoverage.statementPercentage.toFixed(1)}% (${report.overallCoverage.statementsCovered}/${report.overallCoverage.totalStatements})\n`
  );

  // Coverage Distribution
  console.log('📊 Coverage Distribution:');
  console.log(`   Excellent (90-100%): ${report.summary.coverageDistribution.excellent} files`);
  console.log(`   Good (70-89%):       ${report.summary.coverageDistribution.good} files`);
  console.log(`   Fair (50-69%):       ${report.summary.coverageDistribution.fair} files`);
  console.log(`   Poor (30-49%):       ${report.summary.coverageDistribution.poor} files`);
  console.log(`   Critical (0-29%):    ${report.summary.coverageDistribution.critical} files\n`);

  // Safety Impact
  console.log('🛡️  Safety Impact:');
  console.log(`   Safety Score Impact: +${safetyImpact.safetyScoreImpact.toFixed(1)} points`);
  console.log(`   Risk Reduction:      ${safetyImpact.riskReduction.toFixed(1)}%`);
  console.log(`   Recommended Target:  ${safetyImpact.recommendedCoverage}%`);
  if (safetyImpact.criticalFiles.length > 0) {
    console.log(
      `   Critical Files:      ${safetyImpact.criticalFiles.length} files need attention`
    );
  }
  console.log();

  // File Coverage (Top 10 worst)
  const worstFiles = report.fileCoverage
    .sort((a: any, b: any) => a.metrics.linePercentage - b.metrics.linePercentage)
    .slice(0, 10);

  if (worstFiles.length > 0) {
    console.log('📁 Files Needing Attention (Lowest Coverage):');
    worstFiles.forEach((file: any, index: number) => {
      const riskIcon =
        file.riskLevel === 'critical'
          ? '🔴'
          : file.riskLevel === 'high'
            ? '🟠'
            : file.riskLevel === 'medium'
              ? '🟡'
              : '🟢';
      console.log(
        `   ${index + 1}. ${riskIcon} ${path.basename(file.filePath)} - ${file.metrics.linePercentage.toFixed(1)}%`
      );
      if (file.uncoveredLines.length > 0) {
        console.log(`      ${file.uncoveredLines.length} uncovered lines`);
      }
    });
    console.log();
  }

  // Regression Analysis
  if (report.regressionAnalysis) {
    console.log('📉 Regression Analysis:');
    const regression = report.regressionAnalysis;
    if (regression.previousCoverage) {
      const change =
        regression.currentCoverage.linePercentage - regression.previousCoverage.linePercentage;
      const changeIcon = change >= 0 ? '📈' : '📉';
      console.log(
        `   Previous Coverage: ${regression.previousCoverage.linePercentage.toFixed(1)}%`
      );
      console.log(`   Current Coverage:  ${regression.currentCoverage.linePercentage.toFixed(1)}%`);
      console.log(
        `   Change: ${changeIcon} ${change >= 0 ? '+' : ''}${change.toFixed(1)} percentage points`
      );
      console.log(`   Risk Level: ${regression.regressionRisk.toUpperCase()}`);
    } else {
      console.log('   No previous coverage data available');
    }
    console.log();
  }

  // Action Items
  if (actionItems.length > 0) {
    console.log('🎯 Recommended Actions:');
    actionItems.slice(0, 5).forEach((item: any, index: number) => {
      const priorityIcon =
        item.priority === 'critical'
          ? '🚨'
          : item.priority === 'high'
            ? '⚠️'
            : item.priority === 'medium'
              ? '📋'
              : '💡';
      console.log(
        `   ${index + 1}. ${priorityIcon} ${item.title} (${item.priority.toUpperCase()})`
      );
      console.log(`      ${item.description}`);
      console.log(`      Estimated effort: ${item.estimatedHours} hours`);
      console.log(`      Impact: ${item.impact}`);
      if (item.files.length > 0) {
        console.log(
          `      Files: ${item.files
            .slice(0, 3)
            .map((f: string) => path.basename(f))
            .join(', ')}${item.files.length > 3 ? '...' : ''}`
        );
      }
      console.log();
    });
  }

  // Recommendations from Risk Assessment
  if (report.summary.riskAssessment.recommendations.length > 0) {
    console.log('💡 Coverage Recommendations:');
    report.summary.riskAssessment.recommendations.slice(0, 3).forEach((rec: any, index: number) => {
      console.log(`   ${index + 1}. ${rec.title}`);
      console.log(`      ${rec.description}`);
      console.log(`      Priority: ${rec.priority.toUpperCase()}, Effort: ${rec.estimatedEffort}`);
      console.log();
    });
  }

  // Summary Assessment
  const overallRisk =
    report.overallCoverage.linePercentage >= 80
      ? 'LOW'
      : report.overallCoverage.linePercentage >= 60
        ? 'MEDIUM'
        : report.overallCoverage.linePercentage >= 30
          ? 'HIGH'
          : 'CRITICAL';

  console.log('📋 Summary:');
  console.log(`   Overall Risk Level: ${overallRisk}`);
  console.log(`   Files Analyzed: ${report.summary.totalFiles}`);
  console.log(`   Average Coverage: ${report.summary.averageCoverage.toFixed(1)}%`);

  if (report.overallCoverage.linePercentage >= 80) {
    console.log('   ✅ Excellent coverage! Your code is well-protected against regressions.');
  } else if (report.overallCoverage.linePercentage >= 60) {
    console.log("   ⚠️  Good coverage, but there's room for improvement in critical areas.");
  } else {
    console.log('   🚨 Coverage is below recommended levels. Focus on the action items above.');
  }

  console.log();
}
