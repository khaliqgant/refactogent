import { Node, SyntaxKind } from 'ts-morph';
import {
  Transformation,
  TransformationContext,
  TransformationResult,
  CodeChange,
} from './transformation-engine.js';

/**
 * Built-in transformations for the refactoring engine
 */

export const EXTRACT_CONSTANTS_TRANSFORMATION: Transformation = {
  id: 'extract-constants',
  name: 'Extract Magic Numbers to Constants',
  description: 'Extract magic numbers and strings to named constants',
  category: 'refactor',
  language: 'any',
  riskLevel: 'low',
  dependencies: [],
  conflicts: [],

  async apply(context: TransformationContext): Promise<TransformationResult> {
    const changes: CodeChange[] = [];
    const { sourceFile } = context;
    const magicNumbers = new Set<number>();
    const constants: Array<{ name: string; value: number; line: number }> = [];

    // Find magic numbers
    sourceFile.forEachDescendant(node => {
      if (Node.isNumericLiteral(node)) {
        const value = node.getLiteralValue();
        if ([50, 100, 200, 404, 500, 1000].includes(value)) {
          magicNumbers.add(value);

          const start = sourceFile.getLineAndColumnAtPos(node.getStart());
          const end = sourceFile.getLineAndColumnAtPos(node.getEnd());

          changes.push({
            type: 'replace',
            location: {
              start: { line: start.line, column: start.column },
              end: { line: end.line, column: end.column },
            },
            originalText: String(value),
            newText: `CONSTANT_${value}`,
            description: `Extract magic number ${value} to constant`,
            confidence: 90,
            riskLevel: 'low',
          });
        }
      }
    });

    // Generate constants at the top of the file
    if (magicNumbers.size > 0) {
      const constantDeclarations = Array.from(magicNumbers)
        .sort((a, b) => a - b)
        .map(value => `const CONSTANT_${value} = ${value};`)
        .join('\n');

      changes.unshift({
        type: 'insert',
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 1 },
        },
        originalText: '',
        newText: constantDeclarations + '\n\n',
        description: 'Add constant declarations',
        confidence: 95,
        riskLevel: 'low',
      });
    }

    // Apply changes to get transformed content
    let transformedContent = context.metadata.originalContent;

    // Apply changes in reverse order to maintain positions
    const sortedChanges = [...changes].sort((a, b) => {
      if (a.location.start.line !== b.location.start.line) {
        return b.location.start.line - a.location.start.line;
      }
      return b.location.start.column - a.location.start.column;
    });

    for (const change of sortedChanges) {
      if (change.type === 'replace') {
        transformedContent = transformedContent.replace(
          new RegExp(`\\b${change.originalText}\\b`, 'g'),
          change.newText
        );
      } else if (change.type === 'insert' && change.location.start.line === 1) {
        transformedContent = change.newText + transformedContent;
      }
    }

    return {
      success: true,
      transformationId: 'extract-constants',
      changes,
      transformedContent,
      syntaxValid: true,
      semanticValid: true,
      rollbackData: {
        originalContent: context.metadata.originalContent,
        constants: Array.from(magicNumbers),
      },
      diagnostics: [],
      metrics: {
        linesChanged: changes.length,
        complexity: { before: 0, after: 0 }, // Will be calculated by engine
        performance: { executionTime: 0, memoryUsage: 0 }, // Will be calculated by engine
      },
    };
  },

  async rollback(context: TransformationContext, result: TransformationResult): Promise<void> {
    if (result.rollbackData?.originalContent) {
      // Restore original content
      const fs = await import('fs');
      fs.writeFileSync(context.filePath, result.rollbackData.originalContent);
    }
  },
};

export const IMPROVE_NAMING_TRANSFORMATION: Transformation = {
  id: 'improve-naming',
  name: 'Improve Variable Naming',
  description: 'Improve variable and function naming consistency',
  category: 'refactor',
  language: 'any',
  riskLevel: 'medium',
  dependencies: [],
  conflicts: [],

  async apply(context: TransformationContext): Promise<TransformationResult> {
    const changes: CodeChange[] = [];
    const { sourceFile } = context;

    const namingImprovements: Record<string, string> = {
      temp: 'temporary',
      tmp: 'temporary',
      data: 'responseData',
      info: 'information',
      obj: 'object',
      arr: 'array',
      str: 'text',
      num: 'number',
      val: 'value',
      res: 'result',
      req: 'request',
    };

    // Find identifiers to rename
    sourceFile.forEachDescendant(node => {
      if (Node.isIdentifier(node)) {
        const name = node.getText();
        const improvedName = namingImprovements[name];

        if (improvedName) {
          const start = sourceFile.getLineAndColumnAtPos(node.getStart());
          const end = sourceFile.getLineAndColumnAtPos(node.getEnd());

          changes.push({
            type: 'replace',
            location: {
              start: { line: start.line, column: start.column },
              end: { line: end.line, column: end.column },
            },
            originalText: name,
            newText: improvedName,
            description: `Improve variable name: ${name} → ${improvedName}`,
            confidence: 75,
            riskLevel: 'medium',
          });
        }
      }
    });

    // Apply changes
    let transformedContent = context.metadata.originalContent;

    // Group changes by original text to avoid partial replacements
    const changeGroups = new Map<string, string>();
    changes.forEach(change => {
      if (change.type === 'replace') {
        changeGroups.set(change.originalText, change.newText);
      }
    });

    // Apply replacements using word boundaries to avoid partial matches
    changeGroups.forEach((newText, originalText) => {
      const regex = new RegExp(`\\b${originalText}\\b`, 'g');
      transformedContent = transformedContent.replace(regex, newText);
    });

    return {
      success: true,
      transformationId: 'improve-naming',
      changes,
      transformedContent,
      syntaxValid: true,
      semanticValid: true,
      rollbackData: {
        originalContent: context.metadata.originalContent,
        renamedIdentifiers: changeGroups,
      },
      diagnostics: [],
      metrics: {
        linesChanged: changes.length,
        complexity: { before: 0, after: 0 },
        performance: { executionTime: 0, memoryUsage: 0 },
      },
    };
  },

  async rollback(context: TransformationContext, result: TransformationResult): Promise<void> {
    if (result.rollbackData?.originalContent) {
      const fs = await import('fs');
      fs.writeFileSync(context.filePath, result.rollbackData.originalContent);
    }
  },
};

export const SIMPLIFY_CONDITIONALS_TRANSFORMATION: Transformation = {
  id: 'simplify-conditionals',
  name: 'Simplify Boolean Conditionals',
  description: 'Simplify boolean comparisons and conditional expressions',
  category: 'optimize',
  language: 'any',
  riskLevel: 'low',
  dependencies: [],
  conflicts: [],

  async apply(context: TransformationContext): Promise<TransformationResult> {
    const changes: CodeChange[] = [];
    const { sourceFile } = context;

    // Find boolean comparisons to simplify
    sourceFile.forEachDescendant(node => {
      if (Node.isBinaryExpression(node)) {
        const operator = node.getOperatorToken();
        const left = node.getLeft();
        const right = node.getRight();

        // Simplify === true
        if (
          operator.getKind() === SyntaxKind.EqualsEqualsEqualsToken &&
          right.getKind() === SyntaxKind.TrueKeyword
        ) {
          const start = sourceFile.getLineAndColumnAtPos(node.getStart());
          const end = sourceFile.getLineAndColumnAtPos(node.getEnd());

          changes.push({
            type: 'replace',
            location: {
              start: { line: start.line, column: start.column },
              end: { line: end.line, column: end.column },
            },
            originalText: node.getText(),
            newText: left.getText(),
            description: 'Simplify boolean comparison (=== true)',
            confidence: 95,
            riskLevel: 'low',
          });
        }

        // Simplify === false
        if (
          operator.getKind() === SyntaxKind.EqualsEqualsEqualsToken &&
          right.getKind() === SyntaxKind.FalseKeyword
        ) {
          const start = sourceFile.getLineAndColumnAtPos(node.getStart());
          const end = sourceFile.getLineAndColumnAtPos(node.getEnd());

          changes.push({
            type: 'replace',
            location: {
              start: { line: start.line, column: start.column },
              end: { line: end.line, column: end.column },
            },
            originalText: node.getText(),
            newText: `!${left.getText()}`,
            description: 'Simplify boolean comparison (=== false)',
            confidence: 95,
            riskLevel: 'low',
          });
        }
      }
    });

    // Apply changes
    let transformedContent = context.metadata.originalContent;

    // Sort changes by position (reverse order to maintain positions)
    const sortedChanges = [...changes].sort((a, b) => {
      if (a.location.start.line !== b.location.start.line) {
        return b.location.start.line - a.location.start.line;
      }
      return b.location.start.column - a.location.start.column;
    });

    // Apply each change
    for (const change of sortedChanges) {
      if (change.type === 'replace') {
        // Find and replace the specific occurrence
        const lines = transformedContent.split('\n');
        const lineIndex = change.location.start.line - 1;

        if (lineIndex >= 0 && lineIndex < lines.length) {
          const line = lines[lineIndex];
          const beforeCol = change.location.start.column - 1;
          const afterCol = change.location.end.column - 1;

          if (beforeCol >= 0 && afterCol <= line.length) {
            const before = line.substring(0, beforeCol);
            const after = line.substring(afterCol);
            lines[lineIndex] = before + change.newText + after;
            transformedContent = lines.join('\n');
          }
        }
      }
    }

    return {
      success: true,
      transformationId: 'simplify-conditionals',
      changes,
      transformedContent,
      syntaxValid: true,
      semanticValid: true,
      rollbackData: {
        originalContent: context.metadata.originalContent,
      },
      diagnostics: [],
      metrics: {
        linesChanged: changes.length,
        complexity: { before: 0, after: 0 },
        performance: { executionTime: 0, memoryUsage: 0 },
      },
    };
  },

  async rollback(context: TransformationContext, result: TransformationResult): Promise<void> {
    if (result.rollbackData?.originalContent) {
      const fs = await import('fs');
      fs.writeFileSync(context.filePath, result.rollbackData.originalContent);
    }
  },
};

export const REMOVE_UNUSED_IMPORTS_TRANSFORMATION: Transformation = {
  id: 'remove-unused-imports',
  name: 'Remove Unused Imports',
  description: 'Remove unused import statements',
  category: 'cleanup',
  language: 'typescript',
  riskLevel: 'low',
  dependencies: [],
  conflicts: [],

  async apply(context: TransformationContext): Promise<TransformationResult> {
    const changes: CodeChange[] = [];
    const { sourceFile } = context;

    // Find unused imports
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
        const start = sourceFile.getLineAndColumnAtPos(importDecl.getStart());
        const end = sourceFile.getLineAndColumnAtPos(importDecl.getEnd());

        if (unusedImports.length === namedImports.length) {
          // Remove entire import statement
          changes.push({
            type: 'delete',
            location: {
              start: { line: start.line, column: start.column },
              end: { line: end.line + 1, column: 1 }, // Include newline
            },
            originalText: importDecl.getText(),
            newText: '',
            description: `Remove unused import: ${importDecl.getModuleSpecifierValue()}`,
            confidence: 90,
            riskLevel: 'low',
          });
        } else {
          // Remove only unused named imports
          const remainingImports = namedImports
            .filter(ni => !unusedImports.includes(ni.getName()))
            .map(ni => ni.getName());

          const newImportText = `import { ${remainingImports.join(', ')} } from ${importDecl.getModuleSpecifier()?.getText()};`;

          changes.push({
            type: 'replace',
            location: {
              start: { line: start.line, column: start.column },
              end: { line: end.line, column: end.column },
            },
            originalText: importDecl.getText(),
            newText: newImportText,
            description: `Remove unused imports: ${unusedImports.join(', ')}`,
            confidence: 85,
            riskLevel: 'low',
          });
        }
      }
    }

    // Apply changes
    let transformedContent = context.metadata.originalContent;

    // Sort changes by position (reverse order)
    const sortedChanges = [...changes].sort((a, b) => {
      if (a.location.start.line !== b.location.start.line) {
        return b.location.start.line - a.location.start.line;
      }
      return b.location.start.column - a.location.start.column;
    });

    // Apply each change
    const lines = transformedContent.split('\n');

    for (const change of sortedChanges) {
      const startLine = change.location.start.line - 1;
      const endLine = change.location.end.line - 1;

      if (change.type === 'delete') {
        lines.splice(startLine, endLine - startLine + 1);
      } else if (change.type === 'replace') {
        if (startLine >= 0 && startLine < lines.length) {
          lines[startLine] = change.newText;
        }
      }
    }

    transformedContent = lines.join('\n');

    return {
      success: true,
      transformationId: 'remove-unused-imports',
      changes,
      transformedContent,
      syntaxValid: true,
      semanticValid: true,
      rollbackData: {
        originalContent: context.metadata.originalContent,
      },
      diagnostics: [],
      metrics: {
        linesChanged: changes.length,
        complexity: { before: 0, after: 0 },
        performance: { executionTime: 0, memoryUsage: 0 },
      },
    };
  },

  async rollback(context: TransformationContext, result: TransformationResult): Promise<void> {
    if (result.rollbackData?.originalContent) {
      const fs = await import('fs');
      fs.writeFileSync(context.filePath, result.rollbackData.originalContent);
    }
  },
};

/**
 * Get all built-in transformations
 */
export function getBuiltInTransformations(): Transformation[] {
  return [
    EXTRACT_CONSTANTS_TRANSFORMATION,
    IMPROVE_NAMING_TRANSFORMATION,
    SIMPLIFY_CONDITIONALS_TRANSFORMATION,
    REMOVE_UNUSED_IMPORTS_TRANSFORMATION,
  ];
}
