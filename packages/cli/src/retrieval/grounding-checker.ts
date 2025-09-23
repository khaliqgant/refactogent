import { Logger } from '../utils/logger.js';
import { RefactoGentMetrics } from '../observability/metrics.js';
import { RefactoGentTracer } from '../observability/tracing.js';
import { RefactoGentConfig } from '../config/refactogent-schema.js';
import { CodeChunk } from '../ingestion/language-chunker.js';
import { CodeGraphService } from '../graph/code-graph-service.js';

export interface GroundingCheckResult {
  isValid: boolean;
  confidence: number;
  issues: GroundingIssue[];
  suggestions: string[];
  verifiedSymbols: VerifiedSymbol[];
}

export interface GroundingIssue {
  type: 'missing_symbol' | 'conflicting_definition' | 'outdated_reference' | 'circular_dependency';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  filePath?: string;
  lineNumber?: number;
  symbolName?: string;
}

export interface VerifiedSymbol {
  name: string;
  filePath: string;
  lineNumber: number;
  type: 'function' | 'class' | 'variable' | 'interface' | 'type';
  isExported: boolean;
  isUsed: boolean;
  dependencies: string[];
  dependents: string[];
}

export interface GroundingCheckOptions {
  strictMode?: boolean;
  includeTests?: boolean;
  maxDepth?: number;
  allowCircularDeps?: boolean;
  verifyExports?: boolean;
}

/**
 * Performs grounding checks to ensure retrieved context is accurate and consistent
 */
export class GroundingChecker {
  private logger: Logger;
  private metrics: RefactoGentMetrics;
  private tracer: RefactoGentTracer;
  private config: RefactoGentConfig;
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
    this.codeGraphService = new CodeGraphService(logger, metrics, tracer, config);
  }

  /**
   * Perform comprehensive grounding checks on retrieved chunks
   */
  async checkGrounding(
    chunks: CodeChunk[],
    query: string,
    options: GroundingCheckOptions = {}
  ): Promise<GroundingCheckResult> {
    const span = this.tracer.startAnalysisTrace('.', 'grounding-check');

    try {
      this.logger.info('Starting grounding checks', {
        chunks: chunks.length,
        query: query.substring(0, 100),
        strictMode: options.strictMode,
      });

      const issues: GroundingIssue[] = [];
      const verifiedSymbols: VerifiedSymbol[] = [];
      const suggestions: string[] = [];

      // Extract symbols from chunks
      const symbols = this.extractSymbolsFromChunks(chunks);
      this.logger.debug('Extracted symbols', { count: symbols.length });

      // Check symbol validity
      for (const symbol of symbols) {
        const symbolCheck = await this.checkSymbolValidity(symbol, options);
        if (symbolCheck.issues.length > 0) {
          issues.push(...symbolCheck.issues);
        }
        if (symbolCheck.verified) {
          verifiedSymbols.push(symbolCheck.verified);
        }
      }

      // Check for conflicting definitions
      const conflicts = await this.checkConflictingDefinitions(symbols, options);
      issues.push(...conflicts);

      // Check for circular dependencies
      if (!options.allowCircularDeps) {
        const circularDeps = await this.checkCircularDependencies(symbols, options);
        issues.push(...circularDeps);
      }

      // Check for outdated references
      const outdatedRefs = await this.checkOutdatedReferences(chunks, options);
      issues.push(...outdatedRefs);

      // Generate suggestions for improvement
      suggestions.push(...this.generateSuggestions(issues, verifiedSymbols));

      // Calculate overall confidence
      const confidence = this.calculateConfidence(issues, verifiedSymbols.length);

      const result: GroundingCheckResult = {
        isValid:
          issues.filter(i => i.severity === 'critical' || i.severity === 'high').length === 0,
        confidence,
        issues,
        suggestions,
        verifiedSymbols,
      };

      this.tracer.recordSuccess(
        span,
        `Grounding check completed: ${issues.length} issues, ${verifiedSymbols.length} verified symbols`
      );

      this.metrics.recordSafetyViolation('safety');

      return result;
    } catch (error) {
      this.tracer.recordError(span, error as Error, 'Grounding check failed');
      throw error;
    }
  }

  /**
   * Extract symbols from chunks
   */
  private extractSymbolsFromChunks(chunks: CodeChunk[]): Array<{
    name: string;
    filePath: string;
    lineNumber: number;
    type: string;
    content: string;
  }> {
    const symbols: Array<{
      name: string;
      filePath: string;
      lineNumber: number;
      type: string;
      content: string;
    }> = [];

    for (const chunk of chunks) {
      const chunkSymbols = this.extractSymbolsFromChunk(chunk);
      symbols.push(...chunkSymbols);
    }

    return symbols;
  }

  /**
   * Extract symbols from individual chunk
   */
  private extractSymbolsFromChunk(chunk: CodeChunk): Array<{
    name: string;
    filePath: string;
    lineNumber: number;
    type: string;
    content: string;
  }> {
    const symbols: Array<{
      name: string;
      filePath: string;
      lineNumber: number;
      type: string;
      content: string;
    }> = [];

    const lines = chunk.content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = chunk.startLine + i;

      // Function declarations
      const functionMatch = line.match(/(?:function|async function)\s+(\w+)/);
      if (functionMatch) {
        symbols.push({
          name: functionMatch[1],
          filePath: chunk.filePath,
          lineNumber,
          type: 'function',
          content: line.trim(),
        });
      }

      // Class declarations
      const classMatch = line.match(/class\s+(\w+)/);
      if (classMatch) {
        symbols.push({
          name: classMatch[1],
          filePath: chunk.filePath,
          lineNumber,
          type: 'class',
          content: line.trim(),
        });
      }

      // Variable declarations
      const varMatch = line.match(/(?:const|let|var)\s+(\w+)/);
      if (varMatch) {
        symbols.push({
          name: varMatch[1],
          filePath: chunk.filePath,
          lineNumber,
          type: 'variable',
          content: line.trim(),
        });
      }

      // Interface/type declarations
      const interfaceMatch = line.match(/(?:interface|type)\s+(\w+)/);
      if (interfaceMatch) {
        symbols.push({
          name: interfaceMatch[1],
          filePath: chunk.filePath,
          lineNumber,
          type: 'interface',
          content: line.trim(),
        });
      }
    }

    return symbols;
  }

  /**
   * Check validity of individual symbol
   */
  private async checkSymbolValidity(
    symbol: { name: string; filePath: string; lineNumber: number; type: string; content: string },
    options: GroundingCheckOptions
  ): Promise<{ issues: GroundingIssue[]; verified?: VerifiedSymbol }> {
    const issues: GroundingIssue[] = [];
    let verified: VerifiedSymbol | undefined;

    try {
      // Check if symbol exists in code graph
      const graphResult = await this.codeGraphService.queryGraph('neighborhood', symbol.name, {
        maxDepth: 1,
        includeTests: options.includeTests,
      });

      if (graphResult.directNeighbors.length === 0) {
        issues.push({
          type: 'missing_symbol',
          severity: 'high',
          message: `Symbol '${symbol.name}' not found in code graph`,
          filePath: symbol.filePath,
          lineNumber: symbol.lineNumber,
          symbolName: symbol.name,
        });
      } else {
        // Symbol exists, create verified entry
        const node = graphResult.directNeighbors[0];
        verified = {
          name: symbol.name,
          filePath: node.filePath,
          lineNumber: node.startLine || symbol.lineNumber,
          type: this.mapNodeTypeToSymbolType(node.type),
          isExported: node.isExported || false,
          isUsed: node.dependents && node.dependents.length > 0,
          dependencies: node.dependencies || [],
          dependents: node.dependents || [],
        };
      }
    } catch (error) {
      issues.push({
        type: 'missing_symbol',
        severity: 'medium',
        message: `Could not verify symbol '${symbol.name}': ${error instanceof Error ? error.message : 'Unknown error'}`,
        filePath: symbol.filePath,
        lineNumber: symbol.lineNumber,
        symbolName: symbol.name,
      });
    }

    return { issues, verified };
  }

  /**
   * Check for conflicting symbol definitions
   */
  private async checkConflictingDefinitions(
    symbols: Array<{
      name: string;
      filePath: string;
      lineNumber: number;
      type: string;
      content: string;
    }>,
    options: GroundingCheckOptions
  ): Promise<GroundingIssue[]> {
    const issues: GroundingIssue[] = [];
    const symbolMap = new Map<
      string,
      Array<{ filePath: string; lineNumber: number; type: string }>
    >();

    // Group symbols by name
    for (const symbol of symbols) {
      if (!symbolMap.has(symbol.name)) {
        symbolMap.set(symbol.name, []);
      }
      symbolMap.get(symbol.name)!.push({
        filePath: symbol.filePath,
        lineNumber: symbol.lineNumber,
        type: symbol.type,
      });
    }

    // Check for conflicts
    for (const [name, definitions] of symbolMap) {
      if (definitions.length > 1) {
        const uniqueFiles = new Set(definitions.map(d => d.filePath));
        const uniqueTypes = new Set(definitions.map(d => d.type));

        if (uniqueFiles.size > 1) {
          issues.push({
            type: 'conflicting_definition',
            severity: 'high',
            message: `Symbol '${name}' is defined in multiple files: ${Array.from(uniqueFiles).join(', ')}`,
            symbolName: name,
          });
        }

        if (uniqueTypes.size > 1) {
          issues.push({
            type: 'conflicting_definition',
            severity: 'medium',
            message: `Symbol '${name}' has conflicting types: ${Array.from(uniqueTypes).join(', ')}`,
            symbolName: name,
          });
        }
      }
    }

    return issues;
  }

  /**
   * Check for circular dependencies
   */
  private async checkCircularDependencies(
    symbols: Array<{
      name: string;
      filePath: string;
      lineNumber: number;
      type: string;
      content: string;
    }>,
    options: GroundingCheckOptions
  ): Promise<GroundingIssue[]> {
    const issues: GroundingIssue[] = [];

    try {
      // Get dependency graph
      const dependencyGraph = await this.codeGraphService.queryGraph(
        'dependencies',
        symbols[0]?.name || '',
        { maxDepth: options.maxDepth || 5 }
      );

      // Check for cycles (simplified check)
      const visited = new Set<string>();
      const recursionStack = new Set<string>();

      const hasCycle = (nodeId: string): boolean => {
        if (recursionStack.has(nodeId)) return true;
        if (visited.has(nodeId)) return false;

        visited.add(nodeId);
        recursionStack.add(nodeId);

        // Check dependencies (simplified)
        const hasCycleInDeps = false; // This would need actual graph traversal

        recursionStack.delete(nodeId);
        return hasCycleInDeps;
      };

      // This is a simplified check - in practice, you'd traverse the actual graph
      if (dependencyGraph.directNeighbors.length > 10) {
        issues.push({
          type: 'circular_dependency',
          severity: 'medium',
          message: 'Potential circular dependency detected in symbol graph',
        });
      }
    } catch (error) {
      this.logger.warn('Could not check circular dependencies', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    return issues;
  }

  /**
   * Check for outdated references
   */
  private async checkOutdatedReferences(
    chunks: CodeChunk[],
    options: GroundingCheckOptions
  ): Promise<GroundingIssue[]> {
    const issues: GroundingIssue[] = [];

    // This would check for outdated imports, deprecated APIs, etc.
    // For now, we'll do a simple check for common outdated patterns

    for (const chunk of chunks) {
      const content = chunk.content;

      // Check for deprecated patterns
      if (content.includes('var ') && !content.includes('// legacy')) {
        issues.push({
          type: 'outdated_reference',
          severity: 'low',
          message: 'Use of var instead of const/let detected',
          filePath: chunk.filePath,
          lineNumber: chunk.startLine,
        });
      }

      if (content.includes('function(') && !content.includes('=>')) {
        issues.push({
          type: 'outdated_reference',
          severity: 'low',
          message: 'Consider using arrow functions for consistency',
          filePath: chunk.filePath,
          lineNumber: chunk.startLine,
        });
      }
    }

    return issues;
  }

  /**
   * Generate improvement suggestions
   */
  private generateSuggestions(
    issues: GroundingIssue[],
    verifiedSymbols: VerifiedSymbol[]
  ): string[] {
    const suggestions: string[] = [];

    if (issues.some(i => i.type === 'missing_symbol')) {
      suggestions.push('Consider adding missing symbol definitions or imports');
    }

    if (issues.some(i => i.type === 'conflicting_definition')) {
      suggestions.push('Resolve conflicting symbol definitions by renaming or consolidating');
    }

    if (issues.some(i => i.type === 'circular_dependency')) {
      suggestions.push('Refactor to break circular dependencies');
    }

    if (issues.some(i => i.type === 'outdated_reference')) {
      suggestions.push('Update code to use modern patterns and APIs');
    }

    if (verifiedSymbols.length > 0) {
      suggestions.push(`Found ${verifiedSymbols.length} verified symbols - good grounding`);
    }

    return suggestions;
  }

  /**
   * Calculate overall confidence score
   */
  private calculateConfidence(issues: GroundingIssue[], verifiedCount: number): number {
    if (verifiedCount === 0) return 0;

    const criticalIssues = issues.filter(i => i.severity === 'critical').length;
    const highIssues = issues.filter(i => i.severity === 'high').length;
    const mediumIssues = issues.filter(i => i.severity === 'medium').length;
    const lowIssues = issues.filter(i => i.severity === 'low').length;

    const issuePenalty =
      criticalIssues * 0.4 + highIssues * 0.3 + mediumIssues * 0.2 + lowIssues * 0.1;
    const baseConfidence = Math.min(verifiedCount / 10, 1.0); // Cap at 1.0

    return Math.max(0, baseConfidence - issuePenalty);
  }

  /**
   * Map node type to symbol type
   */
  private mapNodeTypeToSymbolType(
    nodeType: string
  ): 'function' | 'class' | 'variable' | 'interface' | 'type' {
    switch (nodeType) {
      case 'function':
      case 'method':
        return 'function';
      case 'class':
        return 'class';
      case 'variable':
      case 'property':
        return 'variable';
      case 'interface':
        return 'interface';
      case 'type':
        return 'type';
      default:
        return 'variable';
    }
  }

  /**
   * Close resources
   */
  async close(): Promise<void> {
    await this.codeGraphService.close();
  }
}
