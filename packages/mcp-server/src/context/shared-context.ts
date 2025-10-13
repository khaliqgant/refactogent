import { CodebaseIndexer, RefactorableFile } from "@refactogent/core";
import { Project } from "ts-morph";
import * as path from "path";
import * as fs from "fs";
import {
  RefactorContextConfig,
  InvalidationOptions,
  ContextState,
  ContextStats,
  DependencyGraphCache,
} from "./types.js";
import { getConfig } from "../config/config-loader.js";

/**
 * Singleton shared context for refactoring tools.
 * Dramatically improves performance by reusing indexed codebase and ts-morph Project.
 */
export class RefactorContext {
  private static instance: RefactorContext | null = null;

  // Cached data
  private project?: Project;
  private indexedFiles?: RefactorableFile[];
  private dependencyGraph?: DependencyGraphCache;
  private indexer?: CodebaseIndexer;

  // State tracking
  private initialized = false;
  private isIndexing = false;
  private rootPath: string | null = null;
  private config?: RefactorContextConfig;
  private lastIndexed: Date | null = null;
  private lastInvalidation: Date | null = null;

  // Performance metrics
  private cacheHits = 0;
  private cacheMisses = 0;

  // Lock for concurrent access
  private initializationLock: Promise<void> | null = null;

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {}

  /**
   * Get the singleton instance
   */
  static getInstance(): RefactorContext {
    if (!RefactorContext.instance) {
      RefactorContext.instance = new RefactorContext();
    }
    return RefactorContext.instance;
  }

  /**
   * Reset the singleton instance (mainly for testing)
   */
  static reset(): void {
    if (RefactorContext.instance) {
      RefactorContext.instance.invalidate({ force: true });
      RefactorContext.instance = null;
    }
  }

  /**
   * Initialize the shared context with a root path and configuration.
   * This is lazy - it won't actually index until first use.
   * Thread-safe: multiple concurrent calls will queue behind the first initialization.
   */
  async initialize(config: RefactorContextConfig): Promise<void> {
    // If already initialized with same root path, skip
    if (this.initialized && this.rootPath === config.rootPath) {
      this.cacheHits++;
      console.error("[RefactorContext] Using cached context");
      return;
    }

    // If initialization is in progress, wait for it
    if (this.initializationLock) {
      console.error("[RefactorContext] Waiting for initialization to complete...");
      await this.initializationLock;
      return;
    }

    // Start initialization
    this.initializationLock = this._initialize(config);
    try {
      await this.initializationLock;
    } finally {
      this.initializationLock = null;
    }
  }

  /**
   * Internal initialization implementation
   */
  private async _initialize(config: RefactorContextConfig): Promise<void> {
    this.cacheMisses++;

    // If root path changed, invalidate everything
    if (this.rootPath && this.rootPath !== config.rootPath) {
      console.error(
        `[RefactorContext] Root path changed from ${this.rootPath} to ${config.rootPath}, invalidating...`
      );
      this.invalidate({ force: true });
    }

    this.config = config;
    this.rootPath = config.rootPath;

    console.error(`[RefactorContext] Initializing context for: ${config.rootPath}`);
    const startTime = Date.now();

    // Load global config for defaults
    const globalConfig = getConfig();

    // Initialize indexer with config patterns
    this.indexer = new CodebaseIndexer({
      rootPath: config.rootPath,
      includeTests: config.includeTests ?? true,
      excludePatterns: config.excludePatterns ?? globalConfig.exclude,
      maxFileSize: config.maxFileSize,
    });

    // Index the codebase (this is the expensive operation we want to do once)
    this.isIndexing = true;
    try {
      this.indexedFiles = await this.indexer.indexCodebase();
      this.lastIndexed = new Date();

      console.error(
        `[RefactorContext] Indexed ${this.indexedFiles.length} files in ${Date.now() - startTime}ms`
      );

      // Initialize ts-morph Project (another expensive operation)
      const tsConfigPath = this.findTsConfig(config.rootPath);
      this.project = new Project({
        tsConfigFilePath: tsConfigPath,
        skipAddingFilesFromTsConfig: false,
      });

      console.error(
        `[RefactorContext] Initialized ts-morph project in ${Date.now() - startTime}ms`
      );

      // Build dependency graph cache
      this.dependencyGraph = this.buildDependencyGraphCache(this.indexedFiles);

      console.error(
        `[RefactorContext] Built dependency graph in ${Date.now() - startTime}ms`
      );

      this.initialized = true;
    } finally {
      this.isIndexing = false;
    }

    const totalTime = Date.now() - startTime;
    console.error(`[RefactorContext] Context initialization complete in ${totalTime}ms`);
  }

  /**
   * Get the ts-morph Project instance.
   * Throws if not initialized.
   */
  getProject(): Project {
    if (!this.project) {
      throw new Error(
        "RefactorContext not initialized. Call initialize() first."
      );
    }
    return this.project;
  }

  /**
   * Get the indexed files.
   * Throws if not initialized.
   */
  getIndexedFiles(): RefactorableFile[] {
    if (!this.indexedFiles) {
      throw new Error(
        "RefactorContext not initialized. Call initialize() first."
      );
    }
    return this.indexedFiles;
  }

  /**
   * Get the dependency graph cache.
   * Throws if not initialized.
   */
  getDependencyGraph(): DependencyGraphCache {
    if (!this.dependencyGraph) {
      throw new Error(
        "RefactorContext not initialized. Call initialize() first."
      );
    }
    return this.dependencyGraph;
  }

  /**
   * Get the indexer instance (for additional operations).
   * Throws if not initialized.
   */
  getIndexer(): CodebaseIndexer {
    if (!this.indexer) {
      throw new Error(
        "RefactorContext not initialized. Call initialize() first."
      );
    }
    return this.indexer;
  }

  /**
   * Get the current root path
   */
  getRootPath(): string {
    if (!this.rootPath) {
      throw new Error(
        "RefactorContext not initialized. Call initialize() first."
      );
    }
    return this.rootPath;
  }

  /**
   * Check if context is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get current state of the context
   */
  getState(): ContextState {
    return {
      initialized: this.initialized,
      rootPath: this.rootPath,
      fileCount: this.indexedFiles?.length ?? 0,
      lastIndexed: this.lastIndexed,
      isIndexing: this.isIndexing,
    };
  }

  /**
   * Get performance statistics
   */
  getStats(): ContextStats {
    const totalRequests = this.cacheHits + this.cacheMisses;
    const cacheHitRate = totalRequests > 0 ? this.cacheHits / totalRequests : 0;

    // Estimate memory usage (rough approximation)
    const memoryUsage =
      (this.indexedFiles?.length ?? 0) * 1000 + // ~1KB per file
      (this.dependencyGraph?.nodes.size ?? 0) * 100; // ~100 bytes per node

    return {
      totalFiles: this.indexedFiles?.length ?? 0,
      totalSymbols: this.indexedFiles?.reduce((sum, f) => sum + f.symbols.length, 0) ?? 0,
      cacheHitRate,
      lastInvalidation: this.lastInvalidation,
      memoryUsage,
    };
  }

  /**
   * Invalidate the cache, optionally for specific files only.
   * This allows for incremental updates when files change.
   */
  invalidate(options: InvalidationOptions = {}): void {
    const { paths, force } = options;

    if (force || !paths || paths.length === 0) {
      // Full invalidation
      console.error("[RefactorContext] Performing full invalidation");
      this.project = undefined;
      this.indexedFiles = undefined;
      this.dependencyGraph = undefined;
      this.indexer = undefined;
      this.initialized = false;
      this.lastIndexed = null;
      this.lastInvalidation = new Date();
      this.cacheHits = 0;
      this.cacheMisses = 0;
    } else {
      // Partial invalidation for specific files
      console.error(`[RefactorContext] Invalidating ${paths.length} specific files`);

      if (this.indexedFiles) {
        // Remove invalidated files from cache
        const invalidatedPaths = new Set(paths);
        this.indexedFiles = this.indexedFiles.filter(
          (f) => !invalidatedPaths.has(f.path)
        );
      }

      if (this.dependencyGraph) {
        // Remove from dependency graph
        for (const filePath of paths) {
          const relativePath = this.rootPath
            ? path.relative(this.rootPath, filePath)
            : filePath;
          this.dependencyGraph.nodes.delete(relativePath);
          this.dependencyGraph.edges.delete(relativePath);
          this.dependencyGraph.reverseEdges.delete(relativePath);

          // Clean up edges pointing to this file
          for (const edges of this.dependencyGraph.edges.values()) {
            edges.delete(relativePath);
          }
          for (const edges of this.dependencyGraph.reverseEdges.values()) {
            edges.delete(relativePath);
          }
        }
      }

      // Note: ts-morph Project is more complex to partially invalidate,
      // so we leave it as-is. It will auto-refresh files when accessed.

      this.lastInvalidation = new Date();
    }
  }

  /**
   * Find the nearest tsconfig.json
   */
  private findTsConfig(startPath: string): string | undefined {
    let currentPath = path.resolve(startPath);
    const root = path.parse(currentPath).root;

    while (currentPath !== root) {
      const tsConfigPath = path.join(currentPath, "tsconfig.json");
      if (fs.existsSync(tsConfigPath)) {
        return tsConfigPath;
      }
      currentPath = path.dirname(currentPath);
    }

    return undefined;
  }

  /**
   * Build a dependency graph cache from indexed files
   */
  private buildDependencyGraphCache(
    files: RefactorableFile[]
  ): DependencyGraphCache {
    const nodes = new Set<string>();
    const edges = new Map<string, Set<string>>();
    const reverseEdges = new Map<string, Set<string>>();

    for (const file of files) {
      const fromPath = file.relativePath;
      nodes.add(fromPath);

      if (!edges.has(fromPath)) {
        edges.set(fromPath, new Set());
      }

      // Process dependencies
      for (const dep of file.dependencies) {
        // Try to resolve relative imports
        if (dep.startsWith(".")) {
          const resolvedPath = this.resolveDependency(file.path, dep, files);
          if (resolvedPath) {
            const toPath = this.rootPath
              ? path.relative(this.rootPath, resolvedPath)
              : resolvedPath;

            nodes.add(toPath);
            edges.get(fromPath)!.add(toPath);

            // Build reverse edges (who depends on this file)
            if (!reverseEdges.has(toPath)) {
              reverseEdges.set(toPath, new Set());
            }
            reverseEdges.get(toPath)!.add(fromPath);
          }
        }
      }
    }

    return {
      nodes,
      edges,
      reverseEdges,
      lastUpdated: new Date(),
    };
  }

  /**
   * Resolve a dependency path to an actual file
   */
  private resolveDependency(
    fromFile: string,
    importPath: string,
    allFiles: RefactorableFile[]
  ): string | null {
    if (!importPath.startsWith(".")) {
      return null; // Only handle relative imports
    }

    const fromDir = path.dirname(fromFile);
    const resolved = path.resolve(fromDir, importPath);

    // Try with various extensions
    for (const ext of [".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.js", ""]) {
      const withExt = resolved + ext;
      const found = allFiles.find((f) => f.path === withExt);
      if (found) {
        return withExt;
      }
    }

    return null;
  }

  /**
   * Get files that directly depend on the given file
   */
  getDirectDependents(filePath: string): string[] {
    const graph = this.getDependencyGraph();
    const relativePath = this.rootPath
      ? path.relative(this.rootPath, filePath)
      : filePath;

    return Array.from(graph.reverseEdges.get(relativePath) ?? []);
  }

  /**
   * Get files that the given file directly depends on
   */
  getDirectDependencies(filePath: string): string[] {
    const graph = this.getDependencyGraph();
    const relativePath = this.rootPath
      ? path.relative(this.rootPath, filePath)
      : filePath;

    return Array.from(graph.edges.get(relativePath) ?? []);
  }
}

/**
 * Helper function to get the singleton instance
 */
export function getRefactorContext(): RefactorContext {
  return RefactorContext.getInstance();
}
