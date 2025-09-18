import fs from 'fs';
import path from 'path';
import { ASTAnalyzer } from './ast-analyzer.js';
import { 
  ProjectAST, 
  ModuleAST, 
  ASTNode, 
  CodeSymbol, 
  SourceLocation,
  ImportDeclaration 
} from './ast-types.js';
import { Logger } from '../utils/logger.js';

export class GoAnalyzer extends ASTAnalyzer {
  constructor(logger: Logger, projectPath: string) {
    super(logger, projectPath);
  }

  async analyzeProject(): Promise<ProjectAST> {
    this.logger.info('Starting Go project analysis', { projectPath: this.projectPath });

    // Get all Go files
    const files = this.getAllGoFiles(this.projectPath);
    const modules: ModuleAST[] = [];

    for (const file of files) {
      try {
        const moduleAST = await this.analyzeFile(file);
        modules.push(moduleAST);
      } catch (error) {
        this.logger.warn('Failed to analyze file', { 
          file, 
          error: error instanceof Error ? error.message : String(error) 
        });
      }
    }

    const dependencies = this.buildDependencyGraph(modules);
    const exports = this.buildExportMap(modules);
    const imports = this.buildImportMap(modules);
    const metrics = this.calculateProjectMetrics(modules);

    return {
      projectPath: this.projectPath,
      language: 'go',
      modules,
      dependencies,
      exports,
      imports,
      metrics
    };
  }

  async analyzeFile(filePath: string): Promise<ModuleAST> {
    const content = fs.readFileSync(filePath, 'utf8');
    const relativePath = path.relative(this.projectPath, filePath);

    // Parse Go file using regex-based approach (simplified)
    const ast = this.parseFileContent(content, filePath);
    const exports = this.extractExports(content);
    const imports = this.extractImports(content, filePath);
    const complexity = this.calculateFileComplexity(content);
    const loc = content.split('\n').length;

    return {
      filePath,
      relativePath,
      ast,
      exports,
      imports,
      complexity,
      loc
    };
  }

  async extractSymbols(filePath: string): Promise<CodeSymbol[]> {
    const content = fs.readFileSync(filePath, 'utf8');
    const symbols: CodeSymbol[] = [];

    // Extract structs
    const structMatches = content.matchAll(/type\s+(\w+)\s+struct\s*{/g);
    for (const match of structMatches) {
      const structName = match[1];
      const line = content.substring(0, match.index).split('\n').length;
      
      symbols.push({
        name: structName,
        fullyQualifiedName: `${filePath}:${structName}`,
        type: 'class', // Treating struct as class
        location: this.createLocation(filePath, line, match[0].length),
        visibility: this.getGoVisibility(structName),
        isExported: this.isGoExported(structName),
        signature: match[0]
      });
    }

    // Extract interfaces
    const interfaceMatches = content.matchAll(/type\s+(\w+)\s+interface\s*{/g);
    for (const match of interfaceMatches) {
      const interfaceName = match[1];
      const line = content.substring(0, match.index).split('\n').length;
      
      symbols.push({
        name: interfaceName,
        fullyQualifiedName: `${filePath}:${interfaceName}`,
        type: 'interface',
        location: this.createLocation(filePath, line, match[0].length),
        visibility: this.getGoVisibility(interfaceName),
        isExported: this.isGoExported(interfaceName),
        signature: match[0]
      });
    }

    // Extract functions
    const functionMatches = content.matchAll(/func\s+(?:\([^)]*\)\s+)?(\w+)\s*\([^)]*\)(?:\s*[^{]*)?{/g);
    for (const match of functionMatches) {
      const functionName = match[1];
      const line = content.substring(0, match.index).split('\n').length;
      
      symbols.push({
        name: functionName,
        fullyQualifiedName: `${filePath}:${functionName}`,
        type: 'function',
        location: this.createLocation(filePath, line, match[0].length),
        visibility: this.getGoVisibility(functionName),
        isExported: this.isGoExported(functionName),
        signature: match[0]
      });
    }

    // Extract methods (functions with receivers)
    const methodMatches = content.matchAll(/func\s+\([^)]*\)\s+(\w+)\s*\([^)]*\)(?:\s*[^{]*)?{/g);
    for (const match of methodMatches) {
      const methodName = match[1];
      const line = content.substring(0, match.index).split('\n').length;
      
      symbols.push({
        name: methodName,
        fullyQualifiedName: `${filePath}:${methodName}`,
        type: 'method',
        location: this.createLocation(filePath, line, match[0].length),
        visibility: this.getGoVisibility(methodName),
        isExported: this.isGoExported(methodName),
        signature: match[0]
      });
    }

    // Extract variables and constants
    const varMatches = content.matchAll(/(?:var|const)\s+(\w+)/g);
    for (const match of varMatches) {
      const varName = match[1];
      const line = content.substring(0, match.index).split('\n').length;
      
      symbols.push({
        name: varName,
        fullyQualifiedName: `${filePath}:${varName}`,
        type: 'variable',
        location: this.createLocation(filePath, line, match[0].length),
        visibility: this.getGoVisibility(varName),
        isExported: this.isGoExported(varName),
        signature: match[0]
      });
    }

    return symbols;
  }

  private parseFileContent(content: string, filePath: string): ASTNode {
    const rootNode: ASTNode = {
      id: this.generateNodeId(filePath, 'module', 1),
      type: 'module',
      name: path.basename(filePath),
      location: this.createLocation(filePath, 1, content.length),
      children: [],
      metadata: {
        language: 'go',
        visibility: 'public',
        isExported: false,
        isAsync: false,
        complexity: 0,
        dependencies: [],
        annotations: []
      }
    };

    // Parse structs
    const structMatches = content.matchAll(/type\s+(\w+)\s+struct\s*{/g);
    for (const match of structMatches) {
      const structName = match[1];
      const line = content.substring(0, match.index).split('\n').length;
      
      const structNode: ASTNode = {
        id: this.generateNodeId(filePath, structName, line),
        type: 'class',
        name: structName,
        location: this.createLocation(filePath, line, match[0].length),
        children: [],
        metadata: {
          language: 'go',
          visibility: this.getGoVisibility(structName),
          isExported: this.isGoExported(structName),
          isAsync: false,
          complexity: 0,
          dependencies: [],
          annotations: []
        }
      };

      rootNode.children.push(structNode);
    }

    // Parse interfaces
    const interfaceMatches = content.matchAll(/type\s+(\w+)\s+interface\s*{/g);
    for (const match of interfaceMatches) {
      const interfaceName = match[1];
      const line = content.substring(0, match.index).split('\n').length;
      
      const interfaceNode: ASTNode = {
        id: this.generateNodeId(filePath, interfaceName, line),
        type: 'interface',
        name: interfaceName,
        location: this.createLocation(filePath, line, match[0].length),
        children: [],
        metadata: {
          language: 'go',
          visibility: this.getGoVisibility(interfaceName),
          isExported: this.isGoExported(interfaceName),
          isAsync: false,
          complexity: 0,
          dependencies: [],
          annotations: []
        }
      };

      rootNode.children.push(interfaceNode);
    }

    // Parse functions
    const functionMatches = content.matchAll(/func\s+(?:\([^)]*\)\s+)?(\w+)\s*\([^)]*\)(?:\s*[^{]*)?{/g);
    for (const match of functionMatches) {
      const functionName = match[1];
      const line = content.substring(0, match.index).split('\n').length;
      
      const functionNode: ASTNode = {
        id: this.generateNodeId(filePath, functionName, line),
        type: 'function',
        name: functionName,
        location: this.createLocation(filePath, line, match[0].length),
        children: [],
        metadata: {
          language: 'go',
          visibility: this.getGoVisibility(functionName),
          isExported: this.isGoExported(functionName),
          isAsync: false,
          complexity: 0,
          dependencies: [],
          annotations: []
        }
      };

      rootNode.children.push(functionNode);
    }

    rootNode.metadata.complexity = this.calculateComplexity(rootNode);
    return rootNode;
  }

  private extractExports(content: string): string[] {
    const exports: string[] = [];

    // In Go, exported symbols start with uppercase letters
    const symbolPatterns = [
      /type\s+([A-Z]\w+)\s+(?:struct|interface)/g,
      /func\s+(?:\([^)]*\)\s+)?([A-Z]\w+)\s*\(/g,
      /(?:var|const)\s+([A-Z]\w+)/g
    ];

    for (const pattern of symbolPatterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        exports.push(match[1]);
      }
    }

    return [...new Set(exports)]; // Remove duplicates
  }

  private extractImports(content: string, filePath: string): ImportDeclaration[] {
    const imports: ImportDeclaration[] = [];

    // Handle single import
    const singleImportMatches = content.matchAll(/import\s+"([^"]+)"/g);
    for (const match of singleImportMatches) {
      const importPath = match[1];
      const line = content.substring(0, match.index).split('\n').length;
      const packageName = importPath.split('/').pop() || importPath;

      imports.push({
        source: importPath,
        imports: [packageName],
        isDefault: false,
        isNamespace: true,
        location: this.createLocation(filePath, line, match[0].length)
      });
    }

    // Handle import block
    const importBlockMatch = content.match(/import\s*\(\s*([\s\S]*?)\s*\)/);
    if (importBlockMatch) {
      const importBlock = importBlockMatch[1];
      const importLines = importBlock.split('\n');
      
      for (const line of importLines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('//')) {
          // Handle aliased imports: alias "path"
          const aliasMatch = trimmed.match(/(\w+)\s+"([^"]+)"/);
          if (aliasMatch) {
            const alias = aliasMatch[1];
            const importPath = aliasMatch[2];
            
            imports.push({
              source: importPath,
              imports: [alias],
              isDefault: false,
              isNamespace: true,
              location: this.createLocation(filePath, 1, trimmed.length) // Approximate location
            });
          } else {
            // Handle regular imports: "path"
            const pathMatch = trimmed.match(/"([^"]+)"/);
            if (pathMatch) {
              const importPath = pathMatch[1];
              const packageName = importPath.split('/').pop() || importPath;
              
              imports.push({
                source: importPath,
                imports: [packageName],
                isDefault: false,
                isNamespace: true,
                location: this.createLocation(filePath, 1, trimmed.length) // Approximate location
              });
            }
          }
        }
      }
    }

    return imports;
  }

  private calculateFileComplexity(content: string): number {
    let complexity = 1; // Base complexity

    // Count control flow statements
    const controlFlowPatterns = [
      /\bif\b/g,
      /\belse\b/g,
      /\bfor\b/g,
      /\bswitch\b/g,
      /\bcase\b/g,
      /\bselect\b/g,
      /\bgo\b/g, // Goroutines add complexity
      /\bdefer\b/g,
      /&&/g,
      /\|\|/g
    ];

    for (const pattern of controlFlowPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        complexity += matches.length;
      }
    }

    return complexity;
  }

  private getAllGoFiles(dirPath: string): string[] {
    const files: string[] = [];
    
    const traverse = (currentPath: string) => {
      const entries = fs.readdirSync(currentPath);
      
      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          // Skip common directories
          if (!['vendor', '.git', 'node_modules'].includes(entry)) {
            traverse(fullPath);
          }
        } else if (entry.endsWith('.go') && !entry.endsWith('_test.go')) {
          files.push(fullPath);
        }
      }
    };

    traverse(dirPath);
    return files;
  }

  private isGoExported(name: string): boolean {
    // In Go, exported identifiers start with uppercase letters
    return name.length > 0 && name[0] >= 'A' && name[0] <= 'Z';
  }

  private getGoVisibility(name: string): 'public' | 'private' | 'protected' | 'internal' {
    return this.isGoExported(name) ? 'public' : 'private';
  }

  private createLocation(file: string, line: number, length: number): SourceLocation {
    return {
      file,
      startLine: line,
      startColumn: 1,
      endLine: line,
      endColumn: length
    };
  }

  private buildExportMap(modules: ModuleAST[]): any {
    const exportMap: any = {};
    for (const module of modules) {
      exportMap[module.relativePath] = module.exports;
    }
    return exportMap;
  }

  private buildImportMap(modules: ModuleAST[]): any {
    const importMap: any = {};
    for (const module of modules) {
      importMap[module.relativePath] = module.imports;
    }
    return importMap;
  }
}