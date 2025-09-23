import { Logger } from '../utils/logger.js';
import { RefactoGentConfig } from '../config/refactogent-schema.js';
import { RefactoGentMetrics } from '../observability/metrics.js';
import { RefactoGentTracer } from '../observability/tracing.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Project, SourceFile, Node, SyntaxKind } from 'ts-morph';

export interface CodeChunk {
  id: string;
  filePath: string;
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
  content: string;
  type:
    | 'function'
    | 'class'
    | 'interface'
    | 'type'
    | 'import'
    | 'comment'
    | 'config'
    | 'test'
    | 'doc';
  language:
    | 'typescript'
    | 'javascript'
    | 'python'
    | 'go'
    | 'java'
    | 'rust'
    | 'markdown'
    | 'json'
    | 'yaml';
  complexity: number;
  dependencies: string[];
  symbols: {
    defined: string[];
    referenced: string[];
  };
  metadata: {
    isExported: boolean;
    isAsync: boolean;
    isTest: boolean;
    isConfig: boolean;
    isDocumentation: boolean;
    size: number;
    hash: string;
  };
}

export interface ChunkingResult {
  chunks: CodeChunk[];
  totalFiles: number;
  totalChunks: number;
  languageDistribution: Record<string, number>;
  complexityDistribution: Record<string, number>;
  processingTime: number;
}

export class LanguageChunker {
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
    this.project = new Project({
      useInMemoryFileSystem: false,
      compilerOptions: {
        target: 99, // Latest
        module: 99, // ESNext
        strict: false,
        allowJs: true,
        checkJs: false,
      },
    });
  }

  /**
   * Chunk a project with language-aware boundaries
   */
  async chunkProject(
    projectPath: string,
    options: {
      maxChunkSize?: number;
      includeTests?: boolean;
      includeDocs?: boolean;
      includeConfigs?: boolean;
      verbose?: boolean;
    } = {}
  ): Promise<ChunkingResult> {
    const span = this.tracer.startAnalysisTrace(projectPath, 'language-chunker');

    try {
      this.logger.info('Starting language-aware chunking', { projectPath, options });

      const startTime = Date.now();
      const chunks: CodeChunk[] = [];
      const languageDistribution: Record<string, number> = {};
      const complexityDistribution: Record<string, number> = {};

      // Find all source files
      const sourceFiles = await this.findSourceFiles(projectPath, options);
      this.logger.info(`Found ${sourceFiles.length} source files to chunk`);

      // Process each file
      for (const filePath of sourceFiles) {
        try {
          const fileChunks = await this.chunkFile(filePath, projectPath, options);
          chunks.push(...fileChunks);

          // Update distributions
          for (const chunk of fileChunks) {
            languageDistribution[chunk.language] = (languageDistribution[chunk.language] || 0) + 1;
            const complexityLevel = this.getComplexityLevel(chunk.complexity);
            complexityDistribution[complexityLevel] =
              (complexityDistribution[complexityLevel] || 0) + 1;
          }

          if (options.verbose) {
            this.logger.debug(`Chunked ${filePath}`, {
              chunks: fileChunks.length,
              types: fileChunks.map(c => c.type),
            });
          }
        } catch (error) {
          this.logger.warn(`Failed to chunk file ${filePath}`, { error: (error as Error).message });
        }
      }

      const processingTime = Date.now() - startTime;

      const result: ChunkingResult = {
        chunks,
        totalFiles: sourceFiles.length,
        totalChunks: chunks.length,
        languageDistribution,
        complexityDistribution,
        processingTime,
      };

      this.logger.info('Language-aware chunking complete', {
        totalChunks: chunks.length,
        totalFiles: sourceFiles.length,
        processingTime,
        languageDistribution,
        complexityDistribution,
      });

      this.tracer.recordSuccess(
        span,
        `Chunked ${chunks.length} chunks from ${sourceFiles.length} files`
      );
      return result;
    } catch (error) {
      this.tracer.recordError(span, error as Error, 'Language-aware chunking failed');
      throw error;
    }
  }

  /**
   * Chunk a single file with AST-guided boundaries
   */
  private async chunkFile(
    filePath: string,
    projectPath: string,
    options: any
  ): Promise<CodeChunk[]> {
    const chunks: CodeChunk[] = [];
    const language = this.detectLanguage(filePath);

    if (language === 'typescript' || language === 'javascript') {
      return await this.chunkTypeScriptFile(filePath, projectPath, options);
    } else if (language === 'python') {
      return await this.chunkPythonFile(filePath, projectPath, options);
    } else if (language === 'markdown') {
      return await this.chunkMarkdownFile(filePath, projectPath, options);
    } else if (language === 'json' || language === 'yaml') {
      return await this.chunkConfigFile(filePath, projectPath, options);
    }

    return chunks;
  }

  /**
   * Chunk TypeScript/JavaScript files using AST
   */
  private async chunkTypeScriptFile(
    filePath: string,
    projectPath: string,
    options: any
  ): Promise<CodeChunk[]> {
    const chunks: CodeChunk[] = [];

    try {
      const sourceFile = this.project.addSourceFileAtPath(filePath);
      const content = sourceFile.getFullText();
      const lines = content.split('\n');

      // Chunk functions
      for (const func of sourceFile.getFunctions()) {
        const chunk = await this.createFunctionChunk(func, filePath, projectPath, content, lines);
        if (chunk) chunks.push(chunk);
      }

      // Chunk classes
      for (const cls of sourceFile.getClasses()) {
        const chunk = await this.createClassChunk(cls, filePath, projectPath, content, lines);
        if (chunk) chunks.push(chunk);
      }

      // Chunk interfaces
      for (const iface of sourceFile.getInterfaces()) {
        const chunk = await this.createInterfaceChunk(iface, filePath, projectPath, content, lines);
        if (chunk) chunks.push(chunk);
      }

      // Chunk type aliases
      for (const typeAlias of sourceFile.getTypeAliases()) {
        const chunk = await this.createTypeChunk(typeAlias, filePath, projectPath, content, lines);
        if (chunk) chunks.push(chunk);
      }

      // Chunk imports as a single chunk
      const importChunk = await this.createImportChunk(
        sourceFile,
        filePath,
        projectPath,
        content,
        lines
      );
      if (importChunk) chunks.push(importChunk);
    } catch (error) {
      this.logger.warn(`Failed to parse TypeScript file ${filePath}`, {
        error: (error as Error).message,
      });
    }

    return chunks;
  }

  /**
   * Chunk Python files
   */
  private async chunkPythonFile(
    filePath: string,
    projectPath: string,
    options: any
  ): Promise<CodeChunk[]> {
    const chunks: CodeChunk[] = [];

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      // Simple Python chunking based on function/class definitions
      let currentChunk: { start: number; end: number; type: string; name: string } | null = null;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Function definition
        if (line.match(/^def\s+\w+/)) {
          if (currentChunk) {
            chunks.push(
              await this.createPythonChunk(currentChunk, filePath, projectPath, content, lines)
            );
          }
          const match = line.match(/^def\s+(\w+)/);
          currentChunk = {
            start: i,
            end: i,
            type: 'function',
            name: match ? match[1] : 'unknown',
          };
        }
        // Class definition
        else if (line.match(/^class\s+\w+/)) {
          if (currentChunk) {
            chunks.push(
              await this.createPythonChunk(currentChunk, filePath, projectPath, content, lines)
            );
          }
          const match = line.match(/^class\s+(\w+)/);
          currentChunk = {
            start: i,
            end: i,
            type: 'class',
            name: match ? match[1] : 'unknown',
          };
        }
        // End of current chunk (empty line or new definition)
        else if (currentChunk && (line.trim() === '' || line.match(/^(def|class)\s+\w+/))) {
          currentChunk.end = i - 1;
          chunks.push(
            await this.createPythonChunk(currentChunk, filePath, projectPath, content, lines)
          );
          currentChunk = null;
        }
      }

      // Handle last chunk
      if (currentChunk) {
        currentChunk.end = lines.length - 1;
        chunks.push(
          await this.createPythonChunk(currentChunk, filePath, projectPath, content, lines)
        );
      }
    } catch (error) {
      this.logger.warn(`Failed to parse Python file ${filePath}`, {
        error: (error as Error).message,
      });
    }

    return chunks;
  }

  /**
   * Chunk Markdown files
   */
  private async chunkMarkdownFile(
    filePath: string,
    projectPath: string,
    options: any
  ): Promise<CodeChunk[]> {
    const chunks: CodeChunk[] = [];

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      // Chunk by sections (headers)
      let currentSection: { start: number; end: number; title: string } | null = null;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.match(/^#+\s+/)) {
          if (currentSection) {
            currentSection.end = i - 1;
            chunks.push(
              await this.createMarkdownChunk(currentSection, filePath, projectPath, content, lines)
            );
          }
          currentSection = {
            start: i,
            end: i,
            title: line.replace(/^#+\s+/, '').trim(),
          };
        }
      }

      // Handle last section
      if (currentSection) {
        currentSection.end = lines.length - 1;
        chunks.push(
          await this.createMarkdownChunk(currentSection, filePath, projectPath, content, lines)
        );
      }
    } catch (error) {
      this.logger.warn(`Failed to parse Markdown file ${filePath}`, {
        error: (error as Error).message,
      });
    }

    return chunks;
  }

  /**
   * Chunk configuration files
   */
  private async chunkConfigFile(
    filePath: string,
    projectPath: string,
    options: any
  ): Promise<CodeChunk[]> {
    const chunks: CodeChunk[] = [];

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      const language = this.detectLanguage(filePath);
      if (!language) {
        return chunks; // Skip files with unknown language
      }

      // Configuration files are typically chunked as a single unit
      const chunk: CodeChunk = {
        id: this.generateChunkId(filePath, 0),
        filePath: path.relative(projectPath, filePath),
        startLine: 1,
        endLine: lines.length,
        startColumn: 1,
        endColumn: lines[lines.length - 1]?.length || 1,
        content,
        type: 'config',
        language,
        complexity: 1,
        dependencies: [],
        symbols: {
          defined: [],
          referenced: [],
        },
        metadata: {
          isExported: false,
          isAsync: false,
          isTest: false,
          isConfig: true,
          isDocumentation: false,
          size: content.length,
          hash: this.hashContent(content),
        },
      };

      chunks.push(chunk);
    } catch (error) {
      this.logger.warn(`Failed to parse config file ${filePath}`, {
        error: (error as Error).message,
      });
    }

    return chunks;
  }

  /**
   * Create a function chunk from TypeScript AST
   */
  private async createFunctionChunk(
    func: any,
    filePath: string,
    projectPath: string,
    content: string,
    lines: string[]
  ): Promise<CodeChunk | null> {
    try {
      const startLine = func.getStartLineNumber();
      const endLine = func.getEndLineNumber();
      const startColumn = func.getStartLinePos();
      const endColumn = func.getEndLinePos();

      const chunkContent = lines.slice(startLine - 1, endLine).join('\n');
      const name = func.getName() || 'anonymous';
      const isAsync = func.isAsync();
      const isExported = func.isExported();

      // Calculate complexity (simplified)
      const complexity = this.calculateComplexity(chunkContent);

      // Extract dependencies
      const dependencies = this.extractDependencies(chunkContent);

      // Extract symbols
      const symbols = this.extractSymbols(chunkContent);

      return {
        id: this.generateChunkId(filePath, startLine),
        filePath: path.relative(projectPath, filePath),
        startLine,
        endLine,
        startColumn,
        endColumn,
        content: chunkContent,
        type: 'function',
        language: 'typescript',
        complexity,
        dependencies,
        symbols,
        metadata: {
          isExported,
          isAsync,
          isTest: this.isTestFunction(name),
          isConfig: false,
          isDocumentation: false,
          size: chunkContent.length,
          hash: this.hashContent(chunkContent),
        },
      };
    } catch (error) {
      this.logger.warn(`Failed to create function chunk`, { error: (error as Error).message });
      return null;
    }
  }

  /**
   * Create a class chunk from TypeScript AST
   */
  private async createClassChunk(
    cls: any,
    filePath: string,
    projectPath: string,
    content: string,
    lines: string[]
  ): Promise<CodeChunk | null> {
    try {
      const startLine = cls.getStartLineNumber();
      const endLine = cls.getEndLineNumber();
      const startColumn = cls.getStartLinePos();
      const endColumn = cls.getEndLinePos();

      const chunkContent = lines.slice(startLine - 1, endLine).join('\n');
      const name = cls.getName() || 'anonymous';
      const isExported = cls.isExported();

      const complexity = this.calculateComplexity(chunkContent);
      const dependencies = this.extractDependencies(chunkContent);
      const symbols = this.extractSymbols(chunkContent);

      return {
        id: this.generateChunkId(filePath, startLine),
        filePath: path.relative(projectPath, filePath),
        startLine,
        endLine,
        startColumn,
        endColumn,
        content: chunkContent,
        type: 'class',
        language: 'typescript',
        complexity,
        dependencies,
        symbols,
        metadata: {
          isExported,
          isAsync: false,
          isTest: this.isTestClass(name),
          isConfig: false,
          isDocumentation: false,
          size: chunkContent.length,
          hash: this.hashContent(chunkContent),
        },
      };
    } catch (error) {
      this.logger.warn(`Failed to create class chunk`, { error: (error as Error).message });
      return null;
    }
  }

  /**
   * Create an interface chunk from TypeScript AST
   */
  private async createInterfaceChunk(
    iface: any,
    filePath: string,
    projectPath: string,
    content: string,
    lines: string[]
  ): Promise<CodeChunk | null> {
    try {
      const startLine = iface.getStartLineNumber();
      const endLine = iface.getEndLineNumber();
      const startColumn = iface.getStartLinePos();
      const endColumn = iface.getEndLinePos();

      const chunkContent = lines.slice(startLine - 1, endLine).join('\n');
      const name = iface.getName() || 'anonymous';
      const isExported = iface.isExported();

      const complexity = this.calculateComplexity(chunkContent);
      const dependencies = this.extractDependencies(chunkContent);
      const symbols = this.extractSymbols(chunkContent);

      return {
        id: this.generateChunkId(filePath, startLine),
        filePath: path.relative(projectPath, filePath),
        startLine,
        endLine,
        startColumn,
        endColumn,
        content: chunkContent,
        type: 'interface',
        language: 'typescript',
        complexity,
        dependencies,
        symbols,
        metadata: {
          isExported,
          isAsync: false,
          isTest: false,
          isConfig: false,
          isDocumentation: false,
          size: chunkContent.length,
          hash: this.hashContent(chunkContent),
        },
      };
    } catch (error) {
      this.logger.warn(`Failed to create interface chunk`, { error: (error as Error).message });
      return null;
    }
  }

  /**
   * Create a type chunk from TypeScript AST
   */
  private async createTypeChunk(
    typeAlias: any,
    filePath: string,
    projectPath: string,
    content: string,
    lines: string[]
  ): Promise<CodeChunk | null> {
    try {
      const startLine = typeAlias.getStartLineNumber();
      const endLine = typeAlias.getEndLineNumber();
      const startColumn = typeAlias.getStartLinePos();
      const endColumn = typeAlias.getEndLinePos();

      const chunkContent = lines.slice(startLine - 1, endLine).join('\n');
      const name = typeAlias.getName() || 'anonymous';
      const isExported = typeAlias.isExported();

      const complexity = this.calculateComplexity(chunkContent);
      const dependencies = this.extractDependencies(chunkContent);
      const symbols = this.extractSymbols(chunkContent);

      return {
        id: this.generateChunkId(filePath, startLine),
        filePath: path.relative(projectPath, filePath),
        startLine,
        endLine,
        startColumn,
        endColumn,
        content: chunkContent,
        type: 'type',
        language: 'typescript',
        complexity,
        dependencies,
        symbols,
        metadata: {
          isExported,
          isAsync: false,
          isTest: false,
          isConfig: false,
          isDocumentation: false,
          size: chunkContent.length,
          hash: this.hashContent(chunkContent),
        },
      };
    } catch (error) {
      this.logger.warn(`Failed to create type chunk`, { error: (error as Error).message });
      return null;
    }
  }

  /**
   * Create an import chunk from TypeScript AST
   */
  private async createImportChunk(
    sourceFile: SourceFile,
    filePath: string,
    projectPath: string,
    content: string,
    lines: string[]
  ): Promise<CodeChunk | null> {
    try {
      const imports = sourceFile.getImportDeclarations();
      if (imports.length === 0) return null;

      const firstImport = imports[0];
      const lastImport = imports[imports.length - 1];

      const startLine = firstImport.getStartLineNumber();
      const endLine = lastImport.getEndLineNumber();
      const startColumn = firstImport.getStartLinePos();
      const endColumn = lastImport.getEndLineNumber();

      const chunkContent = lines.slice(startLine - 1, endLine).join('\n');

      const dependencies = imports.map(imp => imp.getModuleSpecifierValue());
      const symbols = {
        defined: [],
        referenced: imports.flatMap(imp => imp.getNamedImports().map(named => named.getName())),
      };

      return {
        id: this.generateChunkId(filePath, startLine),
        filePath: path.relative(projectPath, filePath),
        startLine,
        endLine,
        startColumn,
        endColumn,
        content: chunkContent,
        type: 'import',
        language: 'typescript',
        complexity: 1,
        dependencies,
        symbols,
        metadata: {
          isExported: false,
          isAsync: false,
          isTest: false,
          isConfig: false,
          isDocumentation: false,
          size: chunkContent.length,
          hash: this.hashContent(chunkContent),
        },
      };
    } catch (error) {
      this.logger.warn(`Failed to create import chunk`, { error: (error as Error).message });
      return null;
    }
  }

  /**
   * Create a Python chunk
   */
  private async createPythonChunk(
    chunkInfo: any,
    filePath: string,
    projectPath: string,
    content: string,
    lines: string[]
  ): Promise<CodeChunk> {
    const chunkContent = lines.slice(chunkInfo.start, chunkInfo.end + 1).join('\n');
    const complexity = this.calculateComplexity(chunkContent);
    const dependencies = this.extractDependencies(chunkContent);
    const symbols = this.extractSymbols(chunkContent);

    return {
      id: this.generateChunkId(filePath, chunkInfo.start + 1),
      filePath: path.relative(projectPath, filePath),
      startLine: chunkInfo.start + 1,
      endLine: chunkInfo.end + 1,
      startColumn: 1,
      endColumn: lines[chunkInfo.end]?.length || 1,
      content: chunkContent,
      type: chunkInfo.type as any,
      language: 'python',
      complexity,
      dependencies,
      symbols,
      metadata: {
        isExported: false,
        isAsync: chunkContent.includes('async'),
        isTest: this.isTestFunction(chunkInfo.name),
        isConfig: false,
        isDocumentation: false,
        size: chunkContent.length,
        hash: this.hashContent(chunkContent),
      },
    };
  }

  /**
   * Create a Markdown chunk
   */
  private async createMarkdownChunk(
    section: any,
    filePath: string,
    projectPath: string,
    content: string,
    lines: string[]
  ): Promise<CodeChunk> {
    const chunkContent = lines.slice(section.start, section.end + 1).join('\n');
    const complexity = this.calculateComplexity(chunkContent);
    const dependencies = this.extractDependencies(chunkContent);
    const symbols = this.extractSymbols(chunkContent);

    return {
      id: this.generateChunkId(filePath, section.start + 1),
      filePath: path.relative(projectPath, filePath),
      startLine: section.start + 1,
      endLine: section.end + 1,
      startColumn: 1,
      endColumn: lines[section.end]?.length || 1,
      content: chunkContent,
      type: 'doc',
      language: 'markdown',
      complexity,
      dependencies,
      symbols,
      metadata: {
        isExported: false,
        isAsync: false,
        isTest: false,
        isConfig: false,
        isDocumentation: true,
        size: chunkContent.length,
        hash: this.hashContent(chunkContent),
      },
    };
  }

  /**
   * Find source files in the project
   */
  private async findSourceFiles(projectPath: string, options: any): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = await fs.readdir(projectPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(projectPath, entry.name);

        if (entry.isDirectory()) {
          if (
            !entry.name.startsWith('.') &&
            entry.name !== 'node_modules' &&
            entry.name !== 'dist'
          ) {
            const subFiles = await this.findSourceFiles(fullPath, options);
            files.push(...subFiles);
          }
        } else if (entry.isFile()) {
          const language = this.detectLanguage(fullPath);
          if (language && this.shouldIncludeFile(fullPath, language, options)) {
            files.push(fullPath);
          }
        }
      }
    } catch (error) {
      this.logger.warn(
        `Could not access ${projectPath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    return files;
  }

  /**
   * Detect language from file extension
   */
  private detectLanguage(filePath: string): CodeChunk['language'] | null {
    const ext = path.extname(filePath).toLowerCase();

    const languageMap: Record<string, CodeChunk['language']> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.py': 'python',
      '.go': 'go',
      '.java': 'java',
      '.rs': 'rust',
      '.md': 'markdown',
      '.json': 'json',
      '.yaml': 'yaml',
      '.yml': 'yaml',
    };

    return languageMap[ext] || null;
  }

  /**
   * Check if file should be included based on options
   */
  private shouldIncludeFile(
    filePath: string,
    language: CodeChunk['language'] | null,
    options: any
  ): boolean {
    // Skip if not including tests and file is a test
    if (!options.includeTests && this.isTestFile(filePath)) {
      return false;
    }

    // Skip if not including docs and file is documentation
    if (!options.includeDocs && language === 'markdown') {
      return false;
    }

    // Skip if not including configs and file is config
    if (!options.includeConfigs && (language === 'json' || language === 'yaml')) {
      return false;
    }

    return true;
  }

  /**
   * Check if file is a test file
   */
  private isTestFile(filePath: string): boolean {
    const testPatterns = [/\.test\./, /\.spec\./, /test\//, /tests\//, /__tests__\//];

    return testPatterns.some(pattern => pattern.test(filePath));
  }

  /**
   * Check if function is a test function
   */
  private isTestFunction(name: string): boolean {
    return (
      name.startsWith('test') ||
      name.startsWith('it') ||
      name.startsWith('describe') ||
      name.startsWith('expect')
    );
  }

  /**
   * Check if class is a test class
   */
  private isTestClass(name: string): boolean {
    return name.includes('Test') || name.includes('Spec');
  }

  /**
   * Calculate complexity of code chunk
   */
  private calculateComplexity(content: string): number {
    // Simplified complexity calculation
    const lines = content.split('\n');
    let complexity = 1;

    for (const line of lines) {
      if (
        line.includes('if') ||
        line.includes('for') ||
        line.includes('while') ||
        line.includes('switch')
      ) {
        complexity++;
      }
      if (line.includes('catch') || line.includes('finally')) {
        complexity++;
      }
    }

    return complexity;
  }

  /**
   * Extract dependencies from code
   */
  private extractDependencies(content: string): string[] {
    const dependencies: string[] = [];

    // Extract import statements
    const importRegex = /import\s+.*\s+from\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      dependencies.push(match[1]);
    }

    // Extract require statements
    const requireRegex = /require\(['"]([^'"]+)['"]\)/g;
    while ((match = requireRegex.exec(content)) !== null) {
      dependencies.push(match[1]);
    }

    return [...new Set(dependencies)];
  }

  /**
   * Extract symbols from code
   */
  private extractSymbols(content: string): { defined: string[]; referenced: string[] } {
    const defined: string[] = [];
    const referenced: string[] = [];

    // Extract function definitions
    const funcRegex = /function\s+(\w+)/g;
    let match;
    while ((match = funcRegex.exec(content)) !== null) {
      defined.push(match[1]);
    }

    // Extract class definitions
    const classRegex = /class\s+(\w+)/g;
    while ((match = classRegex.exec(content)) !== null) {
      defined.push(match[1]);
    }

    // Extract variable references (simplified)
    const varRegex = /\b([A-Za-z_][A-Za-z0-9_]*)\b/g;
    while ((match = varRegex.exec(content)) !== null) {
      if (!defined.includes(match[1])) {
        referenced.push(match[1]);
      }
    }

    return {
      defined: [...new Set(defined)],
      referenced: [...new Set(referenced)],
    };
  }

  /**
   * Get complexity level for distribution
   */
  private getComplexityLevel(complexity: number): string {
    if (complexity <= 2) return 'low';
    if (complexity <= 5) return 'medium';
    if (complexity <= 10) return 'high';
    return 'very-high';
  }

  /**
   * Generate unique chunk ID
   */
  private generateChunkId(filePath: string, line: number): string {
    const hash = this.hashContent(`${filePath}:${line}`);
    return `chunk_${hash.substring(0, 8)}`;
  }

  /**
   * Hash content for deduplication
   */
  private hashContent(content: string): string {
    // Simple hash function (in production, use crypto.createHash)
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }
}
