import fs from 'fs';
import { Logger } from '../utils/logger.js';

export interface TransformationResult {
  success: boolean;
  message: string;
  originalCode: string;
  transformedCode?: string;
  changes: CodeChange[];
}

export interface CodeChange {
  type: string;
  description: string;
  line?: number;
  column?: number;
  before?: string;
  after?: string;
}

export class SimpleTransformer {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Transform JavaScript/TypeScript code using simple string operations
   */
  async transformJavaScript(
    filePath: string,
    transformations: string[]
  ): Promise<TransformationResult> {
    try {
      const originalCode = fs.readFileSync(filePath, 'utf8');
      let transformedCode = originalCode;
      const changes: CodeChange[] = [];

      // Apply transformations
      for (const transformation of transformations) {
        switch (transformation) {
          case 'extract-constants':
            const constantResult = this.extractConstants(transformedCode);
            transformedCode = constantResult.code;
            changes.push(...constantResult.changes);
            break;

          case 'improve-naming':
            const namingResult = this.improveNaming(transformedCode);
            transformedCode = namingResult.code;
            changes.push(...namingResult.changes);
            break;

          case 'simplify-conditionals':
            const conditionalResult = this.simplifyConditionals(transformedCode);
            transformedCode = conditionalResult.code;
            changes.push(...conditionalResult.changes);
            break;

          case 'remove-unused-imports':
            const importResult = this.removeUnusedImports(transformedCode);
            transformedCode = importResult.code;
            changes.push(...importResult.changes);
            break;

          default:
            this.logger.warn('Unknown transformation', { transformation });
        }
      }

      return {
        success: true,
        message: `Applied ${changes.length} transformations`,
        originalCode,
        transformedCode: changes.length > 0 ? transformedCode : undefined,
        changes,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to transform ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
        originalCode: '',
        changes: [],
      };
    }
  }

  /**
   * Extract magic numbers and strings to constants (simple version)
   */
  private extractConstants(code: string): { code: string; changes: CodeChange[] } {
    const changes: CodeChange[] = [];
    let transformedCode = code;

    // Find magic numbers that are NOT inside string literals
    const magicNumbers: string[] = [];
    const numberPattern = /\b(100|50|200|404|500)\b/g;
    let match;
    
    while ((match = numberPattern.exec(code)) !== null) {
      const matchIndex = match.index;
      const beforeMatch = code.substring(0, matchIndex);
      
      // Count quotes before this match to determine if we're inside a string
      const singleQuotes = (beforeMatch.match(/'/g) || []).length;
      const doubleQuotes = (beforeMatch.match(/"/g) || []).length;
      const backticks = (beforeMatch.match(/`/g) || []).length;
      
      // If we have an odd number of quotes, we're inside a string literal
      const insideString = (singleQuotes % 2 === 1) || (doubleQuotes % 2 === 1) || (backticks % 2 === 1);
      
      if (!insideString) {
        magicNumbers.push(match[1]);
      }
    }

    if (magicNumbers.length > 0) {
      const uniqueNumbers = [...new Set(magicNumbers)];

      // Replace occurrences only outside of string literals first
      uniqueNumbers.forEach(num => {
        transformedCode = this.replaceNumberOutsideStrings(transformedCode, num, `CONSTANT_${num}`);

        changes.push({
          type: 'extract-constant',
          description: `Extracted magic number ${num} to CONSTANT_${num}`,
          before: num,
          after: `CONSTANT_${num}`,
        });
      });

      // Add constants at the top after replacements
      const constants = uniqueNumbers.map(num => `const CONSTANT_${num} = ${num};`).join('\n');
      transformedCode = constants + '\n\n' + transformedCode;
    }

    return { code: transformedCode, changes };
  }

  /**
   * Replace a number with a constant name, but only outside of string literals
   */
  private replaceNumberOutsideStrings(code: string, number: string, replacement: string): string {
    let result = '';
    let i = 0;
    let insideString = false;
    let stringChar = '';
    
    while (i < code.length) {
      const char = code[i];
      
      // Track string boundaries
      if (!insideString && (char === '"' || char === "'" || char === '`')) {
        insideString = true;
        stringChar = char;
        result += char;
        i++;
        continue;
      } else if (insideString && char === stringChar && code[i - 1] !== '\\') {
        insideString = false;
        stringChar = '';
        result += char;
        i++;
        continue;
      }
      
      // If we're not inside a string, check for the number pattern
      if (!insideString) {
        const remaining = code.substring(i);
        const numberRegex = new RegExp(`^\\b${number}\\b`);
        
        if (numberRegex.test(remaining)) {
          result += replacement;
          i += number.length;
          continue;
        }
      }
      
      result += char;
      i++;
    }
    
    return result;
  }

  /**
   * Improve variable naming (simple version)
   */
  private improveNaming(code: string): { code: string; changes: CodeChange[] } {
    const changes: CodeChange[] = [];
    let transformedCode = code;

    const namingImprovements = [
      { from: 'temp', to: 'temporary' },
      { from: 'tmp', to: 'temporary' },
      { from: 'data', to: 'responseData' },
      { from: 'info', to: 'information' },
      { from: 'obj', to: 'object' },
      { from: 'arr', to: 'array' },
    ];

    namingImprovements.forEach(({ from, to }) => {
      // Only replace if the word appears as a standalone identifier (not in strings)
      const wordRegex = new RegExp(`\\b${from}\\b`, 'g');
      if (wordRegex.test(code)) {
        // Use the same string-aware replacement logic
        transformedCode = this.replaceWordOutsideStrings(transformedCode, from, to);
        changes.push({
          type: 'improve-naming',
          description: `Improved variable naming: ${from} → ${to}`,
          before: from,
          after: to,
        });
      }
    });

    return { code: transformedCode, changes };
  }

  /**
   * Replace a word with another word, but only outside of string literals
   */
  private replaceWordOutsideStrings(code: string, word: string, replacement: string): string {
    let result = '';
    let i = 0;
    let insideString = false;
    let stringChar = '';
    
    while (i < code.length) {
      const char = code[i];
      
      // Track string boundaries
      if (!insideString && (char === '"' || char === "'" || char === '`')) {
        insideString = true;
        stringChar = char;
        result += char;
        i++;
        continue;
      } else if (insideString && char === stringChar && code[i - 1] !== '\\') {
        insideString = false;
        stringChar = '';
        result += char;
        i++;
        continue;
      }
      
      // If we're not inside a string, check for the word pattern
      if (!insideString) {
        const remaining = code.substring(i);
        const wordRegex = new RegExp(`^\\b${word}\\b`);
        
        if (wordRegex.test(remaining)) {
          result += replacement;
          i += word.length;
          continue;
        }
      }
      
      result += char;
      i++;
    }
    
    return result;
  }

  /**
   * Simplify conditional expressions (simple version)
   */
  private simplifyConditionals(code: string): { code: string; changes: CodeChange[] } {
    const changes: CodeChange[] = [];
    let transformedCode = code;

    // Simplify === true comparisons
    const trueBooleanRegex = /(\w+)\s*===\s*true/g;
    if (trueBooleanRegex.test(code)) {
      transformedCode = transformedCode.replace(trueBooleanRegex, '$1');
      changes.push({
        type: 'simplify-conditional',
        description: 'Simplified boolean comparison (=== true)',
        before: 'condition === true',
        after: 'condition',
      });
    }

    // Simplify === false comparisons
    const falseBooleanRegex = /(\w+)\s*===\s*false/g;
    if (falseBooleanRegex.test(code)) {
      transformedCode = transformedCode.replace(falseBooleanRegex, '!$1');
      changes.push({
        type: 'simplify-conditional',
        description: 'Simplified boolean comparison (=== false)',
        before: 'condition === false',
        after: '!condition',
      });
    }

    return { code: transformedCode, changes };
  }

  /**
   * Remove unused imports (simple version)
   */
  private removeUnusedImports(code: string): { code: string; changes: CodeChange[] } {
    const changes: CodeChange[] = [];
    let transformedCode = code;

    // Find import statements
    const importRegex = /import\s+.*?\s+from\s+['"].*?['"];?\s*\n/g;
    const imports = code.match(importRegex) || [];

    imports.forEach(importStatement => {
      // Extract imported names (simplified)
      const nameMatch = importStatement.match(/import\s+(?:\{([^}]+)\}|(\w+))/);
      if (nameMatch) {
        const importedNames = nameMatch[1]
          ? nameMatch[1].split(',').map(name => name.trim())
          : [nameMatch[2]];

        // Check if any imported name is used in the code (excluding the import line itself)
        const codeWithoutImports = code.replace(importRegex, '');
        const unusedNames = importedNames.filter(
          name => !new RegExp(`\\b${name}\\b`).test(codeWithoutImports)
        );

        if (unusedNames.length > 0) {
          // Remove the entire import if all names are unused
          if (unusedNames.length === importedNames.length) {
            transformedCode = transformedCode.replace(importStatement, '');
            changes.push({
              type: 'remove-unused-import',
              description: `Removed unused import: ${importStatement.trim()}`,
              before: importStatement.trim(),
              after: '(removed)',
            });
          }
        }
      }
    });

    return { code: transformedCode, changes };
  }
}
