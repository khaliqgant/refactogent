/**
 * Configuration for the shared RefactorContext
 */
export interface RefactorContextConfig {
  rootPath: string;
  includeTests?: boolean;
  excludePatterns?: string[];
  maxFileSize?: number;
}

/**
 * Invalidation options for the shared context
 */
export interface InvalidationOptions {
  /**
   * Specific file paths to invalidate
   * If not provided, invalidates the entire context
   */
  paths?: string[];

  /**
   * If true, force re-indexing even if cache is still valid
   */
  force?: boolean;
}

/**
 * State of the shared context
 */
export interface ContextState {
  initialized: boolean;
  rootPath: string | null;
  fileCount: number;
  lastIndexed: Date | null;
  isIndexing: boolean;
}

/**
 * Statistics about the shared context
 */
export interface ContextStats {
  totalFiles: number;
  totalSymbols: number;
  cacheHitRate: number;
  lastInvalidation: Date | null;
  memoryUsage: number;
}

/**
 * Dependency graph structure for caching
 */
export interface DependencyGraphCache {
  nodes: Set<string>;
  edges: Map<string, Set<string>>;
  reverseEdges: Map<string, Set<string>>;
  lastUpdated: Date;
}
