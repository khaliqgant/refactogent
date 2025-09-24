import { IntentClassifier, IntentClassification } from '../planner/intent-classifier.js';
import { Logger } from '../utils/logger.js';
import { RefactoGentMetrics } from '../observability/metrics.js';
import { RefactoGentTracer } from '../observability/tracing.js';
import { RefactoGentConfig } from '../config/refactogent-schema.js';

describe.skip('IntentClassifier', () => {
  let classifier: IntentClassifier;
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

    classifier = new IntentClassifier(logger, metrics, tracer, config);
  });

  describe('classifyIntent', () => {
    it('should classify refactor intents', async () => {
      const inputs = [
        'refactor this function',
        'extract function from complex code',
        'restructure the code',
        'clean up the implementation',
        'simplify this method',
      ];

      for (const input of inputs) {
        const result = await classifier.classifyIntent(input);
        expect(result.intent).toBe('refactor');
        expect(result.confidence).toBeGreaterThan(0);
        expect(result.complexity).toBeDefined();
        expect(result.estimatedTime).toBeGreaterThan(0);
        expect(result.requiredTools).toBeDefined();
        expect(result.riskLevel).toBeDefined();
      }
    });

    it('should classify edit intents', async () => {
      const inputs = [
        'edit this file',
        'modify the function',
        'change the implementation',
        'update the code',
        'fix the bug',
      ];

      for (const input of inputs) {
        const result = await classifier.classifyIntent(input);
        expect(result.intent).toBe('edit');
        expect(result.confidence).toBeGreaterThan(0);
      }
    });

    it('should classify explain intents', async () => {
      const inputs = [
        'explain this code',
        'what does this function do',
        'describe the implementation',
        'how does this work',
        'clarify the logic',
      ];

      for (const input of inputs) {
        const result = await classifier.classifyIntent(input);
        expect(result.intent).toBe('explain');
        expect(result.confidence).toBeGreaterThan(0);
      }
    });

    it('should classify test-gen intents', async () => {
      const inputs = [
        'generate tests',
        'create unit tests',
        'write test cases',
        'add test coverage',
        'test this function',
      ];

      for (const input of inputs) {
        const result = await classifier.classifyIntent(input);
        expect(result.intent).toBe('test-gen');
        expect(result.confidence).toBeGreaterThan(0);
      }
    });

    it('should classify doc-gen intents', async () => {
      const inputs = [
        'document this code',
        'add documentation',
        'write comments',
        'create API docs',
        'generate README',
      ];

      for (const input of inputs) {
        const result = await classifier.classifyIntent(input);
        expect(result.intent).toBe('doc-gen');
        expect(result.confidence).toBeGreaterThan(0);
      }
    });

    it('should classify migration intents', async () => {
      const inputs = [
        'migrate to new version',
        'upgrade the codebase',
        'convert to TypeScript',
        'port to new framework',
        'transform legacy code',
      ];

      for (const input of inputs) {
        const result = await classifier.classifyIntent(input);
        expect(result.intent).toBe('migration');
        expect(result.confidence).toBeGreaterThan(0);
      }
    });

    it('should classify optimize intents', async () => {
      const inputs = [
        'optimize performance',
        'improve speed',
        'reduce memory usage',
        'fix bottleneck',
        'make it faster',
      ];

      for (const input of inputs) {
        const result = await classifier.classifyIntent(input);
        expect(result.intent).toBe('optimize');
        expect(result.confidence).toBeGreaterThan(0);
      }
    });

    it('should classify debug intents', async () => {
      const inputs = [
        'debug this issue',
        'fix the error',
        'troubleshoot the problem',
        'investigate the bug',
        'find the issue',
      ];

      for (const input of inputs) {
        const result = await classifier.classifyIntent(input);
        expect(result.intent).toBe('debug');
        expect(result.confidence).toBeGreaterThan(0);
      }
    });

    it('should classify analyze intents', async () => {
      const inputs = [
        'analyze the code',
        'get metrics',
        'generate report',
        'check complexity',
        'review architecture',
      ];

      for (const input of inputs) {
        const result = await classifier.classifyIntent(input);
        expect(result.intent).toBe('analyze');
        expect(result.confidence).toBeGreaterThan(0);
      }
    });

    it('should handle unknown intents', async () => {
      const inputs = ['random text', 'gibberish', 'unrelated content', 'nonsense'];

      for (const input of inputs) {
        const result = await classifier.classifyIntent(input);
        expect(result.intent).toBe('unknown');
        expect(result.confidence).toBeLessThan(0.5);
      }
    });

    it('should include sub-intents when requested', async () => {
      const result = await classifier.classifyIntent(
        'extract function from complex code',
        undefined,
        { includeSubIntents: true }
      );

      expect(result.subIntents).toBeDefined();
      expect(Array.isArray(result.subIntents)).toBe(true);
    });

    it('should estimate complexity when requested', async () => {
      const result = await classifier.classifyIntent('simple refactor', undefined, {
        estimateComplexity: true,
      });

      expect(result.complexity).toBeDefined();
      expect(['low', 'medium', 'high']).toContain(result.complexity);
    });

    it('should estimate time when requested', async () => {
      const result = await classifier.classifyIntent('complex migration', undefined, {
        estimateTime: true,
      });

      expect(result.estimatedTime).toBeGreaterThan(0);
    });

    it('should assess risk when requested', async () => {
      const result = await classifier.classifyIntent('high-risk operation', undefined, {
        assessRisk: true,
      });

      expect(result.riskLevel).toBeDefined();
      expect(['low', 'medium', 'high']).toContain(result.riskLevel);
    });

    it('should suggest tools when requested', async () => {
      const result = await classifier.classifyIntent('refactor code', undefined, {
        suggestTools: true,
      });

      expect(result.requiredTools).toBeDefined();
      expect(Array.isArray(result.requiredTools)).toBe(true);
      expect(result.requiredTools.length).toBeGreaterThan(0);
    });

    it('should handle context information', async () => {
      const result = await classifier.classifyIntent(
        'fix this',
        'The function has a bug in the error handling'
      );

      expect(result.intent).toBe('debug');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should calculate confidence scores correctly', async () => {
      const result = await classifier.classifyIntent('refactor this function');

      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should provide reasoning for classification', async () => {
      const result = await classifier.classifyIntent('extract function');

      expect(result.reasoning).toBeDefined();
      expect(typeof result.reasoning).toBe('string');
      expect(result.reasoning.length).toBeGreaterThan(0);
    });
  });

  describe('getClassificationStats', () => {
    it('should return classification statistics', async () => {
      const stats = await classifier.getClassificationStats();

      expect(stats).toBeDefined();
      expect(stats.totalClassifications).toBeDefined();
      expect(stats.intentDistribution).toBeDefined();
      expect(stats.averageConfidence).toBeDefined();
      expect(stats.averageComplexity).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle empty input gracefully', async () => {
      const result = await classifier.classifyIntent('');

      expect(result).toBeDefined();
      expect(result.intent).toBe('unknown');
    });

    it('should handle very long input', async () => {
      const longInput = 'refactor '.repeat(1000);
      const result = await classifier.classifyIntent(longInput);

      expect(result).toBeDefined();
      expect(result.intent).toBe('refactor');
    });
  });
});
