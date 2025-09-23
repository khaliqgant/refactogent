import { Logger } from '../utils/logger.js';
import { RefactoGentMetrics } from '../observability/metrics.js';
import { RefactoGentTracer } from '../observability/tracing.js';
import { RefactoGentConfig } from '../config/refactogent-schema.js';

export interface RefactorContext {
  projectPath: string;
  filePath: string;
  codeBlock: string;
  surroundingCode: string;
  projectStructure: {
    files: string[];
    dependencies: string[];
    testFiles: string[];
    configFiles: string[];
  };
  codebaseContext: {
    architecturalPatterns: string[];
    codingStandards: string[];
    namingConventions: string[];
    styleGuide: string;
  };
  refactoringHistory: {
    operation: string;
    timestamp: number;
    changes: string[];
    success: boolean;
  }[];
  safetyContext: {
    riskLevel: 'low' | 'medium' | 'high';
    criticalPaths: string[];
    dependencies: string[];
    testCoverage: number;
  };
}

export interface ContextPackage {
  id: string;
  name: string;
  description: string;
  context: RefactorContext;
  metadata: {
    createdAt: number;
    createdBy: string;
    version: string;
    size: number;
    tokens: number;
  };
  validation: {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  };
}

export interface ContextPackageOptions {
  includeTests?: boolean;
  includeDocumentation?: boolean;
  includeHistory?: boolean;
  maxContextSize?: number;
  enableValidation?: boolean;
  enableCompression?: boolean;
}

/**
 * Refactor context package for LLM operations
 */
export class RefactorContextPackage {
  private logger: Logger;
  private metrics: RefactoGentMetrics;
  private tracer: RefactoGentTracer;
  private config: RefactoGentConfig;
  private packages: Map<string, ContextPackage> = new Map();

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
  }

  /**
   * Build Refactor Context Package
   */
  async buildRCP(target: string): Promise<any> {
    const span = this.tracer.startAnalysisTrace('.', 'build-rcp');

    try {
      this.logger.info('Building Refactor Context Package', { target });

      // Mock RCP structure - in real implementation would be more sophisticated
      const rcp = {
        codeSelection: [],
        guardrails: {
          rules: []
        },
        testSignals: {
          testFiles: []
        },
        repoContext: {
          namingConventions: []
        }
      };

      this.tracer.recordSuccess(span, 'RCP built successfully');
      return rcp;
    } catch (error) {
      this.tracer.recordError(span, error as Error, 'RCP build failed');
      throw error;
    }
  }

  /**
   * Create a context package
   */
  async createContextPackage(
    name: string,
    description: string,
    context: RefactorContext,
    options: ContextPackageOptions = {}
  ): Promise<string> {
    const span = this.tracer.startAnalysisTrace('.', 'context-package-creation');
    const startTime = Date.now();

    try {
      this.logger.info('Creating context package', {
        name,
        description,
        projectPath: context.projectPath,
        filePath: context.filePath
      });

      // Build context package
      const contextPackage: ContextPackage = {
        id: this.generatePackageId(),
        name,
        description,
        context: await this.buildContext(context, options),
        metadata: {
          createdAt: Date.now(),
          createdBy: 'refactogent',
          version: '1.0.0',
          size: 0,
          tokens: 0
        },
        validation: {
          isValid: false,
          errors: [],
          warnings: []
        }
      };

      // Calculate size and tokens
      const serialized = JSON.stringify(contextPackage.context);
      contextPackage.metadata.size = serialized.length;
      contextPackage.metadata.tokens = Math.ceil(serialized.length / 4);

      // Validate package
      if (options.enableValidation !== false) {
        contextPackage.validation = await this.validatePackage(contextPackage);
      }

      this.packages.set(contextPackage.id, contextPackage);

      this.tracer.recordSuccess(
        span,
        `Context package created: ${contextPackage.id} with ${contextPackage.metadata.tokens} tokens`
      );

      return contextPackage.id;
    } catch (error) {
      this.tracer.recordError(span, error as Error, 'Context package creation failed');
      throw error;
    }
  }

  /**
   * Build context from input
   */
  private async buildContext(
    context: RefactorContext,
    options: ContextPackageOptions
  ): Promise<RefactorContext> {
    const builtContext: RefactorContext = {
      ...context,
      projectStructure: {
        files: context.projectStructure.files || [],
        dependencies: context.projectStructure.dependencies || [],
        testFiles: options.includeTests ? context.projectStructure.testFiles || [] : [],
        configFiles: context.projectStructure.configFiles || []
      },
      codebaseContext: {
        architecturalPatterns: context.codebaseContext.architecturalPatterns || [],
        codingStandards: context.codebaseContext.codingStandards || [],
        namingConventions: context.codebaseContext.namingConventions || [],
        styleGuide: context.codebaseContext.styleGuide || ''
      },
      refactoringHistory: options.includeHistory ? context.refactoringHistory || [] : [],
      safetyContext: {
        riskLevel: context.safetyContext.riskLevel || 'medium',
        criticalPaths: context.safetyContext.criticalPaths || [],
        dependencies: context.safetyContext.dependencies || [],
        testCoverage: context.safetyContext.testCoverage || 0
      }
    };

    // Apply size limits
    if (options.maxContextSize) {
      const serialized = JSON.stringify(builtContext);
      if (serialized.length > options.maxContextSize) {
        this.logger.warn('Context size exceeds limit, truncating', {
          size: serialized.length,
          limit: options.maxContextSize
        });
        // Truncate context (simplified)
        builtContext.surroundingCode = builtContext.surroundingCode.substring(0, 1000);
      }
    }

    return builtContext;
  }

  /**
   * Validate context package
   */
  private async validatePackage(contextPackage: ContextPackage): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check required fields
    if (!contextPackage.context.projectPath) {
      errors.push('Project path is required');
    }

    if (!contextPackage.context.filePath) {
      errors.push('File path is required');
    }

    if (!contextPackage.context.codeBlock) {
      errors.push('Code block is required');
    }

    // Check context quality
    if (contextPackage.context.codeBlock.length < 10) {
      warnings.push('Code block is very short');
    }

    if (contextPackage.context.surroundingCode.length < 50) {
      warnings.push('Limited surrounding code context');
    }

    if (contextPackage.context.projectStructure.files.length === 0) {
      warnings.push('No project files found');
    }

    if (contextPackage.context.safetyContext.testCoverage < 0.5) {
      warnings.push('Low test coverage detected');
    }

    // Check size limits
    if (contextPackage.metadata.size > 1000000) { // 1MB
      warnings.push('Context package is very large');
    }

    if (contextPackage.metadata.tokens > 100000) { // 100k tokens
      warnings.push('Context package has high token count');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Get context package by ID
   */
  getPackage(packageId: string): ContextPackage | undefined {
    return this.packages.get(packageId);
  }

  /**
   * Get all context packages
   */
  getAllPackages(): ContextPackage[] {
    return Array.from(this.packages.values());
  }

  /**
   * Update context package
   */
  async updatePackage(
    packageId: string,
    updates: Partial<RefactorContext>
  ): Promise<boolean> {
    const contextPackage = this.packages.get(packageId);
    if (!contextPackage) {
      return false;
    }

    // Update context
    contextPackage.context = {
      ...contextPackage.context,
      ...updates
    };

    // Recalculate metadata
    const serialized = JSON.stringify(contextPackage.context);
    contextPackage.metadata.size = serialized.length;
    contextPackage.metadata.tokens = Math.ceil(serialized.length / 4);

    // Revalidate
    contextPackage.validation = await this.validatePackage(contextPackage);

    this.logger.info('Updated context package', {
      packageId,
      newSize: contextPackage.metadata.size,
      newTokens: contextPackage.metadata.tokens
    });

    return true;
  }

  /**
   * Delete context package
   */
  async deletePackage(packageId: string): Promise<boolean> {
    const contextPackage = this.packages.get(packageId);
    if (!contextPackage) {
      return false;
    }

    this.packages.delete(packageId);
    this.logger.info('Deleted context package', { packageId });
    return true;
  }

  /**
   * Search context packages
   */
  searchPackages(query: string): ContextPackage[] {
    const packages = Array.from(this.packages.values());
    const lowerQuery = query.toLowerCase();

    return packages.filter(pkg => 
      pkg.name.toLowerCase().includes(lowerQuery) ||
      pkg.description.toLowerCase().includes(lowerQuery) ||
      pkg.context.filePath.toLowerCase().includes(lowerQuery) ||
      pkg.context.projectPath.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Get context package statistics
   */
  async getPackageStats(): Promise<{
    totalPackages: number;
    totalSize: number;
    totalTokens: number;
    averageSize: number;
    averageTokens: number;
    validationStats: {
      valid: number;
      invalid: number;
      warnings: number;
    };
    sizeDistribution: {
      small: number;
      medium: number;
      large: number;
    };
  }> {
    const packages = Array.from(this.packages.values());
    
    const totalSize = packages.reduce((sum, pkg) => sum + pkg.metadata.size, 0);
    const totalTokens = packages.reduce((sum, pkg) => sum + pkg.metadata.tokens, 0);
    const averageSize = packages.length > 0 ? totalSize / packages.length : 0;
    const averageTokens = packages.length > 0 ? totalTokens / packages.length : 0;

    const validationStats = {
      valid: packages.filter(pkg => pkg.validation.isValid).length,
      invalid: packages.filter(pkg => !pkg.validation.isValid).length,
      warnings: packages.filter(pkg => pkg.validation.warnings.length > 0).length
    };

    const sizeDistribution = {
      small: packages.filter(pkg => pkg.metadata.size < 10000).length,
      medium: packages.filter(pkg => pkg.metadata.size >= 10000 && pkg.metadata.size < 100000).length,
      large: packages.filter(pkg => pkg.metadata.size >= 100000).length
    };

    return {
      totalPackages: packages.length,
      totalSize,
      totalTokens,
      averageSize,
      averageTokens,
      validationStats,
      sizeDistribution
    };
  }

  /**
   * Generate unique package ID
   */
  private generatePackageId(): string {
    return `pkg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Close the context package manager
   */
  async close(): Promise<void> {
    this.logger.info('Closing refactor context package manager');
    this.packages.clear();
  }
}