import { execSync } from "child_process";
import { writeFileSync, readFileSync } from "fs";
import {
  RefactorExecuteSafeSchema,
  RefactorExecuteSafeOutput,
  FileChange,
} from "../types/index.js";
import { RefactorCheckpointTool } from "./refactor-checkpoint.js";
import { RefactorValidateTool } from "./refactor-validate.js";

export class RefactorExecuteSafeTool {
  async execute(args: unknown) {
    const validated = RefactorExecuteSafeSchema.parse(args);
    const {
      changes,
      description,
      skipValidation,
      autoRollback,
      skipTests,
      skipLint,
      skipTypeCheck,
    } = validated;

    let checkpointId: string | undefined;
    let appliedChanges: FileChange[] = [];
    let validationResult: any = null;

    try {
      console.error(`[refactor_execute_safe] Executing safe refactoring: ${description}`);

      // Step 1: Create checkpoint
      console.error("[refactor_execute_safe] Creating safety checkpoint...");
      const checkpointTool = new RefactorCheckpointTool();
      const checkpointResponse = await checkpointTool.execute({
        message: `Before: ${description}`,
        includeUntracked: false,
      });

      // Extract checkpoint ID from response
      const checkpointText = checkpointResponse.content[0].text;
      const checkpointMatch = checkpointText.match(/\*\*Checkpoint ID\*\*: `([^`]+)`/);
      if (checkpointMatch) {
        checkpointId = checkpointMatch[1];
        console.error(`[refactor_execute_safe] Checkpoint created: ${checkpointId}`);
      }

      // Step 2: Apply changes
      console.error(`[refactor_execute_safe] Applying ${changes.length} file change(s)...`);
      for (const change of changes) {
        try {
          await this.applyFileChange(change);
          appliedChanges.push(change);
          console.error(`[refactor_execute_safe] Applied change to: ${change.filePath}`);
        } catch (error) {
          throw new Error(
            `Failed to apply change to ${change.filePath}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      // Step 3: Validate changes
      if (!skipValidation) {
        console.error("[refactor_execute_safe] Validating changes...");
        const validateTool = new RefactorValidateTool();
        const validateResponse = await validateTool.execute({
          checkpointId,
          autoRollback,
          skipTests: skipTests ?? false,
          skipLint: skipLint ?? false,
          skipTypeCheck: skipTypeCheck ?? false,
        });

        validationResult = validateResponse.content[0].text;

        // Check if validation passed
        const validationPassed =
          validationResult.includes("✅") && !validationResult.includes("rolled back");

        if (!validationPassed) {
          const output: RefactorExecuteSafeOutput = {
            success: false,
            checkpointId,
            appliedChanges: appliedChanges.length,
            validationPassed: false,
            rolledBack: autoRollback,
            error: "Validation failed. See validation results for details.",
            validationResults: validationResult,
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

      // Success!
      const output: RefactorExecuteSafeOutput = {
        success: true,
        checkpointId,
        appliedChanges: appliedChanges.length,
        validationPassed: !skipValidation,
        rolledBack: false,
        validationResults: validationResult || "Validation skipped",
      };

      console.error(
        `[refactor_execute_safe] Successfully applied ${appliedChanges.length} change(s)`
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
      console.error("[refactor_execute_safe] Error:", error);

      // Attempt rollback on error if we have a checkpoint
      let rolledBack = false;
      if (checkpointId && autoRollback) {
        try {
          console.error(`[refactor_execute_safe] Rolling back to checkpoint: ${checkpointId}`);
          await RefactorCheckpointTool.rollback(checkpointId);
          rolledBack = true;
        } catch (rollbackError) {
          console.error("[refactor_execute_safe] Rollback failed:", rollbackError);
        }
      }

      const output: RefactorExecuteSafeOutput = {
        success: false,
        checkpointId,
        appliedChanges: appliedChanges.length,
        validationPassed: false,
        rolledBack,
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

  private async applyFileChange(change: FileChange): Promise<void> {
    const { filePath, newContent, operation } = change;

    switch (operation) {
      case "update":
        if (!newContent) {
          throw new Error("newContent is required for update operation");
        }
        writeFileSync(filePath, newContent, "utf-8");
        break;

      case "create":
        if (!newContent) {
          throw new Error("newContent is required for create operation");
        }
        writeFileSync(filePath, newContent, "utf-8");
        break;

      case "delete":
        try {
          execSync(`rm "${filePath}"`, { stdio: "pipe" });
        } catch (error) {
          throw new Error(`Failed to delete file: ${error}`);
        }
        break;

      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  }

  private formatOutput(output: RefactorExecuteSafeOutput): string {
    const { success, checkpointId, appliedChanges, validationPassed, rolledBack, error } = output;

    const statusEmoji = success ? "✅" : "❌";
    const statusText = success ? "Success" : "Failed";

    let result = `# Refactoring Execution ${statusEmoji}

## Status: ${statusText}

- **Checkpoint ID**: ${checkpointId || "N/A"}
- **Changes Applied**: ${appliedChanges}
- **Validation**: ${validationPassed ? "✅ Passed" : "❌ Failed or Skipped"}
- **Rolled Back**: ${rolledBack ? "⚠️ Yes" : "No"}

`;

    if (error) {
      result += `## Error

\`\`\`
${error}
\`\`\`

`;
    }

    if (output.validationResults) {
      result += `## Validation Results

${output.validationResults}
`;
    }

    if (!success && checkpointId && !rolledBack) {
      result += `## Manual Rollback

To manually rollback changes:
\`\`\`bash
git stash list  # Find the checkpoint
git stash pop stash@{N}  # Replace N with the stash number
\`\`\`
`;
    }

    return result;
  }
}
