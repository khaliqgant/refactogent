import fs from 'fs';
import path from 'path';
import { ProjectInfo, ProjectType } from '../types/index.js';
import { Logger } from './logger.js';

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
}