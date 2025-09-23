import { Logger } from '../utils/logger.js';
import { RefactoGentMetrics } from '../observability/metrics.js';
import { RefactoGentTracer } from '../observability/tracing.js';
import { RefactoGentConfig } from '../config/refactogent-schema.js';
import {
  RetrievalOrchestrator,
  RetrievalQuery,
  RetrievalResult,
} from './retrieval-orchestrator.js';
import { ContextPacker, PackedContext, ContextPackingOptions } from './context-packer.js';
import {
  GroundingChecker,
  GroundingCheckResult,
  GroundingCheckOptions,
} from './grounding-checker.js';

export interface RetrievalServiceOptions {
  maxTokens?: number;
  includeGroundingChecks?: boolean;
  includeContextPacking?: boolean;
  hybridRetrieval?: boolean;
  roleSegmentation?: boolean;
  citationFormat?: 'inline' | 'reference' | 'both';
}

export interface RetrievalServiceResult {
  query: RetrievalQuery;
  retrievalResult: RetrievalResult;
  groundingResult?: GroundingCheckResult;
  packedContext?: PackedContext;
  finalPrompt: string;
  metadata: RetrievalMetadata;
}

export interface RetrievalMetadata {
  totalProcessingTime: number;
  retrievalTime: number;
  groundingTime?: number;
  packingTime?: number;
  totalTokens: number;
  confidence: number;
  methods: string[];
  citations: number;
}

/**
 * Main retrieval service that orchestrates hybrid retrieval, grounding checks, and context packing
 */
export class RetrievalService {
  private logger: Logger;
  private metrics: RefactoGentMetrics;
  private tracer: RefactoGentTracer;
  private config: RefactoGentConfig;
  private orchestrator: RetrievalOrchestrator;
  private contextPacker: ContextPacker;
  private groundingChecker: GroundingChecker;

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
    this.orchestrator = new RetrievalOrchestrator(logger, metrics, tracer, config);
    this.contextPacker = new ContextPacker(logger, metrics, tracer, config);
    this.groundingChecker = new GroundingChecker(logger, metrics, tracer, config);
  }

  /**
   * Perform comprehensive retrieval with grounding and context packing
   */
  async retrieve(
    query: RetrievalQuery,
    options: RetrievalServiceOptions = {}
  ): Promise<RetrievalServiceResult> {
    const span = this.tracer.startAnalysisTrace('.', 'retrieval-service');

    try {
      const startTime = Date.now();
      this.logger.info('Starting retrieval service', {
        intent: query.intent,
        context: query.context.substring(0, 100),
        options,
      });

      // Step 1: Hybrid retrieval
      const retrievalStartTime = Date.now();
      const retrievalResult = await this.orchestrator.retrieve(query, {
        bm25PreFilter: 50,
        embeddingRerank: 20,
        graphExpansion: 30,
        maxTokenBudget: options.maxTokens || 4000,
        includeNeighbors: true,
        preferTestPairs: true,
      });
      const retrievalTime = Date.now() - retrievalStartTime;

      let groundingResult: GroundingCheckResult | undefined;
      let groundingTime: number | undefined;

      // Step 2: Grounding checks (if enabled)
      if (options.includeGroundingChecks !== false) {
        const groundingStartTime = Date.now();
        groundingResult = await this.groundingChecker.checkGrounding(
          retrievalResult.chunks,
          query.context,
          {
            strictMode: true,
            includeTests: query.includeTests,
            maxDepth: 3,
            allowCircularDeps: false,
            verifyExports: true,
          }
        );
        groundingTime = Date.now() - groundingStartTime;

        this.logger.debug('Grounding checks completed', {
          isValid: groundingResult.isValid,
          confidence: groundingResult.confidence,
          issues: groundingResult.issues.length,
        });
      }

      let packedContext: PackedContext | undefined;
      let packingTime: number | undefined;

      // Step 3: Context packing (if enabled)
      if (options.includeContextPacking !== false) {
        const packingStartTime = Date.now();
        packedContext = await this.contextPacker.packContext(
          retrievalResult.chunks,
          query.context,
          query.intent,
          {
            maxTokens: options.maxTokens || 4000,
            includeStyleGuide: true,
            includeAPIDocs: true,
            includeTestExamples: true,
            roleSegmentation: options.roleSegmentation !== false,
            citationFormat: options.citationFormat || 'both',
          }
        );
        packingTime = Date.now() - packingStartTime;

        this.logger.debug('Context packing completed', {
          tokenCount: packedContext.tokenCount,
          sections: packedContext.sections.length,
          citations: packedContext.citations.length,
        });
      }

      // Step 4: Build final prompt
      const finalPrompt = this.buildFinalPrompt(
        query,
        retrievalResult,
        groundingResult,
        packedContext,
        options
      );

      const totalProcessingTime = Date.now() - startTime;

      const result: RetrievalServiceResult = {
        query,
        retrievalResult,
        groundingResult,
        packedContext,
        finalPrompt,
        metadata: {
          totalProcessingTime,
          retrievalTime,
          groundingTime,
          packingTime,
          totalTokens: packedContext?.tokenCount || retrievalResult.tokenCount,
          confidence: this.calculateOverallConfidence(
            retrievalResult,
            groundingResult,
            packedContext
          ),
          methods: ['hybrid', 'grounding', 'packing'],
          citations: packedContext?.citations.length || retrievalResult.citations.length,
        },
      };

      this.tracer.recordSuccess(
        span,
        `Retrieval service completed: ${result.metadata.totalTokens} tokens, ${result.metadata.confidence.toFixed(2)} confidence`
      );

      this.metrics.recordRetrieval(
        result.retrievalResult.chunks.length,
        0, // misses
        totalProcessingTime
      );

      return result;
    } catch (error) {
      this.tracer.recordError(span, error as Error, 'Retrieval service failed');
      throw error;
    }
  }

  /**
   * Build final prompt from all components
   */
  private buildFinalPrompt(
    query: RetrievalQuery,
    retrievalResult: RetrievalResult,
    groundingResult: GroundingCheckResult | undefined,
    packedContext: PackedContext | undefined,
    options: RetrievalServiceOptions
  ): string {
    let prompt = '';

    // Add system context if available
    if (packedContext) {
      prompt += packedContext.prompt;
    } else {
      // Fallback to basic context
      prompt += this.buildBasicPrompt(query, retrievalResult);
    }

    // Add grounding information if available
    if (groundingResult && groundingResult.issues.length > 0) {
      prompt += '\n\n## GROUNDING ISSUES\n';
      prompt += 'The following issues were detected in the retrieved context:\n';
      for (const issue of groundingResult.issues) {
        prompt += `- ${issue.severity.toUpperCase()}: ${issue.message}\n`;
      }
    }

    // Add suggestions if available
    if (groundingResult && groundingResult.suggestions.length > 0) {
      prompt += '\n\n## SUGGESTIONS\n';
      for (const suggestion of groundingResult.suggestions) {
        prompt += `- ${suggestion}\n`;
      }
    }

    return prompt;
  }

  /**
   * Build basic prompt when context packing is not available
   */
  private buildBasicPrompt(query: RetrievalQuery, retrievalResult: RetrievalResult): string {
    let prompt = `Query: ${query.context}\n\n`;
    prompt += `Intent: ${query.intent}\n\n`;
    prompt += 'Context:\n';

    for (const chunk of retrievalResult.chunks) {
      prompt += `\n--- ${chunk.filePath}:${chunk.startLine} ---\n`;
      prompt += `\`\`\`${chunk.language}\n${chunk.content}\n\`\`\`\n`;
    }

    return prompt;
  }

  /**
   * Calculate overall confidence score
   */
  private calculateOverallConfidence(
    retrievalResult: RetrievalResult,
    groundingResult: GroundingCheckResult | undefined,
    packedContext: PackedContext | undefined
  ): number {
    let confidence = retrievalResult.confidence;

    // Adjust based on grounding results
    if (groundingResult) {
      if (!groundingResult.isValid) {
        confidence *= 0.7; // Reduce confidence if grounding issues
      } else {
        confidence *= (1 + groundingResult.confidence) / 2; // Boost if good grounding
      }
    }

    // Adjust based on context packing quality
    if (packedContext) {
      const packingQuality = Math.min(packedContext.metadata.confidence, 1.0);
      confidence = (confidence + packingQuality) / 2;
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Get retrieval statistics
   */
  async getRetrievalStats(): Promise<{
    totalQueries: number;
    averageConfidence: number;
    averageTokens: number;
    averageProcessingTime: number;
    methodDistribution: Record<string, number>;
  }> {
    // This would typically query metrics storage
    return {
      totalQueries: 0,
      averageConfidence: 0,
      averageTokens: 0,
      averageProcessingTime: 0,
      methodDistribution: {},
    };
  }

  /**
   * Close all resources
   */
  async close(): Promise<void> {
    await Promise.all([this.orchestrator.close(), this.groundingChecker.close()]);
  }
}
