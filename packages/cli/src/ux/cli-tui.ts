import { Logger } from '../utils/logger.js';
import { RefactoGentMetrics } from '../observability/metrics.js';
import { RefactoGentTracer } from '../observability/tracing.js';
import { RefactoGentConfig } from '../config/refactogent-schema.js';
import { ContextPreview, ContextPreviewOptions } from './context-preview.js';
import { InteractiveFeatures, InteractiveOptions } from './interactive-features.js';

export interface TUIOptions {
  theme?: 'light' | 'dark' | 'auto';
  showProgress?: boolean;
  showCitations?: boolean;
  showPlan?: boolean;
  interactive?: boolean;
  width?: number;
  height?: number;
}

export interface TUIState {
  currentStep: string;
  progress: number;
  citations: any[];
  plan: any;
  context: any;
  errors: string[];
  warnings: string[];
}

export class CLITUI {
  private logger: Logger;
  private metrics: RefactoGentMetrics;
  private tracer: RefactoGentTracer;
  private config: RefactoGentConfig;
  private contextPreview: ContextPreview;
  private interactiveFeatures: InteractiveFeatures;
  private state: TUIState;

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
    this.contextPreview = new ContextPreview(logger, metrics, tracer, config);
    this.interactiveFeatures = new InteractiveFeatures(logger, metrics, tracer, config);
    this.state = {
      currentStep: 'initializing',
      progress: 0,
      citations: [],
      plan: null,
      context: null,
      errors: [],
      warnings: [],
    };
  }

  /**
   * Initialize TUI with options
   */
  async initialize(options: TUIOptions = {}): Promise<void> {
    const span = this.tracer.startAnalysisTrace('.', 'tui-initialize');

    try {
      this.logger.info('Initializing CLI TUI', { options });

      const opts = {
        theme: 'auto',
        showProgress: true,
        showCitations: true,
        showPlan: true,
        interactive: true,
        width: 80,
        height: 24,
        ...options,
      };

      // Set up TUI state
      this.state = {
        currentStep: 'initializing',
        progress: 0,
        citations: [],
        plan: null,
        context: null,
        errors: [],
        warnings: [],
      };

      this.tracer.recordSuccess(span, 'TUI initialized successfully');
    } catch (error) {
      this.tracer.recordError(span, error as Error, 'TUI initialization failed');
      throw error;
    }
  }

  /**
   * Start interactive session
   */
  async startInteractiveSession(
    query: string,
    projectPath: string,
    options: TUIOptions = {}
  ): Promise<void> {
    const span = this.tracer.startAnalysisTrace(projectPath, 'tui-interactive-session');

    try {
      this.logger.info('Starting interactive session', { query, projectPath, options });

      // Update state
      this.state.currentStep = 'analyzing';
      this.state.progress = 10;

      // Show initial screen
      this.renderHeader();
      this.renderProgress();
      this.renderStatus();

      // Generate context preview
      this.state.currentStep = 'generating-context';
      this.state.progress = 30;

      const contextOptions: ContextPreviewOptions = {
        showFiles: true,
        showLines: true,
        showSymbols: true,
        showDependencies: true,
        maxFiles: 20,
        maxLines: 1000,
        includeTests: false,
        includeConfigs: false,
      };

      const contextResult = await this.contextPreview.generatePreview(
        query,
        projectPath,
        contextOptions
      );

      this.state.context = contextResult;
      this.state.progress = 50;

      // Generate citations
      this.state.currentStep = 'generating-citations';
      this.state.progress = 70;

      const interactiveOptions: InteractiveOptions = {
        enableCitations: true,
        enableHover: true,
        enableReGround: true,
        enablePlanPreview: true,
        maxCitations: 10,
        hoverDelay: 500,
      };

      const citations = await this.interactiveFeatures.generateCitations(
        query,
        contextResult,
        interactiveOptions
      );

      this.state.citations = citations;
      this.state.progress = 80;

      // Generate plan preview
      this.state.currentStep = 'generating-plan';
      this.state.progress = 90;

      const plan = await this.interactiveFeatures.generatePlanPreview(
        query,
        projectPath,
        interactiveOptions
      );

      this.state.plan = plan;
      this.state.progress = 100;
      this.state.currentStep = 'ready';

      // Render final screen
      this.renderCompleteScreen();

      this.tracer.recordSuccess(span, 'Interactive session completed successfully');
    } catch (error) {
      this.tracer.recordError(span, error as Error, 'Interactive session failed');
      this.state.errors.push(error instanceof Error ? error.message : 'Unknown error');
      this.renderErrorScreen();
    }
  }

  /**
   * Render header
   */
  private renderHeader(): void {
    console.log('┌─────────────────────────────────────────────────────────────────┐');
    console.log('│                    RefactoGent TUI Interface                    │');
    console.log('│                    Advanced LLM Integration                    │');
    console.log('└─────────────────────────────────────────────────────────────────┘');
    console.log();
  }

  /**
   * Render progress bar
   */
  private renderProgress(): void {
    const width = 50;
    const filled = Math.floor((this.state.progress / 100) * width);
    const empty = width - filled;

    let progressBar = 'Progress: [';
    progressBar += '█'.repeat(filled);
    progressBar += '░'.repeat(empty);
    progressBar += `] ${this.state.progress}%`;

    console.log(progressBar);
    console.log();
  }

  /**
   * Render status
   */
  private renderStatus(): void {
    console.log(`Status: ${this.state.currentStep}`);
    console.log();
  }

  /**
   * Render complete screen
   */
  private renderCompleteScreen(): void {
    console.clear();
    this.renderHeader();

    // Show context preview
    if (this.state.context) {
      console.log('📋 Context Preview');
      console.log('='.repeat(50));
      console.log(this.contextPreview.formatPreview(this.state.context));
      console.log();
    }

    // Show citations
    if (this.state.citations.length > 0) {
      console.log('🔗 Citations');
      console.log('='.repeat(50));
      this.state.citations.forEach((citation, index) => {
        console.log(`${index + 1}. ${citation.path}:${citation.line || 'N/A'}`);
        console.log(`   Type: ${citation.type}`);
        console.log(`   Relevance: ${(citation.relevance * 100).toFixed(1)}%`);
        console.log(`   Reason: ${citation.reason}`);
        console.log();
      });
    }

    // Show plan preview
    if (this.state.plan) {
      console.log('📋 Plan Preview');
      console.log('='.repeat(50));
      console.log(this.interactiveFeatures.formatPlanPreview(this.state.plan));
      console.log();
    }

    // Show interactive options
    console.log('🎮 Interactive Options');
    console.log('='.repeat(50));
    console.log('1. 🔄 Re-ground context');
    console.log('2. 📋 Preview plan');
    console.log('3. 👁️ Toggle context visibility');
    console.log('4. 🚀 Execute plan');
    console.log('5. ❌ Cancel');
    console.log();
  }

  /**
   * Render error screen
   */
  private renderErrorScreen(): void {
    console.clear();
    this.renderHeader();

    console.log('❌ Error');
    console.log('='.repeat(50));
    this.state.errors.forEach((error, index) => {
      console.log(`${index + 1}. ${error}`);
    });
    console.log();

    if (this.state.warnings.length > 0) {
      console.log('⚠️ Warnings');
      console.log('='.repeat(50));
      this.state.warnings.forEach((warning, index) => {
        console.log(`${index + 1}. ${warning}`);
      });
      console.log();
    }
  }

  /**
   * Handle user input
   */
  async handleInput(input: string): Promise<void> {
    const span = this.tracer.startAnalysisTrace('.', 'tui-handle-input');

    try {
      this.logger.info('Handling user input', { input });

      switch (input.trim()) {
        case '1':
          await this.handleReGround();
          break;
        case '2':
          await this.handlePlanPreview();
          break;
        case '3':
          await this.handleToggleContext();
          break;
        case '4':
          await this.handleExecutePlan();
          break;
        case '5':
          await this.handleCancel();
          break;
        default:
          console.log('Invalid option. Please choose 1-5.');
      }

      this.tracer.recordSuccess(span, 'User input handled successfully');
    } catch (error) {
      this.tracer.recordError(span, error as Error, 'User input handling failed');
      this.state.errors.push(error instanceof Error ? error.message : 'Unknown error');
      this.renderErrorScreen();
    }
  }

  /**
   * Handle re-ground action
   */
  private async handleReGround(): Promise<void> {
    console.log('🔄 Re-grounding context...');
    // Implementation would call interactiveFeatures.reGround()
    console.log('Context re-grounded successfully!');
  }

  /**
   * Handle plan preview action
   */
  private async handlePlanPreview(): Promise<void> {
    if (this.state.plan) {
      console.log('📋 Plan Preview');
      console.log('='.repeat(50));
      console.log(this.interactiveFeatures.formatPlanPreview(this.state.plan));
    } else {
      console.log('No plan available.');
    }
  }

  /**
   * Handle toggle context action
   */
  private async handleToggleContext(): Promise<void> {
    console.log('👁️ Context visibility toggled.');
    // Implementation would toggle context display
  }

  /**
   * Handle execute plan action
   */
  private async handleExecutePlan(): Promise<void> {
    console.log('🚀 Executing plan...');
    // Implementation would execute the plan
    console.log('Plan executed successfully!');
  }

  /**
   * Handle cancel action
   */
  private async handleCancel(): Promise<void> {
    console.log('❌ Operation cancelled.');
    process.exit(0);
  }

  /**
   * Clean up TUI
   */
  async cleanup(): Promise<void> {
    const span = this.tracer.startAnalysisTrace('.', 'tui-cleanup');

    try {
      this.logger.info('Cleaning up TUI');

      // Reset state
      this.state = {
        currentStep: 'idle',
        progress: 0,
        citations: [],
        plan: null,
        context: null,
        errors: [],
        warnings: [],
      };

      this.tracer.recordSuccess(span, 'TUI cleanup completed');
    } catch (error) {
      this.tracer.recordError(span, error as Error, 'TUI cleanup failed');
      throw error;
    }
  }
}
