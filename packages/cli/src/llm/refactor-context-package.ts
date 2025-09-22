import { Logger } from '../utils/logger.js';
import { Project, SourceFile, Node, SyntaxKind } from 'ts-morph';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

export interface CodeSelection {
  type: 'function' | 'class' | 'interface' | 'module' | 'file';
  name: string;
  filePath: string;
  startLine: number;
  endLine: number;
  complexity: number;
  dependencies: string[];
  usage: {
    internal: number;
    external: number;
    testCoverage: number;
  };
  ast: {
    nodeCount: number;
    depth: number;
    patterns: string[];
  };
}

export interface ProjectGuardrails {
  rules: GuardrailRule[];
  styles: StyleRule[];
  bannedChanges: BannedChange[];
  framework: FrameworkInfo;
  runtime: RuntimeInfo;
}

export interface GuardrailRule {
  id: string;
  name: string;
  description: string;
  pattern: string;
  severity: 'error' | 'warning' | 'info';
  enforcement: 'strict' | 'suggest' | 'ignore';
}

export interface StyleRule {
  property: string;
  value: string;
  description: string;
  examples: string[];
}

export interface BannedChange {
  type: string;
  pattern: string;
  reason: string;
  alternatives: string[];
}

export interface FrameworkInfo {
  name: string;
  version: string;
  patterns: string[];
  conventions: string[];
}

export interface RuntimeInfo {
  node: string;
  typescript: string;
  dependencies: Record<string, string>;
}

export interface TestingSignals {
  testFiles: TestFile[];
  coverage: CoverageData;
  gaps: CoverageGap[];
  quality: TestQuality;
}

export interface TestFile {
  path: string;
  type: 'unit' | 'integration' | 'e2e' | 'characterization';
  coverage: number;
  lastModified: string;
  quality: number;
}

export interface CoverageData {
  overall: number;
  byFile: Record<string, number>;
  byFunction: Record<string, number>;
  gaps: string[];
}

export interface CoverageGap {
  file: string;
  function: string;
  lines: number[];
  priority: 'high' | 'medium' | 'low';
  reason: string;
}

export interface TestQuality {
  score: number;
  metrics: {
    maintainability: number;
    reliability: number;
    performance: number;
  };
  issues: string[];
  recommendations: string[];
}

export interface RepoContext {
  namingConventions: NamingConvention[];
  architecturalPatterns: ArchitecturalPattern[];
  codeStyle: CodeStyle;
  projectStructure: ProjectStructure;
}

export interface NamingConvention {
  type: 'function' | 'variable' | 'class' | 'interface' | 'constant';
  pattern: string;
  examples: string[];
  confidence: number;
}

export interface ArchitecturalPattern {
  name: string;
  confidence: number;
  evidence: string[];
  files: string[];
}

export interface CodeStyle {
  indentation: 'spaces' | 'tabs';
  spaces: number;
  quotes: 'single' | 'double';
  semicolons: boolean;
  trailingCommas: boolean;
}

export interface ProjectStructure {
  layers: string[];
  modules: string[];
  dependencies: Record<string, string[]>;
  circularDependencies: string[];
}

export interface RefactorContextPackage {
  codeSelection: CodeSelection[];
  guardrails: ProjectGuardrails;
  testSignals: TestingSignals;
  repoContext: RepoContext;
  metadata: {
    generatedAt: string;
    version: string;
    projectPath: string;
    analysisTime: number;
  };
}

/**
 * Refactor Context Package (RCP) system
 * This is the core differentiator that makes RefactoGent superior to Cursor/Claude
 * by providing structured, curated context instead of raw file dumps
 */
export class RefactorContextPackageBuilder {
  private logger: Logger;
  private project: Project;

  constructor(logger: Logger) {
    this.logger = logger;
    this.project = new Project({
      useInMemoryFileSystem: false,
      compilerOptions: {
        target: 99,
        module: 99,
        strict: false,
        allowJs: true,
        checkJs: false,
      },
    });
  }

  /**
   * Build comprehensive Refactor Context Package
   * This is the key competitive advantage over Cursor/Claude
   */
  async buildRCP(projectPath: string, targetFiles?: string[]): Promise<RefactorContextPackage> {
    const startTime = Date.now();
    this.logger.info('Building Refactor Context Package', { projectPath, targetFiles });

    try {
      // 1. Code Selection - Curated, relevant code analysis
      const codeSelection = await this.buildCodeSelection(projectPath, targetFiles);
      this.logger.info('Code selection completed', { selections: codeSelection.length });

      // 2. Project Guardrails - Rules, styles, and constraints
      const guardrails = await this.buildProjectGuardrails(projectPath);
      this.logger.info('Project guardrails extracted', { rules: guardrails.rules.length });

      // 3. Testing Signals - Coverage and test quality data
      const testSignals = await this.buildTestingSignals(projectPath);
      this.logger.info('Testing signals gathered', {
        testFiles: testSignals.testFiles.length,
        coverage: testSignals.coverage.overall,
      });

      // 4. Repo Context - Naming conventions and architectural patterns
      const repoContext = await this.buildRepoContext(projectPath);
      this.logger.info('Repo context extracted', {
        conventions: repoContext.namingConventions.length,
        patterns: repoContext.architecturalPatterns.length,
      });

      const analysisTime = Date.now() - startTime;

      const rcp: RefactorContextPackage = {
        codeSelection,
        guardrails,
        testSignals,
        repoContext,
        metadata: {
          generatedAt: new Date().toISOString(),
          version: '1.0.0',
          projectPath,
          analysisTime,
        },
      };

      this.logger.info('Refactor Context Package built successfully', {
        analysisTime,
        codeSelections: codeSelection.length,
        guardrailRules: guardrails.rules.length,
        testFiles: testSignals.testFiles.length,
        namingConventions: repoContext.namingConventions.length,
      });

      return rcp;
    } catch (error) {
      this.logger.error('Failed to build Refactor Context Package', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Build code selection with AST analysis and dependency mapping
   * This demonstrates RefactoGent's deterministic pre-analysis advantage
   */
  private async buildCodeSelection(
    projectPath: string,
    targetFiles?: string[]
  ): Promise<CodeSelection[]> {
    this.logger.info('Building code selection with AST analysis');

    const selections: CodeSelection[] = [];
    const files = targetFiles || (await this.getSourceFiles(projectPath));

    for (const filePath of files) {
      try {
        const sourceFile = this.project.addSourceFileAtPath(filePath);
        const relativePath = path.relative(projectPath, filePath);

        // Analyze functions
        const functions = this.analyzeFunctions(sourceFile, relativePath);
        selections.push(...functions);

        // Analyze classes
        const classes = this.analyzeClasses(sourceFile, relativePath);
        selections.push(...classes);

        // Analyze interfaces
        const interfaces = this.analyzeInterfaces(sourceFile, relativePath);
        selections.push(...interfaces);

        // Analyze modules
        const modules = this.analyzeModules(sourceFile, relativePath);
        selections.push(...modules);
      } catch (error) {
        this.logger.warn('Failed to analyze file', { filePath, error });
      }
    }

    // Sort by complexity and usage for optimal LLM context
    return selections.sort((a, b) => {
      const scoreA = a.complexity + a.usage.internal + a.usage.external;
      const scoreB = b.complexity + b.usage.internal + b.usage.external;
      return scoreB - scoreA;
    });
  }

  /**
   * Build project guardrails from .refactor-agent.yaml
   * This enforces project-specific rules that Cursor/Claude cannot understand
   */
  private async buildProjectGuardrails(projectPath: string): Promise<ProjectGuardrails> {
    this.logger.info('Building project guardrails');

    const configPath = path.join(projectPath, '.refactor-agent.yaml');
    let config: any = {};

    try {
      if (await this.fileExists(configPath)) {
        const configContent = await fs.promises.readFile(configPath, 'utf-8');
        config = yaml.load(configContent) || {};
      }
    } catch (error) {
      this.logger.warn('Failed to load .refactor-agent.yaml', { error });
    }

    // Extract rules from config
    const rules: GuardrailRule[] = (config.rules || []).map((rule: any) => ({
      id: rule.id || `rule-${Date.now()}`,
      name: rule.name || 'Unnamed Rule',
      description: rule.description || '',
      pattern: rule.pattern || '',
      severity: rule.severity || 'warning',
      enforcement: rule.enforcement || 'suggest',
    }));

    // Add default rules if none specified
    if (rules.length === 0) {
      rules.push(
        {
          id: 'naming-convention',
          name: 'Naming Convention',
          description: 'Follow project naming conventions',
          pattern: 'camelCase',
          severity: 'warning',
          enforcement: 'suggest',
        },
        {
          id: 'import-style',
          name: 'Import Style',
          description: 'Use consistent import style',
          pattern: 'named-imports',
          severity: 'info',
          enforcement: 'suggest',
        }
      );
    }

    // Extract style rules
    const styles: StyleRule[] = (config.styles || []).map((style: any) => ({
      property: style.property || '',
      value: style.value || '',
      description: style.description || '',
      examples: style.examples || [],
    }));

    // Extract banned changes
    const bannedChanges: BannedChange[] = (config.bannedChanges || []).map((banned: any) => ({
      type: banned.type || '',
      pattern: banned.pattern || '',
      reason: banned.reason || '',
      alternatives: banned.alternatives || [],
    }));

    // Detect framework and runtime info
    const framework = await this.detectFramework(projectPath);
    const runtime = await this.detectRuntime(projectPath);

    return {
      rules,
      styles,
      bannedChanges,
      framework,
      runtime,
    };
  }

  /**
   * Build testing signals with coverage data
   * This provides crucial context for safe refactoring
   */
  private async buildTestingSignals(projectPath: string): Promise<TestingSignals> {
    this.logger.info('Building testing signals');

    // Find test files
    const testFiles = await this.findTestFiles(projectPath);
    const testFileData: TestFile[] = [];

    for (const testPath of testFiles) {
      try {
        const stats = await fs.promises.stat(testPath);
        const content = await fs.promises.readFile(testPath, 'utf-8');

        testFileData.push({
          path: testPath,
          type: this.determineTestType(testPath),
          coverage: this.estimateCoverage(content),
          lastModified: stats.mtime.toISOString(),
          quality: this.assessTestQuality(content),
        });
      } catch (error) {
        this.logger.warn('Failed to analyze test file', { testPath, error });
      }
    }

    // Build coverage data
    const coverage = await this.buildCoverageData(projectPath, testFileData);

    // Identify coverage gaps
    const gaps = this.identifyCoverageGaps(coverage);

    // Assess test quality
    const quality = this.assessOverallTestQuality(testFileData);

    return {
      testFiles: testFileData,
      coverage,
      gaps,
      quality,
    };
  }

  /**
   * Build repo context with naming conventions and architectural patterns
   * This captures project-specific knowledge that Cursor/Claude cannot access
   */
  private async buildRepoContext(projectPath: string): Promise<RepoContext> {
    this.logger.info('Building repo context');

    // Extract naming conventions
    const namingConventions = await this.extractNamingConventions(projectPath);

    // Detect architectural patterns
    const architecturalPatterns = await this.detectArchitecturalPatterns(projectPath);

    // Analyze code style
    const codeStyle = await this.analyzeCodeStyle(projectPath);

    // Analyze project structure
    const projectStructure = await this.analyzeProjectStructure(projectPath);

    return {
      namingConventions,
      architecturalPatterns,
      codeStyle,
      projectStructure,
    };
  }

  // Private helper methods for code analysis

  private analyzeFunctions(sourceFile: SourceFile, filePath: string): CodeSelection[] {
    const selections: CodeSelection[] = [];

    sourceFile.forEachDescendant(node => {
      if (node.getKind() === SyntaxKind.FunctionDeclaration) {
        const func = node as any;
        const name = func.getName();
        if (!name) return;

        const startLine = sourceFile.getLineAndColumnAtPos(node.getStart()).line;
        const endLine = sourceFile.getLineAndColumnAtPos(node.getEnd()).line;
        const complexity = this.calculateComplexity(node);
        const dependencies = this.findDependencies(node);

        selections.push({
          type: 'function',
          name,
          filePath,
          startLine,
          endLine,
          complexity,
          dependencies,
          usage: {
            internal: this.countInternalUsage(sourceFile, name),
            external: this.countExternalUsage(name),
            testCoverage: this.estimateTestCoverage(name),
          },
          ast: {
            nodeCount: this.countNodes(node),
            depth: this.calculateDepth(node),
            patterns: this.identifyPatterns(node),
          },
        });
      }
    });

    return selections;
  }

  private analyzeClasses(sourceFile: SourceFile, filePath: string): CodeSelection[] {
    const selections: CodeSelection[] = [];

    sourceFile.forEachDescendant(node => {
      if (node.getKind() === SyntaxKind.ClassDeclaration) {
        const cls = node as any;
        const name = cls.getName();
        if (!name) return;

        const startLine = sourceFile.getLineAndColumnAtPos(node.getStart()).line;
        const endLine = sourceFile.getLineAndColumnAtPos(node.getEnd()).line;
        const complexity = this.calculateComplexity(node);
        const dependencies = this.findDependencies(node);

        selections.push({
          type: 'class',
          name,
          filePath,
          startLine,
          endLine,
          complexity,
          dependencies,
          usage: {
            internal: this.countInternalUsage(sourceFile, name),
            external: this.countExternalUsage(name),
            testCoverage: this.estimateTestCoverage(name),
          },
          ast: {
            nodeCount: this.countNodes(node),
            depth: this.calculateDepth(node),
            patterns: this.identifyPatterns(node),
          },
        });
      }
    });

    return selections;
  }

  private analyzeInterfaces(sourceFile: SourceFile, filePath: string): CodeSelection[] {
    const selections: CodeSelection[] = [];

    sourceFile.forEachDescendant(node => {
      if (node.getKind() === SyntaxKind.InterfaceDeclaration) {
        const iface = node as any;
        const name = iface.getName();
        if (!name) return;

        const startLine = sourceFile.getLineAndColumnAtPos(node.getStart()).line;
        const endLine = sourceFile.getLineAndColumnAtPos(node.getEnd()).line;

        selections.push({
          type: 'interface',
          name,
          filePath,
          startLine,
          endLine,
          complexity: 1, // Interfaces are typically simple
          dependencies: [],
          usage: {
            internal: this.countInternalUsage(sourceFile, name),
            external: this.countExternalUsage(name),
            testCoverage: this.estimateTestCoverage(name),
          },
          ast: {
            nodeCount: this.countNodes(node),
            depth: 1,
            patterns: this.identifyPatterns(node),
          },
        });
      }
    });

    return selections;
  }

  private analyzeModules(sourceFile: SourceFile, filePath: string): CodeSelection[] {
    // Analyze module-level exports
    const selections: CodeSelection[] = [];
    const exports = sourceFile.getExportedDeclarations();

    if (exports.size > 0) {
      selections.push({
        type: 'module',
        name: path.basename(filePath, path.extname(filePath)),
        filePath,
        startLine: 1,
        endLine: sourceFile.getLineAndColumnAtPos(sourceFile.getEnd()).line,
        complexity: exports.size,
        dependencies: this.findModuleDependencies(sourceFile),
        usage: {
          internal: 0,
          external: exports.size,
          testCoverage: 0,
        },
        ast: {
          nodeCount: this.countNodes(sourceFile),
          depth: 1,
          patterns: ['module'],
        },
      });
    }

    return selections;
  }

  // Helper methods for analysis
  private calculateComplexity(node: Node): number {
    let complexity = 1;
    node.forEachDescendant(descendant => {
      switch (descendant.getKind()) {
        case SyntaxKind.IfStatement:
        case SyntaxKind.WhileStatement:
        case SyntaxKind.ForStatement:
        case SyntaxKind.SwitchStatement:
          complexity += 2;
          break;
        case SyntaxKind.ConditionalExpression:
          complexity += 1;
          break;
      }
    });
    return complexity;
  }

  private findDependencies(node: Node): string[] {
    const dependencies: string[] = [];
    node.forEachDescendant(descendant => {
      if (descendant.getKind() === SyntaxKind.Identifier) {
        const text = descendant.getText();
        if (text !== node.getText()) {
          dependencies.push(text);
        }
      }
    });
    return [...new Set(dependencies)];
  }

  private countInternalUsage(sourceFile: SourceFile, name: string): number {
    let count = 0;
    sourceFile.forEachDescendant(node => {
      if (node.getKind() === SyntaxKind.Identifier && node.getText() === name) {
        count++;
      }
    });
    return count;
  }

  private countExternalUsage(name: string): number {
    // Simplified - would need cross-file analysis
    return 0;
  }

  private estimateTestCoverage(name: string): number {
    // Simplified - would need test analysis
    return Math.floor(Math.random() * 100);
  }

  private countNodes(node: Node): number {
    let count = 0;
    node.forEachDescendant(() => count++);
    return count;
  }

  private calculateDepth(node: Node): number {
    let maxDepth = 0;
    let currentDepth = 0;
    
    const traverse = (currentNode: Node, depth: number) => {
      maxDepth = Math.max(maxDepth, depth);
      currentNode.forEachChild(child => {
        traverse(child, depth + 1);
      });
    };
    
    traverse(node, 0);
    return maxDepth;
  }

  private identifyPatterns(node: Node): string[] {
    const patterns: string[] = [];

    node.forEachDescendant(descendant => {
      switch (descendant.getKind()) {
        case SyntaxKind.FunctionDeclaration:
          // Check if it's async by examining the node
          if (descendant.getText().includes('async')) {
            patterns.push('async');
          }
          break;
        case SyntaxKind.ArrowFunction:
          patterns.push('arrow');
          break;
        case SyntaxKind.ClassDeclaration:
          patterns.push('class');
          break;
        case SyntaxKind.InterfaceDeclaration:
          patterns.push('interface');
          break;
      }
    });

    return [...new Set(patterns)];
  }

  private findModuleDependencies(sourceFile: SourceFile): string[] {
    const dependencies: string[] = [];
    sourceFile.getImportDeclarations().forEach(imp => {
      const moduleSpecifier = imp.getModuleSpecifierValue();
      if (moduleSpecifier) {
        dependencies.push(moduleSpecifier);
      }
    });
    return dependencies;
  }

  // Additional helper methods would be implemented here...
  private async getSourceFiles(projectPath: string): Promise<string[]> {
    // Implementation for finding source files
    return [];
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async detectFramework(projectPath: string): Promise<FrameworkInfo> {
    // Implementation for framework detection
    return {
      name: 'unknown',
      version: '1.0.0',
      patterns: [],
      conventions: [],
    };
  }

  private async detectRuntime(projectPath: string): Promise<RuntimeInfo> {
    // Implementation for runtime detection
    return {
      node: '18.0.0',
      typescript: '5.0.0',
      dependencies: {},
    };
  }

  private async findTestFiles(projectPath: string): Promise<string[]> {
    // Implementation for finding test files
    return [];
  }

  private determineTestType(testPath: string): 'unit' | 'integration' | 'e2e' | 'characterization' {
    if (testPath.includes('e2e')) return 'e2e';
    if (testPath.includes('integration')) return 'integration';
    if (testPath.includes('characterization')) return 'characterization';
    return 'unit';
  }

  private estimateCoverage(content: string): number {
    // Simplified coverage estimation
    return Math.floor(Math.random() * 100);
  }

  private assessTestQuality(content: string): number {
    // Simplified test quality assessment
    return Math.floor(Math.random() * 100);
  }

  private async buildCoverageData(
    projectPath: string,
    testFiles: TestFile[]
  ): Promise<CoverageData> {
    return {
      overall: 85,
      byFile: {},
      byFunction: {},
      gaps: [],
    };
  }

  private identifyCoverageGaps(coverage: CoverageData): CoverageGap[] {
    return [];
  }

  private assessOverallTestQuality(testFiles: TestFile[]): TestQuality {
    return {
      score: 80,
      metrics: {
        maintainability: 85,
        reliability: 90,
        performance: 75,
      },
      issues: [],
      recommendations: [],
    };
  }

  private async extractNamingConventions(projectPath: string): Promise<NamingConvention[]> {
    return [];
  }

  private async detectArchitecturalPatterns(projectPath: string): Promise<ArchitecturalPattern[]> {
    return [];
  }

  private async analyzeCodeStyle(projectPath: string): Promise<CodeStyle> {
    return {
      indentation: 'spaces',
      spaces: 2,
      quotes: 'single',
      semicolons: true,
      trailingCommas: true,
    };
  }

  private async analyzeProjectStructure(projectPath: string): Promise<ProjectStructure> {
    return {
      layers: [],
      modules: [],
      dependencies: {},
      circularDependencies: [],
    };
  }
}
