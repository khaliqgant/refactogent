import { Logger } from '../utils/logger.js';
import { ProjectAST, ModuleAST, ASTMetrics } from './ast-types.js';
import { APIEndpoint } from './api-surface-detector.js';
import { CoverageReport } from './coverage-analyzer.js';

export interface SafetyScore {
  overall: number; // 0-100, higher is safer
  complexity: SafetyMetric;
  testCoverage: SafetyMetric;
  apiExposure: SafetyMetric;
  dependencyRisk: SafetyMetric;
  changeFrequency: SafetyMetric;
  recommendations: SafetyRecommendation[];
}

export interface SafetyMetric {
  score: number; // 0-100
  weight: number; // Weight in overall calculation
  details: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface SafetyRecommendation {
  type: 'refactoring' | 'testing' | 'architecture' | 'process';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  impact: string;
  effort: 'low' | 'medium' | 'high';
  suggestedActions: string[];
}

export interface ProjectRiskProfile {
  files: FileRiskAssessment[];
  globalMetrics: GlobalRiskMetrics;
  riskHotspots: RiskHotspot[];
  safeRefactoringCandidates: RefactoringCandidate[];
}

export interface FileRiskAssessment {
  filePath: string;
  riskScore: number; // 0-100, higher is riskier
  complexity: number;
  testCoverage: number;
  apiExposure: number;
  changeFrequency: number;
  dependencyFanOut: number;
  dependencyFanIn: number;
  issues: string[];
}

export interface GlobalRiskMetrics {
  averageComplexity: number;
  totalTestCoverage: number;
  publicApiSurface: number;
  dependencyHealth: number;
  architecturalDebt: number;
}

export interface RiskHotspot {
  filePath: string;
  riskScore: number;
  primaryRiskFactors: string[];
  impactRadius: string[]; // Files that depend on this hotspot
  recommendedActions: string[];
}

export interface RefactoringCandidate {
  filePath: string;
  safetyScore: number;
  refactoringType:
    | 'extract_function'
    | 'rename_symbol'
    | 'move_file'
    | 'inline_function'
    | 'extract_class';
  description: string;
  estimatedEffort: 'low' | 'medium' | 'high';
  potentialBenefit: string;
  prerequisites: string[];
}

export interface CoverageData {
  filePath: string;
  linesCovered: number;
  totalLines: number;
  branchesCovered: number;
  totalBranches: number;
  functionsCovered: number;
  totalFunctions: number;
}

export interface ChangeFrequencyData {
  filePath: string;
  changesLastMonth: number;
  changesLastQuarter: number;
  changesLastYear: number;
  averageChangeSize: number;
  lastModified: Date;
}

interface SafetyWeights {
  complexity: number;
  testCoverage: number;
  apiExposure: number;
  dependencyRisk: number;
  changeFrequency: number;
}

export class SafetyScorer {
  private logger: Logger;
  private weights: SafetyWeights;

  constructor(logger: Logger, weights?: Partial<SafetyWeights>) {
    this.logger = logger;
    this.weights = {
      complexity: 0.25,
      testCoverage: 0.3,
      apiExposure: 0.2,
      dependencyRisk: 0.15,
      changeFrequency: 0.1,
      ...weights,
    };
  }

  /**
   * Calculate comprehensive safety score for a project
   */
  async calculateProjectSafety(
    projectAST: ProjectAST,
    apiEndpoints: APIEndpoint[],
    coverageData?: CoverageData[],
    changeFrequencyData?: ChangeFrequencyData[],
    coverageReport?: CoverageReport
  ): Promise<SafetyScore> {
    this.logger.info('Calculating project safety score', {
      fileCount: projectAST.modules.length,
      apiEndpointCount: apiEndpoints.length,
    });

    const complexity = this.calculateComplexityMetric(projectAST);
    const testCoverage = this.calculateTestCoverageMetric(projectAST, coverageData, coverageReport);
    const apiExposure = this.calculateApiExposureMetric(projectAST, apiEndpoints);
    const dependencyRisk = this.calculateDependencyRiskMetric(projectAST);
    const changeFrequency = this.calculateChangeFrequencyMetric(projectAST, changeFrequencyData);

    const overall = this.calculateOverallScore([
      complexity,
      testCoverage,
      apiExposure,
      dependencyRisk,
      changeFrequency,
    ]);

    const recommendations = this.generateRecommendations({
      complexity,
      testCoverage,
      apiExposure,
      dependencyRisk,
      changeFrequency,
    });

    return {
      overall,
      complexity,
      testCoverage,
      apiExposure,
      dependencyRisk,
      changeFrequency,
      recommendations,
    };
  }

  /**
   * Generate detailed risk profile for the project
   */
  async generateRiskProfile(
    projectAST: ProjectAST,
    apiEndpoints: APIEndpoint[],
    coverageData?: CoverageData[],
    changeFrequencyData?: ChangeFrequencyData[]
  ): Promise<ProjectRiskProfile> {
    this.logger.info('Generating project risk profile');

    const files = projectAST.modules.map(module =>
      this.assessFileRisk(module, apiEndpoints, coverageData, changeFrequencyData)
    );
    const globalMetrics = this.calculateGlobalMetrics(files, projectAST);
    const riskHotspots = this.identifyRiskHotspots(files, projectAST);
    const safeRefactoringCandidates = this.identifySafeRefactoringCandidates(files, projectAST);

    return {
      files,
      globalMetrics,
      riskHotspots,
      safeRefactoringCandidates,
    };
  }

  /**
   * Calculate complexity-based safety metric
   */
  private calculateComplexityMetric(projectAST: ProjectAST): SafetyMetric {
    const avgComplexity = projectAST.metrics.averageComplexity;
    const maxComplexity = projectAST.metrics.maxComplexity;

    // Score inversely related to complexity (lower complexity = higher safety)
    let score = 100;
    if (avgComplexity > 10) score -= 30;
    if (avgComplexity > 20) score -= 30;
    if (maxComplexity > 50) score -= 20;
    if (maxComplexity > 100) score -= 20;

    const riskLevel = this.getRiskLevel(score);

    return {
      score: Math.max(0, score),
      weight: this.weights.complexity,
      details: `Average complexity: ${avgComplexity.toFixed(1)}, Max: ${maxComplexity}`,
      riskLevel,
    };
  }

  /**
   * Calculate test coverage-based safety metric
   */
  private calculateTestCoverageMetric(
    projectAST: ProjectAST,
    coverageData?: CoverageData[],
    coverageReport?: CoverageReport
  ): SafetyMetric {
    // Use comprehensive coverage report if available
    if (coverageReport) {
      const coverage = coverageReport.overallCoverage.linePercentage;
      const riskLevel = this.getRiskLevel(coverage);

      return {
        score: coverage,
        weight: this.weights.testCoverage,
        details: `Line coverage: ${coverage.toFixed(1)}% (${coverageReport.overallCoverage.linesCovered}/${coverageReport.overallCoverage.totalLines} lines), Branch: ${coverageReport.overallCoverage.branchPercentage.toFixed(1)}%`,
        riskLevel,
      };
    }
    if (!coverageData || coverageData.length === 0) {
      // Estimate coverage based on test files
      const testFiles = projectAST.modules.filter(module => this.isTestFile(module.filePath));
      const sourceFiles = projectAST.modules.filter(module => !this.isTestFile(module.filePath));
      const estimatedCoverage =
        sourceFiles.length > 0 ? Math.min(100, (testFiles.length / sourceFiles.length) * 60) : 0;

      const score = estimatedCoverage;
      const riskLevel = this.getRiskLevel(score);

      return {
        score,
        weight: this.weights.testCoverage,
        details: `Estimated coverage: ${estimatedCoverage.toFixed(1)}% (${testFiles.length} test files for ${sourceFiles.length} source files)`,
        riskLevel,
      };
    }

    const totalLines = coverageData.reduce((sum, c) => sum + c.totalLines, 0);
    const coveredLines = coverageData.reduce((sum, c) => sum + c.linesCovered, 0);
    const coverage = totalLines > 0 ? (coveredLines / totalLines) * 100 : 0;

    const score = coverage;
    const riskLevel = this.getRiskLevel(score);

    return {
      score,
      weight: this.weights.testCoverage,
      details: `Line coverage: ${coverage.toFixed(1)}% (${coveredLines}/${totalLines} lines)`,
      riskLevel,
    };
  }

  /**
   * Calculate API exposure-based safety metric
   */
  private calculateApiExposureMetric(
    projectAST: ProjectAST,
    apiEndpoints: APIEndpoint[]
  ): SafetyMetric {
    const totalExports = projectAST.modules.reduce((sum, module) => sum + module.exports.length, 0);
    const publicAPICount = projectAST.metrics.publicAPICount;
    const apiSurfaceSize = totalExports + apiEndpoints.length;

    // Lower API surface = higher safety (easier to maintain)
    let score = 100;
    if (apiSurfaceSize > 15) score -= 25; // Penalize for moderate API surface
    if (apiSurfaceSize > 50) score -= 20;
    if (apiSurfaceSize > 100) score -= 20;
    if (apiSurfaceSize > 200) score -= 30;
    if (apiEndpoints.length > 5) score -= 15; // HTTP endpoints are particularly risky
    if (apiEndpoints.length > 10) score -= 15;
    if (apiEndpoints.length > 20) score -= 15;
    if (publicAPICount > 10) score -= 15;
    if (publicAPICount > 20) score -= 15;
    if (publicAPICount > 50) score -= 15;

    const riskLevel = this.getRiskLevel(score);

    return {
      score: Math.max(0, score),
      weight: this.weights.apiExposure,
      details: `API surface: ${apiSurfaceSize} items (${apiEndpoints.length} HTTP endpoints, ${publicAPICount} public APIs)`,
      riskLevel,
    };
  }

  /**
   * Calculate dependency risk metric
   */
  private calculateDependencyRiskMetric(projectAST: ProjectAST): SafetyMetric {
    const circularDeps = projectAST.metrics.circularDependencies.length;
    const totalNodes = projectAST.dependencies.nodes.length;
    const totalEdges = projectAST.dependencies.edges.length;
    const avgFanOut = totalNodes > 0 ? totalEdges / totalNodes : 0;

    // Lower fan-out and no circular dependencies = higher safety
    let score = 100;
    if (avgFanOut > 10) score -= 20;
    if (avgFanOut > 20) score -= 20;
    if (circularDeps > 0) score -= 30;
    if (totalNodes > 100) score -= 10; // Large dependency graph

    const riskLevel = this.getRiskLevel(score);

    return {
      score: Math.max(0, score),
      weight: this.weights.dependencyRisk,
      details: `Avg fan-out: ${avgFanOut.toFixed(1)}, Circular deps: ${circularDeps}, Total nodes: ${totalNodes}`,
      riskLevel,
    };
  }

  /**
   * Calculate change frequency-based safety metric
   */
  private calculateChangeFrequencyMetric(
    projectAST: ProjectAST,
    changeFrequencyData?: ChangeFrequencyData[]
  ): SafetyMetric {
    if (!changeFrequencyData || changeFrequencyData.length === 0) {
      // Without git data, assume moderate safety
      return {
        score: 70,
        weight: this.weights.changeFrequency,
        details: 'No change frequency data available',
        riskLevel: 'medium',
      };
    }

    const avgChangesPerMonth =
      changeFrequencyData.reduce((sum, c) => sum + c.changesLastMonth, 0) /
      changeFrequencyData.length;
    const maxChangesPerMonth = Math.max(...changeFrequencyData.map(c => c.changesLastMonth));
    const highChangeFiles = changeFrequencyData.filter(c => c.changesLastMonth > 10).length;

    // Moderate change frequency is good, too high or too low can be risky
    let score = 100;
    if (avgChangesPerMonth > 15) score -= 25; // Too much churn
    if (avgChangesPerMonth < 1) score -= 15; // Potentially stagnant
    if (maxChangesPerMonth > 30) score -= 20; // Hotspot files
    if (highChangeFiles > projectAST.modules.length * 0.2) score -= 20; // Too many hotspots

    const riskLevel = this.getRiskLevel(score);

    return {
      score: Math.max(0, score),
      weight: this.weights.changeFrequency,
      details: `Avg changes/month: ${avgChangesPerMonth.toFixed(1)}, High-change files: ${highChangeFiles}`,
      riskLevel,
    };
  }

  /**
   * Calculate overall weighted score
   */
  private calculateOverallScore(metrics: SafetyMetric[]): number {
    const weightedSum = metrics.reduce((sum, metric) => sum + metric.score * metric.weight, 0);
    const totalWeight = metrics.reduce((sum, metric) => sum + metric.weight, 0);
    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  /**
   * Generate safety recommendations based on metrics
   */
  private generateRecommendations(metrics: {
    complexity: SafetyMetric;
    testCoverage: SafetyMetric;
    apiExposure: SafetyMetric;
    dependencyRisk: SafetyMetric;
    changeFrequency: SafetyMetric;
  }): SafetyRecommendation[] {
    const recommendations: SafetyRecommendation[] = [];

    // Complexity recommendations
    if (metrics.complexity.score < 60) {
      recommendations.push({
        type: 'refactoring',
        priority: metrics.complexity.score < 30 ? 'critical' : 'high',
        title: 'Reduce Code Complexity',
        description:
          'High code complexity increases the risk of introducing bugs during refactoring',
        impact: 'Reduces maintenance burden and improves code reliability',
        effort: 'medium',
        suggestedActions: [
          'Extract complex functions into smaller, focused functions',
          'Reduce nested conditional logic',
          'Apply design patterns to simplify complex interactions',
          'Consider breaking large classes into smaller, cohesive units',
        ],
      });
    }

    // Test coverage recommendations
    if (metrics.testCoverage.score < 70) {
      recommendations.push({
        type: 'testing',
        priority: metrics.testCoverage.score < 40 ? 'critical' : 'high',
        title: 'Improve Test Coverage',
        description: 'Low test coverage makes refactoring risky and error-prone',
        impact: 'Enables safer refactoring and reduces regression risk',
        effort: 'high',
        suggestedActions: [
          'Add unit tests for core business logic',
          'Implement integration tests for API endpoints',
          'Create characterization tests for legacy code',
          'Set up automated test coverage reporting',
        ],
      });
    }

    // API exposure recommendations
    if (metrics.apiExposure.score < 60) {
      recommendations.push({
        type: 'architecture',
        priority: 'medium',
        title: 'Reduce API Surface Area',
        description:
          'Large API surface area increases maintenance complexity and breaking change risk',
        impact: 'Simplifies API maintenance and reduces backward compatibility burden',
        effort: 'medium',
        suggestedActions: [
          'Make internal functions private',
          'Consolidate similar API endpoints',
          'Deprecate unused public interfaces',
          'Group related functionality into cohesive modules',
        ],
      });
    }

    // Dependency risk recommendations
    if (metrics.dependencyRisk.score < 60) {
      recommendations.push({
        type: 'architecture',
        priority: metrics.dependencyRisk.score < 30 ? 'high' : 'medium',
        title: 'Improve Dependency Structure',
        description: 'Complex dependency relationships make code harder to understand and modify',
        impact: 'Improves code modularity and reduces coupling',
        effort: 'high',
        suggestedActions: [
          'Break circular dependencies',
          'Reduce fan-out by extracting common utilities',
          'Apply dependency inversion principle',
          'Consider using dependency injection for better testability',
        ],
      });
    }

    // Change frequency recommendations
    if (metrics.changeFrequency.score < 60) {
      recommendations.push({
        type: 'process',
        priority: 'medium',
        title: 'Address Change Patterns',
        description: 'Unusual change patterns may indicate architectural or process issues',
        impact: 'Stabilizes codebase and improves development velocity',
        effort: 'low',
        suggestedActions: [
          'Identify and refactor frequently changing hotspots',
          'Improve code review processes for high-risk areas',
          'Consider feature flags for experimental changes',
          'Implement better monitoring for change impact',
        ],
      });
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  // Helper methods for risk assessment
  private assessFileRisk(
    module: ModuleAST,
    apiEndpoints: APIEndpoint[],
    coverageData?: CoverageData[],
    changeFrequencyData?: ChangeFrequencyData[]
  ): FileRiskAssessment {
    const complexity = module.complexity;
    const testCoverage = this.getFileCoverage(module.filePath, coverageData);
    const apiExposure = this.getFileApiExposure(module, apiEndpoints);
    const changeFrequency = this.getFileChangeFrequency(module.filePath, changeFrequencyData);
    const dependencyFanOut = module.imports.length;
    const dependencyFanIn = 0; // Would need cross-reference analysis

    // Calculate risk score (inverse of safety)
    const riskScore =
      100 -
      this.calculateFileScore({
        complexity,
        testCoverage,
        apiExposure,
        changeFrequency,
        dependencyFanOut,
        dependencyFanIn,
      });

    const issues = this.identifyFileIssues(module, {
      complexity,
      testCoverage,
      apiExposure,
      changeFrequency,
      dependencyFanOut,
      dependencyFanIn,
    });

    return {
      filePath: module.filePath,
      riskScore,
      complexity,
      testCoverage,
      apiExposure,
      changeFrequency,
      dependencyFanOut,
      dependencyFanIn,
      issues,
    };
  }

  private calculateGlobalMetrics(
    files: FileRiskAssessment[],
    projectAST: ProjectAST
  ): GlobalRiskMetrics {
    const averageComplexity = projectAST.metrics.averageComplexity;
    const totalTestCoverage = files.reduce((sum, f) => sum + f.testCoverage, 0) / files.length;
    const publicApiSurface = projectAST.metrics.publicAPICount;
    const dependencyHealth = 100 - projectAST.metrics.circularDependencies.length * 10;
    const architecturalDebt = (files.filter(f => f.riskScore > 70).length / files.length) * 100;

    return {
      averageComplexity,
      totalTestCoverage,
      publicApiSurface,
      dependencyHealth: Math.max(0, dependencyHealth),
      architecturalDebt,
    };
  }

  private identifyRiskHotspots(files: FileRiskAssessment[], projectAST: ProjectAST): RiskHotspot[] {
    return files
      .filter(file => file.riskScore > 70)
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 10)
      .map(file => ({
        filePath: file.filePath,
        riskScore: file.riskScore,
        primaryRiskFactors: this.getPrimaryRiskFactors(file),
        impactRadius: this.calculateImpactRadius(file.filePath, projectAST),
        recommendedActions: this.generateFileRecommendations(file),
      }));
  }

  private identifySafeRefactoringCandidates(
    files: FileRiskAssessment[],
    projectAST: ProjectAST
  ): RefactoringCandidate[] {
    return files
      .filter(file => file.riskScore < 30 && file.testCoverage > 70)
      .slice(0, 20)
      .map(file => ({
        filePath: file.filePath,
        safetyScore: 100 - file.riskScore,
        refactoringType: 'extract_function' as const,
        description: `Safe refactoring opportunity in ${file.filePath}`,
        estimatedEffort: 'low' as const,
        potentialBenefit: 'Improved code organization and maintainability',
        prerequisites: ['Ensure test coverage remains high', 'Verify no breaking changes'],
      }));
  }

  // Utility methods
  private getRiskLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
    if (score >= 80) return 'low';
    if (score >= 60) return 'medium';
    if (score >= 40) return 'high';
    return 'critical';
  }

  private isTestFile(filePath: string): boolean {
    return (
      filePath.includes('.test.') ||
      filePath.includes('.spec.') ||
      filePath.includes('__tests__') ||
      filePath.includes('test_') ||
      filePath.includes('/tests/')
    );
  }

  private getFileCoverage(filePath: string, coverageData?: CoverageData[]): number {
    if (!coverageData) return 0;
    const coverage = coverageData.find(c => c.filePath === filePath);
    return coverage ? (coverage.linesCovered / coverage.totalLines) * 100 : 0;
  }

  private getFileApiExposure(module: ModuleAST, apiEndpoints: APIEndpoint[]): number {
    const fileEndpoints = apiEndpoints.filter(
      endpoint => endpoint.location.file === module.filePath
    );
    return module.exports.length + fileEndpoints.length;
  }

  private getFileChangeFrequency(
    filePath: string,
    changeFrequencyData?: ChangeFrequencyData[]
  ): number {
    if (!changeFrequencyData) return 0;
    const changes = changeFrequencyData.find(c => c.filePath === filePath);
    return changes ? changes.changesLastMonth : 0;
  }

  private calculateFileScore(metrics: {
    complexity: number;
    testCoverage: number;
    apiExposure: number;
    changeFrequency: number;
    dependencyFanOut: number;
    dependencyFanIn: number;
  }): number {
    let score = 100;

    if (metrics.complexity > 20) score -= 30;
    if (metrics.testCoverage < 50) score -= 25;
    if (metrics.apiExposure > 10) score -= 15;
    if (metrics.changeFrequency > 15) score -= 15;
    if (metrics.dependencyFanOut > 10) score -= 10;
    if (metrics.dependencyFanIn > 10) score -= 5;

    return Math.max(0, score);
  }

  private identifyFileIssues(module: ModuleAST, metrics: any): string[] {
    const issues: string[] = [];

    if (metrics.complexity > 20) {
      issues.push(`High cyclomatic complexity (${metrics.complexity})`);
    }
    if (metrics.testCoverage < 50) {
      issues.push(`Low test coverage (${metrics.testCoverage.toFixed(1)}%)`);
    }
    if (metrics.apiExposure > 10) {
      issues.push(`High API exposure (${metrics.apiExposure} public interfaces)`);
    }
    if (metrics.changeFrequency > 15) {
      issues.push(`High change frequency (${metrics.changeFrequency} changes/month)`);
    }

    return issues;
  }

  private getPrimaryRiskFactors(file: FileRiskAssessment): string[] {
    const factors: string[] = [];

    if (file.complexity > 20) factors.push('High complexity');
    if (file.testCoverage < 50) factors.push('Low test coverage');
    if (file.apiExposure > 10) factors.push('High API exposure');
    if (file.changeFrequency > 15) factors.push('High change frequency');
    if (file.dependencyFanOut > 15) factors.push('High dependency fan-out');

    return factors;
  }

  private calculateImpactRadius(filePath: string, projectAST: ProjectAST): string[] {
    // Find files that depend on this file
    return projectAST.dependencies.edges
      .filter(edge => edge.to === filePath)
      .map(edge => edge.from)
      .slice(0, 10);
  }

  private generateFileRecommendations(file: FileRiskAssessment): string[] {
    const recommendations: string[] = [];

    if (file.complexity > 20) {
      recommendations.push('Break down complex functions into smaller units');
    }
    if (file.testCoverage < 50) {
      recommendations.push('Add comprehensive unit tests');
    }
    if (file.apiExposure > 10) {
      recommendations.push('Consider making some interfaces internal');
    }
    if (file.changeFrequency > 15) {
      recommendations.push('Investigate why this file changes frequently');
    }
    if (file.dependencyFanOut > 15) {
      recommendations.push('Reduce dependencies by extracting common utilities');
    }

    return recommendations;
  }
}
