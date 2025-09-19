import { Project, SourceFile, Node, SyntaxKind } from 'ts-morph';
import fs from 'fs';
import path from 'path';
import { Logger } from '../utils/logger.js';

export interface SafetyScore {
  overall: number; // 0-100
  complexity: number; // 0-100
  testCoverage: number; // 0-100
  apiExposure: number; // 0-100
  changeFrequency: number; // 0-100
  dependencyFanOut: number; // 0-100
  recommendations: SafetyRecommendation[];
}

export interface SafetyRecommendation {
  type: 'warning' | 'suggestion' | 'info';
  category: 'complexity' | 'testing' | 'api' | 'dependencies' | 'structure';
  message: string;
  impact: 'low' | 'medium' | 'high';
  actionable: boolean;
  details?: string;
}

export interface CodeComplexityMetrics {
  cyclomaticComplexity: number;
  cognitiveComplexity: number;
  linesOfCode: number;
  nestingDepth: number;
  functionCount: number;
  classCount: number;
}

export interface APIExposureMetrics {
  exportedFunctions: number;
  exportedClasses: number;
  publicMethods: number;
  httpRoutes: number;
  cliCommands: number;
  exposureScore: number;
}

export interface DependencyMetrics {
  internalDependencies: number;
  externalDependencies: number;
  fanOutScore: number;
  circularDependencies: string[];
  unusedDependencies: string[];
}

export class SafetyAnalyzer {
  private logger: Logger;
  private project: Project;

  constructor(logger: Logger) {
    this.logger = logger;
    this.project = new Project({
      useInMemoryFileSystem: true,
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
   * Calculate comprehensive safety score for a file or project
   */
  async calculateSafetyScore(
    filePath: string,
    options: {
      includeTestCoverage?: boolean;
      includeChangeFrequency?: boolean;
      projectRoot?: string;
    } = {}
  ): Promise<SafetyScore> {
    try {
      const fileExtension = path.extname(filePath);
      const isTypeScript = ['.ts', '.tsx'].includes(fileExtension);

      // Analyze code complexity
      const complexityMetrics = await this.analyzeComplexity(filePath);
      const complexityScore = this.calculateComplexityScore(complexityMetrics);

      // Analyze API exposure
      const apiMetrics = await this.analyzeAPIExposure(filePath);
      const apiScore = this.calculateAPIExposureScore(apiMetrics);

      // Analyze dependency fan-out
      const dependencyMetrics = await this.analyzeDependencies(filePath, options.projectRoot);
      const dependencyScore = this.calculateDependencyScore(dependencyMetrics);

      // Mock test coverage (would integrate with actual coverage tools)
      const testCoverageScore = options.includeTestCoverage
        ? await this.analyzeTestCoverage(filePath)
        : 85; // Default assumption

      // Mock change frequency (would integrate with git history)
      const changeFrequencyScore = options.includeChangeFrequency
        ? await this.analyzeChangeFrequency(filePath)
        : 75; // Default assumption

      // Calculate overall score with weighted average
      const overall = this.calculateOverallScore({
        complexity: complexityScore,
        testCoverage: testCoverageScore,
        apiExposure: apiScore,
        changeFrequency: changeFrequencyScore,
        dependencyFanOut: dependencyScore,
      });

      // Generate recommendations
      const recommendations = this.generateRecommendations(
        {
          complexity: complexityScore,
          testCoverage: testCoverageScore,
          apiExposure: apiScore,
          changeFrequency: changeFrequencyScore,
          dependencyFanOut: dependencyScore,
        },
        complexityMetrics,
        apiMetrics,
        dependencyMetrics
      );

      return {
        overall,
        complexity: complexityScore,
        testCoverage: testCoverageScore,
        apiExposure: apiScore,
        changeFrequency: changeFrequencyScore,
        dependencyFanOut: dependencyScore,
        recommendations,
      };
    } catch (error) {
      this.logger.error('Failed to calculate safety score', { filePath, error });

      // Return conservative score on error
      return {
        overall: 50,
        complexity: 50,
        testCoverage: 50,
        apiExposure: 50,
        changeFrequency: 50,
        dependencyFanOut: 50,
        recommendations: [
          {
            type: 'warning',
            category: 'structure',
            message: 'Unable to analyze file safety - proceed with caution',
            impact: 'high',
            actionable: false,
            details: error instanceof Error ? error.message : String(error),
          },
        ],
      };
    }
  }

  /**
   * Analyze code complexity metrics
   */
  private async analyzeComplexity(filePath: string): Promise<CodeComplexityMetrics> {
    const code = fs.readFileSync(filePath, 'utf8');
    const sourceFile = this.project.createSourceFile(filePath, code, { overwrite: true });

    let cyclomaticComplexity = 1; // Base complexity
    let cognitiveComplexity = 0;
    let nestingDepth = 0;
    let maxNesting = 0;
    let functionCount = 0;
    let classCount = 0;

    const linesOfCode = code
      .split('\n')
      .filter(
        line => line.trim() && !line.trim().startsWith('//') && !line.trim().startsWith('*')
      ).length;

    sourceFile.forEachDescendant((node, traversal) => {
      const currentDepth = this.getNodeDepth(node);
      nestingDepth = Math.max(nestingDepth, currentDepth);

      switch (node.getKind()) {
        case SyntaxKind.FunctionDeclaration:
        case SyntaxKind.FunctionExpression:
        case SyntaxKind.ArrowFunction:
        case SyntaxKind.MethodDeclaration:
          functionCount++;
          break;

        case SyntaxKind.ClassDeclaration:
          classCount++;
          break;

        case SyntaxKind.IfStatement:
        case SyntaxKind.WhileStatement:
        case SyntaxKind.ForStatement:
        case SyntaxKind.DoStatement:
        case SyntaxKind.SwitchStatement:
          cyclomaticComplexity++;
          cognitiveComplexity += this.getCognitiveComplexityIncrement(node, currentDepth);
          break;

        case SyntaxKind.ConditionalExpression:
        case SyntaxKind.BinaryExpression:
          if (Node.isBinaryExpression(node)) {
            const operator = node.getOperatorToken().getKind();
            if (
              operator === SyntaxKind.AmpersandAmpersandToken ||
              operator === SyntaxKind.BarBarToken
            ) {
              cyclomaticComplexity++;
              cognitiveComplexity++;
            }
          }
          break;

        case SyntaxKind.CatchClause:
          cyclomaticComplexity++;
          cognitiveComplexity++;
          break;
      }
    });

    return {
      cyclomaticComplexity,
      cognitiveComplexity,
      linesOfCode,
      nestingDepth,
      functionCount,
      classCount,
    };
  }

  /**
   * Analyze API exposure metrics
   */
  private async analyzeAPIExposure(filePath: string): Promise<APIExposureMetrics> {
    const code = fs.readFileSync(filePath, 'utf8');
    const sourceFile = this.project.createSourceFile(filePath, code, { overwrite: true });

    let exportedFunctions = 0;
    let exportedClasses = 0;
    let publicMethods = 0;
    let httpRoutes = 0;
    let cliCommands = 0;

    // Count exports
    const exportDeclarations = sourceFile.getExportDeclarations();
    const exportAssignments = sourceFile.getExportAssignments();

    sourceFile.forEachDescendant(node => {
      // Check for exported declarations
      if (Node.isFunctionDeclaration(node) || Node.isClassDeclaration(node)) {
        const modifiers = (node as any).getModifiers?.() || [];
        const isExported = modifiers.some((m: any) => m.getKind() === SyntaxKind.ExportKeyword);

        if (isExported) {
          if (Node.isFunctionDeclaration(node)) {
            exportedFunctions++;
          } else if (Node.isClassDeclaration(node)) {
            exportedClasses++;
            // Count public methods in exported classes
            node.getMethods().forEach(method => {
              if (!method.hasModifier(SyntaxKind.PrivateKeyword)) {
                publicMethods++;
              }
            });
          }
        }
      }

      // Detect HTTP routes (Express-style)
      if (Node.isCallExpression(node)) {
        const expression = node.getExpression();
        if (Node.isPropertyAccessExpression(expression)) {
          const methodName = expression.getName();
          if (['get', 'post', 'put', 'delete', 'patch'].includes(methodName)) {
            httpRoutes++;
          }
        }
      }

      // Detect CLI commands (simple heuristic)
      if (Node.isStringLiteral(node)) {
        const text = node.getLiteralValue();
        if (text.includes('command') || text.includes('cmd')) {
          cliCommands++;
        }
      }
    });

    // Calculate exposure score based on public surface area
    const totalExports = exportedFunctions + exportedClasses + exportDeclarations.length;
    const exposureScore = Math.min(
      100,
      (totalExports + publicMethods + httpRoutes + cliCommands) * 5
    );

    return {
      exportedFunctions,
      exportedClasses,
      publicMethods,
      httpRoutes,
      cliCommands,
      exposureScore,
    };
  }

  /**
   * Analyze dependency metrics
   */
  private async analyzeDependencies(
    filePath: string,
    projectRoot?: string
  ): Promise<DependencyMetrics> {
    const code = fs.readFileSync(filePath, 'utf8');
    const sourceFile = this.project.createSourceFile(filePath, code, { overwrite: true });

    let internalDependencies = 0;
    let externalDependencies = 0;
    const dependencies = new Set<string>();

    // Analyze imports
    const importDeclarations = sourceFile.getImportDeclarations();

    importDeclarations.forEach(importDecl => {
      const moduleSpecifier = importDecl.getModuleSpecifierValue();
      dependencies.add(moduleSpecifier);

      if (moduleSpecifier.startsWith('.') || moduleSpecifier.startsWith('/')) {
        internalDependencies++;
      } else {
        externalDependencies++;
      }
    });

    // Calculate fan-out score (lower is better)
    const totalDependencies = internalDependencies + externalDependencies;
    const fanOutScore = Math.max(0, 100 - totalDependencies * 5);

    // Mock circular dependencies detection (would need full project analysis)
    const circularDependencies: string[] = [];

    // Mock unused dependencies detection (would need usage analysis)
    const unusedDependencies: string[] = [];

    return {
      internalDependencies,
      externalDependencies,
      fanOutScore,
      circularDependencies,
      unusedDependencies,
    };
  }

  /**
   * Mock test coverage analysis (would integrate with nyc, jest, etc.)
   */
  private async analyzeTestCoverage(filePath: string): Promise<number> {
    // This would integrate with actual coverage tools
    // For now, return a mock score based on file characteristics

    const code = fs.readFileSync(filePath, 'utf8');
    const hasTests =
      code.includes('test') ||
      code.includes('spec') ||
      fs.existsSync(filePath.replace(/\.(ts|js)$/, '.test.$1')) ||
      fs.existsSync(filePath.replace(/\.(ts|js)$/, '.spec.$1'));

    return hasTests ? 85 : 45;
  }

  /**
   * Mock change frequency analysis (would integrate with git history)
   */
  private async analyzeChangeFrequency(filePath: string): Promise<number> {
    // This would analyze git history to determine change frequency
    // For now, return a mock score

    try {
      const stats = fs.statSync(filePath);
      const daysSinceModified = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);

      // Files modified recently have higher change frequency (lower score)
      if (daysSinceModified < 7) return 60;
      if (daysSinceModified < 30) return 75;
      return 90;
    } catch {
      return 75; // Default
    }
  }

  /**
   * Calculate complexity score (0-100, higher is better)
   */
  private calculateComplexityScore(metrics: CodeComplexityMetrics): number {
    const { cyclomaticComplexity, cognitiveComplexity, linesOfCode, nestingDepth, functionCount } =
      metrics;

    // Normalize metrics to 0-100 scale (lower complexity = higher score)
    const cyclomaticScore = Math.max(0, 100 - (cyclomaticComplexity - 1) * 5);
    const cognitiveScore = Math.max(0, 100 - cognitiveComplexity * 3);
    const locScore = Math.max(0, 100 - Math.max(0, linesOfCode - 50) * 0.5);
    const nestingScore = Math.max(0, 100 - nestingDepth * 10);
    const functionScore = Math.max(0, 100 - Math.max(0, functionCount - 5) * 5);

    // Weighted average
    return Math.round(
      cyclomaticScore * 0.3 +
        cognitiveScore * 0.3 +
        locScore * 0.2 +
        nestingScore * 0.1 +
        functionScore * 0.1
    );
  }

  /**
   * Calculate API exposure score (0-100, lower exposure = higher score)
   */
  private calculateAPIExposureScore(metrics: APIExposureMetrics): number {
    return Math.max(0, 100 - metrics.exposureScore);
  }

  /**
   * Calculate dependency score (0-100, lower fan-out = higher score)
   */
  private calculateDependencyScore(metrics: DependencyMetrics): number {
    return metrics.fanOutScore;
  }

  /**
   * Calculate overall safety score with weighted average
   */
  private calculateOverallScore(scores: {
    complexity: number;
    testCoverage: number;
    apiExposure: number;
    changeFrequency: number;
    dependencyFanOut: number;
  }): number {
    const { complexity, testCoverage, apiExposure, changeFrequency, dependencyFanOut } = scores;

    // Weighted average - complexity and test coverage are most important
    return Math.round(
      complexity * 0.25 +
        testCoverage * 0.25 +
        apiExposure * 0.2 +
        changeFrequency * 0.15 +
        dependencyFanOut * 0.15
    );
  }

  /**
   * Generate safety recommendations based on scores and metrics
   */
  private generateRecommendations(
    scores: any,
    complexityMetrics: CodeComplexityMetrics,
    apiMetrics: APIExposureMetrics,
    dependencyMetrics: DependencyMetrics
  ): SafetyRecommendation[] {
    const recommendations: SafetyRecommendation[] = [];

    // Complexity recommendations
    if (scores.complexity < 70) {
      if (complexityMetrics.cyclomaticComplexity > 10) {
        recommendations.push({
          type: 'warning',
          category: 'complexity',
          message: `High cyclomatic complexity (${complexityMetrics.cyclomaticComplexity})`,
          impact: 'high',
          actionable: true,
          details: 'Consider breaking down complex functions into smaller, more focused functions.',
        });
      }

      if (complexityMetrics.nestingDepth > 4) {
        recommendations.push({
          type: 'warning',
          category: 'complexity',
          message: `Deep nesting detected (${complexityMetrics.nestingDepth} levels)`,
          impact: 'medium',
          actionable: true,
          details:
            'Consider using early returns or extracting nested logic into separate functions.',
        });
      }

      if (complexityMetrics.linesOfCode > 200) {
        recommendations.push({
          type: 'suggestion',
          category: 'complexity',
          message: `Large file detected (${complexityMetrics.linesOfCode} lines)`,
          impact: 'medium',
          actionable: true,
          details: 'Consider splitting this file into smaller, more focused modules.',
        });
      }
    }

    // Test coverage recommendations
    if (scores.testCoverage < 80) {
      recommendations.push({
        type: 'warning',
        category: 'testing',
        message: 'Low test coverage detected',
        impact: 'high',
        actionable: true,
        details: 'Add comprehensive tests before refactoring to ensure behavior preservation.',
      });
    }

    // API exposure recommendations
    if (scores.apiExposure < 60) {
      recommendations.push({
        type: 'warning',
        category: 'api',
        message: 'High API exposure detected',
        impact: 'high',
        actionable: true,
        details: 'Changes to this file may affect many consumers. Consider characterization tests.',
      });
    }

    // Dependency recommendations
    if (scores.dependencyFanOut < 70) {
      recommendations.push({
        type: 'suggestion',
        category: 'dependencies',
        message: 'High dependency fan-out detected',
        impact: 'medium',
        actionable: true,
        details: 'Consider reducing dependencies or using dependency injection patterns.',
      });
    }

    // Overall safety recommendations
    if (scores.complexity > 80 && scores.testCoverage > 80) {
      recommendations.push({
        type: 'info',
        category: 'structure',
        message: 'File appears safe for refactoring',
        impact: 'low',
        actionable: false,
        details: 'Good complexity and test coverage make this file relatively safe to refactor.',
      });
    }

    return recommendations;
  }

  /**
   * Get the nesting depth of a node
   */
  private getNodeDepth(node: Node): number {
    let depth = 0;
    let current = node.getParent();

    while (current) {
      if (this.isNestingNode(current)) {
        depth++;
      }
      current = current.getParent();
    }

    return depth;
  }

  /**
   * Check if a node contributes to nesting complexity
   */
  private isNestingNode(node: Node): boolean {
    const kind = node.getKind();
    return [
      SyntaxKind.IfStatement,
      SyntaxKind.WhileStatement,
      SyntaxKind.ForStatement,
      SyntaxKind.DoStatement,
      SyntaxKind.SwitchStatement,
      SyntaxKind.TryStatement,
      SyntaxKind.CatchClause,
      SyntaxKind.FunctionDeclaration,
      SyntaxKind.FunctionExpression,
      SyntaxKind.ArrowFunction,
      SyntaxKind.MethodDeclaration,
    ].includes(kind);
  }

  /**
   * Calculate cognitive complexity increment for a node
   */
  private getCognitiveComplexityIncrement(node: Node, depth: number): number {
    const kind = node.getKind();

    // Base increment
    let increment = 1;

    // Add nesting penalty
    if (depth > 1) {
      increment += depth - 1;
    }

    // Special cases
    if (kind === SyntaxKind.SwitchStatement) {
      increment = 1; // Switch statements have lower cognitive load
    }

    return increment;
  }
}
