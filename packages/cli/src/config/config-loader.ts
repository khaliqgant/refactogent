import { Logger } from '../utils/logger.js';
import {
  RefactoGentConfig,
  RefactoGentConfigSchema,
  DEFAULT_CONFIG,
} from './refactogent-schema.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';

export class ConfigLoader {
  private logger: Logger;
  private configCache: Map<string, RefactoGentConfig> = new Map();

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Load configuration for a project
   * Searches for refactogent.yaml in project root and parent directories
   */
  async loadConfig(projectPath: string): Promise<RefactoGentConfig> {
    try {
      // Check cache first
      const cacheKey = projectPath;
      if (this.configCache.has(cacheKey)) {
        return this.configCache.get(cacheKey)!;
      }

      // Search for refactogent.yaml
      const configPath = await this.findConfigFile(projectPath);

      if (!configPath) {
        this.logger.info('No refactogent.yaml found, using default configuration', { projectPath });
        const config = this.mergeWithDefaults({});
        this.configCache.set(cacheKey, config);
        return config;
      }

      // Load and parse configuration
      const configContent = await fs.readFile(configPath, 'utf-8');
      const parsedConfig = yaml.load(configContent) as any;

      // Validate configuration
      const validatedConfig = RefactoGentConfigSchema.parse(parsedConfig);
      const mergedConfig = this.mergeWithDefaults(validatedConfig);

      this.logger.info('Loaded configuration', {
        configPath,
        features: Object.keys(mergedConfig.features || {}),
        safety: mergedConfig.safety?.rules,
      });

      this.configCache.set(cacheKey, mergedConfig);
      return mergedConfig;
    } catch (error) {
      this.logger.error('Failed to load configuration', { error, projectPath });
      // Return default config on error
      const config = this.mergeWithDefaults({});
      this.configCache.set(projectPath, config);
      return config;
    }
  }

  /**
   * Find refactogent.yaml file in project hierarchy
   */
  private async findConfigFile(startPath: string): Promise<string | null> {
    let currentPath = path.resolve(startPath);
    const rootPath = path.parse(currentPath).root;

    while (currentPath !== rootPath) {
      const configPath = path.join(currentPath, 'refactogent.yaml');

      try {
        await fs.access(configPath);
        return configPath;
      } catch {
        // File doesn't exist, continue searching
      }

      // Move up one directory
      const parentPath = path.dirname(currentPath);
      if (parentPath === currentPath) {
        break; // Reached root
      }
      currentPath = parentPath;
    }

    return null;
  }

  /**
   * Merge user configuration with defaults
   */
  private mergeWithDefaults(userConfig: Partial<RefactoGentConfig>): RefactoGentConfig {
    return {
      repository: {
        ...DEFAULT_CONFIG.repository,
        ...userConfig.repository,
        language: userConfig.repository?.language ||
          DEFAULT_CONFIG.repository?.language || ['typescript', 'javascript'],
      },
      paths: {
        ...DEFAULT_CONFIG.paths,
        ...userConfig.paths,
        ignore: userConfig.paths?.ignore || DEFAULT_CONFIG.paths?.ignore || [],
        prioritize: userConfig.paths?.prioritize || DEFAULT_CONFIG.paths?.prioritize || [],
        tests: userConfig.paths?.tests || DEFAULT_CONFIG.paths?.tests || [],
        configs: userConfig.paths?.configs || DEFAULT_CONFIG.paths?.configs || [],
      },
      style: {
        naming: {
          ...DEFAULT_CONFIG.style?.naming,
          ...userConfig.style?.naming,
          functions:
            userConfig.style?.naming?.functions ||
            DEFAULT_CONFIG.style?.naming?.functions ||
            'camelCase',
          variables:
            userConfig.style?.naming?.variables ||
            DEFAULT_CONFIG.style?.naming?.variables ||
            'camelCase',
          classes:
            userConfig.style?.naming?.classes ||
            DEFAULT_CONFIG.style?.naming?.classes ||
            'PascalCase',
          constants:
            userConfig.style?.naming?.constants ||
            DEFAULT_CONFIG.style?.naming?.constants ||
            'UPPER_SNAKE_CASE',
        },
        formatting: {
          ...DEFAULT_CONFIG.style?.formatting,
          ...userConfig.style?.formatting,
          indent:
            userConfig.style?.formatting?.indent ||
            DEFAULT_CONFIG.style?.formatting?.indent ||
            'spaces',
          indentSize:
            userConfig.style?.formatting?.indentSize ||
            DEFAULT_CONFIG.style?.formatting?.indentSize ||
            2,
          lineLength:
            userConfig.style?.formatting?.lineLength ||
            DEFAULT_CONFIG.style?.formatting?.lineLength ||
            100,
          semicolons:
            userConfig.style?.formatting?.semicolons ??
            DEFAULT_CONFIG.style?.formatting?.semicolons ??
            true,
          quotes:
            userConfig.style?.formatting?.quotes ||
            DEFAULT_CONFIG.style?.formatting?.quotes ||
            'single',
        },
      },
      testing: {
        commands: {
          ...DEFAULT_CONFIG.testing?.commands,
          ...userConfig.testing?.commands,
          unit:
            userConfig.testing?.commands?.unit ||
            DEFAULT_CONFIG.testing?.commands?.unit ||
            'npm test',
          coverage:
            userConfig.testing?.commands?.coverage ||
            DEFAULT_CONFIG.testing?.commands?.coverage ||
            'npm run test:coverage',
        },
        thresholds: {
          ...DEFAULT_CONFIG.testing?.thresholds,
          ...userConfig.testing?.thresholds,
          coverage:
            userConfig.testing?.thresholds?.coverage ||
            DEFAULT_CONFIG.testing?.thresholds?.coverage ||
            80,
          complexity:
            userConfig.testing?.thresholds?.complexity ||
            DEFAULT_CONFIG.testing?.thresholds?.complexity ||
            10,
        },
        patterns: {
          ...DEFAULT_CONFIG.testing?.patterns,
          ...userConfig.testing?.patterns,
          unit: userConfig.testing?.patterns?.unit || DEFAULT_CONFIG.testing?.patterns?.unit || [],
          integration:
            userConfig.testing?.patterns?.integration ||
            DEFAULT_CONFIG.testing?.patterns?.integration ||
            [],
          e2e: userConfig.testing?.patterns?.e2e || DEFAULT_CONFIG.testing?.patterns?.e2e || [],
        },
      },
      safety: {
        thresholds: {
          ...DEFAULT_CONFIG.safety?.thresholds,
          ...userConfig.safety?.thresholds,
          maxChangeSize:
            userConfig.safety?.thresholds?.maxChangeSize ||
            DEFAULT_CONFIG.safety?.thresholds?.maxChangeSize ||
            100,
          maxFilesAffected:
            userConfig.safety?.thresholds?.maxFilesAffected ||
            DEFAULT_CONFIG.safety?.thresholds?.maxFilesAffected ||
            10,
          criticalPathSensitivity:
            userConfig.safety?.thresholds?.criticalPathSensitivity ||
            DEFAULT_CONFIG.safety?.thresholds?.criticalPathSensitivity ||
            'medium',
        },
        rules: {
          ...DEFAULT_CONFIG.safety?.rules,
          ...userConfig.safety?.rules,
          requireTests:
            userConfig.safety?.rules?.requireTests ??
            DEFAULT_CONFIG.safety?.rules?.requireTests ??
            true,
          requireTypeCheck:
            userConfig.safety?.rules?.requireTypeCheck ??
            DEFAULT_CONFIG.safety?.rules?.requireTypeCheck ??
            true,
          requireLinting:
            userConfig.safety?.rules?.requireLinting ??
            DEFAULT_CONFIG.safety?.rules?.requireLinting ??
            true,
          blockBreakingChanges:
            userConfig.safety?.rules?.blockBreakingChanges ??
            DEFAULT_CONFIG.safety?.rules?.blockBreakingChanges ??
            true,
          requireManualReview:
            userConfig.safety?.rules?.requireManualReview ??
            DEFAULT_CONFIG.safety?.rules?.requireManualReview ??
            true,
        },
        criticalPaths: [
          ...(DEFAULT_CONFIG.safety?.criticalPaths || []),
          ...(userConfig.safety?.criticalPaths || []),
        ],
      },
      ai: {
        models: {
          ...DEFAULT_CONFIG.ai?.models,
          ...userConfig.ai?.models,
          primary:
            userConfig.ai?.models?.primary || DEFAULT_CONFIG.ai?.models?.primary || 'gpt-4o-mini',
          fallback:
            userConfig.ai?.models?.fallback ||
            DEFAULT_CONFIG.ai?.models?.fallback ||
            'gpt-3.5-turbo',
          embedding:
            userConfig.ai?.models?.embedding ||
            DEFAULT_CONFIG.ai?.models?.embedding ||
            'text-embedding-3-small',
        },
        budgets: {
          ...DEFAULT_CONFIG.ai?.budgets,
          ...userConfig.ai?.budgets,
          maxTokens:
            userConfig.ai?.budgets?.maxTokens || DEFAULT_CONFIG.ai?.budgets?.maxTokens || 8000,
          contextWindow:
            userConfig.ai?.budgets?.contextWindow ||
            DEFAULT_CONFIG.ai?.budgets?.contextWindow ||
            16000,
          maxFiles: userConfig.ai?.budgets?.maxFiles || DEFAULT_CONFIG.ai?.budgets?.maxFiles || 20,
        },
        behavior: {
          ...DEFAULT_CONFIG.ai?.behavior,
          ...userConfig.ai?.behavior,
          aggressiveness:
            userConfig.ai?.behavior?.aggressiveness ||
            DEFAULT_CONFIG.ai?.behavior?.aggressiveness ||
            'balanced',
          preferIncremental:
            userConfig.ai?.behavior?.preferIncremental ??
            DEFAULT_CONFIG.ai?.behavior?.preferIncremental ??
            true,
          maxOperations:
            userConfig.ai?.behavior?.maxOperations ||
            DEFAULT_CONFIG.ai?.behavior?.maxOperations ||
            5,
        },
      },
      retrieval: {
        indexing: {
          ...DEFAULT_CONFIG.retrieval?.indexing,
          ...userConfig.retrieval?.indexing,
          incremental:
            userConfig.retrieval?.indexing?.incremental ??
            DEFAULT_CONFIG.retrieval?.indexing?.incremental ??
            true,
          updateFrequency:
            userConfig.retrieval?.indexing?.updateFrequency ||
            DEFAULT_CONFIG.retrieval?.indexing?.updateFrequency ||
            60,
          maxFileSize:
            userConfig.retrieval?.indexing?.maxFileSize ||
            DEFAULT_CONFIG.retrieval?.indexing?.maxFileSize ||
            1000000,
        },
        preferences: {
          ...DEFAULT_CONFIG.retrieval?.preferences,
          ...userConfig.retrieval?.preferences,
          preferSemantic:
            userConfig.retrieval?.preferences?.preferSemantic ??
            DEFAULT_CONFIG.retrieval?.preferences?.preferSemantic ??
            true,
          includeTests:
            userConfig.retrieval?.preferences?.includeTests ??
            DEFAULT_CONFIG.retrieval?.preferences?.includeTests ??
            true,
          includeDocs:
            userConfig.retrieval?.preferences?.includeDocs ??
            DEFAULT_CONFIG.retrieval?.preferences?.includeDocs ??
            true,
          maxDepth:
            userConfig.retrieval?.preferences?.maxDepth ||
            DEFAULT_CONFIG.retrieval?.preferences?.maxDepth ||
            3,
        },
      },
      monitoring: {
        endpoints: { ...DEFAULT_CONFIG.monitoring?.endpoints, ...userConfig.monitoring?.endpoints },
        logging: {
          ...DEFAULT_CONFIG.monitoring?.logging,
          ...userConfig.monitoring?.logging,
          level:
            userConfig.monitoring?.logging?.level ||
            DEFAULT_CONFIG.monitoring?.logging?.level ||
            'info',
          structured:
            userConfig.monitoring?.logging?.structured ??
            DEFAULT_CONFIG.monitoring?.logging?.structured ??
            true,
        },
        enabled: userConfig.monitoring?.enabled ?? DEFAULT_CONFIG.monitoring?.enabled ?? true,
      },
      features: {
        ...DEFAULT_CONFIG.features,
        ...userConfig.features,
        experimental:
          userConfig.features?.experimental ?? DEFAULT_CONFIG.features?.experimental ?? false,
        codeGraph: userConfig.features?.codeGraph ?? DEFAULT_CONFIG.features?.codeGraph ?? true,
        crossFileAnalysis:
          userConfig.features?.crossFileAnalysis ??
          DEFAULT_CONFIG.features?.crossFileAnalysis ??
          true,
        architecturalPatterns:
          userConfig.features?.architecturalPatterns ??
          DEFAULT_CONFIG.features?.architecturalPatterns ??
          true,
        dependencyAnalysis:
          userConfig.features?.dependencyAnalysis ??
          DEFAULT_CONFIG.features?.dependencyAnalysis ??
          true,
      },
    };
  }

  /**
   * Create a sample configuration file
   */
  async createSampleConfig(projectPath: string): Promise<void> {
    const sampleConfig = {
      repository: {
        name: 'my-project',
        type: 'application',
        language: ['typescript', 'javascript'],
      },
      paths: {
        ignore: ['node_modules/**', 'dist/**', 'build/**', '.git/**'],
        prioritize: ['src/**', 'lib/**'],
      },
      style: {
        naming: {
          functions: 'camelCase',
          variables: 'camelCase',
          classes: 'PascalCase',
          constants: 'UPPER_SNAKE_CASE',
        },
      },
      safety: {
        rules: {
          requireTests: true,
          requireTypeCheck: true,
          requireLinting: true,
          blockBreakingChanges: true,
        },
      },
      ai: {
        models: {
          primary: 'gpt-4o-mini',
          fallback: 'gpt-3.5-turbo',
        },
        behavior: {
          aggressiveness: 'balanced',
          preferIncremental: true,
        },
      },
      features: {
        codeGraph: true,
        crossFileAnalysis: true,
        architecturalPatterns: true,
      },
    };

    const configPath = path.join(projectPath, 'refactogent.yaml');
    const yamlContent = yaml.dump(sampleConfig, {
      indent: 2,
      lineWidth: 100,
      noRefs: true,
    });

    await fs.writeFile(configPath, yamlContent);
    this.logger.info('Created sample configuration', { configPath });
  }

  /**
   * Validate configuration
   */
  validateConfig(config: any): { valid: boolean; errors: string[] } {
    try {
      RefactoGentConfigSchema.parse(config);
      return { valid: true, errors: [] };
    } catch (error) {
      if (error instanceof Error) {
        return { valid: false, errors: [error.message] };
      }
      return { valid: false, errors: ['Unknown validation error'] };
    }
  }

  /**
   * Clear configuration cache
   */
  clearCache(): void {
    this.configCache.clear();
  }

  /**
   * Get cached configuration
   */
  getCachedConfig(projectPath: string): RefactoGentConfig | null {
    return this.configCache.get(projectPath) || null;
  }
}
