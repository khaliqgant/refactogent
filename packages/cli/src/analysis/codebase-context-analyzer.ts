import { Logger } from '../utils/logger.js';
import { ProjectAST, ModuleAST, CodeSymbol, DependencyGraph } from './ast-types.js';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface CodebaseContext {
  projectStructure: ProjectStructure;
  architecturalPatterns: ArchitecturalPattern[];
  namingConventions: NamingConventions;
  crossFileDependencies: CrossFileDependency[];
  refactoringOpportunities: RefactoringOpportunity[];
  llmContext: LLMContext;
}

export interface ProjectStructure {
  rootPath: string;
  languages: string[];
  modules: ModuleInfo[];
  entryPoints: string[];
  testFiles: string[];
  configFiles: string[];
}

export interface ModuleInfo {
  filePath: string;
  language: string;
  exports: string[];
  imports: string[];
  dependencies: string[];
  complexity: number;
  size: number;
}

export interface ArchitecturalPattern {
  type: 'mvc' | 'layered' | 'microservices' | 'monolith' | 'component-based';
  confidence: number;
  evidence: string[];
  files: string[];
}

export interface NamingConventions {
  functions: string;
  variables: string;
  classes: string;
  files: string;
  constants: string;
}

export interface CrossFileDependency {
  from: string;
  to: string;
  type: 'import' | 'inheritance' | 'composition' | 'callback' | 'event';
  strength: number;
}

export interface RefactoringOpportunity {
  type: 'extract' | 'inline' | 'rename' | 'move' | 'split' | 'merge';
  file: string;
  description: string;
  impact: 'low' | 'medium' | 'high';
  confidence: number;
  suggestedName?: string;
}

export interface LLMContext {
  projectSummary: string;
  architecturalOverview: string;
  namingPatterns: string;
  refactoringStrategy: string;
  safetyConstraints: string[];
}

export class CodebaseContextAnalyzer {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Analyze the entire codebase to provide comprehensive context for LLM-based refactoring
   */
  async analyzeCodebaseContext(projectPath: string): Promise<CodebaseContext> {
    this.logger.info('Starting comprehensive codebase context analysis', { projectPath });

    try {
      // 1. Analyze project structure
      const projectStructure = await this.analyzeProjectStructure(projectPath);

      // 2. Detect architectural patterns
      const architecturalPatterns = await this.detectArchitecturalPatterns(projectStructure);

      // 3. Analyze naming conventions
      const namingConventions = await this.analyzeNamingConventions(projectStructure);

      // 4. Map cross-file dependencies
      const crossFileDependencies = await this.mapCrossFileDependencies(projectStructure);

      // 5. Identify refactoring opportunities
      const refactoringOpportunities =
        await this.identifyRefactoringOpportunities(projectStructure);

      // 6. Generate LLM context
      const llmContext = await this.generateLLMContext(
        projectStructure,
        architecturalPatterns,
        namingConventions,
        crossFileDependencies,
        refactoringOpportunities
      );

      return {
        projectStructure,
        architecturalPatterns,
        namingConventions,
        crossFileDependencies,
        refactoringOpportunities,
        llmContext,
      };
    } catch (error) {
      this.logger.error('Failed to analyze codebase context', { error });
      throw error;
    }
  }

  /**
   * Analyze project structure and organization
   */
  private async analyzeProjectStructure(projectPath: string): Promise<ProjectStructure> {
    const modules: ModuleInfo[] = [];
    const entryPoints: string[] = [];
    const testFiles: string[] = [];
    const configFiles: string[] = [];
    const languages = new Set<string>();

    // Recursively scan the project
    await this.scanDirectory(
      projectPath,
      projectPath,
      modules,
      entryPoints,
      testFiles,
      configFiles,
      languages
    );

    return {
      rootPath: projectPath,
      languages: Array.from(languages),
      modules,
      entryPoints,
      testFiles,
      configFiles,
    };
  }

  /**
   * Recursively scan directory for source files
   */
  private async scanDirectory(
    rootPath: string,
    currentPath: string,
    modules: ModuleInfo[],
    entryPoints: string[],
    testFiles: string[],
    configFiles: string[],
    languages: Set<string>
  ): Promise<void> {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      const relativePath = path.relative(rootPath, fullPath);

      // Skip common non-source directories
      if (entry.isDirectory()) {
        if (
          entry.name.startsWith('.') ||
          entry.name === 'node_modules' ||
          entry.name === 'dist' ||
          entry.name === 'build' ||
          entry.name === 'coverage'
        ) {
          continue;
        }
        await this.scanDirectory(
          rootPath,
          fullPath,
          modules,
          entryPoints,
          testFiles,
          configFiles,
          languages
        );
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        const language = this.detectLanguage(ext);

        if (language) {
          languages.add(language);

          // Analyze the file
          const moduleInfo = await this.analyzeModule(fullPath, language);
          modules.push(moduleInfo);

          // Categorize files
          if (this.isEntryPoint(entry.name, relativePath)) {
            entryPoints.push(fullPath);
          }
          if (this.isTestFile(entry.name, relativePath)) {
            testFiles.push(fullPath);
          }
          if (this.isConfigFile(entry.name)) {
            configFiles.push(fullPath);
          }
        }
      }
    }
  }

  /**
   * Detect programming language from file extension
   */
  private detectLanguage(ext: string): string | null {
    const languageMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.py': 'python',
      '.go': 'go',
      '.java': 'java',
      '.cs': 'csharp',
      '.php': 'php',
      '.rb': 'ruby',
      '.rs': 'rust',
    };
    return languageMap[ext] || null;
  }

  /**
   * Analyze a single module/file
   */
  private async analyzeModule(filePath: string, language: string): Promise<ModuleInfo> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const stats = await fs.stat(filePath);

      // Basic analysis (in production, this would use AST parsing)
      const exports = this.extractExports(content, language);
      const imports = this.extractImports(content, language);
      const complexity = this.calculateComplexity(content);

      return {
        filePath,
        language,
        exports,
        imports,
        dependencies: imports,
        complexity,
        size: stats.size,
      };
    } catch (error) {
      this.logger.warn('Failed to analyze module', { filePath, error });
      return {
        filePath,
        language,
        exports: [],
        imports: [],
        dependencies: [],
        complexity: 0,
        size: 0,
      };
    }
  }

  /**
   * Extract exports from file content
   */
  private extractExports(content: string, language: string): string[] {
    const exports: string[] = [];

    if (language === 'typescript' || language === 'javascript') {
      // Match export statements
      const exportRegex =
        /export\s+(?:default\s+)?(?:function\s+(\w+)|const\s+(\w+)|class\s+(\w+)|interface\s+(\w+)|type\s+(\w+)|(\w+))/g;
      let match;
      while ((match = exportRegex.exec(content)) !== null) {
        const exportName = match[1] || match[2] || match[3] || match[4] || match[5] || match[6];
        if (exportName) exports.push(exportName);
      }
    }

    return exports;
  }

  /**
   * Extract imports from file content
   */
  private extractImports(content: string, language: string): string[] {
    const imports: string[] = [];

    if (language === 'typescript' || language === 'javascript') {
      // Match import statements
      const importRegex = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
      let match;
      while ((match = importRegex.exec(content)) !== null) {
        imports.push(match[1]);
      }
    }

    return imports;
  }

  /**
   * Calculate code complexity
   */
  private calculateComplexity(content: string): number {
    // Simple complexity calculation based on control structures
    const complexityKeywords = ['if', 'else', 'for', 'while', 'switch', 'case', 'catch', 'try'];
    let complexity = 1; // Base complexity

    for (const keyword of complexityKeywords) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'g');
      const matches = content.match(regex);
      if (matches) {
        complexity += matches.length;
      }
    }

    return complexity;
  }

  /**
   * Check if file is an entry point
   */
  private isEntryPoint(fileName: string, relativePath: string): boolean {
    const entryPointNames = ['index', 'main', 'app', 'server'];
    const baseName = path.basename(fileName, path.extname(fileName));
    return entryPointNames.includes(baseName) || relativePath.includes('src/index');
  }

  /**
   * Check if file is a test file
   */
  private isTestFile(fileName: string, relativePath: string): boolean {
    return (
      fileName.includes('.test.') ||
      fileName.includes('.spec.') ||
      relativePath.includes('/test/') ||
      relativePath.includes('/tests/')
    );
  }

  /**
   * Check if file is a config file
   */
  private isConfigFile(fileName: string): boolean {
    const configNames = [
      'package.json',
      'tsconfig.json',
      'webpack.config.js',
      'vite.config.js',
      'jest.config.js',
    ];
    return configNames.includes(fileName);
  }

  /**
   * Detect architectural patterns in the codebase
   */
  private async detectArchitecturalPatterns(
    projectStructure: ProjectStructure
  ): Promise<ArchitecturalPattern[]> {
    const patterns: ArchitecturalPattern[] = [];

    // Detect MVC pattern
    const mvcEvidence = this.detectMVCPattern(projectStructure);
    if (mvcEvidence.length > 0) {
      patterns.push({
        type: 'mvc',
        confidence: 0.8,
        evidence: mvcEvidence,
        files: projectStructure.modules
          .filter(
            m =>
              m.filePath.includes('/controllers/') ||
              m.filePath.includes('/models/') ||
              m.filePath.includes('/views/')
          )
          .map(m => m.filePath),
      });
    }

    // Detect component-based architecture
    const componentEvidence = this.detectComponentPattern(projectStructure);
    if (componentEvidence.length > 0) {
      patterns.push({
        type: 'component-based',
        confidence: 0.7,
        evidence: componentEvidence,
        files: projectStructure.modules
          .filter(m => m.filePath.includes('/components/') || m.filePath.includes('.component.'))
          .map(m => m.filePath),
      });
    }

    return patterns;
  }

  /**
   * Detect MVC pattern
   */
  private detectMVCPattern(projectStructure: ProjectStructure): string[] {
    const evidence: string[] = [];

    const hasControllers = projectStructure.modules.some(
      m => m.filePath.includes('/controllers/') || m.filePath.includes('Controller')
    );
    const hasModels = projectStructure.modules.some(
      m => m.filePath.includes('/models/') || m.filePath.includes('Model')
    );
    const hasViews = projectStructure.modules.some(
      m => m.filePath.includes('/views/') || m.filePath.includes('/templates/')
    );

    if (hasControllers) evidence.push('Controllers directory found');
    if (hasModels) evidence.push('Models directory found');
    if (hasViews) evidence.push('Views directory found');

    return evidence;
  }

  /**
   * Detect component-based pattern
   */
  private detectComponentPattern(projectStructure: ProjectStructure): string[] {
    const evidence: string[] = [];

    const hasComponents = projectStructure.modules.some(
      m => m.filePath.includes('/components/') || m.filePath.includes('.component.')
    );
    const hasReact = projectStructure.modules.some(
      m => m.imports.includes('react') || m.filePath.endsWith('.tsx')
    );

    if (hasComponents) evidence.push('Components directory found');
    if (hasReact) evidence.push('React components detected');

    return evidence;
  }

  /**
   * Analyze naming conventions across the codebase
   */
  private async analyzeNamingConventions(
    projectStructure: ProjectStructure
  ): Promise<NamingConventions> {
    // Analyze function names
    const functionNames = this.extractFunctionNames(projectStructure);
    const functionConvention = this.detectNamingConvention(functionNames);

    // Analyze variable names
    const variableNames = this.extractVariableNames(projectStructure);
    const variableConvention = this.detectNamingConvention(variableNames);

    // Analyze class names
    const classNames = this.extractClassNames(projectStructure);
    const classConvention = this.detectNamingConvention(classNames);

    // Analyze file names
    const fileNames = projectStructure.modules.map(m => path.basename(m.filePath));
    const fileConvention = this.detectNamingConvention(fileNames);

    // Analyze constants
    const constantNames = this.extractConstantNames(projectStructure);
    const constantConvention = this.detectNamingConvention(constantNames);

    return {
      functions: functionConvention,
      variables: variableConvention,
      classes: classConvention,
      files: fileConvention,
      constants: constantConvention,
    };
  }

  /**
   * Extract function names from codebase
   */
  private extractFunctionNames(projectStructure: ProjectStructure): string[] {
    // This would be implemented with proper AST parsing
    // For now, return mock data
    return ['getUserData', 'processRequest', 'validateInput', 'calculateTotal'];
  }

  /**
   * Extract variable names from codebase
   */
  private extractVariableNames(projectStructure: ProjectStructure): string[] {
    // This would be implemented with proper AST parsing
    return ['userData', 'requestId', 'totalAmount', 'isValid'];
  }

  /**
   * Extract class names from codebase
   */
  private extractClassNames(projectStructure: ProjectStructure): string[] {
    // This would be implemented with proper AST parsing
    return ['UserService', 'RequestHandler', 'DataValidator', 'PaymentProcessor'];
  }

  /**
   * Extract constant names from codebase
   */
  private extractConstantNames(projectStructure: ProjectStructure): string[] {
    // This would be implemented with proper AST parsing
    return ['API_BASE_URL', 'MAX_RETRIES', 'DEFAULT_TIMEOUT'];
  }

  /**
   * Detect naming convention (camelCase, snake_case, PascalCase, etc.)
   */
  private detectNamingConvention(names: string[]): string {
    if (names.length === 0) return 'unknown';

    const camelCase = names.filter(name => /^[a-z][a-zA-Z0-9]*$/.test(name)).length;
    const snakeCase = names.filter(name => /^[a-z][a-z0-9_]*$/.test(name)).length;
    const PascalCase = names.filter(name => /^[A-Z][a-zA-Z0-9]*$/.test(name)).length;

    if (camelCase > snakeCase && camelCase > PascalCase) return 'camelCase';
    if (snakeCase > camelCase && snakeCase > PascalCase) return 'snake_case';
    if (PascalCase > camelCase && PascalCase > snakeCase) return 'PascalCase';

    return 'mixed';
  }

  /**
   * Map cross-file dependencies
   */
  private async mapCrossFileDependencies(
    projectStructure: ProjectStructure
  ): Promise<CrossFileDependency[]> {
    const dependencies: CrossFileDependency[] = [];

    for (const module of projectStructure.modules) {
      for (const importPath of module.imports) {
        // Find the target file
        const targetModule = projectStructure.modules.find(
          m => m.filePath.includes(importPath) || importPath.includes(m.filePath)
        );

        if (targetModule) {
          dependencies.push({
            from: module.filePath,
            to: targetModule.filePath,
            type: 'import',
            strength: 1.0,
          });
        }
      }
    }

    return dependencies;
  }

  /**
   * Identify refactoring opportunities
   */
  private async identifyRefactoringOpportunities(
    projectStructure: ProjectStructure
  ): Promise<RefactoringOpportunity[]> {
    const opportunities: RefactoringOpportunity[] = [];

    // Find large files that could be split
    const largeFiles = projectStructure.modules.filter(m => m.size > 10000);
    for (const file of largeFiles) {
      opportunities.push({
        type: 'split',
        file: file.filePath,
        description: `Large file (${file.size} bytes) could be split into smaller modules`,
        impact: 'medium',
        confidence: 0.8,
      });
    }

    // Find high complexity files
    const complexFiles = projectStructure.modules.filter(m => m.complexity > 20);
    for (const file of complexFiles) {
      opportunities.push({
        type: 'extract',
        file: file.filePath,
        description: `High complexity file (${file.complexity}) could benefit from function extraction`,
        impact: 'high',
        confidence: 0.9,
      });
    }

    return opportunities;
  }

  /**
   * Generate comprehensive LLM context
   */
  private async generateLLMContext(
    projectStructure: ProjectStructure,
    architecturalPatterns: ArchitecturalPattern[],
    namingConventions: NamingConventions,
    crossFileDependencies: CrossFileDependency[],
    refactoringOpportunities: RefactoringOpportunity[]
  ): Promise<LLMContext> {
    const projectSummary = this.generateProjectSummary(projectStructure);
    const architecturalOverview = this.generateArchitecturalOverview(architecturalPatterns);
    const namingPatterns = this.generateNamingPatterns(namingConventions);
    const refactoringStrategy = this.generateRefactoringStrategy(refactoringOpportunities);
    const safetyConstraints = this.generateSafetyConstraints(projectStructure);

    return {
      projectSummary,
      architecturalOverview,
      namingPatterns,
      refactoringStrategy,
      safetyConstraints,
    };
  }

  /**
   * Generate project summary for LLM
   */
  private generateProjectSummary(projectStructure: ProjectStructure): string {
    return `Project: ${projectStructure.rootPath}
Languages: ${projectStructure.languages.join(', ')}
Total Files: ${projectStructure.modules.length}
Entry Points: ${projectStructure.entryPoints.length}
Test Files: ${projectStructure.testFiles.length}
Config Files: ${projectStructure.configFiles.length}`;
  }

  /**
   * Generate architectural overview for LLM
   */
  private generateArchitecturalOverview(patterns: ArchitecturalPattern[]): string {
    if (patterns.length === 0) {
      return 'No clear architectural patterns detected';
    }

    return patterns
      .map(
        pattern =>
          `${pattern.type.toUpperCase()} pattern (confidence: ${pattern.confidence}): ${pattern.evidence.join(', ')}`
      )
      .join('\n');
  }

  /**
   * Generate naming patterns for LLM
   */
  private generateNamingPatterns(conventions: NamingConventions): string {
    return `Functions: ${conventions.functions}
Variables: ${conventions.variables}
Classes: ${conventions.classes}
Files: ${conventions.files}
Constants: ${conventions.constants}`;
  }

  /**
   * Generate refactoring strategy for LLM
   */
  private generateRefactoringStrategy(opportunities: RefactoringOpportunity[]): string {
    if (opportunities.length === 0) {
      return 'No refactoring opportunities identified';
    }

    return opportunities
      .map(
        opp =>
          `${opp.type.toUpperCase()}: ${opp.description} (impact: ${opp.impact}, confidence: ${opp.confidence})`
      )
      .join('\n');
  }

  /**
   * Generate safety constraints for LLM
   */
  private generateSafetyConstraints(projectStructure: ProjectStructure): string[] {
    const constraints: string[] = [];

    // Preserve test files
    if (projectStructure.testFiles.length > 0) {
      constraints.push('Preserve all test files and their functionality');
    }

    // Preserve entry points
    if (projectStructure.entryPoints.length > 0) {
      constraints.push('Preserve entry point functionality');
    }

    // Preserve config files
    if (projectStructure.configFiles.length > 0) {
      constraints.push('Preserve configuration files');
    }

    return constraints;
  }
}
