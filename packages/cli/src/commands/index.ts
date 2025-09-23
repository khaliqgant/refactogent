import { Logger } from '../utils/logger.js';
import { RefactoGentConfig } from '../config/refactogent-schema.js';
import { RefactoGentMetrics } from '../observability/metrics.js';
import { RefactoGentTracer } from '../observability/tracing.js';
import { LanguageChunker } from '../ingestion/language-chunker.js';
import { MultiIndexArchitecture } from '../ingestion/multi-index.js';
import { IncrementalIndexer } from '../ingestion/incremental-indexer.js';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface IndexCommandOptions {
  projectPath: string;
  maxChunkSize?: number;
  includeTests?: boolean;
  includeDocs?: boolean;
  includeConfigs?: boolean;
  maxEmbeddings?: number;
  verbose?: boolean;
  incremental?: boolean;
  watch?: boolean;
}

export class IndexCommand {
  private logger: Logger;
  private metrics: RefactoGentMetrics;
  private tracer: RefactoGentTracer;
  private config: RefactoGentConfig;
  private chunker: LanguageChunker;
  private multiIndexer: MultiIndexArchitecture;
  private incrementalIndexer: IncrementalIndexer;

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
    this.chunker = new LanguageChunker(logger, metrics, tracer, config);
    this.multiIndexer = new MultiIndexArchitecture(logger, metrics, tracer, config);
    this.incrementalIndexer = new IncrementalIndexer(logger, metrics, tracer, config);
  }

  /**
   * Run full indexing
   */
  async runFullIndex(options: IndexCommandOptions): Promise<void> {
    const span = this.tracer.startAnalysisTrace(options.projectPath, 'full-index');

    try {
      console.log('🔍 Starting full project indexing...');
      console.log(`📁 Project: ${options.projectPath}`);
      console.log(`📊 Options: ${JSON.stringify(options, null, 2)}`);

      // Step 1: Language-aware chunking
      console.log('\n📝 Step 1: Language-aware chunking');
      const chunkingResult = await this.chunker.chunkProject(options.projectPath, {
        maxChunkSize: options.maxChunkSize,
        includeTests: options.includeTests,
        includeDocs: options.includeDocs,
        includeConfigs: options.includeConfigs,
        verbose: options.verbose,
      });

      console.log(
        `✅ Chunked ${chunkingResult.totalChunks} chunks from ${chunkingResult.totalFiles} files`
      );
      console.log(`⏱️  Processing time: ${chunkingResult.processingTime}ms`);

      if (options.verbose) {
        console.log('\n📊 Language Distribution:');
        Object.entries(chunkingResult.languageDistribution).forEach(([lang, count]) => {
          console.log(`  ${lang}: ${count} chunks`);
        });

        console.log('\n📊 Complexity Distribution:');
        Object.entries(chunkingResult.complexityDistribution).forEach(([level, count]) => {
          console.log(`  ${level}: ${count} chunks`);
        });
      }

      // Step 2: Multi-index architecture
      console.log('\n🔍 Step 2: Building multi-index architecture');
      const indexResult = await this.multiIndexer.buildIndexes(chunkingResult, {
        includeEmbeddings: true,
        includeBM25: true,
        maxEmbeddings: options.maxEmbeddings,
        verbose: options.verbose,
      });

      console.log(
        `✅ Built indexes: ${indexResult.stats.totalSymbols} symbols, ${indexResult.stats.totalEmbeddings} embeddings, ${indexResult.stats.totalTerms} terms`
      );
      console.log(`⏱️  Processing time: ${indexResult.stats.processingTime}ms`);

      // Step 3: Save indexes
      console.log('\n💾 Step 3: Saving indexes');
      await this.saveIndexes(options.projectPath, chunkingResult, indexResult);

      console.log('\n🎉 Full indexing complete!');
      console.log('═'.repeat(60));
      console.log('📊 Index Statistics:');
      console.log(`  📁 Files processed: ${chunkingResult.totalFiles}`);
      console.log(`  📝 Chunks created: ${chunkingResult.totalChunks}`);
      console.log(`  🔤 Symbols indexed: ${indexResult.stats.totalSymbols}`);
      console.log(`  🔗 References indexed: ${indexResult.stats.totalReferences}`);
      console.log(`  📚 Definitions indexed: ${indexResult.stats.totalDefinitions}`);
      console.log(`  🧠 Embeddings created: ${indexResult.stats.totalEmbeddings}`);
      console.log(`  📖 Terms indexed: ${indexResult.stats.totalTerms}`);
      console.log(
        `  ⏱️  Total time: ${chunkingResult.processingTime + indexResult.stats.processingTime}ms`
      );

      this.tracer.recordSuccess(
        span,
        `Full indexing complete: ${chunkingResult.totalChunks} chunks, ${indexResult.stats.totalSymbols} symbols`
      );
    } catch (error) {
      this.tracer.recordError(span, error as Error, 'Full indexing failed');
      throw error;
    }
  }

  /**
   * Run incremental indexing
   */
  async runIncrementalIndex(options: IndexCommandOptions): Promise<void> {
    const span = this.tracer.startAnalysisTrace(options.projectPath, 'incremental-index');

    try {
      console.log('🔄 Starting incremental indexing...');
      console.log(`📁 Project: ${options.projectPath}`);

      // Initialize incremental indexer
      const state = await this.incrementalIndexer.initialize(options.projectPath);
      console.log(`📊 Current state: ${state.totalFiles} files, ${state.totalChunks} chunks`);

      // Detect changes
      console.log('\n🔍 Detecting changes...');
      const changes = await this.incrementalIndexer.detectChanges(options.projectPath, state);

      if (changes.length === 0) {
        console.log('✅ No changes detected');
        return;
      }

      console.log(`📝 Found ${changes.length} changes:`);
      changes.forEach(change => {
        console.log(`  ${change.type}: ${change.filePath}`);
      });

      // Process incremental update
      console.log('\n🔄 Processing incremental update...');
      const update = await this.incrementalIndexer.processIncrementalUpdate(
        options.projectPath,
        changes,
        state,
        {
          maxChanges: 100,
          verbose: options.verbose,
        }
      );

      console.log(`✅ Processed ${update.changes.length} changes`);
      console.log(`📝 Affected chunks: ${update.affectedChunks.length}`);
      console.log(`⏱️  Processing time: ${update.processingTime}ms`);

      if (options.verbose) {
        console.log('\n📊 Updated Indexes:');
        console.log(`  Symbol index: ${update.updatedIndexes.symbolIndex ? '✅' : '❌'}`);
        console.log(`  Semantic index: ${update.updatedIndexes.semanticIndex ? '✅' : '❌'}`);
        console.log(`  Text index: ${update.updatedIndexes.textIndex ? '✅' : '❌'}`);
      }

      console.log('\n🎉 Incremental indexing complete!');

      this.tracer.recordSuccess(
        span,
        `Incremental indexing complete: ${update.changes.length} changes processed`
      );
    } catch (error) {
      this.tracer.recordError(span, error as Error, 'Incremental indexing failed');
      throw error;
    }
  }

  /**
   * Start file watcher
   */
  async startFileWatcher(options: IndexCommandOptions): Promise<void> {
    const span = this.tracer.startAnalysisTrace(options.projectPath, 'file-watcher');

    try {
      console.log('👀 Starting file watcher...');
      console.log(`📁 Project: ${options.projectPath}`);
      console.log('🔄 Watching for file changes...');

      // Initialize incremental indexer
      const state = await this.incrementalIndexer.initialize(options.projectPath);

      // Start file watcher
      await this.incrementalIndexer.startFileWatcher(options.projectPath, state, update => {
        console.log(`\n🔄 File change detected:`);
        console.log(`  📝 Changes: ${update.changes.length}`);
        console.log(`  📝 Affected chunks: ${update.affectedChunks.length}`);
        console.log(`  ⏱️  Processing time: ${update.processingTime}ms`);
      });

      console.log('✅ File watcher started');
      console.log('Press Ctrl+C to stop');

      // Keep the process running
      process.on('SIGINT', () => {
        console.log('\n👋 Stopping file watcher...');
        process.exit(0);
      });

      this.tracer.recordSuccess(span, 'File watcher started');
    } catch (error) {
      this.tracer.recordError(span, error as Error, 'File watcher failed');
      throw error;
    }
  }

  /**
   * Save indexes to disk
   */
  private async saveIndexes(
    projectPath: string,
    chunkingResult: any,
    indexResult: any
  ): Promise<void> {
    const indexPath = path.join(projectPath, '.refactogent', 'indexes');
    await fs.mkdir(indexPath, { recursive: true });

    // Save chunking result
    await fs.writeFile(
      path.join(indexPath, 'chunks.json'),
      JSON.stringify(chunkingResult, null, 2)
    );

    // Save index result
    await fs.writeFile(path.join(indexPath, 'indexes.json'), JSON.stringify(indexResult, null, 2));

    console.log(`💾 Indexes saved to ${indexPath}`);
  }
}
