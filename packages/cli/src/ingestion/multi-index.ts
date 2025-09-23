import { Logger } from '../utils/logger.js';
import { RefactoGentConfig } from '../config/refactogent-schema.js';
import { RefactoGentMetrics } from '../observability/metrics.js';
import { RefactoGentTracer } from '../observability/tracing.js';
import { CodeChunk, ChunkingResult } from './language-chunker.js';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface SymbolIndex {
  symbols: Map<string, SymbolEntry>;
  references: Map<string, ReferenceEntry[]>;
  definitions: Map<string, DefinitionEntry[]>;
}

export interface SymbolEntry {
  name: string;
  type: 'function' | 'class' | 'interface' | 'type' | 'variable' | 'import';
  filePath: string;
  line: number;
  column: number;
  isExported: boolean;
  isAsync: boolean;
  complexity: number;
  dependencies: string[];
  references: number;
}

export interface ReferenceEntry {
  filePath: string;
  line: number;
  column: number;
  context: string;
  chunkId: string;
}

export interface DefinitionEntry {
  filePath: string;
  line: number;
  column: number;
  content: string;
  chunkId: string;
  isExported: boolean;
}

export interface SemanticIndex {
  embeddings: Map<string, number[]>;
  chunks: Map<string, CodeChunk>;
  similarity: Map<string, string[]>; // chunkId -> similar chunkIds
}

export interface TextIndex {
  bm25: Map<string, Map<string, number>>; // term -> {chunkId -> score}
  chunks: Map<string, CodeChunk>;
  terms: Set<string>;
}

export interface MultiIndexResult {
  symbolIndex: SymbolIndex;
  semanticIndex: SemanticIndex;
  textIndex: TextIndex;
  stats: {
    totalSymbols: number;
    totalReferences: number;
    totalDefinitions: number;
    totalEmbeddings: number;
    totalTerms: number;
    processingTime: number;
  };
}

export class MultiIndexArchitecture {
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
   * Build multi-index architecture from chunking results
   */
  async buildIndexes(
    chunkingResult: ChunkingResult,
    options: {
      includeEmbeddings?: boolean;
      includeBM25?: boolean;
      maxEmbeddings?: number;
      verbose?: boolean;
    } = {}
  ): Promise<MultiIndexResult> {
    const span = this.tracer.startAnalysisTrace('.', 'multi-index-builder');

    try {
      this.logger.info('Building multi-index architecture', {
        totalChunks: chunkingResult.totalChunks,
        options,
      });

      const startTime = Date.now();

      // Build symbol index
      const symbolIndex = await this.buildSymbolIndex(chunkingResult.chunks);
      this.logger.info('Symbol index built', {
        symbols: symbolIndex.symbols.size,
        references: symbolIndex.references.size,
        definitions: symbolIndex.definitions.size,
      });

      // Build semantic index
      const semanticIndex = await this.buildSemanticIndex(chunkingResult.chunks, options);
      this.logger.info('Semantic index built', {
        embeddings: semanticIndex.embeddings.size,
        chunks: semanticIndex.chunks.size,
      });

      // Build text index
      const textIndex = await this.buildTextIndex(chunkingResult.chunks, options);
      this.logger.info('Text index built', {
        terms: textIndex.terms.size,
        chunks: textIndex.chunks.size,
      });

      const processingTime = Date.now() - startTime;

      const result: MultiIndexResult = {
        symbolIndex,
        semanticIndex,
        textIndex,
        stats: {
          totalSymbols: symbolIndex.symbols.size,
          totalReferences: Array.from(symbolIndex.references.values()).reduce(
            (sum, refs) => sum + refs.length,
            0
          ),
          totalDefinitions: Array.from(symbolIndex.definitions.values()).reduce(
            (sum, defs) => sum + defs.length,
            0
          ),
          totalEmbeddings: semanticIndex.embeddings.size,
          totalTerms: textIndex.terms.size,
          processingTime,
        },
      };

      this.logger.info('Multi-index architecture complete', {
        totalSymbols: result.stats.totalSymbols,
        totalReferences: result.stats.totalReferences,
        totalDefinitions: result.stats.totalDefinitions,
        totalEmbeddings: result.stats.totalEmbeddings,
        totalTerms: result.stats.totalTerms,
        processingTime,
      });

      this.tracer.recordSuccess(
        span,
        `Built multi-index with ${result.stats.totalSymbols} symbols, ${result.stats.totalEmbeddings} embeddings, ${result.stats.totalTerms} terms`
      );
      return result;
    } catch (error) {
      this.tracer.recordError(span, error as Error, 'Multi-index building failed');
      throw error;
    }
  }

  /**
   * Build symbol index from chunks
   */
  private async buildSymbolIndex(chunks: CodeChunk[]): Promise<SymbolIndex> {
    const symbols = new Map<string, SymbolEntry>();
    const references = new Map<string, ReferenceEntry[]>();
    const definitions = new Map<string, DefinitionEntry[]>();

    for (const chunk of chunks) {
      // Process defined symbols
      for (const symbolName of chunk.symbols.defined) {
        const symbolKey = `${chunk.filePath}:${symbolName}`;

        const symbolEntry: SymbolEntry = {
          name: symbolName,
          type: this.inferSymbolType(chunk, symbolName),
          filePath: chunk.filePath,
          line: chunk.startLine,
          column: chunk.startColumn,
          isExported: chunk.metadata.isExported,
          isAsync: chunk.metadata.isAsync,
          complexity: chunk.complexity,
          dependencies: chunk.dependencies,
          references: 0,
        };

        symbols.set(symbolKey, symbolEntry);

        // Add to definitions
        if (!definitions.has(symbolName)) {
          definitions.set(symbolName, []);
        }
        definitions.get(symbolName)!.push({
          filePath: chunk.filePath,
          line: chunk.startLine,
          column: chunk.startColumn,
          content: chunk.content,
          chunkId: chunk.id,
          isExported: chunk.metadata.isExported,
        });
      }

      // Process referenced symbols
      for (const symbolName of chunk.symbols.referenced) {
        if (!references.has(symbolName)) {
          references.set(symbolName, []);
        }

        references.get(symbolName)!.push({
          filePath: chunk.filePath,
          line: chunk.startLine,
          column: chunk.startColumn,
          context: this.extractContext(chunk.content, symbolName),
          chunkId: chunk.id,
        });

        // Update reference count
        const symbolKey = `${chunk.filePath}:${symbolName}`;
        const symbol = symbols.get(symbolKey);
        if (symbol) {
          symbol.references++;
        }
      }
    }

    return { symbols, references, definitions };
  }

  /**
   * Build semantic index with embeddings
   */
  private async buildSemanticIndex(chunks: CodeChunk[], options: any): Promise<SemanticIndex> {
    const embeddings = new Map<string, number[]>();
    const chunksMap = new Map<string, CodeChunk>();
    const similarity = new Map<string, string[]>();

    // Store chunks
    for (const chunk of chunks) {
      chunksMap.set(chunk.id, chunk);
    }

    // Generate embeddings (simplified - in production, use actual embedding model)
    const maxEmbeddings = options.maxEmbeddings || 1000;
    const chunksToEmbed = chunks.slice(0, maxEmbeddings);

    for (const chunk of chunksToEmbed) {
      const embedding = await this.generateEmbedding(chunk);
      embeddings.set(chunk.id, embedding);
    }

    // Calculate similarities (simplified)
    for (const [chunkId, embedding] of embeddings) {
      const similarities: Array<{ chunkId: string; similarity: number }> = [];

      for (const [otherChunkId, otherEmbedding] of embeddings) {
        if (chunkId !== otherChunkId) {
          const sim = this.calculateSimilarity(embedding, otherEmbedding);
          if (sim > 0.7) {
            // Threshold for similarity
            similarities.push({ chunkId: otherChunkId, similarity: sim });
          }
        }
      }

      // Sort by similarity and take top 5
      similarities.sort((a, b) => b.similarity - a.similarity);
      similarity.set(
        chunkId,
        similarities.slice(0, 5).map(s => s.chunkId)
      );
    }

    return { embeddings, chunks: chunksMap, similarity };
  }

  /**
   * Build text index with BM25
   */
  private async buildTextIndex(chunks: CodeChunk[], options: any): Promise<TextIndex> {
    const bm25 = new Map<string, Map<string, number>>();
    const chunksMap = new Map<string, CodeChunk>();
    const terms = new Set<string>();

    // Store chunks
    for (const chunk of chunks) {
      chunksMap.set(chunk.id, chunk);
    }

    // Extract terms from all chunks
    for (const chunk of chunks) {
      const chunkTerms = this.extractTerms(chunk.content);
      for (const term of chunkTerms) {
        terms.add(term);
      }
    }

    // Calculate BM25 scores
    const totalDocs = chunks.length;
    const docFreqs = new Map<string, number>();

    // Calculate document frequencies
    for (const term of terms) {
      let docFreq = 0;
      for (const chunk of chunks) {
        if (chunk.content.toLowerCase().includes(term.toLowerCase())) {
          docFreq++;
        }
      }
      docFreqs.set(term, docFreq);
    }

    // Calculate BM25 scores for each term
    for (const term of terms) {
      const termScores = new Map<string, number>();
      const docFreq = docFreqs.get(term) || 0;

      if (docFreq === 0) continue;

      const idf = Math.log(totalDocs / docFreq);

      for (const chunk of chunks) {
        const termFreq = this.countTermFrequency(chunk.content, term);
        if (termFreq > 0) {
          const docLength = chunk.content.length;
          const avgDocLength = this.calculateAverageDocLength(chunks);
          const k1 = 1.2;
          const b = 0.75;

          const score =
            (idf * (termFreq * (k1 + 1))) /
            (termFreq + k1 * (1 - b + b * (docLength / avgDocLength)));
          termScores.set(chunk.id, score);
        }
      }

      bm25.set(term, termScores);
    }

    return { bm25, chunks: chunksMap, terms };
  }

  /**
   * Infer symbol type from chunk
   */
  private inferSymbolType(chunk: CodeChunk, symbolName: string): SymbolEntry['type'] {
    if (chunk.type === 'function') return 'function';
    if (chunk.type === 'class') return 'class';
    if (chunk.type === 'interface') return 'interface';
    if (chunk.type === 'type') return 'type';
    if (chunk.type === 'import') return 'import';
    return 'variable';
  }

  /**
   * Extract context around a symbol
   */
  private extractContext(content: string, symbolName: string): string {
    const lines = content.split('\n');
    const symbolLine = lines.findIndex(line => line.includes(symbolName));

    if (symbolLine === -1) return content;

    const start = Math.max(0, symbolLine - 2);
    const end = Math.min(lines.length, symbolLine + 3);

    return lines.slice(start, end).join('\n');
  }

  /**
   * Generate embedding for chunk (simplified)
   */
  private async generateEmbedding(chunk: CodeChunk): Promise<number[]> {
    // Simplified embedding generation
    // In production, use actual embedding model like OpenAI, Cohere, or local model
    const content = chunk.content.toLowerCase();
    const embedding = new Array(384).fill(0); // Standard embedding dimension

    // Simple hash-based embedding
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      embedding[i % 384] += char / 1000;
    }

    // Normalize
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map(val => val / magnitude);
  }

  /**
   * Calculate cosine similarity between embeddings
   */
  private calculateSimilarity(embedding1: number[], embedding2: number[]): number {
    if (embedding1.length !== embedding2.length) return 0;

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  /**
   * Extract terms from content
   */
  private extractTerms(content: string): string[] {
    // Simple term extraction
    const words = content
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2)
      .filter(word => !this.isStopWord(word));

    return [...new Set(words)];
  }

  /**
   * Check if word is a stop word
   */
  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      'the',
      'a',
      'an',
      'and',
      'or',
      'but',
      'in',
      'on',
      'at',
      'to',
      'for',
      'of',
      'with',
      'by',
      'is',
      'are',
      'was',
      'were',
      'be',
      'been',
      'being',
      'have',
      'has',
      'had',
      'do',
      'does',
      'did',
      'will',
      'would',
      'could',
      'should',
      'may',
      'might',
      'must',
      'can',
      'this',
      'that',
      'these',
      'those',
    ]);

    return stopWords.has(word);
  }

  /**
   * Count term frequency in content
   */
  private countTermFrequency(content: string, term: string): number {
    const regex = new RegExp(`\\b${term}\\b`, 'gi');
    const matches = content.match(regex);
    return matches ? matches.length : 0;
  }

  /**
   * Calculate average document length
   */
  private calculateAverageDocLength(chunks: CodeChunk[]): number {
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.content.length, 0);
    return totalLength / chunks.length;
  }

  /**
   * Search symbols by name
   */
  async searchSymbols(
    symbolName: string,
    indexes: MultiIndexResult
  ): Promise<{
    definitions: DefinitionEntry[];
    references: ReferenceEntry[];
    symbol?: SymbolEntry;
  }> {
    const definitions = indexes.symbolIndex.definitions.get(symbolName) || [];
    const references = indexes.symbolIndex.references.get(symbolName) || [];

    // Find symbol entry
    let symbol: SymbolEntry | undefined;
    for (const [key, entry] of indexes.symbolIndex.symbols) {
      if (entry.name === symbolName) {
        symbol = entry;
        break;
      }
    }

    return { definitions, references, symbol };
  }

  /**
   * Search by semantic similarity
   */
  async searchSemantic(
    query: string,
    indexes: MultiIndexResult,
    topK: number = 10
  ): Promise<CodeChunk[]> {
    // Generate query embedding (simplified)
    const queryEmbedding = await this.generateEmbedding({
      id: 'query',
      filePath: '',
      startLine: 0,
      endLine: 0,
      startColumn: 0,
      endColumn: 0,
      content: query,
      type: 'function',
      language: 'typescript',
      complexity: 1,
      dependencies: [],
      symbols: { defined: [], referenced: [] },
      metadata: {
        isExported: false,
        isAsync: false,
        isTest: false,
        isConfig: false,
        isDocumentation: false,
        size: query.length,
        hash: '',
      },
    });

    // Calculate similarities
    const similarities: Array<{ chunkId: string; similarity: number }> = [];

    for (const [chunkId, embedding] of indexes.semanticIndex.embeddings) {
      const similarity = this.calculateSimilarity(queryEmbedding, embedding);
      similarities.push({ chunkId, similarity });
    }

    // Sort by similarity and return top K
    similarities.sort((a, b) => b.similarity - a.similarity);
    const topChunkIds = similarities.slice(0, topK).map(s => s.chunkId);

    return topChunkIds
      .map(id => indexes.semanticIndex.chunks.get(id))
      .filter(chunk => chunk !== undefined) as CodeChunk[];
  }

  /**
   * Search by text using BM25
   */
  async searchText(
    query: string,
    indexes: MultiIndexResult,
    topK: number = 10
  ): Promise<CodeChunk[]> {
    const queryTerms = this.extractTerms(query);
    const scores = new Map<string, number>();

    // Calculate BM25 scores for query
    for (const term of queryTerms) {
      const termScores = indexes.textIndex.bm25.get(term);
      if (termScores) {
        for (const [chunkId, score] of termScores) {
          scores.set(chunkId, (scores.get(chunkId) || 0) + score);
        }
      }
    }

    // Sort by score and return top K
    const sortedScores = Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK);

    return sortedScores
      .map(([chunkId]) => indexes.textIndex.chunks.get(chunkId))
      .filter(chunk => chunk !== undefined) as CodeChunk[];
  }
}
