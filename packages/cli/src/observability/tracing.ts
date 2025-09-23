import { trace, context, SpanStatusCode, SpanKind } from '@opentelemetry/api';
import { Logger } from '../utils/logger.js';

export interface TracingContext {
  operation: string;
  repository: string;
  model?: string;
  tokens?: number;
  latency?: number;
  success?: boolean;
  error?: string;
}

export interface RetrievalMetrics {
  query: string;
  hits: number;
  misses: number;
  totalCandidates: number;
  selectedCandidates: number;
  retrievalTime: number;
  rerankTime?: number;
}

export interface LLMMetrics {
  model: string;
  version: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latency: number;
  cost: number;
  success: boolean;
  error?: string;
}

export interface RepositoryMetrics {
  repository: string;
  size: number;
  files: number;
  languages: string[];
  complexity: number;
  lastIndexed?: Date;
}

export class RefactoGentTracer {
  private logger: Logger;
  private tracer = trace.getTracer('refactogent', '1.0.0');

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Start a new trace for a refactoring operation
   */
  startRefactoringTrace(operation: string, repository: string): any {
    return this.tracer.startSpan(`refactoring.${operation}`, {
      kind: SpanKind.CLIENT,
      attributes: {
        'refactogent.operation': operation,
        'refactogent.repository': repository,
        'refactogent.timestamp': Date.now(),
      },
    });
  }

  /**
   * Start a trace for retrieval operations
   */
  startRetrievalTrace(query: string, repository: string): any {
    return this.tracer.startSpan('retrieval.search', {
      kind: SpanKind.INTERNAL,
      attributes: {
        'retrieval.query': query,
        'retrieval.repository': repository,
        'retrieval.timestamp': Date.now(),
      },
    });
  }

  /**
   * Start a trace for LLM operations
   */
  startLLMTrace(model: string, operation: string): any {
    return this.tracer.startSpan(`llm.${operation}`, {
      kind: SpanKind.CLIENT,
      attributes: {
        'llm.model': model,
        'llm.operation': operation,
        'llm.timestamp': Date.now(),
      },
    });
  }

  /**
   * Start a trace for code analysis
   */
  startAnalysisTrace(filePath: string, analysisType: string): any {
    return this.tracer.startSpan(`analysis.${analysisType}`, {
      kind: SpanKind.INTERNAL,
      attributes: {
        'analysis.file': filePath,
        'analysis.type': analysisType,
        'analysis.timestamp': Date.now(),
      },
    });
  }

  /**
   * Record retrieval metrics
   */
  recordRetrievalMetrics(span: any, metrics: RetrievalMetrics): void {
    span.setAttributes({
      'retrieval.query': metrics.query,
      'retrieval.hits': metrics.hits,
      'retrieval.misses': metrics.misses,
      'retrieval.total_candidates': metrics.totalCandidates,
      'retrieval.selected_candidates': metrics.selectedCandidates,
      'retrieval.retrieval_time_ms': metrics.retrievalTime,
      'retrieval.rerank_time_ms': metrics.rerankTime || 0,
      'retrieval.hit_rate': metrics.hits / (metrics.hits + metrics.misses),
      'retrieval.selection_rate': metrics.selectedCandidates / metrics.totalCandidates,
    });
  }

  /**
   * Record LLM metrics
   */
  recordLLMMetrics(span: any, metrics: LLMMetrics): void {
    span.setAttributes({
      'llm.model': metrics.model,
      'llm.version': metrics.version,
      'llm.input_tokens': metrics.inputTokens,
      'llm.output_tokens': metrics.outputTokens,
      'llm.total_tokens': metrics.totalTokens,
      'llm.latency_ms': metrics.latency,
      'llm.cost_usd': metrics.cost,
      'llm.success': metrics.success,
      'llm.tokens_per_second': metrics.totalTokens / (metrics.latency / 1000),
    });

    if (metrics.error) {
      span.setAttributes({
        'llm.error': metrics.error,
      });
    }
  }

  /**
   * Record repository metrics
   */
  recordRepositoryMetrics(span: any, metrics: RepositoryMetrics): void {
    span.setAttributes({
      'repository.name': metrics.repository,
      'repository.size_bytes': metrics.size,
      'repository.files': metrics.files,
      'repository.languages': metrics.languages.join(','),
      'repository.complexity': metrics.complexity,
      'repository.last_indexed': metrics.lastIndexed?.toISOString() || '',
    });
  }

  /**
   * Record success
   */
  recordSuccess(span: any, message?: string): void {
    span.setStatus({ code: SpanStatusCode.OK });
    if (message) {
      span.setAttributes({ 'operation.message': message });
    }
    span.end();
  }

  /**
   * Record error
   */
  recordError(span: any, error: Error, message?: string): void {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });
    span.setAttributes({
      'error.name': error.name,
      'error.message': error.message,
      'error.stack': error.stack || '',
    });
    if (message) {
      span.setAttributes({ 'operation.message': message });
    }
    span.end();
  }

  /**
   * Record grounding failure
   */
  recordGroundingFailure(
    span: any,
    failure: {
      type: 'missing_symbol' | 'invalid_reference' | 'broken_import' | 'type_mismatch';
      symbol?: string;
      file?: string;
      line?: number;
      message: string;
    }
  ): void {
    span.setAttributes({
      'grounding.failure_type': failure.type,
      'grounding.symbol': failure.symbol || '',
      'grounding.file': failure.file || '',
      'grounding.line': failure.line || 0,
      'grounding.message': failure.message,
    });
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: `Grounding failure: ${failure.message}`,
    });
    span.end();
  }

  /**
   * Create a child span
   */
  createChildSpan(parentSpan: any, name: string, attributes?: Record<string, any>): any {
    const childSpan = this.tracer.startSpan(
      name,
      {
        kind: SpanKind.INTERNAL,
        attributes: {
          ...attributes,
          'span.timestamp': Date.now(),
        },
      },
      trace.setSpan(context.active(), parentSpan)
    );

    return childSpan;
  }

  /**
   * Run a function with tracing
   */
  async withTracing<T>(
    operation: string,
    fn: (span: any) => Promise<T>,
    attributes?: Record<string, any>
  ): Promise<T> {
    const span = this.tracer.startSpan(operation, {
      kind: SpanKind.INTERNAL,
      attributes: {
        ...attributes,
        'operation.timestamp': Date.now(),
      },
    });

    try {
      const result = await fn(span);
      this.recordSuccess(span);
      return result;
    } catch (error) {
      this.recordError(span, error as Error);
      throw error;
    }
  }

  /**
   * Record performance metrics
   */
  recordPerformanceMetrics(
    span: any,
    metrics: {
      operation: string;
      duration: number;
      memoryUsage?: NodeJS.MemoryUsage;
      cpuUsage?: NodeJS.CpuUsage;
    }
  ): void {
    span.setAttributes({
      'performance.operation': metrics.operation,
      'performance.duration_ms': metrics.duration,
      'performance.memory_heap_used': metrics.memoryUsage?.heapUsed || 0,
      'performance.memory_heap_total': metrics.memoryUsage?.heapTotal || 0,
      'performance.memory_external': metrics.memoryUsage?.external || 0,
      'performance.cpu_user': metrics.cpuUsage?.user || 0,
      'performance.cpu_system': metrics.cpuUsage?.system || 0,
    });
  }

  /**
   * Record configuration metrics
   */
  recordConfigMetrics(
    span: any,
    config: {
      repository: string;
      features: string[];
      safetyRules: string[];
      modelConfig: string;
    }
  ): void {
    span.setAttributes({
      'config.repository': config.repository,
      'config.features': config.features.join(','),
      'config.safety_rules': config.safetyRules.join(','),
      'config.model': config.modelConfig,
    });
  }

  /**
   * Get current span
   */
  getCurrentSpan(): any {
    return trace.getActiveSpan();
  }

  /**
   * Set span attributes
   */
  setSpanAttributes(span: any, attributes: Record<string, any>): void {
    span.setAttributes(attributes);
  }

  /**
   * Add event to span
   */
  addSpanEvent(span: any, name: string, attributes?: Record<string, any>): void {
    span.addEvent(name, attributes);
  }
}
