import { Logger } from '../utils/logger.js';
import { RefactoGentMetrics } from '../observability/metrics.js';
import { RefactoGentTracer } from '../observability/tracing.js';
import { RefactoGentConfig } from '../config/refactogent-schema.js';

export type IntentType =
  | 'refactor'
  | 'edit'
  | 'explain'
  | 'test-gen'
  | 'doc-gen'
  | 'migration'
  | 'optimize'
  | 'debug'
  | 'analyze'
  | 'unknown';

export interface IntentClassification {
  intent: IntentType;
  confidence: number;
  reasoning: string;
  subIntents?: string[];
  complexity: 'low' | 'medium' | 'high';
  estimatedTime: number; // in minutes
  requiredTools: string[];
  riskLevel: 'low' | 'medium' | 'high';
}

export interface IntentClassifierOptions {
  includeSubIntents?: boolean;
  estimateComplexity?: boolean;
  estimateTime?: boolean;
  assessRisk?: boolean;
  suggestTools?: boolean;
}

/**
 * Classifies user intents and provides detailed analysis for planning
 */
export class IntentClassifier {
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
   * Classify user intent from natural language input
   */
  async classifyIntent(
    input: string,
    context?: string,
    options: IntentClassifierOptions = {}
  ): Promise<IntentClassification> {
    const span = this.tracer.startAnalysisTrace('.', 'intent-classification');

    try {
      this.logger.info('Classifying intent', {
        input: input.substring(0, 100),
        context: context?.substring(0, 50),
        options,
      });

      const classification = await this.performClassification(input, context, options);

      this.tracer.recordSuccess(
        span,
        `Intent classified as ${classification.intent} with ${classification.confidence.toFixed(2)} confidence`
      );

      this.metrics.recordPerformance(
        Date.now() - span.startTime,
        0, // memory usage
        0 // cpu usage
      );

      return classification;
    } catch (error) {
      this.tracer.recordError(span, error as Error, 'Intent classification failed');
      throw error;
    }
  }

  /**
   * Perform the actual classification logic
   */
  private async performClassification(
    input: string,
    context?: string,
    options: IntentClassifierOptions = {}
  ): Promise<IntentClassification> {
    const normalizedInput = input.toLowerCase().trim();

    // Use specific keyword matching instead of generic patterns
    const keywordMap: Record<string, IntentType> = {
      refactor: 'refactor',
      restructure: 'refactor',
      improve: 'refactor',
      'clean up': 'refactor',
      simplify: 'refactor',
      'extract function': 'refactor',
      'inline function': 'refactor',
      rename: 'refactor',
      move: 'refactor',
      split: 'refactor',
      merge: 'refactor',
      edit: 'edit',
      modify: 'edit',
      change: 'edit',
      update: 'edit',
      fix: 'edit',
      'add code': 'edit',
      'remove code': 'edit',
      'delete code': 'edit',
      'insert code': 'edit',
      'replace code': 'edit',
      explain: 'explain',
      describe: 'explain',
      'what does': 'explain',
      'how does': 'explain',
      why: 'explain',
      clarify: 'explain',
      understand: 'explain',
      'break down': 'explain',
      'generate tests': 'test-gen',
      'create unit tests': 'test-gen',
      'write test cases': 'test-gen',
      'add test coverage': 'test-gen',
      'test this function': 'test-gen',
      'write test': 'test-gen',
      'create test': 'test-gen',
      'add test': 'test-gen',
      'unit test for': 'test-gen',
      'integration test': 'test-gen',
      'test case for': 'test-gen',
      'testing this': 'test-gen',
      'test coverage': 'test-gen',
      'test suite': 'test-gen',
      'document this code': 'doc-gen',
      'add documentation': 'doc-gen',
      'write comments': 'doc-gen',
      'create API docs': 'doc-gen',
      'generate README': 'doc-gen',
      'document this': 'doc-gen',
      'write docs': 'doc-gen',
      'comment this': 'doc-gen',
      'api documentation': 'doc-gen',
      'readme for': 'doc-gen',
      'manual for': 'doc-gen',
      'guide for': 'doc-gen',
      document: 'doc-gen',
      migrate: 'migration',
      upgrade: 'migration',
      convert: 'migration',
      port: 'migration',
      transform: 'migration',
      translate: 'migration',
      legacy: 'migration',
      deprecated: 'migration',
      version: 'migration',
      'breaking change': 'migration',
      'optimize performance': 'optimize',
      'improve speed': 'optimize',
      'reduce memory usage': 'optimize',
      'fix bottleneck': 'optimize',
      'make it faster': 'optimize',
      'make faster': 'optimize',
      'speed up': 'optimize',
      'improve performance': 'optimize',
      'memory optimization': 'optimize',
      'cpu optimization': 'optimize',
      bottleneck: 'optimize',
      profiling: 'optimize',
      debug: 'debug',
      bug: 'debug',
      error: 'debug',
      issue: 'debug',
      problem: 'debug',
      troubleshoot: 'debug',
      investigate: 'debug',
      trace: 'debug',
      log: 'debug',
      exception: 'debug',
      crash: 'debug',
      'analyze the code': 'analyze',
      'get metrics': 'analyze',
      'generate report': 'analyze',
      'check complexity': 'analyze',
      'review architecture': 'analyze',
      'analyze code': 'analyze',
      'code analysis': 'analyze',
      'review code': 'analyze',
      'audit code': 'analyze',
      'inspect code': 'analyze',
      'examine code': 'analyze',
      'metrics for': 'analyze',
      'statistics for': 'analyze',
    };

    let bestMatch: { intent: IntentType; confidence: number; reasoning: string } = {
      intent: 'unknown',
      confidence: 0,
      reasoning: 'No clear intent pattern matched',
    };

    // Check for exact phrase matches first
    for (const [phrase, intent] of Object.entries(keywordMap)) {
      if (normalizedInput.includes(phrase)) {
        bestMatch = {
          intent,
          confidence: 1.0,
          reasoning: `Matched exact phrase: ${phrase}`,
        };
        break;
      }
    }

    // If no exact match, check for word matches
    if (bestMatch.confidence === 0) {
      const words = normalizedInput.split(/\s+/);
      for (const word of words) {
        for (const [phrase, intent] of Object.entries(keywordMap)) {
          if (phrase.includes(word) && word.length > 2) {
            bestMatch = {
              intent,
              confidence: 0.8,
              reasoning: `Matched word: ${word} in phrase: ${phrase}`,
            };
            break;
          }
        }
        if (bestMatch.confidence > 0) break;
      }
    }

    // Build classification result
    const classification: IntentClassification = {
      intent: bestMatch.intent,
      confidence: bestMatch.confidence,
      reasoning: bestMatch.reasoning,
      complexity: 'medium',
      estimatedTime: 10,
      requiredTools: [],
      riskLevel: 'medium',
    };

    // Add optional analysis
    if (options.includeSubIntents) {
      classification.subIntents = this.extractSubIntents(normalizedInput, bestMatch.intent);
    }

    if (options.estimateComplexity) {
      classification.complexity = this.estimateComplexity(normalizedInput, bestMatch.intent);
    }

    if (options.estimateTime) {
      classification.estimatedTime = this.estimateTime(classification.complexity, bestMatch.intent);
    }

    if (options.assessRisk) {
      classification.riskLevel = this.assessRisk(bestMatch.intent, classification.complexity);
    }

    if (options.suggestTools) {
      classification.requiredTools = this.suggestTools(bestMatch.intent, classification.complexity);
    }

    return classification;
  }

  /**
   * Get intent patterns for classification
   */
  private getIntentPatterns(): Map<IntentType, string[]> {
    return new Map([
      [
        'edit',
        [
          'edit this file',
          'modify the function',
          'change the implementation',
          'update the code',
          'fix the bug',
          'edit this',
          'modify this',
          'change this',
          'update this',
          'fix this',
          'add code',
          'remove code',
          'delete code',
          'insert code',
          'replace code',
        ],
      ],
      [
        'refactor',
        [
          'refactor',
          'restructure',
          'improve',
          'clean up',
          'simplify',
          'extract function',
          'inline function',
          'rename',
          'move',
          'split',
          'merge',
          'refactor this function',
          'extract function from complex code',
          'restructure the code',
          'clean up the implementation',
          'simplify this method',
        ],
      ],
      [
        'explain',
        [
          'explain',
          'describe',
          'what does',
          'how does',
          'why',
          'document',
          'comment',
          'clarify',
          'understand',
          'break down',
          'explain this code',
          'what does this function do',
          'describe the implementation',
          'how does this work',
          'clarify the logic',
        ],
      ],
      [
        'test-gen',
        [
          'generate tests',
          'create unit tests',
          'write test cases',
          'add test coverage',
          'test this function',
          'write test',
          'create test',
          'add test',
          'unit test for',
          'integration test',
          'test case for',
          'testing this',
          'test coverage',
          'test suite',
        ],
      ],
      [
        'doc-gen',
        [
          'document this code',
          'add documentation',
          'write comments',
          'create API docs',
          'generate README',
          'document this',
          'add documentation',
          'write docs',
          'comment this',
          'api documentation',
          'readme for',
          'manual for',
          'guide for',
        ],
      ],
      [
        'migration',
        [
          'migrate',
          'upgrade',
          'convert',
          'port',
          'transform',
          'translate',
          'legacy',
          'deprecated',
          'version',
          'breaking change',
        ],
      ],
      [
        'optimize',
        [
          'optimize performance',
          'improve speed',
          'reduce memory usage',
          'fix bottleneck',
          'make it faster',
          'make faster',
          'speed up',
          'improve performance',
          'memory optimization',
          'cpu optimization',
          'bottleneck',
          'profiling',
        ],
      ],
      [
        'debug',
        [
          'debug',
          'bug',
          'error',
          'issue',
          'problem',
          'troubleshoot',
          'investigate',
          'trace',
          'log',
          'exception',
          'crash',
        ],
      ],
      [
        'analyze',
        [
          'analyze the code',
          'get metrics',
          'generate report',
          'check complexity',
          'review architecture',
          'analyze code',
          'code analysis',
          'review code',
          'audit code',
          'inspect code',
          'examine code',
          'metrics for',
          'statistics for',
        ],
      ],
    ]);
  }

  /**
   * Match input against intent patterns
   */
  private matchPatterns(
    input: string,
    context: string,
    patterns: string[]
  ): { confidence: number; reasoning: string } {
    let confidence = 0;
    let matchedPatterns: string[] = [];

    const inputLower = input.toLowerCase();
    const contextLower = context.toLowerCase();

    for (const pattern of patterns) {
      const patternLower = pattern.toLowerCase();

      // Check for exact phrase matches (highest priority)
      if (inputLower.includes(patternLower)) {
        confidence += 1.0;
        matchedPatterns.push(pattern);
      }

      // Check for word boundary matches
      const words = inputLower.split(/\s+/);
      for (const word of words) {
        if (word === patternLower) {
          confidence += 0.8;
          matchedPatterns.push(pattern);
        } else if (patternLower.includes(word) && word.length > 2) {
          confidence += 0.5;
          matchedPatterns.push(pattern);
        }
      }
    }

    // Boost confidence for exact matches
    for (const pattern of patterns) {
      if (
        inputLower === pattern.toLowerCase() ||
        inputLower.startsWith(pattern.toLowerCase() + ' ')
      ) {
        confidence += 0.7;
        break;
      }
    }

    // Cap confidence at 1.0
    confidence = Math.min(confidence, 1.0);

    const reasoning =
      matchedPatterns.length > 0
        ? `Matched patterns: ${matchedPatterns.join(', ')}`
        : 'No patterns matched';

    return { confidence, reasoning };
  }

  /**
   * Extract sub-intents from the input
   */
  private extractSubIntents(input: string, mainIntent: IntentType): string[] {
    const subIntents: string[] = [];

    // Extract specific actions based on main intent
    switch (mainIntent) {
      case 'refactor':
        if (input.includes('extract')) subIntents.push('extract-function');
        if (input.includes('inline')) subIntents.push('inline-function');
        if (input.includes('rename')) subIntents.push('rename-symbol');
        if (input.includes('move')) subIntents.push('move-symbol');
        break;
      case 'edit':
        if (input.includes('add')) subIntents.push('add-code');
        if (input.includes('remove')) subIntents.push('remove-code');
        if (input.includes('replace')) subIntents.push('replace-code');
        break;
      case 'test-gen':
        if (input.includes('unit')) subIntents.push('unit-tests');
        if (input.includes('integration')) subIntents.push('integration-tests');
        if (input.includes('coverage')) subIntents.push('coverage-tests');
        break;
    }

    return subIntents;
  }

  /**
   * Estimate complexity based on input and intent
   */
  private estimateComplexity(input: string, intent: IntentType): 'low' | 'medium' | 'high' {
    const complexityIndicators = {
      low: ['simple', 'easy', 'quick', 'small', 'minor'],
      high: ['complex', 'difficult', 'major', 'large', 'comprehensive', 'complete'],
    };

    const inputLower = input.toLowerCase();

    // Check for complexity indicators
    for (const indicator of complexityIndicators.low) {
      if (inputLower.includes(indicator)) return 'low';
    }

    for (const indicator of complexityIndicators.high) {
      if (inputLower.includes(indicator)) return 'high';
    }

    // Default complexity based on intent
    const intentComplexity: Record<IntentType, 'low' | 'medium' | 'high'> = {
      refactor: 'medium',
      edit: 'low',
      explain: 'low',
      'test-gen': 'medium',
      'doc-gen': 'low',
      migration: 'high',
      optimize: 'high',
      debug: 'medium',
      analyze: 'medium',
      unknown: 'medium',
    };

    return intentComplexity[intent];
  }

  /**
   * Estimate time required for the task
   */
  private estimateTime(complexity: 'low' | 'medium' | 'high', intent: IntentType): number {
    const baseTime: Record<IntentType, number> = {
      refactor: 15,
      edit: 5,
      explain: 3,
      'test-gen': 20,
      'doc-gen': 10,
      migration: 60,
      optimize: 30,
      debug: 15,
      analyze: 10,
      unknown: 10,
    };

    const complexityMultiplier = {
      low: 0.5,
      medium: 1.0,
      high: 2.0,
    };

    return Math.round(baseTime[intent] * complexityMultiplier[complexity]);
  }

  /**
   * Assess risk level of the task
   */
  private assessRisk(
    intent: IntentType,
    complexity: 'low' | 'medium' | 'high'
  ): 'low' | 'medium' | 'high' {
    const intentRisk: Record<IntentType, 'low' | 'medium' | 'high'> = {
      refactor: 'medium',
      edit: 'low',
      explain: 'low',
      'test-gen': 'low',
      'doc-gen': 'low',
      migration: 'high',
      optimize: 'medium',
      debug: 'low',
      analyze: 'low',
      unknown: 'medium',
    };

    const complexityRisk = {
      low: 'low',
      medium: 'medium',
      high: 'high',
    };

    // Take the higher risk between intent and complexity
    const intentRiskLevel = intentRisk[intent];
    const complexityRiskLevel = complexityRisk[complexity];

    if (intentRiskLevel === 'high' || complexityRiskLevel === 'high') return 'high';
    if (intentRiskLevel === 'medium' || complexityRiskLevel === 'medium') return 'medium';
    return 'low';
  }

  /**
   * Suggest required tools for the task
   */
  private suggestTools(intent: IntentType, complexity: 'low' | 'medium' | 'high'): string[] {
    const baseTools: Record<IntentType, string[]> = {
      refactor: ['search', 'read', 'edit', 'typecheck', 'format'],
      edit: ['read', 'edit', 'format'],
      explain: ['search', 'read'],
      'test-gen': ['search', 'read', 'edit', 'test-runner'],
      'doc-gen': ['search', 'read', 'edit'],
      migration: ['search', 'read', 'edit', 'typecheck', 'test-runner', 'format'],
      optimize: ['search', 'read', 'edit', 'profiler', 'benchmark'],
      debug: ['search', 'read', 'debugger', 'log-analyzer'],
      analyze: ['search', 'read', 'metrics-collector'],
      unknown: ['search', 'read'],
    };

    const tools = baseTools[intent] || ['search', 'read'];

    // Add complexity-based tools
    if (complexity === 'high') {
      tools.push('safety-check', 'rollback');
    }

    return tools;
  }

  /**
   * Get classification statistics
   */
  async getClassificationStats(): Promise<{
    totalClassifications: number;
    intentDistribution: Record<IntentType, number>;
    averageConfidence: number;
    averageComplexity: Record<string, number>;
  }> {
    // This would typically query metrics storage
    return {
      totalClassifications: 0,
      intentDistribution: {} as Record<IntentType, number>,
      averageConfidence: 0,
      averageComplexity: {},
    };
  }
}
