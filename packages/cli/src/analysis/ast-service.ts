import { Logger } from '../utils/logger.js';
import { ProjectType } from '../types/index.js';
import { ASTAnalyzer } from './ast-analyzer.js';
import { TypeScriptAnalyzer } from './typescript-analyzer.js';
import { PythonAnalyzer } from './python-analyzer.js';
import { GoAnalyzer } from './go-analyzer.js';
import { APISurfaceDetector, APISurface } from './api-surface-detector.js';
import { ProjectAST, ModuleAST, CodeSymbol, ASTMetrics, DependencyGraph } from './ast-types.js';

export interface UnifiedProjectAnalysis {
  projectPath: string;
  languages: string[];
  astByLanguage: Map<string, ProjectAST>;
  unifiedSymbols: CodeSymbol[];
  crossLanguageDependencies: DependencyGraph;
  overallMetrics: UnifiedMetrics;
  apiSurface: APISurface;
  recommendations: AnalysisRecommendation[];
}

export interface UnifiedMetrics {
  totalFiles: number;
  totalSymbols: number;
  averageComplexity: number;
  maxComplexity: number;
  totalLOC: number;
  publicAPICount: number;
  crossLanguageReferences: number;
  architecturalScore: number;
}

export interface AnalysisRecommendation {
  type: 'refactoring' | 'architecture' | 'complexity' | 'dependency';
  severity: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  location?: string;
  suggestion: string;
}

export class ASTService {
  private logger: Logger;
  private analyzers: Map<string, ASTAnalyzer> = new Map();
  private apiDetector: APISurfaceDetector;

  constructor(logger: Logger) {
    this.logger = logger;
    this.apiDetector = new APISurfaceDetector(logger);
  }

  /**
   * Analyze a project with unified cross-language analysis
   */
  async analyzeProject(
    projectPath: string,
    projectType: ProjectType
  ): Promise<UnifiedProjectAnalysis> {
    this.logger.info('Starting unified AST analysis', { projectPath, projectType });

    const languages = this.detectLanguages(projectType);
    const astByLanguage = new Map<string, ProjectAST>();
    const allSymbols: CodeSymbol[] = [];

    // Analyze each language
    for (const language of languages) {
      try {
        const analyzer = this.getAnalyzer(language, projectPath);
        const ast = await analyzer.analyzeProject();
        astByLanguage.set(language, ast);

        // Collect symbols from all modules
        for (const module of ast.modules) {
          const symbols = await analyzer.extractSymbols(module.filePath);
          allSymbols.push(...symbols);
        }

        this.logger.info(`Completed ${language} analysis`, {
          files: ast.modules.length,
          symbols: allSymbols.length,
        });
      } catch (error) {
        this.logger.error(`Failed to analyze ${language}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Build cross-language dependency graph
    const crossLanguageDependencies = this.buildCrossLanguageDependencies(astByLanguage);

    // Detect API surface
    const apiSurface = await this.apiDetector.detectAPISurface(projectPath, astByLanguage);

    // Calculate unified metrics
    const overallMetrics = this.calculateUnifiedMetrics(astByLanguage, allSymbols);

    // Generate recommendations
    const recommendations = this.generateRecommendations(astByLanguage, overallMetrics, apiSurface);

    return {
      projectPath,
      languages,
      astByLanguage,
      unifiedSymbols: allSymbols,
      crossLanguageDependencies,
      overallMetrics,
      apiSurface,
      recommendations,
    };
  }

  /**
   * Get symbols by type across all languages
   */
  getSymbolsByType(analysis: UnifiedProjectAnalysis, type: string): CodeSymbol[] {
    return analysis.unifiedSymbols.filter(symbol => symbol.type === type);
  }

  /**
   * Find symbols by name pattern
   */
  findSymbols(analysis: UnifiedProjectAnalysis, pattern: RegExp): CodeSymbol[] {
    return analysis.unifiedSymbols.filter(symbol => pattern.test(symbol.name));
  }

  /**
   * Get public API surface
   */
  getPublicAPI(analysis: UnifiedProjectAnalysis): CodeSymbol[] {
    return analysis.unifiedSymbols.filter(symbol => symbol.isExported);
  }

  /**
   * Detect circular dependencies across languages
   */
  detectCircularDependencies(analysis: UnifiedProjectAnalysis): string[][] {
    const cycles: string[][] = [];

    for (const [language, ast] of analysis.astByLanguage) {
      if (ast.metrics.circularDependencies) {
        cycles.push(...ast.metrics.circularDependencies);
      }
    }

    return cycles;
  }

  /**
   * Calculate complexity hotspots
   */
  getComplexityHotspots(analysis: UnifiedProjectAnalysis, threshold = 10): CodeSymbol[] {
    return analysis.unifiedSymbols
      .filter(symbol => {
        // Get complexity from metadata or calculate based on type
        const complexity = this.getSymbolComplexity(symbol);
        return complexity > threshold;
      })
      .sort((a, b) => this.getSymbolComplexity(b) - this.getSymbolComplexity(a));
  }

  private detectLanguages(projectType: ProjectType): string[] {
    switch (projectType) {
      case 'typescript':
        return ['typescript'];
      case 'python':
        return ['python'];
      case 'go':
        return ['go'];
      case 'mixed':
        return ['typescript', 'python', 'go'];
      default:
        return ['typescript']; // Default fallback
    }
  }

  private getAnalyzer(language: string, projectPath: string): ASTAnalyzer {
    const key = `${language}:${projectPath}`;

    if (!this.analyzers.has(key)) {
      let analyzer: ASTAnalyzer;

      switch (language) {
        case 'typescript':
          analyzer = new TypeScriptAnalyzer(this.logger, projectPath);
          break;
        case 'python':
          analyzer = new PythonAnalyzer(this.logger, projectPath);
          break;
        case 'go':
          analyzer = new GoAnalyzer(this.logger, projectPath);
          break;
        default:
          throw new Error(`Unsupported language: ${language}`);
      }

      this.analyzers.set(key, analyzer);
    }

    return this.analyzers.get(key)!;
  }

  private buildCrossLanguageDependencies(astByLanguage: Map<string, ProjectAST>): DependencyGraph {
    const nodes: any[] = [];
    const edges: any[] = [];

    // Collect all nodes from all languages
    for (const [language, ast] of astByLanguage) {
      nodes.push(...ast.dependencies.nodes);
      edges.push(...ast.dependencies.edges);
    }

    // TODO: Add cross-language dependency detection
    // This would involve analyzing imports/calls between different language modules
    // For example, Python calling TypeScript via subprocess, or Go calling Python scripts

    return { nodes, edges };
  }

  private calculateUnifiedMetrics(
    astByLanguage: Map<string, ProjectAST>,
    allSymbols: CodeSymbol[]
  ): UnifiedMetrics {
    let totalFiles = 0;
    let totalLOC = 0;
    let publicAPICount = 0;
    const complexities: number[] = [];

    for (const [language, ast] of astByLanguage) {
      totalFiles += ast.metrics.totalFiles;
      totalLOC += ast.metrics.totalLOC;
      publicAPICount += ast.metrics.publicAPICount;

      // Collect complexity values
      for (const module of ast.modules) {
        complexities.push(module.complexity);
      }
    }

    const averageComplexity =
      complexities.length > 0 ? complexities.reduce((a, b) => a + b, 0) / complexities.length : 0;
    const maxComplexity = complexities.length > 0 ? Math.max(...complexities) : 0;

    // Calculate architectural score (0-100)
    const architecturalScore = this.calculateArchitecturalScore(astByLanguage, {
      totalFiles,
      averageComplexity,
      maxComplexity,
      publicAPICount,
    });

    return {
      totalFiles,
      totalSymbols: allSymbols.length,
      averageComplexity: Math.round(averageComplexity * 100) / 100,
      maxComplexity,
      totalLOC,
      publicAPICount,
      crossLanguageReferences: 0, // TODO: Implement cross-language reference detection
      architecturalScore,
    };
  }

  private calculateArchitecturalScore(
    astByLanguage: Map<string, ProjectAST>,
    metrics: any
  ): number {
    let score = 100;

    // Penalize high complexity
    if (metrics.averageComplexity > 10) score -= 20;
    if (metrics.maxComplexity > 20) score -= 15;

    // Penalize large files
    if (metrics.totalFiles > 100) score -= 10;

    // Penalize circular dependencies
    for (const [language, ast] of astByLanguage) {
      if (ast.metrics.circularDependencies.length > 0) {
        score -= ast.metrics.circularDependencies.length * 5;
      }
    }

    // Reward good API design (not too many public symbols)
    const apiRatio = metrics.publicAPICount / metrics.totalSymbols;
    if (apiRatio > 0.5) score -= 10; // Too many public symbols

    return Math.max(0, Math.min(100, score));
  }

  private generateRecommendations(
    astByLanguage: Map<string, ProjectAST>,
    metrics: UnifiedMetrics,
    apiSurface: APISurface
  ): AnalysisRecommendation[] {
    const recommendations: AnalysisRecommendation[] = [];

    // Complexity recommendations
    if (metrics.averageComplexity > 10) {
      recommendations.push({
        type: 'complexity',
        severity: 'high',
        title: 'High Average Complexity',
        description: `Average complexity is ${metrics.averageComplexity}, which is above the recommended threshold of 10.`,
        suggestion:
          'Consider breaking down complex functions into smaller, more focused functions.',
      });
    }

    if (metrics.maxComplexity > 20) {
      recommendations.push({
        type: 'complexity',
        severity: 'high',
        title: 'Very High Maximum Complexity',
        description: `Maximum complexity is ${metrics.maxComplexity}, which indicates very complex code.`,
        suggestion: 'Identify and refactor the most complex functions first.',
      });
    }

    // Architecture recommendations
    if (metrics.architecturalScore < 70) {
      recommendations.push({
        type: 'architecture',
        severity: 'medium',
        title: 'Low Architectural Score',
        description: `Architectural score is ${metrics.architecturalScore}/100, indicating potential design issues.`,
        suggestion:
          'Review code organization, reduce complexity, and eliminate circular dependencies.',
      });
    }

    // Circular dependency recommendations
    for (const [language, ast] of astByLanguage) {
      if (ast.metrics.circularDependencies.length > 0) {
        recommendations.push({
          type: 'dependency',
          severity: 'medium',
          title: `Circular Dependencies in ${language}`,
          description: `Found ${ast.metrics.circularDependencies.length} circular dependencies.`,
          suggestion:
            'Refactor code to eliminate circular dependencies by introducing interfaces or reorganizing modules.',
        });
      }
    }

    // API surface recommendations
    const apiRatio = metrics.publicAPICount / metrics.totalSymbols;
    if (apiRatio > 0.5) {
      recommendations.push({
        type: 'architecture',
        severity: 'low',
        title: 'Large Public API Surface',
        description: `${Math.round(apiRatio * 100)}% of symbols are public, which may indicate over-exposure.`,
        suggestion: 'Consider making some symbols private or internal to reduce API surface area.',
      });
    }

    // API-specific recommendations
    if (apiSurface.summary.riskScore > 70) {
      recommendations.push({
        type: 'architecture',
        severity: 'high',
        title: 'High API Risk Score',
        description: `API risk score is ${apiSurface.summary.riskScore}/100, indicating potential issues with API design.`,
        suggestion:
          'Review API endpoints for over-exposure, consider consolidating similar endpoints, and implement proper access controls.',
      });
    }

    if (apiSurface.summary.httpEndpoints > 20) {
      recommendations.push({
        type: 'architecture',
        severity: 'medium',
        title: 'Large HTTP API Surface',
        description: `Found ${apiSurface.summary.httpEndpoints} HTTP endpoints, which may be difficult to maintain.`,
        suggestion:
          'Consider grouping related endpoints, implementing API versioning, and documenting all endpoints.',
      });
    }

    if (apiSurface.summary.frameworks.length > 2) {
      recommendations.push({
        type: 'architecture',
        severity: 'medium',
        title: 'Multiple API Frameworks',
        description: `Using ${apiSurface.summary.frameworks.length} different frameworks: ${apiSurface.summary.frameworks.join(', ')}.`,
        suggestion:
          'Consider standardizing on fewer frameworks to reduce complexity and maintenance overhead.',
      });
    }

    return recommendations;
  }

  private getSymbolComplexity(symbol: CodeSymbol): number {
    // This is a simplified complexity calculation
    // In a real implementation, we'd store complexity in the symbol metadata
    if (symbol.type === 'function' || symbol.type === 'method') {
      // Estimate complexity based on signature length (very rough approximation)
      return Math.min(20, Math.floor((symbol.signature?.length || 0) / 50));
    }
    return 1;
  }
}
