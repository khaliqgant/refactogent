import * as path from "path";
import * as fs from "fs";
import { RefactorableFile } from "@refactogent/core";
import { getRefactorContext } from "../context/index.js";

interface RefactoringOpportunity {
  id: string;
  type: "file-too-large" | "function-too-complex" | "function-too-long" | "class-too-large" | "deep-nesting" | "duplicate-code";
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  file: string;
  location?: {
    startLine: number;
    endLine: number;
    symbolName?: string;
  };
  metrics: {
    current: number;
    threshold: number;
    unit: string;
  };
  suggestion: string;
  effort: "low" | "medium" | "high";
  impact: "low" | "medium" | "high";
}

interface AnalysisResult {
  summary: {
    totalFiles: number;
    totalOpportunities: number;
    highSeverity: number;
    mediumSeverity: number;
    lowSeverity: number;
  };
  opportunities: RefactoringOpportunity[];
  recommendations: string[];
}

// Configurable thresholds
const THRESHOLDS = {
  FILE_LINES: 300,
  FILE_LINES_WARNING: 500,
  FUNCTION_LINES: 50,
  FUNCTION_LINES_WARNING: 100,
  FUNCTION_COMPLEXITY: 10,
  FUNCTION_COMPLEXITY_WARNING: 20,
  CLASS_METHODS: 15,
  CLASS_METHODS_WARNING: 25,
  PARAMETERS: 4,
  NESTING_DEPTH: 3,
};

export class RefactorAnalyzeTool {
  async execute(args: unknown) {
    const { path: targetPath } = args as { path: string };

    try {
      console.error(`[refactor_analyze] Analyzing: ${targetPath}`);

      // Resolve absolute path
      const absolutePath = path.resolve(process.cwd(), targetPath);

      // Check if path exists
      if (!fs.existsSync(absolutePath)) {
        throw new Error(`Path does not exist: ${targetPath}`);
      }

      // Determine if it's a file or directory
      const stats = fs.statSync(absolutePath);
      const isDirectory = stats.isDirectory();

      // Get context
      const context = getRefactorContext();
      await context.initialize({
        rootPath: isDirectory ? absolutePath : path.dirname(absolutePath),
        includeTests: true,
      });

      let refactorableFiles: RefactorableFile[] = context.getIndexedFiles();

      // If analyzing a single file, filter to just that file
      if (!isDirectory) {
        refactorableFiles = refactorableFiles.filter((f) => f.path === absolutePath);
      }

      console.error(`[refactor_analyze] Analyzing ${refactorableFiles.length} files`);

      // Analyze each file for refactoring opportunities
      const opportunities: RefactoringOpportunity[] = [];
      let opportunityId = 1;

      for (const file of refactorableFiles) {
        // Skip if not TypeScript/JavaScript
        if (!["typescript", "javascript"].includes(file.language)) {
          continue;
        }

        // Analyze file size
        const fileContent = fs.readFileSync(file.path, "utf-8");
        const fileLines = fileContent.split("\n").length;
        if (fileLines > THRESHOLDS.FILE_LINES_WARNING) {
          opportunities.push({
            id: `opp-${opportunityId++}`,
            type: "file-too-large",
            severity: "high",
            title: "File is very large",
            description: `This file has ${fileLines} lines, which is significantly above the recommended ${THRESHOLDS.FILE_LINES} lines.`,
            file: file.relativePath,
            metrics: {
              current: fileLines,
              threshold: THRESHOLDS.FILE_LINES,
              unit: "lines",
            },
            suggestion: "Consider splitting this file into smaller, focused modules. Look for logical groupings of functions or classes that could be extracted.",
            effort: "high",
            impact: "high",
          });
        } else if (fileLines > THRESHOLDS.FILE_LINES) {
          opportunities.push({
            id: `opp-${opportunityId++}`,
            type: "file-too-large",
            severity: "medium",
            title: "File is getting large",
            description: `This file has ${fileLines} lines. Consider refactoring before it grows larger.`,
            file: file.relativePath,
            metrics: {
              current: fileLines,
              threshold: THRESHOLDS.FILE_LINES,
              unit: "lines",
            },
            suggestion: "Look for opportunities to extract related functions or classes into separate modules.",
            effort: "medium",
            impact: "medium",
          });
        }

        // Analyze each symbol (function/class)
        for (const symbol of file.symbols) {
          const symbolLines = symbol.endLine - symbol.startLine + 1;

          // Check function length
          if (symbol.type === "function") {
            if (symbolLines > THRESHOLDS.FUNCTION_LINES_WARNING) {
              opportunities.push({
                id: `opp-${opportunityId++}`,
                type: "function-too-long",
                severity: "high",
                title: `Function '${symbol.name}' is very long`,
                description: `This function has ${symbolLines} lines, which makes it difficult to understand and maintain.`,
                file: file.relativePath,
                location: {
                  startLine: symbol.startLine,
                  endLine: symbol.endLine,
                  symbolName: symbol.name,
                },
                metrics: {
                  current: symbolLines,
                  threshold: THRESHOLDS.FUNCTION_LINES,
                  unit: "lines",
                },
                suggestion: "Break this function into smaller, single-purpose functions. Look for distinct sections that can be extracted.",
                effort: "medium",
                impact: "high",
              });
            } else if (symbolLines > THRESHOLDS.FUNCTION_LINES) {
              opportunities.push({
                id: `opp-${opportunityId++}`,
                type: "function-too-long",
                severity: "medium",
                title: `Function '${symbol.name}' could be simplified`,
                description: `This function has ${symbolLines} lines. Consider breaking it up for better readability.`,
                file: file.relativePath,
                location: {
                  startLine: symbol.startLine,
                  endLine: symbol.endLine,
                  symbolName: symbol.name,
                },
                metrics: {
                  current: symbolLines,
                  threshold: THRESHOLDS.FUNCTION_LINES,
                  unit: "lines",
                },
                suggestion: "Extract helper functions or use composition to reduce complexity.",
                effort: "low",
                impact: "medium",
              });
            }

            // Check cyclomatic complexity if available
            // Note: complexity would need to be calculated separately
            const estimatedComplexity = this.estimateComplexity(fileContent, symbol.startLine, symbol.endLine);
            if (estimatedComplexity > THRESHOLDS.FUNCTION_COMPLEXITY_WARNING) {
              opportunities.push({
                id: `opp-${opportunityId++}`,
                type: "function-too-complex",
                severity: "high",
                title: `Function '${symbol.name}' is very complex`,
                description: `Estimated complexity of ${estimatedComplexity} is very high. This function has too many decision points.`,
                file: file.relativePath,
                location: {
                  startLine: symbol.startLine,
                  endLine: symbol.endLine,
                  symbolName: symbol.name,
                },
                metrics: {
                  current: estimatedComplexity,
                  threshold: THRESHOLDS.FUNCTION_COMPLEXITY,
                  unit: "complexity",
                },
                suggestion: "Reduce conditional logic by using early returns, guard clauses, or strategy patterns. Consider extracting complex conditions into well-named helper functions.",
                effort: "medium",
                impact: "high",
              });
            } else if (estimatedComplexity > THRESHOLDS.FUNCTION_COMPLEXITY) {
              opportunities.push({
                id: `opp-${opportunityId++}`,
                type: "function-too-complex",
                severity: "medium",
                title: `Function '${symbol.name}' is getting complex`,
                description: `Estimated complexity of ${estimatedComplexity}. Consider simplifying the logic.`,
                file: file.relativePath,
                location: {
                  startLine: symbol.startLine,
                  endLine: symbol.endLine,
                  symbolName: symbol.name,
                },
                metrics: {
                  current: estimatedComplexity,
                  threshold: THRESHOLDS.FUNCTION_COMPLEXITY,
                  unit: "complexity",
                },
                suggestion: "Simplify conditional logic and consider extracting complex expressions.",
                effort: "low",
                impact: "medium",
              });
            }
          }

          // Check class size
          if (symbol.type === "class") {
            const methods = file.symbols.filter(
              (s) => s.type === "function" && s.startLine >= symbol.startLine && s.endLine <= symbol.endLine
            );

            if (methods.length > THRESHOLDS.CLASS_METHODS_WARNING) {
              opportunities.push({
                id: `opp-${opportunityId++}`,
                type: "class-too-large",
                severity: "high",
                title: `Class '${symbol.name}' has too many methods`,
                description: `This class has ${methods.length} methods, suggesting it may have too many responsibilities.`,
                file: file.relativePath,
                location: {
                  startLine: symbol.startLine,
                  endLine: symbol.endLine,
                  symbolName: symbol.name,
                },
                metrics: {
                  current: methods.length,
                  threshold: THRESHOLDS.CLASS_METHODS,
                  unit: "methods",
                },
                suggestion: "Apply the Single Responsibility Principle. Look for groups of related methods that could be extracted into separate classes.",
                effort: "high",
                impact: "high",
              });
            } else if (methods.length > THRESHOLDS.CLASS_METHODS) {
              opportunities.push({
                id: `opp-${opportunityId++}`,
                type: "class-too-large",
                severity: "medium",
                title: `Class '${symbol.name}' is getting large`,
                description: `This class has ${methods.length} methods. Consider if it's doing too much.`,
                file: file.relativePath,
                location: {
                  startLine: symbol.startLine,
                  endLine: symbol.endLine,
                  symbolName: symbol.name,
                },
                metrics: {
                  current: methods.length,
                  threshold: THRESHOLDS.CLASS_METHODS,
                  unit: "methods",
                },
                suggestion: "Review if this class has a single, clear responsibility. Consider extracting related functionality.",
                effort: "medium",
                impact: "medium",
              });
            }
          }
        }
      }

      // Sort by severity and impact
      opportunities.sort((a, b) => {
        const severityOrder = { high: 0, medium: 1, low: 2 };
        if (severityOrder[a.severity] !== severityOrder[b.severity]) {
          return severityOrder[a.severity] - severityOrder[b.severity];
        }
        const impactOrder = { high: 0, medium: 1, low: 2 };
        return impactOrder[a.impact] - impactOrder[b.impact];
      });

      // Generate summary
      const summary = {
        totalFiles: refactorableFiles.length,
        totalOpportunities: opportunities.length,
        highSeverity: opportunities.filter((o) => o.severity === "high").length,
        mediumSeverity: opportunities.filter((o) => o.severity === "medium").length,
        lowSeverity: opportunities.filter((o) => o.severity === "low").length,
      };

      // Generate recommendations
      const recommendations = this.generateRecommendations(opportunities, summary);

      const result: AnalysisResult = {
        summary,
        opportunities,
        recommendations,
      };

      console.error(`[refactor_analyze] Found ${opportunities.length} opportunities`);

      return {
        content: [
          {
            type: "text",
            text: this.formatOutput(result),
          },
        ],
      };
    } catch (error) {
      console.error("[refactor_analyze] Error:", error);
      throw error;
    }
  }

  private estimateComplexity(fileContent: string, startLine: number, endLine: number): number {
    const lines = fileContent.split("\n").slice(startLine - 1, endLine);
    const functionText = lines.join("\n");

    // Simple heuristic: count decision points
    let complexity = 1; // base complexity

    // Count if statements
    complexity += (functionText.match(/\bif\s*\(/g) || []).length;

    // Count else if
    complexity += (functionText.match(/\belse\s+if\s*\(/g) || []).length;

    // Count for/while/do loops
    complexity += (functionText.match(/\b(for|while|do)\s*\(/g) || []).length;

    // Count case statements
    complexity += (functionText.match(/\bcase\s+/g) || []).length;

    // Count catch blocks
    complexity += (functionText.match(/\bcatch\s*\(/g) || []).length;

    // Count ternary operators
    complexity += (functionText.match(/\?[^:]*:/g) || []).length;

    // Count logical operators (&&, ||)
    complexity += (functionText.match(/&&|\|\|/g) || []).length;

    return complexity;
  }

  private generateRecommendations(opportunities: RefactoringOpportunity[], summary: any): string[] {
    const recommendations: string[] = [];

    if (summary.totalOpportunities === 0) {
      recommendations.push("✅ No significant refactoring opportunities detected. Code structure looks good!");
      return recommendations;
    }

    if (summary.highSeverity > 0) {
      recommendations.push(
        `🔴 ${summary.highSeverity} high-severity issues found. Prioritize these for immediate refactoring.`
      );
    }

    // Specific recommendations based on patterns
    const fileSizeIssues = opportunities.filter((o) => o.type === "file-too-large").length;
    if (fileSizeIssues > 0) {
      recommendations.push(
        `📄 ${fileSizeIssues} file(s) are too large. Consider using the module pattern to split functionality.`
      );
    }

    const complexityIssues = opportunities.filter((o) => o.type === "function-too-complex").length;
    if (complexityIssues > 0) {
      recommendations.push(
        `🔀 ${complexityIssues} function(s) are too complex. Use early returns, extract methods, and simplify conditionals.`
      );
    }

    const longFunctions = opportunities.filter((o) => o.type === "function-too-long").length;
    if (longFunctions > 0) {
      recommendations.push(
        `📏 ${longFunctions} function(s) are too long. Break them into smaller, single-purpose functions.`
      );
    }

    const largeClasses = opportunities.filter((o) => o.type === "class-too-large").length;
    if (largeClasses > 0) {
      recommendations.push(
        `🏗️ ${largeClasses} class(es) have too many methods. Apply Single Responsibility Principle.`
      );
    }

    // General workflow recommendation
    recommendations.push(
      "💡 Use refactor_checkpoint before making changes, then validate with refactor_validate after each refactoring."
    );

    return recommendations;
  }

  private formatOutput(result: AnalysisResult): string {
    const { summary, opportunities, recommendations } = result;

    let output = `# Refactoring Analysis

## Summary

**Files Analyzed**: ${summary.totalFiles}
**Total Opportunities**: ${summary.totalOpportunities}
**By Severity**:
- 🔴 High: ${summary.highSeverity}
- 🟡 Medium: ${summary.mediumSeverity}
- 🟢 Low: ${summary.lowSeverity}

---

## Recommendations

${recommendations.map((r) => `- ${r}`).join("\n")}

---

`;

    if (opportunities.length === 0) {
      output += "\n✅ **No refactoring opportunities found!** Your code structure looks good.\n";
      return output;
    }

    output += `## Refactoring Opportunities\n\n`;
    output += `Found ${opportunities.length} opportunities, sorted by severity and impact:\n\n`;

    opportunities.forEach((opp, index) => {
      const severityEmoji = opp.severity === "high" ? "🔴" : opp.severity === "medium" ? "🟡" : "🟢";
      const effortEmoji = opp.effort === "high" ? "⏰⏰⏰" : opp.effort === "medium" ? "⏰⏰" : "⏰";
      const impactEmoji = opp.impact === "high" ? "💥💥💥" : opp.impact === "medium" ? "💥💥" : "💥";

      output += `### ${index + 1}. ${severityEmoji} ${opp.title}\n\n`;
      output += `**File**: \`${opp.file}\`\n`;

      if (opp.location) {
        output += `**Location**: Lines ${opp.location.startLine}-${opp.location.endLine}`;
        if (opp.location.symbolName) {
          output += ` (${opp.location.symbolName})`;
        }
        output += `\n`;
      }

      output += `**Severity**: ${opp.severity.toUpperCase()} | **Effort**: ${effortEmoji} ${opp.effort} | **Impact**: ${impactEmoji} ${opp.impact}\n\n`;

      output += `${opp.description}\n\n`;

      output += `**Metrics**: ${opp.metrics.current} ${opp.metrics.unit} (threshold: ${opp.metrics.threshold})\n\n`;

      output += `**💡 Suggestion**: ${opp.suggestion}\n\n`;

      output += `---\n\n`;
    });

    output += `## Next Steps\n\n`;
    output += `1. Review high-severity opportunities first\n`;
    output += `2. Create a checkpoint: \`refactor_checkpoint\`\n`;
    output += `3. Refactor one opportunity at a time\n`;
    output += `4. Validate after each change: \`refactor_validate\`\n`;
    output += `5. Use \`refactor_impact\` for high-impact changes\n\n`;

    return output;
  }
}
