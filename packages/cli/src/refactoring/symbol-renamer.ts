import {
  Project,
  SourceFile,
  Node,
  SyntaxKind,
  Symbol,
  ReferencedSymbol,
  ReferenceEntry,
} from 'ts-morph';
import fs from 'fs';
import path from 'path';
import { Logger } from '../utils/logger.js';

export interface SymbolReference {
  filePath: string;
  position: {
    line: number;
    column: number;
    start: number;
    end: number;
  };
  text: string;
  kind: 'declaration' | 'reference' | 'import' | 'export';
  context: {
    nodeType: string;
    parentType?: string;
    isInStringLiteral: boolean;
    isInComment: boolean;
  };
}

export interface SymbolInfo {
  name: string;
  kind:
    | 'variable'
    | 'function'
    | 'class'
    | 'interface'
    | 'type'
    | 'enum'
    | 'namespace'
    | 'property'
    | 'method';
  scope: 'local' | 'module' | 'global';
  declarationFile: string;
  declarationPosition: {
    line: number;
    column: number;
  };
  references: SymbolReference[];
  exports: SymbolReference[];
  imports: SymbolReference[];
}

export interface RenameOperation {
  symbol: SymbolInfo;
  newName: string;
  changes: RenameChange[];
  conflicts: RenameConflict[];
  impact: {
    filesAffected: number;
    referencesUpdated: number;
    importsUpdated: number;
    exportsUpdated: number;
  };
}

export interface RenameChange {
  filePath: string;
  position: {
    start: number;
    end: number;
    line: number;
    column: number;
  };
  originalText: string;
  newText: string;
  changeType: 'declaration' | 'reference' | 'import' | 'export' | 'string-literal';
  confidence: number; // 0-100
}

export interface RenameConflict {
  type: 'name-collision' | 'scope-shadowing' | 'reserved-word' | 'import-conflict';
  severity: 'error' | 'warning' | 'info';
  message: string;
  location?: {
    filePath: string;
    line: number;
    column: number;
  };
  suggestion?: string;
}

export interface RenameValidation {
  valid: boolean;
  conflicts: RenameConflict[];
  warnings: string[];
  suggestions: string[];
}

export interface RenameOptions {
  includeComments?: boolean;
  includeStringLiterals?: boolean;
  updateImports?: boolean;
  updateExports?: boolean;
  preserveCase?: boolean;
  dryRun?: boolean;
  createBackup?: boolean;
}

export class SymbolRenamer {
  private logger: Logger;
  private project: Project;
  private reservedWords = new Set([
    // JavaScript reserved words
    'break',
    'case',
    'catch',
    'class',
    'const',
    'continue',
    'debugger',
    'default',
    'delete',
    'do',
    'else',
    'export',
    'extends',
    'finally',
    'for',
    'function',
    'if',
    'import',
    'in',
    'instanceof',
    'new',
    'return',
    'super',
    'switch',
    'this',
    'throw',
    'try',
    'typeof',
    'var',
    'void',
    'while',
    'with',
    'yield',
    // TypeScript reserved words
    'abstract',
    'any',
    'as',
    'asserts',
    'bigint',
    'boolean',
    'constructor',
    'declare',
    'get',
    'infer',
    'intrinsic',
    'is',
    'keyof',
    'module',
    'namespace',
    'never',
    'number',
    'object',
    'readonly',
    'require',
    'set',
    'string',
    'symbol',
    'type',
    'undefined',
    'unique',
    'unknown',
  ]);

  constructor(logger: Logger) {
    this.logger = logger;
    this.project = new Project({
      useInMemoryFileSystem: false, // Use real file system for cross-file analysis
      compilerOptions: {
        target: 99, // Latest
        module: 99, // ESNext
        strict: false,
        allowJs: true,
        checkJs: false,
        declaration: true,
        skipLibCheck: true,
      },
    });
  }

  /**
   * Analyze symbol and find all references
   */
  async analyzeSymbol(
    filePath: string,
    symbolName: string,
    position?: { line: number; column: number }
  ): Promise<SymbolInfo | null> {
    this.logger.info('Analyzing symbol', { filePath, symbolName, position });

    try {
      // Add file to project
      const sourceFile = this.project.addSourceFileAtPath(filePath);

      // Find the symbol
      let targetNode: Node | undefined;

      if (position) {
        // Find symbol at specific position
        const pos = sourceFile.getPos() + (position.line - 1) * 100 + position.column; // Simplified position calculation
        targetNode = sourceFile.getDescendantAtPos(pos);
      } else {
        // Find first occurrence of symbol name
        targetNode = sourceFile.getFirstDescendant(
          node => Node.isIdentifier(node) && node.getText() === symbolName
        );
      }

      if (!targetNode || !Node.isIdentifier(targetNode)) {
        this.logger.warn('Symbol not found', { filePath, symbolName, position });
        return null;
      }

      // Get symbol information
      const symbol = targetNode.getSymbol();
      if (!symbol) {
        this.logger.warn('No symbol information available', { filePath, symbolName });
        return null;
      }

      // Analyze symbol kind and scope
      const symbolInfo = await this.extractSymbolInfo(symbol, targetNode, sourceFile);

      // Find all references
      const references = await this.findAllReferences(symbol, targetNode);

      // Categorize references
      const { imports, exports, regularReferences } = this.categorizeReferences(references);

      const result: SymbolInfo = {
        name: symbolName,
        kind: symbolInfo.kind,
        scope: symbolInfo.scope,
        declarationFile: filePath,
        declarationPosition: {
          line: sourceFile.getLineAndColumnAtPos(targetNode.getStart()).line,
          column: sourceFile.getLineAndColumnAtPos(targetNode.getStart()).column,
        },
        references: regularReferences,
        exports,
        imports,
      };

      this.logger.info('Symbol analysis completed', {
        symbolName,
        kind: result.kind,
        scope: result.scope,
        references: result.references.length,
        imports: result.imports.length,
        exports: result.exports.length,
      });

      return result;
    } catch (error) {
      this.logger.error('Symbol analysis failed', {
        filePath,
        symbolName,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Plan rename operation
   */
  async planRename(
    symbolInfo: SymbolInfo,
    newName: string,
    options: RenameOptions = {}
  ): Promise<RenameOperation> {
    this.logger.info('Planning rename operation', {
      oldName: symbolInfo.name,
      newName,
      references: symbolInfo.references.length,
    });

    // Validate new name
    const validation = this.validateNewName(newName, symbolInfo);

    // Generate changes
    const changes = await this.generateRenameChanges(symbolInfo, newName, options);

    // Calculate impact
    const impact = this.calculateRenameImpact(changes);

    const operation: RenameOperation = {
      symbol: symbolInfo,
      newName,
      changes,
      conflicts: validation.conflicts,
      impact,
    };

    this.logger.info('Rename operation planned', {
      oldName: symbolInfo.name,
      newName,
      filesAffected: impact.filesAffected,
      totalChanges: changes.length,
      conflicts: validation.conflicts.length,
    });

    return operation;
  }

  /**
   * Execute rename operation
   */
  async executeRename(operation: RenameOperation, options: RenameOptions = {}): Promise<boolean> {
    this.logger.info('Executing rename operation', {
      oldName: operation.symbol.name,
      newName: operation.newName,
      changes: operation.changes.length,
      dryRun: options.dryRun,
    });

    // Check for blocking conflicts
    const blockingConflicts = operation.conflicts.filter(c => c.severity === 'error');
    if (blockingConflicts.length > 0) {
      this.logger.error('Cannot execute rename due to conflicts', {
        conflicts: blockingConflicts.length,
      });
      return false;
    }

    try {
      // Create backups if requested
      if (options.createBackup && !options.dryRun) {
        await this.createBackups(operation.changes);
      }

      // Group changes by file
      const changesByFile = this.groupChangesByFile(operation.changes);

      // Apply changes to each file
      for (const [filePath, fileChanges] of changesByFile.entries()) {
        if (options.dryRun) {
          this.logger.info('Would apply changes to file', {
            filePath,
            changes: fileChanges.length,
          });
          continue;
        }

        await this.applyChangesToFile(filePath, fileChanges);
      }

      this.logger.success('Rename operation completed', {
        oldName: operation.symbol.name,
        newName: operation.newName,
        filesModified: changesByFile.size,
        totalChanges: operation.changes.length,
      });

      return true;
    } catch (error) {
      this.logger.error('Rename operation failed', {
        oldName: operation.symbol.name,
        newName: operation.newName,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Validate rename operation
   */
  validateRename(
    symbolInfo: SymbolInfo,
    newName: string,
    options: RenameOptions = {}
  ): RenameValidation {
    const conflicts: RenameConflict[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // Check if new name is valid
    const nameValidation = this.validateNewName(newName, symbolInfo);
    conflicts.push(...nameValidation.conflicts);

    // Check for scope conflicts
    const scopeConflicts = this.checkScopeConflicts(symbolInfo, newName);
    conflicts.push(...scopeConflicts);

    // Check import/export impacts
    if (symbolInfo.exports.length > 0) {
      warnings.push(`Renaming will affect ${symbolInfo.exports.length} export(s)`);
    }

    if (symbolInfo.imports.length > 0) {
      warnings.push(`Renaming will affect ${symbolInfo.imports.length} import(s)`);
    }

    // Generate suggestions
    if (newName.length < 3) {
      suggestions.push('Consider using a more descriptive name (3+ characters)');
    }

    if (!/^[a-z]/.test(newName) && symbolInfo.kind === 'variable') {
      suggestions.push('Variable names should start with lowercase letter');
    }

    if (!/^[A-Z]/.test(newName) && ['class', 'interface', 'type'].includes(symbolInfo.kind)) {
      suggestions.push('Type names should start with uppercase letter');
    }

    return {
      valid: conflicts.filter(c => c.severity === 'error').length === 0,
      conflicts,
      warnings,
      suggestions,
    };
  }

  /**
   * Extract symbol information
   */
  private async extractSymbolInfo(
    symbol: Symbol,
    node: Node,
    sourceFile: SourceFile
  ): Promise<{ kind: SymbolInfo['kind']; scope: SymbolInfo['scope'] }> {
    // Determine symbol kind
    let kind: SymbolInfo['kind'] = 'variable';

    const declarations = symbol.getDeclarations();
    if (declarations.length > 0) {
      const firstDecl = declarations[0];

      if (Node.isFunctionDeclaration(firstDecl)) {
        kind = 'function';
      } else if (Node.isClassDeclaration(firstDecl)) {
        kind = 'class';
      } else if (Node.isInterfaceDeclaration(firstDecl)) {
        kind = 'interface';
      } else if (Node.isTypeAliasDeclaration(firstDecl)) {
        kind = 'type';
      } else if (Node.isEnumDeclaration(firstDecl)) {
        kind = 'enum';
      } else if (Node.isModuleDeclaration(firstDecl)) {
        kind = 'namespace';
      } else if (Node.isMethodDeclaration(firstDecl)) {
        kind = 'method';
      } else if (Node.isPropertyDeclaration(firstDecl) || Node.isPropertySignature(firstDecl)) {
        kind = 'property';
      }
    }

    // Determine scope
    let scope: SymbolInfo['scope'] = 'local';

    // Check if symbol is exported
    const isExported =
      declarations.some(decl => {
        const modifiers = (decl as any).getModifiers?.() || [];
        return modifiers.some((m: any) => m.getKind() === SyntaxKind.ExportKeyword);
      }) || sourceFile.getExportedDeclarations().has(symbol.getName());

    if (isExported) {
      scope = 'module';
    }

    // Check if it's a global symbol (simplified check)
    const isGlobal = declarations.some(decl => {
      const parent = decl.getParent();
      return Node.isSourceFile(parent);
    });

    if (isGlobal && isExported) {
      scope = 'global';
    }

    return { kind, scope };
  }

  /**
   * Find all references to a symbol
   */
  private async findAllReferences(symbol: Symbol, node: Node): Promise<SymbolReference[]> {
    const references: SymbolReference[] = [];

    try {
      // Simplified reference finding - in practice would use language service
      const referencedSymbols: Node[] = [];

      // Find references in current file (simplified)
      const sourceFile = node.getSourceFile();
      const symbolName = node.getText();

      sourceFile.forEachDescendant(descendant => {
        if (Node.isIdentifier(descendant) && descendant.getText() === symbolName) {
          referencedSymbols.push(descendant);
        }
      });

      for (const referenceNode of referencedSymbols) {
        const sourceFile = referenceNode.getSourceFile();
        const position = sourceFile.getLineAndColumnAtPos(referenceNode.getStart());

        references.push({
          filePath: sourceFile.getFilePath(),
          position: {
            line: position.line,
            column: position.column,
            start: referenceNode.getStart(),
            end: referenceNode.getEnd(),
          },
          text: referenceNode.getText(),
          kind: this.determineReferenceKindFromNode(referenceNode),
          context: {
            nodeType: referenceNode.getKindName(),
            parentType: referenceNode.getParent()?.getKindName(),
            isInStringLiteral: this.isInStringLiteral(referenceNode),
            isInComment: this.isInComment(referenceNode),
          },
        });
      }
    } catch (error) {
      this.logger.warn('Failed to find all references', { error });
    }

    return references;
  }

  /**
   * Categorize references into imports, exports, and regular references
   */
  private categorizeReferences(references: SymbolReference[]): {
    imports: SymbolReference[];
    exports: SymbolReference[];
    regularReferences: SymbolReference[];
  } {
    const imports: SymbolReference[] = [];
    const exports: SymbolReference[] = [];
    const regularReferences: SymbolReference[] = [];

    for (const ref of references) {
      if (ref.kind === 'import') {
        imports.push(ref);
      } else if (ref.kind === 'export') {
        exports.push(ref);
      } else {
        regularReferences.push(ref);
      }
    }

    return { imports, exports, regularReferences };
  }

  /**
   * Determine the kind of reference from node
   */
  private determineReferenceKindFromNode(node: Node): SymbolReference['kind'] {
    const parent = node.getParent();

    // Check if it's in an import statement
    if (Node.isImportDeclaration(parent) || Node.isImportSpecifier(parent)) {
      return 'import';
    }

    // Check if it's in an export statement
    if (Node.isExportDeclaration(parent) || Node.isExportSpecifier(parent)) {
      return 'export';
    }

    // Check if it's a declaration (simplified check)
    if (
      Node.isFunctionDeclaration(parent) ||
      Node.isVariableDeclaration(parent) ||
      Node.isClassDeclaration(parent) ||
      Node.isInterfaceDeclaration(parent)
    ) {
      return 'declaration';
    }

    return 'reference';
  }

  /**
   * Check if node is inside a string literal
   */
  private isInStringLiteral(node: Node): boolean {
    let current = node.getParent();
    while (current) {
      if (Node.isStringLiteral(current) || Node.isTemplateExpression(current)) {
        return true;
      }
      current = current.getParent();
    }
    return false;
  }

  /**
   * Check if node is inside a comment
   */
  private isInComment(node: Node): boolean {
    // This is a simplified check - in practice would need more sophisticated comment detection
    const sourceFile = node.getSourceFile();
    const fullText = sourceFile.getFullText();
    const start = node.getStart();

    // Check if position is within any comment ranges
    const commentRanges = sourceFile.getLeadingCommentRanges() || [];
    return commentRanges.some(range => start >= range.getPos() && start <= range.getEnd());
  }

  /**
   * Validate new name
   */
  private validateNewName(
    newName: string,
    symbolInfo: SymbolInfo
  ): { conflicts: RenameConflict[] } {
    const conflicts: RenameConflict[] = [];

    // Check if it's a reserved word
    if (this.reservedWords.has(newName)) {
      conflicts.push({
        type: 'reserved-word',
        severity: 'error',
        message: `"${newName}" is a reserved word and cannot be used as an identifier`,
        suggestion: `Try "${newName}_" or "${newName}Value" instead`,
      });
    }

    // Check if it's a valid identifier
    if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(newName)) {
      conflicts.push({
        type: 'name-collision',
        severity: 'error',
        message: `"${newName}" is not a valid JavaScript identifier`,
        suggestion:
          'Use only letters, numbers, underscore, and dollar sign. Must start with letter, underscore, or dollar sign.',
      });
    }

    // Check if name is too similar to original (potential typo)
    if (this.calculateSimilarity(symbolInfo.name, newName) > 0.8 && symbolInfo.name !== newName) {
      conflicts.push({
        type: 'name-collision',
        severity: 'warning',
        message: `"${newName}" is very similar to "${symbolInfo.name}" - this might be a typo`,
        suggestion: 'Double-check that this is the intended new name',
      });
    }

    return { conflicts };
  }

  /**
   * Check for scope conflicts
   */
  private checkScopeConflicts(symbolInfo: SymbolInfo, newName: string): RenameConflict[] {
    const conflicts: RenameConflict[] = [];

    // This would need more sophisticated scope analysis
    // For now, just check for common naming conflicts

    if (newName === 'constructor' && symbolInfo.kind === 'method') {
      conflicts.push({
        type: 'name-collision',
        severity: 'warning',
        message: 'Renaming to "constructor" will create a constructor method',
        suggestion: 'Ensure this is intended behavior',
      });
    }

    return conflicts;
  }

  /**
   * Generate rename changes
   */
  private async generateRenameChanges(
    symbolInfo: SymbolInfo,
    newName: string,
    options: RenameOptions
  ): Promise<RenameChange[]> {
    const changes: RenameChange[] = [];

    // Add changes for all references
    for (const ref of symbolInfo.references) {
      // Skip if in comments and not requested
      if (ref.context.isInComment && !options.includeComments) {
        continue;
      }

      // Skip if in string literals and not requested
      if (ref.context.isInStringLiteral && !options.includeStringLiterals) {
        continue;
      }

      changes.push({
        filePath: ref.filePath,
        position: {
          start: ref.position.start,
          end: ref.position.end,
          line: ref.position.line,
          column: ref.position.column,
        },
        originalText: ref.text,
        newText: newName,
        changeType: ref.kind,
        confidence: this.calculateChangeConfidence(ref, options),
      });
    }

    // Add changes for imports if requested
    if (options.updateImports) {
      for (const imp of symbolInfo.imports) {
        changes.push({
          filePath: imp.filePath,
          position: {
            start: imp.position.start,
            end: imp.position.end,
            line: imp.position.line,
            column: imp.position.column,
          },
          originalText: imp.text,
          newText: newName,
          changeType: 'import',
          confidence: 95,
        });
      }
    }

    // Add changes for exports if requested
    if (options.updateExports) {
      for (const exp of symbolInfo.exports) {
        changes.push({
          filePath: exp.filePath,
          position: {
            start: exp.position.start,
            end: exp.position.end,
            line: exp.position.line,
            column: exp.position.column,
          },
          originalText: exp.text,
          newText: newName,
          changeType: 'export',
          confidence: 95,
        });
      }
    }

    return changes;
  }

  /**
   * Calculate change confidence
   */
  private calculateChangeConfidence(ref: SymbolReference, options: RenameOptions): number {
    let confidence = 90;

    // Lower confidence for string literals and comments
    if (ref.context.isInStringLiteral) {
      confidence -= 20;
    }

    if (ref.context.isInComment) {
      confidence -= 10;
    }

    // Higher confidence for declarations and direct references
    if (ref.kind === 'declaration') {
      confidence = 100;
    }

    return Math.max(50, confidence);
  }

  /**
   * Calculate rename impact
   */
  private calculateRenameImpact(changes: RenameChange[]): RenameOperation['impact'] {
    const filesAffected = new Set(changes.map(c => c.filePath)).size;
    const referencesUpdated = changes.filter(c => c.changeType === 'reference').length;
    const importsUpdated = changes.filter(c => c.changeType === 'import').length;
    const exportsUpdated = changes.filter(c => c.changeType === 'export').length;

    return {
      filesAffected,
      referencesUpdated,
      importsUpdated,
      exportsUpdated,
    };
  }

  /**
   * Create backups of files that will be modified
   */
  private async createBackups(changes: RenameChange[]): Promise<void> {
    const filesToBackup = new Set(changes.map(c => c.filePath));

    for (const filePath of filesToBackup) {
      const backupPath = `${filePath}.backup.${Date.now()}`;
      fs.copyFileSync(filePath, backupPath);
      this.logger.debug('Created backup', { original: filePath, backup: backupPath });
    }
  }

  /**
   * Group changes by file
   */
  private groupChangesByFile(changes: RenameChange[]): Map<string, RenameChange[]> {
    const grouped = new Map<string, RenameChange[]>();

    for (const change of changes) {
      if (!grouped.has(change.filePath)) {
        grouped.set(change.filePath, []);
      }
      grouped.get(change.filePath)!.push(change);
    }

    return grouped;
  }

  /**
   * Apply changes to a file
   */
  private async applyChangesToFile(filePath: string, changes: RenameChange[]): Promise<void> {
    let content = fs.readFileSync(filePath, 'utf8');

    // Sort changes by position (reverse order to maintain positions)
    const sortedChanges = changes.sort((a, b) => b.position.start - a.position.start);

    // Apply each change
    for (const change of sortedChanges) {
      const before = content.substring(0, change.position.start);
      const after = content.substring(change.position.end);
      content = before + change.newText + after;
    }

    fs.writeFileSync(filePath, content);
    this.logger.debug('Applied changes to file', { filePath, changes: changes.length });
  }

  /**
   * Calculate similarity between two strings
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  /**
   * Calculate Levenshtein distance
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1)
      .fill(null)
      .map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1, // deletion
          matrix[j - 1][i] + 1, // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        );
      }
    }

    return matrix[str2.length][str1.length];
  }
}
