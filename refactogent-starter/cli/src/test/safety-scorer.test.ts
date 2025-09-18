import { describe, it, expect, beforeEach } from '@jest/globals';
import { SafetyScorer } from '../analysis/safety-scorer.js';
import { Logger } from '../utils/logger.js';
import { ProjectAST, ModuleAST } from '../analysis/ast-types.js';
import { APIEndpoint } from '../analysis/api-surface-detector.js';

describe('SafetyScorer', () => {
  let safetyScorer: SafetyScorer;
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger(false); // Suppress logs during tests
    safetyScorer = new SafetyScorer(logger);
  });

  describe('calculateProjectSafety', () => {
    it('should calculate safety score for a simple project', async () => {
      const projectAST: ProjectAST = {
        projectPath: '/test/project',
        language: 'typescript',
        modules: [
          {
            filePath: '/test/simple.ts',
            relativePath: 'simple.ts',
            ast: {
              id: 'simple-ts',
              type: 'module',
              name: 'simple',
              location: {
                file: '/test/simple.ts',
                startLine: 1,
                startColumn: 1,
                endLine: 10,
                endColumn: 1
              },
              children: [],
              metadata: {
                language: 'typescript',
                visibility: 'public',
                isExported: true,
                isAsync: false,
                complexity: 3,
                dependencies: [],
                annotations: []
              }
            },
            exports: ['simpleFunction'],
            imports: [
              {
                source: 'fs',
                imports: ['readFileSync'],
                isDefault: false,
                isNamespace: false,
                location: {
                  file: '/test/simple.ts',
                  startLine: 1,
                  startColumn: 1,
                  endLine: 1,
                  endColumn: 30
                }
              }
            ],
            complexity: 3,
            loc: 10
          }
        ],
        dependencies: {
          nodes: [
            {
              id: 'simple-ts',
              name: 'simple',
              type: 'module',
              filePath: '/test/simple.ts'
            }
          ],
          edges: []
        },
        exports: {
          '/test/simple.ts': ['simpleFunction']
        },
        imports: {
          '/test/simple.ts': [
            {
              source: 'fs',
              imports: ['readFileSync'],
              isDefault: false,
              isNamespace: false,
              location: {
                file: '/test/simple.ts',
                startLine: 1,
                startColumn: 1,
                endLine: 1,
                endColumn: 30
              }
            }
          ]
        },
        metrics: {
          totalNodes: 1,
          totalFiles: 1,
          averageComplexity: 3,
          maxComplexity: 3,
          totalLOC: 10,
          publicAPICount: 1,
          circularDependencies: []
        }
      };

      const apiEndpoints: APIEndpoint[] = [];

      const result = await safetyScorer.calculateProjectSafety(projectAST, apiEndpoints);

      expect(result).toBeDefined();
      expect(result.overall).toBeGreaterThan(0);
      expect(result.overall).toBeLessThanOrEqual(100);
      expect(result.complexity).toBeDefined();
      expect(result.testCoverage).toBeDefined();
      expect(result.apiExposure).toBeDefined();
      expect(result.dependencyRisk).toBeDefined();
      expect(result.changeFrequency).toBeDefined();
      expect(result.recommendations).toBeInstanceOf(Array);
    });

    it('should penalize high complexity', async () => {
      const highComplexityAST: ProjectAST = {
        projectPath: '/test/project',
        language: 'typescript',
        modules: [
          {
            filePath: '/test/complex.ts',
            relativePath: 'complex.ts',
            ast: {
              id: 'complex-ts',
              type: 'module',
              name: 'complex',
              location: {
                file: '/test/complex.ts',
                startLine: 1,
                startColumn: 1,
                endLine: 50,
                endColumn: 1
              },
              children: [],
              metadata: {
                language: 'typescript',
                visibility: 'public',
                isExported: true,
                isAsync: false,
                complexity: 25,
                dependencies: [],
                annotations: []
              }
            },
            exports: ['complexFunction'],
            imports: [],
            complexity: 25, // High complexity
            loc: 100
          }
        ],
        dependencies: { nodes: [], edges: [] },
        exports: { '/test/complex.ts': ['complexFunction'] },
        imports: { '/test/complex.ts': [] },
        metrics: {
          totalNodes: 1,
          totalFiles: 1,
          averageComplexity: 25,
          maxComplexity: 25,
          totalLOC: 100,
          publicAPICount: 1,
          circularDependencies: []
        }
      };

      const result = await safetyScorer.calculateProjectSafety(highComplexityAST, []);

      expect(result.complexity.score).toBeLessThan(70); // Should be penalized
      expect(result.complexity.riskLevel).toMatch(/medium|high|critical/);
    });

    it('should reward good test coverage estimation', async () => {
      const projectWithTests: ProjectAST = {
        projectPath: '/test/project',
        language: 'typescript',
        modules: [
          {
            filePath: '/test/well-tested.ts',
            relativePath: 'well-tested.ts',
            ast: {
              id: 'well-tested-ts',
              type: 'module',
              name: 'well-tested',
              location: {
                file: '/test/well-tested.ts',
                startLine: 1,
                startColumn: 1,
                endLine: 20,
                endColumn: 1
              },
              children: [],
              metadata: {
                language: 'typescript',
                visibility: 'public',
                isExported: true,
                isAsync: false,
                complexity: 5,
                dependencies: [],
                annotations: []
              }
            },
            exports: [],
            imports: [],
            complexity: 5,
            loc: 20
          },
          {
            filePath: '/test/well-tested.test.ts',
            relativePath: 'well-tested.test.ts',
            ast: {
              id: 'well-tested-test-ts',
              type: 'module',
              name: 'well-tested-test',
              location: {
                file: '/test/well-tested.test.ts',
                startLine: 1,
                startColumn: 1,
                endLine: 15,
                endColumn: 1
              },
              children: [],
              metadata: {
                language: 'typescript',
                visibility: 'public',
                isExported: false,
                isAsync: false,
                complexity: 2,
                dependencies: [],
                annotations: []
              }
            },
            exports: [],
            imports: [],
            complexity: 2,
            loc: 15
          }
        ],
        dependencies: { nodes: [], edges: [] },
        exports: {},
        imports: {},
        metrics: {
          totalNodes: 2,
          totalFiles: 2,
          averageComplexity: 3.5,
          maxComplexity: 5,
          totalLOC: 35,
          publicAPICount: 0,
          circularDependencies: []
        }
      };

      const result = await safetyScorer.calculateProjectSafety(projectWithTests, []);

      // Should get some credit for having test files
      expect(result.testCoverage.score).toBeGreaterThan(0);
    });

    it('should penalize high API exposure', async () => {
      const projectWithManyExports: ProjectAST = {
        projectPath: '/test/project',
        language: 'typescript',
        modules: [
          {
            filePath: '/test/many-exports.ts',
            relativePath: 'many-exports.ts',
            ast: {
              id: 'many-exports-ts',
              type: 'module',
              name: 'many-exports',
              location: {
                file: '/test/many-exports.ts',
                startLine: 1,
                startColumn: 1,
                endLine: 50,
                endColumn: 1
              },
              children: [],
              metadata: {
                language: 'typescript',
                visibility: 'public',
                isExported: true,
                isAsync: false,
                complexity: 5,
                dependencies: [],
                annotations: []
              }
            },
            exports: Array.from({ length: 15 }, (_, i) => `export${i}`),
            imports: [],
            complexity: 5,
            loc: 50
          }
        ],
        dependencies: { nodes: [], edges: [] },
        exports: { '/test/many-exports.ts': Array.from({ length: 15 }, (_, i) => `export${i}`) },
        imports: {},
        metrics: {
          totalNodes: 1,
          totalFiles: 1,
          averageComplexity: 5,
          maxComplexity: 5,
          totalLOC: 50,
          publicAPICount: 15,
          circularDependencies: []
        }
      };

      const apiEndpoints: APIEndpoint[] = Array.from({ length: 10 }, (_, i) => ({
        type: 'http',
        name: `endpoint${i}`,
        signature: `GET /api/endpoint${i}`,
        location: {
          file: '/test/many-exports.ts',
          line: i + 20
        },
        parameters: [],
        isPublic: true,
        method: 'GET',
        path: `/api/endpoint${i}`
      }));

      const result = await safetyScorer.calculateProjectSafety(projectWithManyExports, apiEndpoints);

      expect(result.apiExposure.score).toBeLessThan(80); // Should be penalized for high API surface
    });
  });

  describe('generateRiskProfile', () => {
    it('should generate risk profile with basic metrics', async () => {
      const simpleProjectAST: ProjectAST = {
        projectPath: '/test/project',
        language: 'typescript',
        modules: [
          {
            filePath: '/test/simple.ts',
            relativePath: 'simple.ts',
            ast: {
              id: 'simple-ts',
              type: 'module',
              name: 'simple',
              location: {
                file: '/test/simple.ts',
                startLine: 1,
                startColumn: 1,
                endLine: 10,
                endColumn: 1
              },
              children: [],
              metadata: {
                language: 'typescript',
                visibility: 'public',
                isExported: true,
                isAsync: false,
                complexity: 5,
                dependencies: [],
                annotations: []
              }
            },
            exports: ['simpleFunction'],
            imports: [],
            complexity: 5,
            loc: 10
          }
        ],
        dependencies: { nodes: [], edges: [] },
        exports: { '/test/simple.ts': ['simpleFunction'] },
        imports: {},
        metrics: {
          totalNodes: 1,
          totalFiles: 1,
          averageComplexity: 5,
          maxComplexity: 5,
          totalLOC: 10,
          publicAPICount: 1,
          circularDependencies: []
        }
      };

      const result = await safetyScorer.generateRiskProfile(simpleProjectAST, []);

      expect(result).toBeDefined();
      expect(result.files).toHaveLength(1);
      expect(result.globalMetrics).toBeDefined();
      expect(result.riskHotspots).toBeInstanceOf(Array);
      expect(result.safeRefactoringCandidates).toBeInstanceOf(Array);
      expect(result.globalMetrics.averageComplexity).toBe(5);
    });
  });
});