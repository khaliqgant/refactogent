import { metrics, Meter } from '@opentelemetry/api';
import { Logger } from '../utils/logger.js';

export interface MetricsData {
  // Retrieval metrics
  retrievalHits: number;
  retrievalMisses: number;
  retrievalLatency: number;
  retrievalAccuracy: number;

  // LLM metrics
  llmCalls: number;
  llmTokens: number;
  llmCost: number;
  llmLatency: number;
  llmSuccessRate: number;

  // Repository metrics
  repositorySize: number;
  filesProcessed: number;
  languagesDetected: number;
  complexityScore: number;

  // Safety metrics
  safetyViolations: number;
  testFailures: number;
  typeErrors: number;
  lintErrors: number;

  // Performance metrics
  operationLatency: number;
  memoryUsage: number;
  cpuUsage: number;
}

export class RefactoGentMetrics {
  private logger: Logger;
  private meter: Meter;
  private metricsData: MetricsData;

  // Counters
  private retrievalHitsCounter: any;
  private retrievalMissesCounter: any;
  private llmCallsCounter: any;
  private safetyViolationsCounter: any;
  private testFailuresCounter: any;
  private typeErrorsCounter: any;
  private lintErrorsCounter: any;

  // Histograms
  private retrievalLatencyHistogram: any;
  private llmLatencyHistogram: any;
  private operationLatencyHistogram: any;
  private memoryUsageHistogram: any;
  private cpuUsageHistogram: any;

  // Gauges
  private repositorySizeGauge: any;
  private filesProcessedGauge: any;
  private languagesDetectedGauge: any;
  private complexityScoreGauge: any;
  private llmTokensGauge: any;
  private llmCostGauge: any;

  constructor(logger: Logger) {
    this.logger = logger;
    this.meter = metrics.getMeter('refactogent', '1.0.0');
    this.metricsData = this.initializeMetricsData();
    this.initializeCounters();
    this.initializeHistograms();
    this.initializeGauges();
  }

  private initializeMetricsData(): MetricsData {
    return {
      retrievalHits: 0,
      retrievalMisses: 0,
      retrievalLatency: 0,
      retrievalAccuracy: 0,
      llmCalls: 0,
      llmTokens: 0,
      llmCost: 0,
      llmLatency: 0,
      llmSuccessRate: 0,
      repositorySize: 0,
      filesProcessed: 0,
      languagesDetected: 0,
      complexityScore: 0,
      safetyViolations: 0,
      testFailures: 0,
      typeErrors: 0,
      lintErrors: 0,
      operationLatency: 0,
      memoryUsage: 0,
      cpuUsage: 0,
    };
  }

  private initializeCounters(): void {
    this.retrievalHitsCounter = this.meter.createCounter('refactogent_retrieval_hits_total', {
      description: 'Total number of successful retrieval hits',
    });

    this.retrievalMissesCounter = this.meter.createCounter('refactogent_retrieval_misses_total', {
      description: 'Total number of retrieval misses',
    });

    this.llmCallsCounter = this.meter.createCounter('refactogent_llm_calls_total', {
      description: 'Total number of LLM API calls',
    });

    this.safetyViolationsCounter = this.meter.createCounter('refactogent_safety_violations_total', {
      description: 'Total number of safety violations detected',
    });

    this.testFailuresCounter = this.meter.createCounter('refactogent_test_failures_total', {
      description: 'Total number of test failures',
    });

    this.typeErrorsCounter = this.meter.createCounter('refactogent_type_errors_total', {
      description: 'Total number of TypeScript errors',
    });

    this.lintErrorsCounter = this.meter.createCounter('refactogent_lint_errors_total', {
      description: 'Total number of linting errors',
    });
  }

  private initializeHistograms(): void {
    this.retrievalLatencyHistogram = this.meter.createHistogram(
      'refactogent_retrieval_latency_ms',
      {
        description: 'Retrieval operation latency in milliseconds',
        unit: 'ms',
      }
    );

    this.llmLatencyHistogram = this.meter.createHistogram('refactogent_llm_latency_ms', {
      description: 'LLM operation latency in milliseconds',
      unit: 'ms',
    });

    this.operationLatencyHistogram = this.meter.createHistogram(
      'refactogent_operation_latency_ms',
      {
        description: 'Overall operation latency in milliseconds',
        unit: 'ms',
      }
    );

    this.memoryUsageHistogram = this.meter.createHistogram('refactogent_memory_usage_bytes', {
      description: 'Memory usage in bytes',
      unit: 'bytes',
    });

    this.cpuUsageHistogram = this.meter.createHistogram('refactogent_cpu_usage_percent', {
      description: 'CPU usage percentage',
      unit: 'percent',
    });
  }

  private initializeGauges(): void {
    this.repositorySizeGauge = this.meter.createUpDownCounter('refactogent_repository_size_bytes', {
      description: 'Repository size in bytes',
      unit: 'bytes',
    });

    this.filesProcessedGauge = this.meter.createUpDownCounter('refactogent_files_processed_total', {
      description: 'Total number of files processed',
    });

    this.languagesDetectedGauge = this.meter.createUpDownCounter(
      'refactogent_languages_detected_total',
      {
        description: 'Total number of languages detected',
      }
    );

    this.complexityScoreGauge = this.meter.createUpDownCounter('refactogent_complexity_score', {
      description: 'Repository complexity score',
    });

    this.llmTokensGauge = this.meter.createUpDownCounter('refactogent_llm_tokens_total', {
      description: 'Total LLM tokens used',
    });

    this.llmCostGauge = this.meter.createUpDownCounter('refactogent_llm_cost_usd', {
      description: 'Total LLM cost in USD',
      unit: 'USD',
    });
  }

  /**
   * Record retrieval metrics
   */
  recordRetrieval(hits: number, misses: number, latency: number): void {
    this.retrievalHitsCounter.add(hits);
    this.retrievalMissesCounter.add(misses);
    this.retrievalLatencyHistogram.record(latency);

    this.metricsData.retrievalHits += hits;
    this.metricsData.retrievalMisses += misses;
    this.metricsData.retrievalLatency = latency;
    this.metricsData.retrievalAccuracy = hits / (hits + misses);

    this.logger.debug('Recorded retrieval metrics', {
      hits,
      misses,
      latency,
      accuracy: this.metricsData.retrievalAccuracy,
    });
  }

  /**
   * Record LLM metrics
   */
  recordLLM(calls: number, tokens: number, cost: number, latency: number, success: boolean): void {
    this.llmCallsCounter.add(calls);
    this.llmLatencyHistogram.record(latency);
    this.llmTokensGauge.add(tokens);
    this.llmCostGauge.add(cost);

    this.metricsData.llmCalls += calls;
    this.metricsData.llmTokens += tokens;
    this.metricsData.llmCost += cost;
    this.metricsData.llmLatency = latency;

    if (success) {
      this.metricsData.llmSuccessRate = (this.metricsData.llmSuccessRate + 1) / 2;
    }

    this.logger.debug('Recorded LLM metrics', {
      calls,
      tokens,
      cost,
      latency,
      success,
    });
  }

  /**
   * Record repository metrics
   */
  recordRepository(size: number, files: number, languages: number, complexity: number): void {
    this.repositorySizeGauge.add(size);
    this.filesProcessedGauge.add(files);
    this.languagesDetectedGauge.add(languages);
    this.complexityScoreGauge.add(complexity);

    this.metricsData.repositorySize = size;
    this.metricsData.filesProcessed = files;
    this.metricsData.languagesDetected = languages;
    this.metricsData.complexityScore = complexity;

    this.logger.debug('Recorded repository metrics', {
      size,
      files,
      languages,
      complexity,
    });
  }

  /**
   * Record safety metrics
   */
  recordSafetyViolation(type: 'safety' | 'test' | 'type' | 'lint'): void {
    switch (type) {
      case 'safety':
        this.safetyViolationsCounter.add(1);
        this.metricsData.safetyViolations++;
        break;
      case 'test':
        this.testFailuresCounter.add(1);
        this.metricsData.testFailures++;
        break;
      case 'type':
        this.typeErrorsCounter.add(1);
        this.metricsData.typeErrors++;
        break;
      case 'lint':
        this.lintErrorsCounter.add(1);
        this.metricsData.lintErrors++;
        break;
    }

    this.logger.debug('Recorded safety violation', { type });
  }

  /**
   * Record performance metrics
   */
  recordPerformance(latency: number, memoryUsage: number, cpuUsage: number): void {
    this.operationLatencyHistogram.record(latency);
    this.memoryUsageHistogram.record(memoryUsage);
    this.cpuUsageHistogram.record(cpuUsage);

    this.metricsData.operationLatency = latency;
    this.metricsData.memoryUsage = memoryUsage;
    this.metricsData.cpuUsage = cpuUsage;

    this.logger.debug('Recorded performance metrics', {
      latency,
      memoryUsage,
      cpuUsage,
    });
  }

  /**
   * Get current metrics data
   */
  getMetrics(): MetricsData {
    return { ...this.metricsData };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metricsData = this.initializeMetricsData();
    this.logger.info('Reset all metrics');
  }

  /**
   * Export metrics for external systems
   */
  exportMetrics(): {
    retrieval: {
      hits: number;
      misses: number;
      accuracy: number;
      latency: number;
    };
    llm: {
      calls: number;
      tokens: number;
      cost: number;
      latency: number;
      successRate: number;
    };
    repository: {
      size: number;
      files: number;
      languages: number;
      complexity: number;
    };
    safety: {
      violations: number;
      testFailures: number;
      typeErrors: number;
      lintErrors: number;
    };
    performance: {
      latency: number;
      memoryUsage: number;
      cpuUsage: number;
    };
  } {
    return {
      retrieval: {
        hits: this.metricsData.retrievalHits,
        misses: this.metricsData.retrievalMisses,
        accuracy: this.metricsData.retrievalAccuracy,
        latency: this.metricsData.retrievalLatency,
      },
      llm: {
        calls: this.metricsData.llmCalls,
        tokens: this.metricsData.llmTokens,
        cost: this.metricsData.llmCost,
        latency: this.metricsData.llmLatency,
        successRate: this.metricsData.llmSuccessRate,
      },
      repository: {
        size: this.metricsData.repositorySize,
        files: this.metricsData.filesProcessed,
        languages: this.metricsData.languagesDetected,
        complexity: this.metricsData.complexityScore,
      },
      safety: {
        violations: this.metricsData.safetyViolations,
        testFailures: this.metricsData.testFailures,
        typeErrors: this.metricsData.typeErrors,
        lintErrors: this.metricsData.lintErrors,
      },
      performance: {
        latency: this.metricsData.operationLatency,
        memoryUsage: this.metricsData.memoryUsage,
        cpuUsage: this.metricsData.cpuUsage,
      },
    };
  }

  /**
   * Get metrics summary for CLI output
   */
  getSummary(): string {
    const metrics = this.exportMetrics();
    return `
📊 RefactoGent Metrics Summary:
════════════════════════════════════════════════════════════
🔍 Retrieval: ${metrics.retrieval.hits} hits, ${metrics.retrieval.misses} misses (${(metrics.retrieval.accuracy * 100).toFixed(1)}% accuracy)
🤖 LLM: ${metrics.llm.calls} calls, ${metrics.llm.tokens.toLocaleString()} tokens, $${metrics.llm.cost.toFixed(4)} cost
📁 Repository: ${metrics.repository.files} files, ${metrics.repository.languages} languages, complexity ${metrics.repository.complexity}
🛡️ Safety: ${metrics.safety.violations} violations, ${metrics.safety.testFailures} test failures, ${metrics.safety.typeErrors} type errors
⚡ Performance: ${metrics.performance.latency}ms latency, ${(metrics.performance.memoryUsage / 1024 / 1024).toFixed(1)}MB memory
`;
  }
}
