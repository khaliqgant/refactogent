import { Logger } from '../utils/logger.js';
import { RefactoGentMetrics } from '../observability/metrics.js';
import { RefactoGentTracer } from '../observability/tracing.js';
import { RefactoGentConfig } from '../config/refactogent-schema.js';
import { MultiIndexArchitecture } from '../ingestion/multi-index.js';
import { CodeGraphService } from '../graph/code-graph-service.js';
import { CodeChunk } from '../ingestion/language-chunker.js';

export interface RetrievalQuery {
  intent: string;
  context: string;
  filePath?: string;
  symbolId?: string;
  maxResults?: number;
  tokenBudget?: number;
  includeTests?: boolean;
  includeConfigs?: boolean;
}

export interface RetrievalResult {
  chunks: CodeChunk[];
  citations: Citation[];
  retrievalMethod: 'semantic' | 'lexical' | 'graph' | 'hybrid';
  confidence: number;
  tokenCount: number;
  processingTime: number;
}

export interface Citation {
  filePath: string;
  lineNumber: number;
  symbolName?: string;
  context: string;
  relevanceScore: number;
}

export interface HybridRetrievalOptions {
  bm25PreFilter?: number;
  embeddingRerank?: number;
  graphExpansion?: number;
  maxTokenBudget?: number;
  includeNeighbors?: boolean;
  preferTestPairs?: boolean;
}

/**
 * Orchestrates hybrid retrieval combining semantic, lexical, and graph-based approaches
 */
export class RetrievalOrchestrator {
  private logger: Logger;
  private metrics: RefactoGentMetrics;
  private tracer: RefactoGentTracer;
  private config: RefactoGentConfig;
  private multiIndex: MultiIndexArchitecture;
  private codeGraphService: CodeGraphService;

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
    this.multiIndex = new MultiIndexArchitecture(logger, metrics, tracer, config);
    this.codeGraphService = new CodeGraphService(logger, metrics, tracer, config);
  }

  /**
   * Perform hybrid retrieval combining multiple approaches
   */
  async retrieve(
    query: RetrievalQuery,
    options: HybridRetrievalOptions = {}
  ): Promise<RetrievalResult> {
    const span = this.tracer.startAnalysisTrace('.', 'hybrid-retrieval');

    try {
      this.logger.info('Starting hybrid retrieval', {
        intent: query.intent,
        context: query.context.substring(0, 100),
        maxResults: query.maxResults,
        tokenBudget: query.tokenBudget,
      });

      const startTime = Date.now();

      // Step 1: BM25 lexical prefiltering
      const lexicalResults = await this.performLexicalRetrieval(query, options);
      this.logger.debug('Lexical retrieval completed', {
        results: lexicalResults.length,
      });

      // Step 2: Semantic embedding reranking
      const semanticResults = await this.performSemanticRerank(lexicalResults, query, options);
      this.logger.debug('Semantic reranking completed', {
        results: semanticResults.length,
      });

      // Step 3: Graph expansion for context
      const graphExpandedResults = await this.performGraphExpansion(
        semanticResults,
        query,
        options
      );
      this.logger.debug('Graph expansion completed', {
        results: graphExpandedResults.length,
      });

      // Step 4: Token budget optimization
      const optimizedResults = await this.optimizeForTokenBudget(
        graphExpandedResults,
        query.tokenBudget || 4000,
        options
      );

      // Step 5: Generate citations
      const citations = this.generateCitations(optimizedResults);

      const processingTime = Date.now() - startTime;
      const tokenCount = this.calculateTokenCount(optimizedResults);

      const result: RetrievalResult = {
        chunks: optimizedResults,
        citations,
        retrievalMethod: 'hybrid',
        confidence: this.calculateConfidence(optimizedResults),
        tokenCount,
        processingTime,
      };

      this.tracer.recordSuccess(
        span,
        `Retrieved ${optimizedResults.length} chunks in ${processingTime}ms`
      );

      this.metrics.recordRetrieval(
        optimizedResults.length,
        0, // misses
        processingTime
      );

      return result;
    } catch (error) {
      this.tracer.recordError(span, error as Error, 'Hybrid retrieval failed');
      throw error;
    }
  }

  /**
   * Perform lexical retrieval using BM25
   */
  private async performLexicalRetrieval(
    query: RetrievalQuery,
    options: HybridRetrievalOptions
  ): Promise<CodeChunk[]> {
    const span = this.tracer.startAnalysisTrace('.', 'lexical-retrieval');

    try {
      // For now, return empty array as we need to implement proper integration
      // with the MultiIndexArchitecture class
      this.tracer.recordSuccess(span, 'Lexical retrieval placeholder');
      return [];
    } catch (error) {
      this.tracer.recordError(span, error as Error, 'Lexical retrieval failed');
      throw error;
    }
  }

  /**
   * Perform semantic reranking using embeddings
   */
  private async performSemanticRerank(
    chunks: CodeChunk[],
    query: RetrievalQuery,
    options: HybridRetrievalOptions
  ): Promise<CodeChunk[]> {
    const span = this.tracer.startAnalysisTrace('.', 'semantic-rerank');

    try {
      // For now, return the chunks as-is as we need to implement proper integration
      // with the MultiIndexArchitecture class
      this.tracer.recordSuccess(span, `Reranked to ${chunks.length} results`);
      return chunks;
    } catch (error) {
      this.tracer.recordError(span, error as Error, 'Semantic reranking failed');
      throw error;
    }
  }

  /**
   * Perform graph expansion for additional context
   */
  private async performGraphExpansion(
    chunks: CodeChunk[],
    query: RetrievalQuery,
    options: HybridRetrievalOptions
  ): Promise<CodeChunk[]> {
    const span = this.tracer.startAnalysisTrace('.', 'graph-expansion');

    try {
      const expandedChunks = [...chunks];

      if (options.includeNeighbors && query.symbolId) {
        // Get neighborhood from code graph
        const neighborhood = await this.codeGraphService.queryGraph(
          'neighborhood',
          query.symbolId,
          {
            maxDepth: 2,
            includeTests: query.includeTests,
            includeConfigs: query.includeConfigs,
          }
        );

        // Add related chunks from neighborhood
        for (const node of neighborhood.directNeighbors) {
          // For now, create placeholder chunks as we need to implement proper integration
          // with the MultiIndexArchitecture class
          const placeholderChunk: CodeChunk = {
            id: `placeholder-${node.id}`,
            filePath: node.filePath,
            startLine: node.startLine || 1,
            endLine: node.endLine || 1,
            startColumn: 1,
            endColumn: 1,
            content: `// Placeholder for ${node.name}`,
            type: 'function',
            language: 'typescript',
            complexity: 1,
            dependencies: [],
            symbols: {
              defined: [node.name],
              referenced: [],
            },
            metadata: {
              isExported: node.isExported || false,
              isAsync: false,
              isTest: false,
              isConfig: false,
              isDocumentation: false,
              size: 1,
              hash: `placeholder-${node.id}`,
            },
          };
          expandedChunks.push(placeholderChunk);
        }
      }

      // Remove duplicates and limit results
      const uniqueChunks = this.deduplicateChunks(expandedChunks);
      const maxExpansion = options.graphExpansion || 30;
      const finalResults = uniqueChunks.slice(0, maxExpansion);

      this.tracer.recordSuccess(span, `Expanded to ${finalResults.length} chunks`);
      return finalResults;
    } catch (error) {
      this.tracer.recordError(span, error as Error, 'Graph expansion failed');
      throw error;
    }
  }

  /**
   * Optimize results for token budget
   */
  private async optimizeForTokenBudget(
    chunks: CodeChunk[],
    tokenBudget: number,
    options: HybridRetrievalOptions
  ): Promise<CodeChunk[]> {
    const span = this.tracer.startAnalysisTrace('.', 'token-optimization');

    try {
      // Sort by relevance score (if available) or by chunk size
      const sortedChunks = chunks.sort((a, b) => {
        const scoreA = (a as any).relevanceScore || 0;
        const scoreB = (b as any).relevanceScore || 0;
        return scoreB - scoreA;
      });

      const optimizedChunks: CodeChunk[] = [];
      let currentTokenCount = 0;

      for (const chunk of sortedChunks) {
        const chunkTokens = this.estimateTokenCount(chunk.content);

        if (currentTokenCount + chunkTokens <= tokenBudget) {
          optimizedChunks.push(chunk);
          currentTokenCount += chunkTokens;
        } else {
          // Try to fit partial chunk if it's important
          if (chunkTokens <= tokenBudget * 0.1) {
            // Small chunk, might fit
            optimizedChunks.push(chunk);
            currentTokenCount += chunkTokens;
          }
          break;
        }
      }

      this.tracer.recordSuccess(
        span,
        `Optimized to ${optimizedChunks.length} chunks (${currentTokenCount} tokens)`
      );

      return optimizedChunks;
    } catch (error) {
      this.tracer.recordError(span, error as Error, 'Token optimization failed');
      throw error;
    }
  }

  /**
   * Generate citations for retrieved chunks
   */
  private generateCitations(chunks: CodeChunk[]): Citation[] {
    return chunks.map((chunk, index) => ({
      filePath: chunk.filePath,
      lineNumber: chunk.startLine,
      symbolName: this.extractSymbolName(chunk),
      context: chunk.content.substring(0, 100) + '...',
      relevanceScore: (chunk as any).relevanceScore || 1.0 - index * 0.1,
    }));
  }

  /**
   * Calculate confidence score for retrieval results
   */
  private calculateConfidence(chunks: CodeChunk[]): number {
    if (chunks.length === 0) return 0;

    const avgRelevance =
      chunks.reduce((sum, chunk) => {
        return sum + ((chunk as any).relevanceScore || 0.5);
      }, 0) / chunks.length;

    const diversityScore = this.calculateDiversityScore(chunks);

    return (avgRelevance + diversityScore) / 2;
  }

  /**
   * Calculate diversity score based on file distribution
   */
  private calculateDiversityScore(chunks: CodeChunk[]): number {
    const filePaths = new Set(chunks.map(chunk => chunk.filePath));
    const uniqueFiles = filePaths.size;
    const totalChunks = chunks.length;

    return Math.min(uniqueFiles / totalChunks, 1.0);
  }

  /**
   * Remove duplicate chunks based on content hash
   */
  private deduplicateChunks(chunks: CodeChunk[]): CodeChunk[] {
    const seen = new Set<string>();
    return chunks.filter(chunk => {
      const hash = (chunk as any).contentHash || chunk.content;
      if (seen.has(hash)) {
        return false;
      }
      seen.add(hash);
      return true;
    });
  }

  /**
   * Extract symbol name from chunk
   */
  private extractSymbolName(chunk: CodeChunk): string | undefined {
    // Simple heuristic to extract symbol name from content
    const lines = chunk.content.split('\n');
    for (const line of lines) {
      if (
        line.includes('function ') ||
        line.includes('class ') ||
        line.includes('const ') ||
        line.includes('let ')
      ) {
        const match = line.match(/(?:function|class|const|let)\s+(\w+)/);
        if (match) {
          return match[1];
        }
      }
    }
    return undefined;
  }

  /**
   * Estimate token count for content
   */
  private estimateTokenCount(content: string): number {
    // Rough estimation: 1 token ≈ 4 characters for English code
    return Math.ceil(content.length / 4);
  }

  /**
   * Calculate total token count for all chunks
   */
  private calculateTokenCount(chunks: CodeChunk[]): number {
    return chunks.reduce((total, chunk) => {
      return total + this.estimateTokenCount(chunk.content);
    }, 0);
  }

  /**
   * Close resources
   */
  async close(): Promise<void> {
    // MultiIndexArchitecture doesn't have a close method
    await this.codeGraphService.close();
  }
}
