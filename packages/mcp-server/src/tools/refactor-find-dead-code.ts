import * as path from "path";
import * as fs from "fs";
import { SyntaxKind } from "ts-morph";
import { getRefactorContext } from "../context/index.js";

/**
 * Represents a dead code finding
 */
interface DeadCodeFinding {
  id: string;
  type: "unused-export" | "unreachable-code" | "unused-import" | "unused-function" | "unused-variable";
  severity: "high" | "medium" | "low";
  file: string;
  location: {
    startLine: number;
    endLine: number;
    symbolName?: string;
  };
  description: string;
  suggestion: string;
  confidence: "high" | "medium" | "low";
}

/**
 * Analysis result for dead code detection
 */
interface DeadCodeAnalysisResult {
  summary: {
    totalFiles: number;
    totalFindings: number;
    highConfidence: number;
    mediumConfidence: number;
    lowConfidence: number;
    byType: {
      unusedExports: number;
      unreachableCode: number;
      unusedImports: number;
      unusedFunctions: number;
      unusedVariables: number;
    };
  };
  findings: DeadCodeFinding[];
  recommendations: string[];
  safeToRemove: string[];
}

/**
 * RefactorFindDeadCodeTool - Entry-point based reachability analysis
 *
 * Analyzes the codebase to find unused exports, unreachable code, and other
 * dead code that can be safely removed. Uses entry points to determine what's
 * actually reachable in the application.
 */
export class RefactorFindDeadCodeTool {
  async execute(args: unknown) {
    const { entryPoints, includeTests } = args as {
      entryPoints: string[];
      includeTests?: boolean;
    };

    try {
      console.error(`[refactor_find_dead_code] Analyzing dead code with ${entryPoints.length} entry point(s)`);

      // Resolve entry points to absolute paths
      const absoluteEntryPoints = entryPoints.map(ep => path.resolve(process.cwd(), ep));

      // Validate entry points exist
      for (const ep of absoluteEntryPoints) {
        if (!fs.existsSync(ep)) {
          throw new Error(`Entry point not found: ${ep}`);
        }
      }

      // Get context
      const context = getRefactorContext();
      await context.initialize({
        rootPath: process.cwd(),
        includeTests: includeTests ?? true,
      });

      const indexedFiles = context.getIndexedFiles();
      const project = context.getProject();

      console.error(`[refactor_find_dead_code] Analyzing ${indexedFiles.length} indexed files`);

      const findings: DeadCodeFinding[] = [];
      let findingId = 1;

      // Track which symbols are actually used
      const usedSymbols = new Set<string>();
      const usedFiles = new Set<string>();

      // Step 1: Traverse from entry points to find reachable code
      const reachableFiles = this.findReachableFiles(project, absoluteEntryPoints);
      reachableFiles.forEach(f => usedFiles.add(f));

      console.error(`[refactor_find_dead_code] Found ${reachableFiles.size} reachable files`);

      // Step 2: Find all exported symbols in the codebase
      const allExports = new Map<string, Array<{ name: string; line: number; file: string }>>();

      for (const file of indexedFiles) {
        if (!["typescript", "javascript"].includes(file.language)) {
          continue;
        }

        const sourceFile = project.getSourceFile(file.path);
        if (!sourceFile) continue;

        const exports: Array<{ name: string; line: number; file: string }> = [];

        // Get all exported declarations
        const exportedDeclarations = sourceFile.getExportedDeclarations();

        exportedDeclarations.forEach((declarations, name) => {
          declarations.forEach(decl => {
            exports.push({
              name,
              line: decl.getStartLineNumber(),
              file: file.path,
            });
          });
        });

        if (exports.length > 0) {
          allExports.set(file.path, exports);
        }
      }

      // Step 3: Find imports to determine what's actually used
      for (const filePath of reachableFiles) {
        const sourceFile = project.getSourceFile(filePath);
        if (!sourceFile) continue;

        // Track imported symbols
        const importDeclarations = sourceFile.getImportDeclarations();
        for (const importDecl of importDeclarations) {
          const namedImports = importDecl.getNamedImports();
          namedImports.forEach(ni => {
            usedSymbols.add(ni.getName());
          });

          const defaultImport = importDecl.getDefaultImport();
          if (defaultImport) {
            usedSymbols.add(defaultImport.getText());
          }

          const namespaceImport = importDecl.getNamespaceImport();
          if (namespaceImport) {
            usedSymbols.add(namespaceImport.getText());
          }
        }

        // Track symbol references in the file
        const identifiers = sourceFile.getDescendantsOfKind(SyntaxKind.Identifier);
        identifiers.forEach(id => {
          usedSymbols.add(id.getText());
        });
      }

      // Step 4: Find unused exports
      for (const [filePath, exports] of allExports) {
        // Skip if file is an entry point
        if (absoluteEntryPoints.includes(filePath)) {
          continue;
        }

        // Skip if file is not reachable
        if (!reachableFiles.has(filePath)) {
          // The entire file is unreachable - high confidence it's dead code
          findings.push({
            id: `finding-${findingId++}`,
            type: "unused-export",
            severity: "high",
            file: path.relative(process.cwd(), filePath),
            location: {
              startLine: 1,
              endLine: 1,
            },
            description: `File is not imported by any reachable code`,
            suggestion: "Consider removing this file if it's not needed",
            confidence: "high",
          });
          continue;
        }

        // Check individual exports
        for (const exp of exports) {
          if (!usedSymbols.has(exp.name)) {
            findings.push({
              id: `finding-${findingId++}`,
              type: "unused-export",
              severity: "medium",
              file: path.relative(process.cwd(), exp.file),
              location: {
                startLine: exp.line,
                endLine: exp.line,
                symbolName: exp.name,
              },
              description: `Export '${exp.name}' is not imported anywhere`,
              suggestion: "Remove this export or make it private",
              confidence: "high",
            });
          }
        }
      }

      // Step 5: Find unused imports
      for (const filePath of reachableFiles) {
        const sourceFile = project.getSourceFile(filePath);
        if (!sourceFile) continue;

        const importDeclarations = sourceFile.getImportDeclarations();
        for (const importDecl of importDeclarations) {
          const namedImports = importDecl.getNamedImports();

          for (const namedImport of namedImports) {
            const importName = namedImport.getName();

            // Check if this import is used anywhere in the file (excluding the import itself)
            const identifiers = sourceFile.getDescendantsOfKind(SyntaxKind.Identifier)
              .filter(id => id.getText() === importName && id !== namedImport.getNameNode());

            if (identifiers.length === 0) {
              findings.push({
                id: `finding-${findingId++}`,
                type: "unused-import",
                severity: "low",
                file: path.relative(process.cwd(), filePath),
                location: {
                  startLine: importDecl.getStartLineNumber(),
                  endLine: importDecl.getEndLineNumber(),
                  symbolName: importName,
                },
                description: `Import '${importName}' is never used`,
                suggestion: "Remove this unused import",
                confidence: "high",
              });
            }
          }
        }
      }

      // Generate summary
      const summary = {
        totalFiles: indexedFiles.length,
        totalFindings: findings.length,
        highConfidence: findings.filter(f => f.confidence === "high").length,
        mediumConfidence: findings.filter(f => f.confidence === "medium").length,
        lowConfidence: findings.filter(f => f.confidence === "low").length,
        byType: {
          unusedExports: findings.filter(f => f.type === "unused-export").length,
          unreachableCode: findings.filter(f => f.type === "unreachable-code").length,
          unusedImports: findings.filter(f => f.type === "unused-import").length,
          unusedFunctions: findings.filter(f => f.type === "unused-function").length,
          unusedVariables: findings.filter(f => f.type === "unused-variable").length,
        },
      };

      // Generate recommendations
      const recommendations: string[] = [];
      if (summary.byType.unusedImports > 0) {
        recommendations.push(`Remove ${summary.byType.unusedImports} unused import(s) to clean up dependencies`);
      }
      if (summary.byType.unusedExports > 0) {
        recommendations.push(`Review ${summary.byType.unusedExports} unused export(s) - they may be dead code`);
      }
      if (summary.highConfidence > 0) {
        recommendations.push(`Start with ${summary.highConfidence} high-confidence finding(s) for safe cleanup`);
      }
      if (findings.length === 0) {
        recommendations.push("No dead code detected! Your codebase is clean.");
      }

      // Generate safe-to-remove list (high confidence only)
      const safeToRemove = findings
        .filter(f => f.confidence === "high")
        .map(f => `${f.file}:${f.location.startLine}${f.location.symbolName ? ` (${f.location.symbolName})` : ""}`);

      const result: DeadCodeAnalysisResult = {
        summary,
        findings,
        recommendations,
        safeToRemove,
      };

      console.error(`[refactor_find_dead_code] Analysis complete. Found ${findings.length} finding(s)`);

      return {
        content: [
          {
            type: "text",
            text: this.formatOutput(result),
          },
        ],
      };
    } catch (error) {
      console.error("[refactor_find_dead_code] Error:", error);

      return {
        content: [
          {
            type: "text",
            text: `# Dead Code Analysis Failed ❌

**Error**: ${error instanceof Error ? error.message : String(error)}

Could not analyze dead code.
`,
          },
        ],
      };
    }
  }

  /**
   * Find all files reachable from entry points using DFS
   */
  private findReachableFiles(project: any, entryPoints: string[]): Set<string> {
    const reachable = new Set<string>();
    const visited = new Set<string>();
    const queue = [...entryPoints];

    while (queue.length > 0) {
      const filePath = queue.shift()!;

      if (visited.has(filePath)) {
        continue;
      }

      visited.add(filePath);
      reachable.add(filePath);

      const sourceFile = project.getSourceFile(filePath);
      if (!sourceFile) continue;

      // Get all imports from this file
      const importDeclarations = sourceFile.getImportDeclarations();
      for (const importDecl of importDeclarations) {
        const moduleSpecifier = importDecl.getModuleSpecifierValue();

        // Skip node_modules
        if (!moduleSpecifier.startsWith('.') && !moduleSpecifier.startsWith('/')) {
          continue;
        }

        // Resolve the imported file
        const importedFile = this.resolveImport(filePath, moduleSpecifier);
        if (importedFile && !visited.has(importedFile)) {
          queue.push(importedFile);
        }
      }
    }

    return reachable;
  }

  /**
   * Resolve an import specifier to an absolute file path
   */
  private resolveImport(fromFile: string, specifier: string): string | null {
    const dir = path.dirname(fromFile);
    const resolved = path.resolve(dir, specifier);

    // Try different extensions
    const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'];

    for (const ext of extensions) {
      const candidate = resolved + ext;
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  /**
   * Format output for display
   */
  private formatOutput(result: DeadCodeAnalysisResult): string {
    const { summary, findings, recommendations, safeToRemove } = result;

    let output = `# Dead Code Analysis

## Summary
**Files Analyzed**: ${summary.totalFiles}
**Total Findings**: ${summary.totalFindings}
**By Confidence**:
- 🔴 High: ${summary.highConfidence}
- 🟡 Medium: ${summary.mediumConfidence}
- 🟢 Low: ${summary.lowConfidence}

**By Type**:
- Unused Exports: ${summary.byType.unusedExports}
- Unreachable Code: ${summary.byType.unreachableCode}
- Unused Imports: ${summary.byType.unusedImports}
- Unused Functions: ${summary.byType.unusedFunctions}
- Unused Variables: ${summary.byType.unusedVariables}

---

`;

    if (findings.length === 0) {
      output += `## ✅ No Dead Code Found

Your codebase appears clean! All exports are being used and no unreachable code was detected.

`;
    } else {
      output += `## Findings

`;

      // Group findings by file
      const byFile = new Map<string, DeadCodeFinding[]>();
      findings.forEach(f => {
        if (!byFile.has(f.file)) {
          byFile.set(f.file, []);
        }
        byFile.get(f.file)!.push(f);
      });

      // Sort files by number of findings (descending)
      const sortedFiles = Array.from(byFile.entries())
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 20); // Limit to 20 files

      for (const [file, fileFindings] of sortedFiles) {
        output += `### ${file}\n\n`;

        for (const finding of fileFindings.slice(0, 10)) { // Limit to 10 per file
          const confidenceEmoji = finding.confidence === "high" ? "🔴" : finding.confidence === "medium" ? "🟡" : "🟢";
          const severityText = finding.severity;

          output += `#### ${confidenceEmoji} ${finding.location.symbolName || "Issue"} (Line ${finding.location.startLine})\n`;
          output += `- **Type**: ${finding.type}\n`;
          output += `- **Severity**: ${severityText}\n`;
          output += `- **Confidence**: ${finding.confidence}\n`;
          output += `- **Description**: ${finding.description}\n`;
          output += `- **Suggestion**: ${finding.suggestion}\n\n`;
        }

        if (fileFindings.length > 10) {
          output += `_... and ${fileFindings.length - 10} more finding(s) in this file_\n\n`;
        }
      }

      if (byFile.size > 20) {
        output += `_... and ${byFile.size - 20} more files with findings_\n\n`;
      }
    }

    if (safeToRemove.length > 0) {
      output += `## Safe to Remove (High Confidence)

These items can be safely removed:

`;
      safeToRemove.slice(0, 20).forEach(item => {
        output += `- ${item}\n`;
      });

      if (safeToRemove.length > 20) {
        output += `\n_... and ${safeToRemove.length - 20} more items_\n`;
      }

      output += "\n";
    }

    if (recommendations.length > 0) {
      output += `## Recommendations

`;
      recommendations.forEach(rec => {
        output += `- ${rec}\n`;
      });
      output += "\n";
    }

    output += `## Next Steps

1. **Review high-confidence findings first** - these are most likely to be dead code
2. **Use your IDE's "Find Usages"** to double-check before removing
3. **Remove unused imports** - these are safe and easy wins
4. **Consider using a tool like ts-prune** for deeper analysis
5. **Run tests after removing code** to ensure nothing breaks

**Note**: This analysis is based on static analysis and entry points. Some code may appear unused but could be:
- Called via reflection
- Used in configuration files
- Required for future features
- Part of a public API

Always verify before removing code!
`;

    return output;
  }
}
