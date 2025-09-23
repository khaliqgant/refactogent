import { z } from 'zod';

/**
 * RefactoGent Configuration Schema
 * Defines the structure for refactogent.yaml configuration files
 */
export const RefactoGentConfigSchema = z.object({
  // Repository identification
  repository: z
    .object({
      name: z.string().optional(),
      type: z.enum(['monorepo', 'microservice', 'library', 'application']).optional(),
      language: z.array(z.string()).default(['typescript', 'javascript']),
    })
    .optional(),

  // Paths and file patterns
  paths: z
    .object({
      // Paths to ignore during analysis
      ignore: z
        .array(z.string())
        .default([
          'node_modules/**',
          'dist/**',
          'build/**',
          '.git/**',
          'coverage/**',
          '*.log',
          '*.tmp',
        ]),
      // Paths to prioritize for analysis
      prioritize: z.array(z.string()).default(['src/**', 'lib/**', 'packages/**']),
      // Test file patterns
      tests: z.array(z.string()).default(['**/*.test.*', '**/*.spec.*', '**/test/**']),
      // Configuration files
      configs: z
        .array(z.string())
        .default(['**/*.config.*', '**/package.json', '**/tsconfig.json']),
    })
    .optional(),

  // Code style and formatting rules
  style: z
    .object({
      // Naming conventions
      naming: z
        .object({
          functions: z.enum(['camelCase', 'snake_case', 'PascalCase']).default('camelCase'),
          variables: z.enum(['camelCase', 'snake_case', 'PascalCase']).default('camelCase'),
          classes: z.enum(['camelCase', 'snake_case', 'PascalCase']).default('PascalCase'),
          constants: z
            .enum(['UPPER_SNAKE_CASE', 'camelCase', 'PascalCase'])
            .default('UPPER_SNAKE_CASE'),
        })
        .optional(),
      // Code formatting preferences
      formatting: z
        .object({
          indent: z.enum(['spaces', 'tabs']).default('spaces'),
          indentSize: z.number().min(2).max(8).default(2),
          lineLength: z.number().min(80).max(200).default(100),
          semicolons: z.boolean().default(true),
          quotes: z.enum(['single', 'double']).default('single'),
        })
        .optional(),
    })
    .optional(),

  // Testing configuration
  testing: z
    .object({
      // Test commands to run
      commands: z
        .object({
          unit: z.string().default('npm test'),
          integration: z.string().optional(),
          e2e: z.string().optional(),
          coverage: z.string().default('npm run test:coverage'),
        })
        .optional(),
      // Test thresholds
      thresholds: z
        .object({
          coverage: z.number().min(0).max(100).default(80),
          complexity: z.number().min(1).default(10),
        })
        .optional(),
      // Test file patterns
      patterns: z
        .object({
          unit: z.array(z.string()).default(['**/*.test.*', '**/*.spec.*']),
          integration: z.array(z.string()).default(['**/*.integration.*', '**/integration/**']),
          e2e: z.array(z.string()).default(['**/*.e2e.*', '**/e2e/**']),
        })
        .optional(),
    })
    .optional(),

  // Risk assessment and safety
  safety: z
    .object({
      // Risk thresholds
      thresholds: z
        .object({
          // Maximum change size (lines of code)
          maxChangeSize: z.number().min(10).max(1000).default(100),
          // Maximum files affected
          maxFilesAffected: z.number().min(1).max(50).default(10),
          // Critical path sensitivity
          criticalPathSensitivity: z.enum(['low', 'medium', 'high']).default('medium'),
        })
        .optional(),
      // Safety rules
      rules: z
        .object({
          // Require tests for changes
          requireTests: z.boolean().default(true),
          // Require type checking
          requireTypeCheck: z.boolean().default(true),
          // Require linting
          requireLinting: z.boolean().default(true),
          // Block on breaking changes
          blockBreakingChanges: z.boolean().default(true),
          // Require manual review for high-risk changes
          requireManualReview: z.boolean().default(true),
        })
        .optional(),
      // Critical paths that require extra caution
      criticalPaths: z
        .array(z.string())
        .default([
          'src/index.*',
          'src/main.*',
          'src/app.*',
          '**/api/**',
          '**/auth/**',
          '**/database/**',
        ])
        .optional(),
    })
    .optional(),

  // LLM and AI configuration
  ai: z
    .object({
      // Model preferences
      models: z
        .object({
          primary: z.string().default('gpt-4o-mini'),
          fallback: z.string().default('gpt-3.5-turbo'),
          embedding: z.string().default('text-embedding-3-small'),
        })
        .optional(),
      // Token budgets
      budgets: z
        .object({
          // Maximum tokens per request
          maxTokens: z.number().min(1000).max(100000).default(8000),
          // Context window size
          contextWindow: z.number().min(2000).max(200000).default(16000),
          // Maximum files to include in context
          maxFiles: z.number().min(5).max(50).default(20),
        })
        .optional(),
      // AI behavior settings
      behavior: z
        .object({
          // Aggressiveness of refactoring
          aggressiveness: z.enum(['conservative', 'balanced', 'aggressive']).default('balanced'),
          // Prefer smaller, incremental changes
          preferIncremental: z.boolean().default(true),
          // Maximum refactoring operations per run
          maxOperations: z.number().min(1).max(20).default(5),
        })
        .optional(),
    })
    .optional(),

  // Retrieval and indexing
  retrieval: z
    .object({
      // Indexing settings
      indexing: z
        .object({
          // Enable incremental indexing
          incremental: z.boolean().default(true),
          // Index update frequency (seconds)
          updateFrequency: z.number().min(1).max(3600).default(60),
          // Maximum file size to index (bytes)
          maxFileSize: z.number().min(1000).max(10000000).default(1000000),
        })
        .optional(),
      // Retrieval preferences
      preferences: z
        .object({
          // Prefer semantic search
          preferSemantic: z.boolean().default(true),
          // Include test files in context
          includeTests: z.boolean().default(true),
          // Include documentation in context
          includeDocs: z.boolean().default(true),
          // Maximum retrieval depth
          maxDepth: z.number().min(1).max(5).default(3),
        })
        .optional(),
    })
    .optional(),

  // Monitoring and observability
  monitoring: z
    .object({
      // Enable metrics collection
      enabled: z.boolean().default(true),
      // Metrics endpoints
      endpoints: z
        .object({
          // OpenTelemetry endpoint
          otel: z.string().optional(),
          // Prometheus endpoint
          prometheus: z.string().optional(),
          // Custom metrics endpoint
          custom: z.string().optional(),
        })
        .optional(),
      // Logging configuration
      logging: z
        .object({
          // Log level
          level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
          // Enable structured logging
          structured: z.boolean().default(true),
          // Log file path
          file: z.string().optional(),
        })
        .optional(),
    })
    .optional(),

  // Feature flags
  features: z
    .object({
      // Enable experimental features
      experimental: z.boolean().default(false),
      // Enable code graph analysis
      codeGraph: z.boolean().default(true),
      // Enable cross-file analysis
      crossFileAnalysis: z.boolean().default(true),
      // Enable architectural pattern detection
      architecturalPatterns: z.boolean().default(true),
      // Enable dependency analysis
      dependencyAnalysis: z.boolean().default(true),
    })
    .optional(),
});

export type RefactoGentConfig = z.infer<typeof RefactoGentConfigSchema>;

/**
 * Default configuration
 */
export const DEFAULT_CONFIG: RefactoGentConfig = {
  repository: {
    type: 'application',
    language: ['typescript', 'javascript'],
  },
  paths: {
    ignore: ['node_modules/**', 'dist/**', 'build/**', '.git/**', 'coverage/**', '*.log', '*.tmp'],
    prioritize: ['src/**', 'lib/**', 'packages/**'],
    tests: ['**/*.test.*', '**/*.spec.*', '**/test/**'],
    configs: ['**/*.config.*', '**/package.json', '**/tsconfig.json'],
  },
  style: {
    naming: {
      functions: 'camelCase',
      variables: 'camelCase',
      classes: 'PascalCase',
      constants: 'UPPER_SNAKE_CASE',
    },
    formatting: {
      indent: 'spaces',
      indentSize: 2,
      lineLength: 100,
      semicolons: true,
      quotes: 'single',
    },
  },
  testing: {
    commands: {
      unit: 'npm test',
      coverage: 'npm run test:coverage',
    },
    thresholds: {
      coverage: 80,
      complexity: 10,
    },
  },
  safety: {
    thresholds: {
      maxChangeSize: 100,
      maxFilesAffected: 10,
      criticalPathSensitivity: 'medium',
    },
    rules: {
      requireTests: true,
      requireTypeCheck: true,
      requireLinting: true,
      blockBreakingChanges: true,
      requireManualReview: true,
    },
    criticalPaths: [
      'src/index.*',
      'src/main.*',
      'src/app.*',
      '**/api/**',
      '**/auth/**',
      '**/database/**',
    ],
  },
  ai: {
    models: {
      primary: 'gpt-4o-mini',
      fallback: 'gpt-3.5-turbo',
      embedding: 'text-embedding-3-small',
    },
    budgets: {
      maxTokens: 8000,
      contextWindow: 16000,
      maxFiles: 20,
    },
    behavior: {
      aggressiveness: 'balanced',
      preferIncremental: true,
      maxOperations: 5,
    },
  },
  retrieval: {
    indexing: {
      incremental: true,
      updateFrequency: 60,
      maxFileSize: 1000000,
    },
    preferences: {
      preferSemantic: true,
      includeTests: true,
      includeDocs: true,
      maxDepth: 3,
    },
  },
  monitoring: {
    enabled: true,
    logging: {
      level: 'info',
      structured: true,
    },
  },
  features: {
    experimental: false,
    codeGraph: true,
    crossFileAnalysis: true,
    architecturalPatterns: true,
    dependencyAnalysis: true,
  },
};
