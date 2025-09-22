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
    logger = new Logger(true); // Fixed: use boolean instead of string
    patternDetector = new PatternDetector(logger);

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

      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.nextSteps.length).toBeGreaterThan(0);
      expect(result.nextSteps[0]).toContain('Review the top opportunity');
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
