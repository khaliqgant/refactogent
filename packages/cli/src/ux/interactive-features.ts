import { Logger } from '../utils/logger.js';
import { RefactoGentMetrics } from '../observability/metrics.js';
import { RefactoGentTracer } from '../observability/tracing.js';
import { RefactoGentConfig } from '../config/refactogent-schema.js';

export interface Citation {
  id: string;
  type: 'file' | 'symbol' | 'dependency' | 'test';
  path: string;
  line?: number;
  content: string;
  relevance: number;
  reason: string;
  hoverText?: string;
}

export interface InteractiveOptions {
  enableCitations?: boolean;
  enableHover?: boolean;
  enableReGround?: boolean;
  enablePlanPreview?: boolean;
  maxCitations?: number;
  hoverDelay?: number;
}

export interface PlanPreview {
  steps: PlanStep[];
  estimatedTime: number;
  riskLevel: 'low' | 'medium' | 'high';
  rollbackPoints: string[];
  dependencies: string[];
}

export interface PlanStep {
  id: string;
  name: string;
  description: string;
  type: 'search' | 'read' | 'edit' | 'test' | 'verify';
  estimatedTime: number;
  dependencies: string[];
  riskLevel: 'low' | 'medium' | 'high';
  rollbackPlan?: string;
}

export class InteractiveFeatures {
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
   * Generate citations for a given query and context
   */
  async generateCitations(
    query: string,
    context: any,
    options: InteractiveOptions = {}
  ): Promise<Citation[]> {
    const span = this.tracer.startAnalysisTrace('.', 'generate-citations');

    try {
      this.logger.info('Generating citations', { query, options });

      const opts = {
        enableCitations: true,
        enableHover: true,
        maxCitations: 10,
        hoverDelay: 500,
        ...options,
      };

      if (!opts.enableCitations) {
        return [];
      }

      // Mock implementation - in real implementation would use retrieval orchestrator
      const mockCitations: Citation[] = [
        {
          id: 'citation-1',
          type: 'file',
          path: 'src/utils/helper.ts',
          line: 5,
          content: 'export function helper() { return "help"; }',
          relevance: 0.9,
          reason: 'Function definition matches query keywords',
          hoverText: 'This function provides utility functionality',
        },
        {
          id: 'citation-2',
          type: 'symbol',
          path: 'src/components/Button.tsx',
          line: 12,
          content: 'export const Button = () => <button>Click me</button>',
          relevance: 0.8,
          reason: 'Component referenced in query',
          hoverText: 'React component for user interaction',
        },
        {
          id: 'citation-3',
          type: 'dependency',
          path: 'src/components/Button.tsx',
          content: 'import { helper } from "../utils/helper"',
          relevance: 0.7,
          reason: 'Import relationship to cited function',
          hoverText: 'This file imports the helper function',
        },
      ];

      // Filter and limit citations
      const filteredCitations = mockCitations
        .filter(citation => citation.relevance > 0.5)
        .slice(0, opts.maxCitations || 10);

      this.tracer.recordSuccess(span, `Generated ${filteredCitations.length} citations`);
      return filteredCitations;
    } catch (error) {
      this.tracer.recordError(span, error as Error, 'Citation generation failed');
      throw error;
    }
  }

  /**
   * Generate hover text for a citation
   */
  generateHoverText(citation: Citation): string {
    const { type, path, line, content, reason } = citation;

    let hoverText = `📄 ${path}`;
    if (line) {
      hoverText += `:${line}`;
    }
    hoverText += `\n\n`;

    hoverText += `**Type:** ${type}\n`;
    hoverText += `**Relevance:** ${(citation.relevance * 100).toFixed(1)}%\n`;
    hoverText += `**Reason:** ${reason}\n\n`;

    hoverText += `**Content:**\n`;
    hoverText += '```\n';
    hoverText += content;
    hoverText += '\n```';

    return hoverText;
  }

  /**
   * Re-ground retrieval to refresh context
   */
  async reGround(
    query: string,
    projectPath: string,
    options: InteractiveOptions = {}
  ): Promise<{
    success: boolean;
    newContext: any;
    citations: Citation[];
    message: string;
  }> {
    const span = this.tracer.startAnalysisTrace(projectPath, 're-ground');

    try {
      this.logger.info('Re-grounding retrieval', { query, projectPath, options });

      // Mock implementation - in real implementation would use retrieval orchestrator
      const newContext = {
        files: ['src/utils/helper.ts', 'src/components/Button.tsx'],
        symbols: ['helper', 'Button'],
        dependencies: ['Button -> helper'],
        timestamp: new Date().toISOString(),
      };

      const citations = await this.generateCitations(query, newContext, options);

      const result = {
        success: true,
        newContext,
        citations,
        message: `Re-grounding completed. Found ${citations.length} new citations.`,
      };

      this.tracer.recordSuccess(span, 'Re-grounding completed successfully');
      return result;
    } catch (error) {
      this.tracer.recordError(span, error as Error, 'Re-grounding failed');
      return {
        success: false,
        newContext: null,
        citations: [],
        message: `Re-grounding failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Generate plan preview for dry-run
   */
  async generatePlanPreview(
    query: string,
    projectPath: string,
    options: InteractiveOptions = {}
  ): Promise<PlanPreview> {
    const span = this.tracer.startAnalysisTrace(projectPath, 'plan-preview');

    try {
      this.logger.info('Generating plan preview', { query, projectPath, options });

      // Mock implementation - in real implementation would use planner LLM
      const steps: PlanStep[] = [
        {
          id: 'step-1',
          name: 'Search for relevant files',
          description: 'Find files that match the query criteria',
          type: 'search',
          estimatedTime: 2,
          dependencies: [],
          riskLevel: 'low',
        },
        {
          id: 'step-2',
          name: 'Read and analyze code',
          description: 'Examine the found files for understanding',
          type: 'read',
          estimatedTime: 5,
          dependencies: ['step-1'],
          riskLevel: 'low',
        },
        {
          id: 'step-3',
          name: 'Generate refactoring suggestions',
          description: 'Create specific refactoring recommendations',
          type: 'edit',
          estimatedTime: 10,
          dependencies: ['step-2'],
          riskLevel: 'medium',
          rollbackPlan: 'Revert to original code if issues arise',
        },
        {
          id: 'step-4',
          name: 'Verify changes',
          description: 'Run tests and linting to ensure quality',
          type: 'verify',
          estimatedTime: 3,
          dependencies: ['step-3'],
          riskLevel: 'low',
        },
      ];

      const estimatedTime = steps.reduce((sum, step) => sum + step.estimatedTime, 0);
      const riskLevel = this.calculateOverallRisk(steps);
      const rollbackPoints = steps.filter(step => step.rollbackPlan).map(step => step.id);
      const dependencies = steps
        .flatMap(step => step.dependencies)
        .filter((dep, index, arr) => arr.indexOf(dep) === index);

      const planPreview: PlanPreview = {
        steps,
        estimatedTime,
        riskLevel,
        rollbackPoints,
        dependencies,
      };

      this.tracer.recordSuccess(span, `Plan preview generated with ${steps.length} steps`);
      return planPreview;
    } catch (error) {
      this.tracer.recordError(span, error as Error, 'Plan preview generation failed');
      throw error;
    }
  }

  /**
   * Format plan preview for display
   */
  formatPlanPreview(plan: PlanPreview): string {
    let output = '📋 Plan Preview (Dry Run)\n';
    output += '='.repeat(50) + '\n\n';

    output += `⏱️  **Estimated Time:** ${plan.estimatedTime} minutes\n`;
    output += `⚠️  **Risk Level:** ${plan.riskLevel.toUpperCase()}\n`;
    output += `🔄 **Rollback Points:** ${plan.rollbackPoints.length}\n`;
    output += `🔗 **Dependencies:** ${plan.dependencies.length}\n\n`;

    output += '📝 **Steps:**\n';
    output += '-'.repeat(30) + '\n';

    plan.steps.forEach((step, index) => {
      output += `${index + 1}. **${step.name}**\n`;
      output += `   Type: ${step.type}\n`;
      output += `   Time: ${step.estimatedTime} min\n`;
      output += `   Risk: ${step.riskLevel}\n`;
      output += `   Description: ${step.description}\n`;
      if (step.dependencies.length > 0) {
        output += `   Dependencies: ${step.dependencies.join(', ')}\n`;
      }
      if (step.rollbackPlan) {
        output += `   Rollback: ${step.rollbackPlan}\n`;
      }
      output += '\n';
    });

    return output;
  }

  /**
   * Calculate overall risk level from steps
   */
  private calculateOverallRisk(steps: PlanStep[]): 'low' | 'medium' | 'high' {
    const riskCounts = steps.reduce(
      (counts, step) => {
        counts[step.riskLevel]++;
        return counts;
      },
      { low: 0, medium: 0, high: 0 }
    );

    if (riskCounts.high > 0) return 'high';
    if (riskCounts.medium > 0) return 'medium';
    return 'low';
  }

  /**
   * Generate IDE integration data
   */
  generateIDEIntegration(
    citations: Citation[],
    plan: PlanPreview
  ): {
    hoverData: Record<string, string>;
    quickActions: Array<{ id: string; label: string; action: string }>;
    statusBar: string;
  } {
    const hoverData: Record<string, string> = {};
    const quickActions: Array<{ id: string; label: string; action: string }> = [];

    // Generate hover data for citations
    citations.forEach(citation => {
      hoverData[citation.id] = this.generateHoverText(citation);
    });

    // Generate quick actions
    quickActions.push(
      {
        id: 're-ground',
        label: '🔄 Re-ground Context',
        action: 'refactogent.reGround',
      },
      {
        id: 'plan-preview',
        label: '📋 Preview Plan',
        action: 'refactogent.planPreview',
      },
      {
        id: 'toggle-context',
        label: '👁️ Toggle Context',
        action: 'refactogent.toggleContext',
      }
    );

    // Generate status bar text
    const statusBar = `RefactoGent: ${citations.length} citations, ${plan.steps.length} steps, ${plan.riskLevel} risk`;

    return {
      hoverData,
      quickActions,
      statusBar,
    };
  }
}
