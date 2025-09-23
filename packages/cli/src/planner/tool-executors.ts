import { Logger } from '../utils/logger.js';
import { RefactoGentMetrics } from '../observability/metrics.js';
import { RefactoGentTracer } from '../observability/tracing.js';
import { RefactoGentConfig } from '../config/refactogent-schema.js';
import { PlanNode } from './planner-llm.js';

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  executionTime: number;
  retryable: boolean;
  rollbackData?: any;
}

export interface ToolExecutor {
  name: string;
  execute(node: PlanNode, context: ExecutionContext): Promise<ToolResult>;
  canRetry(result: ToolResult): boolean;
  rollback(result: ToolResult): Promise<boolean>;
}

export interface ExecutionContext {
  projectPath: string;
  workingDirectory: string;
  environment: Record<string, string>;
  previousResults: Map<string, ToolResult>;
  options: Record<string, any>;
}

/**
 * Search tool executor - searches for code patterns and symbols
 */
export class SearchExecutor implements ToolExecutor {
  name = 'search';

  constructor(
    private logger: Logger,
    private metrics: RefactoGentMetrics,
    private tracer: RefactoGentTracer,
    private config: RefactoGentConfig
  ) {}

  async execute(node: PlanNode, context: ExecutionContext): Promise<ToolResult> {
    const span = this.tracer.startAnalysisTrace(context.projectPath, 'search-execution');
    const startTime = Date.now();

    try {
      this.logger.info('Executing search tool', {
        nodeId: node.id,
        parameters: node.parameters,
        projectPath: context.projectPath
      });

      const query = node.parameters?.query || '';
      const maxResults = node.parameters?.maxResults || 10;

      // Simulate search execution
      const results = await this.performSearch(query, context.projectPath, maxResults);
      
      // Add small delay to simulate real execution
      await new Promise(resolve => setTimeout(resolve, 10));

      const executionTime = Date.now() - startTime;
      this.tracer.recordSuccess(span, `Search completed: ${results.length} results`);

      return {
        success: true,
        data: results,
        executionTime,
        retryable: true
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.tracer.recordError(span, error as Error, 'Search execution failed');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime,
        retryable: true
      };
    }
  }

  canRetry(result: ToolResult): boolean {
    return result.retryable && !result.success;
  }

  async rollback(result: ToolResult): Promise<boolean> {
    // Search doesn't need rollback
    return true;
  }

  private async performSearch(query: string, projectPath: string, maxResults: number): Promise<any[]> {
    // Simulate error for invalid parameters
    if (maxResults < 0) {
      throw new Error('Invalid maxResults parameter');
    }
    
    if (!query || query.trim() === '') {
      throw new Error('Query cannot be empty');
    }
    
    // Simulate search results
    return [
      { file: 'src/utils.ts', line: 10, content: 'function example() { return "hello"; }', score: 0.9 },
      { file: 'src/helper.ts', line: 5, content: 'const helper = () => {};', score: 0.8 }
    ].slice(0, maxResults);
  }
}

/**
 * Read tool executor - reads and analyzes files
 */
export class ReadExecutor implements ToolExecutor {
  name = 'read';

  constructor(
    private logger: Logger,
    private metrics: RefactoGentMetrics,
    private tracer: RefactoGentTracer,
    private config: RefactoGentConfig
  ) {}

  async execute(node: PlanNode, context: ExecutionContext): Promise<ToolResult> {
    const span = this.tracer.startAnalysisTrace(context.projectPath, 'read-execution');
    const startTime = Date.now();

    try {
      this.logger.info('Executing read tool', {
        nodeId: node.id,
        parameters: node.parameters,
        projectPath: context.projectPath
      });

      const includeTests = node.parameters?.includeTests || false;
      const includeConfigs = node.parameters?.includeConfigs || false;

      // Simulate file reading
      const files = await this.readFiles(context.projectPath, includeTests, includeConfigs);
      
      // Add small delay to simulate real execution
      await new Promise(resolve => setTimeout(resolve, 10));

      const executionTime = Date.now() - startTime;
      this.tracer.recordSuccess(span, `Read completed: ${files.length} files`);

      return {
        success: true,
        data: files,
        executionTime,
        retryable: true
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.tracer.recordError(span, error as Error, 'Read execution failed');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime,
        retryable: true
      };
    }
  }

  canRetry(result: ToolResult): boolean {
    return result.retryable && !result.success;
  }

  async rollback(result: ToolResult): Promise<boolean> {
    // Read doesn't need rollback
    return true;
  }

  private async readFiles(projectPath: string, includeTests: boolean, includeConfigs: boolean): Promise<any[]> {
    // Simulate file reading
    const files = [
      { path: 'src/main.ts', content: 'export function main() {}', type: 'source' },
      { path: 'src/utils.ts', content: 'export function utils() {}', type: 'source' }
    ];

    if (includeTests) {
      files.push({ path: 'test/main.test.ts', content: 'describe("main", () => {});', type: 'test' });
    }

    if (includeConfigs) {
      files.push({ path: 'package.json', content: '{"name": "test"}', type: 'config' });
    }

    return files;
  }
}

/**
 * Edit tool executor - modifies files
 */
export class EditExecutor implements ToolExecutor {
  name = 'edit';

  constructor(
    private logger: Logger,
    private metrics: RefactoGentMetrics,
    private tracer: RefactoGentTracer,
    private config: RefactoGentConfig
  ) {}

  async execute(node: PlanNode, context: ExecutionContext): Promise<ToolResult> {
    const span = this.tracer.startAnalysisTrace(context.projectPath, 'edit-execution');
    const startTime = Date.now();

    try {
      this.logger.info('Executing edit tool', {
        nodeId: node.id,
        parameters: node.parameters,
        projectPath: context.projectPath
      });

      const backup = node.parameters?.backup || false;
      const validate = node.parameters?.validate || false;

      // Create backup if requested
      let rollbackData = null;
      if (backup) {
        rollbackData = await this.createBackup(context.projectPath);
      }

      // Simulate file editing
      const changes = await this.performEdit(context.projectPath, node.parameters);
      
      // Add small delay to simulate real execution
      await new Promise(resolve => setTimeout(resolve, 10));

      const executionTime = Date.now() - startTime;
      this.tracer.recordSuccess(span, `Edit completed: ${changes.length} changes`);

      return {
        success: true,
        data: changes,
        executionTime,
        retryable: true,
        rollbackData
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.tracer.recordError(span, error as Error, 'Edit execution failed');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime,
        retryable: true
      };
    }
  }

  canRetry(result: ToolResult): boolean {
    return result.retryable && !result.success;
  }

  async rollback(result: ToolResult): Promise<boolean> {
    if (result.rollbackData) {
      // Restore from backup
      return await this.restoreBackup(result.rollbackData);
    }
    return false;
  }

  private async createBackup(projectPath: string): Promise<any> {
    // Simulate backup creation
    return { timestamp: Date.now(), files: ['src/main.ts', 'src/utils.ts'] };
  }

  private async performEdit(projectPath: string, parameters: any): Promise<any[]> {
    // Simulate file editing
    return [
      { file: 'src/main.ts', changes: ['Added new function', 'Updated imports'] },
      { file: 'src/utils.ts', changes: ['Refactored helper function'] }
    ];
  }

  private async restoreBackup(rollbackData: any): Promise<boolean> {
    // Simulate backup restoration
    this.logger.info('Restoring from backup', { timestamp: rollbackData.timestamp });
    return true;
  }
}

/**
 * TypeCheck tool executor - runs TypeScript type checking
 */
export class TypeCheckExecutor implements ToolExecutor {
  name = 'typecheck';

  constructor(
    private logger: Logger,
    private metrics: RefactoGentMetrics,
    private tracer: RefactoGentTracer,
    private config: RefactoGentConfig
  ) {}

  async execute(node: PlanNode, context: ExecutionContext): Promise<ToolResult> {
    const span = this.tracer.startAnalysisTrace(context.projectPath, 'typecheck-execution');
    const startTime = Date.now();

    try {
      this.logger.info('Executing typecheck tool', {
        nodeId: node.id,
        parameters: node.parameters,
        projectPath: context.projectPath
      });

      const strict = node.parameters?.strict || false;
      const includeTests = node.parameters?.includeTests || false;

      // Simulate type checking
      const results = await this.performTypeCheck(context.projectPath, strict, includeTests);
      
      // Add small delay to simulate real execution
      await new Promise(resolve => setTimeout(resolve, 10));

      const executionTime = Date.now() - startTime;
      this.tracer.recordSuccess(span, `TypeCheck completed: ${results.errors.length} errors`);

      return {
        success: results.errors.length === 0,
        data: results,
        executionTime,
        retryable: true
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.tracer.recordError(span, error as Error, 'TypeCheck execution failed');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime,
        retryable: true
      };
    }
  }

  canRetry(result: ToolResult): boolean {
    return result.retryable && !result.success;
  }

  async rollback(result: ToolResult): Promise<boolean> {
    // TypeCheck doesn't need rollback
    return true;
  }

  private async performTypeCheck(projectPath: string, strict: boolean, includeTests: boolean): Promise<any> {
    // Simulate type checking results
    return {
      errors: strict ? [
        { file: 'src/main.ts', line: 5, message: 'Type error: string is not assignable to number' }
      ] : [],
      warnings: [
        { file: 'src/utils.ts', line: 10, message: 'Unused variable' }
      ],
      success: true
    };
  }
}

/**
 * Format tool executor - formats code
 */
export class FormatExecutor implements ToolExecutor {
  name = 'format';

  constructor(
    private logger: Logger,
    private metrics: RefactoGentMetrics,
    private tracer: RefactoGentTracer,
    private config: RefactoGentConfig
  ) {}

  async execute(node: PlanNode, context: ExecutionContext): Promise<ToolResult> {
    const span = this.tracer.startAnalysisTrace(context.projectPath, 'format-execution');
    const startTime = Date.now();

    try {
      this.logger.info('Executing format tool', {
        nodeId: node.id,
        parameters: node.parameters,
        projectPath: context.projectPath
      });

      const style = node.parameters?.style || 'prettier';
      const write = node.parameters?.write || false;

      // Simulate formatting
      const results = await this.performFormat(context.projectPath, style, write);
      
      // Add small delay to simulate real execution
      await new Promise(resolve => setTimeout(resolve, 10));

      const executionTime = Date.now() - startTime;
      this.tracer.recordSuccess(span, `Format completed: ${results.filesFormatted} files`);

      return {
        success: true,
        data: results,
        executionTime,
        retryable: true
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.tracer.recordError(span, error as Error, 'Format execution failed');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime,
        retryable: true
      };
    }
  }

  canRetry(result: ToolResult): boolean {
    return result.retryable && !result.success;
  }

  async rollback(result: ToolResult): Promise<boolean> {
    // Format rollback would restore original formatting
    return true;
  }

  private async performFormat(projectPath: string, style: string, write: boolean): Promise<any> {
    // Simulate formatting results
    return {
      filesFormatted: 3,
      changes: [
        { file: 'src/main.ts', changes: ['Fixed indentation', 'Added semicolons'] },
        { file: 'src/utils.ts', changes: ['Reformatted function'] }
      ],
      style
    };
  }
}

/**
 * Test runner tool executor - runs tests
 */
export class TestRunnerExecutor implements ToolExecutor {
  name = 'test-runner';

  constructor(
    private logger: Logger,
    private metrics: RefactoGentMetrics,
    private tracer: RefactoGentTracer,
    private config: RefactoGentConfig
  ) {}

  async execute(node: PlanNode, context: ExecutionContext): Promise<ToolResult> {
    const span = this.tracer.startAnalysisTrace(context.projectPath, 'test-runner-execution');
    const startTime = Date.now();

    try {
      this.logger.info('Executing test-runner tool', {
        nodeId: node.id,
        parameters: node.parameters,
        projectPath: context.projectPath
      });

      const coverage = node.parameters?.coverage || false;
      const verbose = node.parameters?.verbose || false;

      // Simulate test execution
      const results = await this.performTests(context.projectPath, coverage, verbose);
      
      // Add small delay to simulate real execution
      await new Promise(resolve => setTimeout(resolve, 10));

      const executionTime = Date.now() - startTime;
      this.tracer.recordSuccess(span, `TestRunner completed: ${results.passed}/${results.total} tests passed`);

      return {
        success: results.failed === 0,
        data: results,
        executionTime,
        retryable: true
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.tracer.recordError(span, error as Error, 'TestRunner execution failed');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime,
        retryable: true
      };
    }
  }

  canRetry(result: ToolResult): boolean {
    return result.retryable && !result.success;
  }

  async rollback(result: ToolResult): Promise<boolean> {
    // Test runner doesn't need rollback
    return true;
  }

  private async performTests(projectPath: string, coverage: boolean, verbose: boolean): Promise<any> {
    // Simulate test execution results
    return {
      total: 10,
      passed: 8,
      failed: 2,
      skipped: 0,
      coverage: coverage ? { lines: 85, functions: 90, branches: 80 } : undefined,
      failures: [
        { test: 'should handle edge case', error: 'Expected true but got false' },
        { test: 'should validate input', error: 'TypeError: Cannot read property of undefined' }
      ]
    };
  }
}

/**
 * Registry for all tool executors
 */
export class ToolExecutorRegistry {
  private executors: Map<string, ToolExecutor> = new Map();

  constructor(
    private logger: Logger,
    private metrics: RefactoGentMetrics,
    private tracer: RefactoGentTracer,
    private config: RefactoGentConfig
  ) {
    this.registerDefaultExecutors();
  }

  /**
   * Register a tool executor
   */
  register(executor: ToolExecutor): void {
    this.executors.set(executor.name, executor);
    this.logger.info('Registered tool executor', { name: executor.name });
  }

  /**
   * Get a tool executor by name
   */
  get(name: string): ToolExecutor | undefined {
    return this.executors.get(name);
  }

  /**
   * Get all registered executors
   */
  getAll(): ToolExecutor[] {
    return Array.from(this.executors.values());
  }

  /**
   * Check if an executor is registered
   */
  has(name: string): boolean {
    return this.executors.has(name);
  }

  /**
   * Register default tool executors
   */
  private registerDefaultExecutors(): void {
    this.register(new SearchExecutor(this.logger, this.metrics, this.tracer, this.config));
    this.register(new ReadExecutor(this.logger, this.metrics, this.tracer, this.config));
    this.register(new EditExecutor(this.logger, this.metrics, this.tracer, this.config));
    this.register(new TypeCheckExecutor(this.logger, this.metrics, this.tracer, this.config));
    this.register(new FormatExecutor(this.logger, this.metrics, this.tracer, this.config));
    this.register(new TestRunnerExecutor(this.logger, this.metrics, this.tracer, this.config));
  }
}
