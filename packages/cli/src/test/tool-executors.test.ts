import {
  ToolExecutorRegistry,
  SearchExecutor,
  ReadExecutor,
  EditExecutor,
  TypeCheckExecutor,
  FormatExecutor,
  TestRunnerExecutor,
  ExecutionContext,
} from '../planner/tool-executors.js';
import { PlanNode } from '../planner/planner-llm.js';
import { Logger } from '../utils/logger.js';
import { RefactoGentMetrics } from '../observability/metrics.js';
import { RefactoGentTracer } from '../observability/tracing.js';
import { RefactoGentConfig } from '../config/refactogent-schema.js';

describe('Tool Executors', () => {
  let logger: Logger;
  let metrics: RefactoGentMetrics;
  let tracer: RefactoGentTracer;
  let config: RefactoGentConfig;
  let registry: ToolExecutorRegistry;

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

    registry = new ToolExecutorRegistry(logger, metrics, tracer, config);
  });

  const createMockNode = (tool: string, parameters: any = {}): PlanNode => ({
    id: `test-${tool}`,
    type: 'tool',
    name: `Test ${tool}`,
    description: `Test ${tool} execution`,
    tool,
    parameters,
    dependencies: [],
    estimatedTime: 1,
    riskLevel: 'low',
    retryable: true,
  });

  const createMockContext = (): ExecutionContext => ({
    projectPath: '/test/project',
    workingDirectory: '/test/project',
    environment: { NODE_ENV: 'test' },
    previousResults: new Map(),
    options: {},
  });

  describe('ToolExecutorRegistry', () => {
    it('should register default executors', () => {
      expect(registry.has('search')).toBe(true);
      expect(registry.has('read')).toBe(true);
      expect(registry.has('edit')).toBe(true);
      expect(registry.has('typecheck')).toBe(true);
      expect(registry.has('format')).toBe(true);
      expect(registry.has('test-runner')).toBe(true);
    });

    it('should get executor by name', () => {
      const searchExecutor = registry.get('search');
      expect(searchExecutor).toBeDefined();
      expect(searchExecutor?.name).toBe('search');
    });

    it('should return undefined for non-existent executor', () => {
      const executor = registry.get('nonexistent');
      expect(executor).toBeUndefined();
    });

    it('should get all registered executors', () => {
      const executors = registry.getAll();
      expect(executors.length).toBeGreaterThan(0);
      expect(executors.every(executor => executor.name)).toBe(true);
    });
  });

  describe('SearchExecutor', () => {
    let executor: SearchExecutor;

    beforeEach(() => {
      executor = new SearchExecutor(logger, metrics, tracer, config);
    });

    it('should execute search tool', async () => {
      const node = createMockNode('search', { query: 'test function', maxResults: 5 });
      const context = createMockContext();

      const result = await executor.execute(node, context);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.executionTime).toBeGreaterThan(0);
      expect(result.retryable).toBe(true);
    });

    it('should handle search errors gracefully', async () => {
      const node = createMockNode('search', { query: '', maxResults: -1 });
      const context = createMockContext();

      const result = await executor.execute(node, context);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.retryable).toBe(true);
    });

    it('should be retryable', async () => {
      const result = { success: false, retryable: true, executionTime: 0 };
      expect(executor.canRetry(result)).toBe(true);
    });

    it('should handle rollback', async () => {
      const result = { success: true, retryable: true, executionTime: 0 };
      const rollbackResult = await executor.rollback(result);
      expect(rollbackResult).toBe(true);
    });
  });

  describe('ReadExecutor', () => {
    let executor: ReadExecutor;

    beforeEach(() => {
      executor = new ReadExecutor(logger, metrics, tracer, config);
    });

    it('should execute read tool', async () => {
      const node = createMockNode('read', { includeTests: true, includeConfigs: true });
      const context = createMockContext();

      const result = await executor.execute(node, context);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.executionTime).toBeGreaterThan(0);
      expect(result.retryable).toBe(true);
    });

    it('should handle read errors gracefully', async () => {
      const node = createMockNode('read', { includeTests: false, includeConfigs: false });
      const context = createMockContext();

      const result = await executor.execute(node, context);

      expect(result.success).toBe(true); // Read should succeed even with minimal options
      expect(result.data).toBeDefined();
    });

    it('should be retryable', async () => {
      const result = { success: false, retryable: true, executionTime: 0 };
      expect(executor.canRetry(result)).toBe(true);
    });
  });

  describe('EditExecutor', () => {
    let executor: EditExecutor;

    beforeEach(() => {
      executor = new EditExecutor(logger, metrics, tracer, config);
    });

    it('should execute edit tool', async () => {
      const node = createMockNode('edit', { backup: true, validate: true });
      const context = createMockContext();

      const result = await executor.execute(node, context);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.executionTime).toBeGreaterThan(0);
      expect(result.retryable).toBe(true);
    });

    it('should create backup when requested', async () => {
      const node = createMockNode('edit', { backup: true });
      const context = createMockContext();

      const result = await executor.execute(node, context);

      expect(result.success).toBe(true);
      expect(result.rollbackData).toBeDefined();
    });

    it('should handle rollback', async () => {
      const result = {
        success: true,
        retryable: true,
        executionTime: 0,
        rollbackData: { timestamp: Date.now(), files: ['test.ts'] },
      };
      const rollbackResult = await executor.rollback(result);
      expect(rollbackResult).toBe(true);
    });

    it('should be retryable', async () => {
      const result = { success: false, retryable: true, executionTime: 0 };
      expect(executor.canRetry(result)).toBe(true);
    });
  });

  describe('TypeCheckExecutor', () => {
    let executor: TypeCheckExecutor;

    beforeEach(() => {
      executor = new TypeCheckExecutor(logger, metrics, tracer, config);
    });

    it('should execute typecheck tool', async () => {
      const node = createMockNode('typecheck', { strict: true, includeTests: true });
      const context = createMockContext();

      const result = await executor.execute(node, context);

      expect(result.success).toBeDefined();
      expect(result.data).toBeDefined();
      expect(result.executionTime).toBeGreaterThan(0);
      expect(result.retryable).toBe(true);
    });

    it('should handle strict type checking', async () => {
      const node = createMockNode('typecheck', { strict: true });
      const context = createMockContext();

      const result = await executor.execute(node, context);

      expect(result.success).toBeDefined();
      expect(result.data).toBeDefined();
    });

    it('should be retryable', async () => {
      const result = { success: false, retryable: true, executionTime: 0 };
      expect(executor.canRetry(result)).toBe(true);
    });
  });

  describe('FormatExecutor', () => {
    let executor: FormatExecutor;

    beforeEach(() => {
      executor = new FormatExecutor(logger, metrics, tracer, config);
    });

    it('should execute format tool', async () => {
      const node = createMockNode('format', { style: 'prettier', write: true });
      const context = createMockContext();

      const result = await executor.execute(node, context);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.executionTime).toBeGreaterThan(0);
      expect(result.retryable).toBe(true);
    });

    it('should handle different formatting styles', async () => {
      const styles = ['prettier', 'eslint', 'standard'];

      for (const style of styles) {
        const node = createMockNode('format', { style, write: false });
        const context = createMockContext();

        const result = await executor.execute(node, context);

        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();
      }
    });

    it('should be retryable', async () => {
      const result = { success: false, retryable: true, executionTime: 0 };
      expect(executor.canRetry(result)).toBe(true);
    });
  });

  describe('TestRunnerExecutor', () => {
    let executor: TestRunnerExecutor;

    beforeEach(() => {
      executor = new TestRunnerExecutor(logger, metrics, tracer, config);
    });

    it('should execute test-runner tool', async () => {
      const node = createMockNode('test-runner', { coverage: true, verbose: true });
      const context = createMockContext();

      const result = await executor.execute(node, context);

      expect(result.success).toBeDefined();
      expect(result.data).toBeDefined();
      expect(result.executionTime).toBeGreaterThan(0);
      expect(result.retryable).toBe(true);
    });

    it('should handle test failures', async () => {
      const node = createMockNode('test-runner', { coverage: false, verbose: false });
      const context = createMockContext();

      const result = await executor.execute(node, context);

      expect(result.success).toBeDefined();
      expect(result.data).toBeDefined();
    });

    it('should be retryable', async () => {
      const result = { success: false, retryable: true, executionTime: 0 };
      expect(executor.canRetry(result)).toBe(true);
    });
  });

  describe('Tool execution integration', () => {
    it('should execute multiple tools in sequence', async () => {
      const tools = ['search', 'read', 'edit', 'typecheck', 'format'];
      const context = createMockContext();
      const results: any[] = [];

      for (const tool of tools) {
        const executor = registry.get(tool);
        if (executor) {
          const node = createMockNode(tool);
          const result = await executor.execute(node, context);
          results.push(result);
        }
      }

      expect(results.length).toBe(tools.length);
      expect(results.every(result => result.success !== undefined)).toBe(true);
    });

    it('should handle tool execution errors gracefully', async () => {
      const executor = registry.get('search');
      if (executor) {
        const node = createMockNode('search', { query: null, maxResults: -1 });
        const context = createMockContext();

        const result = await executor.execute(node, context);

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.retryable).toBe(true);
      }
    });

    it('should track execution time', async () => {
      const executor = registry.get('read');
      if (executor) {
        const node = createMockNode('read');
        const context = createMockContext();

        const result = await executor.execute(node, context);

        expect(result.executionTime).toBeGreaterThan(0);
        expect(typeof result.executionTime).toBe('number');
      }
    });
  });

  describe('Error handling', () => {
    it('should handle missing tool gracefully', async () => {
      const executor = registry.get('nonexistent');
      expect(executor).toBeUndefined();
    });

    it('should handle invalid node parameters', async () => {
      const executor = registry.get('search');
      if (executor) {
        const node = createMockNode('search', { invalidParam: 'invalid' });
        const context = createMockContext();

        const result = await executor.execute(node, context);

        expect(result.success).toBeDefined();
      }
    });

    it('should handle context errors', async () => {
      const executor = registry.get('read');
      if (executor) {
        const node = createMockNode('read');
        const invalidContext = {
          projectPath: '',
          workingDirectory: '',
          environment: {},
          previousResults: new Map(),
          options: {},
        };

        const result = await executor.execute(node, invalidContext);

        expect(result.success).toBeDefined();
      }
    });
  });
});
