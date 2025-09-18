import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { RefactogentConfig, ProjectType } from '../types/index.js';
import { Logger } from './logger.js';

const DEFAULT_CONFIG: RefactogentConfig = {
  version: '1',
  maxPrLoc: 300,
  branchPrefix: 'refactor/',
  modesAllowed: ['organize-only', 'name-hygiene', 'tests-first', 'micro-simplify'],
  protectedPaths: [
    'api/public/**',
    'pages/**',
    'app/**',
    'cli/**'
  ],
  gates: {
    requireCharacterizationTests: true,
    requireGreenCi: true,
    minLineCoverageDelta: '>=0',
    minBranchCoverageDelta: '>=0',
    mutationScoreThreshold: 0.05,
    forbidPublicApiChanges: true,
    forbidDependencyChanges: true
  },
  languages: {
    ts: {
      build: 'npm run build',
      test: 'npm test -- --runInBand',
      lints: ['npm run lint', 'tsc --noEmit']
    },
    py: {
      build: 'python -m compileall .',
      test: 'pytest -q',
      lints: ['ruff check .', 'mypy --strict']
    },
    go: {
      build: 'go build ./...',
      test: 'go test ./...',
      lints: ['golangci-lint run']
    }
  },
  semantics: {
    httpGoldenRoutes: ['GET /**', 'POST /**'],
    tolerate: {
      jsonFieldsIgnored: ['id', 'createdAt', 'updatedAt', 'traceId'],
      headerFieldsIgnored: ['date', 'etag']
    }
  }
};

export class ConfigLoader {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Load configuration from project directory
   */
  async loadConfig(projectPath: string): Promise<RefactogentConfig> {
    const configPaths = [
      path.join(projectPath, '.refactor-agent.yaml'),
      path.join(projectPath, '.refactor-agent.yml'),
      path.join(projectPath, '.refactogent.yaml'),
      path.join(projectPath, '.refactogent.yml')
    ];

    for (const configPath of configPaths) {
      if (fs.existsSync(configPath)) {
        this.logger.debug('Found config file', { path: configPath });
        return this.parseConfigFile(configPath);
      }
    }

    this.logger.info('No config file found, using defaults');
    return DEFAULT_CONFIG;
  }

  /**
   * Parse and validate configuration file
   */
  private parseConfigFile(configPath: string): RefactogentConfig {
    try {
      const content = fs.readFileSync(configPath, 'utf8');
      const parsed = yaml.load(content) as Partial<RefactogentConfig>;
      
      // Merge with defaults
      const config = this.mergeWithDefaults(parsed);
      
      this.validateConfig(config);
      this.logger.success('Configuration loaded successfully', { path: configPath });
      
      return config;
    } catch (error) {
      this.logger.error('Failed to parse config file', { 
        path: configPath, 
        error: error instanceof Error ? error.message : String(error) 
      });
      this.logger.info('Falling back to default configuration');
      return DEFAULT_CONFIG;
    }
  }

  /**
   * Merge user config with defaults
   */
  private mergeWithDefaults(userConfig: Partial<RefactogentConfig>): RefactogentConfig {
    return {
      ...DEFAULT_CONFIG,
      ...userConfig,
      gates: {
        ...DEFAULT_CONFIG.gates,
        ...userConfig.gates
      },
      languages: {
        ...DEFAULT_CONFIG.languages,
        ...userConfig.languages
      },
      semantics: userConfig.semantics ? {
        ...DEFAULT_CONFIG.semantics,
        ...userConfig.semantics,
        tolerate: {
          ...DEFAULT_CONFIG.semantics?.tolerate,
          ...userConfig.semantics?.tolerate
        }
      } : DEFAULT_CONFIG.semantics
    };
  }

  /**
   * Validate configuration
   */
  private validateConfig(config: RefactogentConfig): void {
    if (!config.version) {
      throw new Error('Config version is required');
    }

    if (config.maxPrLoc <= 0) {
      throw new Error('maxPrLoc must be positive');
    }

    if (!config.branchPrefix) {
      throw new Error('branchPrefix is required');
    }

    if (!Array.isArray(config.modesAllowed) || config.modesAllowed.length === 0) {
      throw new Error('At least one refactoring mode must be allowed');
    }

    if (!config.languages || Object.keys(config.languages).length === 0) {
      throw new Error('At least one language configuration is required');
    }
  }

  /**
   * Get default configuration for a project type
   */
  getDefaultConfigForProject(projectType: ProjectType): RefactogentConfig {
    const config = { ...DEFAULT_CONFIG };
    
    // Customize based on project type
    switch (projectType) {
      case 'typescript':
        config.protectedPaths.push('src/types/**', 'lib/**');
        break;
      case 'python':
        config.protectedPaths.push('src/**/__init__.py');
        break;
      case 'go':
        config.protectedPaths.push('cmd/**', 'internal/**');
        break;
    }
    
    return config;
  }
}