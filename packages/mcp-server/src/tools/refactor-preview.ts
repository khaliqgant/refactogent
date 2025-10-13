import { existsSync, readFileSync } from "fs";
import * as path from "path";
import {
  RefactorPreviewSchema,
  RefactorPreviewOutput,
  FileChange,
} from "../types/index.js";

/**
 * RefactorPreviewTool - Preview changes as unified diff format
 *
 * This tool takes the same changes array as refactor_execute_safe but instead of
 * applying them, it generates a unified diff preview showing what would change.
 * Essential for trust and safety - allows reviewing changes before execution.
 */
export class RefactorPreviewTool {
  async execute(args: unknown) {
    const validated = RefactorPreviewSchema.parse(args);
    const { changes } = validated;

    try {
      console.error(`[refactor_preview] Generating preview for ${changes.length} change(s)`);

      let totalAdditions = 0;
      let totalDeletions = 0;
      let filesModified = 0;
      let filesCreated = 0;
      let filesDeleted = 0;
      let fullDiff = "";

      for (const change of changes) {
        const absolutePath = path.resolve(process.cwd(), change.filePath);
        const diff = this.generateDiff(change, absolutePath);

        if (diff.diff) {
          fullDiff += diff.diff + "\n";
          totalAdditions += diff.additions;
          totalDeletions += diff.deletions;

          if (change.operation === "create") {
            filesCreated++;
          } else if (change.operation === "delete") {
            filesDeleted++;
          } else {
            filesModified++;
          }
        }
      }

      const output: RefactorPreviewOutput = {
        totalChanges: changes.length,
        diff: fullDiff,
        summary: {
          additions: totalAdditions,
          deletions: totalDeletions,
          filesModified,
          filesCreated,
          filesDeleted,
        },
      };

      console.error(
        `[refactor_preview] Preview generated: +${totalAdditions} -${totalDeletions}`
      );

      return {
        content: [
          {
            type: "text",
            text: this.formatOutput(output),
          },
        ],
      };
    } catch (error) {
      console.error("[refactor_preview] Error:", error);
      throw error;
    }
  }

  /**
   * Generate unified diff for a single file change
   */
  private generateDiff(
    change: FileChange,
    absolutePath: string
  ): { diff: string; additions: number; deletions: number } {
    const relativePath = path.relative(process.cwd(), absolutePath);

    if (change.operation === "create") {
      // New file - show all lines as additions
      const lines = (change.newContent || "").split("\n");
      const additions = lines.length;

      let diff = `diff --git a/${relativePath} b/${relativePath}\n`;
      diff += `new file mode 100644\n`;
      diff += `--- /dev/null\n`;
      diff += `+++ b/${relativePath}\n`;
      diff += `@@ -0,0 +1,${additions} @@\n`;

      for (const line of lines) {
        diff += `+${line}\n`;
      }

      return { diff, additions, deletions: 0 };
    } else if (change.operation === "delete") {
      // Deleted file - show all lines as deletions
      if (!existsSync(absolutePath)) {
        return {
          diff: `File ${relativePath} does not exist (nothing to delete)\n`,
          additions: 0,
          deletions: 0,
        };
      }

      const oldContent = readFileSync(absolutePath, "utf-8");
      const lines = oldContent.split("\n");
      const deletions = lines.length;

      let diff = `diff --git a/${relativePath} b/${relativePath}\n`;
      diff += `deleted file mode 100644\n`;
      diff += `--- a/${relativePath}\n`;
      diff += `+++ /dev/null\n`;
      diff += `@@ -1,${deletions} +0,0 @@\n`;

      for (const line of lines) {
        diff += `-${line}\n`;
      }

      return { diff, additions: 0, deletions };
    } else {
      // Update - generate standard unified diff
      const oldContent = existsSync(absolutePath)
        ? readFileSync(absolutePath, "utf-8")
        : "";
      const newContent = change.newContent || "";

      const { diff, stats } = this.computeUnifiedDiff(
        oldContent,
        newContent,
        relativePath
      );

      return { diff, additions: stats.additions, deletions: stats.deletions };
    }
  }

  /**
   * Compute unified diff between old and new content
   * Uses a simple line-by-line diff algorithm
   */
  private computeUnifiedDiff(
    oldContent: string,
    newContent: string,
    filePath: string
  ): { diff: string; stats: { additions: number; deletions: number } } {
    const oldLines = oldContent.split("\n");
    const newLines = newContent.split("\n");

    // Simple LCS-based diff (for production, consider using a library like diff)
    const changes = this.simpleDiff(oldLines, newLines);

    let additions = 0;
    let deletions = 0;
    let diff = `diff --git a/${filePath} b/${filePath}\n`;
    diff += `--- a/${filePath}\n`;
    diff += `+++ b/${filePath}\n`;

    // Group changes into hunks
    const hunks = this.groupIntoHunks(changes, oldLines, newLines);

    for (const hunk of hunks) {
      diff += `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@\n`;

      for (const line of hunk.lines) {
        diff += line + "\n";
        if (line.startsWith("+") && !line.startsWith("+++")) additions++;
        if (line.startsWith("-") && !line.startsWith("---")) deletions++;
      }
    }

    return { diff, stats: { additions, deletions } };
  }

  /**
   * Simple diff algorithm - returns array of changes
   */
  private simpleDiff(
    oldLines: string[],
    newLines: string[]
  ): Array<{ type: "add" | "delete" | "equal"; oldIndex: number; newIndex: number; line: string }> {
    const changes: Array<{
      type: "add" | "delete" | "equal";
      oldIndex: number;
      newIndex: number;
      line: string;
    }> = [];

    let oldIndex = 0;
    let newIndex = 0;

    // Very simple diff - just compare line by line
    // For production use, consider using Myers' diff algorithm
    while (oldIndex < oldLines.length || newIndex < newLines.length) {
      if (oldIndex >= oldLines.length) {
        // Only new lines left
        changes.push({
          type: "add",
          oldIndex,
          newIndex,
          line: newLines[newIndex],
        });
        newIndex++;
      } else if (newIndex >= newLines.length) {
        // Only old lines left
        changes.push({
          type: "delete",
          oldIndex,
          newIndex,
          line: oldLines[oldIndex],
        });
        oldIndex++;
      } else if (oldLines[oldIndex] === newLines[newIndex]) {
        // Lines match
        changes.push({
          type: "equal",
          oldIndex,
          newIndex,
          line: oldLines[oldIndex],
        });
        oldIndex++;
        newIndex++;
      } else {
        // Lines differ - simple heuristic
        const nextOldInNew = newLines.indexOf(oldLines[oldIndex], newIndex);
        const nextNewInOld = oldLines.indexOf(newLines[newIndex], oldIndex);

        if (nextOldInNew !== -1 && (nextNewInOld === -1 || nextOldInNew < nextNewInOld)) {
          // Current new line is added
          changes.push({
            type: "add",
            oldIndex,
            newIndex,
            line: newLines[newIndex],
          });
          newIndex++;
        } else {
          // Current old line is deleted
          changes.push({
            type: "delete",
            oldIndex,
            newIndex,
            line: oldLines[oldIndex],
          });
          oldIndex++;
        }
      }
    }

    return changes;
  }

  /**
   * Group changes into hunks with context lines
   */
  private groupIntoHunks(
    changes: Array<{ type: string; oldIndex: number; newIndex: number; line: string }>,
    _oldLines: string[],
    _newLines: string[]
  ): Array<{ oldStart: number; oldLines: number; newStart: number; newLines: number; lines: string[] }> {
    const hunks: Array<{
      oldStart: number;
      oldLines: number;
      newStart: number;
      newLines: number;
      lines: string[];
    }> = [];

    const contextLines = 3;
    let currentHunk: {
      oldStart: number;
      oldLines: number;
      newStart: number;
      newLines: number;
      lines: string[];
    } | null = null;

    for (let i = 0; i < changes.length; i++) {
      const change = changes[i];

      if (change.type !== "equal") {
        // Start new hunk if needed
        if (!currentHunk) {
          const contextStart = Math.max(0, i - contextLines);
          currentHunk = {
            oldStart: changes[contextStart].oldIndex + 1,
            oldLines: 0,
            newStart: changes[contextStart].newIndex + 1,
            newLines: 0,
            lines: [],
          };

          // Add context before
          for (let j = contextStart; j < i; j++) {
            currentHunk.lines.push(` ${changes[j].line}`);
            currentHunk.oldLines++;
            currentHunk.newLines++;
          }
        }

        // Add the change
        if (change.type === "add") {
          currentHunk.lines.push(`+${change.line}`);
          currentHunk.newLines++;
        } else {
          currentHunk.lines.push(`-${change.line}`);
          currentHunk.oldLines++;
        }
      } else if (currentHunk) {
        // Add context after changes
        currentHunk.lines.push(` ${change.line}`);
        currentHunk.oldLines++;
        currentHunk.newLines++;

        // Check if we should close this hunk
        const remainingChanges = changes.slice(i + 1, i + contextLines + 1);
        const hasMoreChanges = remainingChanges.some((c) => c.type !== "equal");

        if (!hasMoreChanges) {
          hunks.push(currentHunk);
          currentHunk = null;
        }
      }
    }

    // Close any remaining hunk
    if (currentHunk) {
      hunks.push(currentHunk);
    }

    return hunks;
  }

  /**
   * Format output for display
   */
  private formatOutput(output: RefactorPreviewOutput): string {
    const { totalChanges, diff, summary } = output;

    let result = `# Refactoring Preview\n\n`;
    result += `## Summary\n\n`;
    result += `- **Total Changes**: ${totalChanges}\n`;
    result += `- **Files Modified**: ${summary.filesModified}\n`;
    result += `- **Files Created**: ${summary.filesCreated}\n`;
    result += `- **Files Deleted**: ${summary.filesDeleted}\n`;
    result += `- **Lines Added**: +${summary.additions}\n`;
    result += `- **Lines Deleted**: -${summary.deletions}\n`;
    result += `\n`;

    result += `## Unified Diff\n\n`;
    result += `\`\`\`diff\n${diff}\`\`\`\n`;

    result += `\n## Next Steps\n\n`;
    result += `To apply these changes, use the \`refactor_execute_safe\` tool with the same changes array.\n`;

    return result;
  }
}
