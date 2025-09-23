import { Logger } from '../utils/logger.js';
import { RefactoGentMetrics } from '../observability/metrics.js';
import { RefactoGentTracer } from '../observability/tracing.js';
import { RefactoGentConfig } from '../config/refactogent-schema.js';
import { LLMProviderManager, LLMRequest, LLMResponse } from './llm-provider-manager.js';

export interface ContextAwareLLMRequest {
  prompt: string;
  context?: any;
  options?: {
    includeTests?: boolean;
    maxContextTokens?: number;
    temperature?: number;
    maxTokens?: number;
  };
}

export interface LLMRefactoringRequest {
  codeBlock: string;
  filePath: string;
  projectContext?: string;
  operation: 'extract' | 'inline' | 'rename' | 'move';
  options: {
    suggestedName?: string;
    preserveBehavior?: boolean;
    [key: string]: any;
  };
}

export interface LLMRefactoringResponse {
  functionName: string;
  refactoredCode: string;
  explanation: string;
  confidence: number;
  extractedFunction?: string;
  functionCall?: string;
}

export interface ContextAwareLLMResponse {
  content: string;
  context: {
    usedContext: string[];
    contextTokens: number;
    totalTokens: number;
    provider: string;
    model: string;
  };
  metadata: {
    latency: number;
    cost: number;
    confidence: number;
    reasoning: string;
  };
}

export class ContextAwareLLMService {
  private logger: Logger;
  private metrics: RefactoGentMetrics;
  private tracer: RefactoGentTracer;
  private config: RefactoGentConfig;
  private providerManager: LLMProviderManager;

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
    this.providerManager = new LLMProviderManager(logger, metrics, tracer, config);
  }

  async initialize(): Promise<void> {
    this.logger.info('Initializing context-aware LLM service');
    await this.providerManager.registerProviderConfig('openai', {
      apiKey: process.env.OPENAI_API_KEY || '',
      model: 'gpt-4'
    });
  }

  async generateWithContext(
    request: ContextAwareLLMRequest,
    preferredProvider?: string
  ): Promise<ContextAwareLLMResponse> {
    const span = this.tracer.startAnalysisTrace('.', 'context-aware-generation');

    try {
      const llmRequest: LLMRequest = {
        prompt: request.prompt,
        maxTokens: request.options?.maxTokens || 2000,
        temperature: request.options?.temperature || 0.7
      };

      const response = await this.providerManager.generateText(llmRequest, preferredProvider);

      return {
        content: response.content,
        context: {
          usedContext: [],
          contextTokens: 0,
          totalTokens: response.usage.totalTokens,
          provider: response.metadata.provider,
          model: response.metadata.model
        },
        metadata: {
          latency: response.metadata.latency,
          cost: response.metadata.cost,
          confidence: 0.8,
          reasoning: 'Generated with context'
        }
      };
    } catch (error) {
      this.tracer.recordError(span, error as Error, 'Context-aware generation failed');
      throw error;
    }
  }

  /**
   * Perform refactoring with LLM
   */
  async performRefactoring(request: LLMRefactoringRequest): Promise<LLMRefactoringResponse> {
    const span = this.tracer.startAnalysisTrace('.', 'llm-refactoring');

    try {
      const prompt = this.buildRefactoringPrompt(request);
      const response = await this.generateWithContext({
        prompt,
        context: request.projectContext,
        options: {
          maxTokens: 2000,
          temperature: 0.3
        }
      });

      return {
        functionName: this.extractFunctionName(response.content),
        refactoredCode: this.extractRefactoredCode(response.content),
        explanation: this.extractExplanation(response.content),
        confidence: 0.8,
        extractedFunction: this.extractRefactoredCode(response.content),
        functionCall: this.extractFunctionCall(response.content)
      };
    } catch (error) {
      this.tracer.recordError(span, error as Error, 'LLM refactoring failed');
      throw error;
    }
  }

  /**
   * Get usage statistics
   */
  getUsage(): any {
    return this.providerManager.getUsage();
  }

  /**
   * Reset usage statistics
   */
  resetUsage(): void {
    this.providerManager.resetUsage();
  }

  private buildRefactoringPrompt(request: LLMRefactoringRequest): string {
    return `Refactor the following code using ${request.operation} operation:
    
Code:
${request.codeBlock}

File: ${request.filePath}
${request.projectContext ? `\nProject Context:\n${request.projectContext}` : ''}

Options: ${JSON.stringify(request.options)}`;
  }

  private extractFunctionName(content: string): string {
    // Simple extraction - in real implementation would be more sophisticated
    const match = content.match(/function\s+(\w+)/);
    return match ? match[1] : 'extractedFunction';
  }

  private extractRefactoredCode(content: string): string {
    // Simple extraction - in real implementation would be more sophisticated
    const codeMatch = content.match(/```[\s\S]*?```/);
    return codeMatch ? codeMatch[0] : content;
  }

  private extractExplanation(content: string): string {
    // Simple extraction - in real implementation would be more sophisticated
    return content.split('\n').slice(0, 3).join('\n');
  }

  private extractFunctionCall(content: string): string {
    // Simple extraction - in real implementation would be more sophisticated
    const callMatch = content.match(/function\s+\w+\s*\([^)]*\)\s*{/);
    return callMatch ? callMatch[0] : 'functionCall()';
  }

  async close(): Promise<void> {
    await this.providerManager.close();
  }
}