import { Logger } from '../utils/logger.js';
import { RefactoGentMetrics } from '../observability/metrics.js';
import { RefactoGentTracer } from '../observability/tracing.js';
import { RefactoGentConfig } from '../config/refactogent-schema.js';
import { CodeChunk } from '../ingestion/language-chunker.js';
import { Citation } from './retrieval-orchestrator.js';

export interface ContextPackingOptions {
  maxTokens?: number;
  includeStyleGuide?: boolean;
  includeAPIDocs?: boolean;
  includeTestExamples?: boolean;
  roleSegmentation?: boolean;
  citationFormat?: 'inline' | 'reference' | 'both';
}

export interface PackedContext {
  prompt: string;
  citations: Citation[];
  tokenCount: number;
  sections: ContextSection[];
  metadata: ContextMetadata;
}

export interface ContextSection {
  role: 'system' | 'user' | 'assistant' | 'constraints' | 'examples';
  content: string;
  tokenCount: number;
  citations: Citation[];
}

export interface ContextMetadata {
  totalChunks: number;
  uniqueFiles: number;
  languages: string[];
  retrievalMethods: string[];
  confidence: number;
  processingTime: number;
}

/**
 * Packs retrieved context into optimized prompts with role segmentation
 */
export class ContextPacker {
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
   * Pack retrieved chunks into optimized context
   */
  async packContext(
    chunks: CodeChunk[],
    query: string,
    intent: string,
    options: ContextPackingOptions = {}
  ): Promise<PackedContext> {
    const span = this.tracer.startAnalysisTrace('.', 'context-packing');

    try {
      const startTime = Date.now();
      const maxTokens = options.maxTokens || 4000;

      this.logger.info('Packing context', {
        chunks: chunks.length,
        maxTokens,
        intent,
      });

      // Generate citations
      const citations = this.generateCitations(chunks);

      // Create role-segmented sections
      const sections = await this.createRoleSegmentedSections(chunks, query, intent, options);

      // Optimize for token budget
      const optimizedSections = this.optimizeForTokenBudget(sections, maxTokens, options);

      // Build final prompt
      const prompt = this.buildPrompt(optimizedSections, options);

      const processingTime = Date.now() - startTime;
      const tokenCount = this.calculateTokenCount(prompt);

      const result: PackedContext = {
        prompt,
        citations,
        tokenCount,
        sections: optimizedSections,
        metadata: {
          totalChunks: chunks.length,
          uniqueFiles: new Set(chunks.map(c => c.filePath)).size,
          languages: [...new Set(chunks.map(c => c.language))],
          retrievalMethods: ['hybrid'],
          confidence: this.calculateConfidence(chunks),
          processingTime,
        },
      };

      this.tracer.recordSuccess(
        span,
        `Packed context: ${tokenCount} tokens, ${optimizedSections.length} sections`
      );

      this.metrics.recordPerformance(
        processingTime,
        0, // memory usage
        0 // cpu usage
      );

      return result;
    } catch (error) {
      this.tracer.recordError(span, error as Error, 'Context packing failed');
      throw error;
    }
  }

  /**
   * Create role-segmented context sections
   */
  private async createRoleSegmentedSections(
    chunks: CodeChunk[],
    query: string,
    intent: string,
    options: ContextPackingOptions
  ): Promise<ContextSection[]> {
    const sections: ContextSection[] = [];

    // System role: Constraints and guidelines
    if (options.roleSegmentation !== false) {
      const systemSection = this.createSystemSection(intent, options);
      sections.push(systemSection);
    }

    // User role: Query and context
    const userSection = this.createUserSection(query, chunks, options);
    sections.push(userSection);

    // Examples section: Test examples if requested
    if (options.includeTestExamples) {
      const examplesSection = this.createExamplesSection(chunks, options);
      if (examplesSection) {
        sections.push(examplesSection);
      }
    }

    // API documentation section
    if (options.includeAPIDocs) {
      const apiSection = this.createAPISection(chunks, options);
      if (apiSection) {
        sections.push(apiSection);
      }
    }

    return sections;
  }

  /**
   * Create system role section with constraints
   */
  private createSystemSection(intent: string, options: ContextPackingOptions): ContextSection {
    const constraints = this.getConstraintsForIntent(intent);
    const styleGuide = options.includeStyleGuide ? this.getStyleGuide() : '';

    const content = `You are a code refactoring assistant. ${constraints}${styleGuide}`;

    return {
      role: 'system',
      content,
      tokenCount: this.estimateTokenCount(content),
      citations: [],
    };
  }

  /**
   * Create user role section with query and context
   */
  private createUserSection(
    query: string,
    chunks: CodeChunk[],
    options: ContextPackingOptions
  ): ContextSection {
    const contextContent = this.formatChunksAsContext(chunks, options);
    const content = `Query: ${query}\n\nContext:\n${contextContent}`;

    return {
      role: 'user',
      content,
      tokenCount: this.estimateTokenCount(content),
      citations: this.generateCitations(chunks),
    };
  }

  /**
   * Create examples section from test chunks
   */
  private createExamplesSection(
    chunks: CodeChunk[],
    options: ContextPackingOptions
  ): ContextSection | null {
    const testChunks = chunks.filter(
      chunk =>
        chunk.type === 'test' ||
        chunk.filePath.includes('.test.') ||
        chunk.filePath.includes('.spec.')
    );

    if (testChunks.length === 0) return null;

    const examplesContent = testChunks
      .slice(0, 3) // Limit to 3 examples
      .map(chunk => this.formatChunkWithCitation(chunk, options))
      .join('\n\n');

    const content = `Test Examples:\n${examplesContent}`;

    return {
      role: 'examples',
      content,
      tokenCount: this.estimateTokenCount(content),
      citations: this.generateCitations(testChunks),
    };
  }

  /**
   * Create API documentation section
   */
  private createAPISection(
    chunks: CodeChunk[],
    options: ContextPackingOptions
  ): ContextSection | null {
    const apiChunks = chunks.filter(
      chunk =>
        chunk.type === 'function' &&
        (chunk.content.includes('export ') || chunk.content.includes('public '))
    );

    if (apiChunks.length === 0) return null;

    const apiContent = apiChunks
      .slice(0, 5) // Limit to 5 API examples
      .map(chunk => this.formatChunkWithCitation(chunk, options))
      .join('\n\n');

    const content = `API Documentation:\n${apiContent}`;

    return {
      role: 'constraints',
      content,
      tokenCount: this.estimateTokenCount(content),
      citations: this.generateCitations(apiChunks),
    };
  }

  /**
   * Format chunks as context with citations
   */
  private formatChunksAsContext(chunks: CodeChunk[], options: ContextPackingOptions): string {
    return chunks.map(chunk => this.formatChunkWithCitation(chunk, options)).join('\n\n');
  }

  /**
   * Format individual chunk with citation
   */
  private formatChunkWithCitation(chunk: CodeChunk, options: ContextPackingOptions): string {
    const citation = this.formatCitation(chunk, options);
    const content = chunk.content.trim();

    if (options.citationFormat === 'inline') {
      return `${citation}\n\`\`\`${chunk.language}\n${content}\n\`\`\``;
    } else if (options.citationFormat === 'reference') {
      return `\`\`\`${chunk.language}\n${content}\n\`\`\`\n${citation}`;
    } else {
      // Both inline and reference
      return `${citation}\n\`\`\`${chunk.language}\n${content}\n\`\`\`\n${citation}`;
    }
  }

  /**
   * Format citation for chunk
   */
  private formatCitation(chunk: CodeChunk, options: ContextPackingOptions): string {
    const filePath = chunk.filePath;
    const lineNumber = chunk.startLine;
    const symbolName = this.extractSymbolName(chunk);

    let citation = `[${filePath}:${lineNumber}]`;
    if (symbolName) {
      citation += ` (${symbolName})`;
    }

    return citation;
  }

  /**
   * Optimize sections for token budget
   */
  private optimizeForTokenBudget(
    sections: ContextSection[],
    maxTokens: number,
    options: ContextPackingOptions
  ): ContextSection[] {
    const optimized: ContextSection[] = [];
    let currentTokens = 0;

    // Always include system section first
    if (sections.length > 0 && sections[0].role === 'system') {
      optimized.push(sections[0]);
      currentTokens += sections[0].tokenCount;
    }

    // Add other sections in priority order
    const priorityOrder = ['user', 'examples', 'constraints'];

    for (const role of priorityOrder) {
      const section = sections.find(s => s.role === role);
      if (section && currentTokens + section.tokenCount <= maxTokens) {
        optimized.push(section);
        currentTokens += section.tokenCount;
      }
    }

    return optimized;
  }

  /**
   * Build final prompt from sections
   */
  private buildPrompt(sections: ContextSection[], options: ContextPackingOptions): string {
    const roleSegmentation = options.roleSegmentation !== false;

    if (!roleSegmentation) {
      return sections.map(s => s.content).join('\n\n');
    }

    return sections
      .map(section => {
        const roleHeader = `## ${section.role.toUpperCase()}`;
        return `${roleHeader}\n${section.content}`;
      })
      .join('\n\n');
  }

  /**
   * Get constraints for specific intent
   */
  private getConstraintsForIntent(intent: string): string {
    const constraints = {
      refactor: 'Focus on improving code structure while maintaining functionality.',
      extract: 'Extract reusable functions/classes with clear interfaces.',
      inline: 'Inline simple functions to reduce complexity.',
      rename: 'Use descriptive names that reflect purpose and usage.',
      optimize: 'Improve performance without changing behavior.',
      test: 'Generate comprehensive tests covering edge cases.',
      document: 'Add clear documentation and comments.',
    };

    return constraints[intent as keyof typeof constraints] || 'Provide helpful code improvements.';
  }

  /**
   * Get style guide from config
   */
  private getStyleGuide(): string {
    const styleGuide = (this.config.repository as any)?.style || {};

    let guide = '\n\nStyle Guidelines:\n';
    if (styleGuide.naming) {
      guide += `- Naming: ${styleGuide.naming}\n`;
    }
    if (styleGuide.formatting) {
      guide += `- Formatting: ${styleGuide.formatting}\n`;
    }
    if (styleGuide.comments) {
      guide += `- Comments: ${styleGuide.comments}\n`;
    }

    return guide;
  }

  /**
   * Generate citations for chunks
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
   * Extract symbol name from chunk
   */
  private extractSymbolName(chunk: CodeChunk): string | undefined {
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
   * Calculate confidence score
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
   * Calculate diversity score
   */
  private calculateDiversityScore(chunks: CodeChunk[]): number {
    const filePaths = new Set(chunks.map(chunk => chunk.filePath));
    const uniqueFiles = filePaths.size;
    const totalChunks = chunks.length;

    return Math.min(uniqueFiles / totalChunks, 1.0);
  }

  /**
   * Estimate token count
   */
  private estimateTokenCount(content: string): number {
    return Math.ceil(content.length / 4);
  }

  /**
   * Calculate total token count
   */
  private calculateTokenCount(content: string): number {
    return this.estimateTokenCount(content);
  }
}
