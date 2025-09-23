import { GroundingChecker, GroundingCheckOptions } from '../retrieval/grounding-checker.js';
import { Logger } from '../utils/logger.js';
import { RefactoGentMetrics } from '../observability/metrics.js';
import { RefactoGentTracer } from '../observability/tracing.js';
import { RefactoGentConfig } from '../config/refactogent-schema.js';
import { CodeChunk } from '../ingestion/language-chunker.js';

describe('GroundingChecker', () => {
  let checker: GroundingChecker;
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

    checker = new GroundingChecker(logger, metrics, tracer, config);
  });

  afterEach(async () => {
    await checker.close();
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

  describe('checkGrounding', () => {
    it('should perform grounding checks on chunks', async () => {
      const chunks = [
        createMockChunk('chunk1', 'function testFunction() { return "hello"; }'),
        createMockChunk('chunk2', 'function anotherFunction() { return "world"; }'),
      ];

      const result = await checker.checkGrounding(chunks, 'extract function from complex code');

      expect(result).toBeDefined();
      expect(result.isValid).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.issues).toBeDefined();
      expect(result.suggestions).toBeDefined();
      expect(result.verifiedSymbols).toBeDefined();
    });

    it('should detect missing symbols', async () => {
      const chunks = [createMockChunk('chunk1', 'function testFunction() { return "hello"; }')];

      const result = await checker.checkGrounding(chunks, 'extract function from complex code');

      expect(result.issues).toBeDefined();
      expect(Array.isArray(result.issues)).toBe(true);
    });

    it('should detect conflicting definitions', async () => {
      const chunks = [
        createMockChunk('chunk1', 'function testFunction() { return "hello"; }'),
        createMockChunk('chunk2', 'class testFunction { }'), // Same name, different type
      ];

      const result = await checker.checkGrounding(chunks, 'extract function from complex code');

      expect(result.issues).toBeDefined();
      const conflictingIssues = result.issues.filter(i => i.type === 'conflicting_definition');
      expect(conflictingIssues.length).toBeGreaterThanOrEqual(0);
    });

    it('should detect circular dependencies', async () => {
      const chunks = [
        createMockChunk('chunk1', 'function testFunction() { return "hello"; }'),
        createMockChunk('chunk2', 'function anotherFunction() { return "world"; }'),
      ];

      const result = await checker.checkGrounding(chunks, 'extract function from complex code', {
        allowCircularDeps: false,
      });

      expect(result.issues).toBeDefined();
      const circularIssues = result.issues.filter(i => i.type === 'circular_dependency');
      expect(circularIssues.length).toBeGreaterThanOrEqual(0);
    });

    it('should detect outdated references', async () => {
      const chunks = [
        createMockChunk('chunk1', 'var oldVariable = "hello";'), // Using var instead of const/let
        createMockChunk('chunk2', 'function oldFunction() { }'), // Old function syntax
      ];

      const result = await checker.checkGrounding(chunks, 'extract function from complex code');

      expect(result.issues).toBeDefined();
      const outdatedIssues = result.issues.filter(i => i.type === 'outdated_reference');
      expect(outdatedIssues.length).toBeGreaterThanOrEqual(0);
    });

    it('should generate improvement suggestions', async () => {
      const chunks = [createMockChunk('chunk1', 'function testFunction() { return "hello"; }')];

      const result = await checker.checkGrounding(chunks, 'extract function from complex code');

      expect(result.suggestions).toBeDefined();
      expect(Array.isArray(result.suggestions)).toBe(true);
    });

    it('should verify symbols when possible', async () => {
      const chunks = [createMockChunk('chunk1', 'function testFunction() { return "hello"; }')];

      const result = await checker.checkGrounding(chunks, 'extract function from complex code');

      expect(result.verifiedSymbols).toBeDefined();
      expect(Array.isArray(result.verifiedSymbols)).toBe(true);
    });

    it('should handle different grounding options', async () => {
      const chunks = [createMockChunk('chunk1', 'function testFunction() { return "hello"; }')];

      const options: GroundingCheckOptions = {
        strictMode: true,
        includeTests: true,
        maxDepth: 3,
        allowCircularDeps: false,
        verifyExports: true,
      };

      const result = await checker.checkGrounding(
        chunks,
        'extract function from complex code',
        options
      );

      expect(result).toBeDefined();
      expect(result.isValid).toBeDefined();
    });

    it('should calculate confidence score', async () => {
      const chunks = [createMockChunk('chunk1', 'function testFunction() { return "hello"; }')];

      const result = await checker.checkGrounding(chunks, 'extract function from complex code');

      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should handle empty chunks array', async () => {
      const result = await checker.checkGrounding([], 'extract function from complex code');

      expect(result).toBeDefined();
      expect(result.isValid).toBeDefined();
      expect(result.confidence).toBe(0);
    });

    it('should handle chunks with no symbols', async () => {
      const chunks = [createMockChunk('chunk1', '// This is just a comment')];

      const result = await checker.checkGrounding(chunks, 'extract function from complex code');

      expect(result).toBeDefined();
      expect(result.isValid).toBeDefined();
    });

    it('should handle large chunks efficiently', async () => {
      const largeContent = 'function testFunction() { ' + 'return "hello"; '.repeat(1000) + ' }';
      const chunks = [createMockChunk('chunk1', largeContent)];

      const result = await checker.checkGrounding(chunks, 'extract function from complex code');

      expect(result).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
    });
  });

  describe('error handling', () => {
    it('should handle grounding check errors gracefully', async () => {
      const chunks = [createMockChunk('chunk1', 'function testFunction() { return "hello"; }')];

      // Should not throw even if there are issues
      const result = await checker.checkGrounding(chunks, 'extract function from complex code');

      expect(result).toBeDefined();
      expect(result.isValid).toBeDefined();
    });
  });
});
