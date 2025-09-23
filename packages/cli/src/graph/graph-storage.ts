import { Logger } from '../utils/logger';
import { RefactoGentMetrics } from '../observability/metrics';
import { RefactoGentTracer } from '../observability/tracing';
import { RefactoGentConfig } from '../config/refactogent-schema';
import { SymbolNode, GraphEdge, CodeGraph, GraphAnalysis } from './symbol-parser.js';
import * as path from 'path';
import * as fs from 'fs/promises';
// import * as sqlite3 from 'sqlite3'; // Optional dependency

export interface GraphQuery {
  type: 'neighborhood' | 'impact' | 'test-mapping' | 'dependencies' | 'dependents';
  source: string;
  maxDepth?: number;
  includeTests?: boolean;
  includeConfigs?: boolean;
}

export interface GraphQueryResult {
  nodes: SymbolNode[];
  edges: GraphEdge[];
  paths: string[][];
  impactScore: number;
  testFiles: string[];
  configFiles: string[];
}

export interface GraphStorageOptions {
  storageType: 'sqlite' | 'memory' | 'json';
  dbPath?: string;
  maxNodes?: number;
  maxEdges?: number;
  enableIndexing?: boolean;
}

/**
 * Graph Storage for Code Graph
 * 
 * Provides persistent storage and querying capabilities for the code graph.
 * Supports SQLite for production and in-memory for development.
 */
export class GraphStorage {
  private logger: Logger;
  private metrics: RefactoGentMetrics;
  private tracer: RefactoGentTracer;
  private config: RefactoGentConfig;
  private options: GraphStorageOptions;
  private db: any = null;
  private inMemoryGraph: CodeGraph | null = null;

  constructor(
    logger: Logger,
    metrics: RefactoGentMetrics,
    tracer: RefactoGentTracer,
    config: RefactoGentConfig,
    options: GraphStorageOptions = { storageType: 'sqlite' }
  ) {
    this.logger = logger;
    this.metrics = metrics;
    this.tracer = tracer;
    this.config = config;
    this.options = options;
  }

  /**
   * Initialize the graph storage
   */
  async initialize(projectPath: string): Promise<void> {
    const span = this.tracer.startAnalysisTrace(projectPath, 'graph-storage-init');
    
    try {
      this.logger.info('Initializing graph storage', { 
        storageType: this.options.storageType,
        projectPath 
      });
      
      if (this.options.storageType === 'sqlite') {
        await this.initializeSQLite(projectPath);
      } else if (this.options.storageType === 'memory') {
        await this.initializeMemory();
      } else if (this.options.storageType === 'json') {
        await this.initializeJSON(projectPath);
      }
      
      this.tracer.recordSuccess(span, 'Graph storage initialized');
    } catch (error) {
      this.tracer.recordError(span, error as Error, 'Graph storage initialization failed');
      throw error;
    }
  }

  /**
   * Store a code graph
   */
  async storeGraph(graph: CodeGraph, projectPath: string): Promise<void> {
    const span = this.tracer.startAnalysisTrace(projectPath, 'store-graph');
    
    try {
      this.logger.info('Storing code graph', { 
        nodes: graph.nodes.size,
        edges: graph.edges.size,
        files: graph.fileIndex.size
      });
      
      if (this.options.storageType === 'sqlite') {
        await this.storeGraphSQLite(graph);
      } else if (this.options.storageType === 'memory') {
        await this.storeGraphMemory(graph);
      } else if (this.options.storageType === 'json') {
        await this.storeGraphJSON(graph, projectPath);
      }
      
      this.tracer.recordSuccess(span, `Stored graph with ${graph.nodes.size} nodes and ${graph.edges.size} edges`);
    } catch (error) {
      this.tracer.recordError(span, error as Error, 'Graph storage failed');
      throw error;
    }
  }

  /**
   * Query the graph
   */
  async queryGraph(query: GraphQuery): Promise<GraphQueryResult> {
    const span = this.tracer.startAnalysisTrace('.', 'graph-query');
    
    try {
      this.logger.info('Querying graph', { query });
      
      let result: GraphQueryResult;
      
      if (this.options.storageType === 'sqlite') {
        result = await this.queryGraphSQLite(query);
      } else if (this.options.storageType === 'memory') {
        result = await this.queryGraphMemory(query);
      } else if (this.options.storageType === 'json') {
        result = await this.queryGraphJSON(query);
      } else {
        throw new Error(`Unsupported storage type: ${this.options.storageType}`);
      }
      
      this.tracer.recordSuccess(span, `Query returned ${result.nodes.length} nodes and ${result.edges.length} edges`);
      return result;
    } catch (error) {
      this.tracer.recordError(span, error as Error, 'Graph query failed');
      throw error;
    }
  }

  /**
   * Get graph statistics
   */
  async getGraphStats(): Promise<GraphAnalysis> {
    const span = this.tracer.startAnalysisTrace('.', 'graph-stats');
    
    try {
      let analysis: GraphAnalysis;
      
      if (this.options.storageType === 'sqlite') {
        analysis = await this.getGraphStatsSQLite();
      } else if (this.options.storageType === 'memory') {
        analysis = await this.getGraphStatsMemory();
      } else if (this.options.storageType === 'json') {
        analysis = await this.getGraphStatsJSON();
      } else {
        throw new Error(`Unsupported storage type: ${this.options.storageType}`);
      }
      
      this.tracer.recordSuccess(span, `Graph stats: ${analysis.totalNodes} nodes, ${analysis.totalEdges} edges`);
      return analysis;
    } catch (error) {
      this.tracer.recordError(span, error as Error, 'Graph stats failed');
      throw error;
    }
  }

  /**
   * Close the storage connection
   */
  async close(): Promise<void> {
    if (this.db) {
      await new Promise<void>((resolve, reject) => {
        this.db!.close((err: any) => {
          if (err) reject(err);
          else resolve();
        });
      });
      this.db = null;
    }
  }

  // SQLite Implementation
  private async initializeSQLite(projectPath: string): Promise<void> {
    const dbPath = this.options.dbPath || path.join(projectPath, '.refactogent', 'graph.db');
    await fs.mkdir(path.dirname(dbPath), { recursive: true });
    
    try {
      // Use eval to avoid TypeScript compilation issues with optional dependencies
      const sqlite3 = eval('require')('sqlite3');
      this.db = new sqlite3.Database(dbPath);
      
      // Create tables
      await this.createTables();
      
      this.logger.info('SQLite graph storage initialized', { dbPath });
    } catch (error) {
      this.logger.warn('SQLite not available, falling back to JSON storage', { error: (error as Error).message });
      this.options.storageType = 'json';
      await this.initializeJSON(projectPath);
    }
  }

  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    const createNodesTable = `
      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        file_path TEXT NOT NULL,
        line INTEGER NOT NULL,
        column INTEGER NOT NULL,
        is_exported BOOLEAN NOT NULL,
        signature TEXT,
        complexity INTEGER NOT NULL,
        dependencies TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
    
    const createEdgesTable = `
      CREATE TABLE IF NOT EXISTS edges (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        target TEXT NOT NULL,
        type TEXT NOT NULL,
        weight REAL NOT NULL,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (source) REFERENCES nodes(id),
        FOREIGN KEY (target) REFERENCES nodes(id)
      )
    `;
    
    const createFileIndexTable = `
      CREATE TABLE IF NOT EXISTS file_index (
        file_path TEXT PRIMARY KEY,
        symbol_ids TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
    
    const createSymbolIndexTable = `
      CREATE TABLE IF NOT EXISTS symbol_index (
        symbol_name TEXT PRIMARY KEY,
        symbol_ids TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
    
    await this.runQuery(createNodesTable);
    await this.runQuery(createEdgesTable);
    await this.runQuery(createFileIndexTable);
    await this.runQuery(createSymbolIndexTable);
    
    // Create indexes
    if (this.options.enableIndexing) {
      await this.createIndexes();
    }
  }

  private async createIndexes(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type)',
      'CREATE INDEX IF NOT EXISTS idx_nodes_file_path ON nodes(file_path)',
      'CREATE INDEX IF NOT EXISTS idx_nodes_name ON nodes(name)',
      'CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source)',
      'CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target)',
      'CREATE INDEX IF NOT EXISTS idx_edges_type ON edges(type)',
      'CREATE INDEX IF NOT EXISTS idx_file_index_file_path ON file_index(file_path)',
      'CREATE INDEX IF NOT EXISTS idx_symbol_index_symbol_name ON symbol_index(symbol_name)'
    ];
    
    for (const index of indexes) {
      await this.runQuery(index);
    }
  }

  private async storeGraphSQLite(graph: CodeGraph): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    // Clear existing data
    await this.runQuery('DELETE FROM edges');
    await this.runQuery('DELETE FROM nodes');
    await this.runQuery('DELETE FROM file_index');
    await this.runQuery('DELETE FROM symbol_index');
    
    // Store nodes
    for (const node of graph.nodes.values()) {
      await this.runQuery(`
        INSERT INTO nodes (id, name, type, file_path, line, column, is_exported, signature, complexity, dependencies)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        node.id,
        node.name,
        node.type,
        node.filePath,
        node.line,
        node.column,
        node.isExported ? 1 : 0,
        node.signature || '',
        node.complexity,
        JSON.stringify(node.dependencies)
      ]);
    }
    
    // Store edges
    for (const edge of graph.edges.values()) {
      await this.runQuery(`
        INSERT INTO edges (id, source, target, type, weight, metadata)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [
        edge.id,
        edge.source,
        edge.target,
        edge.type,
        edge.weight,
        JSON.stringify(edge.metadata)
      ]);
    }
    
    // Store file index
    for (const [filePath, symbolIds] of graph.fileIndex) {
      await this.runQuery(`
        INSERT INTO file_index (file_path, symbol_ids)
        VALUES (?, ?)
      `, [filePath, JSON.stringify(symbolIds)]);
    }
    
    // Store symbol index
    for (const [symbolName, symbolIds] of graph.symbolIndex) {
      await this.runQuery(`
        INSERT INTO symbol_index (symbol_name, symbol_ids)
        VALUES (?, ?)
      `, [symbolName, JSON.stringify(symbolIds)]);
    }
  }

  private async queryGraphSQLite(query: GraphQuery): Promise<GraphQueryResult> {
    if (!this.db) throw new Error('Database not initialized');
    
    const nodes: SymbolNode[] = [];
    const edges: GraphEdge[] = [];
    const paths: string[][] = [];
    
    switch (query.type) {
      case 'neighborhood':
        return await this.queryNeighborhoodSQLite(query);
      case 'impact':
        return await this.queryImpactSQLite(query);
      case 'test-mapping':
        return await this.queryTestMappingSQLite(query);
      case 'dependencies':
        return await this.queryDependenciesSQLite(query);
      case 'dependents':
        return await this.queryDependentsSQLite(query);
      default:
        throw new Error(`Unsupported query type: ${query.type}`);
    }
  }

  private async queryNeighborhoodSQLite(query: GraphQuery): Promise<GraphQueryResult> {
    if (!this.db) throw new Error('Database not initialized');
    
    // Get the source node
    const sourceNode = await this.getNodeById(query.source);
    if (!sourceNode) {
      return { nodes: [], edges: [], paths: [], impactScore: 0, testFiles: [], configFiles: [] };
    }
    
    // Get connected nodes within maxDepth
    const maxDepth = query.maxDepth || 2;
    const connectedNodes = await this.getConnectedNodes(query.source, maxDepth);
    const connectedEdges = await this.getConnectedEdges(query.source, maxDepth);
    
    return {
      nodes: connectedNodes,
      edges: connectedEdges,
      paths: [],
      impactScore: this.calculateImpactScore(connectedNodes, connectedEdges),
      testFiles: [],
      configFiles: []
    };
  }

  private async queryImpactSQLite(query: GraphQuery): Promise<GraphQueryResult> {
    if (!this.db) throw new Error('Database not initialized');
    
    // Get all nodes that would be affected by changes to the source
    const affectedNodes = await this.getAffectedNodes(query.source, query.maxDepth || 3);
    const affectedEdges = await this.getAffectedEdges(query.source, query.maxDepth || 3);
    
    return {
      nodes: affectedNodes,
      edges: affectedEdges,
      paths: [],
      impactScore: this.calculateImpactScore(affectedNodes, affectedEdges),
      testFiles: [],
      configFiles: []
    };
  }

  private async queryTestMappingSQLite(query: GraphQuery): Promise<GraphQueryResult> {
    if (!this.db) throw new Error('Database not initialized');
    
    // Find test files related to the source
    const testFiles = await this.getTestFiles(query.source);
    const testNodes = await this.getTestNodes(testFiles);
    const testEdges = await this.getTestEdges(query.source, testFiles);
    
    return {
      nodes: testNodes,
      edges: testEdges,
      paths: [],
      impactScore: 0,
      testFiles,
      configFiles: []
    };
  }

  private async queryDependenciesSQLite(query: GraphQuery): Promise<GraphQueryResult> {
    if (!this.db) throw new Error('Database not initialized');
    
    // Get all dependencies of the source
    const dependencies = await this.getDependencies(query.source, query.maxDepth || 5);
    const dependencyEdges = await this.getDependencyEdges(query.source, query.maxDepth || 5);
    
    return {
      nodes: dependencies,
      edges: dependencyEdges,
      paths: [],
      impactScore: 0,
      testFiles: [],
      configFiles: []
    };
  }

  private async queryDependentsSQLite(query: GraphQuery): Promise<GraphQueryResult> {
    if (!this.db) throw new Error('Database not initialized');
    
    // Get all dependents of the source
    const dependents = await this.getDependents(query.source, query.maxDepth || 5);
    const dependentEdges = await this.getDependentEdges(query.source, query.maxDepth || 5);
    
    return {
      nodes: dependents,
      edges: dependentEdges,
      paths: [],
      impactScore: 0,
      testFiles: [],
      configFiles: []
    };
  }

  // Memory Implementation
  private async initializeMemory(): Promise<void> {
    this.inMemoryGraph = {
      nodes: new Map(),
      edges: new Map(),
      fileIndex: new Map(),
      symbolIndex: new Map()
    };
    
    this.logger.info('In-memory graph storage initialized');
  }

  private async storeGraphMemory(graph: CodeGraph): Promise<void> {
    this.inMemoryGraph = graph;
    this.logger.info('Graph stored in memory', { 
      nodes: graph.nodes.size,
      edges: graph.edges.size
    });
  }

  private async queryGraphMemory(query: GraphQuery): Promise<GraphQueryResult> {
    if (!this.inMemoryGraph) {
      throw new Error('No graph in memory');
    }
    
    // Implementation would query the in-memory graph
    return {
      nodes: [],
      edges: [],
      paths: [],
      impactScore: 0,
      testFiles: [],
      configFiles: []
    };
  }

  private async getGraphStatsMemory(): Promise<GraphAnalysis> {
    if (!this.inMemoryGraph) {
      throw new Error('No graph in memory');
    }
    
    return {
      totalNodes: this.inMemoryGraph.nodes.size,
      totalEdges: this.inMemoryGraph.edges.size,
      fileCount: this.inMemoryGraph.fileIndex.size,
      languageDistribution: {},
      edgeTypeDistribution: {},
      complexityDistribution: {},
      processingTime: 0
    };
  }

  // JSON Implementation
  private async initializeJSON(projectPath: string): Promise<void> {
    const jsonPath = path.join(projectPath, '.refactogent', 'graph.json');
    await fs.mkdir(path.dirname(jsonPath), { recursive: true });
    
    this.logger.info('JSON graph storage initialized', { jsonPath });
  }

  private async storeGraphJSON(graph: CodeGraph, projectPath: string): Promise<void> {
    const jsonPath = path.join(projectPath, '.refactogent', 'graph.json');
    
    const graphData = {
      nodes: Array.from(graph.nodes.entries()),
      edges: Array.from(graph.edges.entries()),
      fileIndex: Array.from(graph.fileIndex.entries()),
      symbolIndex: Array.from(graph.symbolIndex.entries())
    };
    
    await fs.writeFile(jsonPath, JSON.stringify(graphData, null, 2));
    this.logger.info('Graph stored as JSON', { jsonPath });
  }

  private async queryGraphJSON(query: GraphQuery): Promise<GraphQueryResult> {
    // Implementation would load and query JSON graph
    return {
      nodes: [],
      edges: [],
      paths: [],
      impactScore: 0,
      testFiles: [],
      configFiles: []
    };
  }

  private async getGraphStatsSQLite(): Promise<GraphAnalysis> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    
    return new Promise((resolve, reject) => {
      this.db.get('SELECT COUNT(*) as nodeCount FROM nodes', (err: any, row: any) => {
        if (err) {
          reject(err);
          return;
        }
        
        const totalNodes = row.nodeCount || 0;
        
        this.db.get('SELECT COUNT(*) as edgeCount FROM edges', (err: any, row: any) => {
          if (err) {
            reject(err);
            return;
          }
          
          const totalEdges = row.edgeCount || 0;
          
          resolve({
            totalNodes,
            totalEdges,
            fileCount: 0,
            languageDistribution: {},
            edgeTypeDistribution: {},
            complexityDistribution: {},
            processingTime: 0
          });
        });
      });
    });
  }

  private async getGraphStatsJSON(): Promise<GraphAnalysis> {
    return {
      totalNodes: 0,
      totalEdges: 0,
      fileCount: 0,
      languageDistribution: {},
      edgeTypeDistribution: {},
      complexityDistribution: {},
      processingTime: 0
    };
  }

  // Helper methods
  private async runQuery(sql: string, params: any[] = []): Promise<any> {
    if (!this.db) throw new Error('Database not initialized');
    
    return new Promise((resolve, reject) => {
      this.db!.run(sql, params, (err: any, result: any) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  }

  private async getNodeById(id: string): Promise<SymbolNode | null> {
    if (!this.db) return null;
    
    return new Promise((resolve, reject) => {
      this.db!.get('SELECT * FROM nodes WHERE id = ?', [id], (err: any, row: any) => {
        if (err) reject(err);
        else if (row) {
          resolve({
            id: row.id,
            name: row.name,
            type: row.type,
            filePath: row.file_path,
            line: row.line,
            column: row.column,
            isExported: !!row.is_exported,
            signature: row.signature,
            complexity: row.complexity,
            dependencies: JSON.parse(row.dependencies || '[]')
          });
        } else {
          resolve(null);
        }
      });
    });
  }

  private async getConnectedNodes(sourceId: string, maxDepth: number): Promise<SymbolNode[]> {
    // Implementation would traverse the graph to find connected nodes
    return [];
  }

  private async getConnectedEdges(sourceId: string, maxDepth: number): Promise<GraphEdge[]> {
    // Implementation would traverse the graph to find connected edges
    return [];
  }

  private async getAffectedNodes(sourceId: string, maxDepth: number): Promise<SymbolNode[]> {
    // Implementation would find all nodes affected by changes to source
    return [];
  }

  private async getAffectedEdges(sourceId: string, maxDepth: number): Promise<GraphEdge[]> {
    // Implementation would find all edges affected by changes to source
    return [];
  }

  private async getTestFiles(sourceId: string): Promise<string[]> {
    // Implementation would find test files related to source
    return [];
  }

  private async getTestNodes(testFiles: string[]): Promise<SymbolNode[]> {
    // Implementation would get nodes from test files
    return [];
  }

  private async getTestEdges(sourceId: string, testFiles: string[]): Promise<GraphEdge[]> {
    // Implementation would get edges between source and tests
    return [];
  }

  private async getDependencies(sourceId: string, maxDepth: number): Promise<SymbolNode[]> {
    // Implementation would find all dependencies of source
    return [];
  }

  private async getDependencyEdges(sourceId: string, maxDepth: number): Promise<GraphEdge[]> {
    // Implementation would find all dependency edges
    return [];
  }

  private async getDependents(sourceId: string, maxDepth: number): Promise<SymbolNode[]> {
    // Implementation would find all dependents of source
    return [];
  }

  private async getDependentEdges(sourceId: string, maxDepth: number): Promise<GraphEdge[]> {
    // Implementation would find all dependent edges
    return [];
  }

  private calculateImpactScore(nodes: SymbolNode[], edges: GraphEdge[]): number {
    // Calculate impact score based on nodes and edges
    let score = 0;
    score += nodes.length * 0.1;
    score += edges.length * 0.05;
    return Math.min(1.0, score);
  }
}
