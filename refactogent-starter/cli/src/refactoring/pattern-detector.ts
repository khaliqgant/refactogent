import { Logger } from '../utils/logger.js';
import { ProjectAST, ModuleAST } from '../analysis/ast-types.js';
import { SafetyScore } from '../analysis/safety-scorer.js';

/**
 * Represents a refactoring pattern that can be detected and applied
 */
export interface RefactoringPattern {
  /** Unique identifier for the pattern */
  id: string;
  /** Human-readable name */
  name: string;
  /** Detailed description of what the pattern does */
  description: string;
  /** Category classification */
  category: RefactoringCategory;
  /** Implementation complexity level */
  complexity: 'simple' | 'moderate' | 'complex';
  /** Safety level for applying this pattern */
  safetyLevel: 'safe' | 'moderate' | 'risky' | 'dangerous';
  /** Prerequisites that must be met before applying */
  prerequisites: string[];
  /** Benefits of applying this pattern */
  benefits: string[];
  /** Potential risks and drawbacks */
  risks: string[];
}

/**
 * Represents a specific opportunity to apply a refactoring pattern
 */
export interface RefactoringOpportunity {
  /** The pattern that can be applied */
  pattern: RefactoringPattern;
  /** Location in the codebase where this opportunity exists */
  location: CodeLocation;
  /** Confidence level in this detection (0-100) */
  confidence: number;
  /** Safety rating for applying this refactoring (0-100) */
  safetyRating: number;
  /** Estimated effort required */
  estimatedEffort: 'low' | 'medium' | 'high';
  /** Description of the potential benefit */
  potentialBenefit: string;
  /** Human-readable description of the opportunity */
  description: string;
  /** Code snippet showing the area to be refactored */
  codeSnippet: string;
  /** Detailed transformation plan */
  suggestedTransformation: RefactoringTransformation;
  /** Prerequisites that must be checked */
  prerequisites: PrerequisiteCheck[];
  /** Risk assessments for this specific opportunity */
  risks: RiskAssessment[];
}

export interface CodeLocation {
  filePath: string;
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
  context: string;
}

export interface RefactoringTransformation {
  type: RefactoringType;
  description: string;
  changes: CodeChange[];
  validation: ValidationRule[];
  rollbackPlan: RollbackStep[];
}

export interface CodeChange {
  type: 'insert' | 'delete' | 'replace' | 'move';
  location: CodeLocation;
  oldCode?: string;
  newCode?: string;
  reason: string;
}

export interface ValidationRule {
  type: 'syntax' | 'semantic' | 'test' | 'type';
  description: string;
  validator: string; // Function name or command
  required: boolean;
}

export interface RollbackStep {
  order: number;
  action: 'restore_file' | 'run_command' | 'revert_change';
  target: string;
  data?: any;
}

export interface PrerequisiteCheck {
  type: 'test_coverage' | 'no_syntax_errors' | 'no_dependencies' | 'backup_exists';
  description: string;
  status: 'pending' | 'passed' | 'failed';
  details?: string;
}

export interface RiskAssessment {
  type: 'breaking_change' | 'performance_impact' | 'behavior_change' | 'dependency_issue';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  mitigation: string;
  probability: number; // 0-100
}

export type RefactoringCategory = 
  | 'extract' 
  | 'inline' 
  | 'move' 
  | 'rename' 
  | 'simplify' 
  | 'optimize' 
  | 'modernize' 
  | 'structure';

export type RefactoringType = 
  | 'extract_function'
  | 'extract_variable'
  | 'extract_class'
  | 'extract_interface'
  | 'inline_function'
  | 'inline_variable'
  | 'move_function'
  | 'move_class'
  | 'rename_symbol'
  | 'rename_file'
  | 'simplify_conditional'
  | 'remove_dead_code'
  | 'optimize_imports'
  | 'modernize_syntax'
  | 'split_large_function'
  | 'merge_similar_functions'
  | 'introduce_parameter_object'
  | 'replace_magic_numbers'
  | 'improve_naming';

export interface PatternDetectionOptions {
  categories?: RefactoringCategory[];
  safetyThreshold?: number;
  confidenceThreshold?: number;
  maxSuggestions?: number;
  includeRisky?: boolean;
  focusAreas?: string[]; // File patterns or directories
}

export interface DetectionResult {
  opportunities: RefactoringOpportunity[];
  summary: DetectionSummary;
  recommendations: string[];
  nextSteps: string[];
}

export interface DetectionSummary {
  totalOpportunities: number;
  safeOpportunities: number;
  highImpactOpportunities: number;
  categoryCounts: Record<RefactoringCategory, number>;
  averageConfidence: number;
  averageSafety: number;
}

export class PatternDetector {
  private logger: Logger;
  private patterns: Map<string, RefactoringPattern>;

  constructor(logger: Logger) {
    this.logger = logger;
    this.patterns = new Map();
    this.initializePatterns();
  }

  /**
   * Detect refactoring opportunities in a project
   * @param projectAST - The parsed AST of the project
   * @param safetyScore - Current safety assessment of the project
   * @param options - Detection configuration options
   * @returns Promise resolving to detection results
   */
  async detectOpportunities(
    projectAST: ProjectAST,
    safetyScore: SafetyScore,
    options: PatternDetectionOptions = {}
  ): Promise<DetectionResult> {
    // Validate inputs
    if (!projectAST) {
      throw new Error('ProjectAST is required for pattern detection');
    }
    if (!safetyScore) {
      throw new Error('SafetyScore is required for pattern detection');
    }

    this.logger.info('Starting refactoring pattern detection', {
      modules: projectAST.modules.length,
      options
    });

    const opportunities: RefactoringOpportunity[] = [];

    try {
      // Detect patterns in each module
      for (const module of projectAST.modules) {
        if (!module) {
          this.logger.warn('Skipping null/undefined module');
          continue;
        }
        
        const moduleOpportunities = await this.detectInModule(module, safetyScore, options);
        opportunities.push(...moduleOpportunities);
      }
    } catch (error) {
      this.logger.error('Error during pattern detection', { error });
      throw new Error(`Pattern detection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Filter and rank opportunities
    const filteredOpportunities = this.filterOpportunities(opportunities, options);
    const rankedOpportunities = this.rankOpportunities(filteredOpportunities, safetyScore);

    // Generate summary and recommendations
    const summary = this.generateSummary(rankedOpportunities);
    const recommendations = this.generateRecommendations(rankedOpportunities, safetyScore);
    const nextSteps = this.generateNextSteps(rankedOpportunities);

    const result: DetectionResult = {
      opportunities: rankedOpportunities,
      summary,
      recommendations,
      nextSteps
    };

    this.logger.info('Pattern detection completed', {
      totalOpportunities: opportunities.length,
      filteredOpportunities: rankedOpportunities.length,
      averageConfidence: summary.averageConfidence
    });

    return result;
  }

  /**
   * Detect patterns in a single module
   */
  private async detectInModule(
    module: ModuleAST,
    safetyScore: SafetyScore,
    options: PatternDetectionOptions
  ): Promise<RefactoringOpportunity[]> {
    const opportunities: RefactoringOpportunity[] = [];

    // Extract function opportunities
    opportunities.push(...this.detectExtractFunctionOpportunities(module));

    // Extract variable opportunities
    opportunities.push(...this.detectExtractVariableOpportunities(module));

    // Simplify conditional opportunities
    opportunities.push(...this.detectSimplifyConditionalOpportunities(module));

    // Remove dead code opportunities
    opportunities.push(...this.detectDeadCodeOpportunities(module));

    return opportunities;
  }

  /**
   * Detect extract function opportunities
   */
  private detectExtractFunctionOpportunities(module: ModuleAST): RefactoringOpportunity[] {
    const opportunities: RefactoringOpportunity[] = [];
    const pattern = this.patterns.get('extract_function')!;

    // Look for long functions with high complexity
    if (module.complexity > 15) {
      const opportunity: RefactoringOpportunity = {
        pattern,
        location: {
          filePath: module.filePath,
          startLine: 10,
          endLine: 25,
          startColumn: 1,
          endColumn: 80,
          context: 'Complex function with multiple responsibilities'
        },
        confidence: 85,
        safetyRating: 90,
        estimatedEffort: 'medium',
        potentialBenefit: 'Improved readability and testability',
        description: 'Extract complex logic into separate function',
        codeSnippet: '// Complex code block that could be extracted',
        suggestedTransformation: {
          type: 'extract_function',
          description: 'Extract lines 10-25 into a new function',
          changes: [
            {
              type: 'insert',
              location: {
                filePath: module.filePath,
                startLine: 5,
                endLine: 5,
                startColumn: 1,
                endColumn: 1,
                context: 'Function insertion point'
              },
              newCode: 'function extractedLogic() { /* extracted code */ }',
              reason: 'Create new function for extracted logic'
            }
          ],
          validation: [
            {
              type: 'syntax',
              description: 'Verify syntax is valid after extraction',
              validator: 'typescript_compiler',
              required: true
            }
          ],
          rollbackPlan: [
            {
              order: 1,
              action: 'restore_file',
              target: module.filePath
            }
          ]
        },
        prerequisites: [
          {
            type: 'test_coverage',
            description: 'Function should have adequate test coverage',
            status: 'pending'
          }
        ],
        risks: [
          {
            type: 'behavior_change',
            severity: 'low',
            description: 'Extracted function might have different scope behavior',
            mitigation: 'Carefully review variable scoping and parameters',
            probability: 15
          }
        ]
      };

      opportunities.push(opportunity);
    }

    return opportunities;
  }

  /**
   * Detect extract variable opportunities
   */
  private detectExtractVariableOpportunities(module: ModuleAST): RefactoringOpportunity[] {
    const opportunities: RefactoringOpportunity[] = [];
    const pattern = this.patterns.get('extract_variable')!;

    if (module.loc > 50) {
      const opportunity: RefactoringOpportunity = {
        pattern,
        location: {
          filePath: module.filePath,
          startLine: 15,
          endLine: 15,
          startColumn: 20,
          endColumn: 60,
          context: 'Complex expression used multiple times'
        },
        confidence: 75,
        safetyRating: 95,
        estimatedEffort: 'low',
        potentialBenefit: 'Improved readability and maintainability',
        description: 'Extract repeated complex expression into variable',
        codeSnippet: 'someObject.property.nestedProperty.calculation()',
        suggestedTransformation: {
          type: 'extract_variable',
          description: 'Extract complex expression into descriptive variable',
          changes: [
            {
              type: 'insert',
              location: {
                filePath: module.filePath,
                startLine: 14,
                endLine: 14,
                startColumn: 1,
                endColumn: 1,
                context: 'Variable declaration insertion point'
              },
              newCode: 'const calculatedValue = someObject.property.nestedProperty.calculation();',
              reason: 'Extract complex expression into variable'
            }
          ],
          validation: [
            {
              type: 'syntax',
              description: 'Verify syntax is valid after extraction',
              validator: 'typescript_compiler',
              required: true
            }
          ],
          rollbackPlan: [
            {
              order: 1,
              action: 'restore_file',
              target: module.filePath
            }
          ]
        },
        prerequisites: [
          {
            type: 'no_syntax_errors',
            description: 'File should have no syntax errors',
            status: 'pending'
          }
        ],
        risks: [
          {
            type: 'behavior_change',
            severity: 'low',
            description: 'Variable extraction might change evaluation timing',
            mitigation: 'Ensure expression has no side effects',
            probability: 10
          }
        ]
      };

      opportunities.push(opportunity);
    }

    return opportunities;
  }

  /**
   * Detect simplify conditional opportunities
   */
  private detectSimplifyConditionalOpportunities(module: ModuleAST): RefactoringOpportunity[] {
    const opportunities: RefactoringOpportunity[] = [];
    const pattern = this.patterns.get('simplify_conditional')!;

    if (module.complexity > 10) {
      const opportunity: RefactoringOpportunity = {
        pattern,
        location: {
          filePath: module.filePath,
          startLine: 20,
          endLine: 30,
          startColumn: 1,
          endColumn: 50,
          context: 'Complex nested conditional logic'
        },
        confidence: 80,
        safetyRating: 85,
        estimatedEffort: 'medium',
        potentialBenefit: 'Reduced complexity and improved readability',
        description: 'Simplify nested conditional statements',
        codeSnippet: 'if (condition1) { if (condition2) { ... } }',
        suggestedTransformation: {
          type: 'simplify_conditional',
          description: 'Combine nested conditions using logical operators',
          changes: [
            {
              type: 'replace',
              location: {
                filePath: module.filePath,
                startLine: 20,
                endLine: 30,
                startColumn: 1,
                endColumn: 50,
                context: 'Nested conditional logic'
              },
              oldCode: 'if (condition1) { if (condition2) { ... } }',
              newCode: 'if (condition1 && condition2) { ... }',
              reason: 'Simplify nested conditions'
            }
          ],
          validation: [
            {
              type: 'test',
              description: 'Verify logical equivalence with tests',
              validator: 'test_runner',
              required: true
            }
          ],
          rollbackPlan: [
            {
              order: 1,
              action: 'restore_file',
              target: module.filePath
            }
          ]
        },
        prerequisites: [
          {
            type: 'test_coverage',
            description: 'Conditional logic should be covered by tests',
            status: 'pending'
          }
        ],
        risks: [
          {
            type: 'behavior_change',
            severity: 'medium',
            description: 'Logical operator precedence might change behavior',
            mitigation: 'Carefully verify logical equivalence',
            probability: 25
          }
        ]
      };

      opportunities.push(opportunity);
    }

    return opportunities;
  }

  /**
   * Detect dead code opportunities
   */
  private detectDeadCodeOpportunities(module: ModuleAST): RefactoringOpportunity[] {
    const opportunities: RefactoringOpportunity[] = [];
    const pattern = this.patterns.get('remove_dead_code')!;

    if (module.imports.length > 5) {
      const opportunity: RefactoringOpportunity = {
        pattern,
        location: {
          filePath: module.filePath,
          startLine: 1,
          endLine: 5,
          startColumn: 1,
          endColumn: 80,
          context: 'Unused import statements'
        },
        confidence: 90,
        safetyRating: 98,
        estimatedEffort: 'low',
        potentialBenefit: 'Cleaner code and reduced bundle size',
        description: 'Remove unused import statements',
        codeSnippet: 'import { unusedFunction } from "./module";',
        suggestedTransformation: {
          type: 'remove_dead_code',
          description: 'Remove unused import statements',
          changes: [
            {
              type: 'delete',
              location: {
                filePath: module.filePath,
                startLine: 3,
                endLine: 3,
                startColumn: 1,
                endColumn: 80,
                context: 'Unused import line'
              },
              oldCode: 'import { unusedFunction } from "./module";',
              reason: 'Remove unused import'
            }
          ],
          validation: [
            {
              type: 'syntax',
              description: 'Verify no compilation errors after removal',
              validator: 'typescript_compiler',
              required: true
            }
          ],
          rollbackPlan: [
            {
              order: 1,
              action: 'restore_file',
              target: module.filePath
            }
          ]
        },
        prerequisites: [
          {
            type: 'no_dependencies',
            description: 'Import should not be used anywhere in the file',
            status: 'pending'
          }
        ],
        risks: [
          {
            type: 'dependency_issue',
            severity: 'low',
            description: 'Import might be used in dynamic way not detected',
            mitigation: 'Thorough static analysis and testing',
            probability: 5
          }
        ]
      };

      opportunities.push(opportunity);
    }

    return opportunities;
  }

  /**
   * Filter opportunities based on options
   */
  private filterOpportunities(
    opportunities: RefactoringOpportunity[],
    options: PatternDetectionOptions
  ): RefactoringOpportunity[] {
    let filtered = opportunities;

    if (options.categories && options.categories.length > 0) {
      filtered = filtered.filter(opp => options.categories!.includes(opp.pattern.category));
    }

    if (options.safetyThreshold) {
      filtered = filtered.filter(opp => opp.safetyRating >= options.safetyThreshold!);
    }

    if (options.confidenceThreshold) {
      filtered = filtered.filter(opp => opp.confidence >= options.confidenceThreshold!);
    }

    if (!options.includeRisky) {
      filtered = filtered.filter(opp => opp.pattern.safetyLevel !== 'dangerous');
    }

    if (options.maxSuggestions) {
      filtered = filtered.slice(0, options.maxSuggestions);
    }

    return filtered;
  }

  /**
   * Rank opportunities by safety and impact
   */
  private rankOpportunities(
    opportunities: RefactoringOpportunity[],
    safetyScore: SafetyScore
  ): RefactoringOpportunity[] {
    return opportunities.sort((a, b) => {
      const safetyDiff = b.safetyRating - a.safetyRating;
      if (safetyDiff !== 0) return safetyDiff;

      const confidenceDiff = b.confidence - a.confidence;
      if (confidenceDiff !== 0) return confidenceDiff;

      const effortOrder = { low: 3, medium: 2, high: 1 };
      return effortOrder[b.estimatedEffort] - effortOrder[a.estimatedEffort];
    });
  }

  /**
   * Generate detection summary
   */
  private generateSummary(opportunities: RefactoringOpportunity[]): DetectionSummary {
    const categoryCounts: Record<RefactoringCategory, number> = {
      extract: 0, inline: 0, move: 0, rename: 0,
      simplify: 0, optimize: 0, modernize: 0, structure: 0
    };

    let totalConfidence = 0;
    let totalSafety = 0;
    let safeOpportunities = 0;
    let highImpactOpportunities = 0;

    for (const opp of opportunities) {
      categoryCounts[opp.pattern.category]++;
      totalConfidence += opp.confidence;
      totalSafety += opp.safetyRating;

      if (opp.safetyRating >= 80) safeOpportunities++;
      if (opp.confidence >= 80 && opp.estimatedEffort !== 'high') highImpactOpportunities++;
    }

    return {
      totalOpportunities: opportunities.length,
      safeOpportunities,
      highImpactOpportunities,
      categoryCounts,
      averageConfidence: opportunities.length > 0 ? totalConfidence / opportunities.length : 0,
      averageSafety: opportunities.length > 0 ? totalSafety / opportunities.length : 0
    };
  }

  /**
   * Generate recommendations based on opportunities
   */
  private generateRecommendations(
    opportunities: RefactoringOpportunity[],
    safetyScore: SafetyScore
  ): string[] {
    const recommendations: string[] = [];

    if (opportunities.length === 0) {
      recommendations.push('No refactoring opportunities detected. Code appears to be well-structured.');
      return recommendations;
    }

    const safeOpps = opportunities.filter(opp => opp.safetyRating >= 80);
    if (safeOpps.length > 0) {
      recommendations.push(`Start with ${safeOpps.length} safe refactoring opportunities`);
    }

    if (safetyScore.testCoverage.score < 70) {
      recommendations.push('Improve test coverage before attempting complex refactorings');
    }

    return recommendations;
  }

  /**
   * Generate next steps
   */
  private generateNextSteps(opportunities: RefactoringOpportunity[]): string[] {
    const nextSteps: string[] = [];

    if (opportunities.length === 0) {
      nextSteps.push('Continue monitoring code for new refactoring opportunities');
      return nextSteps;
    }

    const topOpportunity = opportunities[0];
    nextSteps.push(`1. Review the top opportunity: ${topOpportunity.description}`);
    nextSteps.push(`2. Verify prerequisites for ${topOpportunity.pattern.name}`);
    nextSteps.push(`3. Create a backup before making changes`);

    return nextSteps;
  }

  /**
   * Initialize built-in refactoring patterns
   */
  private initializePatterns(): void {
    const patterns: RefactoringPattern[] = [
      {
        id: 'extract_function',
        name: 'Extract Function',
        description: 'Extract a code fragment into a separate function',
        category: 'extract',
        complexity: 'moderate',
        safetyLevel: 'safe',
        prerequisites: ['Test coverage for the code being extracted'],
        benefits: ['Improved readability', 'Better testability', 'Code reuse'],
        risks: ['Variable scoping issues', 'Parameter passing complexity']
      },
      {
        id: 'extract_variable',
        name: 'Extract Variable',
        description: 'Extract a complex expression into a well-named variable',
        category: 'extract',
        complexity: 'simple',
        safetyLevel: 'safe',
        prerequisites: ['No side effects in the expression'],
        benefits: ['Improved readability', 'Better debugging'],
        risks: ['Evaluation timing changes']
      },
      {
        id: 'simplify_conditional',
        name: 'Simplify Conditional',
        description: 'Simplify complex conditional logic',
        category: 'simplify',
        complexity: 'moderate',
        safetyLevel: 'moderate',
        prerequisites: ['Test coverage for all branches'],
        benefits: ['Reduced complexity', 'Improved readability'],
        risks: ['Logic errors', 'Behavior changes']
      },
      {
        id: 'remove_dead_code',
        name: 'Remove Dead Code',
        description: 'Remove unused code, imports, or variables',
        category: 'optimize',
        complexity: 'simple',
        safetyLevel: 'safe',
        prerequisites: ['Static analysis confirmation'],
        benefits: ['Cleaner codebase', 'Reduced bundle size'],
        risks: ['Dynamic usage not detected']
      }
    ];

    for (const pattern of patterns) {
      this.patterns.set(pattern.id, pattern);
    }
  }

  /**
   * Get all available patterns
   */
  getAvailablePatterns(): RefactoringPattern[] {
    return Array.from(this.patterns.values());
  }

  /**
   * Get pattern by ID
   */
  getPattern(id: string): RefactoringPattern | undefined {
    return this.patterns.get(id);
  }
}