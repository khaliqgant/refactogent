import { RetrievalOrchestrator, RetrievalQuery } from '../retrieval/retrieval-orchestrator.js';
import { Logger } from '../utils/logger.js';
import { RefactoGentMetrics } from '../observability/metrics.js';
import { RefactoGentTracer } from '../observability/tracing.js';
import { RefactoGentConfig } from '../config/refactogent-schema.js';

describe('RetrievalOrchestrator', () => {
  let orchestrator: RetrievalOrchestrator;
  let logger: Logger;
  let metrics: RefactoGentMetrics;
  let tracer: RefactoGentTracer;
  let config: RefactoGentConfig;

  beforeEach(() => {
    logger = new Logger();
    metrics = new RefactoGentMetrics(logger);
    tracer = new RefactoGentTracer(logger);
    config = {
      repository: {
        language: ['typescript'],
        name: 'test-repo',
        type: 'library',
      },
      paths: {
        ignore: ['node_modules/**'],
        prioritize: ['src/**'],
        tests: ['test/**', '**/*.test.ts'],
        configs: ['*.json', '*.yaml'],
      },
      safety: {
        thresholds: {
          maxChangeSize: 100,
          maxFilesAffected: 10,
          criticalPathSensitivity: 'medium',
        },
      },
      features: {
        experimental: false,
        codeGraph: true,
        crossFileAnalysis: true,
        architecturalPatterns: true,
        dependencyAnalysis: true,
      },
    } as RefactoGentConfig;

    orchestrator = new RetrievalOrchestrator(logger, metrics, tracer, config);
  });

  afterEach(async () => {
    await orchestrator.close();
  });

  describe('retrieve', () => {
    it('should perform hybrid retrieval with basic query', async () => {
      const query: RetrievalQuery = {
        intent: 'refactor',
        context: 'extract function from complex code',
        maxResults: 10,
        tokenBudget: 2000,
      };

      const result = await orchestrator.retrieve(query);

      expect(result).toBeDefined();
      expect(result.chunks).toBeDefined();
      expect(result.citations).toBeDefined();
      expect(result.retrievalMethod).toBe('hybrid');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.tokenCount).toBeGreaterThanOrEqual(0);
      expect(result.processingTime).toBeGreaterThanOrEqual(0);
    });

    it('should handle different intents', async () => {
      const intents = ['refactor', 'extract', 'inline', 'rename', 'optimize', 'test', 'document'];

      for (const intent of intents) {
        const query: RetrievalQuery = {
          intent,
          context: `perform ${intent} operation`,
          maxResults: 5,
          tokenBudget: 1000,
        };

        const result = await orchestrator.retrieve(query);
        expect(result).toBeDefined();
        expect(result.chunks).toBeDefined();
      }
    });

    it('should respect token budget constraints', async () => {
      const query: RetrievalQuery = {
        intent: 'refactor',
        context: 'extract function from complex code',
        maxResults: 20,
        tokenBudget: 1000, // Small budget
      };

      const result = await orchestrator.retrieve(query);
      expect(result.tokenCount).toBeLessThanOrEqual(1000);
    });

    it('should include test files when requested', async () => {
      const query: RetrievalQuery = {
        intent: 'test',
        context: 'generate tests for function',
        includeTests: true,
        maxResults: 10,
        tokenBudget: 2000,
      };

      const result = await orchestrator.retrieve(query);
      expect(result).toBeDefined();
      expect(result.chunks).toBeDefined();
    });

    it('should include config files when requested', async () => {
      const query: RetrievalQuery = {
        intent: 'document',
        context: 'update configuration',
        includeConfigs: true,
        maxResults: 10,
        tokenBudget: 2000,
      };

      const result = await orchestrator.retrieve(query);
      expect(result).toBeDefined();
      expect(result.chunks).toBeDefined();
    });

    it('should handle file path focus', async () => {
      const query: RetrievalQuery = {
        intent: 'refactor',
        context: 'extract function from specific file',
        filePath: 'src/utils/helper.ts',
        maxResults: 10,
        tokenBudget: 2000,
      };

      const result = await orchestrator.retrieve(query);
      expect(result).toBeDefined();
      expect(result.chunks).toBeDefined();
    });

    it('should handle symbol ID focus', async () => {
      const query: RetrievalQuery = {
        intent: 'refactor',
        context: 'extract function from specific symbol',
        symbolId: 'function-123',
        maxResults: 10,
        tokenBudget: 2000,
      };

      const result = await orchestrator.retrieve(query);
      expect(result).toBeDefined();
      expect(result.chunks).toBeDefined();
    });

    it('should generate citations for retrieved chunks', async () => {
      const query: RetrievalQuery = {
        intent: 'refactor',
        context: 'extract function from complex code',
        maxResults: 5,
        tokenBudget: 1000,
      };

      const result = await orchestrator.retrieve(query);
      expect(result.citations).toBeDefined();
      expect(Array.isArray(result.citations)).toBe(true);
    });

    it('should calculate confidence score', async () => {
      const query: RetrievalQuery = {
        intent: 'refactor',
        context: 'extract function from complex code',
        maxResults: 10,
        tokenBudget: 2000,
      };

      const result = await orchestrator.retrieve(query);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should handle empty context gracefully', async () => {
      const query: RetrievalQuery = {
        intent: 'refactor',
        context: '',
        maxResults: 10,
        tokenBudget: 2000,
      };

      const result = await orchestrator.retrieve(query);
      expect(result).toBeDefined();
      expect(result.chunks).toBeDefined();
    });

    it('should handle very large context', async () => {
      const largeContext = 'extract function from complex code '.repeat(100);
      const query: RetrievalQuery = {
        intent: 'refactor',
        context: largeContext,
        maxResults: 10,
        tokenBudget: 2000,
      };

      const result = await orchestrator.retrieve(query);
      expect(result).toBeDefined();
      expect(result.chunks).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle retrieval errors gracefully', async () => {
      // Mock a scenario that might cause an error
      const query: RetrievalQuery = {
        intent: 'refactor',
        context: 'extract function from complex code',
        maxResults: -1, // Invalid value
        tokenBudget: 2000,
      };

      // Should not throw, but handle gracefully
      const result = await orchestrator.retrieve(query);
      expect(result).toBeDefined();
    });
  });
});
