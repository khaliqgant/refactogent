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
    logger = new Logger('test');
    suggestionEngine = new SuggestionEngine(logger);

    // Create mock project AST
    const mockModule: ModuleAST = {
      filePath: 'src/example.ts',
      language: 'typescript',
      loc: 100,
      complexity: 20,
      imports: [
        { source: 'lodash', specifiers: ['map', 'filter'] },
        { source: './utils', specifiers: ['helper'] },
        { source: 'unused-lib', specifiers: ['unusedFunction'] },
      ],
      exports: [
        { name: 'ExampleClass', type: 'class' },
        { name: 'helperFunction', type: 'function' },
      ],
      functions: [
        {
          name: 'complexFunction',
          complexity: 15,
          loc: 50,
          parameters: 8,
          returnType: 'Promise<Result>',
          isAsync: true,
          isExported: true,
        },
      ],
      classes: [
        {
          name: 'ExampleClass',
          methods: 12,
          complexity: 25,
          loc: 80,
          isExported: true,
        },
      ],
      symbols: [],
      dependencies: ['lodash', './utils', 'unused-lib'],
    };

    mockProjectAST = {
      projectPath: '/test/project',
      modules: [mockModule],
      languages: ['typescript'],
      totalFiles: 1,
      totalLoc: 100,
      dependencies: {
        production: ['lodash'],
        development: ['vitest'],
        peer: [],
      },
    };

    // Create mock safety score
    mockSafetyScore = {
      overall: 75,
      complexity: {
        score: 70,
        details: {
          averageComplexity: 15,
          maxComplexity: 25,
          highComplexityFiles: 1,
        },
      },
      testCoverage: {
        score: 80,
        details: {
          linesCovered: 80,
          totalLines: 100,
          branchesCovered: 75,
          totalBranches: 100,
        },
      },
      apiExposure: {
        score: 85,
        details: {
          publicFunctions: 5,
          publicClasses: 2,
          httpRoutes: 0,
          cliCommands: 0,
        },
      },
      dependencyRisk: {
        score: 90,
        details: {
          totalDependencies: 2,
          outdatedDependencies: 0,
          vulnerableDependencies: 0,
        },
      },
      changeFrequency: {
        score: 95,
        details: {
          recentChanges: 2,
          averageChangesPerWeek: 1,
          hotspotFiles: [],
        },
      },
    };

    // Create mock coverage report
    mockCoverageReport = {
      overall: {
        line: 80,
        branch: 75,
        function: 85,
        statement: 82,
      },
      files: [
        {
          path: 'src/example.ts',
          coverage: {
            line: 80,
            branch: 75,
            function: 85,
            statement: 82,
          },
        },
      ],
      timestamp: new Date().toISOString(),
      tool: 'nyc',
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
      const lowCoverageSafetyScore = {
        ...mockSafetyScore,
        testCoverage: {
          score: 30,
          details: {
            linesCovered: 30,
            totalLines: 100,
            branchesCovered: 25,
            totalBranches: 100,
          },
        },
      };

      const result = await suggestionEngine.generateSuggestions(
        mockProjectAST,
        lowCoverageSafetyScore,
        mockCoverageReport
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
        modules: [],
        languages: [],
        totalFiles: 0,
        totalLoc: 0,
        dependencies: { production: [], development: [], peer: [] },
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
