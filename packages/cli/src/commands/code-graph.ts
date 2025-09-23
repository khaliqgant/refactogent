import { Logger } from '../utils/logger';
import { RefactoGentMetrics } from '../observability/metrics';
import { RefactoGentTracer } from '../observability/tracing';
import { RefactoGentConfig } from '../config/refactogent-schema';
import { CodeGraphService, CodeGraphOptions } from '../graph/code-graph-service.js';
import * as path from 'path';

export interface CodeGraphCommandOptions {
  projectPath: string;
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

/**
 * Code Graph Command
 * 
 * CLI command for building and querying code graphs.
 */
export class CodeGraphCommand {
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
   * Build a code graph
   */
  async buildGraph(options: CodeGraphCommandOptions): Promise<void> {
    const span = this.tracer.startAnalysisTrace(options.projectPath, 'build-graph-command');
    
    try {
      console.log('🕸️ Building Code Graph v1');
      console.log('═'.repeat(60));
      console.log(`📁 Project: ${options.projectPath}`);
      console.log(`💾 Storage: ${options.storageType || 'sqlite'}`);
      console.log(`🔍 Options: ${JSON.stringify(options, null, 2)}`);
      
      const graphOptions: CodeGraphOptions = {
        storageType: options.storageType,
        dbPath: options.dbPath,
        maxNodes: options.maxNodes,
        maxEdges: options.maxEdges,
        enableIndexing: options.enableIndexing,
        includeTests: options.includeTests,
        includeConfigs: options.includeConfigs,
        maxDepth: options.maxDepth,
        verbose: options.verbose
      };
      
      const result = await this.codeGraphService.buildCodeGraph(options.projectPath, graphOptions);
      
      if (result.success) {
        console.log('\n✅ Code graph built successfully!');
        console.log(`📊 Statistics:`);
        console.log(`  🔤 Symbols: ${result.analysis.totalNodes}`);
        console.log(`  🔗 Relationships: ${result.analysis.totalEdges}`);
        console.log(`  📁 Files: ${result.analysis.fileCount}`);
        console.log(`  ⏱️  Time: ${result.processingTime}ms`);
        console.log(`  💾 Storage: ${result.storagePath}`);
        
        if (result.errors.length > 0) {
          console.log(`\n⚠️  Errors: ${result.errors.length}`);
          result.errors.forEach(error => console.log(`  - ${error}`));
        }
        
        if (result.warnings.length > 0) {
          console.log(`\n⚠️  Warnings: ${result.warnings.length}`);
          result.warnings.forEach(warning => console.log(`  - ${warning}`));
        }
      } else {
        console.log('\n❌ Code graph construction failed');
        if (result.errors.length > 0) {
          result.errors.forEach(error => console.log(`  - ${error}`));
        }
        process.exit(1);
      }
      
      this.tracer.recordSuccess(span, 'Code graph command completed');
    } catch (error) {
      this.tracer.recordError(span, error as Error, 'Code graph command failed');
      console.error('❌ Code graph command failed:', error);
      process.exit(1);
    }
  }

  /**
   * Query the code graph
   */
  async queryGraph(
    queryType: 'neighborhood' | 'impact' | 'test-mapping' | 'dependencies' | 'dependents',
    symbolId: string,
    options: CodeGraphCommandOptions
  ): Promise<void> {
    const span = this.tracer.startAnalysisTrace(options.projectPath, 'query-graph-command');
    
    try {
      console.log(`🔍 Querying Code Graph: ${queryType}`);
      console.log('═'.repeat(60));
      console.log(`🎯 Symbol: ${symbolId}`);
      console.log(`📁 Project: ${options.projectPath}`);
      
      // Load existing graph
      const graphOptions: CodeGraphOptions = {
        storageType: options.storageType,
        dbPath: options.dbPath,
        maxNodes: options.maxNodes,
        maxEdges: options.maxEdges,
        enableIndexing: options.enableIndexing,
        includeTests: options.includeTests,
        includeConfigs: options.includeConfigs,
        maxDepth: options.maxDepth,
        verbose: options.verbose
      };
      
      const loaded = await this.codeGraphService.loadGraph(options.projectPath, graphOptions);
      if (!loaded) {
        console.log('❌ No existing graph found. Run `npx refactogent code-graph build` first.');
        process.exit(1);
      }
      
      // Perform query
      const result = await this.codeGraphService.queryGraph(queryType, symbolId, {
        maxDepth: options.maxDepth,
        includeTests: options.includeTests,
        includeConfigs: options.includeConfigs,
        weightThreshold: 0.5,
        nodeTypes: ['function', 'class', 'interface'],
        edgeTypes: ['imports', 'calls', 'inherits', 'tests']
      });
      
      console.log('\n📊 Query Results:');
      console.log('═'.repeat(40));
      
      switch (queryType) {
        case 'neighborhood':
          this.displayNeighborhoodResults(result);
          break;
        case 'impact':
          this.displayImpactResults(result);
          break;
        case 'test-mapping':
          this.displayTestMappingResults(result);
          break;
        case 'dependencies':
          this.displayDependenciesResults(result);
          break;
        case 'dependents':
          this.displayDependentsResults(result);
          break;
      }
      
      this.tracer.recordSuccess(span, `Graph query completed: ${queryType}`);
    } catch (error) {
      this.tracer.recordError(span, error as Error, 'Graph query command failed');
      console.error('❌ Graph query failed:', error);
      process.exit(1);
    }
  }

  /**
   * Get graph statistics
   */
  async getStatistics(options: CodeGraphCommandOptions): Promise<void> {
    const span = this.tracer.startAnalysisTrace(options.projectPath, 'graph-statistics-command');
    
    try {
      console.log('📊 Code Graph Statistics');
      console.log('═'.repeat(60));
      console.log(`📁 Project: ${options.projectPath}`);
      
      // Load existing graph
      const graphOptions: CodeGraphOptions = {
        storageType: options.storageType,
        dbPath: options.dbPath,
        maxNodes: options.maxNodes,
        maxEdges: options.maxEdges,
        enableIndexing: options.enableIndexing,
        includeTests: options.includeTests,
        includeConfigs: options.includeConfigs,
        maxDepth: options.maxDepth,
        verbose: options.verbose
      };
      
      const loaded = await this.codeGraphService.loadGraph(options.projectPath, graphOptions);
      if (!loaded) {
        console.log('❌ No existing graph found. Run `npx refactogent code-graph build` first.');
        process.exit(1);
      }
      
      // Get statistics
      const stats = await this.codeGraphService.getGraphStatistics();
      
      console.log('\n📊 Graph Statistics:');
      console.log('═'.repeat(40));
      console.log(`🔤 Total Nodes: ${stats.totalNodes.toLocaleString()}`);
      console.log(`🔗 Total Edges: ${stats.totalEdges.toLocaleString()}`);
      console.log(`📁 Files: ${stats.fileCount.toLocaleString()}`);
      console.log(`⏱️  Processing Time: ${stats.processingTime}ms`);
      
      if (options.verbose) {
        console.log('\n📊 Language Distribution:');
        Object.entries(stats.languageDistribution).forEach(([lang, count]) => {
          console.log(`  ${lang}: ${(count as number).toLocaleString()} symbols`);
        });
        
        console.log('\n📊 Edge Type Distribution:');
        Object.entries(stats.edgeTypeDistribution).forEach(([type, count]) => {
          console.log(`  ${type}: ${(count as number).toLocaleString()} relationships`);
        });
        
        console.log('\n📊 Complexity Distribution:');
        Object.entries(stats.complexityDistribution).forEach(([level, count]) => {
          console.log(`  ${level}: ${(count as number).toLocaleString()} symbols`);
        });
      }
      
      this.tracer.recordSuccess(span, 'Graph statistics retrieved');
    } catch (error) {
      this.tracer.recordError(span, error as Error, 'Graph statistics command failed');
      console.error('❌ Graph statistics failed:', error);
      process.exit(1);
    }
  }

  /**
   * Search symbols in the graph
   */
  async searchSymbols(
    pattern: string,
    options: CodeGraphCommandOptions & {
      exactMatch?: boolean;
      caseSensitive?: boolean;
      nodeTypes?: string[];
      maxResults?: number;
    }
  ): Promise<void> {
    const span = this.tracer.startAnalysisTrace(options.projectPath, 'search-symbols-command');
    
    try {
      console.log(`🔍 Searching Symbols: "${pattern}"`);
      console.log('═'.repeat(60));
      console.log(`📁 Project: ${options.projectPath}`);
      console.log(`🎯 Pattern: ${pattern}`);
      
      // Load existing graph
      const graphOptions: CodeGraphOptions = {
        storageType: options.storageType,
        dbPath: options.dbPath,
        maxNodes: options.maxNodes,
        maxEdges: options.maxEdges,
        enableIndexing: options.enableIndexing,
        includeTests: options.includeTests,
        includeConfigs: options.includeConfigs,
        maxDepth: options.maxDepth,
        verbose: options.verbose
      };
      
      const loaded = await this.codeGraphService.loadGraph(options.projectPath, graphOptions);
      if (!loaded) {
        console.log('❌ No existing graph found. Run `npx refactogent code-graph build` first.');
        process.exit(1);
      }
      
      // Search symbols
      const results = await this.codeGraphService.searchSymbols(pattern, {
        exactMatch: options.exactMatch,
        caseSensitive: options.caseSensitive,
        nodeTypes: options.nodeTypes,
        maxResults: options.maxResults
      });
      
      console.log('\n📊 Search Results:');
      console.log('═'.repeat(40));
      console.log(`🔍 Found ${results.length} matching symbols`);
      
      if (results.length > 0) {
        results.forEach((symbol, index) => {
          console.log(`\n${index + 1}. ${symbol.name}`);
          console.log(`   Type: ${symbol.type}`);
          console.log(`   File: ${symbol.filePath}`);
          console.log(`   Line: ${symbol.line}`);
          console.log(`   Exported: ${symbol.isExported ? 'Yes' : 'No'}`);
          console.log(`   Complexity: ${symbol.complexity}`);
        });
      } else {
        console.log('No matching symbols found.');
      }
      
      this.tracer.recordSuccess(span, `Symbol search completed: ${results.length} results`);
    } catch (error) {
      this.tracer.recordError(span, error as Error, 'Symbol search command failed');
      console.error('❌ Symbol search failed:', error);
      process.exit(1);
    }
  }

  /**
   * Close the command
   */
  async close(): Promise<void> {
    await this.codeGraphService.close();
  }

  // Display methods for different query types
  private displayNeighborhoodResults(result: any): void {
    console.log(`🔗 Direct Neighbors: ${result.directNeighbors.length}`);
    console.log(`🔗 Indirect Neighbors: ${result.indirectNeighbors.length}`);
    console.log(`📊 Centrality Score: ${result.centralityScore.toFixed(3)}`);
    console.log(`⭐ Importance Score: ${result.importanceScore.toFixed(3)}`);
    
    if (result.directNeighbors.length > 0) {
      console.log('\n🔗 Direct Neighbors:');
      result.directNeighbors.forEach((neighbor: any, index: number) => {
        console.log(`  ${index + 1}. ${neighbor.name} (${neighbor.type})`);
      });
    }
  }

  private displayImpactResults(result: any): void {
    console.log(`📊 Impact Score: ${result.impactScore.toFixed(3)}`);
    console.log(`⚠️  Risk Level: ${result.riskLevel.toUpperCase()}`);
    console.log(`📁 Affected Files: ${result.affectedFiles.length}`);
    console.log(`🔤 Affected Symbols: ${result.affectedSymbols.length}`);
    console.log(`🧪 Test Files: ${result.testFiles.length}`);
    console.log(`⚙️  Config Files: ${result.configFiles.length}`);
    
    if (result.recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      result.recommendations.forEach((rec: string, index: number) => {
        console.log(`  ${index + 1}. ${rec}`);
      });
    }
  }

  private displayTestMappingResults(result: any): void {
    console.log(`📁 Source File: ${result.sourceFile}`);
    console.log(`🧪 Test Files: ${result.testFiles.length}`);
    console.log(`📊 Test Coverage: ${result.testCoverage.toFixed(1)}%`);
    console.log(`⭐ Test Quality: ${result.testQuality.toUpperCase()}`);
    
    if (result.missingTests.length > 0) {
      console.log('\n❌ Missing Tests:');
      result.missingTests.forEach((test: string, index: number) => {
        console.log(`  ${index + 1}. ${test}`);
      });
    }
    
    if (result.testFiles.length > 0) {
      console.log('\n🧪 Test Files:');
      result.testFiles.forEach((testFile: string, index: number) => {
        console.log(`  ${index + 1}. ${testFile}`);
      });
    }
  }

  private displayDependenciesResults(result: any): void {
    console.log(`🔗 Dependencies: ${result.length}`);
    
    if (result.length > 0) {
      console.log('\n🔗 Dependencies:');
      result.forEach((dep: any, index: number) => {
        console.log(`  ${index + 1}. ${dep.name} (${dep.type})`);
        console.log(`     File: ${dep.filePath}`);
        console.log(`     Line: ${dep.line}`);
      });
    }
  }

  private displayDependentsResults(result: any): void {
    console.log(`🔗 Dependents: ${result.length}`);
    
    if (result.length > 0) {
      console.log('\n🔗 Dependents:');
      result.forEach((dep: any, index: number) => {
        console.log(`  ${index + 1}. ${dep.name} (${dep.type})`);
        console.log(`     File: ${dep.filePath}`);
        console.log(`     Line: ${dep.line}`);
      });
    }
  }
}
