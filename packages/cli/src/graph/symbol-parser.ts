import { Logger } from '../utils/logger';
import { RefactoGentMetrics } from '../observability/metrics';
import { RefactoGentTracer } from '../observability/tracing';
import { RefactoGentConfig } from '../config/refactogent-schema';
import {
  Project,
  SourceFile,
  Node,
  ImportDeclaration,
  CallExpression,
  ClassDeclaration,
  InterfaceDeclaration,
  FunctionDeclaration,
} from 'ts-morph';
import * as path from 'path';
import * as fs from 'fs/promises';

export interface SymbolNode {
  id: string;
  name: string;
  type: 'function' | 'class' | 'interface' | 'variable' | 'import' | 'export';
  filePath: string;
  line: number;
  column: number;
  isExported: boolean;
  signature?: string;
  complexity: number;
  dependencies: string[];
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: 'imports' | 'calls' | 'inherits' | 'tests' | 'touches-config' | 'references';
  weight: number;
  metadata: Record<string, any>;
}

export interface CodeGraph {
  nodes: Map<string, SymbolNode>;
  edges: Map<string, GraphEdge>;
  fileIndex: Map<string, string[]>; // filePath -> symbolIds
  symbolIndex: Map<string, string[]>; // symbolName -> symbolIds
}

export interface GraphAnalysis {
  totalNodes: number;
  totalEdges: number;
  fileCount: number;
  languageDistribution: Record<string, number>;
  edgeTypeDistribution: Record<string, number>;
  complexityDistribution: Record<string, number>;
  processingTime: number;
}

/**
 * Symbol Parser for Code Graph Construction
 *
 * Parses symbols, dependencies, and relationships across multiple languages
 * to build a comprehensive code graph for precise retrieval.
 */
export class SymbolParser {
  private logger: Logger;
  private metrics: RefactoGentMetrics;
  private tracer: RefactoGentTracer;
  private config: RefactoGentConfig;
  private project: Project;

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
    this.project = new Project();
  }

  /**
   * Parse symbols from a project and build the code graph
   */
  async parseProject(
    projectPath: string,
    options: {
      includeTests?: boolean;
      includeConfigs?: boolean;
      maxDepth?: number;
      verbose?: boolean;
    } = {}
  ): Promise<CodeGraph> {
    const span = this.tracer.startAnalysisTrace(projectPath, 'symbol-parser');

    try {
      this.logger.info('Starting symbol parsing', { projectPath, options });

      const startTime = Date.now();
      const nodes = new Map<string, SymbolNode>();
      const edges = new Map<string, GraphEdge>();
      const fileIndex = new Map<string, string[]>();
      const symbolIndex = new Map<string, string[]>();

      // Find all source files
      const sourceFiles = await this.findSourceFiles(projectPath, options);
      this.logger.info(`Found ${sourceFiles.length} source files to parse`);

      // Parse each file
      for (const filePath of sourceFiles) {
        try {
          const fileSymbols = await this.parseFile(filePath, projectPath);

          // Add symbols to graph
          for (const symbol of fileSymbols) {
            nodes.set(symbol.id, symbol);

            // Update file index
            if (!fileIndex.has(symbol.filePath)) {
              fileIndex.set(symbol.filePath, []);
            }
            fileIndex.get(symbol.filePath)!.push(symbol.id);

            // Update symbol index
            if (!symbolIndex.has(symbol.name)) {
              symbolIndex.set(symbol.name, []);
            }
            symbolIndex.get(symbol.name)!.push(symbol.id);
          }

          if (options.verbose) {
            this.logger.debug(`Parsed ${filePath}`, {
              symbols: fileSymbols.length,
              types: fileSymbols.map(s => s.type),
            });
          }
        } catch (error) {
          this.logger.warn(`Failed to parse ${filePath}`, {
            error: (error as Error).message,
          });
        }
      }

      // Build edges between symbols
      await this.buildEdges(nodes, edges, projectPath);

      const processingTime = Date.now() - startTime;

      const graph: CodeGraph = {
        nodes,
        edges,
        fileIndex,
        symbolIndex,
      };

      this.logger.info('Symbol parsing complete', {
        totalNodes: nodes.size,
        totalEdges: edges.size,
        totalFiles: sourceFiles.length,
        processingTime,
      });

      this.tracer.recordSuccess(span, `Parsed ${nodes.size} symbols with ${edges.size} edges`);
      return graph;
    } catch (error) {
      this.tracer.recordError(span, error as Error, 'Symbol parsing failed');
      throw error;
    }
  }

  /**
   * Parse a single file for symbols
   */
  private async parseFile(filePath: string, projectPath: string): Promise<SymbolNode[]> {
    const symbols: SymbolNode[] = [];

    try {
      const sourceFile = this.project.addSourceFileAtPath(filePath);
      const relativePath = path.relative(projectPath, filePath);

      // Parse functions
      for (const func of sourceFile.getFunctions()) {
        const symbol = await this.createSymbolNode(func, relativePath, 'function');
        if (symbol) symbols.push(symbol);
      }

      // Parse classes
      for (const cls of sourceFile.getClasses()) {
        const symbol = await this.createSymbolNode(cls, relativePath, 'class');
        if (symbol) symbols.push(symbol);
      }

      // Parse interfaces
      for (const iface of sourceFile.getInterfaces()) {
        const symbol = await this.createSymbolNode(iface, relativePath, 'interface');
        if (symbol) symbols.push(symbol);
      }

      // Parse imports
      for (const imp of sourceFile.getImportDeclarations()) {
        const symbol = await this.createImportSymbol(imp, relativePath);
        if (symbol) symbols.push(symbol);
      }

      // Parse exports
      for (const exp of sourceFile.getExportDeclarations()) {
        const symbol = await this.createExportSymbol(exp, relativePath);
        if (symbol) symbols.push(symbol);
      }
    } catch (error) {
      this.logger.warn(`Failed to parse file ${filePath}`, {
        error: (error as Error).message,
      });
    }

    return symbols;
  }

  /**
   * Create a symbol node from an AST node
   */
  private async createSymbolNode(
    node: Node,
    filePath: string,
    type: SymbolNode['type']
  ): Promise<SymbolNode | null> {
    try {
      const name = this.getNodeName(node);
      if (!name) return null;

      const id = this.generateSymbolId(filePath, name, type);
      const line = node.getStartLineNumber();
      const column = node.getStartLinePos();
      const isExported = this.isExported(node);
      const signature = this.getSignature(node);
      const complexity = this.calculateComplexity(node);
      const dependencies = this.extractDependencies(node);

      return {
        id,
        name,
        type,
        filePath,
        line,
        column,
        isExported,
        signature,
        complexity,
        dependencies,
      };
    } catch (error) {
      this.logger.warn(`Failed to create symbol node`, {
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * Create an import symbol
   */
  private async createImportSymbol(
    importDecl: ImportDeclaration,
    filePath: string
  ): Promise<SymbolNode | null> {
    try {
      const moduleSpecifier = importDecl.getModuleSpecifierValue();
      const namedImports = importDecl.getNamedImports();

      if (namedImports.length === 0) return null;

      const name = namedImports.map(ni => ni.getName()).join(', ');
      const id = this.generateSymbolId(filePath, `import:${name}`, 'import');

      return {
        id,
        name: `import ${name} from '${moduleSpecifier}'`,
        type: 'import',
        filePath,
        line: importDecl.getStartLineNumber(),
        column: importDecl.getStartLinePos(),
        isExported: false,
        signature: `import { ${name} } from '${moduleSpecifier}'`,
        complexity: 1,
        dependencies: [moduleSpecifier],
      };
    } catch (error) {
      this.logger.warn(`Failed to create import symbol`, {
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * Create an export symbol
   */
  private async createExportSymbol(exportDecl: any, filePath: string): Promise<SymbolNode | null> {
    try {
      const name = this.getNodeName(exportDecl);
      if (!name) return null;

      const id = this.generateSymbolId(filePath, `export:${name}`, 'export');

      return {
        id,
        name: `export ${name}`,
        type: 'export',
        filePath,
        line: exportDecl.getStartLineNumber(),
        column: exportDecl.getStartLinePos(),
        isExported: true,
        signature: `export ${name}`,
        complexity: 1,
        dependencies: [],
      };
    } catch (error) {
      this.logger.warn(`Failed to create export symbol`, {
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * Build edges between symbols
   */
  private async buildEdges(
    nodes: Map<string, SymbolNode>,
    edges: Map<string, GraphEdge>,
    projectPath: string
  ): Promise<void> {
    this.logger.info('Building symbol edges', { nodeCount: nodes.size });

    // Build import edges
    await this.buildImportEdges(nodes, edges);

    // Build call edges
    await this.buildCallEdges(nodes, edges);

    // Build inheritance edges
    await this.buildInheritanceEdges(nodes, edges);

    // Build test edges
    await this.buildTestEdges(nodes, edges, projectPath);

    // Build config edges
    await this.buildConfigEdges(nodes, edges, projectPath);
  }

  /**
   * Build import edges between symbols
   */
  private async buildImportEdges(
    nodes: Map<string, SymbolNode>,
    edges: Map<string, GraphEdge>
  ): Promise<void> {
    for (const [nodeId, node] of nodes) {
      if (node.type === 'import') {
        for (const dep of node.dependencies) {
          // Find symbols that match the dependency
          for (const [targetId, targetNode] of nodes) {
            if (targetNode.name.includes(dep) || targetNode.filePath.includes(dep)) {
              const edgeId = `${nodeId}->${targetId}`;
              edges.set(edgeId, {
                id: edgeId,
                source: nodeId,
                target: targetId,
                type: 'imports',
                weight: 1.0,
                metadata: { dependency: dep },
              });
            }
          }
        }
      }
    }
  }

  /**
   * Build call edges between symbols
   */
  private async buildCallEdges(
    nodes: Map<string, SymbolNode>,
    edges: Map<string, GraphEdge>
  ): Promise<void> {
    // This would require more sophisticated AST analysis
    // For now, we'll create a simplified version
    for (const [nodeId, node] of nodes) {
      if (node.type === 'function') {
        // Look for function calls in the signature
        const calls = this.extractFunctionCalls(node.signature || '');
        for (const call of calls) {
          for (const [targetId, targetNode] of nodes) {
            if (targetNode.name === call && targetNode.type === 'function') {
              const edgeId = `${nodeId}->${targetId}`;
              edges.set(edgeId, {
                id: edgeId,
                source: nodeId,
                target: targetId,
                type: 'calls',
                weight: 0.8,
                metadata: { call: call },
              });
            }
          }
        }
      }
    }
  }

  /**
   * Build inheritance edges
   */
  private async buildInheritanceEdges(
    nodes: Map<string, SymbolNode>,
    edges: Map<string, GraphEdge>
  ): Promise<void> {
    for (const [nodeId, node] of nodes) {
      if (node.type === 'class') {
        // Look for extends/implements in signature
        const inheritance = this.extractInheritance(node.signature || '');
        for (const parent of inheritance) {
          for (const [targetId, targetNode] of nodes) {
            if (
              targetNode.name === parent &&
              (targetNode.type === 'class' || targetNode.type === 'interface')
            ) {
              const edgeId = `${nodeId}->${targetId}`;
              edges.set(edgeId, {
                id: edgeId,
                source: nodeId,
                target: targetId,
                type: 'inherits',
                weight: 0.9,
                metadata: { parent: parent },
              });
            }
          }
        }
      }
    }
  }

  /**
   * Build test edges
   */
  private async buildTestEdges(
    nodes: Map<string, SymbolNode>,
    edges: Map<string, GraphEdge>,
    projectPath: string
  ): Promise<void> {
    // Find test files and map them to source files
    const testFiles = await this.findTestFiles(projectPath);

    for (const testFile of testFiles) {
      const testSymbols = nodes.get(testFile);
      if (testSymbols) {
        // Map test symbols to source symbols
        for (const [nodeId, node] of nodes) {
          if (this.isTestFile(node.filePath)) {
            const sourceFile = this.findSourceFileForTest(node.filePath);
            if (sourceFile) {
              for (const [targetId, targetNode] of nodes) {
                if (targetNode.filePath === sourceFile) {
                  const edgeId = `${nodeId}->${targetId}`;
                  edges.set(edgeId, {
                    id: edgeId,
                    source: nodeId,
                    target: targetId,
                    type: 'tests',
                    weight: 0.7,
                    metadata: { testFile: node.filePath },
                  });
                }
              }
            }
          }
        }
      }
    }
  }

  /**
   * Build config edges
   */
  private async buildConfigEdges(
    nodes: Map<string, SymbolNode>,
    edges: Map<string, GraphEdge>,
    projectPath: string
  ): Promise<void> {
    // Find config files and map them to source files
    const configFiles = await this.findConfigFiles(projectPath);

    for (const configFile of configFiles) {
      for (const [nodeId, node] of nodes) {
        if (node.filePath === configFile) {
          // Find source files that might use this config
          for (const [targetId, targetNode] of nodes) {
            if (this.usesConfig(targetNode, configFile)) {
              const edgeId = `${nodeId}->${targetId}`;
              edges.set(edgeId, {
                id: edgeId,
                source: nodeId,
                target: targetId,
                type: 'touches-config',
                weight: 0.5,
                metadata: { configFile: configFile },
              });
            }
          }
        }
      }
    }
  }

  /**
   * Analyze the code graph and return statistics
   */
  async analyzeGraph(graph: CodeGraph): Promise<GraphAnalysis> {
    const startTime = Date.now();

    const totalNodes = graph.nodes.size;
    const totalEdges = graph.edges.size;
    const fileCount = graph.fileIndex.size;

    // Language distribution
    const languageDistribution: Record<string, number> = {};
    for (const node of graph.nodes.values()) {
      const ext = path.extname(node.filePath);
      languageDistribution[ext] = (languageDistribution[ext] || 0) + 1;
    }

    // Edge type distribution
    const edgeTypeDistribution: Record<string, number> = {};
    for (const edge of graph.edges.values()) {
      edgeTypeDistribution[edge.type] = (edgeTypeDistribution[edge.type] || 0) + 1;
    }

    // Complexity distribution
    const complexityDistribution: Record<string, number> = {};
    for (const node of graph.nodes.values()) {
      const level = this.getComplexityLevel(node.complexity);
      complexityDistribution[level] = (complexityDistribution[level] || 0) + 1;
    }

    const processingTime = Date.now() - startTime;

    return {
      totalNodes,
      totalEdges,
      fileCount,
      languageDistribution,
      edgeTypeDistribution,
      complexityDistribution,
      processingTime,
    };
  }

  // Helper methods
  private async findSourceFiles(projectPath: string, options: any): Promise<string[]> {
    const files: string[] = [];

    const scanDir = async (dir: string) => {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory()) {
            if (
              !entry.name.startsWith('.') &&
              entry.name !== 'node_modules' &&
              entry.name !== 'dist'
            ) {
              await scanDir(fullPath);
            }
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
              if (options.includeTests || !this.isTestFile(fullPath)) {
                files.push(fullPath);
              }
            }
          }
        }
      } catch (error) {
        this.logger.warn(
          `Could not access ${dir}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    };

    await scanDir(projectPath);
    return files;
  }

  private getNodeName(node: Node): string | null {
    if ('getName' in node && typeof node.getName === 'function') {
      return node.getName() || null;
    }
    return null;
  }

  private isExported(node: Node): boolean {
    if ('isExported' in node && typeof node.isExported === 'function') {
      return node.isExported();
    }
    return false;
  }

  private getSignature(node: Node): string {
    if ('getText' in node && typeof node.getText === 'function') {
      return node.getText().substring(0, 100); // Limit signature length
    }
    return '';
  }

  private calculateComplexity(node: Node): number {
    // Simplified complexity calculation
    let complexity = 1;
    if ('getChildren' in node && typeof node.getChildren === 'function') {
      const children = node.getChildren();
      complexity += children.length * 0.1;
    }
    return Math.max(1, Math.floor(complexity));
  }

  private extractDependencies(node: Node): string[] {
    const dependencies: string[] = [];
    if ('getText' in node && typeof node.getText === 'function') {
      const text = node.getText();
      const importRegex = /import\s+.*\s+from\s+['"]([^'"]+)['"]/g;
      let match;
      while ((match = importRegex.exec(text)) !== null) {
        dependencies.push(match[1]);
      }
    }
    return dependencies;
  }

  private extractFunctionCalls(signature: string): string[] {
    const calls: string[] = [];
    const callRegex = /\b(\w+)\s*\(/g;
    let match;
    while ((match = callRegex.exec(signature)) !== null) {
      calls.push(match[1]);
    }
    return calls;
  }

  private extractInheritance(signature: string): string[] {
    const inheritance: string[] = [];
    const extendsRegex = /extends\s+(\w+)/g;
    const implementsRegex = /implements\s+(\w+)/g;

    let match;
    while ((match = extendsRegex.exec(signature)) !== null) {
      inheritance.push(match[1]);
    }
    while ((match = implementsRegex.exec(signature)) !== null) {
      inheritance.push(match[1]);
    }

    return inheritance;
  }

  private isTestFile(filePath: string): boolean {
    const testPatterns = [/\.test\./, /\.spec\./, /test\//, /tests\//, /__tests__\//];
    return testPatterns.some(pattern => pattern.test(filePath));
  }

  private async findTestFiles(projectPath: string): Promise<string[]> {
    // Implementation would scan for test files
    return [];
  }

  private async findConfigFiles(projectPath: string): Promise<string[]> {
    // Implementation would scan for config files
    return [];
  }

  private findSourceFileForTest(testFile: string): string | null {
    // Implementation would map test file to source file
    return null;
  }

  private usesConfig(node: SymbolNode, configFile: string): boolean {
    // Implementation would check if node uses config
    return false;
  }

  private getComplexityLevel(complexity: number): string {
    if (complexity <= 3) return 'low';
    if (complexity <= 7) return 'medium';
    return 'high';
  }

  private generateSymbolId(filePath: string, name: string, type: string): string {
    const hash = this.hashString(`${filePath}:${name}:${type}`);
    return `${type}:${hash}`;
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }
}
