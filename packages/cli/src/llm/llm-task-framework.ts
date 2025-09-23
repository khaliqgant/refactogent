import { Logger } from '../utils/logger.js';
import { RefactoGentMetrics } from '../observability/metrics.js';
import { RefactoGentTracer } from '../observability/tracing.js';
import { RefactoGentConfig } from '../config/refactogent-schema.js';
import { ContextAwareLLMService } from './context-aware-llm-service.js';
import { LLMSafetyGates } from './llm-safety-gates.js';

export interface LLMTask {
  id: string;
  type: 'refactor' | 'analyze' | 'generate' | 'explain' | 'optimize' | 'test' | 'document';
  name: string;
  description: string;
  input: {
    code?: string;
    prompt: string;
    context?: any;
    options?: any;
  };
  output?: {
    result: any;
    metadata: any;
  };
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'critical';
  createdAt: number;
  updatedAt: number;
  estimatedDuration: number;
  actualDuration?: number;
  retryCount: number;
  maxRetries: number;
  dependencies: string[];
  safetyChecks: boolean;
}

export interface LLMTaskResult {
  taskId: string;
  success: boolean;
  result?: any;
  error?: string;
  metadata: {
    duration: number;
    tokens: number;
    cost: number;
    provider: string;
    model: string;
    safetyScore: number;
  };
}

export interface LLMTaskFrameworkOptions {
  maxConcurrentTasks?: number;
  enableSafetyChecks?: boolean;
  enableRetries?: boolean;
  defaultRetries?: number;
  taskTimeout?: number;
  enableMetrics?: boolean;
  enableTracing?: boolean;
}

/**
 * LLM task framework for structured operations
 */
export class LLMTaskFramework {
  private logger: Logger;
  private metrics: RefactoGentMetrics;
  private tracer: RefactoGentTracer;
  private config: RefactoGentConfig;
  private llmService: ContextAwareLLMService;
  private safetyGates: LLMSafetyGates;
  private options: LLMTaskFrameworkOptions;
  private tasks: Map<string, LLMTask> = new Map();
  private runningTasks: Set<string> = new Set();
  private taskQueue: LLMTask[] = [];

  constructor(
    logger: Logger,
    metrics: RefactoGentMetrics,
    tracer: RefactoGentTracer,
    config: RefactoGentConfig,
    options: LLMTaskFrameworkOptions = {}
  ) {
    this.logger = logger;
    this.metrics = metrics;
    this.tracer = tracer;
    this.config = config;
    this.options = {
      maxConcurrentTasks: 3,
      enableSafetyChecks: true,
      enableRetries: true,
      defaultRetries: 3,
      taskTimeout: 300000, // 5 minutes
      enableMetrics: true,
      enableTracing: true,
      ...options
    };
    
    this.llmService = new ContextAwareLLMService(logger, metrics, tracer, config);
    this.safetyGates = new LLMSafetyGates(logger, metrics, tracer, config);
  }

  /**
   * Initialize the task framework
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing LLM task framework');
    await this.llmService.initialize();
    this.logger.info('LLM task framework initialized');
  }

  /**
   * Create a new task
   */
  async createTask(
    type: LLMTask['type'],
    name: string,
    description: string,
    input: LLMTask['input'],
    options: {
      priority?: LLMTask['priority'];
      maxRetries?: number;
      safetyChecks?: boolean;
      dependencies?: string[];
    } = {}
  ): Promise<string> {
    const taskId = this.generateTaskId();
    const now = Date.now();

    const task: LLMTask = {
      id: taskId,
      type,
      name,
      description,
      input,
      status: 'pending',
      priority: options.priority || 'medium',
      createdAt: now,
      updatedAt: now,
      estimatedDuration: this.estimateTaskDuration(type, input),
      retryCount: 0,
      maxRetries: options.maxRetries || this.options.defaultRetries || 3,
      dependencies: options.dependencies || [],
      safetyChecks: options.safetyChecks !== false
    };

    this.tasks.set(taskId, task);
    this.taskQueue.push(task);

    this.logger.info('Created LLM task', {
      taskId,
      type,
      name,
      priority: task.priority
    });

    // Start processing if not at capacity
    this.processTaskQueue();

    return taskId;
  }

  /**
   * Get task by ID
   */
  getTask(taskId: string): LLMTask | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Get all tasks
   */
  getAllTasks(): LLMTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Get tasks by status
   */
  getTasksByStatus(status: LLMTask['status']): LLMTask[] {
    return Array.from(this.tasks.values()).filter(task => task.status === status);
  }

  /**
   * Cancel a task
   */
  async cancelTask(taskId: string): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    if (task.status === 'running') {
      task.status = 'cancelled';
      task.updatedAt = Date.now();
      this.runningTasks.delete(taskId);
    } else if (task.status === 'pending') {
      task.status = 'cancelled';
      task.updatedAt = Date.now();
      // Remove from queue
      const index = this.taskQueue.findIndex(t => t.id === taskId);
      if (index !== -1) {
        this.taskQueue.splice(index, 1);
      }
    }

    this.logger.info('Cancelled task', { taskId });
    return true;
  }

  /**
   * Process the task queue
   */
  private async processTaskQueue(): Promise<void> {
    while (
      this.taskQueue.length > 0 &&
      this.runningTasks.size < (this.options.maxConcurrentTasks || 3)
    ) {
      const task = this.taskQueue.shift();
      if (!task) break;

      // Check dependencies
      if (!this.areDependenciesMet(task)) {
        this.taskQueue.push(task); // Put back in queue
        continue;
      }

      // Start task execution
      this.executeTask(task);
    }
  }

  /**
   * Execute a task
   */
  private async executeTask(task: LLMTask): Promise<void> {
    const span = this.tracer.startAnalysisTrace('.', 'llm-task-execution');
    const startTime = Date.now();

    try {
      task.status = 'running';
      task.updatedAt = Date.now();
      this.runningTasks.add(task.id);

      this.logger.info('Executing LLM task', {
        taskId: task.id,
        type: task.type,
        name: task.name
      });

      // Execute task based on type
      let result: any;
      switch (task.type) {
        case 'refactor':
          result = await this.executeRefactorTask(task);
          break;
        case 'analyze':
          result = await this.executeAnalyzeTask(task);
          break;
        case 'generate':
          result = await this.executeGenerateTask(task);
          break;
        case 'explain':
          result = await this.executeExplainTask(task);
          break;
        case 'optimize':
          result = await this.executeOptimizeTask(task);
          break;
        case 'test':
          result = await this.executeTestTask(task);
          break;
        case 'document':
          result = await this.executeDocumentTask(task);
          break;
        default:
          throw new Error(`Unknown task type: ${task.type}`);
      }

      // Safety checks
      if (task.safetyChecks && this.options.enableSafetyChecks) {
        const safetyResult = await this.safetyGates.checkContent(
          JSON.stringify(result),
          task.description
        );
        
        if (!safetyResult.passed) {
          throw new Error(`Safety check failed: ${safetyResult.violations.length} violations`);
        }
      }

      // Update task
      task.status = 'completed';
      task.output = { result, metadata: { completedAt: Date.now() } };
      task.actualDuration = Date.now() - startTime;
      task.updatedAt = Date.now();

      this.runningTasks.delete(task.id);

      this.tracer.recordSuccess(
        span,
        `Task completed: ${task.id} in ${task.actualDuration}ms`
      );

      // Process next tasks
      this.processTaskQueue();

    } catch (error) {
      task.status = 'failed';
      task.updatedAt = Date.now();
      this.runningTasks.delete(task.id);

      this.tracer.recordError(span, error as Error, `Task failed: ${task.id}`);

      // Retry if enabled
      if (this.options.enableRetries && task.retryCount < task.maxRetries) {
        task.retryCount++;
        task.status = 'pending';
        task.updatedAt = Date.now();
        this.taskQueue.push(task);
        
        this.logger.info('Retrying task', {
          taskId: task.id,
          retryCount: task.retryCount,
          maxRetries: task.maxRetries
        });
      }

      // Process next tasks
      this.processTaskQueue();
    }
  }

  /**
   * Execute refactor task
   */
  private async executeRefactorTask(task: LLMTask): Promise<any> {
    const response = await this.llmService.generateWithContext({
      prompt: task.input.prompt,
      context: task.input.context,
      options: task.input.options
    });

    return {
      refactoredCode: response.content,
      metadata: response.metadata
    };
  }

  /**
   * Execute analyze task
   */
  private async executeAnalyzeTask(task: LLMTask): Promise<any> {
    const response = await this.llmService.generateWithContext({
      prompt: `Analyze the following code:\n\n${task.input.code}\n\n${task.input.prompt}`,
      context: task.input.context,
      options: task.input.options
    });

    return {
      analysis: response.content,
      metadata: response.metadata
    };
  }

  /**
   * Execute generate task
   */
  private async executeGenerateTask(task: LLMTask): Promise<any> {
    const response = await this.llmService.generateWithContext({
      prompt: task.input.prompt,
      context: task.input.context,
      options: task.input.options
    });

    return {
      generatedContent: response.content,
      metadata: response.metadata
    };
  }

  /**
   * Execute explain task
   */
  private async executeExplainTask(task: LLMTask): Promise<any> {
    const response = await this.llmService.generateWithContext({
      prompt: `Explain the following code:\n\n${task.input.code}\n\n${task.input.prompt}`,
      context: task.input.context,
      options: task.input.options
    });

    return {
      explanation: response.content,
      metadata: response.metadata
    };
  }

  /**
   * Execute optimize task
   */
  private async executeOptimizeTask(task: LLMTask): Promise<any> {
    const response = await this.llmService.generateWithContext({
      prompt: `Optimize the following code:\n\n${task.input.code}\n\n${task.input.prompt}`,
      context: task.input.context,
      options: task.input.options
    });

    return {
      optimizedCode: response.content,
      metadata: response.metadata
    };
  }

  /**
   * Execute test task
   */
  private async executeTestTask(task: LLMTask): Promise<any> {
    const response = await this.llmService.generateWithContext({
      prompt: `Generate tests for the following code:\n\n${task.input.code}\n\n${task.input.prompt}`,
      context: task.input.context,
      options: task.input.options
    });

    return {
      testCode: response.content,
      metadata: response.metadata
    };
  }

  /**
   * Execute document task
   */
  private async executeDocumentTask(task: LLMTask): Promise<any> {
    const response = await this.llmService.generateWithContext({
      prompt: `Generate documentation for the following code:\n\n${task.input.code}\n\n${task.input.prompt}`,
      context: task.input.context,
      options: task.input.options
    });

    return {
      documentation: response.content,
      metadata: response.metadata
    };
  }

  /**
   * Check if task dependencies are met
   */
  private areDependenciesMet(task: LLMTask): boolean {
    for (const depId of task.dependencies) {
      const depTask = this.tasks.get(depId);
      if (!depTask || depTask.status !== 'completed') {
        return false;
      }
    }
    return true;
  }

  /**
   * Estimate task duration
   */
  private estimateTaskDuration(type: LLMTask['type'], input: LLMTask['input']): number {
    const baseDuration = {
      refactor: 30000,
      analyze: 20000,
      generate: 15000,
      explain: 10000,
      optimize: 25000,
      test: 20000,
      document: 15000
    };

    let duration = baseDuration[type] || 15000;
    
    // Adjust based on input size
    if (input.code) {
      duration += Math.ceil(input.code.length / 1000) * 5000;
    }
    
    if (input.prompt) {
      duration += Math.ceil(input.prompt.length / 500) * 2000;
    }

    return duration;
  }

  /**
   * Generate unique task ID
   */
  private generateTaskId(): string {
    return `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get framework statistics
   */
  async getFrameworkStats(): Promise<{
    totalTasks: number;
    pendingTasks: number;
    runningTasks: number;
    completedTasks: number;
    failedTasks: number;
    averageDuration: number;
    successRate: number;
  }> {
    const tasks = Array.from(this.tasks.values());
    const completedTasks = tasks.filter(t => t.status === 'completed');
    const failedTasks = tasks.filter(t => t.status === 'failed');
    
    const averageDuration = completedTasks.length > 0
      ? completedTasks.reduce((sum, t) => sum + (t.actualDuration || 0), 0) / completedTasks.length
      : 0;

    const successRate = tasks.length > 0
      ? completedTasks.length / tasks.length
      : 0;

    return {
      totalTasks: tasks.length,
      pendingTasks: tasks.filter(t => t.status === 'pending').length,
      runningTasks: this.runningTasks.size,
      completedTasks: completedTasks.length,
      failedTasks: failedTasks.length,
      averageDuration,
      successRate
    };
  }

  /**
   * Close the framework
   */
  async close(): Promise<void> {
    this.logger.info('Closing LLM task framework');
    await this.llmService.close();
  }
}