import { describe, it, expect, beforeEach } from '@jest/globals';
import { Logger } from '../utils/logger.js';
import { SuggestionEngine, SuggestionEngineOptions } from '../refactoring/suggestion-engine.js';
import { ProjectAST, ModuleAST } from '../analysis/ast-types.js';
import { SafetyScore } from '../analysis/safety-scorer.js';
import { CoverageReport } from '../analysis/coverage-analyzer.js';

describe('SuggestionEngine', () => {
  let suggestionEngine: SuggestionEngine;
  let logger: Logger;
  let mockProjectAST: ProjectAST;
  let mockSafetyScore: SafetyScore;
  let mockCoverageReport: CoverageReport;

  beforeEach(() => {
    logger = new Logger(true); // Fixed: use boolean instead of string
    suggestionEngine = new SuggestionEngine(logger);

    // Create mock project AST
    const mockModule: ModuleAST = {
      filePath: 'src/example.ts',
      relativePath: 'src/example.ts',
      ast: {
        id: 'module-1',
        type: 'module',
        name: 'example',
        location: {
          file: 'src/example.ts',
          startLine: 1,
          startColumn: 1,
          endLine: 100,
          endColumn: 1,
        },
        children: [],
        metadata: {
          language: 'typescript',
          visibility: 'public',
          isExported: true,
          isAsync: false,
          complexity: 20,
          dependencies: ['lodash', './utils'],
          annotations: [],
        },
      },
      exports: ['ExampleClass', 'helperFunction'],
      imports: [
        {
          source: 'lodash',
          imports: ['map', 'filter'],
          isDefault: false,
          isNamespace: false,
          location: {
            file: 'src/example.ts',
            startLine: 1,
            startColumn: 1,
            endLine: 1,
            endColumn: 20,
          },
        },
        {
          source: './utils',
          imports: ['helper'],
          isDefault: false,
          isNamespace: false,
          location: {
            file: 'src/example.ts',
            startLine: 2,
            startColumn: 1,
            endLine: 2,
            endColumn: 20,
          },
        },
        {
          source: 'unused-lib',
          imports: ['unusedFunction'],
          isDefault: false,
          isNamespace: false,
          location: {
            file: 'src/example.ts',
            startLine: 3,
            startColumn: 1,
            endLine: 3,
            endColumn: 20,
          },
        },
      ],
      complexity: 20,
      loc: 100,
    };

    mockProjectAST = {
      projectPath: '/test/project',
      language: 'typescript',
      modules: [mockModule],
      dependencies: {
        nodes: [
          { id: 'node-1', name: 'lodash', type: 'module', filePath: 'node_modules/lodash' },
          { id: 'node-2', name: 'utils', type: 'module', filePath: 'src/utils' },
        ],
        edges: [
          { from: 'src/example.ts', to: 'lodash', type: 'imports', weight: 1 },
          { from: 'src/example.ts', to: 'utils', type: 'imports', weight: 1 },
        ],
      },
      exports: {
        'src/example.ts': ['ExampleClass', 'helperFunction'],
      },
      imports: {
        'src/example.ts': mockModule.imports,
      },
      metrics: {
        totalNodes: 10,
        totalFiles: 1,
        averageComplexity: 20,
        maxComplexity: 25,
        totalLOC: 100,
        publicAPICount: 2,
        circularDependencies: [],
      },
    };

    // Create mock safety score
    mockSafetyScore = {
      overall: 75,
      complexity: {
        score: 70,
        weight: 0.25,
        details: 'Average complexity: 15, Max: 25',
        riskLevel: 'medium',
      },
      testCoverage: {
        score: 80,
        weight: 0.3,
        details: 'Line coverage: 80% (80/100 lines)',
        riskLevel: 'low',
      },
      apiExposure: {
        score: 85,
        weight: 0.2,
        details: 'API surface: 5 items (0 HTTP endpoints, 2 public APIs)',
        riskLevel: 'low',
      },
      dependencyRisk: {
        score: 90,
        weight: 0.15,
        details: 'Avg fan-out: 2.0, Circular deps: 0, Total nodes: 2',
        riskLevel: 'low',
      },
      changeFrequency: {
        score: 95,
        weight: 0.1,
        details: 'Avg changes/month: 1.0, High-change files: 0',
        riskLevel: 'low',
      },
      recommendations: [],
    };

    // Create mock coverage report
    mockCoverageReport = {
      projectPath: '/test/project',
      language: 'typescript',
      timestamp: new Date(),
      overallCoverage: {
        linesCovered: 80,
        totalLines: 100,
        linePercentage: 80,
        branchesCovered: 75,
        totalBranches: 100,
        branchPercentage: 75,
        functionsCovered: 85,
        totalFunctions: 100,
        functionPercentage: 85,
        statementsCovered: 82,
        totalStatements: 100,
        statementPercentage: 82,
      },
      fileCoverage: [
        {
          filePath: 'src/example.ts',
          relativePath: 'src/example.ts',
          metrics: {
            linesCovered: 80,
            totalLines: 100,
            linePercentage: 80,
            branchesCovered: 75,
            totalBranches: 100,
            branchPercentage: 75,
            functionsCovered: 85,
            totalFunctions: 100,
            functionPercentage: 85,
            statementsCovered: 82,
            totalStatements: 100,
            statementPercentage: 82,
          },
          uncoveredLines: [10, 20, 30],
          uncoveredBranches: [],
          riskLevel: 'low',
          recommendations: ['Add tests for uncovered lines'],
        },
      ],
      summary: {
        totalFiles: 1,
        coveredFiles: 1,
        wellCoveredFiles: 1,
        poorlyCoveredFiles: 0,
        uncoveredFiles: 0,
        averageCoverage: 80,
        coverageDistribution: {
          excellent: 0,
          good: 1,
          fair: 0,
          poor: 0,
          critical: 0,
        },
        riskAssessment: {
          highRiskFiles: [],
          criticalGaps: [],
          recommendations: [],
        },
      },
    };
  });

  describe('generateSuggestions', () => {
    it('should generate comprehensive suggestions with all components', async () => {
      const options: SuggestionEngineOptions = {
        prioritizeBy: 'safety',
        maxSuggestions: 10,
        skillLevel: 'intermediate',
      };

      const result = await suggestionEngine.generateSuggestions(
        mockProjectAST,
        mockSafetyScore,
        mockCoverageReport,
        options
      );

      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.summary).toBeDefined();
      expect(result.roadmap).toBeDefined();
      expect(result.quickWins).toBeDefined();
      expect(result.recommendations).toBeDefined();

      // Check suggestion structure
      const suggestion = result.suggestions[0];
      expect(suggestion.id).toBeDefined();
      expect(suggestion.opportunity).toBeDefined();
      expect(suggestion.priority).toBeDefined();
      expect(suggestion.readiness).toBeDefined();
      expect(suggestion.impact).toBeDefined();
      expect(suggestion.implementation).toBeDefined();
      expect(suggestion.timeline).toBeDefined();
    });

    it('should prioritize suggestions by safety when specified', async () => {
      const options: SuggestionEngineOptions = {
        prioritizeBy: 'safety',
        maxSuggestions: 5,
      };

      const result = await suggestionEngine.generateSuggestions(
        mockProjectAST,
        mockSafetyScore,
        mockCoverageReport,
        options
      );

      // Suggestions should be ordered by safety rating (highest first)
      for (let i = 0; i < result.suggestions.length - 1; i++) {
        const currentSafety = result.suggestions[i].opportunity.safetyRating;
        const nextSafety = result.suggestions[i + 1].opportunity.safetyRating;
        expect(currentSafety).toBeGreaterThanOrEqual(nextSafety);
      }
    });

    it('should prioritize suggestions by impact when specified', async () => {
      const options: SuggestionEngineOptions = {
        prioritizeBy: 'impact',
        maxSuggestions: 5,
      };

      const result = await suggestionEngine.generateSuggestions(
        mockProjectAST,
        mockSafetyScore,
        mockCoverageReport,
        options
      );

      // Suggestions should be ordered by impact (highest first)
      for (let i = 0; i < result.suggestions.length - 1; i++) {
        const currentImpact = result.suggestions[i].impact.overallBenefit;
        const nextImpact = result.suggestions[i + 1].impact.overallBenefit;
        expect(currentImpact).toBeGreaterThanOrEqual(nextImpact);
      }
    });

    it('should adjust safety threshold based on skill level', async () => {
      const beginnerOptions: SuggestionEngineOptions = {
        skillLevel: 'beginner',
        maxSuggestions: 10,
      };

      const advancedOptions: SuggestionEngineOptions = {
        skillLevel: 'advanced',
        maxSuggestions: 10,
      };

      const beginnerResult = await suggestionEngine.generateSuggestions(
        mockProjectAST,
        mockSafetyScore,
        mockCoverageReport,
        beginnerOptions
      );

      const advancedResult = await suggestionEngine.generateSuggestions(
        mockProjectAST,
        mockSafetyScore,
        mockCoverageReport,
        advancedOptions
      );

      // Advanced users should get more suggestions (lower safety threshold)
      expect(advancedResult.suggestions.length).toBeGreaterThanOrEqual(
        beginnerResult.suggestions.length
      );
    });

    it('should identify quick wins correctly', async () => {
      const result = await suggestionEngine.generateSuggestions(
        mockProjectAST,
        mockSafetyScore,
        mockCoverageReport
      );

      const quickWins = result.quickWins;

      for (const quickWin of quickWins) {
        expect(quickWin.timeline.quickWin).toBe(true);
        expect(quickWin.timeline.estimatedDays).toBeLessThanOrEqual(1);
        expect(quickWin.opportunity.safetyRating).toBeGreaterThanOrEqual(80);
      }
    });

    it('should generate accurate summary statistics', async () => {
      const result = await suggestionEngine.generateSuggestions(
        mockProjectAST,
        mockSafetyScore,
        mockCoverageReport
      );

      const { summary } = result;

      expect(summary.totalSuggestions).toBe(result.suggestions.length);
      expect(summary.readySuggestions).toBeLessThanOrEqual(summary.totalSuggestions);
      expect(summary.quickWins).toBeLessThanOrEqual(summary.totalSuggestions);
      expect(summary.highImpactSuggestions).toBeLessThanOrEqual(summary.totalSuggestions);
      expect(summary.averageImpact).toBeGreaterThanOrEqual(0);
      expect(summary.averageImpact).toBeLessThanOrEqual(100);
      expect(summary.averageRisk).toBeGreaterThanOrEqual(0);
      expect(summary.averageRisk).toBeLessThanOrEqual(100);
      expect(summary.estimatedTotalHours).toBeGreaterThan(0);
    });

    it('should create implementation plans with proper phases', async () => {
      const result = await suggestionEngine.generateSuggestions(
        mockProjectAST,
        mockSafetyScore,
        mockCoverageReport
      );

      const suggestion = result.suggestions[0];
      const { implementation } = suggestion;

      expect(implementation.phases.length).toBeGreaterThan(0);
      expect(implementation.totalEstimatedHours).toBeGreaterThan(0);
      expect(Array.isArray(implementation.requiredSkills)).toBe(true);
      expect(Array.isArray(implementation.tools)).toBe(true);
      expect(Array.isArray(implementation.dependencies)).toBe(true);

      // Check phase structure
      const phase = implementation.phases[0];
      expect(phase.name).toBeDefined();
      expect(phase.description).toBeDefined();
      expect(phase.estimatedHours).toBeGreaterThan(0);
      expect(Array.isArray(phase.tasks)).toBe(true);
      expect(Array.isArray(phase.deliverables)).toBe(true);
      expect(Array.isArray(phase.risks)).toBe(true);
    });

    it('should assess readiness with proper prerequisite checking', async () => {
      const result = await suggestionEngine.generateSuggestions(
        mockProjectAST,
        mockSafetyScore,
        mockCoverageReport
      );

      const suggestion = result.suggestions[0];
      const { readiness } = suggestion;

      expect(typeof readiness.isReady).toBe('boolean');
      expect(Array.isArray(readiness.blockers)).toBe(true);
      expect(Array.isArray(readiness.prerequisites)).toBe(true);
      expect(readiness.riskLevel).toMatch(/^(low|medium|high|critical)$/);
      expect(readiness.confidence).toBeGreaterThanOrEqual(0);
      expect(readiness.confidence).toBeLessThanOrEqual(100);

      // Check prerequisite structure
      if (readiness.prerequisites.length > 0) {
        const prereq = readiness.prerequisites[0];
        expect(prereq.name).toBeDefined();
        expect(prereq.status).toMatch(/^(met|partial|not_met)$/);
        expect(prereq.description).toBeDefined();
      }
    });

    it('should generate roadmap with phases and milestones', async () => {
      const result = await suggestionEngine.generateSuggestions(
        mockProjectAST,
        mockSafetyScore,
        mockCoverageReport
      );

      const { roadmap } = result;

      expect(Array.isArray(roadmap.phases)).toBe(true);
      expect(Array.isArray(roadmap.milestones)).toBe(true);
      expect(Array.isArray(roadmap.dependencies)).toBe(true);
      expect(roadmap.totalDuration).toBeGreaterThanOrEqual(0);

      // Check phase structure if phases exist
      if (roadmap.phases.length > 0) {
        const phase = roadmap.phases[0];
        expect(phase.name).toBeDefined();
        expect(phase.description).toBeDefined();
        expect(Array.isArray(phase.suggestions)).toBe(true);
        expect(phase.estimatedDays).toBeGreaterThanOrEqual(0);
        expect(Array.isArray(phase.prerequisites)).toBe(true);
        expect(Array.isArray(phase.outcomes)).toBe(true);
      }
    });

    it('should provide actionable recommendations', async () => {
      const result = await suggestionEngine.generateSuggestions(
        mockProjectAST,
        mockSafetyScore,
        mockCoverageReport
      );

      expect(Array.isArray(result.recommendations)).toBe(true);
      expect(result.recommendations.length).toBeGreaterThan(0);

      // Recommendations should be strings
      for (const recommendation of result.recommendations) {
        expect(typeof recommendation).toBe('string');
        expect(recommendation.length).toBeGreaterThan(0);
      }
    });

    it('should handle low test coverage appropriately', async () => {
      const lowCoverageSafetyScore: SafetyScore = {
        ...mockSafetyScore,
        testCoverage: {
          score: 30,
          weight: 0.3,
          details: 'Line coverage: 30% (30/100 lines)',
          riskLevel: 'high' as const,
        },
      };

      // Create a coverage report with low coverage for the specific file
      const lowCoverageReport: CoverageReport = {
        ...mockCoverageReport,
        fileCoverage: [
          {
            filePath: 'src/example.ts',
            relativePath: 'src/example.ts',
            metrics: {
              linesCovered: 20,
              totalLines: 100,
              linePercentage: 20, // Low coverage to trigger blockers
              branchesCovered: 15,
              totalBranches: 100,
              branchPercentage: 15,
              functionsCovered: 25,
              totalFunctions: 100,
              functionPercentage: 25,
              statementsCovered: 22,
              totalStatements: 100,
              statementPercentage: 22,
            },
            uncoveredLines: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
            uncoveredBranches: [],
            riskLevel: 'high',
            recommendations: ['Add tests for uncovered lines'],
          },
        ],
        overallCoverage: {
          linesCovered: 20,
          totalLines: 100,
          linePercentage: 20,
          branchesCovered: 15,
          totalBranches: 100,
          branchPercentage: 15,
          functionsCovered: 25,
          totalFunctions: 100,
          functionPercentage: 25,
          statementsCovered: 22,
          totalStatements: 100,
          statementPercentage: 22,
        },
      };

      const result = await suggestionEngine.generateSuggestions(
        mockProjectAST,
        lowCoverageSafetyScore,
        lowCoverageReport
      );

      // Should recommend improving test coverage
      const coverageRecommendation = result.recommendations.find(
        rec => rec.includes('test coverage') || rec.includes('coverage')
      );
      expect(coverageRecommendation).toBeDefined();

      // Suggestions should have more blockers due to low coverage
      const suggestionsWithCoverageBlockers = result.suggestions.filter(s =>
        s.readiness.blockers.some(blocker => blocker.includes('coverage'))
      );
      expect(suggestionsWithCoverageBlockers.length).toBeGreaterThan(0);
    });

    it('should handle empty project gracefully', async () => {
      const emptyProject: ProjectAST = {
        projectPath: '/empty/project',
        language: 'typescript',
        modules: [],
        dependencies: { nodes: [], edges: [] },
        exports: {},
        imports: {},
        metrics: {
          totalNodes: 0,
          totalFiles: 0,
          averageComplexity: 0,
          maxComplexity: 0,
          totalLOC: 0,
          publicAPICount: 0,
          circularDependencies: [],
        },
      };

      const result = await suggestionEngine.generateSuggestions(
        emptyProject,
        mockSafetyScore,
        mockCoverageReport
      );

      expect(result.suggestions).toHaveLength(0);
      expect(result.summary.totalSuggestions).toBe(0);
      expect(result.quickWins).toHaveLength(0);
      expect(result.recommendations[0]).toContain('No refactoring suggestions available');
    });
  });
});
