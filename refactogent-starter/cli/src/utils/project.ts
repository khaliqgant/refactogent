import fs from 'fs';
import path from 'path';
import { ProjectInfo, ProjectType } from '../types/index.js';
import { Logger } from './logger.js';

export interface ProjectStructure {
  totalFiles: number;
  totalDirectories: number;
  filesByExtension: Map<string, number>;
  directoryStructure: DirectoryNode;
  largestFiles: FileInfo[];
  duplicateFiles: FileInfo[];
}

export interface DirectoryNode {
  name: string;
  path: string;
  type: 'directory' | 'file';
  size?: number;
  children?: DirectoryNode[];
}

export interface FileInfo {
  path: string;
  size: number;
  extension: string;
  lastModified: Date;
  hash?: string;
}

export interface DependencyInfo {
  name: string;
  version: string;
  type: 'production' | 'development' | 'peer' | 'optional';
  source: string; // package.json, requirements.txt, etc.
}

export interface ProjectHealthReport {
  projectInfo: ProjectInfo;
  structure: ProjectStructure;
  dependencies: DependencyInfo[];
  metrics: ProjectMetrics;
  recommendations: string[];
  riskFactors: RiskFactor[];
}

export interface ProjectMetrics {
  codeToTestRatio: number;
  averageFileSize: number;
  dependencyCount: number;
  outdatedDependencies: number;
  complexityScore: number;
  maintainabilityIndex: number;
}

export interface RiskFactor {
  type: 'high' | 'medium' | 'low';
  category: 'dependencies' | 'structure' | 'testing' | 'complexity';
  description: string;
  impact: string;
  recommendation: string;
}

export class ProjectAnalyzer {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Analyze project structure and detect type
   */
  async analyzeProject(projectPath: string): Promise<ProjectInfo> {
    this.logger.debug('Analyzing project', { path: projectPath });

    if (!fs.existsSync(projectPath)) {
      throw new Error(`Project path does not exist: ${projectPath}`);
    }

    const languages = this.detectLanguages(projectPath);
    const projectType = this.determineProjectType(languages);
    const hasTests = this.detectTests(projectPath);
    const configInfo = this.detectConfig(projectPath);

    const projectInfo: ProjectInfo = {
      path: projectPath,
      type: projectType,
      languages,
      hasTests,
      hasConfig: configInfo.hasConfig,
      configPath: configInfo.configPath
    };

    this.logger.info('Project analysis complete', {
      type: projectType,
      languages: languages.join(', '),
      hasTests,
      hasConfig: configInfo.hasConfig
    });

    return projectInfo;
  }

  /**
   * Generate comprehensive project health report
   */
  async generateHealthReport(projectPath: string): Promise<ProjectHealthReport> {
    this.logger.info('Generating project health report', { path: projectPath });

    const projectInfo = await this.analyzeProject(projectPath);
    const structure = await this.analyzeProjectStructure(projectPath);
    const dependencies = await this.analyzeDependencies(projectPath, projectInfo.type);
    const metrics = this.calculateMetrics(structure, dependencies, projectInfo);
    const riskFactors = this.assessRiskFactors(projectInfo, structure, dependencies, metrics);
    const recommendations = this.generateRecommendations(riskFactors, metrics);

    return {
      projectInfo,
      structure,
      dependencies,
      metrics,
      recommendations,
      riskFactors
    };
  }

  /**
   * Analyze project structure in detail
   */
  async analyzeProjectStructure(projectPath: string): Promise<ProjectStructure> {
    this.logger.debug('Analyzing project structure', { path: projectPath });

    const structure: ProjectStructure = {
      totalFiles: 0,
      totalDirectories: 0,
      filesByExtension: new Map(),
      directoryStructure: { name: path.basename(projectPath), path: projectPath, type: 'directory' },
      largestFiles: [],
      duplicateFiles: []
    };

    const allFiles: FileInfo[] = [];
    const fileHashes = new Map<string, FileInfo[]>();

    await this.traverseDirectory(projectPath, structure, allFiles, fileHashes);

    // Find largest files
    structure.largestFiles = allFiles
      .sort((a, b) => b.size - a.size)
      .slice(0, 10);

    // Find duplicate files
    for (const [hash, files] of fileHashes) {
      if (files.length > 1) {
        structure.duplicateFiles.push(...files);
      }
    }

    return structure;
  }

  /**
   * Analyze project dependencies
   */
  async analyzeDependencies(projectPath: string, projectType: ProjectType): Promise<DependencyInfo[]> {
    this.logger.debug('Analyzing dependencies', { projectPath, projectType });

    const dependencies: DependencyInfo[] = [];

    switch (projectType) {
      case 'typescript':
        dependencies.push(...await this.analyzeNodeDependencies(projectPath));
        break;
      case 'python':
        dependencies.push(...await this.analyzePythonDependencies(projectPath));
        break;
      case 'go':
        dependencies.push(...await this.analyzeGoDependencies(projectPath));
        break;
      case 'mixed':
        // Analyze all possible dependency files
        dependencies.push(...await this.analyzeNodeDependencies(projectPath));
        dependencies.push(...await this.analyzePythonDependencies(projectPath));
        dependencies.push(...await this.analyzeGoDependencies(projectPath));
        break;
    }

    return dependencies;
  }

  /**
   * Detect programming languages in the project
   */
  private detectLanguages(projectPath: string): string[] {
    const languages = new Set<string>();
    const languageMarkers = {
      typescript: ['package.json', 'tsconfig.json', '*.ts', '*.tsx'],
      javascript: ['package.json', '*.js', '*.jsx'],
      python: ['requirements.txt', 'pyproject.toml', 'setup.py', '*.py'],
      go: ['go.mod', 'go.sum', '*.go'],
      rust: ['Cargo.toml', '*.rs'],
      java: ['pom.xml', 'build.gradle', '*.java'],
      csharp: ['*.csproj', '*.cs']
    };

    for (const [lang, markers] of Object.entries(languageMarkers)) {
      if (this.hasAnyFile(projectPath, markers)) {
        languages.add(lang);
      }
    }

    return Array.from(languages);
  }

  /**
   * Check if project has any files matching patterns
   */
  private hasAnyFile(projectPath: string, patterns: string[]): boolean {
    for (const pattern of patterns) {
      if (pattern.startsWith('*.')) {
        // Check for file extension
        const ext = pattern.slice(1);
        if (this.hasFileWithExtension(projectPath, ext)) {
          return true;
        }
      } else {
        // Check for specific file
        if (fs.existsSync(path.join(projectPath, pattern))) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Check if project has files with specific extension
   */
  private hasFileWithExtension(projectPath: string, extension: string): boolean {
    try {
      const files = fs.readdirSync(projectPath);
      return files.some(file => file.endsWith(extension));
    } catch {
      return false;
    }
  }

  /**
   * Determine primary project type from detected languages
   */
  private determineProjectType(languages: string[]): ProjectType {
    if (languages.length === 0) {
      return 'unknown';
    }

    if (languages.length > 1) {
      return 'mixed';
    }

    const lang = languages[0];
    switch (lang) {
      case 'typescript':
      case 'javascript':
        return 'typescript';
      case 'python':
        return 'python';
      case 'go':
        return 'go';
      default:
        return 'unknown';
    }
  }

  /**
   * Detect if project has tests
   */
  private detectTests(projectPath: string): boolean {
    const testPatterns = [
      'test/**',
      'tests/**',
      '__tests__/**',
      'spec/**',
      '**/test_*.py',
      '**/*_test.go',
      '**/*.test.ts',
      '**/*.test.js',
      '**/*.spec.ts',
      '**/*.spec.js'
    ];

    // Simple check for test directories and files
    try {
      const entries = fs.readdirSync(projectPath);
      
      // Check for test directories
      const hasTestDir = entries.some(entry => {
        const fullPath = path.join(projectPath, entry);
        return fs.statSync(fullPath).isDirectory() && 
               ['test', 'tests', '__tests__', 'spec'].includes(entry.toLowerCase());
      });

      if (hasTestDir) {
        return true;
      }

      // Check for test files in root
      const hasTestFiles = entries.some(entry => {
        return entry.includes('test') || entry.includes('spec');
      });

      return hasTestFiles;
    } catch {
      return false;
    }
  }

  /**
   * Detect RefactoAgent configuration
   */
  private detectConfig(projectPath: string): { hasConfig: boolean; configPath?: string } {
    const configFiles = [
      '.refactor-agent.yaml',
      '.refactor-agent.yml',
      '.refactogent.yaml',
      '.refactogent.yml'
    ];

    for (const configFile of configFiles) {
      const configPath = path.join(projectPath, configFile);
      if (fs.existsSync(configPath)) {
        return { hasConfig: true, configPath };
      }
    }

    return { hasConfig: false };
  }

  /**
   * Recursively traverse directory and collect file information
   */
  private async traverseDirectory(
    dirPath: string, 
    structure: ProjectStructure, 
    allFiles: FileInfo[], 
    fileHashes: Map<string, FileInfo[]>,
    currentNode?: DirectoryNode
  ): Promise<void> {
    const crypto = await import('crypto');
    
    try {
      const entries = fs.readdirSync(dirPath);
      
      if (currentNode) {
        currentNode.children = [];
      }

      for (const entry of entries) {
        // Skip common directories that shouldn't be analyzed
        if (['node_modules', '.git', 'dist', 'build', '__pycache__', '.venv', 'venv'].includes(entry)) {
          continue;
        }

        const fullPath = path.join(dirPath, entry);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          structure.totalDirectories++;
          
          const dirNode: DirectoryNode = {
            name: entry,
            path: fullPath,
            type: 'directory'
          };

          if (currentNode) {
            currentNode.children!.push(dirNode);
          }

          await this.traverseDirectory(fullPath, structure, allFiles, fileHashes, dirNode);
        } else {
          structure.totalFiles++;
          
          const extension = path.extname(entry);
          const currentCount = structure.filesByExtension.get(extension) || 0;
          structure.filesByExtension.set(extension, currentCount + 1);

          const fileInfo: FileInfo = {
            path: fullPath,
            size: stat.size,
            extension,
            lastModified: stat.mtime
          };

          // Calculate file hash for duplicate detection
          try {
            const content = fs.readFileSync(fullPath);
            const hash = crypto.createHash('md5').update(content).digest('hex');
            fileInfo.hash = hash;

            if (!fileHashes.has(hash)) {
              fileHashes.set(hash, []);
            }
            fileHashes.get(hash)!.push(fileInfo);
          } catch (error) {
            // Skip files that can't be read
          }

          allFiles.push(fileInfo);

          if (currentNode) {
            currentNode.children!.push({
              name: entry,
              path: fullPath,
              type: 'file',
              size: stat.size
            });
          }
        }
      }
    } catch (error) {
      this.logger.warn('Error traversing directory', { 
        dirPath, 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  }

  /**
   * Analyze Node.js dependencies from package.json
   */
  private async analyzeNodeDependencies(projectPath: string): Promise<DependencyInfo[]> {
    const packageJsonPath = path.join(projectPath, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      return [];
    }

    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const dependencies: DependencyInfo[] = [];

      // Production dependencies
      if (packageJson.dependencies) {
        for (const [name, version] of Object.entries(packageJson.dependencies)) {
          dependencies.push({
            name,
            version: version as string,
            type: 'production',
            source: 'package.json'
          });
        }
      }

      // Development dependencies
      if (packageJson.devDependencies) {
        for (const [name, version] of Object.entries(packageJson.devDependencies)) {
          dependencies.push({
            name,
            version: version as string,
            type: 'development',
            source: 'package.json'
          });
        }
      }

      // Peer dependencies
      if (packageJson.peerDependencies) {
        for (const [name, version] of Object.entries(packageJson.peerDependencies)) {
          dependencies.push({
            name,
            version: version as string,
            type: 'peer',
            source: 'package.json'
          });
        }
      }

      return dependencies;
    } catch (error) {
      this.logger.warn('Error analyzing Node.js dependencies', { error });
      return [];
    }
  }

  /**
   * Analyze Python dependencies from requirements.txt and pyproject.toml
   */
  private async analyzePythonDependencies(projectPath: string): Promise<DependencyInfo[]> {
    const dependencies: DependencyInfo[] = [];

    // Check requirements.txt
    const requirementsPath = path.join(projectPath, 'requirements.txt');
    if (fs.existsSync(requirementsPath)) {
      try {
        const content = fs.readFileSync(requirementsPath, 'utf8');
        const lines = content.split('\n').filter(line => line.trim() && !line.startsWith('#'));
        
        for (const line of lines) {
          const match = line.trim().match(/^([^=<>!]+)([=<>!].+)?$/);
          if (match) {
            dependencies.push({
              name: match[1].trim(),
              version: match[2] || 'latest',
              type: 'production',
              source: 'requirements.txt'
            });
          }
        }
      } catch (error) {
        this.logger.warn('Error reading requirements.txt', { error });
      }
    }

    // Check pyproject.toml (basic parsing)
    const pyprojectPath = path.join(projectPath, 'pyproject.toml');
    if (fs.existsSync(pyprojectPath)) {
      try {
        const content = fs.readFileSync(pyprojectPath, 'utf8');
        // Simple regex-based parsing for dependencies
        const depMatches = content.match(/dependencies\s*=\s*\[([\s\S]*?)\]/);
        if (depMatches) {
          const depSection = depMatches[1];
          const depLines = depSection.split('\n').filter(line => line.includes('"'));
          
          for (const line of depLines) {
            const match = line.match(/"([^"]+)"/);
            if (match) {
              const depString = match[1];
              const nameMatch = depString.match(/^([^=<>!]+)/);
              if (nameMatch) {
                dependencies.push({
                  name: nameMatch[1].trim(),
                  version: depString.replace(nameMatch[1], '').trim() || 'latest',
                  type: 'production',
                  source: 'pyproject.toml'
                });
              }
            }
          }
        }
      } catch (error) {
        this.logger.warn('Error reading pyproject.toml', { error });
      }
    }

    return dependencies;
  }

  /**
   * Analyze Go dependencies from go.mod
   */
  private async analyzeGoDependencies(projectPath: string): Promise<DependencyInfo[]> {
    const goModPath = path.join(projectPath, 'go.mod');
    if (!fs.existsSync(goModPath)) {
      return [];
    }

    try {
      const content = fs.readFileSync(goModPath, 'utf8');
      const dependencies: DependencyInfo[] = [];
      
      // Parse require block
      const requireMatch = content.match(/require\s*\(([\s\S]*?)\)/);
      if (requireMatch) {
        const requireSection = requireMatch[1];
        const lines = requireSection.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          const match = line.trim().match(/^([^\s]+)\s+([^\s]+)/);
          if (match) {
            dependencies.push({
              name: match[1],
              version: match[2],
              type: 'production',
              source: 'go.mod'
            });
          }
        }
      }

      // Parse single-line requires
      const singleRequires = content.match(/require\s+([^\s]+)\s+([^\s]+)/g);
      if (singleRequires) {
        for (const req of singleRequires) {
          const match = req.match(/require\s+([^\s]+)\s+([^\s]+)/);
          if (match) {
            dependencies.push({
              name: match[1],
              version: match[2],
              type: 'production',
              source: 'go.mod'
            });
          }
        }
      }

      return dependencies;
    } catch (error) {
      this.logger.warn('Error analyzing Go dependencies', { error });
      return [];
    }
  }

  /**
   * Calculate project metrics
   */
  private calculateMetrics(
    structure: ProjectStructure, 
    dependencies: DependencyInfo[], 
    projectInfo: ProjectInfo
  ): ProjectMetrics {
    const totalFiles = structure.totalFiles;
    const totalSize = Array.from(structure.filesByExtension.entries())
      .reduce((sum, [ext, count]) => sum + count, 0);

    // Calculate code to test ratio
    const codeFiles = this.getCodeFileCount(structure.filesByExtension);
    const testFiles = this.getTestFileCount(structure.filesByExtension);
    const codeToTestRatio = testFiles > 0 ? codeFiles / testFiles : codeFiles;

    // Calculate average file size
    const averageFileSize = totalFiles > 0 ? totalSize / totalFiles : 0;

    // Dependency metrics
    const dependencyCount = dependencies.length;
    const outdatedDependencies = this.countOutdatedDependencies(dependencies);

    // Complexity score (simplified)
    const complexityScore = this.calculateComplexityScore(structure, dependencies);

    // Maintainability index (simplified)
    const maintainabilityIndex = this.calculateMaintainabilityIndex(
      structure, 
      dependencies, 
      codeToTestRatio
    );

    return {
      codeToTestRatio,
      averageFileSize,
      dependencyCount,
      outdatedDependencies,
      complexityScore,
      maintainabilityIndex
    };
  }

  /**
   * Assess risk factors
   */
  private assessRiskFactors(
    projectInfo: ProjectInfo,
    structure: ProjectStructure,
    dependencies: DependencyInfo[],
    metrics: ProjectMetrics
  ): RiskFactor[] {
    const risks: RiskFactor[] = [];

    // Testing risks
    if (!projectInfo.hasTests) {
      risks.push({
        type: 'high',
        category: 'testing',
        description: 'No test files detected',
        impact: 'High risk of introducing bugs during refactoring',
        recommendation: 'Add comprehensive test coverage before refactoring'
      });
    } else if (metrics.codeToTestRatio > 10) {
      risks.push({
        type: 'medium',
        category: 'testing',
        description: 'Low test coverage ratio',
        impact: 'Moderate risk of undetected regressions',
        recommendation: 'Increase test coverage, especially for critical paths'
      });
    }

    // Dependency risks
    if (metrics.dependencyCount > 50) {
      risks.push({
        type: 'medium',
        category: 'dependencies',
        description: 'High number of dependencies',
        impact: 'Increased complexity and potential for conflicts',
        recommendation: 'Review and remove unused dependencies'
      });
    }

    if (metrics.outdatedDependencies > 5) {
      risks.push({
        type: 'medium',
        category: 'dependencies',
        description: 'Multiple outdated dependencies',
        impact: 'Security vulnerabilities and compatibility issues',
        recommendation: 'Update dependencies to latest stable versions'
      });
    }

    // Structure risks
    if (structure.totalFiles > 1000) {
      risks.push({
        type: 'low',
        category: 'structure',
        description: 'Large codebase',
        impact: 'Refactoring operations may take longer',
        recommendation: 'Consider breaking into smaller modules'
      });
    }

    if (structure.duplicateFiles.length > 0) {
      risks.push({
        type: 'low',
        category: 'structure',
        description: 'Duplicate files detected',
        impact: 'Potential inconsistencies and maintenance overhead',
        recommendation: 'Review and consolidate duplicate files'
      });
    }

    // Complexity risks
    if (metrics.complexityScore > 7) {
      risks.push({
        type: 'high',
        category: 'complexity',
        description: 'High complexity score',
        impact: 'Difficult to refactor safely',
        recommendation: 'Simplify complex areas before major refactoring'
      });
    }

    return risks;
  }

  /**
   * Generate recommendations based on analysis
   */
  private generateRecommendations(risks: RiskFactor[], metrics: ProjectMetrics): string[] {
    const recommendations: string[] = [];

    // Add risk-based recommendations
    risks.forEach(risk => {
      if (!recommendations.includes(risk.recommendation)) {
        recommendations.push(risk.recommendation);
      }
    });

    // Add metric-based recommendations
    if (metrics.maintainabilityIndex < 50) {
      recommendations.push('Focus on improving code maintainability before refactoring');
    }

    if (metrics.averageFileSize > 1000) {
      recommendations.push('Consider breaking down large files into smaller modules');
    }

    // Add general recommendations
    recommendations.push('Run characterization tests before any refactoring');
    recommendations.push('Start with small, low-risk refactoring operations');
    recommendations.push('Ensure all tests pass before and after refactoring');

    return recommendations;
  }

  // Helper methods
  private getCodeFileCount(filesByExtension: Map<string, number>): number {
    const codeExtensions = ['.ts', '.js', '.tsx', '.jsx', '.py', '.go', '.java', '.cs', '.cpp', '.c'];
    return codeExtensions.reduce((count, ext) => count + (filesByExtension.get(ext) || 0), 0);
  }

  private getTestFileCount(filesByExtension: Map<string, number>): number {
    const testExtensions = ['.test.ts', '.test.js', '.spec.ts', '.spec.js', '_test.py', '_test.go'];
    return testExtensions.reduce((count, ext) => count + (filesByExtension.get(ext) || 0), 0);
  }

  private countOutdatedDependencies(dependencies: DependencyInfo[]): number {
    // Simplified - in reality, we'd check against a registry
    return dependencies.filter(dep => 
      dep.version.includes('^') || dep.version.includes('~') || dep.version === 'latest'
    ).length;
  }

  private calculateComplexityScore(structure: ProjectStructure, dependencies: DependencyInfo[]): number {
    // Simplified complexity calculation
    const fileComplexity = Math.min(structure.totalFiles / 100, 5);
    const depComplexity = Math.min(dependencies.length / 20, 5);
    const dirComplexity = Math.min(structure.totalDirectories / 50, 3);
    
    return Math.round((fileComplexity + depComplexity + dirComplexity) * 10) / 10;
  }

  private calculateMaintainabilityIndex(
    structure: ProjectStructure, 
    dependencies: DependencyInfo[], 
    codeToTestRatio: number
  ): number {
    // Simplified maintainability index (0-100)
    let score = 100;
    
    // Penalize for high complexity
    if (structure.totalFiles > 500) score -= 20;
    if (dependencies.length > 30) score -= 15;
    if (codeToTestRatio > 5) score -= 25;
    if (structure.duplicateFiles.length > 0) score -= 10;
    
    return Math.max(0, score);
  }
}