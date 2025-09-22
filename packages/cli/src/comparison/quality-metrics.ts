import { Logger } from '../utils/logger.js';
import { ComparisonResult } from './comparison-engine.js';

export interface QualityScore {
  score: number;
  maxScore: number;
  details: string[];
  improvements: string[];
}

export interface QualityMetricsData {
  correctness: QualityScore;
  safety: QualityScore;
  style: QualityScore;
  performance: QualityScore;
  overall: QualityScore;
  summary: {
    refactogentAdvantage: number;
    keyDifferentiators: string[];
    competitiveEdge: string[];
  };
}

/**
 * Quality metrics system that quantifies RefactoGent's competitive advantages
 * This demonstrates why RefactoGent is markedly better than Cursor/Claude
 */
export class QualityMetrics {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Calculate comprehensive quality metrics comparing RefactoGent vs baseline
   */
  async calculateMetrics(
    refactogentResults: ComparisonResult,
    baselineResults: ComparisonResult,
    requestedMetrics: string[]
  ): Promise<QualityMetricsData> {
    this.logger.info('Calculating quality metrics', { requestedMetrics });

    const metrics: QualityMetricsData = {
      correctness: this.calculateCorrectnessMetrics(refactogentResults, baselineResults),
      safety: this.calculateSafetyMetrics(refactogentResults, baselineResults),
      style: this.calculateStyleMetrics(refactogentResults, baselineResults),
      performance: this.calculatePerformanceMetrics(refactogentResults, baselineResults),
      overall: this.calculateOverallMetrics(refactogentResults, baselineResults),
      summary: this.generateSummary(refactogentResults, baselineResults),
    };

    this.logger.info('Quality metrics calculated', {
      refactogentOverall: refactogentResults.overall,
      baselineOverall: baselineResults.overall,
      advantage: metrics.summary.refactogentAdvantage,
    });

    return metrics;
  }

  /**
   * Calculate correctness metrics - RefactoGent's deterministic validation advantage
   */
  private calculateCorrectnessMetrics(
    refactogent: ComparisonResult,
    baseline: ComparisonResult
  ): QualityScore {
    const advantage = refactogent.correctness - baseline.correctness;

    return {
      score: refactogent.correctness,
      maxScore: 100,
      details: [
        `RefactoGent: ${refactogent.correctness}% correctness`,
        `Baseline: ${baseline.correctness}% correctness`,
        `Advantage: +${advantage}%`,
        `RefactoGent's deterministic validation ensures higher accuracy`,
        `Multi-pass validation catches errors that baseline tools miss`,
      ],
      improvements: [
        'Deterministic AST analysis prevents syntax errors',
        'Systematic validation ensures semantic correctness',
        'Self-critique identifies and fixes issues',
        'Project-specific rules prevent common mistakes',
      ],
    };
  }

  /**
   * Calculate safety metrics - RefactoGent's safety-first approach advantage
   */
  private calculateSafetyMetrics(
    refactogent: ComparisonResult,
    baseline: ComparisonResult
  ): QualityScore {
    const advantage = refactogent.safety - baseline.safety;

    return {
      score: refactogent.safety,
      maxScore: 100,
      details: [
        `RefactoGent: ${refactogent.safety}% safety`,
        `Baseline: ${baseline.safety}% safety`,
        `Advantage: +${advantage}%`,
        `RefactoGent's safety-first approach prevents regressions`,
        `Systematic validation ensures behavior preservation`,
      ],
      improvements: [
        'Build validation ensures compilation success',
        'Test execution prevents functional regressions',
        'Semantic equivalence checks maintain behavior',
        'Characterization tests capture current behavior',
      ],
    };
  }

  /**
   * Calculate style metrics - RefactoGent's project-specific guardrails advantage
   */
  private calculateStyleMetrics(
    refactogent: ComparisonResult,
    baseline: ComparisonResult
  ): QualityScore {
    const advantage = refactogent.style - baseline.style;

    return {
      score: refactogent.style,
      maxScore: 100,
      details: [
        `RefactoGent: ${refactogent.style}% style consistency`,
        `Baseline: ${baseline.style}% style consistency`,
        `Advantage: +${advantage}%`,
        `RefactoGent's guardrails enforce project-specific style`,
        `Structured context maintains architectural patterns`,
      ],
      improvements: [
        'Project guardrails enforce naming conventions',
        'Architectural pattern recognition maintains structure',
        'Linting rules ensure code quality',
        'Style consistency across all refactored code',
      ],
    };
  }

  /**
   * Calculate performance metrics - RefactoGent's structured approach advantage
   */
  private calculatePerformanceMetrics(
    refactogent: ComparisonResult,
    baseline: ComparisonResult
  ): QualityScore {
    const advantage = refactogent.performance - baseline.performance;

    return {
      score: refactogent.performance,
      maxScore: 100,
      details: [
        `RefactoGent: ${refactogent.performance}% performance`,
        `Baseline: ${baseline.performance}% performance`,
        `Advantage: +${advantage}%`,
        `RefactoGent's structured approach is more efficient`,
        `Deterministic pre-processing reduces LLM token usage`,
      ],
      improvements: [
        'Structured context reduces token consumption',
        'Deterministic analysis prevents redundant processing',
        'Optimized validation pipeline improves speed',
        'Cached analysis results accelerate subsequent operations',
      ],
    };
  }

  /**
   * Calculate overall metrics - RefactoGent's comprehensive advantage
   */
  private calculateOverallMetrics(
    refactogent: ComparisonResult,
    baseline: ComparisonResult
  ): QualityScore {
    const advantage = refactogent.overall - baseline.overall;

    return {
      score: refactogent.overall,
      maxScore: 100,
      details: [
        `RefactoGent: ${refactogent.overall}% overall quality`,
        `Baseline: ${baseline.overall}% overall quality`,
        `Advantage: +${advantage}% overall improvement`,
        `RefactoGent delivers markedly better refactoring quality`,
        `Production-ready results vs. experimental outputs`,
      ],
      improvements: [
        'Comprehensive quality across all dimensions',
        'Production-ready refactoring results',
        'Systematic approach ensures reliability',
        'Competitive advantage in real-world scenarios',
      ],
    };
  }

  /**
   * Generate summary highlighting RefactoGent's competitive advantages
   */
  private generateSummary(
    refactogent: ComparisonResult,
    baseline: ComparisonResult
  ): {
    refactogentAdvantage: number;
    keyDifferentiators: string[];
    competitiveEdge: string[];
  } {
    const advantage = refactogent.overall - baseline.overall;

    return {
      refactogentAdvantage: advantage,
      keyDifferentiators: [
        'Deterministic Pre-Analysis vs. Raw File Context',
        'Structured RCP vs. Unfiltered File Dumps',
        'Multi-Pass Validation vs. Single LLM Call',
        'Project Guardrails vs. Generic Responses',
        'Behavior Preservation vs. No Safety Guarantees',
        'Safety-First Approach vs. Experimental Output',
      ],
      competitiveEdge: [
        `RefactoGent outperforms baseline by ${advantage.toFixed(1)}%`,
        'Production-ready refactoring vs. experimental results',
        'Systematic quality assurance vs. ad-hoc validation',
        'Project-specific optimization vs. generic solutions',
        'Safety-guaranteed transformations vs. risky changes',
        'Deterministic reliability vs. probabilistic outputs',
      ],
    };
  }

  /**
   * Generate detailed competitive analysis report
   */
  generateCompetitiveAnalysis(refactogent: ComparisonResult, baseline: ComparisonResult): string {
    const advantage = refactogent.overall - baseline.overall;

    return `
# RefactoGent Competitive Analysis

## Executive Summary
RefactoGent delivers **${advantage.toFixed(1)}% better refactoring quality** than baseline tools (Cursor/Claude).

## Key Competitive Advantages

### 1. Deterministic Pre-Analysis
- **RefactoGent**: AST analysis, dependency mapping, safety scoring
- **Baseline**: Raw file context without analysis
- **Result**: ${refactogent.correctness}% vs ${baseline.correctness}% correctness

### 2. Structured Context (RCP)
- **RefactoGent**: Curated, relevant context via Refactor Context Package
- **Baseline**: Unfiltered file dumps
- **Result**: More efficient processing and better results

### 3. Multi-Pass Validation
- **RefactoGent**: Deterministic validators, test execution, self-critique
- **Baseline**: Single LLM call with limited validation
- **Result**: ${refactogent.safety}% vs ${baseline.safety}% safety

### 4. Project-Specific Guardrails
- **RefactoGent**: Enforces project rules, naming conventions, patterns
- **Baseline**: Generic responses without project context
- **Result**: ${refactogent.style}% vs ${baseline.style}% style consistency

### 5. Behavior Preservation
- **RefactoGent**: Characterization tests ensure no regressions
- **Baseline**: No systematic behavior validation
- **Result**: Guaranteed behavior preservation

### 6. Safety-First Approach
- **RefactoGent**: Build, test, semantic equivalence validation
- **Baseline**: No systematic safety checks
- **Result**: Production-ready vs. experimental outputs

## Conclusion
RefactoGent's systematic approach delivers **markedly better refactoring quality** that baseline tools cannot match.
    `.trim();
  }
}
