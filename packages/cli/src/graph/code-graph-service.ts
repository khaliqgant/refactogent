import { Logger } from '../utils/logger';
import { RefactoGentMetrics } from '../observability/metrics';
import { RefactoGentTracer } from '../observability/tracing';
import { RefactoGentConfig } from '../config/refactogent-schema';
import { SymbolParser, CodeGraph, GraphAnalysis } from './symbol-parser.js';
import { GraphStorage, GraphStorageOptions } from './graph-storage.js';
import { GraphAPIs, GraphTraversalOptions, ImpactAnalysis, NeighborhoodAnalysis, TestMapping } from './graph-apis.js';
import * as path from 'path';
import * as fs from 'fs/promises';

export interface CodeGraphOptions {
  storageType?: 'sqlite' | 'memory' | 'json';
  dbPath?: string;
  maxNodes?: number;
  maxEdges?: number;
  enableIndexing?: boolean;
  includeTests?: boolean;
  includeConfigs?: boolean;
  maxDepth?: number;
  verbose?: boolean;
}

export interface CodeGraphResult {
  graph: CodeGraph;
  analysis: GraphAnalysis;
  storagePath: string;
  processingTime: number;
  success: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Code Graph Service
 * 
 * Main service for building, storing, and querying code graphs.
 * Integrates symbol parsing, graph storage, and graph APIs.
 */
export class CodeGraphService {
  private logger: Logger;
  private metrics: RefactoGentMetrics;
  private tracer: RefactoGentTracer;
  private config: RefactoGentConfig;
  private symbolParser: SymbolParser;
  private graphStorage!: GraphStorage;
  private graphAPIs!: GraphAPIs;

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
    this.symbolParser = new SymbolParser(logger, metrics, tracer, config);
  }

  /**
   * Build a complete code graph for a project
   */
  async buildCodeGraph(
    projectPath: string,
    options: CodeGraphOptions = {}
  ): Promise<CodeGraphResult> {
    const span = this.tracer.startAnalysisTrace(projectPath, 'build-code-graph');
    
    try {
      this.logger.info('Building code graph', { projectPath, options });
      
      const startTime = Date.now();
      const errors: string[] = [];
      const warnings: string[] = [];
      
      // Step 1: Parse symbols
      console.log('🔍 Step 1: Parsing symbols and dependencies...');
      const graph = await this.symbolParser.parseProject(projectPath, {
        includeTests: options.includeTests,
        includeConfigs: options.includeConfigs,
        maxDepth: options.maxDepth,
        verbose: options.verbose
      });
      
      console.log(`✅ Parsed ${graph.nodes.size} symbols with ${graph.edges.size} relationships`);
      
      // Step 2: Analyze graph
      console.log('📊 Step 2: Analyzing graph structure...');
      const analysis = await this.symbolParser.analyzeGraph(graph);
      
      console.log(`✅ Graph analysis complete: ${analysis.totalNodes} nodes, ${analysis.totalEdges} edges`);
      
      // Step 3: Initialize storage
      console.log('💾 Step 3: Initializing graph storage...');
      const storageOptions: GraphStorageOptions = {
        storageType: options.storageType || 'sqlite',
        dbPath: options.dbPath,
        maxNodes: options.maxNodes,
        maxEdges: options.maxEdges,
        enableIndexing: options.enableIndexing
      };
      
      this.graphStorage = new GraphStorage(
        this.logger,
        this.metrics,
        this.tracer,
        this.config,
        storageOptions
      );
      
      await this.graphStorage.initialize(projectPath);
      console.log('✅ Graph storage initialized');
      
      // Step 4: Store graph
      console.log('💾 Step 4: Storing graph...');
      await this.graphStorage.storeGraph(graph, projectPath);
      console.log('✅ Graph stored successfully');
      
      // Step 5: Initialize APIs
      console.log('🔗 Step 5: Initializing graph APIs...');
      this.graphAPIs = new GraphAPIs(
        this.logger,
        this.metrics,
        this.tracer,
        this.config,
        this.graphStorage
      );
      console.log('✅ Graph APIs initialized');
      
      const processingTime = Date.now() - startTime;
      const storagePath = this.getStoragePath(projectPath, options);
      
      const result: CodeGraphResult = {
        graph,
        analysis,
        storagePath,
        processingTime,
        success: true,
        errors,
        warnings
      };
      
      console.log('\n🎉 Code Graph Construction Complete!');
      console.log('═'.repeat(60));
      console.log(`📊 Graph Statistics:`);
      console.log(`  🔤 Total symbols: ${analysis.totalNodes}`);
      console.log(`  🔗 Total relationships: ${analysis.totalEdges}`);
      console.log(`  📁 Files processed: ${analysis.fileCount}`);
      console.log(`  ⏱️  Processing time: ${processingTime}ms`);
      console.log(`  💾 Storage path: ${storagePath}`);
      
      if (options.verbose) {
        console.log('\n📊 Language Distribution:');
        Object.entries(analysis.languageDistribution).forEach(([lang, count]) => {
          console.log(`  ${lang}: ${count} symbols`);
        });
        
        console.log('\n📊 Edge Type Distribution:');
        Object.entries(analysis.edgeTypeDistribution).forEach(([type, count]) => {
          console.log(`  ${type}: ${count} relationships`);
        });
        
        console.log('\n📊 Complexity Distribution:');
        Object.entries(analysis.complexityDistribution).forEach(([level, count]) => {
          console.log(`  ${level}: ${count} symbols`);
        });
      }
      
      this.tracer.recordSuccess(span, `Code graph built: ${analysis.totalNodes} nodes, ${analysis.totalEdges} edges`);
      return result;
      
    } catch (error) {
      this.tracer.recordError(span, error as Error, 'Code graph construction failed');
      throw error;
    }
  }

  /**
   * Query the code graph
   */
  async queryGraph(
    queryType: 'neighborhood' | 'impact' | 'test-mapping' | 'dependencies' | 'dependents',
    symbolId: string,
    options: GraphTraversalOptions = {}
  ): Promise<any> {
    if (!this.graphAPIs) {
      throw new Error('Code graph not built. Call buildCodeGraph() first.');
    }
    
    switch (queryType) {
      case 'neighborhood':
        return await this.graphAPIs.getNeighborhood(symbolId, options);
      case 'impact':
        return await this.graphAPIs.performImpactAnalysis(symbolId, options);
      case 'test-mapping':
        return await this.graphAPIs.getTestMapping(symbolId, options);
      case 'dependencies':
        return await this.graphAPIs.getDependencies(symbolId, options);
      case 'dependents':
        return await this.graphAPIs.getDependents(symbolId, options);
      default:
        throw new Error(`Unsupported query type: ${queryType}`);
    }
  }

  /**
   * Get graph statistics
   */
  async getGraphStatistics(): Promise<any> {
    if (!this.graphAPIs) {
      throw new Error('Code graph not built. Call buildCodeGraph() first.');
    }
    
    return await this.graphAPIs.getGraphStatistics();
  }

  /**
   * Search symbols in the graph
   */
  async searchSymbols(
    pattern: string,
    options: {
      exactMatch?: boolean;
      caseSensitive?: boolean;
      nodeTypes?: string[];
      maxResults?: number;
    } = {}
  ): Promise<any[]> {
    if (!this.graphAPIs) {
      throw new Error('Code graph not built. Call buildCodeGraph() first.');
    }
    
    return await this.graphAPIs.searchSymbols(pattern, options);
  }

  /**
   * Get graph visualization data
   */
  async getGraphVisualization(
    centerNodeId: string,
    options: GraphTraversalOptions = {}
  ): Promise<any> {
    if (!this.graphAPIs) {
      throw new Error('Code graph not built. Call buildCodeGraph() first.');
    }
    
    return await this.graphAPIs.getGraphVisualization(centerNodeId, options);
  }

  /**
   * Close the graph service
   */
  async close(): Promise<void> {
    if (this.graphStorage) {
      await this.graphStorage.close();
    }
  }

  /**
   * Get the storage path for the graph
   */
  private getStoragePath(projectPath: string, options: CodeGraphOptions): string {
    if (options.storageType === 'sqlite') {
      return path.join(projectPath, '.refactogent', 'graph.db');
    } else if (options.storageType === 'json') {
      return path.join(projectPath, '.refactogent', 'graph.json');
    } else {
      return 'in-memory';
    }
  }

  /**
   * Check if graph exists
   */
  async graphExists(projectPath: string, options: CodeGraphOptions = {}): Promise<boolean> {
    try {
      const storagePath = this.getStoragePath(projectPath, options);
      
      if (options.storageType === 'sqlite') {
        return await fs.access(storagePath).then(() => true).catch(() => false);
      } else if (options.storageType === 'json') {
        return await fs.access(storagePath).then(() => true).catch(() => false);
      } else {
        return false; // In-memory graphs don't persist
      }
    } catch (error) {
      return false;
    }
  }

  /**
   * Load existing graph
   */
  async loadGraph(
    projectPath: string,
    options: CodeGraphOptions = {}
  ): Promise<boolean> {
    try {
      if (!(await this.graphExists(projectPath, options))) {
        return false;
      }
      
      // Initialize storage
      const storageOptions: GraphStorageOptions = {
        storageType: options.storageType || 'sqlite',
        dbPath: options.dbPath,
        maxNodes: options.maxNodes,
        maxEdges: options.maxEdges,
        enableIndexing: options.enableIndexing
      };
      
      this.graphStorage = new GraphStorage(
        this.logger,
        this.metrics,
        this.tracer,
        this.config,
        storageOptions
      );
      
      await this.graphStorage.initialize(projectPath);
      
      // Initialize APIs
      this.graphAPIs = new GraphAPIs(
        this.logger,
        this.metrics,
        this.tracer,
        this.config,
        this.graphStorage
      );
      
      this.logger.info('Graph loaded successfully', { projectPath });
      return true;
    } catch (error) {
      this.logger.warn('Failed to load graph', { error: (error as Error).message });
      return false;
    }
  }
}
