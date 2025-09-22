import { Project, SourceFile, Node, SyntaxKind } from 'ts-morph';
import * as babel from '@babel/core';
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import generate from '@babel/generator';
import * as t from '@babel/types';
import fs from 'fs';
import path from 'path';
import { Logger } from '../utils/logger.js';

export interface Transformation {
  id: string;
  name: string;
  description: string;
  category: 'refactor' | 'modernize' | 'optimize' | 'cleanup';
  language: 'typescript' | 'javascript' | 'any';
  riskLevel: 'low' | 'medium' | 'high';
  dependencies: string[]; // Other transformation IDs this depends on
  conflicts: string[]; // Transformation IDs this conflicts with
  apply: (context: TransformationContext) => Promise<TransformationResult>;
  validate?: (context: TransformationContext) => Promise<ValidationResult>;
  rollback?: (context: TransformationContext, result: TransformationResult) => Promise<void>;
}

export interface TransformationContext {
  sourceFile: SourceFile;
  project: Project;
  filePath: string;
  language: 'typescript' | 'javascript';
  options: Record<string, any>;
  metadata: {
    originalContent: string;
    fileStats: fs.Stats;
    dependencies: string[];
  };
}

export interface TransformationResult {
  success: boolean;
  transformationId: string;
  changes: CodeChange[];
  transformedContent?: string;
  syntaxValid: boolean;
  semanticValid: boolean;
  rollbackData?: any;
  diagnostics: string[];
  metrics: {
    linesChanged: number;
    complexity: {
      before: number;
      after: number;
    };
    performance: {
      executionTime: number;
      memoryUsage: number;
    };
  };
}

export interface CodeChange {
  type: 'insert' | 'delete' | 'replace' | 'move';
  location: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  originalText: string;
  newText: string;
  description: string;
  confidence: number; // 0-100
  riskLevel: 'low' | 'medium' | 'high';
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  warnings: ValidationWarning[];
  suggestions: string[];
}

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  message: string;
  location?: {
    line: number;
    column: number;
  };
  code?: string;
}

export interface ValidationWarning {
  message: string;
  location?: {
    line: number;
    column: number;
  };
  suggestion?: string;
}

export interface TransformationPlan {
  id: string;
  transformations: string[];
  executionOrder: string[];
  conflicts: ConflictResolution[];
  estimatedImpact: {
    filesAffected: number;
    linesChanged: number;
    riskScore: number;
  };
}

export interface ConflictResolution {
  transformationA: string;
  transformationB: string;
  resolution: 'skip' | 'merge' | 'prioritize' | 'manual';
  reason: string;
}

export interface ExecutionResult {
  planId: string;
  success: boolean;
  results: TransformationResult[];
  rollbackPlan?: RollbackPlan;
  summary: {
    totalTransformations: number;
    successfulTransformations: number;
    failedTransformations: number;
    totalChanges: number;
    executionTime: number;
  };
}

export interface RollbackPlan {
  id: string;
  timestamp: number;
  transformations: Array<{
    transformationId: string;
    rollbackData: any;
    filePath: string;
  }>;
}

export class TransformationEngine {
  private logger: Logger;
  private project: Project;
  private transformations: Map<string, Transformation> = new Map();
  private executionHistory: ExecutionResult[] = [];

  constructor(logger: Logger) {
    this.logger = logger;
    this.project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        target: 99, // Latest
        module: 99, // ESNext
        strict: false,
        allowJs: true,
        checkJs: false,
      },
    });

    // Initialize built-in transformations asynchronously
    this.initializeBuiltInTransformations().catch(error => {
      this.logger.warn('Failed to initialize built-in transformations', { error });
    });
  }

  /**
   * Register a new transformation
   */
  registerTransformation(transformation: Transformation): void {
    this.transformations.set(transformation.id, transformation);
    this.logger.debug('Registered transformation', {
      id: transformation.id,
      name: transformation.name,
    });
  }

  /**
   * Get available transformations
   */
  async getAvailableTransformations(): Promise<Transformation[]> {
    // Ensure built-in transformations are loaded
    if (this.transformations.size === 0) {
      await this.initializeBuiltInTransformations();
    }
    return Array.from(this.transformations.values());
  }

  /**
   * Create transformation plan
   */
  async createTransformationPlan(
    transformationIds: string[],
    options: {
      resolveConflicts?: boolean;
      optimizeOrder?: boolean;
    } = {}
  ): Promise<TransformationPlan> {
    this.logger.info('Creating transformation plan', {
      transformations: transformationIds.length,
    });

    // Validate transformation IDs
    const invalidIds = transformationIds.filter(id => !this.transformations.has(id));
    if (invalidIds.length > 0) {
      throw new Error(`Invalid transformation IDs: ${invalidIds.join(', ')}`);
    }

    // Detect conflicts
    const conflicts = this.detectConflicts(transformationIds);

    // Resolve conflicts if requested
    const resolvedConflicts = options.resolveConflicts
      ? this.resolveConflicts(conflicts)
      : conflicts.map(c => ({ ...c, resolution: 'manual' as const }));

    // Determine execution order
    const executionOrder = options.optimizeOrder
      ? this.optimizeExecutionOrder(transformationIds)
      : this.resolveExecutionOrder(transformationIds);

    // Estimate impact
    const estimatedImpact = await this.estimateImpact(transformationIds);

    const plan: TransformationPlan = {
      id: `plan-${Date.now()}`,
      transformations: transformationIds,
      executionOrder,
      conflicts: resolvedConflicts,
      estimatedImpact,
    };

    this.logger.info('Transformation plan created', {
      planId: plan.id,
      transformations: plan.transformations.length,
      conflicts: plan.conflicts.length,
      estimatedFiles: plan.estimatedImpact.filesAffected,
    });

    return plan;
  }

  /**
   * Execute transformation plan
   */
  async executePlan(
    plan: TransformationPlan,
    filePaths: string[],
    options: {
      dryRun?: boolean;
      createRollbackPlan?: boolean;
      stopOnError?: boolean;
    } = {}
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    this.logger.info('Executing transformation plan', {
      planId: plan.id,
      files: filePaths.length,
      dryRun: options.dryRun,
    });

    const results: TransformationResult[] = [];
    let rollbackPlan: RollbackPlan | undefined;

    if (options.createRollbackPlan) {
      rollbackPlan = {
        id: `rollback-${plan.id}`,
        timestamp: Date.now(),
        transformations: [],
      };
    }

    // Execute transformations in order
    for (const transformationId of plan.executionOrder) {
      const transformation = this.transformations.get(transformationId)!;

      this.logger.info('Executing transformation', {
        id: transformationId,
        name: transformation.name,
      });

      for (const filePath of filePaths) {
        try {
          const result = await this.executeTransformation(
            transformation,
            filePath,
            options.dryRun || false
          );

          results.push(result);

          // Add to rollback plan if successful and not dry run
          if (result.success && !options.dryRun && rollbackPlan && result.rollbackData) {
            rollbackPlan.transformations.push({
              transformationId,
              rollbackData: result.rollbackData,
              filePath,
            });
          }

          // Stop on error if requested
          if (!result.success && options.stopOnError) {
            this.logger.error('Transformation failed, stopping execution', {
              transformationId,
              filePath,
            });
            break;
          }
        } catch (error) {
          this.logger.error('Transformation execution error', {
            transformationId,
            filePath,
            error: error instanceof Error ? error.message : String(error),
          });

          if (options.stopOnError) {
            break;
          }
        }
      }
    }

    const endTime = Date.now();
    const executionResult: ExecutionResult = {
      planId: plan.id,
      success: results.every(r => r.success),
      results,
      rollbackPlan,
      summary: {
        totalTransformations: plan.transformations.length,
        successfulTransformations: results.filter(r => r.success).length,
        failedTransformations: results.filter(r => !r.success).length,
        totalChanges: results.reduce((sum, r) => sum + r.changes.length, 0),
        executionTime: endTime - startTime,
      },
    };

    this.executionHistory.push(executionResult);

    this.logger.info('Transformation plan execution completed', {
      planId: plan.id,
      success: executionResult.success,
      totalChanges: executionResult.summary.totalChanges,
      executionTime: executionResult.summary.executionTime,
    });

    return executionResult;
  }

  /**
   * Execute rollback plan
   */
  async executeRollback(rollbackPlan: RollbackPlan): Promise<boolean> {
    this.logger.info('Executing rollback plan', {
      rollbackId: rollbackPlan.id,
      transformations: rollbackPlan.transformations.length,
    });

    let success = true;

    // Execute rollbacks in reverse order
    for (const rollbackItem of rollbackPlan.transformations.reverse()) {
      try {
        const transformation = this.transformations.get(rollbackItem.transformationId);
        if (transformation?.rollback) {
          const context = await this.createTransformationContext(rollbackItem.filePath);
          await transformation.rollback(context, {
            success: true,
            transformationId: rollbackItem.transformationId,
            changes: [],
            syntaxValid: true,
            semanticValid: true,
            rollbackData: rollbackItem.rollbackData,
            diagnostics: [],
            metrics: {
              linesChanged: 0,
              complexity: { before: 0, after: 0 },
              performance: { executionTime: 0, memoryUsage: 0 },
            },
          });
        }
      } catch (error) {
        this.logger.error('Rollback failed for transformation', {
          transformationId: rollbackItem.transformationId,
          filePath: rollbackItem.filePath,
          error: error instanceof Error ? error.message : String(error),
        });
        success = false;
      }
    }

    this.logger.info('Rollback plan execution completed', {
      rollbackId: rollbackPlan.id,
      success,
    });

    return success;
  }

  /**
   * Validate transformation plan
   */
  async validatePlan(plan: TransformationPlan, filePaths: string[]): Promise<ValidationResult> {
    const issues: ValidationIssue[] = [];
    const warnings: ValidationWarning[] = [];
    const suggestions: string[] = [];

    // Check for unresolved conflicts
    const unresolvedConflicts = plan.conflicts.filter(c => c.resolution === 'manual');
    if (unresolvedConflicts.length > 0) {
      issues.push({
        severity: 'error',
        message: `${unresolvedConflicts.length} unresolved conflicts require manual resolution`,
        code: 'UNRESOLVED_CONFLICTS',
      });
    }

    // Validate each transformation
    for (const transformationId of plan.transformations) {
      const transformation = this.transformations.get(transformationId)!;

      if (transformation.validate) {
        for (const filePath of filePaths.slice(0, 5)) {
          // Sample validation
          try {
            const context = await this.createTransformationContext(filePath);
            const result = await transformation.validate(context);

            issues.push(...result.issues);
            warnings.push(...result.warnings);
            suggestions.push(...result.suggestions);
          } catch (error) {
            issues.push({
              severity: 'error',
              message: `Validation failed for ${transformation.name}: ${error instanceof Error ? error.message : String(error)}`,
              code: 'VALIDATION_ERROR',
            });
          }
        }
      }
    }

    // Check estimated impact
    if (plan.estimatedImpact.riskScore > 80) {
      warnings.push({
        message: `High risk score (${plan.estimatedImpact.riskScore}/100) - consider reducing scope`,
        suggestion: 'Split into smaller transformation plans or add more safety checks',
      });
    }

    return {
      valid: issues.filter(i => i.severity === 'error').length === 0,
      issues,
      warnings,
      suggestions,
    };
  }

  /**
   * Execute single transformation
   */
  private async executeTransformation(
    transformation: Transformation,
    filePath: string,
    dryRun: boolean
  ): Promise<TransformationResult> {
    const startTime = Date.now();
    const startMemory = process.memoryUsage().heapUsed;

    try {
      const context = await this.createTransformationContext(filePath);
      const result = await transformation.apply(context);

      // Validate syntax if transformation was successful
      if (result.success && result.transformedContent) {
        result.syntaxValid = await this.validateSyntax(result.transformedContent, context.language);
      }

      // Apply changes if not dry run and syntax is valid
      if (!dryRun && result.success && result.syntaxValid && result.transformedContent) {
        fs.writeFileSync(filePath, result.transformedContent);
      }

      // Calculate metrics
      const endTime = Date.now();
      const endMemory = process.memoryUsage().heapUsed;

      result.metrics = {
        linesChanged: result.changes.length,
        complexity: {
          before: await this.calculateComplexity(context.metadata.originalContent),
          after: result.transformedContent
            ? await this.calculateComplexity(result.transformedContent)
            : 0,
        },
        performance: {
          executionTime: endTime - startTime,
          memoryUsage: endMemory - startMemory,
        },
      };

      return result;
    } catch (error) {
      return {
        success: false,
        transformationId: transformation.id,
        changes: [],
        syntaxValid: false,
        semanticValid: false,
        diagnostics: [error instanceof Error ? error.message : String(error)],
        metrics: {
          linesChanged: 0,
          complexity: { before: 0, after: 0 },
          performance: {
            executionTime: Date.now() - startTime,
            memoryUsage: process.memoryUsage().heapUsed - startMemory,
          },
        },
      };
    }
  }

  /**
   * Create transformation context
   */
  private async createTransformationContext(filePath: string): Promise<TransformationContext> {
    const originalContent = fs.readFileSync(filePath, 'utf8');
    const fileStats = fs.statSync(filePath);
    const fileExtension = path.extname(filePath);
    const language = ['.ts', '.tsx'].includes(fileExtension) ? 'typescript' : 'javascript';

    const sourceFile = this.project.createSourceFile(filePath, originalContent, {
      overwrite: true,
    });

    return {
      sourceFile,
      project: this.project,
      filePath,
      language,
      options: {},
      metadata: {
        originalContent,
        fileStats,
        dependencies: [], // Would be populated by dependency analysis
      },
    };
  }

  /**
   * Detect conflicts between transformations
   */
  private detectConflicts(transformationIds: string[]): ConflictResolution[] {
    const conflicts: ConflictResolution[] = [];

    for (let i = 0; i < transformationIds.length; i++) {
      for (let j = i + 1; j < transformationIds.length; j++) {
        const transformationA = this.transformations.get(transformationIds[i])!;
        const transformationB = this.transformations.get(transformationIds[j])!;

        if (
          transformationA.conflicts.includes(transformationB.id) ||
          transformationB.conflicts.includes(transformationA.id)
        ) {
          conflicts.push({
            transformationA: transformationA.id,
            transformationB: transformationB.id,
            resolution: 'manual',
            reason: 'Transformations have conflicting effects',
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * Resolve conflicts automatically where possible
   */
  private resolveConflicts(conflicts: ConflictResolution[]): ConflictResolution[] {
    return conflicts.map(conflict => {
      const transformationA = this.transformations.get(conflict.transformationA)!;
      const transformationB = this.transformations.get(conflict.transformationB)!;

      // Simple resolution strategies
      if (transformationA.riskLevel === 'low' && transformationB.riskLevel === 'high') {
        return {
          ...conflict,
          resolution: 'prioritize',
          reason: 'Prioritizing low-risk transformation',
        };
      }

      if (transformationA.category === 'cleanup' && transformationB.category === 'refactor') {
        return {
          ...conflict,
          resolution: 'prioritize',
          reason: 'Prioritizing refactor over cleanup',
        };
      }

      return conflict; // Keep as manual
    });
  }

  /**
   * Resolve execution order based on dependencies
   */
  private resolveExecutionOrder(transformationIds: string[]): string[] {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const result: string[] = [];

    const visit = (id: string) => {
      if (visiting.has(id)) {
        throw new Error(`Circular dependency detected involving transformation: ${id}`);
      }
      if (visited.has(id)) {
        return;
      }

      visiting.add(id);
      const transformation = this.transformations.get(id)!;

      for (const depId of transformation.dependencies) {
        if (transformationIds.includes(depId)) {
          visit(depId);
        }
      }

      visiting.delete(id);
      visited.add(id);
      result.push(id);
    };

    for (const id of transformationIds) {
      visit(id);
    }

    return result;
  }

  /**
   * Optimize execution order for performance
   */
  private optimizeExecutionOrder(transformationIds: string[]): string[] {
    // Start with dependency-resolved order
    const baseOrder = this.resolveExecutionOrder(transformationIds);

    // Sort by risk level (low risk first) and category
    return baseOrder.sort((a, b) => {
      const transformationA = this.transformations.get(a)!;
      const transformationB = this.transformations.get(b)!;

      // Risk level priority
      const riskOrder = { low: 0, medium: 1, high: 2 };
      const riskDiff = riskOrder[transformationA.riskLevel] - riskOrder[transformationB.riskLevel];
      if (riskDiff !== 0) return riskDiff;

      // Category priority
      const categoryOrder = { cleanup: 0, optimize: 1, modernize: 2, refactor: 3 };
      return categoryOrder[transformationA.category] - categoryOrder[transformationB.category];
    });
  }

  /**
   * Estimate transformation impact
   */
  private async estimateImpact(transformationIds: string[]): Promise<{
    filesAffected: number;
    linesChanged: number;
    riskScore: number;
  }> {
    // Simplified estimation - in practice would analyze actual files
    const transformations = transformationIds.map(id => this.transformations.get(id)!);

    const riskScores = { low: 10, medium: 30, high: 60 };
    const avgRiskScore =
      transformations.reduce((sum, t) => sum + riskScores[t.riskLevel], 0) / transformations.length;

    return {
      filesAffected: Math.min(100, transformations.length * 5), // Estimate
      linesChanged: Math.min(1000, transformations.length * 20), // Estimate
      riskScore: Math.min(100, avgRiskScore * transformations.length * 0.5),
    };
  }

  /**
   * Validate syntax of transformed code
   */
  private async validateSyntax(
    content: string,
    language: 'typescript' | 'javascript'
  ): Promise<boolean> {
    try {
      if (language === 'typescript') {
        // Use ts-morph to validate TypeScript syntax
        const tempFile = this.project.createSourceFile('temp.ts', content, { overwrite: true });
        const diagnostics = tempFile.getPreEmitDiagnostics();
        return diagnostics.length === 0;
      } else {
        // Use Babel to validate JavaScript syntax
        await babel.parseAsync(content, {
          sourceType: 'module',
          plugins: ['jsx', 'typescript'],
        });
        return true;
      }
    } catch (error) {
      return false;
    }
  }

  /**
   * Calculate code complexity (simplified)
   */
  private async calculateComplexity(content: string): Promise<number> {
    // Simplified complexity calculation
    const lines = content.split('\n').filter(line => line.trim()).length;
    const functions = (content.match(/function\s+\w+/g) || []).length;
    const conditionals = (content.match(/if\s*\(|while\s*\(|for\s*\(/g) || []).length;

    return lines + functions * 2 + conditionals * 3;
  }

  /**
   * Initialize built-in transformations
   */
  private async initializeBuiltInTransformations(): Promise<void> {
    try {
      const { getBuiltInTransformations } = await import('./built-in-transformations.js');
      const builtInTransformations = getBuiltInTransformations();

      for (const transformation of builtInTransformations) {
        this.registerTransformation(transformation);
      }

      this.logger.debug('Initialized built-in transformations', {
        count: builtInTransformations.length,
      });
    } catch (error) {
      this.logger.warn('Failed to load built-in transformations', { error });
    }
  }
}
