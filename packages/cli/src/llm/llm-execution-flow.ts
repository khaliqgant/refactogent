import { Logger } from '../utils/logger.js';
import { RefactoGentMetrics } from '../observability/metrics.js';
import { RefactoGentTracer } from '../observability/tracing.js';
import { RefactoGentConfig } from '../config/refactogent-schema.js';
import { LLMTaskFramework, LLMTask } from './llm-task-framework.js';
import { ContextAwareLLMService } from './context-aware-llm-service.js';
import { LLMSafetyGates } from './llm-safety-gates.js';

export interface ExecutionFlowStep {
  id: string;
  name: string;
  type: 'llm' | 'safety' | 'validation' | 'transformation';
  input: any;
  output?: any;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  dependencies: string[];
  retryCount: number;
  maxRetries: number;
  timeout: number;
  metadata: {
    startTime?: number;
    endTime?: number;
    duration?: number;
    tokens?: number;
    cost?: number;
    provider?: string;
    model?: string;
  };
}

export interface ExecutionFlow {
  id: string;
  name: string;
  description: string;
  steps: ExecutionFlowStep[];
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  createdAt: number;
  updatedAt: number;
  totalDuration?: number;
  metadata: {
    totalTokens: number;
    totalCost: number;
    safetyScore: number;
    successRate: number;
  };
}

export interface ExecutionFlowOptions {
  enableRetries?: boolean;
  enableFallbacks?: boolean;
  enableSafetyChecks?: boolean;
  enableValidation?: boolean;
  maxConcurrentSteps?: number;
  stepTimeout?: number;
  enableMetrics?: boolean;
  enableTracing?: boolean;
}

/**
 * LLM execution flow with retry and fallback mechanisms
 */
export class LLMExecutionFlow {
  private logger: Logger;
  private metrics: RefactoGentMetrics;
  private tracer: RefactoGentTracer;
  private config: RefactoGentConfig;
  private taskFramework: LLMTaskFramework;
  private llmService: ContextAwareLLMService;
  private safetyGates: LLMSafetyGates;
  private options: ExecutionFlowOptions;
  private flows: Map<string, ExecutionFlow> = new Map();
  private runningFlows: Set<string> = new Set();

  constructor(
    logger: Logger,
    metrics: RefactoGentMetrics,
    tracer: RefactoGentTracer,
    config: RefactoGentConfig,
    options: ExecutionFlowOptions = {}
  ) {
    this.logger = logger;
    this.metrics = metrics;
    this.tracer = tracer;
    this.config = config;
    this.options = {
      enableRetries: true,
      enableFallbacks: true,
      enableSafetyChecks: true,
      enableValidation: true,
      maxConcurrentSteps: 3,
      stepTimeout: 60000, // 1 minute
      enableMetrics: true,
      enableTracing: true,
      ...options,
    };

    this.taskFramework = new LLMTaskFramework(logger, metrics, tracer, config);
    this.llmService = new ContextAwareLLMService(logger, metrics, tracer, config);
    this.safetyGates = new LLMSafetyGates(logger, metrics, tracer, config);
  }

  /**
   * Initialize the execution flow
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing LLM execution flow');
    await this.taskFramework.initialize();
    await this.llmService.initialize();
    this.logger.info('LLM execution flow initialized');
  }

  /**
   * Create a new execution flow
   */
  async createFlow(
    name: string,
    description: string,
    steps: Omit<ExecutionFlowStep, 'id' | 'status' | 'retryCount' | 'metadata'>[]
  ): Promise<string> {
    const flowId = this.generateFlowId();
    const now = Date.now();

    const flow: ExecutionFlow = {
      id: flowId,
      name,
      description,
      steps: steps.map(step => ({
        ...step,
        id: this.generateStepId(),
        status: 'pending',
        retryCount: 0,
        maxRetries: step.maxRetries || 3,
        timeout: step.timeout || this.options.stepTimeout || 60000,
        metadata: {},
      })),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      metadata: {
        totalTokens: 0,
        totalCost: 0,
        safetyScore: 0,
        successRate: 0,
      },
    };

    this.flows.set(flowId, flow);

    this.logger.info('Created execution flow', {
      flowId,
      name,
      stepCount: flow.steps.length,
    });

    // Start execution
    this.executeFlow(flowId);

    return flowId;
  }

  /**
   * Execute a flow
   */
  private async executeFlow(flowId: string): Promise<void> {
    const flow = this.flows.get(flowId);
    if (!flow) {
      this.logger.error('Flow not found', { flowId });
      return;
    }

    const span = this.tracer.startAnalysisTrace('.', 'llm-execution-flow');
    const startTime = Date.now();

    try {
      flow.status = 'running';
      flow.updatedAt = Date.now();
      this.runningFlows.add(flowId);

      this.logger.info('Executing flow', {
        flowId,
        name: flow.name,
        stepCount: flow.steps.length,
      });

      // Execute steps in dependency order
      const executedSteps = new Set<string>();
      const pendingSteps = [...flow.steps];

      while (pendingSteps.length > 0) {
        const readySteps = pendingSteps.filter(step =>
          step.dependencies.every(dep => executedSteps.has(dep))
        );

        if (readySteps.length === 0) {
          this.logger.error('No ready steps found, possible circular dependency', { flowId });
          break;
        }

        // Execute ready steps (potentially in parallel)
        const stepPromises = readySteps.map(step => this.executeStep(flowId, step));
        const results = await Promise.allSettled(stepPromises);

        for (let i = 0; i < readySteps.length; i++) {
          const step = readySteps[i];
          const result = results[i];

          if (result.status === 'fulfilled') {
            executedSteps.add(step.id);
            const index = pendingSteps.findIndex(s => s.id === step.id);
            if (index !== -1) {
              pendingSteps.splice(index, 1);
            }
          } else {
            this.logger.error('Step execution failed', {
              flowId,
              stepId: step.id,
              error: result.reason,
            });
          }
        }
      }

      // Update flow status
      const failedSteps = flow.steps.filter(step => step.status === 'failed');
      if (failedSteps.length === 0) {
        flow.status = 'completed';
      } else {
        flow.status = 'failed';
      }

      flow.totalDuration = Date.now() - startTime;
      flow.updatedAt = Date.now();
      this.runningFlows.delete(flowId);

      this.tracer.recordSuccess(span, `Flow completed: ${flowId} in ${flow.totalDuration}ms`);
    } catch (error) {
      flow.status = 'failed';
      flow.updatedAt = Date.now();
      this.runningFlows.delete(flowId);

      this.tracer.recordError(span, error as Error, `Flow failed: ${flowId}`);
    }
  }

  /**
   * Execute a single step
   */
  private async executeStep(flowId: string, step: ExecutionFlowStep): Promise<void> {
    const span = this.tracer.startAnalysisTrace('.', 'llm-step-execution');
    const startTime = Date.now();

    try {
      step.status = 'running';
      step.metadata.startTime = startTime;

      this.logger.info('Executing step', {
        flowId,
        stepId: step.id,
        name: step.name,
        type: step.type,
      });

      let output: any;

      switch (step.type) {
        case 'llm':
          output = await this.executeLLMStep(step);
          break;
        case 'safety':
          output = await this.executeSafetyStep(step);
          break;
        case 'validation':
          output = await this.executeValidationStep(step);
          break;
        case 'transformation':
          output = await this.executeTransformationStep(step);
          break;
        default:
          throw new Error(`Unknown step type: ${step.type}`);
      }

      step.output = output;
      step.status = 'completed';
      step.metadata.endTime = Date.now();
      step.metadata.duration = step.metadata.endTime - step.metadata.startTime!;

      this.tracer.recordSuccess(span, `Step completed: ${step.id} in ${step.metadata.duration}ms`);
    } catch (error) {
      step.status = 'failed';
      step.metadata.endTime = Date.now();
      step.metadata.duration = step.metadata.endTime - step.metadata.startTime!;

      this.tracer.recordError(span, error as Error, `Step failed: ${step.id}`);

      // Retry if enabled
      if (this.options.enableRetries && step.retryCount < step.maxRetries) {
        step.retryCount++;
        step.status = 'pending';
        this.logger.info('Retrying step', {
          flowId,
          stepId: step.id,
          retryCount: step.retryCount,
          maxRetries: step.maxRetries,
        });
      }
    }
  }

  /**
   * Execute LLM step
   */
  private async executeLLMStep(step: ExecutionFlowStep): Promise<any> {
    const response = await this.llmService.generateWithContext({
      prompt: step.input.prompt,
      context: step.input.context,
      options: step.input.options,
    });

    step.metadata.tokens = response.context.totalTokens;
    step.metadata.cost = response.metadata.cost;
    step.metadata.provider = response.context.provider;
    step.metadata.model = response.context.model;

    return response.content;
  }

  /**
   * Execute safety step
   */
  private async executeSafetyStep(step: ExecutionFlowStep): Promise<any> {
    const result = await this.safetyGates.checkContent(
      step.input.content,
      step.input.context,
      step.input.options
    );

    if (!result.passed) {
      throw new Error(`Safety check failed: ${result.violations.length} violations`);
    }

    return result;
  }

  /**
   * Execute validation step
   */
  private async executeValidationStep(step: ExecutionFlowStep): Promise<any> {
    // Simulate validation logic
    const isValid = this.validateContent(step.input.content, step.input.rules);

    if (!isValid) {
      throw new Error('Validation failed');
    }

    return { valid: true, score: 1.0 };
  }

  /**
   * Execute transformation step
   */
  private async executeTransformationStep(step: ExecutionFlowStep): Promise<any> {
    // Simulate transformation logic
    return this.transformContent(step.input.content, step.input.transformations);
  }

  /**
   * Validate content
   */
  private validateContent(content: string, rules: string[]): boolean {
    // Simple validation logic
    for (const rule of rules) {
      if (!content.includes(rule)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Transform content
   */
  private transformContent(content: string, transformations: string[]): string {
    let result = content;
    for (const transformation of transformations) {
      // Simple transformation logic
      result = result.replace(new RegExp(transformation, 'g'), 'transformed');
    }
    return result;
  }

  /**
   * Get flow by ID
   */
  getFlow(flowId: string): ExecutionFlow | undefined {
    return this.flows.get(flowId);
  }

  /**
   * Get all flows
   */
  getAllFlows(): ExecutionFlow[] {
    return Array.from(this.flows.values());
  }

  /**
   * Cancel a flow
   */
  async cancelFlow(flowId: string): Promise<boolean> {
    const flow = this.flows.get(flowId);
    if (!flow) {
      return false;
    }

    flow.status = 'cancelled';
    flow.updatedAt = Date.now();
    this.runningFlows.delete(flowId);

    this.logger.info('Cancelled flow', { flowId });
    return true;
  }

  /**
   * Generate unique flow ID
   */
  private generateFlowId(): string {
    return `flow-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique step ID
   */
  private generateStepId(): string {
    return `step-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get execution statistics
   */
  async getExecutionStats(): Promise<{
    totalFlows: number;
    runningFlows: number;
    completedFlows: number;
    failedFlows: number;
    averageDuration: number;
    successRate: number;
    totalTokens: number;
    totalCost: number;
  }> {
    const flows = Array.from(this.flows.values());
    const completedFlows = flows.filter(f => f.status === 'completed');
    const failedFlows = flows.filter(f => f.status === 'failed');

    const averageDuration =
      completedFlows.length > 0
        ? completedFlows.reduce((sum, f) => sum + (f.totalDuration || 0), 0) / completedFlows.length
        : 0;

    const successRate = flows.length > 0 ? completedFlows.length / flows.length : 0;

    const totalTokens = flows.reduce((sum, f) => sum + f.metadata.totalTokens, 0);
    const totalCost = flows.reduce((sum, f) => sum + f.metadata.totalCost, 0);

    return {
      totalFlows: flows.length,
      runningFlows: this.runningFlows.size,
      completedFlows: completedFlows.length,
      failedFlows: failedFlows.length,
      averageDuration,
      successRate,
      totalTokens,
      totalCost,
    };
  }

  /**
   * Execute workflow
   */
  async executeWorkflow(workflow: any, options: any = {}): Promise<any> {
    const span = this.tracer.startAnalysisTrace('.', 'execute-workflow');

    try {
      this.logger.info('Executing LLM workflow', { workflowId: workflow.id });

      // Execute workflow steps
      const results = [];
      for (const step of workflow.steps) {
        const stepResult = await this.executeStep(step, options);
        results.push(stepResult);
      }

      this.tracer.recordSuccess(span, `Workflow completed with ${results.length} steps`);
      return {
        success: true,
        results,
        workflowId: workflow.id,
      };
    } catch (error) {
      this.tracer.recordError(span, error as Error, 'Workflow execution failed');
      throw error;
    }
  }

  /**
   * Close the execution flow
   */
  async close(): Promise<void> {
    this.logger.info('Closing LLM execution flow');
    await this.taskFramework.close();
    await this.llmService.close();
  }
}
