import { Logger } from '../utils/logger.js';
import { RefactoGentMetrics } from '../observability/metrics.js';
import { RefactoGentTracer } from '../observability/tracing.js';
import { RefactoGentConfig } from '../config/refactogent-schema.js';

export interface ContextPreviewOptions {
  showFiles?: boolean;
  showLines?: boolean;
  showSymbols?: boolean;
  showDependencies?: boolean;
  maxFiles?: number;
  maxLines?: number;
  includeTests?: boolean;
  includeConfigs?: boolean;
}

export interface ContextPreviewResult {
  files: ContextFile[];
  symbols: ContextSymbol[];
  dependencies: ContextDependency[];
  metadata: {
    totalFiles: number;
    totalLines: number;
    totalSymbols: number;
    contextSize: number;
    tokenEstimate: number;
  };
}

export interface ContextFile {
  path: string;
  lines: number[];
  content: string;
  type: 'source' | 'test' | 'config' | 'documentation';
  relevance: number;
  reason: string;
}

export interface ContextSymbol {
  name: string;
  type: 'function' | 'class' | 'interface' | 'variable' | 'import' | 'export';
  file: string;
  line: number;
  signature?: string;
  relevance: number;
  reason: string;
}

export interface ContextDependency {
  from: string;
  to: string;
  type: 'import' | 'call' | 'inheritance' | 'composition';
  relevance: number;
  reason: string;
}

export class ContextPreview {
  private logger: Logger;
  private metrics: RefactoGentMetrics;
  private tracer: RefactoGentTracer;
  private config: RefactoGentConfig;

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
  }

  /**
   * Generate context preview for a given query
   */
  async generatePreview(
    query: string,
    projectPath: string,
    options: ContextPreviewOptions = {}
  ): Promise<ContextPreviewResult> {
    const span = this.tracer.startAnalysisTrace(projectPath, 'context-preview');

    try {
      this.logger.info('Generating context preview', { query, projectPath, options });

      // Default options
      const opts = {
        showFiles: true,
        showLines: true,
        showSymbols: true,
        showDependencies: true,
        maxFiles: 20,
        maxLines: 1000,
        includeTests: false,
        includeConfigs: false,
        ...options,
      };

      // Generate context files
      const files = await this.generateContextFiles(query, projectPath, opts);

      // Generate context symbols
      const symbols = await this.generateContextSymbols(query, projectPath, opts);

      // Generate context dependencies
      const dependencies = await this.generateContextDependencies(query, projectPath, opts);

      // Calculate metadata
      const metadata = this.calculateMetadata(files, symbols, dependencies);

      const result: ContextPreviewResult = {
        files,
        symbols,
        dependencies,
        metadata,
      };

      this.tracer.recordSuccess(
        span,
        `Context preview generated: ${files.length} files, ${symbols.length} symbols`
      );
      return result;
    } catch (error) {
      this.tracer.recordError(span, error as Error, 'Context preview generation failed');
      throw error;
    }
  }

  /**
   * Generate context files based on query relevance
   */
  private async generateContextFiles(
    query: string,
    projectPath: string,
    options: ContextPreviewOptions
  ): Promise<ContextFile[]> {
    const files: ContextFile[] = [];

    // Mock implementation - in real implementation would use retrieval orchestrator
    const mockFiles = [
      {
        path: 'src/utils/helper.ts',
        lines: [1, 2, 3, 4, 5],
        content: 'export function helper() { return "help"; }',
        type: 'source' as const,
        relevance: 0.9,
        reason: 'Contains utility functions mentioned in query',
      },
      {
        path: 'src/components/Button.tsx',
        lines: [10, 11, 12, 13, 14],
        content: 'export const Button = () => <button>Click me</button>',
        type: 'source' as const,
        relevance: 0.8,
        reason: 'React component referenced in query',
      },
    ];

    // Filter and limit files
    const filteredFiles = mockFiles
      .filter(file => file.relevance > 0.5)
      .slice(0, options.maxFiles || 20);

    return filteredFiles;
  }

  /**
   * Generate context symbols based on query relevance
   */
  private async generateContextSymbols(
    query: string,
    projectPath: string,
    options: ContextPreviewOptions
  ): Promise<ContextSymbol[]> {
    const symbols: ContextSymbol[] = [];

    // Mock implementation - in real implementation would use symbol parser
    const mockSymbols = [
      {
        name: 'helper',
        type: 'function' as const,
        file: 'src/utils/helper.ts',
        line: 1,
        signature: 'function helper(): string',
        relevance: 0.9,
        reason: 'Function name matches query keywords',
      },
      {
        name: 'Button',
        type: 'class' as const,
        file: 'src/components/Button.tsx',
        line: 10,
        signature: 'class Button extends React.Component',
        relevance: 0.8,
        reason: 'Component referenced in query',
      },
    ];

    // Filter and limit symbols
    const filteredSymbols = mockSymbols.filter(symbol => symbol.relevance > 0.5).slice(0, 50);

    return filteredSymbols;
  }

  /**
   * Generate context dependencies based on query relevance
   */
  private async generateContextDependencies(
    query: string,
    projectPath: string,
    options: ContextPreviewOptions
  ): Promise<ContextDependency[]> {
    const dependencies: ContextDependency[] = [];

    // Mock implementation - in real implementation would use graph APIs
    const mockDependencies = [
      {
        from: 'src/components/Button.tsx',
        to: 'src/utils/helper.ts',
        type: 'import' as const,
        relevance: 0.7,
        reason: 'Button component imports helper function',
      },
    ];

    // Filter and limit dependencies
    const filteredDependencies = mockDependencies.filter(dep => dep.relevance > 0.5).slice(0, 20);

    return filteredDependencies;
  }

  /**
   * Calculate metadata for context preview
   */
  private calculateMetadata(
    files: ContextFile[],
    symbols: ContextSymbol[],
    dependencies: ContextDependency[]
  ) {
    const totalFiles = files.length;
    const totalLines = files.reduce((sum, file) => sum + file.lines.length, 0);
    const totalSymbols = symbols.length;
    const contextSize = files.reduce((sum, file) => sum + file.content.length, 0);
    const tokenEstimate = Math.ceil(contextSize / 4); // Rough estimate: 4 chars per token

    return {
      totalFiles,
      totalLines,
      totalSymbols,
      contextSize,
      tokenEstimate,
    };
  }

  /**
   * Format context preview for display
   */
  formatPreview(result: ContextPreviewResult): string {
    const { files, symbols, dependencies, metadata } = result;

    let output = '📋 Context Preview\n';
    output += '='.repeat(50) + '\n\n';

    // Files section
    if (files.length > 0) {
      output += '📁 Files (' + files.length + ')\n';
      output += '-'.repeat(30) + '\n';
      files.forEach(file => {
        output += `  ${file.path} (${file.type}, relevance: ${file.relevance.toFixed(2)})\n`;
        output += `    Lines: ${file.lines.join(', ')}\n`;
        output += `    Reason: ${file.reason}\n\n`;
      });
    }

    // Symbols section
    if (symbols.length > 0) {
      output += '🔧 Symbols (' + symbols.length + ')\n';
      output += '-'.repeat(30) + '\n';
      symbols.forEach(symbol => {
        output += `  ${symbol.name} (${symbol.type}, relevance: ${symbol.relevance.toFixed(2)})\n`;
        output += `    File: ${symbol.file}:${symbol.line}\n`;
        if (symbol.signature) {
          output += `    Signature: ${symbol.signature}\n`;
        }
        output += `    Reason: ${symbol.reason}\n\n`;
      });
    }

    // Dependencies section
    if (dependencies.length > 0) {
      output += '🔗 Dependencies (' + dependencies.length + ')\n';
      output += '-'.repeat(30) + '\n';
      dependencies.forEach(dep => {
        output += `  ${dep.from} → ${dep.to}\n`;
        output += `    Type: ${dep.type}, relevance: ${dep.relevance.toFixed(2)}\n`;
        output += `    Reason: ${dep.reason}\n\n`;
      });
    }

    // Metadata section
    output += '📊 Metadata\n';
    output += '-'.repeat(30) + '\n';
    output += `  Total Files: ${metadata.totalFiles}\n`;
    output += `  Total Lines: ${metadata.totalLines}\n`;
    output += `  Total Symbols: ${metadata.totalSymbols}\n`;
    output += `  Context Size: ${metadata.contextSize.toLocaleString()} chars\n`;
    output += `  Token Estimate: ${metadata.tokenEstimate.toLocaleString()} tokens\n`;

    return output;
  }

  /**
   * Generate diff sandbox with inline rationales
   */
  generateDiffSandbox(
    originalContent: string,
    modifiedContent: string,
    rationales: string[]
  ): string {
    let output = '🔍 Diff Sandbox with Rationales\n';
    output += '='.repeat(50) + '\n\n';

    const originalLines = originalContent.split('\n');
    const modifiedLines = modifiedContent.split('\n');
    const maxLines = Math.max(originalLines.length, modifiedLines.length);

    for (let i = 0; i < maxLines; i++) {
      const originalLine = originalLines[i] || '';
      const modifiedLine = modifiedLines[i] || '';
      const rationale = rationales[i] || '';

      if (originalLine !== modifiedLine) {
        output += `Line ${i + 1}:\n`;
        output += `  - ${originalLine}\n`;
        output += `  + ${modifiedLine}\n`;
        if (rationale) {
          output += `  💡 ${rationale}\n`;
        }
        output += '\n';
      }
    }

    return output;
  }
}
