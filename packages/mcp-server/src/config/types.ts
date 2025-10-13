/**
 * Configuration types for Refactogent
 */

export interface RefactogentConfig {
  /**
   * File/directory patterns to exclude from analysis
   */
  exclude: string[];

  /**
   * File/directory patterns to include in analysis
   */
  include: string[];

  /**
   * Validation configuration
   */
  validation: ValidationConfig;

  /**
   * Safety and checkpoint configuration
   */
  safety: SafetyConfig;

  /**
   * AI provider configuration
   */
  ai: AIConfig;

  /**
   * Performance optimization settings
   */
  performance: PerformanceConfig;

  /**
   * Path configuration
   */
  paths: PathsConfig;
}

export interface ValidationConfig {
  /**
   * Whether to run tests during validation
   */
  runTests: boolean;

  /**
   * Whether to run linting during validation
   */
  runLint: boolean;

  /**
   * Whether to run type checking during validation
   */
  runTypeCheck: boolean;

  /**
   * Custom validation scripts to run (relative to project root)
   */
  customValidators: string[];

  /**
   * Whether to run validation checks in parallel
   */
  parallel: boolean;

  /**
   * Timeout for validation in milliseconds (0 = no timeout)
   */
  timeout: number;
}

export interface SafetyConfig {
  /**
   * Automatically create checkpoints before applying changes
   */
  autoCheckpoint: boolean;

  /**
   * Automatically rollback on validation failure
   */
  autoRollback: boolean;

  /**
   * Maximum acceptable risk score (0-100)
   */
  maxRiskScore: number;

  /**
   * Require manual confirmation for changes above this risk score
   */
  requireConfirmationAbove: number;

  /**
   * Whether to include untracked files in checkpoints
   */
  includeUntrackedFiles: boolean;
}

export interface AIConfig {
  /**
   * AI provider to use
   */
  provider: "anthropic" | "openai";

  /**
   * Model to use for the selected provider
   */
  model: string;

  /**
   * Maximum tokens for AI responses
   */
  maxTokens: number;

  /**
   * Temperature for AI responses (0-1)
   */
  temperature: number;

  /**
   * API key (can also be set via environment variables)
   */
  apiKey?: string;
}

export interface PerformanceConfig {
  /**
   * Enable caching of analysis results
   */
  caching: boolean;

  /**
   * Cache TTL in seconds
   */
  cacheTTL: number;

  /**
   * Run validation checks in parallel
   */
  parallelValidation: boolean;

  /**
   * Maximum number of concurrent analysis operations
   */
  maxConcurrentAnalysis: number;

  /**
   * Enable file system watching for incremental analysis
   */
  watchMode: boolean;
}

export interface PathsConfig {
  /**
   * Path to types directory (for type extraction)
   */
  typesPath: string;

  /**
   * Output path for generated files
   */
  outputPath: string;

  /**
   * Path to test directory
   */
  testPath: string;

  /**
   * Custom paths for specific file types
   */
  customPaths: Record<string, string>;
}

/**
 * Partial configuration for overrides
 */
export type PartialRefactogentConfig = {
  exclude?: string[];
  include?: string[];
  validation?: Partial<ValidationConfig>;
  safety?: Partial<SafetyConfig>;
  ai?: Partial<AIConfig>;
  performance?: Partial<PerformanceConfig>;
  paths?: Partial<PathsConfig>;
};
