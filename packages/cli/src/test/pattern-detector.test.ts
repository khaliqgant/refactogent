import { describe, it, expect, beforeEach } from '@jest/globals';
import { Logger } from '../utils/logger.js';
import { PatternDetector, PatternDetectionOptions } from '../refactoring/pattern-detector.js';
import { ProjectAST, ModuleAST } from '../analysis/ast-types.js';
import { SafetyScore } from '../analysis/safety-scorer.js';

describe('PatternDetector', () => {
  let patternDetector: PatternDetector;
  let logger: Logger;
  let mockProjectAST: ProjectAST;
  let mockSafetyScore: SafetyScore;

  beforeEach(() => {
    logger = new Logger('test');
    patternDetector = new PatternDetector(logger);

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
  });

  describe('detectOpportunities', () => {
    it('should detect extract function opportunities for complex modules', async () => {
      const options: PatternDetectionOptions = {
        categories: ['extract'],
        safetyThreshold: 80,
        confidenceThreshold: 70,
      };

      const result = await patternDetector.detectOpportunities(
        mockProjectAST,
        mockSafetyScore,
        options
      );

      expect(result.opportunities).toHaveLength(1);
      expect(result.opportunities[0].pattern.id).toBe('extract_function');
      expect(result.opportunities[0].confidence).toBeGreaterThan(70);
      expect(result.opportunities[0].safetyRating).toBeGreaterThan(80);
    });

    it('should detect extract variable opportunities for large modules', async () => {
      const options: PatternDetectionOptions = {
        categories: ['extract'],
        maxSuggestions: 5,
      };

      const result = await patternDetector.detectOpportunities(
        mockProjectAST,
        mockSafetyScore,
        options
      );

      const extractVariableOpps = result.opportunities.filter(
        opp => opp.pattern.id === 'extract_variable'
      );

      expect(extractVariableOpps).toHaveLength(1);
      expect(extractVariableOpps[0].estimatedEffort).toBe('low');
      expect(extractVariableOpps[0].safetyRating).toBeGreaterThan(90);
    });

    it('should detect simplify conditional opportunities for complex code', async () => {
      const options: PatternDetectionOptions = {
        categories: ['simplify'],
      };

      const result = await patternDetector.detectOpportunities(
        mockProjectAST,
        mockSafetyScore,
        options
      );

      const simplifyOpps = result.opportunities.filter(
        opp => opp.pattern.id === 'simplify_conditional'
      );

      expect(simplifyOpps).toHaveLength(1);
      expect(simplifyOpps[0].pattern.category).toBe('simplify');
      expect(simplifyOpps[0].estimatedEffort).toBe('medium');
    });

    it('should detect dead code removal opportunities', async () => {
      const options: PatternDetectionOptions = {
        categories: ['optimize'],
      };

      const result = await patternDetector.detectOpportunities(
        mockProjectAST,
        mockSafetyScore,
        options
      );

      const deadCodeOpps = result.opportunities.filter(
        opp => opp.pattern.id === 'remove_dead_code'
      );

      expect(deadCodeOpps).toHaveLength(1);
      expect(deadCodeOpps[0].pattern.category).toBe('optimize');
      expect(deadCodeOpps[0].safetyRating).toBeGreaterThan(95);
    });

    it('should filter opportunities by safety threshold', async () => {
      const options: PatternDetectionOptions = {
        safetyThreshold: 95,
      };

      const result = await patternDetector.detectOpportunities(
        mockProjectAST,
        mockSafetyScore,
        options
      );

      // Only dead code removal should pass the 95% safety threshold
      expect(result.opportunities).toHaveLength(1);
      expect(result.opportunities[0].pattern.id).toBe('remove_dead_code');
    });

    it('should limit suggestions based on maxSuggestions option', async () => {
      const options: PatternDetectionOptions = {
        maxSuggestions: 2,
      };

      const result = await patternDetector.detectOpportunities(
        mockProjectAST,
        mockSafetyScore,
        options
      );

      expect(result.opportunities.length).toBeLessThanOrEqual(2);
    });

    it('should generate proper summary statistics', async () => {
      const result = await patternDetector.detectOpportunities(mockProjectAST, mockSafetyScore);

      expect(result.summary.totalOpportunities).toBeGreaterThan(0);
      expect(result.summary.safeOpportunities).toBeGreaterThan(0);
      expect(result.summary.averageConfidence).toBeGreaterThan(0);
      expect(result.summary.averageSafety).toBeGreaterThan(0);
      expect(result.summary.categoryCounts).toBeDefined();
    });

    it('should provide actionable recommendations', async () => {
      const result = await patternDetector.detectOpportunities(mockProjectAST, mockSafetyScore);

      expect(result.recommendations).toHaveLength.greaterThan(0);
      expect(result.nextSteps).toHaveLength.greaterThan(0);
      expect(result.nextSteps[0]).toContain('Review the top opportunity');
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

      const result = await patternDetector.detectOpportunities(emptyProject, mockSafetyScore);

      expect(result.opportunities).toHaveLength(0);
      expect(result.summary.totalOpportunities).toBe(0);
      expect(result.recommendations[0]).toContain('No refactoring opportunities detected');
    });
  });

  describe('getAvailablePatterns', () => {
    it('should return all built-in patterns', () => {
      const patterns = patternDetector.getAvailablePatterns();

      expect(patterns.length).toBeGreaterThan(0);

      const patternIds = patterns.map(p => p.id);
      expect(patternIds).toContain('extract_function');
      expect(patternIds).toContain('extract_variable');
      expect(patternIds).toContain('simplify_conditional');
      expect(patternIds).toContain('remove_dead_code');
    });

    it('should return patterns with proper structure', () => {
      const patterns = patternDetector.getAvailablePatterns();

      for (const pattern of patterns) {
        expect(pattern.id).toBeDefined();
        expect(pattern.name).toBeDefined();
        expect(pattern.description).toBeDefined();
        expect(pattern.category).toBeDefined();
        expect(pattern.complexity).toBeDefined();
        expect(pattern.safetyLevel).toBeDefined();
        expect(Array.isArray(pattern.prerequisites)).toBe(true);
        expect(Array.isArray(pattern.benefits)).toBe(true);
        expect(Array.isArray(pattern.risks)).toBe(true);
      }
    });
  });

  describe('getPattern', () => {
    it('should return specific pattern by ID', () => {
      const pattern = patternDetector.getPattern('extract_function');

      expect(pattern).toBeDefined();
      expect(pattern!.id).toBe('extract_function');
      expect(pattern!.name).toBe('Extract Function');
      expect(pattern!.category).toBe('extract');
    });

    it('should return undefined for non-existent pattern', () => {
      const pattern = patternDetector.getPattern('non_existent_pattern');

      expect(pattern).toBeUndefined();
    });
  });
});
