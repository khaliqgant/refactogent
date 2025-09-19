import { Logger } from '../utils/logger.js';
import { CoverageAnalyzer, CoverageReport, CoverageOptions } from './coverage-analyzer.js';
import { ProjectType } from '../types/index.js';
import * as fs from 'fs';
import * as path from 'path';

export interface CoverageVisualization {
  htmlReport?: string;
  textSummary: string;
  jsonData: any;
  recommendations: string[];
}

export interface CoverageIntegrationResult {
  report: CoverageReport;
  visualization: CoverageVisualization;
  safetyImpact: CoverageSafetyImpact;
  actionItems: CoverageActionItem[];
}

export interface CoverageSafetyImpact {
  safetyScoreImpact: number; // How much coverage affects safety score
  riskReduction: number; // Percentage of risk reduced by current coverage
  recommendedCoverage: number; // Target coverage for optimal safety
  criticalFiles: string[]; // Files that need coverage for safety
}

export interface CoverageActionItem {
  priority: 'critical' | 'high' | 'medium' | 'low';
  type: 'add_tests' | 'improve_coverage' | 'fix_regression' | 'setup_monitoring';
  title: string;
  description: string;
  files: string[];
  estimatedHours: number;
  impact: string;
  steps: string[];
}

export class CoverageService {
  private analyzer: CoverageAnalyzer;
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
    this.analyzer = new CoverageAnalyzer(logger);
  }

  /**
   * Perform comprehensive coverage analysis with integration
   */
  async analyzeCoverageWithIntegration(
    projectPath: string,
    projectType: ProjectType,
    options: CoverageOptions = {}
  ): Promise<CoverageIntegrationResult> {
    this.logger.info('Starting integrated coverage analysis', { projectPath, projectType });

    try {
      // Generate coverage report
      const report = await this.analyzer.analyzeCoverage(projectPath, projectType, options);

      // Create visualization
      const visualization = await this.createVisualization(report, options);

      // Assess safety impact
      const safetyImpact = this.assessSafetyImpact(report);

      // Generate action items
      const actionItems = this.generateActionItems(report, safetyImpact);

      const result: CoverageIntegrationResult = {
        report,
        visualization,
        safetyImpact,
        actionItems,
      };

      this.logger.info('Integrated coverage analysis completed', {
        overallCoverage: report.overallCoverage.linePercentage.toFixed(1),
        safetyImpact: safetyImpact.safetyScoreImpact.toFixed(1),
        actionItems: actionItems.length,
      });

      return result;
    } catch (error) {
      this.logger.error('Integrated coverage analysis failed', {
        projectPath,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Monitor coverage regression
   */
  async monitorCoverageRegression(
    projectPath: string,
    projectType: ProjectType,
    threshold: number = 5
  ): Promise<{
    hasRegression: boolean;
    regressionDetails: any;
    recommendations: string[];
  }> {
    this.logger.info('Monitoring coverage regression', { projectPath, threshold });

    const report = await this.analyzer.analyzeCoverage(projectPath, projectType, {
      includeRegression: true,
    });

    const hasRegression = report.regressionAnalysis?.regressionRisk !== 'none';
    const recommendations: string[] = [];

    if (hasRegression && report.regressionAnalysis) {
      const changes = report.regressionAnalysis.changes;
      const significantRegressions = changes.filter(
        c => c.type === 'regression' && Math.abs(c.impact) >= threshold
      );

      if (significantRegressions.length > 0) {
        recommendations.push(
          `${significantRegressions.length} files have significant coverage regression`
        );
        recommendations.push('Review recent changes and add missing tests');
        recommendations.push('Consider blocking deployment until coverage is restored');
      }

      recommendations.push(...(report.regressionAnalysis.recommendations || []));
    }

    return {
      hasRegression,
      regressionDetails: report.regressionAnalysis,
      recommendations,
    };
  }

  /**
   * Generate coverage visualization
   */
  private async createVisualization(
    report: CoverageReport,
    options: CoverageOptions
  ): Promise<CoverageVisualization> {
    const textSummary = this.generateTextSummary(report);
    const jsonData = this.generateJsonVisualization(report);
    const recommendations = this.generateVisualizationRecommendations(report);

    let htmlReport: string | undefined;
    if (options.generateReport) {
      htmlReport = await this.generateHtmlReport(report);
    }

    return {
      htmlReport,
      textSummary,
      jsonData,
      recommendations,
    };
  }

  /**
   * Generate text summary
   */
  private generateTextSummary(report: CoverageReport): string {
    const { overallCoverage, summary } = report;

    return `
Coverage Summary for ${path.basename(report.projectPath)}
${'='.repeat(50)}

Overall Coverage:
  Lines:      ${overallCoverage.linePercentage.toFixed(1)}% (${overallCoverage.linesCovered}/${overallCoverage.totalLines})
  Branches:   ${overallCoverage.branchPercentage.toFixed(1)}% (${overallCoverage.branchesCovered}/${overallCoverage.totalBranches})
  Functions:  ${overallCoverage.functionPercentage.toFixed(1)}% (${overallCoverage.functionsCovered}/${overallCoverage.totalFunctions})

File Distribution:
  Total Files:        ${summary.totalFiles}
  Well Covered (>80%): ${summary.wellCoveredFiles}
  Poorly Covered (<50%): ${summary.poorlyCoveredFiles}
  Uncovered:          ${summary.uncoveredFiles}

Coverage Distribution:
  Excellent (90-100%): ${summary.coverageDistribution.excellent} files
  Good (70-89%):       ${summary.coverageDistribution.good} files
  Fair (50-69%):       ${summary.coverageDistribution.fair} files
  Poor (30-49%):       ${summary.coverageDistribution.poor} files
  Critical (0-29%):    ${summary.coverageDistribution.critical} files

Risk Assessment:
  High Risk Files: ${summary.riskAssessment.highRiskFiles.length}
  Critical Gaps:   ${summary.riskAssessment.criticalGaps.length}
  Recommendations: ${summary.riskAssessment.recommendations.length}
`;
  }

  /**
   * Generate JSON visualization data
   */
  private generateJsonVisualization(report: CoverageReport): any {
    return {
      summary: {
        overall: report.overallCoverage,
        distribution: report.summary.coverageDistribution,
        riskLevel: this.calculateOverallRiskLevel(report.overallCoverage.linePercentage),
      },
      files: report.fileCoverage.map(file => ({
        path: file.relativePath,
        coverage: file.metrics.linePercentage,
        riskLevel: file.riskLevel,
        uncoveredLines: file.uncoveredLines.length,
        recommendations: file.recommendations.length,
      })),
      trends: report.regressionAnalysis
        ? {
            previousCoverage: report.regressionAnalysis.previousCoverage?.linePercentage,
            currentCoverage: report.regressionAnalysis.currentCoverage.linePercentage,
            change:
              report.regressionAnalysis.changes.find(c => c.filePath === 'overall')?.impact || 0,
            riskLevel: report.regressionAnalysis.regressionRisk,
          }
        : null,
      recommendations: report.summary.riskAssessment.recommendations,
    };
  }

  /**
   * Generate HTML report
   */
  private async generateHtmlReport(report: CoverageReport): Promise<string> {
    const template = `
<!DOCTYPE html>
<html>
<head>
    <title>Coverage Report - ${path.basename(report.projectPath)}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 5px; }
        .metrics { display: flex; gap: 20px; margin: 20px 0; }
        .metric { background: white; border: 1px solid #ddd; padding: 15px; border-radius: 5px; flex: 1; }
        .coverage-bar { background: #f0f0f0; height: 20px; border-radius: 10px; overflow: hidden; }
        .coverage-fill { height: 100%; transition: width 0.3s; }
        .excellent { background: #4caf50; }
        .good { background: #8bc34a; }
        .fair { background: #ff9800; }
        .poor { background: #f44336; }
        .critical { background: #d32f2f; }
        .file-list { margin: 20px 0; }
        .file-item { padding: 10px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; }
        .recommendations { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Coverage Report</h1>
        <p><strong>Project:</strong> ${report.projectPath}</p>
        <p><strong>Generated:</strong> ${report.timestamp.toLocaleString()}</p>
        <p><strong>Language:</strong> ${report.language}</p>
    </div>

    <div class="metrics">
        <div class="metric">
            <h3>Line Coverage</h3>
            <div class="coverage-bar">
                <div class="coverage-fill ${this.getCoverageClass(report.overallCoverage.linePercentage)}" 
                     style="width: ${report.overallCoverage.linePercentage}%"></div>
            </div>
            <p>${report.overallCoverage.linePercentage.toFixed(1)}% (${report.overallCoverage.linesCovered}/${report.overallCoverage.totalLines})</p>
        </div>
        
        <div class="metric">
            <h3>Branch Coverage</h3>
            <div class="coverage-bar">
                <div class="coverage-fill ${this.getCoverageClass(report.overallCoverage.branchPercentage)}" 
                     style="width: ${report.overallCoverage.branchPercentage}%"></div>
            </div>
            <p>${report.overallCoverage.branchPercentage.toFixed(1)}% (${report.overallCoverage.branchesCovered}/${report.overallCoverage.totalBranches})</p>
        </div>
        
        <div class="metric">
            <h3>Function Coverage</h3>
            <div class="coverage-bar">
                <div class="coverage-fill ${this.getCoverageClass(report.overallCoverage.functionPercentage)}" 
                     style="width: ${report.overallCoverage.functionPercentage}%"></div>
            </div>
            <p>${report.overallCoverage.functionPercentage.toFixed(1)}% (${report.overallCoverage.functionsCovered}/${report.overallCoverage.totalFunctions})</p>
        </div>
    </div>

    <h2>File Coverage</h2>
    <div class="file-list">
        ${report.fileCoverage
          .map(
            file => `
            <div class="file-item">
                <span>${file.relativePath}</span>
                <span class="${file.riskLevel}">${file.metrics.linePercentage.toFixed(1)}%</span>
            </div>
        `
          )
          .join('')}
    </div>

    ${
      report.summary.riskAssessment.recommendations.length > 0
        ? `
    <div class="recommendations">
        <h3>Recommendations</h3>
        <ul>
            ${report.summary.riskAssessment.recommendations
              .map(
                rec => `
                <li><strong>${rec.title}:</strong> ${rec.description}</li>
            `
              )
              .join('')}
        </ul>
    </div>
    `
        : ''
    }

    ${
      report.regressionAnalysis
        ? `
    <h2>Regression Analysis</h2>
    <div class="metric">
        <p><strong>Previous Coverage:</strong> ${report.regressionAnalysis.previousCoverage?.linePercentage.toFixed(1) || 'N/A'}%</p>
        <p><strong>Current Coverage:</strong> ${report.regressionAnalysis.currentCoverage.linePercentage.toFixed(1)}%</p>
        <p><strong>Risk Level:</strong> ${report.regressionAnalysis.regressionRisk}</p>
    </div>
    `
        : ''
    }
</body>
</html>
    `;

    return template;
  }

  /**
   * Assess safety impact of coverage
   */
  private assessSafetyImpact(report: CoverageReport): CoverageSafetyImpact {
    const coverage = report.overallCoverage.linePercentage;

    // Calculate safety score impact (0-30 points based on coverage)
    let safetyScoreImpact = 0;
    if (coverage >= 90) safetyScoreImpact = 30;
    else if (coverage >= 80) safetyScoreImpact = 25;
    else if (coverage >= 70) safetyScoreImpact = 20;
    else if (coverage >= 60) safetyScoreImpact = 15;
    else if (coverage >= 50) safetyScoreImpact = 10;
    else if (coverage >= 30) safetyScoreImpact = 5;
    else safetyScoreImpact = 0;

    // Calculate risk reduction
    const riskReduction = Math.min(coverage, 90); // Max 90% risk reduction

    // Recommended coverage for optimal safety
    const recommendedCoverage = 80;

    // Identify critical files (high complexity or public API with low coverage)
    const criticalFiles = report.fileCoverage
      .filter(
        file =>
          file.metrics.linePercentage < 50 &&
          (file.relativePath.includes('api') ||
            file.relativePath.includes('service') ||
            file.relativePath.includes('controller'))
      )
      .map(file => file.filePath);

    return {
      safetyScoreImpact,
      riskReduction,
      recommendedCoverage,
      criticalFiles,
    };
  }

  /**
   * Generate actionable items
   */
  private generateActionItems(
    report: CoverageReport,
    safetyImpact: CoverageSafetyImpact
  ): CoverageActionItem[] {
    const actionItems: CoverageActionItem[] = [];

    // Critical coverage gaps
    if (report.overallCoverage.linePercentage < 50) {
      actionItems.push({
        priority: 'critical',
        type: 'add_tests',
        title: 'Add Basic Test Coverage',
        description: `Overall coverage is critically low at ${report.overallCoverage.linePercentage.toFixed(1)}%`,
        files: report.fileCoverage
          .filter(f => f.metrics.linePercentage === 0)
          .map(f => f.filePath)
          .slice(0, 5),
        estimatedHours: 40,
        impact: 'Dramatically improves code safety and reduces regression risk',
        steps: [
          'Identify core business logic functions',
          'Write unit tests for each public function',
          'Add integration tests for main workflows',
          'Set up continuous coverage monitoring',
        ],
      });
    }

    // High-risk files
    if (safetyImpact.criticalFiles.length > 0) {
      actionItems.push({
        priority: 'high',
        type: 'add_tests',
        title: 'Cover Critical API Files',
        description: 'Important API and service files lack adequate test coverage',
        files: safetyImpact.criticalFiles.slice(0, 3),
        estimatedHours: 20,
        impact: 'Reduces risk of API regressions and improves deployment confidence',
        steps: [
          'Write comprehensive API tests',
          'Add error handling test cases',
          'Test edge cases and boundary conditions',
          'Add integration tests for service interactions',
        ],
      });
    }

    // Branch coverage improvement
    if (report.overallCoverage.branchPercentage < 60) {
      actionItems.push({
        priority: 'medium',
        type: 'improve_coverage',
        title: 'Improve Branch Coverage',
        description: `Branch coverage is ${report.overallCoverage.branchPercentage.toFixed(1)}%, indicating missing edge case tests`,
        files: report.fileCoverage
          .filter(f => f.metrics.branchPercentage < 50)
          .map(f => f.filePath)
          .slice(0, 5),
        estimatedHours: 15,
        impact: 'Better handling of edge cases and error conditions',
        steps: [
          'Identify conditional logic branches',
          'Write tests for each branch condition',
          'Add error handling tests',
          'Test boundary conditions',
        ],
      });
    }

    // Regression monitoring
    if (report.regressionAnalysis?.regressionRisk !== 'none') {
      actionItems.push({
        priority: 'high',
        type: 'fix_regression',
        title: 'Address Coverage Regression',
        description: 'Coverage has decreased compared to previous runs',
        files:
          report.regressionAnalysis?.changes
            .filter(c => c.type === 'regression')
            .map(c => c.filePath) || [],
        estimatedHours: 8,
        impact: 'Prevents further degradation of test coverage',
        steps: [
          'Review recent code changes',
          'Identify removed or modified tests',
          'Add tests for new functionality',
          'Update existing tests as needed',
        ],
      });
    }

    // Setup monitoring if not exists
    if (!fs.existsSync(path.join(report.projectPath, '.coverage-history.json'))) {
      actionItems.push({
        priority: 'low',
        type: 'setup_monitoring',
        title: 'Set Up Coverage Monitoring',
        description: 'Establish continuous coverage monitoring and reporting',
        files: [],
        estimatedHours: 4,
        impact: 'Enables early detection of coverage regressions',
        steps: [
          'Configure coverage reporting in CI/CD',
          'Set up coverage thresholds',
          'Add coverage badges to README',
          'Set up automated coverage reports',
        ],
      });
    }

    return actionItems.sort((a, b) => {
      const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  /**
   * Generate visualization recommendations
   */
  private generateVisualizationRecommendations(report: CoverageReport): string[] {
    const recommendations: string[] = [];

    if (report.overallCoverage.linePercentage < 70) {
      recommendations.push('Consider generating HTML coverage reports for better visibility');
    }

    if (report.summary.riskAssessment.highRiskFiles.length > 5) {
      recommendations.push('Use coverage heatmaps to identify problem areas');
    }

    if (report.regressionAnalysis?.regressionRisk !== 'none') {
      recommendations.push('Set up coverage trend monitoring and alerts');
    }

    recommendations.push('Integrate coverage reporting into your CI/CD pipeline');
    recommendations.push('Consider using coverage badges in your repository README');

    return recommendations;
  }

  // Helper methods
  private calculateOverallRiskLevel(coverage: number): string {
    if (coverage >= 80) return 'low';
    if (coverage >= 60) return 'medium';
    if (coverage >= 30) return 'high';
    return 'critical';
  }

  private getCoverageClass(percentage: number): string {
    if (percentage >= 90) return 'excellent';
    if (percentage >= 70) return 'good';
    if (percentage >= 50) return 'fair';
    if (percentage >= 30) return 'poor';
    return 'critical';
  }
}
