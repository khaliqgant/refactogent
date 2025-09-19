import { Command } from 'commander';
import { Logger } from '../utils/logger.js';
import { SafetyScorer } from '../analysis/safety-scorer.js';
import { ASTService } from '../analysis/ast-service.js';
import { APISurfaceDetector } from '../analysis/api-surface-detector.js';
import { ProjectAnalyzer } from '../utils/project.js';
import fs from 'fs';
import path from 'path';

export function createSafetyAnalyzeCommand(): Command {
  const command = new Command('safety-analyze');

  command
    .description('Analyze project safety for refactoring operations')
    .argument('[project-path]', 'Path to project directory', '.')
    .option('-c, --coverage', 'Include test coverage analysis', false)
    .option('-g, --git-history', 'Include git history analysis', false)
    .option('--coverage-threshold <number>', 'Minimum coverage threshold', '70')
    .option('--risk-threshold <number>', 'Maximum acceptable risk score', '30')
    .option('--max-history-months <number>', 'Months of git history to analyze', '12')
    .option('-o, --output <file>', 'Output file for detailed report')
    .option('--format <format>', 'Output format (json|markdown|console)', 'console')
    .option('-v, --verbose', 'Verbose logging', false)
    .action(async (projectPath: string, options) => {
      const logger = new Logger(options.verbose);

      try {
        logger.info('Starting safety analysis', { projectPath, options });

        // Validate project path
        const resolvedPath = path.resolve(projectPath);
        if (!fs.existsSync(resolvedPath)) {
          logger.error('Project path does not exist', { projectPath: resolvedPath });
          process.exit(1);
        }

        // Validate project
        const projectAnalyzer = new ProjectAnalyzer(logger);
        const projectInfo = await projectAnalyzer.analyzeProject(resolvedPath);

        if (projectInfo.type === 'unknown') {
          logger.warn('Could not detect project type, proceeding with generic analysis');
        } else {
          logger.info('Detected project type', { type: projectInfo.type });
        }

        // Perform safety analysis
        const astService = new ASTService(logger);
        const apiDetector = new APISurfaceDetector(logger);
        const safetyScorer = new SafetyScorer(logger);

        // Analyze project
        const projectAnalysis = await astService.analyzeProject(resolvedPath, projectInfo.type);
        const projectASTs = projectAnalysis.astByLanguage;
        const apiSurface = await apiDetector.detectAPISurface(resolvedPath, projectASTs);

        const primaryAST = Array.from(projectAnalysis.astByLanguage.values())[0];
        if (!primaryAST) {
          logger.error('No AST data available for analysis');
          process.exit(1);
        }

        const safetyScore = await safetyScorer.calculateProjectSafety(
          primaryAST,
          apiSurface.endpoints
        );
        const riskProfile = await safetyScorer.generateRiskProfile(
          primaryAST,
          apiSurface.endpoints
        );

        const result = {
          projectPath: resolvedPath,
          timestamp: new Date(),
          safetyScore,
          riskProfile,
          summary: {
            overallRating:
              safetyScore.overall >= 90
                ? 'excellent'
                : safetyScore.overall >= 75
                  ? 'good'
                  : safetyScore.overall >= 60
                    ? 'fair'
                    : safetyScore.overall >= 40
                      ? 'poor'
                      : 'critical',
            keyStrengths: safetyScore.testCoverage.score > 80 ? ['Good test coverage'] : [],
            majorConcerns: safetyScore.complexity.score < 40 ? ['High complexity'] : [],
            quickWins:
              riskProfile.safeRefactoringCandidates.length > 0
                ? ['Safe refactoring opportunities']
                : [],
            riskLevel:
              safetyScore.overall >= 80
                ? 'low'
                : safetyScore.overall >= 60
                  ? 'medium'
                  : safetyScore.overall >= 40
                    ? 'high'
                    : 'critical',
            readinessForRefactoring:
              safetyScore.overall > 60 && safetyScore.testCoverage.score > 50,
          },
        };

        // Output results
        switch (options.format) {
          case 'json':
            await outputJson(result, options.output, logger);
            break;
          case 'markdown':
            await outputMarkdown(result, options.output, logger);
            break;
          default:
            outputConsole(result, logger);
        }

        // Exit with appropriate code based on safety
        const exitCode = result.summary.riskLevel === 'critical' ? 1 : 0;
        process.exit(exitCode);
      } catch (error) {
        logger.error('Safety analysis failed', {
          error: error instanceof Error ? error.message : String(error),
        });
        process.exit(1);
      }
    });

  return command;
}

async function outputJson(result: any, outputFile?: string, logger?: Logger): Promise<void> {
  const jsonOutput = JSON.stringify(result, null, 2);

  if (outputFile) {
    try {
      fs.writeFileSync(outputFile, jsonOutput);
      logger?.info('Safety report written to file', { outputFile });
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

async function outputMarkdown(result: any, outputFile?: string, logger?: Logger): Promise<void> {
  const markdown = generateMarkdownReport(result);

  if (outputFile) {
    fs.writeFileSync(outputFile, markdown);
    logger?.info('Safety report written to file', { outputFile });
  } else {
    console.log(markdown);
  }
}

function outputConsole(result: any, logger: Logger): void {
  console.log('\n🔍 Project Safety Analysis Report');
  console.log('================================\n');

  // Overall Summary
  console.log(`📊 Overall Safety Score: ${result.safetyScore.overall.toFixed(1)}/100`);
  console.log(`🎯 Overall Rating: ${result.summary.overallRating.toUpperCase()}`);
  console.log(`⚠️  Risk Level: ${result.summary.riskLevel.toUpperCase()}`);
  console.log(
    `✅ Ready for Refactoring: ${result.summary.readinessForRefactoring ? 'YES' : 'NO'}\n`
  );

  // Detailed Scores
  console.log('📈 Detailed Scores:');
  console.log(
    `   Complexity:        ${result.safetyScore.complexity.score.toFixed(1)}/100 (${result.safetyScore.complexity.riskLevel})`
  );
  console.log(
    `   Test Coverage:     ${result.safetyScore.testCoverage.score.toFixed(1)}/100 (${result.safetyScore.testCoverage.riskLevel})`
  );
  console.log(
    `   API Exposure:      ${result.safetyScore.apiExposure.score.toFixed(1)}/100 (${result.safetyScore.apiExposure.riskLevel})`
  );
  console.log(
    `   Dependency Risk:   ${result.safetyScore.dependencyRisk.score.toFixed(1)}/100 (${result.safetyScore.dependencyRisk.riskLevel})`
  );
  console.log(
    `   Change Frequency:  ${result.safetyScore.changeFrequency.score.toFixed(1)}/100 (${result.safetyScore.changeFrequency.riskLevel})\n`
  );

  // Key Strengths
  if (result.summary.keyStrengths.length > 0) {
    console.log('💪 Key Strengths:');
    result.summary.keyStrengths.forEach((strength: string) => {
      console.log(`   ✅ ${strength}`);
    });
    console.log();
  }

  // Major Concerns
  if (result.summary.majorConcerns.length > 0) {
    console.log('⚠️  Major Concerns:');
    result.summary.majorConcerns.forEach((concern: string) => {
      console.log(`   ❌ ${concern}`);
    });
    console.log();
  }

  // Quick Wins
  if (result.summary.quickWins.length > 0) {
    console.log('🚀 Quick Wins:');
    result.summary.quickWins.forEach((win: string) => {
      console.log(`   💡 ${win}`);
    });
    console.log();
  }

  // Risk Hotspots
  if (result.riskProfile.riskHotspots && result.riskProfile.riskHotspots.length > 0) {
    console.log('🔥 Risk Hotspots (Top 5):');
    result.riskProfile.riskHotspots.slice(0, 5).forEach((hotspot: any, index: number) => {
      console.log(
        `   ${index + 1}. ${path.basename(hotspot.filePath)} (Risk: ${hotspot.riskScore.toFixed(1)})`
      );
      console.log(`      Issues: ${hotspot.primaryRiskFactors.join(', ')}`);
    });
    console.log();
  }

  // Safe Refactoring Candidates
  if (
    result.riskProfile.safeRefactoringCandidates &&
    result.riskProfile.safeRefactoringCandidates.length > 0
  ) {
    console.log('✨ Safe Refactoring Opportunities (Top 3):');
    result.riskProfile.safeRefactoringCandidates
      .slice(0, 3)
      .forEach((candidate: any, index: number) => {
        console.log(
          `   ${index + 1}. ${candidate.refactoringType.replace('_', ' ')} in ${path.basename(candidate.filePath)}`
        );
        console.log(
          `      Safety: ${candidate.safetyScore.toFixed(1)}/100, Effort: ${candidate.estimatedEffort}`
        );
        console.log(`      Benefit: ${candidate.potentialBenefit}`);
      });
    console.log();
  }

  // Top Recommendations
  console.log('📋 Top Recommendations:');
  const topRecommendations = (result.safetyScore.recommendations || []).slice(0, 5);
  topRecommendations.forEach((rec: any, index: number) => {
    const priorityIcon =
      rec.priority === 'critical'
        ? '🚨'
        : rec.priority === 'high'
          ? '⚠️'
          : rec.priority === 'medium'
            ? '📋'
            : '💡';
    console.log(`   ${index + 1}. ${priorityIcon} ${rec.title} (${rec.priority.toUpperCase()})`);
    console.log(`      ${rec.description}`);
    console.log(`      Effort: ${rec.effort || 'Unknown'}, Benefit: ${rec.impact || 'Unknown'}`);
    if (rec.suggestedActions && rec.suggestedActions.length > 0) {
      console.log(
        `      Actions: ${rec.suggestedActions.slice(0, 2).join(', ')}${rec.suggestedActions.length > 2 ? '...' : ''}`
      );
    }
    console.log();
  });

  // Global Metrics
  console.log('📊 Global Metrics:');
  console.log(
    `   Average Complexity:     ${result.riskProfile.globalMetrics.averageComplexity.toFixed(1)}`
  );
  console.log(
    `   Total Test Coverage:    ${result.riskProfile.globalMetrics.totalTestCoverage.toFixed(1)}%`
  );
  console.log(
    `   Public API Surface:     ${result.riskProfile.globalMetrics.publicApiSurface} items`
  );
  console.log(
    `   Dependency Health:      ${result.riskProfile.globalMetrics.dependencyHealth.toFixed(1)}/100`
  );
  console.log(
    `   Architectural Debt:     ${result.riskProfile.globalMetrics.architecturalDebt.toFixed(1)}%`
  );
  console.log();

  // Summary Message
  if (result.summary.readinessForRefactoring) {
    console.log('🎉 This project appears ready for refactoring operations!');
    console.log('   Consider starting with the safe refactoring opportunities listed above.');
  } else {
    console.log('⚠️  This project needs improvement before major refactoring.');
    console.log('   Focus on addressing the major concerns and top recommendations first.');
  }
  console.log();
}

function generateMarkdownReport(result: any): string {
  const timestamp = new Date(result.timestamp).toLocaleString();

  return `# Project Safety Analysis Report

**Project:** ${result.projectPath}  
**Generated:** ${timestamp}  
**Overall Score:** ${result.safetyScore.overall.toFixed(1)}/100  
**Risk Level:** ${result.summary.riskLevel.toUpperCase()}  
**Refactoring Ready:** ${result.summary.readinessForRefactoring ? '✅ YES' : '❌ NO'}

## Executive Summary

This project has been rated as **${result.summary.overallRating.toUpperCase()}** with an overall safety score of ${result.safetyScore.overall.toFixed(1)}/100.

### Key Findings

${
  result.summary.keyStrengths.length > 0
    ? `**Strengths:**
${result.summary.keyStrengths.map((s: string) => `- ✅ ${s}`).join('\n')}

`
    : ''
}${
    result.summary.majorConcerns.length > 0
      ? `**Major Concerns:**
${result.summary.majorConcerns.map((c: string) => `- ⚠️ ${c}`).join('\n')}

`
      : ''
  }${
    result.summary.quickWins.length > 0
      ? `**Quick Wins:**
${result.summary.quickWins.map((w: string) => `- 💡 ${w}`).join('\n')}

`
      : ''
  }## Detailed Scores

| Metric | Score | Risk Level | Details |
|--------|-------|------------|---------|
| Complexity | ${result.safetyScore.complexity.score.toFixed(1)}/100 | ${result.safetyScore.complexity.riskLevel} | ${result.safetyScore.complexity.details} |
| Test Coverage | ${result.safetyScore.testCoverage.score.toFixed(1)}/100 | ${result.safetyScore.testCoverage.riskLevel} | ${result.safetyScore.testCoverage.details} |
| API Exposure | ${result.safetyScore.apiExposure.score.toFixed(1)}/100 | ${result.safetyScore.apiExposure.riskLevel} | ${result.safetyScore.apiExposure.details} |
| Dependency Risk | ${result.safetyScore.dependencyRisk.score.toFixed(1)}/100 | ${result.safetyScore.dependencyRisk.riskLevel} | ${result.safetyScore.dependencyRisk.details} |
| Change Frequency | ${result.safetyScore.changeFrequency.score.toFixed(1)}/100 | ${result.safetyScore.changeFrequency.riskLevel} | ${result.safetyScore.changeFrequency.details} |

## Risk Hotspots

${
  result.riskProfile.riskHotspots.length > 0
    ? result.riskProfile.riskHotspots
        .slice(0, 10)
        .map(
          (hotspot: any, index: number) =>
            `### ${index + 1}. ${path.basename(hotspot.filePath)}
**Risk Score:** ${hotspot.riskScore.toFixed(1)}/100  
**Primary Issues:** ${hotspot.primaryRiskFactors.join(', ')}  
**Impact Radius:** ${hotspot.impactRadius.length} dependent files  

**Recommended Actions:**
${hotspot.recommendedActions.map((action: string) => `- ${action}`).join('\n')}
`
        )
        .join('\n')
    : 'No significant risk hotspots identified.'
}

## Safe Refactoring Opportunities

${
  result.riskProfile.safeRefactoringCandidates.length > 0
    ? result.riskProfile.safeRefactoringCandidates
        .slice(0, 5)
        .map(
          (candidate: any, index: number) =>
            `### ${index + 1}. ${candidate.refactoringType.replace('_', ' ')} - ${path.basename(candidate.filePath)}
**Safety Score:** ${candidate.safetyScore.toFixed(1)}/100  
**Estimated Effort:** ${candidate.estimatedEffort}  
**Description:** ${candidate.description}  
**Potential Benefit:** ${candidate.potentialBenefit}  

**Prerequisites:**
${candidate.prerequisites.map((prereq: string) => `- ${prereq}`).join('\n')}
`
        )
        .join('\n')
    : 'No safe refactoring opportunities identified at this time.'
}

## Recommendations

${result.recommendations
  .map((rec: any, index: number) => {
    const priorityIcon =
      rec.priority === 'critical'
        ? '🚨'
        : rec.priority === 'high'
          ? '⚠️'
          : rec.priority === 'medium'
            ? '📋'
            : '💡';
    return `### ${index + 1}. ${priorityIcon} ${rec.title}
**Priority:** ${rec.priority.toUpperCase()}  
**Category:** ${rec.category.replace('_', ' ').toUpperCase()}  
**Estimated Effort:** ${rec.estimatedEffort}  
**Expected Benefit:** ${rec.expectedBenefit}  

${rec.description}

**Action Items:**
${rec.actionItems.map((action: string) => `- ${action}`).join('\n')}
`;
  })
  .join('\n')}

## Global Metrics

| Metric | Value |
|--------|-------|
| Average Complexity | ${result.riskProfile.globalMetrics.averageComplexity.toFixed(1)} |
| Total Test Coverage | ${result.riskProfile.globalMetrics.totalTestCoverage.toFixed(1)}% |
| Public API Surface | ${result.riskProfile.globalMetrics.publicApiSurface} items |
| Dependency Health | ${result.riskProfile.globalMetrics.dependencyHealth.toFixed(1)}/100 |
| Architectural Debt | ${result.riskProfile.globalMetrics.architecturalDebt.toFixed(1)}% |

## Conclusion

${
  result.summary.readinessForRefactoring
    ? '🎉 **This project is ready for refactoring!** The safety analysis indicates that refactoring operations can be performed with confidence. Consider starting with the safe refactoring opportunities identified above.'
    : '⚠️ **This project needs improvement before major refactoring.** Focus on addressing the major concerns and implementing the high-priority recommendations before attempting significant refactoring operations.'
}

---
*Report generated by Refactogent Safety Analyzer*
`;
}
