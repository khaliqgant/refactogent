import * as fs from "fs";
import * as path from "path";
import * as yaml from "yaml";
import { RefactogentConfig, PartialRefactogentConfig } from "./types.js";

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: RefactogentConfig = {
  exclude: [
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/.git/**",
    "**/coverage/**",
    "**/*.min.js",
    "**/*.bundle.js",
  ],

  include: [
    "src/**/*.ts",
    "src/**/*.tsx",
    "src/**/*.js",
    "src/**/*.jsx",
    "lib/**/*.ts",
    "lib/**/*.js",
  ],

  validation: {
    runTests: true,
    runLint: true,
    runTypeCheck: true,
    customValidators: [],
    parallel: true,
    timeout: 300000, // 5 minutes
  },

  safety: {
    autoCheckpoint: true,
    autoRollback: true,
    maxRiskScore: 75,
    requireConfirmationAbove: 50,
    includeUntrackedFiles: false,
  },

  ai: {
    provider: "anthropic",
    model: "claude-3-5-sonnet-20241022",
    maxTokens: 4096,
    temperature: 0.7,
  },

  performance: {
    caching: true,
    cacheTTL: 3600, // 1 hour
    parallelValidation: true,
    maxConcurrentAnalysis: 4,
    watchMode: false,
  },

  paths: {
    typesPath: "src/types",
    outputPath: "dist",
    testPath: "test",
    customPaths: {},
  },
};

/**
 * Configuration file names to search for (in order of precedence)
 */
const CONFIG_FILE_NAMES = [
  ".refactogent.yaml",
  ".refactogent.yml",
  "refactogent.yaml",
  "refactogent.yml",
];

/**
 * Configuration loader singleton
 */
class ConfigLoader {
  private config: RefactogentConfig | null = null;
  private configPath: string | null = null;

  /**
   * Load configuration from file or use defaults
   */
  load(projectRoot?: string): RefactogentConfig {
    if (this.config) {
      return this.config;
    }

    const root = projectRoot || process.cwd();
    const configFile = this.findConfigFile(root);

    if (configFile) {
      console.error(`[config] Loading configuration from: ${configFile}`);
      this.configPath = configFile;
      this.config = this.loadFromFile(configFile);
    } else {
      console.error("[config] No configuration file found, using defaults");
      this.config = DEFAULT_CONFIG;
    }

    // Override with environment variables if present
    this.applyEnvironmentOverrides(this.config);

    return this.config;
  }

  /**
   * Get the currently loaded configuration
   */
  get(): RefactogentConfig {
    if (!this.config) {
      return this.load();
    }
    return this.config;
  }

  /**
   * Reload configuration from file
   */
  reload(projectRoot?: string): RefactogentConfig {
    this.config = null;
    this.configPath = null;
    return this.load(projectRoot);
  }

  /**
   * Get the path to the loaded configuration file
   */
  getConfigPath(): string | null {
    return this.configPath;
  }

  /**
   * Search for configuration file in project root
   */
  private findConfigFile(root: string): string | null {
    for (const fileName of CONFIG_FILE_NAMES) {
      const filePath = path.join(root, fileName);
      if (fs.existsSync(filePath)) {
        return filePath;
      }
    }
    return null;
  }

  /**
   * Load and parse configuration from YAML file
   */
  private loadFromFile(filePath: string): RefactogentConfig {
    try {
      const fileContent = fs.readFileSync(filePath, "utf-8");
      const parsed = yaml.parse(fileContent) as PartialRefactogentConfig;

      // Validate and merge with defaults
      const config = this.mergeWithDefaults(parsed);
      this.validateConfig(config);

      return config;
    } catch (error) {
      console.error(`[config] Error loading configuration from ${filePath}:`, error);
      console.error("[config] Falling back to default configuration");
      return DEFAULT_CONFIG;
    }
  }

  /**
   * Deep merge user configuration with defaults
   */
  private mergeWithDefaults(userConfig: PartialRefactogentConfig): RefactogentConfig {
    return {
      exclude: userConfig.exclude ?? DEFAULT_CONFIG.exclude,
      include: userConfig.include ?? DEFAULT_CONFIG.include,
      validation: {
        ...DEFAULT_CONFIG.validation,
        ...userConfig.validation,
        customValidators: userConfig.validation?.customValidators || DEFAULT_CONFIG.validation.customValidators,
      },
      safety: {
        ...DEFAULT_CONFIG.safety,
        ...userConfig.safety,
      },
      ai: {
        ...DEFAULT_CONFIG.ai,
        ...userConfig.ai,
      },
      performance: {
        ...DEFAULT_CONFIG.performance,
        ...userConfig.performance,
      },
      paths: {
        ...DEFAULT_CONFIG.paths,
        ...userConfig.paths,
        customPaths: {
          ...DEFAULT_CONFIG.paths.customPaths,
          ...(userConfig.paths?.customPaths || {}),
        },
      },
    };
  }

  /**
   * Validate configuration values
   */
  private validateConfig(config: RefactogentConfig): void {
    // Validate safety scores
    if (config.safety.maxRiskScore < 0 || config.safety.maxRiskScore > 100) {
      throw new Error("safety.maxRiskScore must be between 0 and 100");
    }

    if (
      config.safety.requireConfirmationAbove < 0 ||
      config.safety.requireConfirmationAbove > 100
    ) {
      throw new Error("safety.requireConfirmationAbove must be between 0 and 100");
    }

    // Validate AI settings
    if (!["anthropic", "openai"].includes(config.ai.provider)) {
      throw new Error('ai.provider must be either "anthropic" or "openai"');
    }

    if (config.ai.maxTokens < 1) {
      throw new Error("ai.maxTokens must be greater than 0");
    }

    if (config.ai.temperature < 0 || config.ai.temperature > 1) {
      throw new Error("ai.temperature must be between 0 and 1");
    }

    // Validate performance settings
    if (config.performance.cacheTTL < 0) {
      throw new Error("performance.cacheTTL must be non-negative");
    }

    if (config.performance.maxConcurrentAnalysis < 1) {
      throw new Error("performance.maxConcurrentAnalysis must be at least 1");
    }

    // Validate validation timeout
    if (config.validation.timeout < 0) {
      throw new Error("validation.timeout must be non-negative");
    }

    // Validate custom validators exist
    for (const validator of config.validation.customValidators) {
      const validatorPath = path.resolve(process.cwd(), validator);
      if (!fs.existsSync(validatorPath)) {
        console.warn(`[config] Warning: Custom validator not found: ${validator}`);
      }
    }
  }

  /**
   * Apply environment variable overrides
   */
  private applyEnvironmentOverrides(config: RefactogentConfig): void {
    // AI provider overrides
    if (process.env.AI_PROVIDER) {
      const provider = process.env.AI_PROVIDER.toLowerCase();
      if (provider === "anthropic" || provider === "openai") {
        config.ai.provider = provider;
      }
    }

    if (process.env.ANTHROPIC_MODEL) {
      config.ai.model = process.env.ANTHROPIC_MODEL;
    }

    if (process.env.OPENAI_MODEL) {
      config.ai.model = process.env.OPENAI_MODEL;
    }

    if (process.env.ANTHROPIC_API_KEY) {
      config.ai.apiKey = process.env.ANTHROPIC_API_KEY;
    }

    if (process.env.OPENAI_API_KEY) {
      config.ai.apiKey = process.env.OPENAI_API_KEY;
    }

    // Performance overrides
    if (process.env.REFACTOGENT_CACHE === "false") {
      config.performance.caching = false;
    }

    if (process.env.REFACTOGENT_PARALLEL === "false") {
      config.performance.parallelValidation = false;
      config.validation.parallel = false;
    }

    // Safety overrides
    if (process.env.REFACTOGENT_AUTO_CHECKPOINT === "false") {
      config.safety.autoCheckpoint = false;
    }

    if (process.env.REFACTOGENT_AUTO_ROLLBACK === "false") {
      config.safety.autoRollback = false;
    }

    if (process.env.REFACTOGENT_MAX_RISK_SCORE) {
      const score = parseInt(process.env.REFACTOGENT_MAX_RISK_SCORE, 10);
      if (!isNaN(score) && score >= 0 && score <= 100) {
        config.safety.maxRiskScore = score;
      }
    }
  }
}

/**
 * Singleton instance
 */
const configLoader = new ConfigLoader();

/**
 * Get the current configuration
 */
export function getConfig(): RefactogentConfig {
  return configLoader.get();
}

/**
 * Load configuration from a specific project root
 */
export function loadConfig(projectRoot?: string): RefactogentConfig {
  return configLoader.load(projectRoot);
}

/**
 * Reload configuration
 */
export function reloadConfig(projectRoot?: string): RefactogentConfig {
  return configLoader.reload(projectRoot);
}

/**
 * Get the path to the loaded configuration file
 */
export function getConfigPath(): string | null {
  return configLoader.getConfigPath();
}

/**
 * Get default configuration (useful for documentation/examples)
 */
export function getDefaultConfig(): RefactogentConfig {
  return { ...DEFAULT_CONFIG };
}
