import { Logger } from '../utils/logger.js';
import { RefactoGentConfig } from '../config/refactogent-schema.js';
import { RefactoGentMetrics } from '../observability/metrics.js';
import { RefactoGentTracer } from '../observability/tracing.js';
import { CodeChunk, ChunkingResult } from './language-chunker.js';
import { MultiIndexResult, MultiIndexArchitecture } from './multi-index.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface FileChange {
  type: 'added' | 'modified' | 'deleted' | 'renamed';
  filePath: string;
  oldPath?: string; // For renamed files
  hash: string;
  timestamp: number;
}

export interface IncrementalUpdate {
  changes: FileChange[];
  affectedChunks: string[];
  updatedIndexes: {
    symbolIndex: boolean;
    semanticIndex: boolean;
    textIndex: boolean;
  };
  processingTime: number;
}

export interface IndexState {
  lastUpdate: number;
  fileHashes: Map<string, string>;
  chunkHashes: Map<string, string>;
  totalFiles: number;
  totalChunks: number;
}

export class IncrementalIndexer {
  private logger: Logger;
  private metrics: RefactoGentMetrics;
  private tracer: RefactoGentTracer;
  private config: RefactoGentConfig;
  private multiIndexer: MultiIndexArchitecture;
  private stateFile: string;
  private debounceTimeout: NodeJS.Timeout | null = null;
  private debounceDelay: number = 1000; // 1 second

  constructor(
    logger: Logger,
    metrics: RefactoGentMetrics,
    tracer: RefactoGentTracer,
    config: RefactoGentConfig
  ) {
    this.logger = logger;
    this.metrics = metrics;
    this.tracer = tracer;
    this.config = config;
    this.multiIndexer = new MultiIndexArchitecture(logger, metrics, tracer, config);
    this.stateFile = path.join(process.cwd(), '.refactogent', 'index-state.json');
  }

  /**
   * Initialize incremental indexing
   */
  async initialize(projectPath: string): Promise<IndexState> {
    const span = this.tracer.startAnalysisTrace(projectPath, 'incremental-indexer-init');

    try {
      this.logger.info('Initializing incremental indexing', { projectPath });

      // Create state directory
      await fs.mkdir(path.dirname(this.stateFile), { recursive: true });

      // Load existing state or create new
      let state: IndexState;
      try {
        const stateContent = await fs.readFile(this.stateFile, 'utf-8');
        state = JSON.parse(stateContent);
        this.logger.info('Loaded existing index state', {
          lastUpdate: new Date(state.lastUpdate).toISOString(),
          totalFiles: state.totalFiles,
          totalChunks: state.totalChunks,
        });
      } catch (error) {
        this.logger.info('Creating new index state');
        state = {
          lastUpdate: Date.now(),
          fileHashes: new Map(),
          chunkHashes: new Map(),
          totalFiles: 0,
          totalChunks: 0,
        };
      }

      // Convert Maps from JSON
      if (state.fileHashes && typeof state.fileHashes === 'object') {
        state.fileHashes = new Map(Object.entries(state.fileHashes));
      }
      if (state.chunkHashes && typeof state.chunkHashes === 'object') {
        state.chunkHashes = new Map(Object.entries(state.chunkHashes));
      }

      this.tracer.recordSuccess(span, 'Incremental indexing initialized');
      return state;
    } catch (error) {
      this.tracer.recordError(span, error as Error, 'Incremental indexing initialization failed');
      throw error;
    }
  }

  /**
   * Detect file changes using git diff
   */
  async detectChanges(projectPath: string, state: IndexState): Promise<FileChange[]> {
    const span = this.tracer.startAnalysisTrace(projectPath, 'detect-changes');

    try {
      this.logger.info('Detecting file changes', { projectPath });

      const changes: FileChange[] = [];

      // Get git diff for staged and unstaged changes
      try {
        const { stdout: stagedDiff } = await execAsync('git diff --cached --name-status', {
          cwd: projectPath,
        });
        const { stdout: unstagedDiff } = await execAsync('git diff --name-status', {
          cwd: projectPath,
        });

        // Parse staged changes
        for (const line of stagedDiff.split('\n').filter(l => l.trim())) {
          const change = this.parseGitDiffLine(line, projectPath);
          if (change) changes.push(change);
        }

        // Parse unstaged changes
        for (const line of unstagedDiff.split('\n').filter(l => l.trim())) {
          const change = this.parseGitDiffLine(line, projectPath);
          if (change) changes.push(change);
        }
      } catch (error) {
        this.logger.warn('Git diff failed, falling back to file system scanning', {
          error: (error as Error).message,
        });

        // Fallback: scan all files and compare hashes
        const allFiles = await this.scanAllFiles(projectPath);
        for (const filePath of allFiles) {
          const currentHash = await this.calculateFileHash(filePath);
          const previousHash = state.fileHashes.get(filePath);

          if (!previousHash) {
            changes.push({
              type: 'added',
              filePath,
              hash: currentHash,
              timestamp: Date.now(),
            });
          } else if (previousHash !== currentHash) {
            changes.push({
              type: 'modified',
              filePath,
              hash: currentHash,
              timestamp: Date.now(),
            });
          }
        }

        // Check for deleted files
        for (const [filePath, hash] of state.fileHashes) {
          try {
            await fs.access(filePath);
          } catch (error) {
            changes.push({
              type: 'deleted',
              filePath,
              hash,
              timestamp: Date.now(),
            });
          }
        }
      }

      this.logger.info(`Detected ${changes.length} file changes`, {
        added: changes.filter(c => c.type === 'added').length,
        modified: changes.filter(c => c.type === 'modified').length,
        deleted: changes.filter(c => c.type === 'deleted').length,
        renamed: changes.filter(c => c.type === 'renamed').length,
      });

      this.tracer.recordSuccess(span, `Detected ${changes.length} changes`);
      return changes;
    } catch (error) {
      this.tracer.recordError(span, error as Error, 'Change detection failed');
      throw error;
    }
  }

  /**
   * Process incremental updates
   */
  async processIncrementalUpdate(
    projectPath: string,
    changes: FileChange[],
    state: IndexState,
    options: {
      maxChanges?: number;
      verbose?: boolean;
    } = {}
  ): Promise<IncrementalUpdate> {
    const span = this.tracer.startAnalysisTrace(projectPath, 'incremental-update');

    try {
      this.logger.info('Processing incremental update', {
        changes: changes.length,
        options,
      });

      const startTime = Date.now();
      const affectedChunks: string[] = [];
      const updatedIndexes = {
        symbolIndex: false,
        semanticIndex: false,
        textIndex: false,
      };

      // Limit changes to prevent overwhelming the system
      const maxChanges = options.maxChanges || 100;
      const changesToProcess = changes.slice(0, maxChanges);

      for (const change of changesToProcess) {
        try {
          if (change.type === 'deleted') {
            // Remove from indexes
            await this.removeFileFromIndexes(change.filePath, state);
            affectedChunks.push(change.filePath);
            updatedIndexes.symbolIndex = true;
            updatedIndexes.semanticIndex = true;
            updatedIndexes.textIndex = true;
          } else if (change.type === 'added' || change.type === 'modified') {
            // Re-index file
            const fileChunks = await this.reindexFile(change.filePath, projectPath);
            affectedChunks.push(...fileChunks.map(c => c.id));
            updatedIndexes.symbolIndex = true;
            updatedIndexes.semanticIndex = true;
            updatedIndexes.textIndex = true;

            // Update state
            state.fileHashes.set(change.filePath, change.hash);
            for (const chunk of fileChunks) {
              state.chunkHashes.set(chunk.id, chunk.metadata.hash);
            }
          }

          if (options.verbose) {
            this.logger.debug(`Processed change: ${change.type} ${change.filePath}`);
          }
        } catch (error) {
          this.logger.warn(`Failed to process change for ${change.filePath}`, {
            error: (error as Error).message,
          });
        }
      }

      // Update state
      state.lastUpdate = Date.now();
      state.totalFiles = state.fileHashes.size;
      state.totalChunks = state.chunkHashes.size;

      // Save state
      await this.saveState(state);

      const processingTime = Date.now() - startTime;

      const result: IncrementalUpdate = {
        changes: changesToProcess,
        affectedChunks,
        updatedIndexes,
        processingTime,
      };

      this.logger.info('Incremental update complete', {
        processedChanges: changesToProcess.length,
        affectedChunks: affectedChunks.length,
        updatedIndexes,
        processingTime,
      });

      this.tracer.recordSuccess(
        span,
        `Processed ${changesToProcess.length} changes in ${processingTime}ms`
      );
      return result;
    } catch (error) {
      this.tracer.recordError(span, error as Error, 'Incremental update failed');
      throw error;
    }
  }

  /**
   * Start file watcher for real-time updates
   */
  async startFileWatcher(
    projectPath: string,
    state: IndexState,
    onUpdate: (update: IncrementalUpdate) => void
  ): Promise<void> {
    this.logger.info('Starting file watcher', { projectPath });

    // This would integrate with a file watcher library like chokidar
    // For now, we'll implement a simple polling mechanism
    const pollInterval = 5000; // 5 seconds

    const pollForChanges = async () => {
      try {
        const changes = await this.detectChanges(projectPath, state);
        if (changes.length > 0) {
          // Debounce changes
          if (this.debounceTimeout) {
            clearTimeout(this.debounceTimeout);
          }

          this.debounceTimeout = setTimeout(async () => {
            try {
              const update = await this.processIncrementalUpdate(projectPath, changes, state);
              onUpdate(update);
            } catch (error) {
              this.logger.error('File watcher update failed', { error: (error as Error).message });
            }
          }, this.debounceDelay);
        }
      } catch (error) {
        this.logger.error('File watcher polling failed', { error: (error as Error).message });
      }
    };

    // Start polling
    setInterval(pollForChanges, pollInterval);

    this.logger.info('File watcher started', { pollInterval });
  }

  /**
   * Parse git diff line
   */
  private parseGitDiffLine(line: string, projectPath: string): FileChange | null {
    const parts = line.split('\t');
    if (parts.length < 2) return null;

    const status = parts[0];
    const filePath = path.resolve(projectPath, parts[1]);

    let type: FileChange['type'];
    switch (status) {
      case 'A':
        type = 'added';
        break;
      case 'M':
        type = 'modified';
        break;
      case 'D':
        type = 'deleted';
        break;
      case 'R':
        type = 'renamed';
        break;
      default:
        return null;
    }

    return {
      type,
      filePath,
      hash: '', // Will be calculated later
      timestamp: Date.now(),
    };
  }

  /**
   * Scan all files in project
   */
  private async scanAllFiles(projectPath: string): Promise<string[]> {
    const files: string[] = [];

    const scanDir = async (dir: string) => {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory()) {
            if (
              !entry.name.startsWith('.') &&
              entry.name !== 'node_modules' &&
              entry.name !== 'dist'
            ) {
              await scanDir(fullPath);
            }
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (
              [
                '.ts',
                '.tsx',
                '.js',
                '.jsx',
                '.py',
                '.go',
                '.java',
                '.rs',
                '.md',
                '.json',
                '.yaml',
                '.yml',
              ].includes(ext)
            ) {
              files.push(fullPath);
            }
          }
        }
      } catch (error) {
        this.logger.warn(`Could not scan directory ${dir}`, { error: (error as Error).message });
      }
    };

    await scanDir(projectPath);
    return files;
  }

  /**
   * Calculate file hash
   */
  private async calculateFileHash(filePath: string): Promise<string> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return this.hashContent(content);
    } catch (error) {
      return '';
    }
  }

  /**
   * Hash content
   */
  private hashContent(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Remove file from indexes
   */
  private async removeFileFromIndexes(filePath: string, state: IndexState): Promise<void> {
    // Remove from file hashes
    state.fileHashes.delete(filePath);

    // Remove chunk hashes for this file
    for (const [chunkId, hash] of state.chunkHashes) {
      if (chunkId.startsWith(filePath)) {
        state.chunkHashes.delete(chunkId);
      }
    }
  }

  /**
   * Re-index a single file
   */
  private async reindexFile(filePath: string, projectPath: string): Promise<CodeChunk[]> {
    // This would use the LanguageChunker to re-chunk the file
    // For now, return empty array as placeholder
    return [];
  }

  /**
   * Save index state
   */
  private async saveState(state: IndexState): Promise<void> {
    const stateToSave = {
      ...state,
      fileHashes: Object.fromEntries(state.fileHashes),
      chunkHashes: Object.fromEntries(state.chunkHashes),
    };

    await fs.writeFile(this.stateFile, JSON.stringify(stateToSave, null, 2));
  }
}
