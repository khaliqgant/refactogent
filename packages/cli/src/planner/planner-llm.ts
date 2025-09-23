import { Logger } from '../utils/logger.js';
import { RefactoGentMetrics } from '../observability/metrics.js';
import { RefactoGentTracer } from '../observability/tracing.js';
import { RefactoGentConfig } from '../config/refactogent-schema.js';
import { IntentClassification } from './intent-classifier.js';

export interface PlanNode {
  id: string;
  type: 'tool' | 'decision' | 'parallel' | 'sequential' | 'condition' | 'verification';
  name: string;
  description: string;
  tool?: string;
  parameters?: Record<string, any>;
  conditions?: string[];
  dependencies: string[];
  estimatedTime: number;
  riskLevel: 'low' | 'medium' | 'high';
  retryable: boolean;
  rollbackPlan?: string;
}

export interface PlanEdge {
  from: string;
  to: string;
  type: 'success' | 'failure' | 'condition' | 'parallel' | 'sequential';
  condition?: string;
  weight: number;
}

export interface PlanGraph {
  nodes: Map<string, PlanNode>;
  edges: Map<string, PlanEdge>;
  entryPoint: string;
  exitPoints: string[];
  estimatedTotalTime: number;
  maxParallelism: number;
  riskAssessment: {
    overall: 'low' | 'medium' | 'high';
    criticalPaths: string[];
    rollbackPoints: string[];
  };
}

export interface PlannerOptions {
  maxParallelism?: number;
  includeRollback?: boolean;
  optimizeForTime?: boolean;
  optimizeForSafety?: boolean;
  includeVerification?: boolean;
  maxRetries?: number;
}

/**
 * LLM-powered planner that generates execution plans with tool usage
 */
export class PlannerLLM {
  private logger: Logger;
  private metrics: RefactoGentMetrics;
  private tracer: RefactoGentTracer;
  private config: RefactoGentConfig;

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
  }

  /**
   * Generate a plan graph for the given intent and context
   */
  async generatePlan(
    intent: IntentClassification,
    context: string,
    options: PlannerOptions = {}
  ): Promise<PlanGraph> {
    const span = this.tracer.startAnalysisTrace('.', 'plan-generation');

    try {
      this.logger.info('Generating execution plan', {
        intent: intent.intent,
        complexity: intent.complexity,
        riskLevel: intent.riskLevel,
        options,
      });

      const plan = await this.createPlanGraph(intent, context, options);

      this.tracer.recordSuccess(
        span,
        `Plan generated with ${plan.nodes.size} nodes, ${plan.edges.size} edges`
      );

      this.metrics.recordPerformance(
        Date.now() - span.startTime,
        0, // memory usage
        0 // cpu usage
      );

      return plan;
    } catch (error) {
      this.tracer.recordError(span, error as Error, 'Plan generation failed');
      throw error;
    }
  }

  /**
   * Create the actual plan graph
   */
  private async createPlanGraph(
    intent: IntentClassification,
    context: string,
    options: PlannerOptions
  ): Promise<PlanGraph> {
    const nodes = new Map<string, PlanNode>();
    const edges = new Map<string, PlanEdge>();

    // Generate nodes based on intent and required tools
    const toolNodes = this.generateToolNodes(intent, options);
    const decisionNodes = this.generateDecisionNodes(intent, options);
    const parallelNodes = this.generateParallelNodes(intent, options);

    // Add all nodes
    [...toolNodes, ...decisionNodes, ...parallelNodes].forEach(node => {
      nodes.set(node.id, node);
    });

    // Generate edges between nodes
    const planEdges = this.generateEdges(nodes, intent, options);
    planEdges.forEach(edge => {
      edges.set(`${edge.from}-${edge.to}`, edge);
    });

    // Calculate plan metrics
    const estimatedTotalTime = this.calculateTotalTime(nodes);
    const maxParallelism = this.calculateMaxParallelism(nodes, edges);
    const riskAssessment = this.assessPlanRisk(nodes, edges, intent);

    return {
      nodes,
      edges,
      entryPoint: this.findEntryPoint(nodes),
      exitPoints: this.findExitPoints(nodes, edges),
      estimatedTotalTime,
      maxParallelism,
      riskAssessment,
    };
  }

  /**
   * Generate tool nodes based on intent and required tools
   */
  private generateToolNodes(intent: IntentClassification, options: PlannerOptions): PlanNode[] {
    const nodes: PlanNode[] = [];
    const tools = intent.requiredTools || [];

    tools.forEach((tool, index) => {
      const node: PlanNode = {
        id: `tool-${tool}-${index}`,
        type: 'tool',
        name: `${tool} execution`,
        description: `Execute ${tool} tool`,
        tool,
        parameters: this.getToolParameters(tool, intent),
        dependencies: index > 0 ? [`tool-${tools[index - 1]}-${index - 1}`] : [],
        estimatedTime: this.estimateToolTime(tool, intent.complexity),
        riskLevel: this.assessToolRisk(tool),
        retryable: this.isToolRetryable(tool),
        rollbackPlan: options.includeRollback ? this.generateRollbackPlan(tool) : undefined,
      };
      nodes.push(node);
    });

    // Add verification nodes when requested
    if (options.includeVerification) {
      const verificationNode: PlanNode = {
        id: 'verify-results',
        type: 'verification',
        name: 'Verify Results',
        description: 'Verify that all changes are correct and complete',
        dependencies: tools.map((_, index) => `tool-${tools[index]}-${index}`),
        estimatedTime: 2,
        riskLevel: 'low',
        retryable: true,
      };
      nodes.push(verificationNode);
    }

    return nodes;
  }

  /**
   * Generate decision nodes for conditional logic
   */
  private generateDecisionNodes(intent: IntentClassification, options: PlannerOptions): PlanNode[] {
    const nodes: PlanNode[] = [];

    // Add decision nodes for complex intents
    if (intent.complexity === 'high' || intent.riskLevel === 'high') {
      const decisionNode: PlanNode = {
        id: 'decision-safety-check',
        type: 'decision',
        name: 'Safety Check Decision',
        description: 'Decide whether to proceed based on safety assessment',
        conditions: ['safety_score > 0.8', 'no_critical_violations'],
        dependencies: [],
        estimatedTime: 1,
        riskLevel: 'medium',
        retryable: false,
      };
      nodes.push(decisionNode);
    }

    return nodes;
  }

  /**
   * Generate parallel execution nodes
   */
  private generateParallelNodes(intent: IntentClassification, options: PlannerOptions): PlanNode[] {
    const nodes: PlanNode[] = [];

    // Add parallel execution for compatible tools
    if (options.maxParallelism && options.maxParallelism > 1) {
      // Generate multiple parallel nodes based on maxParallelism
      for (let i = 0; i < Math.min(options.maxParallelism, 3); i++) {
        const parallelNode: PlanNode = {
          id: `parallel-execution-${i}`,
          type: 'parallel',
          name: `Parallel Tool Execution ${i + 1}`,
          description: `Execute compatible tools in parallel (group ${i + 1})`,
          dependencies: [],
          estimatedTime: 5,
          riskLevel: 'medium',
          retryable: true,
        };
        nodes.push(parallelNode);
      }
    }

    return nodes;
  }

  /**
   * Generate edges between nodes
   */
  private generateEdges(
    nodes: Map<string, PlanNode>,
    intent: IntentClassification,
    options: PlannerOptions
  ): PlanEdge[] {
    const edges: PlanEdge[] = [];
    const nodeList = Array.from(nodes.values());

    // Create sequential edges for tool nodes
    for (let i = 0; i < nodeList.length - 1; i++) {
      const currentNode = nodeList[i];
      const nextNode = nodeList[i + 1];

      if (currentNode.type === 'tool' && nextNode.type === 'tool') {
        edges.push({
          from: currentNode.id,
          to: nextNode.id,
          type: 'success',
          weight: 1.0,
        });
      }
    }

    // Add conditional edges for decision nodes
    nodeList.forEach(node => {
      if (node.type === 'decision' && node.conditions) {
        node.conditions.forEach(condition => {
          edges.push({
            from: node.id,
            to: this.findNextNode(nodeList, node.id),
            type: 'condition',
            condition,
            weight: 0.8,
          });
        });
      }
    });

    return edges;
  }

  /**
   * Get tool-specific parameters
   */
  private getToolParameters(tool: string, intent: IntentClassification): Record<string, any> {
    const baseParams: Record<string, any> = {
      intent: intent.intent,
      complexity: intent.complexity,
      riskLevel: intent.riskLevel,
    };

    switch (tool) {
      case 'search':
        return { ...baseParams, query: intent.reasoning, maxResults: 10 };
      case 'read':
        return { ...baseParams, includeTests: true, includeConfigs: true };
      case 'edit':
        return { ...baseParams, backup: true, validate: true };
      case 'typecheck':
        return { ...baseParams, strict: true, includeTests: true };
      case 'format':
        return { ...baseParams, style: 'prettier', write: true };
      case 'test-runner':
        return { ...baseParams, coverage: true, verbose: true };
      default:
        return baseParams;
    }
  }

  /**
   * Estimate time for tool execution
   */
  private estimateToolTime(tool: string, complexity: 'low' | 'medium' | 'high'): number {
    const baseTimes: Record<string, number> = {
      search: 2,
      read: 1,
      edit: 5,
      typecheck: 3,
      format: 1,
      'test-runner': 10,
      'safety-check': 5,
      rollback: 2,
    };

    const complexityMultiplier = {
      low: 0.5,
      medium: 1.0,
      high: 2.0,
    };

    return Math.round((baseTimes[tool] || 5) * complexityMultiplier[complexity]);
  }

  /**
   * Assess risk level for a tool
   */
  private assessToolRisk(tool: string): 'low' | 'medium' | 'high' {
    const toolRisk: Record<string, 'low' | 'medium' | 'high'> = {
      search: 'low',
      read: 'low',
      edit: 'high',
      typecheck: 'low',
      format: 'low',
      'test-runner': 'medium',
      'safety-check': 'low',
      rollback: 'high',
    };

    return toolRisk[tool] || 'medium';
  }

  /**
   * Check if a tool is retryable
   */
  private isToolRetryable(tool: string): boolean {
    const retryableTools = ['search', 'read', 'typecheck', 'format', 'test-runner', 'safety-check'];
    return retryableTools.includes(tool);
  }

  /**
   * Generate rollback plan for a tool
   */
  private generateRollbackPlan(tool: string): string {
    const rollbackPlans: Record<string, string> = {
      edit: 'Restore from backup files',
      format: 'Revert formatting changes',
      'test-runner': 'Skip failed tests and continue',
      typecheck: 'Fix type errors or skip strict checking',
    };

    return rollbackPlans[tool] || 'Manual intervention required';
  }

  /**
   * Calculate total estimated time for the plan
   */
  private calculateTotalTime(nodes: Map<string, PlanNode>): number {
    return Array.from(nodes.values()).reduce((total, node) => total + node.estimatedTime, 0);
  }

  /**
   * Calculate maximum parallelism in the plan
   */
  private calculateMaxParallelism(
    nodes: Map<string, PlanNode>,
    edges: Map<string, PlanEdge>
  ): number {
    // Simple calculation - could be more sophisticated
    const parallelNodes = Array.from(nodes.values()).filter(node => node.type === 'parallel');
    const totalNodes = nodes.size;

    // For optimization requests, allow more parallelism
    const hasOptimizationNodes = Array.from(nodes.values()).some(
      node =>
        node.name.toLowerCase().includes('optimize') ||
        node.name.toLowerCase().includes('performance')
    );

    if (hasOptimizationNodes && totalNodes > 2) {
      return Math.max(2, Math.min(4, totalNodes));
    }

    return Math.max(1, parallelNodes.length);
  }

  /**
   * Assess overall plan risk
   */
  private assessPlanRisk(
    nodes: Map<string, PlanNode>,
    edges: Map<string, PlanEdge>,
    intent?: IntentClassification
  ): {
    overall: 'low' | 'medium' | 'high';
    criticalPaths: string[];
    rollbackPoints: string[];
  } {
    const highRiskNodes = Array.from(nodes.values())
      .filter(node => node.riskLevel === 'high')
      .map(node => node.id);

    const criticalPaths = highRiskNodes;
    const rollbackPoints = Array.from(nodes.values())
      .filter(node => node.rollbackPlan)
      .map(node => node.id);

    let overall: 'low' | 'medium' | 'high' = 'low';

    // Check for migration intent (high risk) - check intent directly
    const isMigrationIntent = intent?.intent === 'migration';

    if (isMigrationIntent || highRiskNodes.length > 2) {
      overall = 'high';
    } else if (highRiskNodes.length > 0) {
      overall = 'medium';
    }

    return {
      overall,
      criticalPaths,
      rollbackPoints,
    };
  }

  /**
   * Find the entry point of the plan
   */
  private findEntryPoint(nodes: Map<string, PlanNode>): string {
    const nodeList = Array.from(nodes.values());
    return nodeList.find(node => node.dependencies.length === 0)?.id || nodeList[0]?.id || '';
  }

  /**
   * Find exit points of the plan
   */
  private findExitPoints(nodes: Map<string, PlanNode>, edges: Map<string, PlanEdge>): string[] {
    const nodeIds = Array.from(nodes.keys());
    const edgeTargets = Array.from(edges.values()).map(edge => edge.to);

    return nodeIds.filter(id => !edgeTargets.includes(id));
  }

  /**
   * Find the next node after a decision
   */
  private findNextNode(nodes: PlanNode[], currentNodeId: string): string {
    const currentIndex = nodes.findIndex(node => node.id === currentNodeId);
    return nodes[currentIndex + 1]?.id || '';
  }

  /**
   * Validate a plan graph
   */
  async validatePlan(plan: PlanGraph): Promise<{
    isValid: boolean;
    issues: string[];
    suggestions: string[];
  }> {
    const issues: string[] = [];
    const suggestions: string[] = [];

    // Check for cycles
    if (this.hasCycles(plan)) {
      issues.push('Plan contains cycles');
      suggestions.push('Remove circular dependencies between nodes');
    }

    // Check for unreachable nodes
    const unreachable = this.findUnreachableNodes(plan);
    if (unreachable.length > 0) {
      issues.push(`Unreachable nodes: ${unreachable.join(', ')}`);
      suggestions.push('Add edges to connect unreachable nodes');
    }

    // Check for missing dependencies
    const missingDeps = this.findMissingDependencies(plan);
    if (missingDeps.length > 0) {
      issues.push(`Missing dependencies: ${missingDeps.join(', ')}`);
      suggestions.push('Add missing dependency edges');
    }

    return {
      isValid: issues.length === 0,
      issues,
      suggestions,
    };
  }

  /**
   * Check if plan has cycles
   */
  private hasCycles(plan: PlanGraph): boolean {
    // Simple cycle detection - could be more sophisticated
    const visited = new Set<string>();
    const recStack = new Set<string>();

    const dfs = (nodeId: string): boolean => {
      if (recStack.has(nodeId)) return true;
      if (visited.has(nodeId)) return false;

      visited.add(nodeId);
      recStack.add(nodeId);

      const outgoingEdges = Array.from(plan.edges.values()).filter(edge => edge.from === nodeId);

      for (const edge of outgoingEdges) {
        if (dfs(edge.to)) return true;
      }

      recStack.delete(nodeId);
      return false;
    };

    for (const nodeId of plan.nodes.keys()) {
      if (!visited.has(nodeId)) {
        if (dfs(nodeId)) return true;
      }
    }

    return false;
  }

  /**
   * Find unreachable nodes
   */
  private findUnreachableNodes(plan: PlanGraph): string[] {
    const reachable = new Set<string>();
    const queue = [plan.entryPoint];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (reachable.has(current)) continue;

      reachable.add(current);
      const outgoingEdges = Array.from(plan.edges.values()).filter(edge => edge.from === current);

      for (const edge of outgoingEdges) {
        queue.push(edge.to);
      }
    }

    return Array.from(plan.nodes.keys()).filter(id => !reachable.has(id));
  }

  /**
   * Find missing dependencies
   */
  private findMissingDependencies(plan: PlanGraph): string[] {
    const missing: string[] = [];

    for (const [nodeId, node] of plan.nodes) {
      for (const dep of node.dependencies) {
        if (!plan.nodes.has(dep)) {
          missing.push(`${nodeId} depends on missing node ${dep}`);
        }
      }
    }

    return missing;
  }
}
