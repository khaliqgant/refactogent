import { existsSync } from "fs";
import * as path from "path";
import { Node, SyntaxKind } from "ts-morph";
import {
  RefactorRenameSchema,
  RefactorRenameOutput,
} from "../types/index.js";
import { getRefactorContext } from "../context/index.js";

/**
 * RefactorRenameTool - Safe symbol renaming using ts-morph
 *
 * Uses ts-morph's built-in rename functionality to find all references
 * to a symbol and rename them across the entire project or within a file.
 * Returns a list of all files that would be modified.
 */
export class RefactorRenameTool {
  async execute(args: unknown) {
    const validated = RefactorRenameSchema.parse(args);
    const { filePath, symbolName, newName, scope } = validated;

    try {
      console.error(
        `[refactor_rename] Renaming ${symbolName} to ${newName} in ${filePath} (scope: ${scope})`
      );

      // Resolve absolute path
      const absolutePath = path.resolve(process.cwd(), filePath);
      if (!existsSync(absolutePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      // Use shared context
      const context = getRefactorContext();
      await context.initialize({
        rootPath: process.cwd(),
        includeTests: true,
      });

      const project = context.getProject();

      const sourceFile = project.getSourceFile(absolutePath);
      if (!sourceFile) {
        throw new Error(`Could not load source file: ${filePath}`);
      }

      // Find the symbol to rename
      const symbol = this.findSymbol(sourceFile, symbolName);
      if (!symbol) {
        throw new Error(`Could not find symbol '${symbolName}' in ${filePath}`);
      }

      console.error(`[refactor_rename] Found symbol at line ${symbol.getStartLineNumber()}`);

      // Find all references across the project
      const fileReferences = new Map<string, any[]>();
      const affectedFiles = new Set<string>();

      // Search through all files in the project
      const filesToSearch = scope === "file"
        ? [sourceFile]
        : project.getSourceFiles();

      for (const file of filesToSearch) {
        const identifiers = file.getDescendantsOfKind(SyntaxKind.Identifier);
        const matchingRefs = identifiers.filter((id) => id.getText() === symbolName);

        if (matchingRefs.length > 0) {
          const filePath = file.getFilePath();
          affectedFiles.add(filePath);
          fileReferences.set(filePath, matchingRefs);
        }
      }

      const totalReferences = Array.from(fileReferences.values()).reduce(
        (sum, refs) => sum + refs.length,
        0
      );

      const filesModified = Array.from(affectedFiles).map((f) =>
        path.relative(process.cwd(), f)
      );

      // Generate preview of changes
      const preview = this.generatePreview(
        fileReferences,
        symbolName,
        newName,
        scope === "file" ? absolutePath : undefined
      );

      console.error(
        `[refactor_rename] Found ${totalReferences} references across ${filesModified.length} file(s)`
      );

      const output: RefactorRenameOutput = {
        success: true,
        originalName: symbolName,
        newName,
        filesModified,
        totalReferences,
        scope,
        preview,
      };

      return {
        content: [
          {
            type: "text",
            text: this.formatOutput(output),
          },
        ],
      };
    } catch (error) {
      console.error("[refactor_rename] Error:", error);

      const output: RefactorRenameOutput = {
        success: false,
        originalName: symbolName,
        newName,
        filesModified: [],
        totalReferences: 0,
        scope,
        preview: "",
        error: error instanceof Error ? error.message : String(error),
      };

      return {
        content: [
          {
            type: "text",
            text: this.formatOutput(output),
          },
        ],
      };
    }
  }

  /**
   * Find a symbol by name in a source file
   */
  private findSymbol(sourceFile: any, symbolName: string): Node | null {
    // Try to find the symbol in various declarations

    // Functions
    const functions = sourceFile.getFunctions();
    for (const func of functions) {
      if (func.getName() === symbolName) {
        return func.getNameNode() || func;
      }
    }

    // Classes
    const classes = sourceFile.getClasses();
    for (const cls of classes) {
      if (cls.getName() === symbolName) {
        return cls.getNameNode() || cls;
      }
    }

    // Interfaces
    const interfaces = sourceFile.getInterfaces();
    for (const iface of interfaces) {
      if (iface.getName() === symbolName) {
        return iface.getNameNode() || iface;
      }
    }

    // Type aliases
    const typeAliases = sourceFile.getTypeAliases();
    for (const typeAlias of typeAliases) {
      if (typeAlias.getName() === symbolName) {
        return typeAlias.getNameNode() || typeAlias;
      }
    }

    // Enums
    const enums = sourceFile.getEnums();
    for (const enumDecl of enums) {
      if (enumDecl.getName() === symbolName) {
        return enumDecl.getNameNode() || enumDecl;
      }
    }

    // Variables
    const variableStatements = sourceFile.getVariableStatements();
    for (const varStmt of variableStatements) {
      for (const decl of varStmt.getDeclarations()) {
        if (decl.getName() === symbolName) {
          return decl.getNameNode() || decl;
        }
      }
    }

    // Try to find by identifier
    const identifiers = sourceFile.getDescendantsOfKind(262); // SyntaxKind.Identifier
    for (const identifier of identifiers) {
      if (identifier.getText() === symbolName) {
        return identifier;
      }
    }

    return null;
  }

  /**
   * Generate a preview of the rename operation
   */
  private generatePreview(
    fileReferences: Map<string, any[]>,
    oldName: string,
    newName: string,
    filePathFilter?: string
  ): string {
    let preview = "";

    const fileChanges = new Map<string, Array<{ line: number; text: string }>>();

    for (const [refFile, nodes] of fileReferences) {
      // Apply file filter if specified
      if (filePathFilter && refFile !== filePathFilter) {
        continue;
      }

      const relativePath = path.relative(process.cwd(), refFile);

      for (const node of nodes) {
        const lineNumber = node.getStartLineNumber();

        // Get the line text and highlight the change
        const fullLine = this.getLineText(node.getSourceFile(), lineNumber);
        const changedLine = fullLine.replace(
          new RegExp(`\\b${oldName}\\b`, "g"),
          newName
        );

        if (!fileChanges.has(relativePath)) {
          fileChanges.set(relativePath, []);
        }

        fileChanges.get(relativePath)!.push({
          line: lineNumber,
          text: changedLine,
        });
      }
    }

    // Format preview
    for (const [file, changes] of fileChanges) {
      preview += `\n**${file}**\n`;

      // Sort by line number and show up to 5 changes per file
      const sortedChanges = changes
        .sort((a, b) => a.line - b.line)
        .slice(0, 5);

      for (const change of sortedChanges) {
        preview += `  Line ${change.line}: ${change.text}\n`;
      }

      if (changes.length > 5) {
        preview += `  ... and ${changes.length - 5} more changes\n`;
      }
    }

    return preview;
  }

  /**
   * Get the text of a specific line
   */
  private getLineText(sourceFile: any, lineNumber: number): string {
    const lines = sourceFile.getFullText().split("\n");
    return lines[lineNumber - 1] || "";
  }

  /**
   * Format output for display
   */
  private formatOutput(output: RefactorRenameOutput): string {
    const {
      success,
      originalName,
      newName,
      filesModified,
      totalReferences,
      scope,
      preview,
      error,
    } = output;

    if (!success) {
      return `# Rename Failed ❌

**Error**: ${error}

Could not rename '${originalName}' to '${newName}'.
`;
    }

    let result = `# Symbol Rename Preview

## Details
- **Original Name**: \`${originalName}\`
- **New Name**: \`${newName}\`
- **Scope**: ${scope}
- **Total References**: ${totalReferences}
- **Files Affected**: ${filesModified.length}

`;

    if (filesModified.length > 0) {
      result += `## Affected Files\n\n`;
      for (const file of filesModified.slice(0, 20)) {
        result += `- ${file}\n`;
      }
      if (filesModified.length > 20) {
        result += `\n_... and ${filesModified.length - 20} more files_\n`;
      }
      result += "\n";
    }

    if (preview) {
      result += `## Preview of Changes\n${preview}\n`;
    }

    result += `## Next Steps

**Important**: This is a preview only. To apply the rename:

1. Use your IDE's built-in rename refactoring (recommended)
2. Or use \`refactor_execute_safe\` with the appropriate file changes

**Note**: IDE rename refactoring is safer as it understands language semantics better.
`;

    return result;
  }
}
