import * as fs from 'fs';
import * as path from 'path';
import { RefactorableFile } from './indexing.js';

/**
 * Configuration for type abstraction
 */
export interface TypeAbstractionConfig {
  rootPath: string;
  typesPath?: string;
  verbose?: boolean;
}

/**
 * Represents a type abstraction opportunity
 */
export interface TypeAbstractionResult {
  typeName: string;
  sourceFile: string;
  targetFile: string;
  typeContent: string;
  isCentralized: boolean;
  importStatements: string[];
  startLine: number;
  endLine: number;
}

/**
 * Results of type abstraction analysis
 */
export interface TypeAbstractionResults {
  centralized: TypeAbstractionResult[];
  local: TypeAbstractionResult[];
}

/**
 * Type Abstraction
 * ================
 * Type Abstraction should remove types from implementation files and move them to a separate file
 * It should first search for "interface" and "type" keywords and then check if they are used in the same file as an implementation
 * It should then check the codebase to see if the type is imported in other files
 * If it is, it should move the type to a separate file in a centralized location between the two, at the root level
 * that the most common files share
 * If it is not imported anywhere else it should move the type to a separate file in the same directory as the implementation file
 * but only if the file itself is 100 lines or more
 *
 * If a type is imported along with other things it should only move the type and leave the rest of the imports intact
 * If the type spreads across multiple lines it should move the entire type
 */
export class TypeAbstraction {
  private config: TypeAbstractionConfig;

  constructor(config: TypeAbstractionConfig) {
    this.config = {
      typesPath: 'src/types',
      ...config
    };
  }

  /**
   * Analyze files for type abstraction opportunities
   */
  async analyzeAbstractions(files: RefactorableFile[]): Promise<TypeAbstractionResults> {
    const results: TypeAbstractionResults = {
      centralized: [],
      local: []
    };

    try {
      // Filter to only TypeScript/JavaScript files
      const tsFiles = files.filter(file => 
        file.language === 'typescript' || file.language === 'javascript'
      );

      if (this.config.verbose) {
        console.log(`[TypeAbstraction] Analyzing ${tsFiles.length} TypeScript/JavaScript files for type abstraction opportunities`);
      }

      for (const file of tsFiles) {
        try {
          const fileResults = await this.analyzeFile(file);
          results.centralized.push(...fileResults.centralized);
          results.local.push(...fileResults.local);
        } catch (error) {
          if (this.config.verbose) {
            console.warn(`[TypeAbstraction] Failed to analyze file ${file.path}:`, error);
          }
        }
      }

      if (this.config.verbose) {
        console.log(`[TypeAbstraction] Found ${results.centralized.length} centralized and ${results.local.length} local abstraction opportunities`);
      }

    } catch (error) {
      console.error('[TypeAbstraction] Error during analysis:', error);
      throw new Error(`Type abstraction analysis failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return results;
  }

  /**
   * Check if a file is already a type-only file (shouldn't be abstracted further)
   */
  private isTypeOnlyFile(filePath: string): boolean {
    const fileName = path.basename(filePath);

    // Check for common type file patterns
    const typeFilePatterns = [
      /\.types\.tsx?$/,           // *.types.ts, *.types.tsx
      /\.d\.ts$/,                 // *.d.ts (declaration files)
      /^types\.tsx?$/,            // types.ts, types.tsx
      /^index\.types\.tsx?$/,     // index.types.ts
    ];

    return typeFilePatterns.some(pattern => pattern.test(fileName));
  }

  /**
   * Analyze a single file for type abstraction opportunities
   */
  private async analyzeFile(file: RefactorableFile): Promise<TypeAbstractionResults> {
    const results: TypeAbstractionResults = {
      centralized: [],
      local: []
    };

    try {
      // Skip files that are already type-only files
      if (this.isTypeOnlyFile(file.path)) {
        if (this.config.verbose) {
          console.log(`[TypeAbstraction] Skipping type-only file: ${file.path}`);
        }
        return results;
      }

      const content = await fs.promises.readFile(file.path, 'utf-8');

      // Basic validation to prevent "Invalid string length" errors
      if (!content || typeof content !== 'string') {
        if (this.config.verbose) {
          console.warn(`[TypeAbstraction] Invalid content for file ${file.path}`);
        }
        return results;
      }

      // Check if file is large enough for local abstraction (100+ lines)
      const lines = content.split('\n');
      const isLargeFile = lines.length >= 100;

      // Find type and interface definitions
      const typeMatches = this.findTypeDefinitions(content, file.path);
      
      for (const typeMatch of typeMatches) {
        // Check if type is used in other files
        const isUsedElsewhere = await this.isTypeUsedElsewhere(typeMatch.name, file.path);

        if (isUsedElsewhere) {
          // Centralized abstraction
          const targetFile = path.join(this.config.rootPath, this.config.typesPath!, `${typeMatch.name}.ts`);
          results.centralized.push({
            typeName: typeMatch.name,
            sourceFile: file.path,
            targetFile,
            typeContent: typeMatch.content,
            isCentralized: true,
            importStatements: [`import { ${typeMatch.name} } from './${this.config.typesPath!}/${typeMatch.name}';`],
            startLine: typeMatch.startLine,
            endLine: typeMatch.endLine
          });
        } else if (isLargeFile) {
          // Local abstraction
          const targetFile = path.join(path.dirname(file.path), `${typeMatch.name}.types.ts`);
          results.local.push({
            typeName: typeMatch.name,
            sourceFile: file.path,
            targetFile,
            typeContent: typeMatch.content,
            isCentralized: false,
            importStatements: [`import { ${typeMatch.name} } from './${typeMatch.name}.types';`],
            startLine: typeMatch.startLine,
            endLine: typeMatch.endLine
          });
        }
      }

    } catch (error) {
      if (this.config.verbose) {
        console.warn(`[TypeAbstraction] Error analyzing file ${file.path}:`, error);
      }
    }

    return results;
  }

  /**
   * Find type and interface definitions in file content
   */
  private findTypeDefinitions(content: string, filePath: string): Array<{name: string, content: string, startLine: number, endLine: number}> {
    const types: Array<{name: string, content: string, startLine: number, endLine: number}> = [];

    try {
      // More precise regex patterns for type and interface definitions
      // Match: export? interface TypeName { or export? type TypeName =
      // But NOT function declarations or other keywords
      const interfacePattern = /^(?!.*\bfunction\b).*(?:export\s+)?interface\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\{/;
      const typePattern = /^(?!.*\bfunction\b).*(?:export\s+)?type\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/;

      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Skip comments and empty lines
        if (line.startsWith('//') || line.startsWith('/*') || line.startsWith('*') || line.length === 0) {
          continue;
        }

        // Check for interface definitions
        let match = interfacePattern.exec(line);
        if (match) {
          const typeName = match[1];
          const result = this.extractTypeDefinition(content, i, typeName);
          if (result) {
            types.push({
              name: typeName,
              content: result.content,
              startLine: result.startLine,
              endLine: result.endLine
            });
          }
        }

        // Check for type definitions
        match = typePattern.exec(line);
        if (match) {
          const typeName = match[1];
          const result = this.extractTypeDefinition(content, i, typeName);
          if (result) {
            types.push({
              name: typeName,
              content: result.content,
              startLine: result.startLine,
              endLine: result.endLine
            });
          }
        }
      }
    } catch (error) {
      if (this.config.verbose) {
        console.warn(`[TypeAbstraction] Error finding type definitions in ${filePath}:`, error);
      }
    }

    return types;
  }

  /**
   * Extract the full type definition starting from a line
   */
  private extractTypeDefinition(content: string, startLine: number, typeName: string): { content: string; startLine: number; endLine: number } | null {
    try {
      const lines = content.split('\n');
      let typeContent = '';
      let braceCount = 0;
      let foundStart = false;
      let foundOpeningBrace = false;
      let inString = false;
      let stringChar = '';
      let endLine = startLine;

      for (let i = startLine; i < lines.length; i++) {
        const line = lines[i];

        if (!foundStart && line.includes(typeName)) {
          foundStart = true;
        }

        if (foundStart) {
          typeContent += line + '\n';
          endLine = i;

          // Count braces to find the end of the type definition, but ignore strings
          for (let j = 0; j < line.length; j++) {
            const char = line[j];
            const prevChar = j > 0 ? line[j - 1] : '';

            // Handle string literals
            if (!inString && (char === '"' || char === "'" || char === '`')) {
              inString = true;
              stringChar = char;
            } else if (inString && char === stringChar && prevChar !== '\\') {
              inString = false;
              stringChar = '';
            }

            // Only count braces when not in strings
            if (!inString) {
              if (char === '{') {
                braceCount++;
                foundOpeningBrace = true;
              }
              if (char === '}') {
                braceCount--;
              }
            }
          }

          // For interfaces: stop when we've closed all braces (braceCount reaches 0 after finding opening brace)
          // For type aliases without braces: stop at semicolon
          if (foundOpeningBrace && braceCount === 0) {
            break;
          } else if (!foundOpeningBrace && line.trim().endsWith(';')) {
            break;
          }
        }
      }

      let result = typeContent.trim();

      // Validate that this looks like a real type definition
      if (result && (result.includes('interface') || result.includes('type')) && result.includes(typeName)) {
        // Ensure the type has an export keyword
        if (!result.startsWith('export ')) {
          result = 'export ' + result;
        }

        return {
          content: result,
          startLine,
          endLine
        };
      }

      return null;
    } catch (error) {
      if (this.config.verbose) {
        console.warn(`[TypeAbstraction] Error extracting type definition for ${typeName}:`, error);
      }
      return null;
    }
  }

  /**
   * Check if a type is used in other files
   * Note: This is a simplified implementation that only checks local usage.
   * Cross-file type detection requires full project indexing.
   */
  private async isTypeUsedElsewhere(_typeName: string, _sourceFile: string): Promise<boolean> {
    // Currently not implemented - always returns false
    // Future enhancement: integrate with indexing system to search all project files
    return false;
  }

  /**
   * Resolve type dependencies across extracted .types.ts files
   * Finds references to other extracted types and adds imports
   */
  private async resolveTypeDependencies(abstractions: TypeAbstractionResult[]): Promise<void> {
    if (this.config.verbose) {
      console.log('[TypeAbstraction] Resolving type dependencies...');
    }

    // Build a map of type names to their target files
    const typeMap = new Map<string, string>();
    for (const abstraction of abstractions) {
      typeMap.set(abstraction.typeName, abstraction.targetFile);
    }

    // Process each extracted type file
    for (const abstraction of abstractions) {
      try {
        const content = await fs.promises.readFile(abstraction.targetFile, 'utf-8');
        const imports: string[] = [];

        // Find all type references in the content
        // Match identifier patterns that could be type references
        const typeReferencePattern = /\b([A-Z][a-zA-Z0-9_]*)\b/g;
        const matches = content.matchAll(typeReferencePattern);

        const referencedTypes = new Set<string>();
        for (const match of matches) {
          const referencedType = match[1];

          // Skip if it's the type being defined itself
          if (referencedType === abstraction.typeName) {
            continue;
          }

          // Check if this type was also extracted
          if (typeMap.has(referencedType)) {
            referencedTypes.add(referencedType);
          }
        }

        // Generate imports for referenced types
        for (const referencedType of referencedTypes) {
          const referencedFile = typeMap.get(referencedType)!;

          // Skip if it's the same file
          if (referencedFile === abstraction.targetFile) {
            continue;
          }

          // Calculate relative path
          const fromDir = path.dirname(abstraction.targetFile);
          let relativePath = path.relative(fromDir, referencedFile);

          // Ensure the path starts with ./ or ../
          if (!relativePath.startsWith('.')) {
            relativePath = './' + relativePath;
          }

          // Remove the .ts extension
          relativePath = relativePath.replace(/\.ts$/, '');

          imports.push(`import { ${referencedType} } from '${relativePath}';`);
        }

        // If we found imports, prepend them to the file
        if (imports.length > 0) {
          const updatedContent = imports.join('\n') + '\n\n' + content;
          await fs.promises.writeFile(abstraction.targetFile, updatedContent, 'utf-8');

          if (this.config.verbose) {
            console.log(`[TypeAbstraction] Added ${imports.length} import(s) to ${abstraction.targetFile}`);
          }
        }
      } catch (error) {
        if (this.config.verbose) {
          console.warn(`[TypeAbstraction] Failed to resolve dependencies for ${abstraction.targetFile}:`, error);
        }
      }
    }
  }

  /**
   * Apply type abstractions
   */
  async applyAbstractions(results: TypeAbstractionResults): Promise<void> {
    try {
      if (this.config.verbose) {
        console.log(`[TypeAbstraction] Applying ${results.centralized.length + results.local.length} type abstractions`);
      }

      // Combine all abstractions
      const allAbstractions = [...results.centralized, ...results.local];

      // Group abstractions by source file
      const bySourceFile = new Map<string, TypeAbstractionResult[]>();
      for (const abstraction of allAbstractions) {
        const existing = bySourceFile.get(abstraction.sourceFile) || [];
        existing.push(abstraction);
        bySourceFile.set(abstraction.sourceFile, existing);
      }

      // Process each file: sort by line number descending to avoid index shifts
      for (const [sourceFile, abstractions] of bySourceFile.entries()) {
        // Sort by startLine descending (process from bottom to top)
        const sorted = abstractions.sort((a, b) => b.startLine - a.startLine);

        if (this.config.verbose) {
          console.log(`[TypeAbstraction] Processing ${sorted.length} abstractions in ${sourceFile}`);
        }

        // Create all type files first
        for (const abstraction of sorted) {
          const targetDir = path.dirname(abstraction.targetFile);
          await fs.promises.mkdir(targetDir, { recursive: true });
          await fs.promises.writeFile(abstraction.targetFile, abstraction.typeContent, 'utf-8');

          if (this.config.verbose) {
            console.log(`[TypeAbstraction] Created type file: ${abstraction.targetFile}`);
          }
        }

        // Then update the source file once with all changes
        await this.updateSourceFileWithMultipleAbstractions(sourceFile, sorted);
      }

      // After all files are created, resolve type dependencies
      await this.resolveTypeDependencies(allAbstractions);

      if (this.config.verbose) {
        console.log('[TypeAbstraction] Successfully applied all type abstractions');
      }
    } catch (error) {
      console.error('[TypeAbstraction] Error applying abstractions:', error);
      throw new Error(`Failed to apply type abstractions: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Apply a centralized type abstraction
   */
  private async applyCentralizedAbstraction(result: TypeAbstractionResult): Promise<void> {
    try {
      // Ensure the target directory exists
      const targetDir = path.dirname(result.targetFile);
      await fs.promises.mkdir(targetDir, { recursive: true });

      // Write the type file
      await fs.promises.writeFile(result.targetFile, result.typeContent, 'utf-8');

      if (this.config.verbose) {
        console.log(`[TypeAbstraction] Created centralized type file: ${result.targetFile}`);
      }

      // Update the source file: remove type and add import
      await this.updateSourceFile(result);
    } catch (error) {
      if (this.config.verbose) {
        console.warn(`[TypeAbstraction] Error applying centralized abstraction for ${result.typeName}:`, error);
      }
      throw error;
    }
  }

  /**
   * Apply a local type abstraction
   */
  private async applyLocalAbstraction(result: TypeAbstractionResult): Promise<void> {
    try {
      // Write the type file
      await fs.promises.writeFile(result.targetFile, result.typeContent, 'utf-8');

      if (this.config.verbose) {
        console.log(`[TypeAbstraction] Created local type file: ${result.targetFile}`);
      }

      // Update the source file: remove type and add import
      await this.updateSourceFile(result);
    } catch (error) {
      if (this.config.verbose) {
        console.warn(`[TypeAbstraction] Error applying local abstraction for ${result.typeName}:`, error);
      }
      throw error;
    }
  }

  /**
   * Update the source file to remove multiple types and add their import statements
   * Processing all abstractions from a file at once avoids line number shift issues
   */
  private async updateSourceFileWithMultipleAbstractions(sourceFile: string, abstractions: TypeAbstractionResult[]): Promise<void> {
    try {
      // Read the source file
      const content = await fs.promises.readFile(sourceFile, 'utf-8');
      let lines = content.split('\n');

      // Find where to insert imports (after last import)
      let importInsertIndex = 0;
      let lastImportIndex = -1;
      let inMultiLineImport = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (line.startsWith('import ') || line.startsWith('import{')) {
          lastImportIndex = i;
          if (line.includes('{') && !line.includes('}')) {
            inMultiLineImport = true;
          } else if (line.includes('{') && line.includes('}')) {
            inMultiLineImport = false;
          }
        } else if (inMultiLineImport) {
          lastImportIndex = i;
          if (line.includes('}')) {
            inMultiLineImport = false;
          }
        } else {
          if (lastImportIndex >= 0 && line.length > 0 && !line.startsWith('//') && !line.startsWith('/*')) {
            break;
          }
        }
      }

      if (lastImportIndex >= 0) {
        importInsertIndex = lastImportIndex + 1;
      }

      // Collect all imports and re-exports to add
      const importsToAdd: string[] = [];
      const typeImportsToAdd: string[] = [];

      for (const abstraction of abstractions) {
        const sourceDir = path.dirname(abstraction.sourceFile);
        const relativePath = path.relative(sourceDir, abstraction.targetFile);
        const importPath = relativePath.replace(/\.ts$/, '').replace(/\\/g, '/');
        const finalImportPath = importPath.startsWith('.') ? importPath : `./${importPath}`;

        // Check if the type was originally exported in the source file
        const originalLine = content.split('\n')[abstraction.startLine];
        const wasExported = originalLine.trim().startsWith('export ');

        // Always import the type for use within the file
        const importStatement = `import type { ${abstraction.typeName} } from '${finalImportPath}';`;
        typeImportsToAdd.push(importStatement);

        if (wasExported) {
          // Also re-export it using export type {} from syntax (required for isolatedModules)
          const exportStatement = `export type { ${abstraction.typeName} } from '${finalImportPath}';`;
          importsToAdd.push(exportStatement);
        }
      }

      // Combine type imports and re-exports
      importsToAdd.unshift(...typeImportsToAdd);

      // Remove type definitions (bottom to top, already sorted)
      for (const abstraction of abstractions) {
        lines = [
          ...lines.slice(0, abstraction.startLine),
          ...lines.slice(abstraction.endLine + 1)
        ];

        // Adjust import insert index if we removed lines before it
        if (abstraction.endLine < importInsertIndex) {
          const linesRemoved = abstraction.endLine - abstraction.startLine + 1;
          importInsertIndex -= linesRemoved;
        }
      }

      // Insert all imports
      lines.splice(importInsertIndex, 0, ...importsToAdd);

      // Write back
      const updatedContent = lines.join('\n');
      await fs.promises.writeFile(sourceFile, updatedContent, 'utf-8');

      if (this.config.verbose) {
        console.log(`[TypeAbstraction] Updated source file: ${sourceFile}`);
        for (const abstraction of abstractions) {
          console.log(`[TypeAbstraction] - Removed type "${abstraction.typeName}" (lines ${abstraction.startLine}-${abstraction.endLine})`);
        }
        console.log(`[TypeAbstraction] - Added ${importsToAdd.length} imports`);
      }
    } catch (error) {
      if (this.config.verbose) {
        console.warn(`[TypeAbstraction] Error updating source file ${sourceFile}:`, error);
      }
      throw error;
    }
  }

  /**
   * Update the source file to remove the type and add the import statement
   * @deprecated Use updateSourceFileWithMultipleAbstractions instead
   */
  private async updateSourceFile(result: TypeAbstractionResult): Promise<void> {
    try {
      // Read the source file
      const content = await fs.promises.readFile(result.sourceFile, 'utf-8');
      const lines = content.split('\n');

      // Calculate the relative path from source file to target file
      const sourceDir = path.dirname(result.sourceFile);
      const relativePath = path.relative(sourceDir, result.targetFile);
      // Remove the .ts extension and normalize the path
      const importPath = relativePath.replace(/\.ts$/, '').replace(/\\/g, '/');
      const finalImportPath = importPath.startsWith('.') ? importPath : `./${importPath}`;

      const importStatement = `import { ${result.typeName} } from '${finalImportPath}';`;

      // Find the right place to insert the import statement BEFORE removing lines
      // Insert after existing imports or at the top of the file
      let importInsertIndex = 0;
      let lastImportIndex = -1;
      let inMultiLineImport = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Check if this line starts an import
        if (line.startsWith('import ') || line.startsWith('import{')) {
          lastImportIndex = i;
          // Check if it's a multi-line import (has opening brace but no closing brace)
          if (line.includes('{') && !line.includes('}')) {
            inMultiLineImport = true;
          } else if (line.includes('{') && line.includes('}')) {
            // Single line import with braces
            inMultiLineImport = false;
          }
        } else if (inMultiLineImport) {
          // We're inside a multi-line import, keep tracking
          lastImportIndex = i;
          if (line.includes('}')) {
            // Found the closing brace, end of multi-line import
            inMultiLineImport = false;
          }
        } else {
          // Not in an import anymore
          // Stop searching after we've passed the imports section
          if (lastImportIndex >= 0 && line.length > 0 && !line.startsWith('//') && !line.startsWith('/*')) {
            break;
          }
        }
      }

      if (lastImportIndex >= 0) {
        importInsertIndex = lastImportIndex + 1;
      }

      // Check if the import already exists or if there's already an import from the same file
      const existingImport = lines.find(line => line.includes(`from '${finalImportPath}'`));

      let updatedLines: string[];

      if (existingImport) {
        // Merge with existing import instead of adding a new one
        const existingImportIndex = lines.findIndex(line => line.includes(`from '${finalImportPath}'`));
        const existingImportLine = lines[existingImportIndex];

        // Extract existing imports
        const importMatch = existingImportLine.match(/import\s*\{([^}]+)\}\s*from/);
        if (importMatch) {
          const existingImports = importMatch[1].split(',').map(s => s.trim()).filter(s => s.length > 0);

          // Add new type to existing imports if not already present
          if (!existingImports.includes(result.typeName)) {
            existingImports.push(result.typeName);
            const mergedImportStatement = `import { ${existingImports.join(', ')} } from '${finalImportPath}';`;

            // Replace the existing import line
            lines[existingImportIndex] = mergedImportStatement;
          }
        }

        // Remove the type definition lines
        updatedLines = [
          ...lines.slice(0, result.startLine),
          ...lines.slice(result.endLine + 1)
        ];
      } else {
        // Insert new import and remove type definition
        // We need to handle the case where importInsertIndex might be affected by the removal

        if (importInsertIndex <= result.startLine) {
          // Import is before the type definition, so insert first, then remove
          const withImport = [
            ...lines.slice(0, importInsertIndex),
            importStatement,
            ...lines.slice(importInsertIndex)
          ];

          // Now remove the type definition (adjust indices for the inserted line)
          updatedLines = [
            ...withImport.slice(0, result.startLine + 1),
            ...withImport.slice(result.endLine + 2)
          ];
        } else {
          // Import is after the type definition, so remove first, then insert
          const withoutType = [
            ...lines.slice(0, result.startLine),
            ...lines.slice(result.endLine + 1)
          ];

          // Calculate the adjusted import index
          const linesRemoved = result.endLine - result.startLine + 1;
          const adjustedImportIndex = importInsertIndex - linesRemoved;

          updatedLines = [
            ...withoutType.slice(0, adjustedImportIndex),
            importStatement,
            ...withoutType.slice(adjustedImportIndex)
          ];
        }
      }

      // Write the updated content back to the source file
      const updatedContent = updatedLines.join('\n');
      await fs.promises.writeFile(result.sourceFile, updatedContent, 'utf-8');

      if (this.config.verbose) {
        console.log(`[TypeAbstraction] Updated source file: ${result.sourceFile}`);
        console.log(`[TypeAbstraction] - Removed type "${result.typeName}" (lines ${result.startLine}-${result.endLine})`);
        console.log(`[TypeAbstraction] - Added import: ${importStatement}`);
      }
    } catch (error) {
      if (this.config.verbose) {
        console.warn(`[TypeAbstraction] Error updating source file ${result.sourceFile}:`, error);
      }
      throw error;
    }
  }
}
