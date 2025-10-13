import { execSync } from "child_process";
import { RefactorCheckpointSchema, RefactorCheckpointOutput } from "../types/index.js";
import { getConfig } from "../config/config-loader.js";

export class RefactorCheckpointTool {
  async execute(args: unknown) {
    const validated = RefactorCheckpointSchema.parse(args);
    const { message, includeUntracked } = validated;
    const config = getConfig();

    try {
      console.error(`[refactor_checkpoint] Creating checkpoint: ${message}`);

      // Check if we're in a git repository
      try {
        execSync("git rev-parse --is-inside-work-tree", { stdio: "pipe" });
      } catch {
        throw new Error("Not a git repository. Checkpoints require git to be initialized.");
      }

      // Create a unique checkpoint ID
      const timestamp = Date.now();
      const checkpointId = `refactogent-checkpoint-${timestamp}`;

      // Stash changes with a descriptive message
      const stashMessage = `${checkpointId}: ${message}`;

      try {
        // Use config default if includeUntracked not explicitly provided
        const shouldIncludeUntracked = includeUntracked !== undefined
          ? includeUntracked
          : config.safety.includeUntrackedFiles;

        // Stash all changes (staged and unstaged)
        const stashCommand = shouldIncludeUntracked
          ? `git stash push -u -m "${stashMessage}"`
          : `git stash push -m "${stashMessage}"`;

        const stashOutput = execSync(stashCommand, {
          encoding: "utf-8",
          stdio: "pipe",
        });

        // Check if anything was stashed
        if (stashOutput.includes("No local changes to save")) {
          console.error("[refactor_checkpoint] No changes to checkpoint");

          return {
            content: [
              {
                type: "text",
                text: `# Checkpoint Status

No local changes found to checkpoint.

**Note**: You may want to make changes before creating a checkpoint, or the checkpoint may have already been created.`,
              },
            ],
          };
        }

        // Get the stash hash (stable identifier)
        const stashHash = execSync("git rev-parse stash@{0}", {
          encoding: "utf-8",
          stdio: "pipe",
        }).trim();

        // Get list of stashed files
        const filesTracked = this.getStashedFiles();

        const output: RefactorCheckpointOutput = {
          checkpointId: stashHash,
          timestamp: new Date(timestamp).toISOString(),
          filesTracked,
          message,
        };

        console.error(
          `[refactor_checkpoint] Checkpoint created: ${stashHash} (${filesTracked.length} files)`
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
        throw new Error(
          `Failed to create git stash: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    } catch (error) {
      console.error("[refactor_checkpoint] Error:", error);
      throw error;
    }
  }

  private getStashedFiles(): string[] {
    try {
      // Get files in the most recent stash (including untracked with --include-untracked)
      const output = execSync("git stash show --name-only --include-untracked stash@{0}", {
        encoding: "utf-8",
        stdio: "pipe",
      });

      return output.trim().split("\n").filter(Boolean);
    } catch {
      return [];
    }
  }

  /**
   * Utility method to rollback to a checkpoint
   */
  static async rollback(checkpointId: string): Promise<void> {
    try {
      // Verify the stash hash exists
      try {
        execSync(`git rev-parse --verify ${checkpointId}`, {
          stdio: "pipe",
        });
      } catch {
        throw new Error(`Checkpoint not found or invalid hash: ${checkpointId}`);
      }

      // Reset any local changes first to avoid conflicts
      execSync("git reset --hard HEAD", {
        stdio: "pipe",
      });

      // Clean any untracked files
      execSync("git clean -fd", {
        stdio: "pipe",
      });

      // Apply the stash using the hash
      execSync(`git stash apply ${checkpointId}`, {
        stdio: "pipe",
      });

      console.error(`[refactor_checkpoint] Rolled back to checkpoint: ${checkpointId}`);
    } catch (error) {
      throw new Error(
        `Failed to rollback to checkpoint: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private formatOutput(output: RefactorCheckpointOutput): string {
    return `# Checkpoint Created ✅

**Checkpoint ID**: \`${output.checkpointId}\`
**Timestamp**: ${output.timestamp}
**Message**: ${output.message}

## Files Tracked
${output.filesTracked.length > 0 ? output.filesTracked.map((f) => `- ${f}`).join("\n") : "No files tracked"}

## Rollback Instructions

To manually rollback to this checkpoint:
\`\`\`bash
git stash list  # Find the stash number
git stash pop stash@{N}  # Replace N with the stash number
\`\`\`

Or use the \`refactor_validate\` tool with \`autoRollback: true\` to automatically rollback if validation fails.
`;
  }
}
