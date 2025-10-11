import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
// import * as ts from 'typescript';
import { Project } from 'ts-morph';

/**
 * Represents a file that can be refactored
 */
export interface RefactorableFile {
  path: string;
  relativePath: string;
  language: 'typescript' | 'javascript' | 'python' | 'go' | 'other';
  size: number;
  lastModified: Date;
  symbols: SymbolInfo[];
  dependencies: string[];
  isTestFile: boolean;
  complexity: number;
}

/**
 * Represents a symbol (function, class, interface, etc.) in a file
 */
export interface SymbolInfo {
  name: string;
  type: 'function' | 'class' | 'interface' | 'type' | 'variable' | 'enum' | 'namespace';
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
  isExported: boolean;
  isPrivate: boolean;
  parameters?: string[];
  returnType?: string;
  documentation?: string;
}

/**
 * Configuration for the codebase indexer
 */
export interface IndexerConfig {
  rootPath: string;
  includePatterns: string[];
  excludePatterns: string[];
  maxFileSize: number; // in bytes
  maxFiles: number;
  includeTests: boolean;
  includeNodeModules: boolean;
  languages: string[];
}

/**
 * Default configuration for the indexer
 */
const DEFAULT_CONFIG: IndexerConfig = {
  rootPath: process.cwd(),
  includePatterns: [
    '**/*.ts',
    '**/*.tsx',
    '**/*.js',
    '**/*.jsx',
    '**/*.py',
    '**/*.go',
    '**/*.java',
    '**/*.cpp',
    '**/*.c',
    '**/*.cs',
    '**/*.php',
    '**/*.rb',
    '**/*.rs'
  ],
  excludePatterns: [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.git/**',
    '**/coverage/**',
    '**/.next/**',
    '**/.nuxt/**',
    '**/vendor/**',
    '**/__pycache__/**',
    '**/*.min.js',
    '**/*.bundle.js'
  ],
  maxFileSize: 1024 * 1024, // 1MB
  maxFiles: 10000,
  includeTests: true,
  includeNodeModules: false,
  languages: ['typescript', 'javascript', 'python', 'go']
};

/**
 * Robust codebase indexer that discovers and analyzes files for refactoring
 */
export class CodebaseIndexer {
  private config: IndexerConfig;
  private project?: Project;

  constructor(config: Partial<IndexerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Main method to index the entire codebase
   */
  async indexCodebase(): Promise<RefactorableFile[]> {
    console.log('🔍 Starting codebase indexing...');
    
    const files = await this.discoverFiles();
    console.log(`📁 Discovered ${files.length} files`);
    
    const refactorableFiles: RefactorableFile[] = [];
    
    for (const file of files) {
      try {
        const refactorableFile = await this.analyzeFile(file);
        if (refactorableFile) {
          refactorableFiles.push(refactorableFile);
        }
      } catch (error) {
        console.warn(`⚠️  Failed to analyze ${file}: ${error}`);
      }
    }
    
    console.log(`✅ Successfully indexed ${refactorableFiles.length} refactorable files`);
    return refactorableFiles;
  }

  /**
   * Discover all files in the codebase that match our patterns
   */
  private async discoverFiles(): Promise<string[]> {
    const allFiles: string[] = [];
    
    for (const pattern of this.config.includePatterns) {
      try {
        const files = await glob(pattern, {
          cwd: this.config.rootPath,
          ignore: this.config.excludePatterns,
          absolute: true,
          nodir: true
        });
        allFiles.push(...files);
      } catch (error) {
        console.warn(`⚠️  Failed to process pattern ${pattern}: ${error}`);
      }
    }
    
    // Remove duplicates and filter by size
    const uniqueFiles = [...new Set(allFiles)];
    const filteredFiles = uniqueFiles.filter(file => {
      try {
        const stats = fs.statSync(file);
        return stats.size <= this.config.maxFileSize;
      } catch {
        return false;
      }
    });
    
    // Limit number of files
    return filteredFiles.slice(0, this.config.maxFiles);
  }

  /**
   * Analyze a single file and extract refactoring information
   */
  private async analyzeFile(filePath: string): Promise<RefactorableFile | null> {
    const stats = fs.statSync(filePath);
    const relativePath = path.relative(this.config.rootPath, filePath);
    const language = this.detectLanguage(filePath);
    
    if (!this.config.languages.includes(language)) {
      return null;
    }
    
    const content = fs.readFileSync(filePath, 'utf-8');
    const symbols = await this.extractSymbols(filePath, content, language);
    const dependencies = this.extractDependencies(content, language);
    const isTestFile = this.isTestFile(filePath);
    const complexity = this.calculateComplexity(content, language);
    
    return {
      path: filePath,
      relativePath,
      language: language as any,
      size: stats.size,
      lastModified: stats.mtime,
      symbols,
      dependencies,
      isTestFile,
      complexity
    };
  }

  /**
   * Detect the programming language of a file
   */
  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    
    const languageMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.py': 'python',
      '.go': 'go',
      '.java': 'java',
      '.cpp': 'cpp',
      '.c': 'c',
      '.cs': 'csharp',
      '.php': 'php',
      '.rb': 'ruby',
      '.rs': 'rust'
    };
    
    return languageMap[ext] || 'other';
  }

  /**
   * Extract symbols from a file based on its language
   */
  private async extractSymbols(filePath: string, content: string, language: string): Promise<SymbolInfo[]> {
    switch (language) {
      case 'typescript':
      case 'javascript':
        return this.extractJSSymbols(filePath, content);
      case 'python':
        return this.extractPythonSymbols(content);
      case 'go':
        return this.extractGoSymbols(content);
      default:
        return [];
    }
  }

  /**
   * Extract symbols from JavaScript/TypeScript files using ts-morph
   */
  private async extractJSSymbols(filePath: string, content: string): Promise<SymbolInfo[]> {
    try {
      if (!this.project) {
        this.project = new Project({
          useInMemoryFileSystem: true,
          skipAddingFilesFromTsConfig: true
        });
      }
      
      const sourceFile = this.project.createSourceFile(filePath, content);
      const symbols: SymbolInfo[] = [];
      
      // Extract functions
      sourceFile.getFunctions().forEach(func => {
        symbols.push({
          name: func.getName(),
          type: 'function',
          startLine: func.getStartLineNumber(),
          endLine: func.getEndLineNumber(),
          startColumn: func.getStartLinePos(),
          endColumn: func.getEnd(),
          isExported: func.isExported(),
          isPrivate: func.getName().startsWith('_'),
          parameters: func.getParameters().map(p => p.getName()),
          returnType: func.getReturnTypeNode()?.getText(),
          documentation: func.getJsDocs().map(doc => doc.getDescription()).join('\n')
        });
      });
      
      // Extract classes
      sourceFile.getClasses().forEach(cls => {
        symbols.push({
          name: cls.getName() || 'AnonymousClass',
          type: 'class',
          startLine: cls.getStartLineNumber(),
          endLine: cls.getEndLineNumber(),
          startColumn: cls.getStartLinePos(),
          endColumn: cls.getEnd(),
          isExported: cls.isExported(),
          isPrivate: cls.getName()?.startsWith('_') || false,
          documentation: cls.getJsDocs().map(doc => doc.getDescription()).join('\n')
        });
      });
      
      // Extract interfaces
      sourceFile.getInterfaces().forEach(iface => {
        symbols.push({
          name: iface.getName(),
          type: 'interface',
          startLine: iface.getStartLineNumber(),
          endLine: iface.getEndLineNumber(),
          startColumn: iface.getStartLinePos(),
          endColumn: iface.getEnd(),
          isExported: iface.isExported(),
          isPrivate: iface.getName().startsWith('_'),
          documentation: iface.getJsDocs().map(doc => doc.getDescription()).join('\n')
        });
      });
      
      // Extract type aliases
      sourceFile.getTypeAliases().forEach(type => {
        symbols.push({
          name: type.getName(),
          type: 'type',
          startLine: type.getStartLineNumber(),
          endLine: type.getEndLineNumber(),
          startColumn: type.getStartLinePos(),
          endColumn: type.getEnd(),
          isExported: type.isExported(),
          isPrivate: type.getName().startsWith('_'),
          documentation: type.getJsDocs().map(doc => doc.getDescription()).join('\n')
        });
      });
      
      // Extract variables
      sourceFile.getVariableDeclarations().forEach(variable => {
        const name = variable.getName();
        if (name && !name.startsWith('_')) { // Skip private variables
          symbols.push({
            name,
            type: 'variable',
            startLine: variable.getStartLineNumber(),
            endLine: variable.getEndLineNumber(),
            startColumn: variable.getStartLinePos(),
            endColumn: variable.getEnd(),
            isExported: variable.isExported(),
            isPrivate: false
          });
        }
      });
      
      return symbols;
    } catch (error) {
      console.warn(`⚠️  Failed to parse ${filePath}: ${error}`);
      return [];
    }
  }

  /**
   * Extract symbols from Python files (basic implementation)
   */
  private extractPythonSymbols(content: string): SymbolInfo[] {
    const symbols: SymbolInfo[] = [];
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Function definitions
      const funcMatch = line.match(/^(async\s+)?def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
      if (funcMatch) {
        symbols.push({
          name: funcMatch[2],
          type: 'function',
          startLine: i + 1,
          endLine: i + 1,
          startColumn: 0,
          endColumn: line.length,
          isExported: true,
          isPrivate: funcMatch[2].startsWith('_')
        });
      }
      
      // Class definitions
      const classMatch = line.match(/^class\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
      if (classMatch) {
        symbols.push({
          name: classMatch[1],
          type: 'class',
          startLine: i + 1,
          endLine: i + 1,
          startColumn: 0,
          endColumn: line.length,
          isExported: true,
          isPrivate: classMatch[1].startsWith('_')
        });
      }
    }
    
    return symbols;
  }

  /**
   * Extract symbols from Go files (basic implementation)
   */
  private extractGoSymbols(content: string): SymbolInfo[] {
    const symbols: SymbolInfo[] = [];
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Function definitions
      const funcMatch = line.match(/^func\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
      if (funcMatch) {
        symbols.push({
          name: funcMatch[1],
          type: 'function',
          startLine: i + 1,
          endLine: i + 1,
          startColumn: 0,
          endColumn: line.length,
          isExported: funcMatch[1][0] >= 'A' && funcMatch[1][0] <= 'Z',
          isPrivate: funcMatch[1][0] >= 'a' && funcMatch[1][0] <= 'z'
        });
      }
      
      // Type definitions
      const typeMatch = line.match(/^type\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
      if (typeMatch) {
        symbols.push({
          name: typeMatch[1],
          type: 'type',
          startLine: i + 1,
          endLine: i + 1,
          startColumn: 0,
          endColumn: line.length,
          isExported: typeMatch[1][0] >= 'A' && typeMatch[1][0] <= 'Z',
          isPrivate: typeMatch[1][0] >= 'a' && typeMatch[1][0] <= 'z'
        });
      }
    }
    
    return symbols;
  }

  /**
   * Extract dependencies from file content
   */
  private extractDependencies(content: string, language: string): string[] {
    const dependencies: string[] = [];
    let match: RegExpExecArray | null;
    
    switch (language) {
      case 'typescript':
      case 'javascript': {
        // Extract import statements
        const importRegex = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
        while ((match = importRegex.exec(content)) !== null) {
          dependencies.push(match[1]);
        }
        break;
      }

      case 'python': {
        // Extract import statements
        const pythonImportRegex = /^\s*(?:from\s+([^\s]+)\s+)?import\s+([^\s,]+)/gm;
        while ((match = pythonImportRegex.exec(content)) !== null) {
          if (match[1]) {
            dependencies.push(match[1]);
          } else {
            dependencies.push(match[2]);
          }
        }
        break;
      }

      case 'go': {
        // Extract import statements
        // Handle both single line: import "fmt"
        // and multiline: import ( "fmt" "strings" )
        const goImportRegex = /['"]([^'"]+)['"]/g;
        const importSection = content.match(/import\s*\([\s\S]*?\)|import\s+['"][^'"]+['"]/g);
        if (importSection) {
          importSection.forEach(section => {
            let importMatch: RegExpExecArray | null;
            while ((importMatch = goImportRegex.exec(section)) !== null) {
              dependencies.push(importMatch[1]);
            }
          });
        }
        break;
      }
    }
    
    return dependencies;
  }

  /**
   * Check if a file is a test file
   */
  private isTestFile(filePath: string): boolean {
    const fileName = path.basename(filePath).toLowerCase();
    const dirName = path.dirname(filePath).toLowerCase();
    
    return fileName.includes('test') || 
           fileName.includes('spec') || 
           dirName.includes('test') || 
           dirName.includes('spec') ||
           fileName.endsWith('.test.ts') ||
           fileName.endsWith('.test.js') ||
           fileName.endsWith('.spec.ts') ||
           fileName.endsWith('.spec.js');
  }

  /**
   * Calculate basic complexity metrics for a file
   */
  private calculateComplexity(content: string, _language: string): number {
    let complexity = 0;
    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Count control flow statements
      if (trimmed.includes('if') || trimmed.includes('else') || 
          trimmed.includes('for') || trimmed.includes('while') ||
          trimmed.includes('switch') || trimmed.includes('case') ||
          trimmed.includes('catch') || trimmed.includes('try')) {
        complexity++;
      }
      
      // Count function definitions
      if (trimmed.includes('function') || trimmed.includes('=>') ||
          trimmed.includes('def ') || trimmed.includes('func ')) {
        complexity++;
      }
    }
    
    return complexity;
  }

  /**
   * Get statistics about the indexed codebase
   */
  getIndexingStats(files: RefactorableFile[]): {
    totalFiles: number;
    totalSymbols: number;
    languageBreakdown: Record<string, number>;
    testFiles: number;
    averageComplexity: number;
    totalSize: number;
  } {
    const languageBreakdown: Record<string, number> = {};
    let totalSymbols = 0;
    let testFiles = 0;
    let totalComplexity = 0;
    let totalSize = 0;
    
    for (const file of files) {
      languageBreakdown[file.language] = (languageBreakdown[file.language] || 0) + 1;
      totalSymbols += file.symbols.length;
      totalComplexity += file.complexity;
      totalSize += file.size;
      
      if (file.isTestFile) {
        testFiles++;
      }
    }
    
    return {
      totalFiles: files.length,
      totalSymbols,
      languageBreakdown,
      testFiles,
      averageComplexity: files.length > 0 ? totalComplexity / files.length : 0,
      totalSize
    };
  }
}
