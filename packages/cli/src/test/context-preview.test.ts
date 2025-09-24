import { ContextPreview, ContextPreviewOptions } from '../ux/context-preview.js';
import { Logger } from '../utils/logger.js';
import { RefactoGentMetrics } from '../observability/metrics.js';
import { RefactoGentTracer } from '../observability/tracing.js';
import { RefactoGentConfig } from '../config/refactogent-schema.js';

describe('ContextPreview', () => {
  let contextPreview: ContextPreview;
  let logger: Logger;
  let metrics: RefactoGentMetrics;
  let tracer: RefactoGentTracer;
  let config: RefactoGentConfig;

  beforeEach(() => {
    logger = new Logger();
    metrics = new RefactoGentMetrics(logger);
    tracer = new RefactoGentTracer(logger);
    config = { repository: { language: ['typescript'] } } as any;
    contextPreview = new ContextPreview(logger, metrics, tracer, config);
  });

  describe('generatePreview', () => {
    it('should generate context preview with default options', async () => {
      const query = 'refactor this function';
      const projectPath = '/test/project';
      const options: ContextPreviewOptions = {};

      const result = await contextPreview.generatePreview(query, projectPath, options);

      expect(result).toBeDefined();
      expect(result.files).toBeDefined();
      expect(result.symbols).toBeDefined();
      expect(result.dependencies).toBeDefined();
      expect(result.metadata).toBeDefined();
      expect(result.metadata.totalFiles).toBeGreaterThanOrEqual(0);
      expect(result.metadata.totalLines).toBeGreaterThanOrEqual(0);
      expect(result.metadata.totalSymbols).toBeGreaterThanOrEqual(0);
      expect(result.metadata.contextSize).toBeGreaterThanOrEqual(0);
      expect(result.metadata.tokenEstimate).toBeGreaterThanOrEqual(0);
    });

    it('should generate context preview with custom options', async () => {
      const query = 'optimize performance';
      const projectPath = '/test/project';
      const options: ContextPreviewOptions = {
        showFiles: true,
        showLines: true,
        showSymbols: true,
        showDependencies: true,
        maxFiles: 10,
        maxLines: 500,
        includeTests: true,
        includeConfigs: true,
      };

      const result = await contextPreview.generatePreview(query, projectPath, options);

      expect(result).toBeDefined();
      expect(result.files).toBeDefined();
      expect(result.symbols).toBeDefined();
      expect(result.dependencies).toBeDefined();
      expect(result.metadata).toBeDefined();
    });

    it('should handle empty query gracefully', async () => {
      const query = '';
      const projectPath = '/test/project';
      const options: ContextPreviewOptions = {};

      const result = await contextPreview.generatePreview(query, projectPath, options);

      expect(result).toBeDefined();
      expect(result.files).toBeDefined();
      expect(result.symbols).toBeDefined();
      expect(result.dependencies).toBeDefined();
      expect(result.metadata).toBeDefined();
    });

    it('should respect maxFiles limit', async () => {
      const query = 'test query';
      const projectPath = '/test/project';
      const options: ContextPreviewOptions = {
        maxFiles: 5,
      };

      const result = await contextPreview.generatePreview(query, projectPath, options);

      expect(result.files.length).toBeLessThanOrEqual(5);
    });
  });

  describe('formatPreview', () => {
    it('should format preview correctly', () => {
      const mockResult = {
        files: [
          {
            path: 'src/utils/helper.ts',
            lines: [1, 2, 3],
            content: 'export function helper() { return "help"; }',
            type: 'source' as const,
            relevance: 0.9,
            reason: 'Contains utility functions',
          },
        ],
        symbols: [
          {
            name: 'helper',
            type: 'function' as const,
            file: 'src/utils/helper.ts',
            line: 1,
            signature: 'function helper(): string',
            relevance: 0.9,
            reason: 'Function name matches query',
          },
        ],
        dependencies: [
          {
            from: 'src/components/Button.tsx',
            to: 'src/utils/helper.ts',
            type: 'import' as const,
            relevance: 0.7,
            reason: 'Button imports helper',
          },
        ],
        metadata: {
          totalFiles: 1,
          totalLines: 3,
          totalSymbols: 1,
          contextSize: 100,
          tokenEstimate: 25,
        },
      };

      const formatted = contextPreview.formatPreview(mockResult);

      expect(formatted).toContain('Context Preview');
      expect(formatted).toContain('Files (1)');
      expect(formatted).toContain('Symbols (1)');
      expect(formatted).toContain('Dependencies (1)');
      expect(formatted).toContain('Metadata');
      expect(formatted).toContain('src/utils/helper.ts');
      expect(formatted).toContain('helper');
      expect(formatted).toContain('Button.tsx');
    });

    it('should handle empty preview gracefully', () => {
      const mockResult = {
        files: [],
        symbols: [],
        dependencies: [],
        metadata: {
          totalFiles: 0,
          totalLines: 0,
          totalSymbols: 0,
          contextSize: 0,
          tokenEstimate: 0,
        },
      };

      const formatted = contextPreview.formatPreview(mockResult);

      expect(formatted).toContain('Context Preview');
      expect(formatted).toContain('Metadata');
      expect(formatted).toContain('Total Files: 0');
    });
  });

  describe('generateDiffSandbox', () => {
    it('should generate diff sandbox with rationales', () => {
      const originalContent = 'function old() {\n  return "old";\n}';
      const modifiedContent = 'function new() {\n  return "new";\n}';
      const rationales = ['Renamed function', 'Updated return value'];

      const sandbox = contextPreview.generateDiffSandbox(
        originalContent,
        modifiedContent,
        rationales
      );

      expect(sandbox).toContain('Diff Sandbox with Rationales');
      expect(sandbox).toContain('Line 1:');
      expect(sandbox).toContain('- function old() {');
      expect(sandbox).toContain('+ function new() {');
      expect(sandbox).toContain('💡 Renamed function');
    });

    it('should handle identical content', () => {
      const content = 'function test() {\n  return "test";\n}';
      const rationales: string[] = [];

      const sandbox = contextPreview.generateDiffSandbox(content, content, rationales);

      expect(sandbox).toContain('Diff Sandbox with Rationales');
      expect(sandbox).not.toContain('Line 1:');
    });
  });
});
