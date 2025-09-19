import { Logger } from '../utils/logger.js';
import { ProjectAST, ModuleAST, ASTNode, CodeSymbol } from './ast-types.js';

export abstract class ASTAnalyzer {
  protected logger: Logger;
  protected projectPath: string;

  constructor(logger: Logger, projectPath: string) {
    this.logger = logger;
    this.projectPath = projectPath;
  }

  /**
   * Analyze the entire project and return AST representation
   */
  abstract analyzeProject(): Promise<ProjectAST>;

  /**
   * Analyze a single file and return its AST
   */
  abstract analyzeFile(filePath: string): Promise<ModuleAST>;

  /**
   * Extract symbols from a file
   */
  abstract extractSymbols(filePath: string): Promise<CodeSymbol[]>;

  /**
   * Calculate complexity metrics for a node
   */
  protected calculateComplexity(node: ASTNode): number {
    let complexity = 1; // Base complexity

    // Add complexity for control flow statements
    const complexityNodes = [
      'if', 'else', 'while', 'for', 'switch', 'case', 
      'try', 'catch', 'finally', 'conditional'
    ];

    if (complexityNodes.includes(node.type)) {
      complexity += 1;
    }

    // Add complexity for logical operators
    if (node.type === 'function' || node.type === 'method') {
      complexity += 1;
    }

    // Recursively calculate complexity for children
    for (const child of node.children) {
      complexity += this.calculateComplexity(child);
    }

    return complexity;
  }

  /**
   * Check if a symbol is exported/public
   */
  protected isPublicSymbol(node: ASTNode): boolean {
    return node.metadata.isExported || node.metadata.visibility === 'public';
  }

  /**
   * Generate unique ID for a node
   */
  protected generateNodeId(filePath: string, name: string, line: number): string {
    return `${filePath}:${name}:${line}`;
  }

  /**
   * Get file extension for language detection
   */
  protected getLanguageFromFile(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'ts':
      case 'tsx':
        return 'typescript';
      case 'js':
      case 'jsx':
        return 'javascript';
      case 'py':
        return 'python';
      case 'go':
        return 'go';
      default:
        return 'unknown';
    }
  }

  /**
   * Filter files by language
   */
  protected getFilesForLanguage(files: string[], language: string): string[] {
    const extensions = this.getExtensionsForLanguage(language);
    return files.filter(file => {
      const ext = file.split('.').pop()?.toLowerCase();
      return ext && extensions.includes(ext);
    });
  }

  /**
   * Get file extensions for a language
   */
  private getExtensionsForLanguage(language: string): string[] {
    switch (language) {
      case 'typescript':
        return ['ts', 'tsx'];
      case 'javascript':
        return ['js', 'jsx'];
      case 'python':
        return ['py'];
      case 'go':
        return ['go'];
      default:
        return [];
    }
  }

  /**
   * Build dependency graph from modules
   */
  protected buildDependencyGraph(modules: ModuleAST[]): any {
    const nodes = [];
    const edges = [];

    for (const module of modules) {
      // Add module as a node
      nodes.push({
        id: module.relativePath,
        name: module.relativePath,
        type: 'module',
        filePath: module.filePath
      });

      // Add edges for imports
      for (const importDecl of module.imports) {
        edges.push({
          from: module.relativePath,
          to: importDecl.source,
          type: 'imports',
          weight: importDecl.imports.length
        });
      }
    }

    return { nodes, edges };
  }

  /**
   * Detect circular dependencies
   */
  protected detectCircularDependencies(modules: ModuleAST[]): string[][] {
    const graph = new Map<string, string[]>();
    
    // Build adjacency list
    for (const module of modules) {
      const deps = module.imports.map(imp => imp.source);
      graph.set(module.relativePath, deps);
    }

    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const cycles: string[][] = [];

    const dfs = (node: string, path: string[]): void => {
      if (recursionStack.has(node)) {
        // Found a cycle
        const cycleStart = path.indexOf(node);
        if (cycleStart !== -1) {
          cycles.push(path.slice(cycleStart).concat([node]));
        }
        return;
      }

      if (visited.has(node)) {
        return;
      }

      visited.add(node);
      recursionStack.add(node);

      const neighbors = graph.get(node) || [];
      for (const neighbor of neighbors) {
        dfs(neighbor, [...path, node]);
      }

      recursionStack.delete(node);
    };

    for (const node of graph.keys()) {
      if (!visited.has(node)) {
        dfs(node, []);
      }
    }

    return cycles;
  }

  /**
   * Calculate project-wide metrics
   */
  protected calculateProjectMetrics(modules: ModuleAST[]): any {
    const totalNodes = modules.reduce((sum, mod) => sum + this.countNodes(mod.ast), 0);
    const totalFiles = modules.length;
    const complexities = modules.map(mod => mod.complexity);
    const averageComplexity = complexities.reduce((a, b) => a + b, 0) / complexities.length;
    const maxComplexity = Math.max(...complexities);
    const totalLOC = modules.reduce((sum, mod) => sum + mod.loc, 0);
    const publicAPICount = modules.reduce((sum, mod) => sum + mod.exports.length, 0);
    const circularDependencies = this.detectCircularDependencies(modules);

    return {
      totalNodes,
      totalFiles,
      averageComplexity: Math.round(averageComplexity * 100) / 100,
      maxComplexity,
      totalLOC,
      publicAPICount,
      circularDependencies
    };
  }

  /**
   * Count total nodes in AST
   */
  private countNodes(node: ASTNode): number {
    let count = 1;
    for (const child of node.children) {
      count += this.countNodes(child);
    }
    return count;
  }
}