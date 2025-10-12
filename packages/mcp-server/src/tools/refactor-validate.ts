import { execSync } from "child_process";
import {
  RefactorValidateSchema,
  RefactorValidateOutput,
  ValidationError,
} from "../types/index.js";
import { RefactorCheckpointTool } from "./refactor-checkpoint.js";

export class RefactorValidateTool {
  async execute(args: unknown) {
    const validated = RefactorValidateSchema.parse(args);
    const { checkpointId, autoRollback, skipTests, skipLint, skipTypeCheck } = validated;

    try {
      console.error("[refactor_validate] Running validation checks...");

      const errors: ValidationError[] = [];
      let testsPass = true;
      let lintPass = true;
      let typeCheckPass = true;

      // Run tests
      if (!skipTests) {
        console.error("[refactor_validate] Running tests...");
        const testResult = await this.runTests();
        testsPass = testResult.pass;
        if (!testsPass) {
          errors.push(...testResult.errors);
        }
      }

      // Run linting
      if (!skipLint) {
        console.error("[refactor_validate] Running linter...");
        const lintResult = await this.runLint();
        lintPass = lintResult.pass;
        if (!lintPass) {
          errors.push(...lintResult.errors);
        }
      }

      // Run type checking
      if (!skipTypeCheck) {
        console.error("[refactor_validate] Running type checker...");
        const typeCheckResult = await this.runTypeCheck();
        typeCheckPass = typeCheckResult.pass;
        if (!typeCheckPass) {
          errors.push(...typeCheckResult.errors);
        }
      }

      const allPass = testsPass && lintPass && typeCheckPass;
      let rolledBack = false;

      // Handle rollback if validation failed
      if (!allPass && autoRollback && checkpointId) {
        console.error(`[refactor_validate] Validation failed, rolling back to ${checkpointId}`);
        try {
          await RefactorCheckpointTool.rollback(checkpointId);
          rolledBack = true;
        } catch (error) {
          console.error("[refactor_validate] Rollback failed:", error);
          errors.push({
            type: "test",
            message: `Rollback failed: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      }

      const output: RefactorValidateOutput = {
        testsPass,
        lintPass,
        typeCheckPass,
        allPass,
        errors,
        rolledBack,
        suggestion: this.generateSuggestion(errors),
      };

      console.error(
        `[refactor_validate] Validation ${allPass ? "passed" : "failed"}${rolledBack ? " (rolled back)" : ""}`
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
      console.error("[refactor_validate] Error:", error);
      throw error;
    }
  }

  private async runTests(): Promise<{ pass: boolean; errors: ValidationError[] }> {
    try {
      // Try to detect test command from package.json
      const testCommand = this.detectTestCommand();

      if (!testCommand) {
        return {
          pass: true,
          errors: [
            {
              type: "test",
              message: "No test command found in package.json. Skipping tests.",
            },
          ],
        };
      }

      try {
        execSync(testCommand, {
          encoding: "utf-8",
          stdio: "pipe",
        });

        return { pass: true, errors: [] };
      } catch (error: any) {
        const errors = this.parseTestErrors(error.stdout || error.stderr || "");
        return { pass: false, errors };
      }
    } catch {
      return { pass: true, errors: [] };
    }
  }

  private async runLint(): Promise<{ pass: boolean; errors: ValidationError[] }> {
    try {
      const lintCommand = this.detectLintCommand();

      if (!lintCommand) {
        return { pass: true, errors: [] };
      }

      try {
        execSync(lintCommand, {
          encoding: "utf-8",
          stdio: "pipe",
        });

        return { pass: true, errors: [] };
      } catch (error: any) {
        const errors = this.parseLintErrors(error.stdout || error.stderr || "");
        return { pass: false, errors };
      }
    } catch {
      return { pass: true, errors: [] };
    }
  }

  private async runTypeCheck(): Promise<{ pass: boolean; errors: ValidationError[] }> {
    try {
      // Look for TypeScript
      const hasTSConfig = this.fileExists("tsconfig.json");

      if (!hasTSConfig) {
        return { pass: true, errors: [] };
      }

      try {
        execSync("npx tsc --noEmit", {
          encoding: "utf-8",
          stdio: "pipe",
        });

        return { pass: true, errors: [] };
      } catch (error: any) {
        const errors = this.parseTypeCheckErrors(error.stdout || error.stderr || "");
        return { pass: false, errors };
      }
    } catch {
      return { pass: true, errors: [] };
    }
  }

  private detectTestCommand(): string | null {
    try {
      const packageJson = require(`${process.cwd()}/package.json`);
      const scripts = packageJson.scripts || {};

      // Common test script names
      for (const name of ["test", "test:unit", "test:all"]) {
        if (scripts[name]) {
          return `npm run ${name}`;
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  private detectLintCommand(): string | null {
    try {
      const packageJson = require(`${process.cwd()}/package.json`);
      const scripts = packageJson.scripts || {};

      // Common lint script names
      for (const name of ["lint", "lint:check"]) {
        if (scripts[name]) {
          return `npm run ${name}`;
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  private fileExists(path: string): boolean {
    try {
      require("fs").existsSync(`${process.cwd()}/${path}`);
      return true;
    } catch {
      return false;
    }
  }

  private parseTestErrors(output: string): ValidationError[] {
    const errors: ValidationError[] = [];

    // Simple parser - look for common patterns
    const lines = output.split("\n");
    for (const line of lines) {
      if (line.includes("FAIL") || line.includes("Error:")) {
        errors.push({
          type: "test",
          message: line.trim(),
        });
      }
    }

    if (errors.length === 0) {
      errors.push({
        type: "test",
        message: "Tests failed. See console output for details.",
      });
    }

    return errors.slice(0, 10); // Limit to 10 errors
  }

  private parseLintErrors(output: string): ValidationError[] {
    const errors: ValidationError[] = [];

    const lines = output.split("\n");
    for (const line of lines) {
      // Match ESLint format: "  /path/to/file.ts:10:5  error  Message"
      const match = line.match(/(.+):(\d+):(\d+)\s+(error|warning)\s+(.+)/);
      if (match) {
        const [, file, lineNum, , , message] = match;
        errors.push({
          type: "lint",
          file,
          line: parseInt(lineNum),
          message,
        });
      }
    }

    if (errors.length === 0 && output.includes("error")) {
      errors.push({
        type: "lint",
        message: "Linting errors found. See console output for details.",
      });
    }

    return errors.slice(0, 10);
  }

  private parseTypeCheckErrors(output: string): ValidationError[] {
    const errors: ValidationError[] = [];

    const lines = output.split("\n");
    for (const line of lines) {
      // Match TypeScript format: "src/file.ts(10,5): error TS2304: Message"
      const match = line.match(/(.+)\((\d+),(\d+)\):\s+error\s+TS\d+:\s+(.+)/);
      if (match) {
        const [, file, lineNum, , message] = match;
        errors.push({
          type: "typecheck",
          file,
          line: parseInt(lineNum),
          message,
        });
      }
    }

    if (errors.length === 0 && output.includes("error TS")) {
      errors.push({
        type: "typecheck",
        message: "Type checking errors found. See console output for details.",
      });
    }

    return errors.slice(0, 10);
  }

  private generateSuggestion(errors: ValidationError[]): string | undefined {
    if (errors.length === 0) {
      return undefined;
    }

    const testErrors = errors.filter((e) => e.type === "test").length;
    const lintErrors = errors.filter((e) => e.type === "lint").length;
    const typeErrors = errors.filter((e) => e.type === "typecheck").length;

    const suggestions: string[] = [];

    if (testErrors > 0) {
      suggestions.push(`Fix ${testErrors} test failure(s)`);
    }

    if (lintErrors > 0) {
      suggestions.push(`Fix ${lintErrors} linting error(s) with \`npm run lint:fix\``);
    }

    if (typeErrors > 0) {
      suggestions.push(`Fix ${typeErrors} type error(s)`);
    }

    return suggestions.join(". ");
  }

  private formatOutput(output: RefactorValidateOutput): string {
    const { testsPass, lintPass, typeCheckPass, allPass, errors, rolledBack, suggestion } =
      output;

    const statusEmoji = allPass ? "✅" : "❌";

    return `# Validation Results ${statusEmoji}

## Status
- **Tests**: ${testsPass ? "✅ Passed" : "❌ Failed"}
- **Linting**: ${lintPass ? "✅ Passed" : "❌ Failed"}
- **Type Checking**: ${typeCheckPass ? "✅ Passed" : "❌ Failed"}

${rolledBack ? "\n⚠️ **Changes were rolled back due to validation failures**\n" : ""}

${
  errors.length > 0
    ? `## Errors (${errors.length})

${errors.map((e) => `- [${e.type}] ${e.file ? `${e.file}:${e.line} - ` : ""}${e.message}`).join("\n")}
`
    : ""
}

${suggestion ? `## Next Steps\n${suggestion}` : ""}
`;
  }
}
