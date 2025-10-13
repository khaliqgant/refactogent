import { execSync } from "child_process";
import {
  RefactorValidateSchema,
  RefactorValidateOutput,
  ValidationError,
} from "../types/index.js";
import { RefactorCheckpointTool } from "./refactor-checkpoint.js";
import { getConfig } from "../config/config-loader.js";

export class RefactorValidateTool {
  async execute(args: unknown) {
    const validated = RefactorValidateSchema.parse(args);
    const { checkpointId, autoRollback, skipTests, skipLint, skipTypeCheck } = validated;
    const config = getConfig();

    try {
      console.error("[refactor_validate] Running validation checks...");

      const errors: ValidationError[] = [];
      let testsPass = true;
      let lintPass = true;
      let typeCheckPass = true;

      // Use config to determine what to run (unless explicitly overridden)
      const shouldRunTests = skipTests ? false : config.validation.runTests;
      const shouldRunLint = skipLint ? false : config.validation.runLint;
      const shouldRunTypeCheck = skipTypeCheck ? false : config.validation.runTypeCheck;

      // Run validation checks (in parallel if configured)
      if (config.validation.parallel) {
        const results = await Promise.all([
          shouldRunTests ? this.runTests(config.validation.timeout) : Promise.resolve({ pass: true, errors: [] }),
          shouldRunLint ? this.runLint(config.validation.timeout) : Promise.resolve({ pass: true, errors: [] }),
          shouldRunTypeCheck ? this.runTypeCheck(config.validation.timeout) : Promise.resolve({ pass: true, errors: [] }),
        ]);

        testsPass = results[0].pass;
        lintPass = results[1].pass;
        typeCheckPass = results[2].pass;
        errors.push(...results[0].errors, ...results[1].errors, ...results[2].errors);
      } else {
        // Run sequentially
        if (shouldRunTests) {
          console.error("[refactor_validate] Running tests...");
          const testResult = await this.runTests(config.validation.timeout);
          testsPass = testResult.pass;
          if (!testsPass) {
            errors.push(...testResult.errors);
          }
        }

        if (shouldRunLint) {
          console.error("[refactor_validate] Running linter...");
          const lintResult = await this.runLint(config.validation.timeout);
          lintPass = lintResult.pass;
          if (!lintPass) {
            errors.push(...lintResult.errors);
          }
        }

        if (shouldRunTypeCheck) {
          console.error("[refactor_validate] Running type checker...");
          const typeCheckResult = await this.runTypeCheck(config.validation.timeout);
          typeCheckPass = typeCheckResult.pass;
          if (!typeCheckPass) {
            errors.push(...typeCheckResult.errors);
          }
        }
      }

      // Run custom validators if configured
      if (config.validation.customValidators.length > 0) {
        console.error("[refactor_validate] Running custom validators...");
        const customResults = await this.runCustomValidators(
          config.validation.customValidators,
          config.validation.timeout
        );
        if (!customResults.pass) {
          errors.push(...customResults.errors);
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

  private async runTests(timeout?: number): Promise<{ pass: boolean; errors: ValidationError[] }> {
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
          timeout: timeout || undefined,
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

  private async runLint(timeout?: number): Promise<{ pass: boolean; errors: ValidationError[] }> {
    try {
      const lintCommand = this.detectLintCommand();

      if (!lintCommand) {
        return { pass: true, errors: [] };
      }

      try {
        execSync(lintCommand, {
          encoding: "utf-8",
          stdio: "pipe",
          timeout: timeout || undefined,
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

  private async runTypeCheck(timeout?: number): Promise<{ pass: boolean; errors: ValidationError[] }> {
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
          timeout: timeout || undefined,
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

  private async runCustomValidators(
    validators: string[],
    timeout?: number
  ): Promise<{ pass: boolean; errors: ValidationError[] }> {
    const errors: ValidationError[] = [];
    let allPass = true;

    for (const validator of validators) {
      try {
        console.error(`[refactor_validate] Running custom validator: ${validator}`);
        execSync(validator, {
          encoding: "utf-8",
          stdio: "pipe",
          timeout: timeout || undefined,
          cwd: process.cwd(),
        });
      } catch (error: any) {
        allPass = false;
        errors.push({
          type: "test",
          message: `Custom validator failed: ${validator}\n${error.stdout || error.stderr || ""}`,
        });
      }
    }

    return { pass: allPass, errors };
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
      return require("fs").existsSync(`${process.cwd()}/${path}`);
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
