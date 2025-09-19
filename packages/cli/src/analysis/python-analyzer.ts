import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { ASTAnalyzer } from './ast-analyzer.js';
import {
  ProjectAST,
  ModuleAST,
  ASTNode,
  CodeSymbol,
  SourceLocation,
  ImportDeclaration,
} from './ast-types.js';
import { Logger } from '../utils/logger.js';

export class PythonAnalyzer extends ASTAnalyzer {
  constructor(logger: Logger, projectPath: string) {
    super(logger, projectPath);
  }

  async analyzeProject(): Promise<ProjectAST> {
    this.logger.info('Starting Python project analysis', { projectPath: this.projectPath });

    // Get all Python files
    const files = this.getAllPythonFiles(this.projectPath);
    const modules: ModuleAST[] = [];

    for (const file of files) {
      try {
        const moduleAST = await this.analyzeFile(file);
        modules.push(moduleAST);
      } catch (error) {
        this.logger.warn('Failed to analyze file', {
          file,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const dependencies = this.buildDependencyGraph(modules);
    const exports = this.buildExportMap(modules);
    const imports = this.buildImportMap(modules);
    const metrics = this.calculateProjectMetrics(modules);

    return {
      projectPath: this.projectPath,
      language: 'python',
      modules,
      dependencies,
      exports,
      imports,
      metrics,
    };
  }

  async analyzeFile(filePath: string): Promise<ModuleAST> {
    const content = fs.readFileSync(filePath, 'utf8');
    const relativePath = path.relative(this.projectPath, filePath);

    // Parse Python file using regex-based approach (simplified)
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
      loc,
    };
  }

  async extractSymbols(filePath: string): Promise<CodeSymbol[]> {
    const content = fs.readFileSync(filePath, 'utf8');
    const symbols: CodeSymbol[] = [];

    // Extract classes
    const classMatches = content.matchAll(/^class\s+(\w+)(?:\([^)]*\))?:/gm);
    for (const match of classMatches) {
      const className = match[1];
      const line = content.substring(0, match.index).split('\n').length;

      symbols.push({
        name: className,
        fullyQualifiedName: `${filePath}:${className}`,
        type: 'class',
        location: this.createLocation(filePath, line, match[0].length),
        visibility: this.getPythonVisibility(className),
        isExported: !className.startsWith('_'),
        signature: match[0],
        documentation: this.extractDocstring(content, match.index || 0),
      });
    }

    // Extract functions
    const functionMatches = content.matchAll(/^(?:async\s+)?def\s+(\w+)\([^)]*\):/gm);
    for (const match of functionMatches) {
      const functionName = match[1];
      const line = content.substring(0, match.index).split('\n').length;

      symbols.push({
        name: functionName,
        fullyQualifiedName: `${filePath}:${functionName}`,
        type: 'function',
        location: this.createLocation(filePath, line, match[0].length),
        visibility: this.getPythonVisibility(functionName),
        isExported: !functionName.startsWith('_'),
        signature: match[0],
        documentation: this.extractDocstring(content, match.index || 0),
      });
    }

    // Extract variables (simplified - only module-level assignments)
    const variableMatches = content.matchAll(/^(\w+)\s*=/gm);
    for (const match of variableMatches) {
      const variableName = match[1];
      const line = content.substring(0, match.index).split('\n').length;

      // Skip if it's inside a function or class (simplified check)
      const beforeMatch = content.substring(0, match.index || 0);
      const indentLevel = this.getIndentLevel(beforeMatch.split('\n').pop() || '');

      if (indentLevel === 0) {
        // Only module-level variables
        symbols.push({
          name: variableName,
          fullyQualifiedName: `${filePath}:${variableName}`,
          type: 'variable',
          location: this.createLocation(filePath, line, match[0].length),
          visibility: this.getPythonVisibility(variableName),
          isExported: !variableName.startsWith('_'),
          signature: match[0],
        });
      }
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
        language: 'python',
        visibility: 'public',
        isExported: false,
        isAsync: false,
        complexity: 0,
        dependencies: [],
        annotations: [],
      },
    };

    // Parse classes
    const classMatches = content.matchAll(/^class\s+(\w+)(?:\([^)]*\))?:/gm);
    for (const match of classMatches) {
      const className = match[1];
      const line = content.substring(0, match.index).split('\n').length;

      const classNode: ASTNode = {
        id: this.generateNodeId(filePath, className, line),
        type: 'class',
        name: className,
        location: this.createLocation(filePath, line, match[0].length),
        children: [],
        metadata: {
          language: 'python',
          visibility: this.getPythonVisibility(className),
          isExported: !className.startsWith('_'),
          isAsync: false,
          complexity: 0,
          dependencies: [],
          annotations: [],
        },
      };

      rootNode.children.push(classNode);
    }

    // Parse functions
    const functionMatches = content.matchAll(/^(?:async\s+)?def\s+(\w+)\([^)]*\):/gm);
    for (const match of functionMatches) {
      const functionName = match[1];
      const line = content.substring(0, match.index).split('\n').length;
      const isAsync = match[0].startsWith('async');

      const functionNode: ASTNode = {
        id: this.generateNodeId(filePath, functionName, line),
        type: 'function',
        name: functionName,
        location: this.createLocation(filePath, line, match[0].length),
        children: [],
        metadata: {
          language: 'python',
          visibility: this.getPythonVisibility(functionName),
          isExported: !functionName.startsWith('_'),
          isAsync,
          complexity: 0,
          dependencies: [],
          annotations: [],
        },
      };

      rootNode.children.push(functionNode);
    }

    rootNode.metadata.complexity = this.calculateComplexity(rootNode);
    return rootNode;
  }

  private extractExports(content: string): string[] {
    const exports: string[] = [];

    // Check for __all__ definition
    const allMatch = content.match(/__all__\s*=\s*\[(.*?)\]/s);
    if (allMatch) {
      const allContent = allMatch[1];
      const exportMatches = allContent.matchAll(/['"](\w+)['"]/g);
      for (const match of exportMatches) {
        exports.push(match[1]);
      }
      return exports;
    }

    // If no __all__, consider all public symbols as exports
    const classMatches = content.matchAll(/^class\s+(\w+)/gm);
    for (const match of classMatches) {
      if (!match[1].startsWith('_')) {
        exports.push(match[1]);
      }
    }

    const functionMatches = content.matchAll(/^(?:async\s+)?def\s+(\w+)/gm);
    for (const match of functionMatches) {
      if (!match[1].startsWith('_')) {
        exports.push(match[1]);
      }
    }

    const variableMatches = content.matchAll(/^(\w+)\s*=/gm);
    for (const match of variableMatches) {
      if (!match[1].startsWith('_') && match[1].toUpperCase() === match[1]) {
        exports.push(match[1]); // Constants
      }
    }

    return exports;
  }

  private extractImports(content: string, filePath: string): ImportDeclaration[] {
    const imports: ImportDeclaration[] = [];

    // Handle "import module" statements
    const importMatches = content.matchAll(/^import\s+([\w.]+)(?:\s+as\s+(\w+))?/gm);
    for (const match of importMatches) {
      const module = match[1];
      const alias = match[2];
      const line = content.substring(0, match.index).split('\n').length;

      imports.push({
        source: module,
        imports: [alias || module.split('.').pop() || module],
        isDefault: false,
        isNamespace: true,
        location: this.createLocation(filePath, line, match[0].length),
      });
    }

    // Handle "from module import ..." statements
    const fromImportMatches = content.matchAll(/^from\s+([\w.]+)\s+import\s+(.+)/gm);
    for (const match of fromImportMatches) {
      const module = match[1];
      const importList = match[2];
      const line = content.substring(0, match.index).split('\n').length;

      let importNames: string[] = [];

      if (importList.includes('*')) {
        importNames = ['*'];
      } else {
        // Parse individual imports
        const names = importList.split(',').map(name => {
          const trimmed = name.trim();
          const asMatch = trimmed.match(/(\w+)\s+as\s+(\w+)/);
          return asMatch ? asMatch[2] : trimmed;
        });
        importNames = names;
      }

      imports.push({
        source: module,
        imports: importNames,
        isDefault: false,
        isNamespace: importList.includes('*'),
        location: this.createLocation(filePath, line, match[0].length),
      });
    }

    return imports;
  }

  private calculateFileComplexity(content: string): number {
    let complexity = 1; // Base complexity

    // Count control flow statements
    const controlFlowPatterns = [
      /\bif\b/g,
      /\belif\b/g,
      /\belse\b/g,
      /\bwhile\b/g,
      /\bfor\b/g,
      /\btry\b/g,
      /\bexcept\b/g,
      /\bfinally\b/g,
      /\band\b/g,
      /\bor\b/g,
    ];

    for (const pattern of controlFlowPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        complexity += matches.length;
      }
    }

    return complexity;
  }

  private getAllPythonFiles(dirPath: string): string[] {
    const files: string[] = [];

    const traverse = (currentPath: string) => {
      const entries = fs.readdirSync(currentPath);

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          // Skip common directories
          if (!['__pycache__', '.git', 'node_modules', '.venv', 'venv'].includes(entry)) {
            traverse(fullPath);
          }
        } else if (entry.endsWith('.py')) {
          files.push(fullPath);
        }
      }
    };

    traverse(dirPath);
    return files;
  }

  private getPythonVisibility(name: string): 'public' | 'private' | 'protected' | 'internal' {
    if (name.startsWith('__') && name.endsWith('__')) {
      return 'public'; // Magic methods are public
    } else if (name.startsWith('__')) {
      return 'private'; // Name mangling
    } else if (name.startsWith('_')) {
      return 'protected'; // Convention for protected
    }
    return 'public';
  }

  private extractDocstring(content: string, startIndex: number): string | undefined {
    // Look for docstring after the function/class definition
    const afterDef = content.substring(startIndex);
    const lines = afterDef.split('\n');

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('"""') || line.startsWith("'''")) {
        // Found docstring start
        const quote = line.substring(0, 3);
        let docstring = line.substring(3);

        if (line.endsWith(quote) && line.length > 6) {
          // Single line docstring
          return docstring.substring(0, docstring.length - 3);
        } else {
          // Multi-line docstring
          for (let j = i + 1; j < lines.length; j++) {
            if (lines[j].includes(quote)) {
              docstring += '\n' + lines[j].substring(0, lines[j].indexOf(quote));
              return docstring;
            } else {
              docstring += '\n' + lines[j];
            }
          }
        }
      } else if (line && !line.startsWith('#')) {
        // No docstring found
        break;
      }
    }

    return undefined;
  }

  private getIndentLevel(line: string): number {
    let indent = 0;
    for (const char of line) {
      if (char === ' ') {
        indent++;
      } else if (char === '\t') {
        indent += 4; // Assume 4 spaces per tab
      } else {
        break;
      }
    }
    return Math.floor(indent / 4); // Assume 4-space indentation
  }

  private createLocation(file: string, line: number, length: number): SourceLocation {
    return {
      file,
      startLine: line,
      startColumn: 1,
      endLine: line,
      endColumn: length,
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
