import { Project, SourceFile, Node, SyntaxKind } from 'ts-morph';
import * as babel from '@babel/core';
import { parse } from '@babel/parser';
// @ts-ignore - Babel traverse has complex ESM/CJS interop
import traverse from '@babel/traverse';
// @ts-ignore - Babel generator has complex ESM/CJS interop
import generate from '@babel/generator';
import * as t from '@babel/types';
import fs from 'fs';
import path from 'path';
import { Logger } from '../utils/logger.js';

export interface ASTTransformationResult {
  success: boolean;
  message: string;
  originalCode: string;
  transformedCode?: string;
  changes: ASTCodeChange[];
  diagnostics?: string[];
}

export interface ASTCodeChange {
  type: string;
  description: string;
  location: {
    line: number;
    column: number;
    endLine?: number;
    endColumn?: number;
  };
  before: string;
  after: string;
  confidence: number; // 0-100
  riskLevel: 'low' | 'medium' | 'high';
}

export interface RefactoringRule {
  name: string;
  description: string;
  category: 'naming' | 'structure' | 'performance' | 'maintainability' | 'safety';
  riskLevel: 'low' | 'medium' | 'high';
  apply: (context: RefactoringContext) => ASTCodeChange[];
}

export interface RefactoringContext {
  sourceFile: SourceFile;
  project: Project;
  filePath: string;
  language: 'typescript' | 'javascript';
  changes: ASTCodeChange[];
}

export class ASTTransformer {
  private logger: Logger;
  private project: Project;
  private rules: Map<string, RefactoringRule> = new Map();

  constructor(logger: Logger) {
    this.logger = logger;
    this.project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        target: 99, // Latest
        module: 99, // ESNext
        strict: false, // Allow analysis of non-strict code
        allowJs: true,
        checkJs: false,
      },
    });

    this.initializeRules();
  }

  /**
   * Transform TypeScript/JavaScript code using AST analysis
   */
  async transformCode(
    filePath: string,
    transformations: string[]
  ): Promise<ASTTransformationResult> {
    try {
      const originalCode = fs.readFileSync(filePath, 'utf8');
      const fileExtension = path.extname(filePath);
      const isTypeScript = ['.ts', '.tsx'].includes(fileExtension);
      const language = isTypeScript ? 'typescript' : 'javascript';

      if (isTypeScript) {
        return await this.transformTypeScript(filePath, originalCode, transformations);
      } else {
        return await this.transformJavaScript(filePath, originalCode, transformations);
      }
    } catch (error) {
      return {
        success: false,
        message: `Failed to transform ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
        originalCode: '',
        changes: [],
        diagnostics: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  /**
   * Transform TypeScript code using ts-morph
   */
  private async transformTypeScript(
    filePath: string,
    originalCode: string,
    transformations: string[]
  ): Promise<ASTTransformationResult> {
    const sourceFile = this.project.createSourceFile(filePath, originalCode, { overwrite: true });
    const changes: ASTCodeChange[] = [];
    const diagnostics: string[] = [];

    const context: RefactoringContext = {
      sourceFile,
      project: this.project,
      filePath,
      language: 'typescript',
      changes,
    };

    // Apply requested transformations
    for (const transformation of transformations) {
      const rule = this.rules.get(transformation);
      if (rule) {
        try {
          const ruleChanges = rule.apply(context);
          changes.push(...ruleChanges);
        } catch (error) {
          diagnostics.push(
            `Failed to apply rule ${transformation}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      } else {
        diagnostics.push(`Unknown transformation: ${transformation}`);
      }
    }

    // Apply changes to the source file
    if (changes.length > 0) {
      // Sort changes by position (reverse order to avoid position shifts)
      changes.sort((a, b) => {
        if (a.location.line !== b.location.line) {
          return b.location.line - a.location.line;
        }
        return b.location.column - a.location.column;
      });

      // Apply changes
      for (const change of changes) {
        this.applyChangeToSourceFile(sourceFile, change);
      }
    }

    const transformedCode = changes.length > 0 ? sourceFile.getFullText() : undefined;

    return {
      success: true,
      message: `Applied ${changes.length} transformations`,
      originalCode,
      transformedCode,
      changes,
      diagnostics: diagnostics.length > 0 ? diagnostics : undefined,
    };
  }

  /**
   * Transform JavaScript code using Babel
   */
  private async transformJavaScript(
    filePath: string,
    originalCode: string,
    transformations: string[]
  ): Promise<ASTTransformationResult> {
    const changes: ASTCodeChange[] = [];
    const diagnostics: string[] = [];

    try {
      // Parse the code
      const ast = parse(originalCode, {
        sourceType: 'module',
        allowImportExportEverywhere: true,
        allowReturnOutsideFunction: true,
        plugins: [
          'jsx',
          'typescript',
          'decorators-legacy',
          'classProperties',
          'objectRestSpread',
          'asyncGenerators',
          'functionBind',
          'exportDefaultFrom',
          'exportNamespaceFrom',
          'dynamicImport',
          'nullishCoalescingOperator',
          'optionalChaining',
        ],
      });

      // Apply transformations
      for (const transformation of transformations) {
        const rule = this.rules.get(transformation);
        if (rule) {
          try {
            const ruleChanges = this.applyBabelRule(ast, originalCode, rule);
            changes.push(...ruleChanges);
          } catch (error) {
            diagnostics.push(
              `Failed to apply rule ${transformation}: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        } else {
          diagnostics.push(`Unknown transformation: ${transformation}`);
        }
      }

      // Generate transformed code if changes were made
      let transformedCode: string | undefined;
      if (changes.length > 0) {
        const generateFunction = (generate as any).default || generate;
        const result = generateFunction(ast, {
          retainLines: true,
          compact: false,
        });
        transformedCode = result.code;
      }

      return {
        success: true,
        message: `Applied ${changes.length} transformations`,
        originalCode,
        transformedCode,
        changes,
        diagnostics: diagnostics.length > 0 ? diagnostics : undefined,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to parse JavaScript: ${error instanceof Error ? error.message : String(error)}`,
        originalCode,
        changes: [],
        diagnostics: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  /**
   * Apply a refactoring rule using Babel AST
   */
  private applyBabelRule(
    ast: t.File,
    originalCode: string,
    rule: RefactoringRule
  ): ASTCodeChange[] {
    const changes: ASTCodeChange[] = [];
    const lines = originalCode.split('\n');

    // Handle both default and named exports from Babel traverse
    const traverseFunction = typeof traverse === 'function' ? traverse : (traverse as any).default;

    traverseFunction(ast, {
      // Extract constants from numeric literals
      NumericLiteral(path: any) {
        if (rule.name === 'extract-constants') {
          const value = path.node.value;
          if ([50, 100, 200, 404, 500].includes(value)) {
            const loc = path.node.loc;
            if (loc) {
              changes.push({
                type: 'extract-constant',
                description: `Extract magic number ${value} to named constant`,
                location: {
                  line: loc.start.line,
                  column: loc.start.column,
                  endLine: loc.end.line,
                  endColumn: loc.end.column,
                },
                before: String(value),
                after: `CONSTANT_${value}`,
                confidence: 85,
                riskLevel: 'low',
              });

              // Replace the node
              path.replaceWith(t.identifier(`CONSTANT_${value}`));
            }
          }
        }
      },

      // Improve variable naming
      Identifier(path: any) {
        if (rule.name === 'improve-naming') {
          const name = path.node.name;
          const improvements: Record<string, string> = {
            temp: 'temporary',
            tmp: 'temporary',
            data: 'responseData',
            info: 'information',
            obj: 'object',
            arr: 'array',
          };

          if (improvements[name] && path.isReferencedIdentifier()) {
            const loc = path.node.loc;
            if (loc) {
              changes.push({
                type: 'improve-naming',
                description: `Improve variable name: ${name} → ${improvements[name]}`,
                location: {
                  line: loc.start.line,
                  column: loc.start.column,
                  endLine: loc.end.line,
                  endColumn: loc.end.column,
                },
                before: name,
                after: improvements[name],
                confidence: 75,
                riskLevel: 'medium',
              });

              path.node.name = improvements[name];
            }
          }
        }
      },

      // Simplify boolean comparisons
      BinaryExpression(path: any) {
        if (rule.name === 'simplify-conditionals') {
          const { left, operator, right } = path.node;

          // Simplify === true
          if (operator === '===' && t.isBooleanLiteral(right) && right.value === true) {
            const loc = path.node.loc;
            if (loc) {
              changes.push({
                type: 'simplify-conditional',
                description: 'Simplify boolean comparison (=== true)',
                location: {
                  line: loc.start.line,
                  column: loc.start.column,
                  endLine: loc.end.line,
                  endColumn: loc.end.column,
                },
                before: `${(generate as any).default ? (generate as any).default(left).code : (generate as any)(left).code} === true`,
                after: (generate as any).default
                  ? (generate as any).default(left).code
                  : (generate as any)(left).code,
                confidence: 95,
                riskLevel: 'low',
              });

              path.replaceWith(left);
            }
          }

          // Simplify === false
          if (operator === '===' && t.isBooleanLiteral(right) && right.value === false) {
            const loc = path.node.loc;
            if (loc && t.isExpression(left)) {
              changes.push({
                type: 'simplify-conditional',
                description: 'Simplify boolean comparison (=== false)',
                location: {
                  line: loc.start.line,
                  column: loc.start.column,
                  endLine: loc.end.line,
                  endColumn: loc.end.column,
                },
                before: `${(generate as any).default ? (generate as any).default(left).code : (generate as any)(left).code} === false`,
                after: `!${(generate as any).default ? (generate as any).default(left).code : (generate as any)(left).code}`,
                confidence: 95,
                riskLevel: 'low',
              });

              path.replaceWith(t.unaryExpression('!', left));
            }
          }
        }
      },
    });

    return changes;
  }

  /**
   * Apply a change to a TypeScript source file
   */
  private applyChangeToSourceFile(sourceFile: SourceFile, change: ASTCodeChange): void {
    // This is a simplified implementation
    // In a real implementation, you'd use ts-morph's transformation APIs
    const text = sourceFile.getFullText();
    const lines = text.split('\n');

    if (change.location.line <= lines.length) {
      const line = lines[change.location.line - 1];
      const newLine = line.replace(change.before, change.after);
      lines[change.location.line - 1] = newLine;

      sourceFile.replaceWithText(lines.join('\n'));
    }
  }

  /**
   * Initialize refactoring rules
   */
  private initializeRules(): void {
    // Extract constants rule
    this.rules.set('extract-constants', {
      name: 'extract-constants',
      description: 'Extract magic numbers and strings to named constants',
      category: 'maintainability',
      riskLevel: 'low',
      apply: context => this.extractConstants(context),
    });

    // Improve naming rule
    this.rules.set('improve-naming', {
      name: 'improve-naming',
      description: 'Improve variable and function naming consistency',
      category: 'naming',
      riskLevel: 'medium',
      apply: context => this.improveNaming(context),
    });

    // Simplify conditionals rule
    this.rules.set('simplify-conditionals', {
      name: 'simplify-conditionals',
      description: 'Simplify complex conditional expressions',
      category: 'maintainability',
      riskLevel: 'low',
      apply: context => this.simplifyConditionals(context),
    });

    // Remove unused imports rule
    this.rules.set('remove-unused-imports', {
      name: 'remove-unused-imports',
      description: 'Remove unused import statements',
      category: 'maintainability',
      riskLevel: 'low',
      apply: context => this.removeUnusedImports(context),
    });
  }

  /**
   * Extract constants using TypeScript AST
   */
  private extractConstants(context: RefactoringContext): ASTCodeChange[] {
    const changes: ASTCodeChange[] = [];
    const { sourceFile } = context;

    // Find numeric literals that should be extracted
    sourceFile.forEachDescendant(node => {
      if (Node.isNumericLiteral(node)) {
        const value = node.getLiteralValue();
        if ([50, 100, 200, 404, 500].includes(value)) {
          const start = node.getStart();
          const end = node.getEnd();
          const pos = sourceFile.getLineAndColumnAtPos(start);

          changes.push({
            type: 'extract-constant',
            description: `Extract magic number ${value} to named constant`,
            location: {
              line: pos.line,
              column: pos.column,
            },
            before: String(value),
            after: `CONSTANT_${value}`,
            confidence: 85,
            riskLevel: 'low',
          });
        }
      }
    });

    return changes;
  }

  /**
   * Improve naming using TypeScript AST
   */
  private improveNaming(context: RefactoringContext): ASTCodeChange[] {
    const changes: ASTCodeChange[] = [];
    const { sourceFile } = context;

    const improvements: Record<string, string> = {
      temp: 'temporary',
      tmp: 'temporary',
      data: 'responseData',
      info: 'information',
      obj: 'object',
      arr: 'array',
    };

    sourceFile.forEachDescendant(node => {
      if (Node.isIdentifier(node)) {
        const name = node.getText();
        if (improvements[name]) {
          const start = node.getStart();
          const pos = sourceFile.getLineAndColumnAtPos(start);

          changes.push({
            type: 'improve-naming',
            description: `Improve variable name: ${name} → ${improvements[name]}`,
            location: {
              line: pos.line,
              column: pos.column,
            },
            before: name,
            after: improvements[name],
            confidence: 75,
            riskLevel: 'medium',
          });
        }
      }
    });

    return changes;
  }

  /**
   * Simplify conditionals using TypeScript AST
   */
  private simplifyConditionals(context: RefactoringContext): ASTCodeChange[] {
    const changes: ASTCodeChange[] = [];
    const { sourceFile } = context;

    sourceFile.forEachDescendant(node => {
      if (Node.isBinaryExpression(node)) {
        const operator = node.getOperatorToken();
        const right = node.getRight();

        // Simplify === true
        if (
          operator.getKind() === SyntaxKind.EqualsEqualsEqualsToken &&
          right.getKind() === SyntaxKind.TrueKeyword
        ) {
          const start = node.getStart();
          const pos = sourceFile.getLineAndColumnAtPos(start);
          const left = node.getLeft();

          changes.push({
            type: 'simplify-conditional',
            description: 'Simplify boolean comparison (=== true)',
            location: {
              line: pos.line,
              column: pos.column,
            },
            before: node.getText(),
            after: left.getText(),
            confidence: 95,
            riskLevel: 'low',
          });
        }

        // Simplify === false
        if (
          operator.getKind() === SyntaxKind.EqualsEqualsEqualsToken &&
          right.getKind() === SyntaxKind.FalseKeyword
        ) {
          const start = node.getStart();
          const pos = sourceFile.getLineAndColumnAtPos(start);
          const left = node.getLeft();

          changes.push({
            type: 'simplify-conditional',
            description: 'Simplify boolean comparison (=== false)',
            location: {
              line: pos.line,
              column: pos.column,
            },
            before: node.getText(),
            after: `!${left.getText()}`,
            confidence: 95,
            riskLevel: 'low',
          });
        }
      }
    });

    return changes;
  }

  /**
   * Remove unused imports using TypeScript AST
   */
  private removeUnusedImports(context: RefactoringContext): ASTCodeChange[] {
    const changes: ASTCodeChange[] = [];
    const { sourceFile } = context;

    const imports = sourceFile.getImportDeclarations();

    for (const importDecl of imports) {
      const namedImports = importDecl.getNamedImports();
      const unusedImports: string[] = [];

      for (const namedImport of namedImports) {
        const name = namedImport.getName();
        const references = sourceFile
          .getDescendantsOfKind(SyntaxKind.Identifier)
          .filter(id => id.getText() === name && id !== namedImport.getNameNode());

        if (references.length === 0) {
          unusedImports.push(name);
        }
      }

      if (unusedImports.length > 0) {
        const start = importDecl.getStart();
        const pos = sourceFile.getLineAndColumnAtPos(start);

        changes.push({
          type: 'remove-unused-import',
          description: `Remove unused imports: ${unusedImports.join(', ')}`,
          location: {
            line: pos.line,
            column: pos.column,
          },
          before: importDecl.getText(),
          after: unusedImports.length === namedImports.length ? '(removed)' : 'partial removal',
          confidence: 90,
          riskLevel: 'low',
        });
      }
    }

    return changes;
  }
}
