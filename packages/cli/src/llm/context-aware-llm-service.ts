import { Logger } from '../utils/logger.js';
import { CodebaseContext, RefactoringOpportunity } from '../analysis/codebase-context-analyzer.js';

export interface LLMRefactoringRequest {
  codeBlock: string;
  filePath: string;
  projectContext: CodebaseContext;
  operation: 'extract' | 'inline' | 'rename' | 'move';
  options: {
    suggestedName?: string;
    targetLocation?: string;
    preserveBehavior?: boolean;
  };
}

export interface LLMRefactoringResponse {
  functionName: string;
  extractedFunction: string;
  functionCall: string;
  explanation: string;
  confidence: number;
  tokenUsage: {
    input: number;
    output: number;
    total: number;
  };
  reasoning: string;
}

export interface LLMUsage {
  totalTokens: number;
  calls: number;
  operations: Array<{
    operation: string;
    tokens: number;
    model: string;
    cost: number;
  }>;
}

export class ContextAwareLLMService {
  private logger: Logger;
  private usage: LLMUsage;

  constructor(logger: Logger) {
    this.logger = logger;
    this.usage = {
      totalTokens: 0,
      calls: 0,
      operations: [],
    };
  }

  /**
   * Perform context-aware refactoring using full codebase analysis
   */
  async performRefactoring(request: LLMRefactoringRequest): Promise<LLMRefactoringResponse> {
    this.logger.info('Starting context-aware LLM refactoring', {
      filePath: request.filePath,
      operation: request.operation,
    });

    try {
      // Build comprehensive context for LLM
      const contextPrompt = this.buildContextPrompt(request);

      // Generate LLM prompt with full codebase context
      const llmPrompt = this.generateLLMPrompt(request, contextPrompt);

      // Simulate LLM call (replace with actual LLM integration)
      const response = await this.callLLM(llmPrompt, request);

      // Track usage
      this.trackUsage(response.tokenUsage, request.operation);

      return response;
    } catch (error) {
      this.logger.error('LLM refactoring failed', { error });
      throw error;
    }
  }

  /**
   * Build comprehensive context prompt from codebase analysis
   */
  private buildContextPrompt(request: LLMRefactoringRequest): string {
    const { projectContext } = request;

    return `
# Codebase Context Analysis

## Project Overview
${projectContext.llmContext.projectSummary}

## Architectural Patterns
${projectContext.llmContext.architecturalOverview}

## Naming Conventions
${projectContext.llmContext.namingPatterns}

## Refactoring Strategy
${projectContext.llmContext.refactoringStrategy}

## Safety Constraints
${projectContext.llmContext.safetyConstraints.join('\n')}

## Cross-File Dependencies
${projectContext.crossFileDependencies
  .map(dep => `${dep.from} -> ${dep.to} (${dep.type}, strength: ${dep.strength})`)
  .join('\n')}

## Related Files
${projectContext.projectStructure.modules
  .filter(m => m.language === 'typescript' || m.language === 'javascript')
  .slice(0, 10) // Limit to first 10 files for context
  .map(m => `${m.filePath} (${m.language}, complexity: ${m.complexity})`)
  .join('\n')}
`;
  }

  /**
   * Generate comprehensive LLM prompt with full context
   */
  private generateLLMPrompt(request: LLMRefactoringRequest, contextPrompt: string): string {
    const { codeBlock, filePath, operation, options } = request;

    return `
You are an expert software architect and refactoring specialist. You have access to the complete codebase context and must perform intelligent refactoring that respects the project's architecture, naming conventions, and dependencies.

## Current Task
**Operation**: ${operation.toUpperCase()}
**File**: ${filePath}
**Code Block to Refactor**:
\`\`\`typescript
${codeBlock}
\`\`\`

## Full Codebase Context
${contextPrompt}

## Requirements
1. **Architectural Consistency**: Follow the project's architectural patterns
2. **Naming Conventions**: Use the established naming conventions
3. **Dependency Awareness**: Consider cross-file dependencies
4. **Safety First**: Preserve behavior and maintain test compatibility
5. **Performance**: Optimize for maintainability and readability

## Your Response
Provide a JSON response with:
- \`functionName\`: Descriptive name following project conventions
- \`extractedFunction\`: Complete function implementation
- \`functionCall\`: How to call the function
- \`explanation\`: Why this refactoring improves the code
- \`confidence\`: Your confidence level (0-1)
- \`reasoning\`: Your analysis of the codebase context

## Example Response Format
\`\`\`json
{
  "functionName": "analyzeProjectStructure",
  "extractedFunction": "async function analyzeProjectStructure(projectPath: string, projectType: ProjectType): Promise<ProjectStructure> { ... }",
  "functionCall": "const structure = await analyzeProjectStructure(projectPath, projectType);",
  "explanation": "This function encapsulates project structure analysis, following the project's async/await patterns and naming conventions.",
  "confidence": 0.95,
  "reasoning": "Based on the codebase context, this function follows the established patterns for async analysis functions and uses descriptive naming consistent with other analysis functions in the project."
}
\`\`\`
`;
  }

  /**
   * Simulate LLM call (replace with actual LLM integration)
   */
  private async callLLM(
    prompt: string,
    request: LLMRefactoringRequest
  ): Promise<LLMRefactoringResponse> {
    // This is a mock implementation - replace with actual LLM call
    const code = request.codeBlock.toLowerCase();
    const filePath = request.filePath.toLowerCase();

    // Simulate intelligent analysis based on context
    let functionName = 'processCodeBlock';
    let explanation = 'Generic function extraction';
    let confidence = 0.5;
    let reasoning = 'Basic analysis without full context';

    // Context-aware naming based on codebase patterns
    if (filePath.includes('ast-service') || filePath.includes('analysis')) {
      if (code.includes('analyze') && code.includes('project')) {
        functionName = 'performUnifiedProjectAnalysis';
        explanation = 'Encapsulates unified project analysis following the service pattern';
        confidence = 0.9;
        reasoning = 'Based on AST service context, this follows the established analysis pattern';
      } else if (code.includes('fetch') && code.includes('data')) {
        functionName = 'fetchProjectAnalysisData';
        explanation = 'Extracts project analysis data following the data fetching pattern';
        confidence = 0.85;
        reasoning = 'Consistent with other data fetching functions in the analysis service';
      } else if (code.includes('process') && code.includes('language')) {
        functionName = 'processLanguageAnalysis';
        explanation = 'Processes language-specific analysis following the modular pattern';
        confidence = 0.88;
        reasoning = 'Follows the established pattern for language-specific processing';
      }
    } else if (filePath.includes('transformer') || filePath.includes('refactor')) {
      if (code.includes('transform') && code.includes('code')) {
        functionName = 'transformCodeStructure';
        explanation = 'Transforms code structure following the transformer pattern';
        confidence = 0.87;
        reasoning = 'Consistent with transformer service architecture';
      }
    }

    // Generate function implementation
    const extractedFunction = this.generateFunctionImplementation(request, functionName);
    const functionCall = this.generateFunctionCall(request, functionName);

    return {
      functionName,
      extractedFunction,
      functionCall,
      explanation,
      confidence,
      tokenUsage: {
        input: 1500,
        output: 300,
        total: 1800,
      },
      reasoning,
    };
  }

  /**
   * Generate function implementation based on context
   */
  private generateFunctionImplementation(
    request: LLMRefactoringRequest,
    functionName: string
  ): string {
    const { codeBlock, filePath } = request;
    const isTypeScript = filePath.endsWith('.ts') || filePath.endsWith('.tsx');
    const hasAwait = codeBlock.includes('await');

    // Extract parameters and return type from code block
    const parameters = this.extractParameters(codeBlock);
    const returnType = this.inferReturnType(codeBlock, isTypeScript);

    const paramList = isTypeScript
      ? parameters.map(p => `${p.name}: ${p.type}`).join(', ')
      : parameters.map(p => p.name).join(', ');

    const asyncKeyword = hasAwait ? 'async ' : '';
    const returnTypeAnnotation = isTypeScript ? `: ${returnType}` : '';

    return `${asyncKeyword}function ${functionName}(${paramList})${returnTypeAnnotation} {
  ${codeBlock
    .split('\n')
    .map(line => `  ${line}`)
    .join('\n')}
}`;
  }

  /**
   * Generate function call based on context
   */
  private generateFunctionCall(request: LLMRefactoringRequest, functionName: string): string {
    const { codeBlock } = request;
    const hasAwait = codeBlock.includes('await');
    const parameters = this.extractParameters(codeBlock);

    const argList = parameters.map(p => p.name).join(', ');
    const call = hasAwait ? `await ${functionName}(${argList})` : `${functionName}(${argList})`;

    return `${call};`;
  }

  /**
   * Extract parameters from code block
   */
  private extractParameters(codeBlock: string): Array<{ name: string; type: string }> {
    // Simple parameter extraction - in production, use AST parsing
    const parameters: Array<{ name: string; type: string }> = [];

    // Look for common parameter patterns
    const paramRegex = /(\w+):\s*(\w+)/g;
    let match;
    while ((match = paramRegex.exec(codeBlock)) !== null) {
      parameters.push({
        name: match[1],
        type: match[2],
      });
    }

    return parameters;
  }

  /**
   * Infer return type from code block
   */
  private inferReturnType(codeBlock: string, isTypeScript: boolean): string {
    if (!isTypeScript) return '';

    if (codeBlock.includes('return')) {
      return 'any'; // In production, use AST analysis
    }

    return 'void';
  }

  /**
   * Track LLM usage
   */
  private trackUsage(
    tokenUsage: { input: number; output: number; total: number },
    operation: string
  ): void {
    this.usage.totalTokens += tokenUsage.total;
    this.usage.calls++;
    this.usage.operations.push({
      operation: `${operation} refactoring`,
      tokens: tokenUsage.total,
      model: 'gpt-4o-mini',
      cost: (tokenUsage.total * 0.00015) / 1000,
    });
  }

  /**
   * Get usage statistics
   */
  getUsage(): LLMUsage {
    return this.usage;
  }

  /**
   * Reset usage statistics
   */
  resetUsage(): void {
    this.usage = {
      totalTokens: 0,
      calls: 0,
      operations: [],
    };
  }
}
