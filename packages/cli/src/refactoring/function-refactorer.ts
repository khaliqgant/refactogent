import {
  Project,
  SourceFile,
  Node,
  SyntaxKind,
  FunctionDeclaration,
  Block,
  Statement,
} from 'ts-morph';
import fs from 'fs';
import path from 'path';
import { Logger } from '../utils/logger.js';
import { CodebaseContextAnalyzer, CodebaseContext } from '../analysis/codebase-context-analyzer.js';
import { ContextAwareLLMService, LLMRefactoringRequest } from '../llm/context-aware-llm-service.js';

export interface FunctionExtractionCandidate {
  id: string;
  filePath: string;
  startLine: number;
  endLine: number;
  codeBlock: string;
  complexity: number;
  variables: VariableAnalysis;
  suggestedName: string;
  extractionType: 'block' | 'expression' | 'statements';
  confidence: number; // 0-100
}

export interface VariableAnalysis {
  parameters: Variable[];
  returnValues: Variable[];
  localVariables: Variable[];
  capturedVariables: Variable[];
}

export interface Variable {
  name: string;
  type: string;
  usage: 'read' | 'write' | 'readwrite';
  scope: 'local' | 'parameter' | 'captured';
}

export interface FunctionInlineCandidate {
  id: string;
  functionName: string;
  filePath: string;
  declaration: {
    startLine: number;
    endLine: number;
    parameters: string[];
    returnType: string;
    body: string;
  };
  callSites: CallSite[];
  complexity: number;
  inlineability: number; // 0-100
  risks: InlineRisk[];
}

export interface CallSite {
  filePath: string;
  line: number;
  column: number;
  context: string;
  arguments: string[];
  canInline: boolean;
  inlineComplexity: number;
}

export interface InlineRisk {
  type: 'code-duplication' | 'performance' | 'maintainability' | 'scope-conflict';
  severity: 'low' | 'medium' | 'high';
  message: string;
  mitigation?: string;
}

export interface ExtractionOperation {
  candidate: FunctionExtractionCandidate;
  newFunctionName: string;
  insertionPoint: {
    filePath: string;
    line: number;
    column: number;
  };
  changes: ExtractionChange[];
}

export interface InlineOperation {
  candidate: FunctionInlineCandidate;
  callSitesToInline: CallSite[];
  changes: InlineChange[];
  removeFunctionDeclaration: boolean;
}

export interface ExtractionChange {
  type: 'replace-with-call' | 'insert-function' | 'add-import';
  filePath: string;
  position: {
    start: number;
    end: number;
    line: number;
    column: number;
  };
  originalText: string;
  newText: string;
  description: string;
}

export interface InlineChange {
  type: 'replace-call' | 'remove-function';
  filePath: string;
  position: {
    start: number;
    end: number;
    line: number;
    column: number;
  };
  originalText: string;
  newText: string;
  description: string;
}

export class FunctionRefactorer {
  private logger: Logger;
  private project: Project;
  private codebaseAnalyzer: CodebaseContextAnalyzer;
  private llmService: ContextAwareLLMService;
  private codebaseContext: CodebaseContext | null = null;

  constructor(logger: Logger) {
    this.logger = logger;
    this.project = new Project({
      useInMemoryFileSystem: false,
      compilerOptions: {
        target: 99, // Latest
        module: 99, // ESNext
        strict: false,
        allowJs: true,
        checkJs: false,
      },
    });
    this.codebaseAnalyzer = new CodebaseContextAnalyzer(logger);
    this.llmService = new ContextAwareLLMService(logger);
  }

  /**
   * Find function extraction candidates in a file
   */
  async findExtractionCandidates(
    filePath: string,
    options: {
      minComplexity?: number;
      minLines?: number;
      maxLines?: number;
    } = {}
  ): Promise<FunctionExtractionCandidate[]> {
    this.logger.info('Finding function extraction candidates', { filePath });

    const minComplexity = options.minComplexity || 5;
    const minLines = options.minLines || 3;
    const maxLines = options.maxLines || 20;

    try {
      const sourceFile = this.project.addSourceFileAtPath(filePath);
      const candidates: FunctionExtractionCandidate[] = [];
      let candidateId = 0;

      // Find complex code blocks within functions
      sourceFile.forEachDescendant(node => {
        if (
          Node.isFunctionDeclaration(node) ||
          Node.isMethodDeclaration(node) ||
          Node.isArrowFunction(node)
        ) {
          const body = this.getFunctionBody(node);
          if (body) {
            const blockCandidates = this.analyzeBlockForExtraction(
              body,
              sourceFile,
              filePath,
              candidateId,
              { minComplexity, minLines, maxLines }
            );
            candidates.push(...blockCandidates);
            candidateId += blockCandidates.length;
          }
        }
      });

      this.logger.info('Found extraction candidates', {
        filePath,
        candidates: candidates.length,
      });

      return candidates;
    } catch (error) {
      this.logger.error('Failed to find extraction candidates', {
        filePath,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Find function inline candidates in a file
   */
  async findInlineCandidates(
    filePath: string,
    options: {
      maxComplexity?: number;
      maxLines?: number;
      minCallSites?: number;
    } = {}
  ): Promise<FunctionInlineCandidate[]> {
    this.logger.info('Finding function inline candidates', { filePath });

    const maxComplexity = options.maxComplexity || 10;
    const maxLines = options.maxLines || 15;
    const minCallSites = options.minCallSites || 1;

    try {
      const sourceFile = this.project.addSourceFileAtPath(filePath);
      const candidates: FunctionInlineCandidate[] = [];

      // Find small functions that could be inlined
      sourceFile.forEachDescendant(node => {
        if (Node.isFunctionDeclaration(node)) {
          const functionName = node.getName();
          if (!functionName) return;

          const body = node.getBody();
          if (!body) return;

          const complexity = this.calculateComplexity(body);
          const lineCount = this.getLineCount(body);

          if (complexity <= maxComplexity && lineCount <= maxLines) {
            // Find call sites
            const callSites = this.findCallSites(sourceFile, functionName);

            if (callSites.length >= minCallSites) {
              const risks = this.analyzeInlineRisks(node, callSites);
              const inlineability = this.calculateInlineability(
                complexity,
                lineCount,
                callSites.length,
                risks
              );

              candidates.push({
                id: `inline-${functionName}-${Date.now()}`,
                functionName,
                filePath,
                declaration: {
                  startLine: sourceFile.getLineAndColumnAtPos(node.getStart()).line,
                  endLine: sourceFile.getLineAndColumnAtPos(node.getEnd()).line,
                  parameters: node.getParameters().map(p => p.getName()),
                  returnType: node.getReturnTypeNode()?.getText() || 'any',
                  body: body.getText(),
                },
                callSites,
                complexity,
                inlineability,
                risks,
              });
            }
          }
        }
      });

      this.logger.info('Found inline candidates', {
        filePath,
        candidates: candidates.length,
      });

      return candidates;
    } catch (error) {
      this.logger.error('Failed to find inline candidates', {
        filePath,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Extract function from code block
   */
  async extractFunction(
    candidate: FunctionExtractionCandidate,
    newFunctionName: string,
    options: {
      insertionPoint?: 'before' | 'after' | 'top' | 'bottom';
      makeAsync?: boolean;
      addDocumentation?: boolean;
      projectContext?: string;
      projectPath?: string;
    } = {}
  ): Promise<ExtractionOperation> {
    // Initialize codebase context if not already done
    if (!this.codebaseContext && options.projectPath) {
      this.codebaseContext = await this.codebaseAnalyzer.analyzeCodebaseContext(
        options.projectPath
      );
    }

    // Use context-aware LLM for intelligent refactoring
    const llmRequest: LLMRefactoringRequest = {
      codeBlock: candidate.codeBlock,
      filePath: candidate.filePath,
      projectContext:
        this.codebaseContext ||
        (await this.codebaseAnalyzer.analyzeCodebaseContext(options.projectPath || '.')),
      operation: 'extract',
      options: {
        suggestedName: newFunctionName,
        preserveBehavior: true,
      },
    };

    const llmResponse = await this.llmService.performRefactoring(llmRequest);
    const betterName = llmResponse.functionName;

    this.logger.info('Planning function extraction', {
      candidateId: candidate.id,
      newFunctionName: betterName,
    });

    const changes: ExtractionChange[] = [];
    const insertionPoint = this.determineInsertionPoint(candidate, options.insertionPoint);

    // Generate new function
    // Use LLM-generated function and call
    const newFunction = llmResponse.extractedFunction;
    const functionCall = llmResponse.functionCall;

    changes.push({
      type: 'replace-with-call',
      filePath: candidate.filePath,
      position: {
        start: candidate.startLine,
        end: candidate.endLine,
        line: candidate.startLine,
        column: 1,
      },
      originalText: candidate.codeBlock,
      newText: functionCall,
      description: `Replace code block with call to ${betterName}()`,
    });

    changes.push({
      type: 'insert-function',
      filePath: candidate.filePath,
      position: {
        start: 0,
        end: 0,
        line: insertionPoint.line,
        column: insertionPoint.column,
      },
      originalText: '',
      newText: newFunction,
      description: `Insert extracted function ${betterName}()`,
    });

    return {
      candidate,
      newFunctionName: betterName,
      insertionPoint,
      changes,
    };
  }

  /**
   * Inline function at call sites
   */
  async inlineFunction(
    candidate: FunctionInlineCandidate,
    options: {
      callSites?: CallSite[];
      removeFunctionDeclaration?: boolean;
      preserveComments?: boolean;
    } = {}
  ): Promise<InlineOperation> {
    this.logger.info('Planning function inline', {
      functionName: candidate.functionName,
      callSites: candidate.callSites.length,
    });

    const callSitesToInline = options.callSites || candidate.callSites.filter(cs => cs.canInline);
    const changes: InlineChange[] = [];

    // Replace each call site with inlined code
    for (const callSite of callSitesToInline) {
      const inlinedCode = this.generateInlinedCode(candidate, callSite);

      changes.push({
        type: 'replace-call',
        filePath: callSite.filePath,
        position: {
          start: 0, // Would calculate actual positions
          end: 0,
          line: callSite.line,
          column: callSite.column,
        },
        originalText: callSite.context,
        newText: inlinedCode,
        description: `Inline ${candidate.functionName}() at call site`,
      });
    }

    // Remove function declaration if requested and all call sites are inlined
    const removeFunctionDeclaration =
      options.removeFunctionDeclaration !== false &&
      callSitesToInline.length === candidate.callSites.length;

    if (removeFunctionDeclaration) {
      changes.push({
        type: 'remove-function',
        filePath: candidate.filePath,
        position: {
          start: 0,
          end: 0,
          line: candidate.declaration.startLine,
          column: 1,
        },
        originalText: `function ${candidate.functionName}...`, // Simplified
        newText: '',
        description: `Remove inlined function ${candidate.functionName}()`,
      });
    }

    return {
      candidate,
      callSitesToInline,
      changes,
      removeFunctionDeclaration,
    };
  }

  /**
   * Get function body from different node types
   */
  private getFunctionBody(node: Node): Block | undefined {
    if (Node.isFunctionDeclaration(node)) {
      return node.getBody() as Block | undefined;
    } else if (Node.isMethodDeclaration(node)) {
      return node.getBody() as Block | undefined;
    } else if (Node.isArrowFunction(node)) {
      const body = node.getBody();
      return Node.isBlock(body) ? body : undefined;
    }
    return undefined;
  }

  /**
   * Analyze code block for extraction opportunities
   */
  private analyzeBlockForExtraction(
    block: Block,
    sourceFile: SourceFile,
    filePath: string,
    startId: number,
    options: any
  ): FunctionExtractionCandidate[] {
    const candidates: FunctionExtractionCandidate[] = [];
    const statements = block.getStatements();

    // Look for consecutive statements that could be extracted
    for (let i = 0; i < statements.length; i++) {
      for (
        let j = i + options.minLines;
        j <= Math.min(i + options.maxLines, statements.length);
        j++
      ) {
        const statementsGroup = statements.slice(i, j);
        const complexity = this.calculateStatementGroupComplexity(statementsGroup);

        if (complexity >= options.minComplexity) {
          const startPos = sourceFile.getLineAndColumnAtPos(statementsGroup[0].getStart());
          const endPos = sourceFile.getLineAndColumnAtPos(
            statementsGroup[statementsGroup.length - 1].getEnd()
          );

          const codeBlock = statementsGroup.map(s => s.getText()).join('\n');
          const variables = this.analyzeVariables(statementsGroup);
          const suggestedName = this.suggestFunctionName(statementsGroup, variables);

          candidates.push({
            id: `extract-${startId + candidates.length}`,
            filePath,
            startLine: startPos.line,
            endLine: endPos.line,
            codeBlock,
            complexity,
            variables,
            suggestedName,
            extractionType: 'statements',
            confidence: this.calculateExtractionConfidence(complexity, variables),
          });
        }
      }
    }

    return candidates;
  }

  /**
   * Calculate complexity of statement group
   */
  private calculateStatementGroupComplexity(statements: Statement[]): number {
    let complexity = statements.length;

    for (const statement of statements) {
      statement.forEachDescendant(node => {
        switch (node.getKind()) {
          case SyntaxKind.IfStatement:
          case SyntaxKind.WhileStatement:
          case SyntaxKind.ForStatement:
          case SyntaxKind.SwitchStatement:
            complexity += 2;
            break;
          case SyntaxKind.TryStatement:
          case SyntaxKind.CatchClause:
            complexity += 1;
            break;
          case SyntaxKind.ConditionalExpression:
            complexity += 1;
            break;
        }
      });
    }

    return complexity;
  }

  /**
   * Analyze variables in statement group
   */
  private analyzeVariables(statements: Statement[]): VariableAnalysis {
    const parameters: Variable[] = [];
    const returnValues: Variable[] = [];
    const localVariables: Variable[] = [];
    const capturedVariables: Variable[] = [];

    // Simplified variable analysis
    const declaredVariables = new Set<string>();
    const usedVariables = new Set<string>();

    for (const statement of statements) {
      // Find variable declarations
      statement.forEachDescendant(node => {
        if (Node.isVariableDeclaration(node)) {
          declaredVariables.add(node.getName());
        }
      });

      // Find variable usage
      statement.forEachDescendant(node => {
        if (Node.isIdentifier(node)) {
          usedVariables.add(node.getText());
        }
      });
    }

    // Variables used but not declared are potential parameters
    for (const variable of usedVariables) {
      if (!declaredVariables.has(variable)) {
        parameters.push({
          name: variable,
          type: 'any', // Would need type analysis
          usage: 'read',
          scope: 'parameter',
        });
      }
    }

    return {
      parameters,
      returnValues,
      localVariables,
      capturedVariables,
    };
  }

  /**
   * Suggest function name based on code content
   */
  private suggestFunctionName(statements: Statement[], variables: VariableAnalysis): string {
    // Simple heuristics for function naming
    const codeText = statements
      .map(s => s.getText())
      .join(' ')
      .toLowerCase();

    if (codeText.includes('validate') || codeText.includes('check')) {
      return 'validateData';
    }
    if (codeText.includes('process') || codeText.includes('handle')) {
      return 'processData';
    }
    if (codeText.includes('calculate') || codeText.includes('compute')) {
      return 'calculateResult';
    }
    if (codeText.includes('format') || codeText.includes('transform')) {
      return 'formatData';
    }
    if (codeText.includes('fetch') || codeText.includes('get')) {
      return 'fetchData';
    }
    if (codeText.includes('save') || codeText.includes('store')) {
      return 'saveData';
    }

    return 'extractedFunction';
  }

  /**
   * Calculate extraction confidence
   */
  private calculateExtractionConfidence(complexity: number, variables: VariableAnalysis): number {
    let confidence = 70;

    // Higher confidence for higher complexity
    if (complexity > 10) confidence += 15;
    if (complexity > 20) confidence += 10;

    // Lower confidence for many parameters
    if (variables.parameters.length > 5) confidence -= 20;
    if (variables.parameters.length > 8) confidence -= 20;

    // Higher confidence for clear variable patterns
    if (variables.returnValues.length === 1) confidence += 10;

    return Math.max(30, Math.min(95, confidence));
  }

  /**
   * Find call sites for a function
   */
  private findCallSites(sourceFile: SourceFile, functionName: string): CallSite[] {
    const callSites: CallSite[] = [];

    sourceFile.forEachDescendant(node => {
      if (Node.isCallExpression(node)) {
        const expression = node.getExpression();

        if (Node.isIdentifier(expression) && expression.getText() === functionName) {
          const position = sourceFile.getLineAndColumnAtPos(node.getStart());
          const args = node.getArguments().map(arg => arg.getText());

          callSites.push({
            filePath: sourceFile.getFilePath(),
            line: position.line,
            column: position.column,
            context: node.getText(),
            arguments: args,
            canInline: this.canInlineAtCallSite(node),
            inlineComplexity: this.calculateInlineComplexity(node),
          });
        }
      }
    });

    return callSites;
  }

  /**
   * Check if function can be inlined at call site
   */
  private canInlineAtCallSite(callNode: Node): boolean {
    // Check if call is in a complex context that would make inlining risky
    let current = callNode.getParent();

    while (current) {
      // Don't inline in certain contexts
      if (Node.isConditionalExpression(current) || Node.isBinaryExpression(current)) {
        return false;
      }
      current = current.getParent();
    }

    return true;
  }

  /**
   * Calculate inline complexity
   */
  private calculateInlineComplexity(callNode: Node): number {
    // Simple complexity based on context
    let complexity = 1;

    const args = Node.isCallExpression(callNode) ? callNode.getArguments() : [];
    complexity += args.length;

    // Add complexity for complex arguments
    args.forEach(arg => {
      if (Node.isCallExpression(arg) || Node.isConditionalExpression(arg)) {
        complexity += 2;
      }
    });

    return complexity;
  }

  /**
   * Analyze risks of inlining
   */
  private analyzeInlineRisks(
    functionNode: FunctionDeclaration,
    callSites: CallSite[]
  ): InlineRisk[] {
    const risks: InlineRisk[] = [];

    // Code duplication risk
    if (callSites.length > 3) {
      risks.push({
        type: 'code-duplication',
        severity: 'medium',
        message: `Inlining will duplicate code across ${callSites.length} locations`,
        mitigation: 'Consider keeping function if called frequently',
      });
    }

    // Performance risk for large functions
    const body = functionNode.getBody();
    if (body && this.getLineCount(body) > 10) {
      risks.push({
        type: 'performance',
        severity: 'low',
        message: 'Inlining large function may increase bundle size',
        mitigation: 'Monitor bundle size after inlining',
      });
    }

    return risks;
  }

  /**
   * Calculate inlineability score
   */
  private calculateInlineability(
    complexity: number,
    lineCount: number,
    callSiteCount: number,
    risks: InlineRisk[]
  ): number {
    let score = 80;

    // Lower score for higher complexity
    score -= complexity * 2;

    // Lower score for more lines
    score -= lineCount * 3;

    // Lower score for more call sites (duplication concern)
    if (callSiteCount > 3) score -= (callSiteCount - 3) * 10;

    // Lower score for risks
    const highRisks = risks.filter(r => r.severity === 'high').length;
    const mediumRisks = risks.filter(r => r.severity === 'medium').length;
    score -= highRisks * 20 + mediumRisks * 10;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Determine insertion point for extracted function
   */
  private determineInsertionPoint(
    candidate: FunctionExtractionCandidate,
    preference?: string
  ): { filePath: string; line: number; column: number } {
    // Simplified insertion point logic
    switch (preference) {
      case 'before':
        return { filePath: candidate.filePath, line: candidate.startLine - 1, column: 1 };
      case 'after':
        return { filePath: candidate.filePath, line: candidate.endLine + 1, column: 1 };
      case 'top':
        return { filePath: candidate.filePath, line: 1, column: 1 };
      case 'bottom':
      default:
        return { filePath: candidate.filePath, line: 999999, column: 1 }; // End of file
    }
  }

  /**
   * Get LLM usage statistics
   */
  getLLMUsage() {
    return this.llmService.getUsage();
  }

  /**
   * Reset LLM usage statistics
   */
  resetLLMUsage() {
    this.llmService.resetUsage();
  }

  /**
   * Generate extracted function code
   */
  private generateExtractedFunction(
    candidate: FunctionExtractionCandidate,
    functionName: string,
    options: any
  ): string {
    const { parameters, returnValues } = candidate.variables;

    // Detect if this is a TypeScript file
    const isTypeScript = candidate.filePath.endsWith('.ts') || candidate.filePath.endsWith('.tsx');

    const paramList = isTypeScript
      ? parameters.map(p => `${p.name}: ${p.type}`).join(', ')
      : parameters.map(p => p.name).join(', ');

    const returnType = isTypeScript
      ? returnValues.length === 1
        ? returnValues[0].type
        : 'void'
      : '';

    // Check if the original code block contains await
    const hasAwait = candidate.codeBlock.includes('await');
    const shouldBeAsync = options.makeAsync || hasAwait;

    const asyncKeyword = shouldBeAsync ? 'async ' : '';
    const returnStatement = returnValues.length > 0 ? `\n  return ${returnValues[0].name};` : '';

    let functionCode = isTypeScript
      ? `${asyncKeyword}function ${functionName}(${paramList}): ${returnType} {\n`
      : `${asyncKeyword}function ${functionName}(${paramList}) {\n`;

    if (options.addDocumentation) {
      functionCode = `/**\n * Extracted function\n * Generated by Refactogent\n */\n${functionCode}`;
    }

    // Indent the original code block
    const indentedCode = candidate.codeBlock
      .split('\n')
      .map(line => `  ${line}`)
      .join('\n');

    functionCode += indentedCode + returnStatement + '\n}\n';

    return functionCode;
  }

  /**
   * Generate function call to replace extracted code
   */
  private generateFunctionCall(
    candidate: FunctionExtractionCandidate,
    functionName: string
  ): string {
    const { parameters, returnValues } = candidate.variables;

    const argList = parameters.map(p => p.name).join(', ');

    // Check if the original code block contains await
    const hasAwait = candidate.codeBlock.includes('await');
    const call = hasAwait ? `await ${functionName}(${argList})` : `${functionName}(${argList})`;

    if (returnValues.length === 1) {
      return `const ${returnValues[0].name} = ${call};`;
    } else if (returnValues.length > 1) {
      const returnNames = returnValues.map(v => v.name).join(', ');
      return `const [${returnNames}] = ${call};`;
    } else {
      return `${call};`;
    }
  }

  /**
   * Generate inlined code for call site
   */
  private generateInlinedCode(candidate: FunctionInlineCandidate, callSite: CallSite): string {
    let inlinedCode = candidate.declaration.body;

    // Replace parameters with arguments
    candidate.declaration.parameters.forEach((param, index) => {
      if (index < callSite.arguments.length) {
        const regex = new RegExp(`\\b${param}\\b`, 'g');
        inlinedCode = inlinedCode.replace(regex, callSite.arguments[index]);
      }
    });

    // Remove function wrapper (braces)
    inlinedCode = inlinedCode.replace(/^\s*\{/, '').replace(/\}\s*$/, '');

    // Handle return statements
    inlinedCode = inlinedCode.replace(/return\s+([^;]+);?/g, '$1');

    return inlinedCode.trim();
  }

  /**
   * Calculate complexity of a node
   */
  private calculateComplexity(node: Node): number {
    let complexity = 1;

    node.forEachDescendant(descendant => {
      switch (descendant.getKind()) {
        case SyntaxKind.IfStatement:
        case SyntaxKind.WhileStatement:
        case SyntaxKind.ForStatement:
        case SyntaxKind.DoStatement:
        case SyntaxKind.SwitchStatement:
          complexity += 2;
          break;
        case SyntaxKind.ConditionalExpression:
        case SyntaxKind.BinaryExpression:
          complexity += 1;
          break;
        case SyntaxKind.TryStatement:
        case SyntaxKind.CatchClause:
          complexity += 1;
          break;
      }
    });

    return complexity;
  }

  /**
   * Get line count of a node
   */
  private getLineCount(node: Node): number {
    const text = node.getText();
    return text.split('\n').length;
  }
}
