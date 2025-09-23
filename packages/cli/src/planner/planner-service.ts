import { Logger } from '../utils/logger.js';
import { RefactoGentMetrics } from '../observability/metrics.js';
import { RefactoGentTracer } from '../observability/tracing.js';
import { RefactoGentConfig } from '../config/refactogent-schema.js';
import { IntentClassifier, IntentClassification } from './intent-classifier.js';
import { PlannerLLM, PlanGraph, PlannerOptions } from './planner-llm.js';
import { ToolExecutorRegistry, ExecutionContext, ToolResult } from './tool-executors.js';
import { PatchSetManager, PatchSet, PatchSetOptions } from './patch-sets.js';

export interface PlannerServiceOptions {
  maxRetries?: number;
  enableParallelism?: boolean;
  includeRollback?: boolean;
  validatePlan?: boolean;
  dryRun?: boolean;
  timeout?: number;
}

export interface ExecutionResult {
  success: boolean;
  planGraph: PlanGraph;
  executionResults: Map<string, ToolResult>;
  patchSet?: PatchSet;
  executionTime: number;
  retryCount: number;
  errors: string[];
  warnings: string[];
}

/**
 * Main planner service that orchestrates intent classification, plan generation, and execution
 */
export class PlannerService {
  private logger: Logger;
  private metrics: RefactoGentMetrics;
  private tracer: RefactoGentTracer;
  private config: RefactoGentConfig;
  private intentClassifier: IntentClassifier;
  private plannerLLM: PlannerLLM;
  private toolRegistry: ToolExecutorRegistry;
  private patchSetManager: PatchSetManager;

  constructor(
    logger: Logger,
    metrics: RefactoGentMetrics,
    tracer: RefactoGentTracer,
    config: RefactoGentConfig
  ) {
    this.logger = logger;
    this.metrics = metrics;
    this.tracer = tracer;
    this.config = config;
    
    this.intentClassifier = new IntentClassifier(logger, metrics, tracer, config);
    this.plannerLLM = new PlannerLLM(logger, metrics, tracer, config);
    this.toolRegistry = new ToolExecutorRegistry(logger, metrics, tracer, config);
    this.patchSetManager = new PatchSetManager(logger, metrics, tracer, config);
  }

  /**
   * Execute a complete planning and execution workflow
   */
  async execute(
    input: string,
    context: string,
    projectPath: string,
    options: PlannerServiceOptions = {}
  ): Promise<ExecutionResult> {
    const span = this.tracer.startAnalysisTrace(projectPath, 'planner-execution');
    const startTime = Date.now();

    try {
      this.logger.info('Starting planner execution', {
        input: input.substring(0, 100),
        context: context?.substring(0, 50),
        projectPath,
        options
      });

      // Step 1: Classify intent
      const intent = await this.intentClassifier.classifyIntent(input, context, {
        includeSubIntents: true,
        estimateComplexity: true,
        estimateTime: true,
        assessRisk: true,
        suggestTools: true
      });

      this.logger.info('Intent classified', {
        intent: intent.intent,
        confidence: intent.confidence,
        complexity: intent.complexity,
        riskLevel: intent.riskLevel
      });

      // Step 2: Generate plan
      const planOptions: PlannerOptions = {
        maxParallelism: options.enableParallelism ? 3 : 1,
        includeRollback: options.includeRollback,
        optimizeForTime: !options.validatePlan,
        optimizeForSafety: options.validatePlan,
        includeVerification: true,
        maxRetries: options.maxRetries || 3
      };

      const planGraph = await this.plannerLLM.generatePlan(intent, context, planOptions);

      this.logger.info('Plan generated', {
        nodeCount: planGraph.nodes.size,
        edgeCount: planGraph.edges.size,
        estimatedTime: planGraph.estimatedTotalTime,
        riskLevel: planGraph.riskAssessment.overall
      });

      // Step 3: Validate plan if requested
      if (options.validatePlan) {
        const validation = await this.plannerLLM.validatePlan(planGraph);
        if (!validation.isValid) {
          this.logger.warn('Plan validation failed', {
            issues: validation.issues,
            suggestions: validation.suggestions
          });
        }
      }

      // Step 4: Execute plan
      const executionResults = await this.executePlan(planGraph, projectPath, options);

      // Step 5: Create patch set if there were edits
      let patchSet: PatchSet | undefined;
      const editResults = Array.from(executionResults.values())
        .filter(result => result.data && result.data.changes);

      if (editResults.length > 0) {
        patchSet = await this.createPatchSetFromResults(editResults, intent, options);
      }

      const executionTime = Date.now() - startTime;
      const success = Array.from(executionResults.values()).every(result => result.success);

      this.tracer.recordSuccess(
        span,
        `Planner execution completed: ${success ? 'success' : 'partial success'}`
      );

      this.metrics.recordPerformance(executionTime, 0, 0);

      return {
        success,
        planGraph,
        executionResults,
        patchSet,
        executionTime,
        retryCount: 0, // TODO: Track retries
        errors: Array.from(executionResults.values())
          .filter(result => !result.success)
          .map(result => result.error || 'Unknown error'),
        warnings: []
      };
    } catch (error) {
      this.tracer.recordError(span, error as Error, 'Planner execution failed');
      throw error;
    }
  }

  /**
   * Execute a plan graph
   */
  private async executePlan(
    planGraph: PlanGraph,
    projectPath: string,
    options: PlannerServiceOptions
  ): Promise<Map<string, ToolResult>> {
    const executionResults = new Map<string, ToolResult>();
    const executionContext: ExecutionContext = {
      projectPath,
      workingDirectory: projectPath,
      environment: process.env as Record<string, string>,
      previousResults: executionResults,
      options: {}
    };

    // Execute nodes in dependency order
    const executedNodes = new Set<string>();
    const pendingNodes = new Set(planGraph.nodes.keys());

    while (pendingNodes.size > 0) {
      const readyNodes = this.findReadyNodes(planGraph, executedNodes, pendingNodes);
      
      if (readyNodes.length === 0) {
        this.logger.error('No ready nodes found, possible circular dependency');
        break;
      }

      // Execute ready nodes (potentially in parallel)
      const executionPromises = readyNodes.map(nodeId => 
        this.executeNode(nodeId, planGraph, executionContext, options)
      );

      const results = await Promise.allSettled(executionPromises);

      for (let i = 0; i < results.length; i++) {
        const nodeId = readyNodes[i];
        const result = results[i];

        if (result.status === 'fulfilled') {
          executionResults.set(nodeId, result.value);
          executedNodes.add(nodeId);
          pendingNodes.delete(nodeId);
        } else {
          this.logger.error('Node execution failed', {
            nodeId,
            error: result.reason
          });
          // Mark as failed but continue
          executionResults.set(nodeId, {
            success: false,
            error: result.reason instanceof Error ? result.reason.message : String(result.reason),
            executionTime: 0,
            retryable: true
          });
          executedNodes.add(nodeId);
          pendingNodes.delete(nodeId);
        }
      }
    }

    return executionResults;
  }

  /**
   * Find nodes that are ready to execute
   */
  private findReadyNodes(
    planGraph: PlanGraph,
    executedNodes: Set<string>,
    pendingNodes: Set<string>
  ): string[] {
    return Array.from(pendingNodes).filter(nodeId => {
      const node = planGraph.nodes.get(nodeId);
      if (!node) return false;

      // Check if all dependencies are executed
      return node.dependencies.every(dep => executedNodes.has(dep));
    });
  }

  /**
   * Execute a single node
   */
  private async executeNode(
    nodeId: string,
    planGraph: PlanGraph,
    context: ExecutionContext,
    options: PlannerServiceOptions
  ): Promise<ToolResult> {
    const node = planGraph.nodes.get(nodeId);
    if (!node) {
      throw new Error(`Node ${nodeId} not found`);
    }

    this.logger.info('Executing node', {
      nodeId,
      type: node.type,
      name: node.name,
      tool: node.tool
    });

    if (node.type === 'tool' && node.tool) {
      const executor = this.toolRegistry.get(node.tool);
      if (!executor) {
        throw new Error(`Tool executor not found: ${node.tool}`);
      }

      return await executor.execute(node, context);
    } else {
      // Handle non-tool nodes (decisions, parallel, etc.)
      return await this.executeNonToolNode(node, context);
    }
  }

  /**
   * Execute non-tool nodes
   */
  private async executeNonToolNode(node: any, context: ExecutionContext): Promise<ToolResult> {
    // Simulate execution of decision, parallel, or sequential nodes
    this.logger.debug('Executing non-tool node', { nodeId: node.id, type: node.type });
    
    return {
      success: true,
      data: { nodeType: node.type, executed: true },
      executionTime: 1,
      retryable: false
    };
  }

  /**
   * Create patch set from execution results
   */
  private async createPatchSetFromResults(
    editResults: ToolResult[],
    intent: IntentClassification,
    options: PlannerServiceOptions
  ): Promise<PatchSet> {
    const patches = editResults
      .filter(result => result.data && result.data.changes)
      .flatMap(result => result.data.changes)
      .map(change => ({
        filePath: change.file,
        originalContent: change.original || '',
        newContent: change.updated || '',
        changes: [{
          type: 'replace' as const,
          startLine: change.startLine || 1,
          endLine: change.endLine || 1,
          originalText: change.original || '',
          newText: change.updated || '',
          context: {
            before: [],
            after: []
          }
        }],
        metadata: {
          timestamp: Date.now(),
          author: 'refactogent',
          description: `Generated by ${intent.intent} operation`,
          checksum: this.calculateChecksum(change.updated || '')
        }
      }));

    const patchSetOptions: PatchSetOptions = {
      createBackup: options.includeRollback,
      validateChanges: true,
      includeMetadata: true,
      estimateImpact: true,
      generateRollback: options.includeRollback
    };

    return await this.patchSetManager.createPatchSet(
      `${intent.intent}-${Date.now()}`,
      `Generated patch set for ${intent.intent} operation`,
      patches,
      patchSetOptions
    );
  }

  /**
   * Calculate checksum for content
   */
  private calculateChecksum(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  /**
   * Get planner statistics
   */
  async getPlannerStats(): Promise<{
    totalExecutions: number;
    successRate: number;
    averageExecutionTime: number;
    intentDistribution: Record<string, number>;
    toolUsage: Record<string, number>;
  }> {
    // This would typically query metrics storage
    return {
      totalExecutions: 0,
      successRate: 0,
      averageExecutionTime: 0,
      intentDistribution: {},
      toolUsage: {}
    };
  }

  /**
   * Close the planner service
   */
  async close(): Promise<void> {
    this.logger.info('Closing planner service');
    // Cleanup resources if needed
  }
}
