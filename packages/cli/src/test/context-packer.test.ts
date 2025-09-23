import { ContextPacker, ContextPackingOptions } from '../retrieval/context-packer.js';
import { Logger } from '../utils/logger.js';
import { RefactoGentMetrics } from '../observability/metrics.js';
import { RefactoGentTracer } from '../observability/tracing.js';
import { RefactoGentConfig } from '../config/refactogent-schema.js';
import { CodeChunk } from '../ingestion/language-chunker.js';

describe('ContextPacker', () => {
  let packer: ContextPacker;
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

    packer = new ContextPacker(logger, metrics, tracer, config);
  });

  const createMockChunk = (
    id: string,
    content: string,
    filePath: string = 'src/test.ts'
  ): CodeChunk => ({
    id,
    filePath,
    startLine: 1,
    endLine: 10,
    startColumn: 1,
    endColumn: 1,
    content,
    type: 'function',
    language: 'typescript',
    complexity: 1,
    dependencies: [],
    symbols: {
      defined: ['testFunction'],
      referenced: [],
    },
    metadata: {
      isExported: true,
      isAsync: false,
      isTest: false,
      isConfig: false,
      isDocumentation: false,
      size: content.length,
      hash: `hash-${id}`,
    },
  });

  describe('packContext', () => {
    it('should pack context with basic chunks', async () => {
      const chunks = [
        createMockChunk('chunk1', 'function testFunction() { return "hello"; }'),
        createMockChunk('chunk2', 'function anotherFunction() { return "world"; }'),
      ];

      const result = await packer.packContext(
        chunks,
        'extract function from complex code',
        'refactor'
      );

      expect(result).toBeDefined();
      expect(result.prompt).toBeDefined();
      expect(result.citations).toBeDefined();
      expect(result.tokenCount).toBeGreaterThan(0);
      expect(result.sections).toBeDefined();
      expect(result.metadata).toBeDefined();
    });

    it('should create role-segmented sections', async () => {
      const chunks = [createMockChunk('chunk1', 'function testFunction() { return "hello"; }')];

      const result = await packer.packContext(
        chunks,
        'extract function from complex code',
        'refactor',
        { roleSegmentation: true }
      );

      expect(result.sections).toBeDefined();
      expect(result.sections.length).toBeGreaterThan(0);

      const systemSection = result.sections.find(s => s.role === 'system');
      const userSection = result.sections.find(s => s.role === 'user');

      expect(systemSection).toBeDefined();
      expect(userSection).toBeDefined();
    });

    it('should include style guide when requested', async () => {
      const chunks = [createMockChunk('chunk1', 'function testFunction() { return "hello"; }')];

      const result = await packer.packContext(
        chunks,
        'extract function from complex code',
        'refactor',
        { includeStyleGuide: true }
      );

      expect(result.prompt).toContain('Style Guidelines');
    });

    it('should include API documentation when requested', async () => {
      const chunks = [
        createMockChunk('chunk1', 'export function testFunction() { return "hello"; }'),
      ];

      const result = await packer.packContext(
        chunks,
        'extract function from complex code',
        'refactor',
        { includeAPIDocs: true }
      );

      expect(result.sections).toBeDefined();
      const apiSection = result.sections.find(s => s.role === 'constraints');
      expect(apiSection).toBeDefined();
    });

    it('should include test examples when requested', async () => {
      const testChunk = createMockChunk(
        'test1',
        'describe("testFunction", () => { it("should work", () => {}); });'
      );
      testChunk.type = 'test';
      testChunk.filePath = 'test/test.spec.ts';

      const chunks = [
        createMockChunk('chunk1', 'function testFunction() { return "hello"; }'),
        testChunk,
      ];

      const result = await packer.packContext(
        chunks,
        'extract function from complex code',
        'refactor',
        { includeTestExamples: true }
      );

      expect(result.sections).toBeDefined();
      const examplesSection = result.sections.find(s => s.role === 'examples');
      expect(examplesSection).toBeDefined();
    });

    it('should respect token budget', async () => {
      const chunks = [
        createMockChunk('chunk1', 'function testFunction() { return "hello"; }'),
        createMockChunk('chunk2', 'function anotherFunction() { return "world"; }'),
      ];

      const result = await packer.packContext(
        chunks,
        'extract function from complex code',
        'refactor',
        { maxTokens: 100 }
      );

      expect(result.tokenCount).toBeLessThanOrEqual(100);
    });

    it('should generate citations with different formats', async () => {
      const chunks = [createMockChunk('chunk1', 'function testFunction() { return "hello"; }')];

      const formats: Array<'inline' | 'reference' | 'both'> = ['inline', 'reference', 'both'];

      for (const format of formats) {
        const result = await packer.packContext(
          chunks,
          'extract function from complex code',
          'refactor',
          { citationFormat: format }
        );

        expect(result.citations).toBeDefined();
        expect(result.citations.length).toBeGreaterThan(0);
      }
    });

    it('should handle different intents', async () => {
      const intents = ['refactor', 'extract', 'inline', 'rename', 'optimize', 'test', 'document'];
      const chunks = [createMockChunk('chunk1', 'function testFunction() { return "hello"; }')];

      for (const intent of intents) {
        const result = await packer.packContext(chunks, `perform ${intent} operation`, intent);

        expect(result).toBeDefined();
        expect(result.prompt).toBeDefined();
      }
    });

    it('should handle empty chunks array', async () => {
      const result = await packer.packContext([], 'extract function from complex code', 'refactor');

      expect(result).toBeDefined();
      expect(result.prompt).toBeDefined();
      expect(result.citations).toBeDefined();
    });

    it('should calculate metadata correctly', async () => {
      const chunks = [
        createMockChunk('chunk1', 'function testFunction() { return "hello"; }'),
        createMockChunk('chunk2', 'function anotherFunction() { return "world"; }'),
      ];

      const result = await packer.packContext(
        chunks,
        'extract function from complex code',
        'refactor'
      );

      expect(result.metadata).toBeDefined();
      expect(result.metadata.totalChunks).toBe(2);
      expect(result.metadata.uniqueFiles).toBe(1); // Same file path
      expect(result.metadata.languages).toContain('typescript');
      expect(result.metadata.confidence).toBeGreaterThanOrEqual(0);
      expect(result.metadata.processingTime).toBeGreaterThanOrEqual(0);
    });

    it('should handle large content efficiently', async () => {
      const largeContent = 'function testFunction() { ' + 'return "hello"; '.repeat(1000) + ' }';
      const chunks = [createMockChunk('chunk1', largeContent)];

      const result = await packer.packContext(
        chunks,
        'extract function from complex code',
        'refactor',
        { maxTokens: 500 }
      );

      expect(result).toBeDefined();
      expect(result.tokenCount).toBeLessThanOrEqual(500);
    });
  });

  describe('error handling', () => {
    it('should handle invalid options gracefully', async () => {
      const chunks = [createMockChunk('chunk1', 'function testFunction() { return "hello"; }')];

      const result = await packer.packContext(
        chunks,
        'extract function from complex code',
        'refactor',
        { maxTokens: -1 } // Invalid value
      );

      expect(result).toBeDefined();
      expect(result.prompt).toBeDefined();
    });
  });
});
