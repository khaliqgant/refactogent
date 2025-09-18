import { BaseCommand } from './base.js';
import { CommandResult, RefactoringMode } from '../types/index.js';

interface PlanOptions {
  mode: RefactoringMode;
}

export class PlanCommand extends BaseCommand {
  async execute(options: PlanOptions): Promise<CommandResult> {
    this.validateContext();
    
    this.logger.info('Generating refactoring plan', { mode: options.mode });
    
    // Validate mode is allowed
    if (!this.context!.config.modesAllowed.includes(options.mode)) {
      return this.failure(`Refactoring mode '${options.mode}' is not allowed by project configuration`);
    }
    
    // Generate plan based on mode and project analysis
    const plan = this.generateRefactoringPlan(options.mode);
    const planPath = this.writeOutput('refactoring-plan.json', JSON.stringify(plan, null, 2));
    
    // Generate human-readable summary
    const summary = this.generatePlanSummary(plan);
    const summaryPath = this.writeOutput('plan-summary.md', summary);
    
    this.logger.success(`Generated ${options.mode} refactoring plan`);
    
    return this.success(
      `Refactoring plan generated for mode: ${options.mode}`,
      [planPath, summaryPath],
      { mode: options.mode, operationCount: plan.operations.length }
    );
  }

  private generateRefactoringPlan(mode: RefactoringMode) {
    const { projectInfo, config } = this.context!;
    
    const plan = {
      mode,
      projectType: projectInfo.type,
      timestamp: new Date().toISOString(),
      configuration: {
        maxPrLoc: config.maxPrLoc,
        branchPrefix: config.branchPrefix,
        protectedPaths: config.protectedPaths
      },
      operations: this.generateOperationsForMode(mode),
      safetyChecks: {
        characterizationTests: config.gates.requireCharacterizationTests,
        buildValidation: config.gates.requireGreenCi,
        coverageValidation: true,
        policyValidation: true
      },
      estimatedImpact: {
        filesAffected: 0, // Will be calculated during execution
        linesChanged: 0,  // Will be calculated during execution
        riskLevel: this.calculateRiskLevel(mode)
      }
    };
    
    return plan;
  }

  private generateOperationsForMode(mode: RefactoringMode) {
    const { projectInfo } = this.context!;
    
    switch (mode) {
      case 'organize-only':
        return [
          {
            type: 'file-organization',
            description: 'Reorganize files and directories for better structure',
            target: 'project-structure',
            safety: 'low-risk'
          },
          {
            type: 'import-cleanup',
            description: 'Clean up and organize import statements',
            target: 'import-statements',
            safety: 'low-risk'
          }
        ];
        
      case 'name-hygiene':
        return [
          {
            type: 'variable-naming',
            description: 'Improve variable and function naming consistency',
            target: 'identifiers',
            safety: 'medium-risk'
          },
          {
            type: 'constant-extraction',
            description: 'Extract magic numbers and strings to named constants',
            target: 'literals',
            safety: 'low-risk'
          }
        ];
        
      case 'tests-first':
        return [
          {
            type: 'test-generation',
            description: 'Generate missing unit tests',
            target: 'untested-functions',
            safety: 'no-risk'
          },
          {
            type: 'test-improvement',
            description: 'Improve existing test coverage and quality',
            target: 'existing-tests',
            safety: 'no-risk'
          }
        ];
        
      case 'micro-simplify':
        return [
          {
            type: 'conditional-simplification',
            description: 'Simplify complex conditional expressions',
            target: 'conditionals',
            safety: 'medium-risk'
          },
          {
            type: 'function-extraction',
            description: 'Extract small, reusable functions',
            target: 'code-blocks',
            safety: 'medium-risk'
          }
        ];
        
      default:
        return [];
    }
  }

  private calculateRiskLevel(mode: RefactoringMode): 'low' | 'medium' | 'high' {
    switch (mode) {
      case 'tests-first':
        return 'low';
      case 'organize-only':
        return 'low';
      case 'name-hygiene':
        return 'medium';
      case 'micro-simplify':
        return 'medium';
      default:
        return 'medium';
    }
  }

  private generatePlanSummary(plan: any): string {
    return `# Refactoring Plan Summary

## Overview
- **Mode**: ${plan.mode}
- **Project Type**: ${plan.projectType}
- **Risk Level**: ${plan.estimatedImpact.riskLevel}
- **Operations**: ${plan.operations.length}

## Planned Operations
${plan.operations.map((op: any, index: number) => 
  `${index + 1}. **${op.type}**: ${op.description} (${op.safety})`
).join('\n')}

## Safety Measures
- ✅ Characterization tests: ${plan.safetyChecks.characterizationTests ? 'Required' : 'Optional'}
- ✅ Build validation: ${plan.safetyChecks.buildValidation ? 'Required' : 'Optional'}
- ✅ Coverage validation: ${plan.safetyChecks.coverageValidation ? 'Required' : 'Optional'}
- ✅ Policy validation: ${plan.safetyChecks.policyValidation ? 'Required' : 'Optional'}

## Configuration
- **Max PR Size**: ${plan.configuration.maxPrLoc} lines
- **Branch Prefix**: ${plan.configuration.branchPrefix}
- **Protected Paths**: ${plan.configuration.protectedPaths.length} patterns

## Next Steps
1. Review this plan carefully
2. Run \`refactogent apply\` to execute the plan
3. Monitor safety checks during execution
4. Review generated changes before committing

Generated at: ${plan.timestamp}
`;
  }
}