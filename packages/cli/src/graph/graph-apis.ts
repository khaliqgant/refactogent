import { Logger } from '../utils/logger';
import { RefactoGentMetrics } from '../observability/metrics';
import { RefactoGentTracer } from '../observability/tracing';
import { RefactoGentConfig } from '../config/refactogent-schema';
import { GraphStorage, GraphQuery, GraphQueryResult } from './graph-storage.js';
import { SymbolNode, GraphEdge, CodeGraph } from './symbol-parser.js';
import * as path from 'path';

export interface GraphTraversalOptions {
  maxDepth?: number;
  includeTests?: boolean;
  includeConfigs?: boolean;
  weightThreshold?: number;
  nodeTypes?: string[];
  edgeTypes?: string[];
}

export interface ImpactAnalysis {
  affectedFiles: string[];
  affectedSymbols: string[];
  testFiles: string[];
  configFiles: string[];
  impactScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  recommendations: string[];
}

export interface NeighborhoodAnalysis {
  directNeighbors: SymbolNode[];
  indirectNeighbors: SymbolNode[];
  connectionPaths: string[][];
  centralityScore: number;
  importanceScore: number;
}

export interface TestMapping {
  sourceFile: string;
  testFiles: string[];
  testCoverage: number;
  missingTests: string[];
  testQuality: 'poor' | 'fair' | 'good' | 'excellent';
}

/**
 * Graph APIs for Code Graph Traversal and Querying
 *
 * Provides high-level APIs for graph traversal, impact analysis,
 * and test mapping capabilities.
 */
export class GraphAPIs {
  private logger: Logger;
  private metrics: RefactoGentMetrics;
  private tracer: RefactoGentTracer;
  private config: RefactoGentConfig;
  private graphStorage: GraphStorage;

  constructor(
    logger: Logger,
    metrics: RefactoGentMetrics,
    tracer: RefactoGentTracer,
    config: RefactoGentConfig,
    graphStorage: GraphStorage
  ) {
    this.logger = logger;
    this.metrics = metrics;
    this.tracer = tracer;
    this.config = config;
    this.graphStorage = graphStorage;
  }

  /**
   * Get neighborhood of a symbol
   */
  async getNeighborhood(
    symbolId: string,
    options: GraphTraversalOptions = {}
  ): Promise<NeighborhoodAnalysis> {
    const span = this.tracer.startAnalysisTrace('.', 'get-neighborhood');

    try {
      this.logger.info('Getting neighborhood', { symbolId, options });

      const query: GraphQuery = {
        type: 'neighborhood',
        source: symbolId,
        maxDepth: options.maxDepth || 2,
        includeTests: options.includeTests,
        includeConfigs: options.includeConfigs,
      };

      const result = await this.graphStorage.queryGraph(query);

      const analysis: NeighborhoodAnalysis = {
        directNeighbors: result.nodes.filter(n => this.isDirectNeighbor(n, symbolId)),
        indirectNeighbors: result.nodes.filter(n => !this.isDirectNeighbor(n, symbolId)),
        connectionPaths: result.paths,
        centralityScore: this.calculateCentralityScore(result.nodes, result.edges),
        importanceScore: this.calculateImportanceScore(result.nodes, result.edges),
      };

      this.tracer.recordSuccess(span, `Found ${result.nodes.length} neighbors for ${symbolId}`);
      return analysis;
    } catch (error) {
      this.tracer.recordError(span, error as Error, 'Get neighborhood failed');
      throw error;
    }
  }

  /**
   * Perform impact analysis for a symbol
   */
  async performImpactAnalysis(
    symbolId: string,
    options: GraphTraversalOptions = {}
  ): Promise<ImpactAnalysis> {
    const span = this.tracer.startAnalysisTrace('.', 'impact-analysis');

    try {
      this.logger.info('Performing impact analysis', { symbolId, options });

      const query: GraphQuery = {
        type: 'impact',
        source: symbolId,
        maxDepth: options.maxDepth || 3,
        includeTests: options.includeTests,
        includeConfigs: options.includeConfigs,
      };

      const result = await this.graphStorage.queryGraph(query);

      const affectedFiles = [...new Set(result.nodes.map(n => n.filePath))];
      const affectedSymbols = result.nodes.map(n => n.id);
      const testFiles = result.testFiles;
      const configFiles = result.configFiles;
      const impactScore = result.impactScore;

      const riskLevel = this.calculateRiskLevel(
        impactScore,
        affectedFiles.length,
        affectedSymbols.length
      );
      const recommendations = this.generateRecommendations(
        impactScore,
        riskLevel,
        affectedFiles,
        testFiles
      );

      const analysis: ImpactAnalysis = {
        affectedFiles,
        affectedSymbols,
        testFiles,
        configFiles,
        impactScore,
        riskLevel,
        recommendations,
      };

      this.tracer.recordSuccess(
        span,
        `Impact analysis complete: ${affectedFiles.length} files, ${affectedSymbols.length} symbols`
      );
      return analysis;
    } catch (error) {
      this.tracer.recordError(span, error as Error, 'Impact analysis failed');
      throw error;
    }
  }

  /**
   * Get test mapping for a symbol
   */
  async getTestMapping(
    symbolId: string,
    options: GraphTraversalOptions = {}
  ): Promise<TestMapping> {
    const span = this.tracer.startAnalysisTrace('.', 'test-mapping');

    try {
      this.logger.info('Getting test mapping', { symbolId, options });

      const query: GraphQuery = {
        type: 'test-mapping',
        source: symbolId,
        maxDepth: options.maxDepth || 2,
        includeTests: true,
      };

      const result = await this.graphStorage.queryGraph(query);

      const sourceFile = result.nodes.find(n => n.id === symbolId)?.filePath || '';
      const testFiles = result.testFiles;
      const testCoverage = this.calculateTestCoverage(result.nodes, testFiles);
      const missingTests = this.identifyMissingTests(result.nodes, testFiles);
      const testQuality = this.assessTestQuality(result.nodes, testFiles);

      const mapping: TestMapping = {
        sourceFile,
        testFiles,
        testCoverage,
        missingTests,
        testQuality,
      };

      this.tracer.recordSuccess(
        span,
        `Test mapping complete: ${testFiles.length} test files, ${testCoverage}% coverage`
      );
      return mapping;
    } catch (error) {
      this.tracer.recordError(span, error as Error, 'Test mapping failed');
      throw error;
    }
  }

  /**
   * Get dependencies of a symbol
   */
  async getDependencies(
    symbolId: string,
    options: GraphTraversalOptions = {}
  ): Promise<SymbolNode[]> {
    const span = this.tracer.startAnalysisTrace('.', 'get-dependencies');

    try {
      this.logger.info('Getting dependencies', { symbolId, options });

      const query: GraphQuery = {
        type: 'dependencies',
        source: symbolId,
        maxDepth: options.maxDepth || 5,
        includeTests: options.includeTests,
        includeConfigs: options.includeConfigs,
      };

      const result = await this.graphStorage.queryGraph(query);

      this.tracer.recordSuccess(span, `Found ${result.nodes.length} dependencies for ${symbolId}`);
      return result.nodes;
    } catch (error) {
      this.tracer.recordError(span, error as Error, 'Get dependencies failed');
      throw error;
    }
  }

  /**
   * Get dependents of a symbol
   */
  async getDependents(
    symbolId: string,
    options: GraphTraversalOptions = {}
  ): Promise<SymbolNode[]> {
    const span = this.tracer.startAnalysisTrace('.', 'get-dependents');

    try {
      this.logger.info('Getting dependents', { symbolId, options });

      const query: GraphQuery = {
        type: 'dependents',
        source: symbolId,
        maxDepth: options.maxDepth || 5,
        includeTests: options.includeTests,
        includeConfigs: options.includeConfigs,
      };

      const result = await this.graphStorage.queryGraph(query);

      this.tracer.recordSuccess(span, `Found ${result.nodes.length} dependents for ${symbolId}`);
      return result.nodes;
    } catch (error) {
      this.tracer.recordError(span, error as Error, 'Get dependents failed');
      throw error;
    }
  }

  /**
   * Find shortest path between two symbols
   */
  async findShortestPath(
    sourceId: string,
    targetId: string,
    options: GraphTraversalOptions = {}
  ): Promise<string[]> {
    const span = this.tracer.startAnalysisTrace('.', 'find-shortest-path');

    try {
      this.logger.info('Finding shortest path', { sourceId, targetId, options });

      // Implementation would use Dijkstra's algorithm or BFS
      const path = await this.dijkstraShortestPath(sourceId, targetId, options);

      this.tracer.recordSuccess(span, `Found path with ${path.length} nodes`);
      return path;
    } catch (error) {
      this.tracer.recordError(span, error as Error, 'Find shortest path failed');
      throw error;
    }
  }

  /**
   * Get graph statistics
   */
  async getGraphStatistics(): Promise<{
    totalNodes: number;
    totalEdges: number;
    fileCount: number;
    languageDistribution: Record<string, number>;
    edgeTypeDistribution: Record<string, number>;
    complexityDistribution: Record<string, number>;
    processingTime: number;
  }> {
    const span = this.tracer.startAnalysisTrace('.', 'graph-statistics');

    try {
      this.logger.info('Getting graph statistics');

      const stats = await this.graphStorage.getGraphStats();

      this.tracer.recordSuccess(
        span,
        `Graph stats: ${stats.totalNodes} nodes, ${stats.totalEdges} edges`
      );
      return stats;
    } catch (error) {
      this.tracer.recordError(span, error as Error, 'Get graph statistics failed');
      throw error;
    }
  }

  /**
   * Search symbols by name pattern
   */
  async searchSymbols(
    pattern: string,
    options: {
      exactMatch?: boolean;
      caseSensitive?: boolean;
      nodeTypes?: string[];
      maxResults?: number;
    } = {}
  ): Promise<SymbolNode[]> {
    const span = this.tracer.startAnalysisTrace('.', 'search-symbols');

    try {
      this.logger.info('Searching symbols', { pattern, options });

      // Implementation would search the graph for matching symbols
      const results = await this.performSymbolSearch(pattern, options);

      this.tracer.recordSuccess(span, `Found ${results.length} matching symbols`);
      return results;
    } catch (error) {
      this.tracer.recordError(span, error as Error, 'Search symbols failed');
      throw error;
    }
  }

  /**
   * Get graph visualization data
   */
  async getGraphVisualization(
    centerNodeId: string,
    options: GraphTraversalOptions = {}
  ): Promise<{
    nodes: Array<{
      id: string;
      name: string;
      type: string;
      filePath: string;
      x?: number;
      y?: number;
      size: number;
      color: string;
    }>;
    edges: Array<{
      id: string;
      source: string;
      target: string;
      type: string;
      weight: number;
      color: string;
    }>;
  }> {
    const span = this.tracer.startAnalysisTrace('.', 'graph-visualization');

    try {
      this.logger.info('Getting graph visualization', { centerNodeId, options });

      const neighborhood = await this.getNeighborhood(centerNodeId, options);

      const nodes = neighborhood.directNeighbors.map(node => ({
        id: node.id,
        name: node.name,
        type: node.type,
        filePath: node.filePath,
        size: this.calculateNodeSize(node),
        color: this.getNodeColor(node.type),
      }));

      const edges: any[] = []; // Implementation would get edges

      this.tracer.recordSuccess(
        span,
        `Visualization data: ${nodes.length} nodes, ${edges.length} edges`
      );
      return { nodes, edges };
    } catch (error) {
      this.tracer.recordError(span, error as Error, 'Get graph visualization failed');
      throw error;
    }
  }

  // Helper methods
  private isDirectNeighbor(node: SymbolNode, centerId: string): boolean {
    // Implementation would check if node is directly connected to center
    return false;
  }

  private calculateCentralityScore(nodes: SymbolNode[], edges: GraphEdge[]): number {
    // Calculate centrality score based on connections
    const connections = edges.length;
    const totalNodes = nodes.length;
    return totalNodes > 0 ? connections / totalNodes : 0;
  }

  private calculateImportanceScore(nodes: SymbolNode[], edges: GraphEdge[]): number {
    // Calculate importance score based on node properties and connections
    let score = 0;
    for (const node of nodes) {
      score += node.complexity * 0.1;
      score += node.isExported ? 0.2 : 0;
    }
    score += edges.length * 0.05;
    return Math.min(1.0, score);
  }

  private calculateRiskLevel(
    impactScore: number,
    affectedFiles: number,
    affectedSymbols: number
  ): 'low' | 'medium' | 'high' | 'critical' {
    if (impactScore > 0.8 || affectedFiles > 10 || affectedSymbols > 20) {
      return 'critical';
    } else if (impactScore > 0.6 || affectedFiles > 5 || affectedSymbols > 10) {
      return 'high';
    } else if (impactScore > 0.4 || affectedFiles > 2 || affectedSymbols > 5) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  private generateRecommendations(
    impactScore: number,
    riskLevel: string,
    affectedFiles: string[],
    testFiles: string[]
  ): string[] {
    const recommendations: string[] = [];

    if (riskLevel === 'critical' || riskLevel === 'high') {
      recommendations.push('Consider breaking down this change into smaller, safer increments');
      recommendations.push('Ensure comprehensive test coverage before making changes');
    }

    if (affectedFiles.length > 5) {
      recommendations.push(
        'This change affects many files - consider refactoring to reduce coupling'
      );
    }

    if (testFiles.length === 0) {
      recommendations.push('No test files found - consider adding tests for this functionality');
    }

    if (impactScore > 0.7) {
      recommendations.push('High impact change - consider impact analysis and stakeholder review');
    }

    return recommendations;
  }

  private calculateTestCoverage(nodes: SymbolNode[], testFiles: string[]): number {
    // Calculate test coverage percentage
    const totalSymbols = nodes.length;
    const testedSymbols = nodes.filter(n => this.isTested(n, testFiles)).length;
    return totalSymbols > 0 ? (testedSymbols / totalSymbols) * 100 : 0;
  }

  private identifyMissingTests(nodes: SymbolNode[], testFiles: string[]): string[] {
    // Identify symbols that need tests
    return nodes.filter(n => !this.isTested(n, testFiles)).map(n => n.name);
  }

  private assessTestQuality(
    nodes: SymbolNode[],
    testFiles: string[]
  ): 'poor' | 'fair' | 'good' | 'excellent' {
    const coverage = this.calculateTestCoverage(nodes, testFiles);

    if (coverage >= 90) return 'excellent';
    if (coverage >= 75) return 'good';
    if (coverage >= 50) return 'fair';
    return 'poor';
  }

  private isTested(node: SymbolNode, testFiles: string[]): boolean {
    // Check if node has corresponding tests
    return testFiles.some(
      testFile =>
        testFile.includes(node.name) ||
        testFile.includes(path.basename(node.filePath, path.extname(node.filePath)))
    );
  }

  private async dijkstraShortestPath(
    sourceId: string,
    targetId: string,
    options: GraphTraversalOptions
  ): Promise<string[]> {
    // Implementation of Dijkstra's algorithm for shortest path
    return [];
  }

  private async performSymbolSearch(pattern: string, options: any): Promise<SymbolNode[]> {
    // Implementation would search the graph for matching symbols
    return [];
  }

  private calculateNodeSize(node: SymbolNode): number {
    // Calculate node size based on complexity and importance
    return Math.max(10, Math.min(50, node.complexity * 5));
  }

  private getNodeColor(nodeType: string): string {
    const colors: Record<string, string> = {
      function: '#4CAF50',
      class: '#2196F3',
      interface: '#FF9800',
      variable: '#9C27B0',
      import: '#607D8B',
      export: '#795548',
    };
    return colors[nodeType] || '#757575';
  }
}
