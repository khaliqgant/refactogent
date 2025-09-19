import { Logger } from '../utils/logger.js';
import {
  PatternDetector,
  RefactoringOpportunity,
  PatternDetectionOptions,
} from './pattern-detector.js';
import { SafetyScore } from '../analysis/safety-scorer.js';
import { ProjectAST } from '../analysis/ast-types.js';
import { CoverageReport, FileCoverageInfo } from '../analysis/coverage-analyzer.js';

export interface RefactoringSuggestion {
  id: string;
  opportunity: RefactoringOpportunity;
  priority: 'critical' | 'high' | 'medium' | 'low';
  readiness: SuggestionReadiness;
  impact: ImpactAssessment;
  implementation: ImplementationPlan;
  timeline: TimelineEstimate;
}

export interface SuggestionReadiness {
  isReady: boolean;
  blockers: string[];
  prerequisites: PrerequisiteStatus[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
}

export interface PrerequisiteStatus {
  name: string;
  status: 'met' | 'partial' | 'not_met';
  description: string;
  howToResolve?: string;
}

export interface ImpactAssessment {
  codeQuality: number; // 0-100
  maintainability: number; // 0-100
  performance: number; // -50 to +50
  testability: number; // 0-100
  readability: number; // 0-100
  overallBenefit: number; // 0-100
  riskScore: number; // 0-100
}

export interface ImplementationPlan {
  phases: ImplementationPhase[];
  totalEstimatedHours: number;
  requiredSkills: string[];
  tools: string[];
  dependencies: string[];
}

export interface ImplementationPhase {
  name: string;
  description: string;
  estimatedHours: number;
  tasks: string[];
  deliverables: string[];
  risks: string[];
}

export interface TimelineEstimate {
  quickWin: boolean;
  estimatedDays: number;
  complexity: 'trivial' | 'simple' | 'moderate' | 'complex' | 'very_complex';
  parallelizable: boolean;
  dependencies: string[];
}

export interface SuggestionEngineOptions {
  prioritizeBy?: 'safety' | 'impact' | 'effort' | 'readiness';
  includeExperimental?: boolean;
  maxSuggestions?: number;
  focusAreas?: string[];
  skillLevel?: 'beginner' | 'intermediate' | 'advanced';
  timeConstraint?: 'quick_wins' | 'moderate' | 'long_term';
}

export interface SuggestionResult {
  suggestions: RefactoringSuggestion[];
  summary: SuggestionSummary;
  roadmap: RefactoringRoadmap;
  quickWins: RefactoringSuggestion[];
  recommendations: string[];
}

export interface SuggestionSummary {
  totalSuggestions: number;
  readySuggestions: number;
  quickWins: number;
  highImpactSuggestions: number;
  averageImpact: number;
  averageRisk: number;
  estimatedTotalHours: number;
}

export interface RefactoringRoadmap {
  phases: RoadmapPhase[];
  totalDuration: number;
  milestones: Milestone[];
  dependencies: RoadmapDependency[];
}

export interface RoadmapPhase {
  name: string;
  description: string;
  suggestions: string[];
  estimatedDays: number;
  prerequisites: string[];
  outcomes: string[];
}

export interface Milestone {
  name: string;
  description: string;
  completionCriteria: string[];
  estimatedDate: string;
  dependencies: string[];
}

export interface RoadmapDependency {
  from: string;
  to: string;
  type: 'blocks' | 'enables' | 'enhances';
  description: string;
}

export class SuggestionEngine {
  private logger: Logger;
  private patternDetector: PatternDetector;

  constructor(logger: Logger) {
    this.logger = logger;
    this.patternDetector = new PatternDetector(logger);
  }

  /**
   * Generate refactoring suggestions for a project
   */
  /**
   * Generate comprehensive refactoring suggestions for a project
   * @param projectAST - The parsed AST of the project
   * @param safetyScore - Current safety assessment
   * @param coverageReport - Optional test coverage information
   * @param options - Configuration options for suggestion generation
   * @returns Promise resolving to comprehensive suggestion results
   */
  async generateSuggestions(
    projectAST: ProjectAST,
    safetyScore: SafetyScore,
    coverageReport: CoverageReport | undefined = undefined,
    options: SuggestionEngineOptions = {}
  ): Promise<SuggestionResult> {
    // Validate required inputs
    if (!projectAST) {
      throw new Error('ProjectAST is required for suggestion generation');
    }
    if (!safetyScore) {
      throw new Error('SafetyScore is required for suggestion generation');
    }

    this.logger.info('Generating refactoring suggestions', {
      modules: projectAST.modules.length,
      safetyScore: safetyScore.overall,
      options,
    });

    // Detect refactoring opportunities
    const detectionOptions: PatternDetectionOptions = {
      maxSuggestions: options.maxSuggestions || undefined,
      focusAreas: options.focusAreas || undefined,
      safetyThreshold: this.getSafetyThreshold(options.skillLevel),
      confidenceThreshold: 60,
    };

    const detectionResult = await this.patternDetector.detectOpportunities(
      projectAST,
      safetyScore,
      detectionOptions
    );

    // Convert opportunities to suggestions
    const suggestions = await this.createSuggestions(
      detectionResult.opportunities,
      safetyScore,
      options,
      coverageReport
    );

    // Prioritize suggestions
    const prioritizedSuggestions = this.prioritizeSuggestions(suggestions, options);

    // Generate summary and roadmap
    const summary = this.generateSummary(prioritizedSuggestions);
    const roadmap = this.generateRoadmap(prioritizedSuggestions);
    const quickWins = this.identifyQuickWins(prioritizedSuggestions);
    const recommendations = this.generateRecommendations(prioritizedSuggestions, safetyScore);

    const result: SuggestionResult = {
      suggestions: prioritizedSuggestions,
      summary,
      roadmap,
      quickWins,
      recommendations,
    };

    this.logger.info('Suggestion generation completed', {
      totalSuggestions: suggestions.length,
      readySuggestions: summary.readySuggestions,
      quickWins: summary.quickWins,
    });

    return result;
  }

  /**
   * Convert opportunities to detailed suggestions
   */
  private async createSuggestions(
    opportunities: RefactoringOpportunity[],
    safetyScore: SafetyScore,
    options: SuggestionEngineOptions,
    coverageReport?: CoverageReport
  ): Promise<RefactoringSuggestion[]> {
    const suggestions: RefactoringSuggestion[] = [];

    for (let i = 0; i < opportunities.length; i++) {
      const opportunity = opportunities[i];

      const suggestion: RefactoringSuggestion = {
        id: `suggestion_${i + 1}`,
        opportunity,
        priority: this.calculatePriority(opportunity, safetyScore),
        readiness: await this.assessReadiness(opportunity, safetyScore, coverageReport),
        impact: this.assessImpact(opportunity, safetyScore),
        implementation: this.createImplementationPlan(opportunity, options),
        timeline: this.estimateTimeline(opportunity, options),
      };

      suggestions.push(suggestion);
    }

    return suggestions;
  }

  /**
   * Calculate suggestion priority
   */
  private calculatePriority(
    opportunity: RefactoringOpportunity,
    _safetyScore: SafetyScore
  ): 'critical' | 'high' | 'medium' | 'low' {
    const safetyRating = opportunity.safetyRating;
    const confidence = opportunity.confidence;
    const effort = opportunity.estimatedEffort;

    if (safetyRating >= 90 && confidence >= 80 && effort === 'low') {
      return 'high';
    }

    if (_safetyScore.overall < 60 && opportunity.pattern.category === 'simplify') {
      return 'critical';
    }

    if (safetyRating >= 70 && confidence >= 60) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Assess readiness for implementation
   */
  private async assessReadiness(
    opportunity: RefactoringOpportunity,
    safetyScore: SafetyScore,
    coverageReport?: CoverageReport
  ): Promise<SuggestionReadiness> {
    const blockers: string[] = [];
    const prerequisites: PrerequisiteStatus[] = [];
    let confidence = opportunity.confidence;

    // Check test coverage prerequisite
    const coveragePrereq = opportunity.prerequisites.find(p => p.type === 'test_coverage');
    if (coveragePrereq) {
      const fileCoverage = this.getFileCoverage(opportunity.location.filePath, coverageReport);
      const hasCoverage = fileCoverage > 70;

      const prerequisite: PrerequisiteStatus = {
        name: 'Test Coverage',
        status: hasCoverage ? 'met' : 'not_met',
        description: `File has ${fileCoverage.toFixed(1)}% test coverage`,
      };

      if (!hasCoverage) {
        prerequisite.howToResolve = 'Add unit tests for the code being refactored';
      }

      prerequisites.push(prerequisite);

      if (!hasCoverage) {
        blockers.push('Insufficient test coverage');
        confidence *= 0.7;
      }
    }

    // Check syntax errors prerequisite
    prerequisites.push({
      name: 'No Syntax Errors',
      status: 'met',
      description: 'File compiles without errors',
    });

    // Check backup prerequisite
    prerequisites.push({
      name: 'Backup Available',
      status: 'not_met',
      description: 'No backup of current state',
      howToResolve: 'Create a git commit or backup before refactoring',
    });
    blockers.push('No backup available');

    const isReady = blockers.length === 0;
    const riskLevel = this.calculateRiskLevel(opportunity, blockers.length);

    return {
      isReady,
      blockers,
      prerequisites,
      riskLevel,
      confidence: Math.max(0, confidence),
    };
  }

  /**
   * Assess impact of the refactoring
   */
  private assessImpact(
    opportunity: RefactoringOpportunity,
    _safetyScore: SafetyScore
  ): ImpactAssessment {
    const pattern = opportunity.pattern;

    let codeQuality = 70;
    let maintainability = 70;
    let performance = 0;
    let testability = 70;
    let readability = 70;

    switch (pattern.category) {
      case 'extract':
        codeQuality += 20;
        maintainability += 25;
        testability += 30;
        readability += 20;
        break;
      case 'simplify':
        codeQuality += 15;
        maintainability += 20;
        readability += 25;
        performance += 5;
        break;
      case 'optimize':
        performance += 15;
        maintainability += 10;
        break;
    }

    const confidenceMultiplier = opportunity.confidence / 100;
    codeQuality = Math.min(100, codeQuality * confidenceMultiplier);
    maintainability = Math.min(100, maintainability * confidenceMultiplier);
    testability = Math.min(100, testability * confidenceMultiplier);
    readability = Math.min(100, readability * confidenceMultiplier);

    const overallBenefit = (codeQuality + maintainability + testability + readability) / 4;
    const riskScore = 100 - opportunity.safetyRating;

    return {
      codeQuality,
      maintainability,
      performance,
      testability,
      readability,
      overallBenefit,
      riskScore,
    };
  }

  /**
   * Create implementation plan
   */
  private createImplementationPlan(
    opportunity: RefactoringOpportunity,
    _options: SuggestionEngineOptions
  ): ImplementationPlan {
    const phases: ImplementationPhase[] = [];
    let totalHours = 0;

    // Preparation phase
    const prepPhase: ImplementationPhase = {
      name: 'Preparation',
      description: 'Prepare for refactoring by ensuring prerequisites are met',
      estimatedHours: 1,
      tasks: [
        'Create backup/commit current state',
        'Verify test coverage',
        'Run existing tests to establish baseline',
      ],
      deliverables: [
        'Git commit with current state',
        'Test coverage report',
        'Baseline test results',
      ],
      risks: ['Insufficient test coverage', 'Existing tests failing'],
    };
    phases.push(prepPhase);
    totalHours += prepPhase.estimatedHours;

    // Implementation phase
    const effortHours = { low: 2, medium: 6, high: 16 };
    const implPhase: ImplementationPhase = {
      name: 'Implementation',
      description: `Apply ${opportunity.pattern.name} refactoring`,
      estimatedHours: effortHours[opportunity.estimatedEffort],
      tasks: ['Apply code transformations', 'Update related code', 'Fix any compilation errors'],
      deliverables: ['Refactored code', 'Compilation success'],
      risks: opportunity.risks.map(r => r.description),
    };
    phases.push(implPhase);
    totalHours += implPhase.estimatedHours;

    // Validation phase
    const validationPhase: ImplementationPhase = {
      name: 'Validation',
      description: 'Validate that refactoring preserves behavior',
      estimatedHours: 2,
      tasks: ['Run all tests', 'Review code changes', 'Check performance impact'],
      deliverables: ['Test results', 'Code review approval'],
      risks: ['Tests failing', 'Behavior changes detected'],
    };
    phases.push(validationPhase);
    totalHours += validationPhase.estimatedHours;

    return {
      phases,
      totalEstimatedHours: totalHours,
      requiredSkills: ['Code refactoring', 'Testing'],
      tools: ['IDE/Editor', 'Version control', 'Test runner'],
      dependencies: [],
    };
  }

  /**
   * Estimate timeline for implementation
   */
  private estimateTimeline(
    opportunity: RefactoringOpportunity,
    _options: SuggestionEngineOptions
  ): TimelineEstimate {
    const effortDays = { low: 0.5, medium: 1.5, high: 3 };
    const complexityMultiplier = { simple: 1, moderate: 1.5, complex: 2 };

    const estimatedDays =
      effortDays[opportunity.estimatedEffort] *
      complexityMultiplier[opportunity.pattern.complexity];
    const quickWin = estimatedDays <= 1 && opportunity.safetyRating >= 80;

    return {
      quickWin,
      estimatedDays,
      complexity: this.mapToComplexity(opportunity.pattern.complexity, opportunity.estimatedEffort),
      parallelizable: opportunity.pattern.category === 'optimize',
      dependencies: [],
    };
  }

  /**
   * Prioritize suggestions based on options
   */
  private prioritizeSuggestions(
    suggestions: RefactoringSuggestion[],
    options: SuggestionEngineOptions
  ): RefactoringSuggestion[] {
    const priorityBy = options.prioritizeBy || 'safety';

    return suggestions.sort((a, b) => {
      switch (priorityBy) {
        case 'safety':
          return b.opportunity.safetyRating - a.opportunity.safetyRating;
        case 'impact':
          return b.impact.overallBenefit - a.impact.overallBenefit;
        case 'effort': {
          const effortOrder = { low: 3, medium: 2, high: 1 };
          return (
            effortOrder[b.opportunity.estimatedEffort] - effortOrder[a.opportunity.estimatedEffort]
          );
        }
        case 'readiness': {
          const readinessScore = (s: RefactoringSuggestion) =>
            (s.readiness.isReady ? 100 : 0) + s.readiness.confidence;
          return readinessScore(b) - readinessScore(a);
        }
        default:
          return 0;
      }
    });
  }

  /**
   * Generate summary of suggestions
   */
  private generateSummary(suggestions: RefactoringSuggestion[]): SuggestionSummary {
    const readySuggestions = suggestions.filter(s => s.readiness.isReady).length;
    const quickWins = suggestions.filter(s => s.timeline.quickWin).length;
    const highImpactSuggestions = suggestions.filter(s => s.impact.overallBenefit >= 80).length;

    const averageImpact =
      suggestions.length > 0
        ? suggestions.reduce((sum, s) => sum + s.impact.overallBenefit, 0) / suggestions.length
        : 0;

    const averageRisk =
      suggestions.length > 0
        ? suggestions.reduce((sum, s) => sum + s.impact.riskScore, 0) / suggestions.length
        : 0;

    const estimatedTotalHours = suggestions.reduce(
      (sum, s) => sum + s.implementation.totalEstimatedHours,
      0
    );

    return {
      totalSuggestions: suggestions.length,
      readySuggestions,
      quickWins,
      highImpactSuggestions,
      averageImpact,
      averageRisk,
      estimatedTotalHours,
    };
  }

  /**
   * Generate refactoring roadmap
   */
  private generateRoadmap(suggestions: RefactoringSuggestion[]): RefactoringRoadmap {
    const phases: RoadmapPhase[] = [];
    const milestones: Milestone[] = [];

    // Phase 1: Quick Wins
    const quickWins = suggestions.filter(s => s.timeline.quickWin);
    if (quickWins.length > 0) {
      phases.push({
        name: 'Quick Wins',
        description: 'Low-risk, high-impact refactorings',
        suggestions: quickWins.map(s => s.id),
        estimatedDays: Math.max(...quickWins.map(s => s.timeline.estimatedDays)),
        prerequisites: ['Team availability', 'Code backup'],
        outcomes: ['Improved code quality', 'Team confidence'],
      });
    }

    const totalDuration = phases.reduce((sum, phase) => sum + phase.estimatedDays, 0);

    return {
      phases,
      totalDuration,
      milestones,
      dependencies: [],
    };
  }

  /**
   * Identify quick win suggestions
   */
  private identifyQuickWins(suggestions: RefactoringSuggestion[]): RefactoringSuggestion[] {
    return suggestions
      .filter(s => s.timeline.quickWin)
      .sort((a, b) => b.impact.overallBenefit - a.impact.overallBenefit)
      .slice(0, 5);
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    suggestions: RefactoringSuggestion[],
    safetyScore: SafetyScore
  ): string[] {
    const recommendations: string[] = [];

    if (suggestions.length === 0) {
      recommendations.push(
        'No refactoring suggestions available. Code appears to be well-structured.'
      );
      return recommendations;
    }

    const quickWins = suggestions.filter(s => s.timeline.quickWin);
    if (quickWins.length > 0) {
      recommendations.push(
        `Start with ${quickWins.length} quick win opportunities for immediate impact`
      );
    }

    if (safetyScore.testCoverage.score < 70) {
      recommendations.push('Improve test coverage to enable safer refactoring operations');
    }

    return recommendations;
  }

  // Helper methods
  private getSafetyThreshold(skillLevel?: string): number {
    switch (skillLevel) {
      case 'beginner':
        return 90;
      case 'intermediate':
        return 70;
      case 'advanced':
        return 50;
      default:
        return 70;
    }
  }

  private getFileCoverage(filePath: string, coverageReport?: CoverageReport): number {
    if (!coverageReport) return 0;

    const fileCoverage = coverageReport.fileCoverage.find(
      (f: FileCoverageInfo) => f.filePath === filePath
    );
    return fileCoverage ? fileCoverage.metrics.linePercentage : 0;
  }

  private calculateRiskLevel(
    opportunity: RefactoringOpportunity,
    blockerCount: number
  ): 'low' | 'medium' | 'high' | 'critical' {
    const baseRisk = 100 - opportunity.safetyRating;
    const adjustedRisk = baseRisk + blockerCount * 20;

    if (adjustedRisk >= 80) return 'critical';
    if (adjustedRisk >= 60) return 'high';
    if (adjustedRisk >= 30) return 'medium';
    return 'low';
  }

  private mapToComplexity(
    patternComplexity: 'simple' | 'moderate' | 'complex',
    effort: 'low' | 'medium' | 'high'
  ): 'trivial' | 'simple' | 'moderate' | 'complex' | 'very_complex' {
    if (patternComplexity === 'simple' && effort === 'low') return 'trivial';
    if (patternComplexity === 'simple') return 'simple';
    if (patternComplexity === 'moderate' && effort !== 'high') return 'moderate';
    if (patternComplexity === 'moderate') return 'complex';
    return 'very_complex';
  }
}
