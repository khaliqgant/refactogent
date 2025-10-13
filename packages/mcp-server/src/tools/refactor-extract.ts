import { existsSync } from "fs";
import * as path from "path";
import { SyntaxKind } from "ts-morph";
import {
  RefactorExtractSchema,
  RefactorExtractOutput,
} from "../types/index.js";
import { getRefactorContext } from "../context/index.js";

/**
 * RefactorExtractTool - Extract code to function/method
 *
 * Takes a file path, start line, end line, and new function name.
 * Analyzes the selected code for variables that need to be parameters,
 * creates a new function with proper signature, and replaces the original
 * code with a function call. Uses ts-morph for AST manipulation.
 */
export class RefactorExtractTool {
  async execute(args: unknown) {
    const validated = RefactorExtractSchema.parse(args);
    const { filePath, startLine, endLine, newFunctionName, extractionType } = validated;

    try {
      console.error(
        `[refactor_extract] Extracting lines ${startLine}-${endLine} from ${filePath} to ${newFunctionName}`
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

      // Get the code to extract
      const extractedCode = this.getCodeInRange(sourceFile, startLine, endLine);
      if (!extractedCode.trim()) {
        throw new Error(`No code found in lines ${startLine}-${endLine}`);
      }

      console.error(`[refactor_extract] Analyzing code for extraction...`);

      // Analyze the code to determine parameters and return value
      const analysis = this.analyzeCodeForExtraction(
        sourceFile,
        startLine,
        endLine,
        extractedCode
      );

      // Generate the new function
      const functionSignature = this.generateFunctionSignature(
        newFunctionName,
        analysis.parameters,
        analysis.returnType,
        extractionType === "method"
      );

      // Generate the function call
      const functionCall = this.generateFunctionCall(
        newFunctionName,
        analysis.parameters,
        analysis.returnVariable
      );

      // Generate preview
      const preview = this.generatePreview(
        extractedCode,
        functionSignature,
        functionCall,
        analysis
      );

      console.error(
        `[refactor_extract] Extraction analysis complete. Found ${analysis.parameters.length} parameter(s)`
      );

      const output: RefactorExtractOutput = {
        success: true,
        functionName: newFunctionName,
        filePath,
        extractedCode,
        newFunctionSignature: functionSignature,
        replacementCall: functionCall,
        parameters: analysis.parameters,
        returnType: analysis.returnType,
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
      console.error("[refactor_extract] Error:", error);

      const output: RefactorExtractOutput = {
        success: false,
        functionName: newFunctionName,
        filePath,
        extractedCode: "",
        newFunctionSignature: "",
        replacementCall: "",
        parameters: [],
        returnType: "void",
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
   * Get code within a line range
   */
  private getCodeInRange(sourceFile: any, startLine: number, endLine: number): string {
    const fullText = sourceFile.getFullText();
    const lines = fullText.split("\n");

    // Extract lines (1-indexed to 0-indexed)
    const extractedLines = lines.slice(startLine - 1, endLine);
    return extractedLines.join("\n");
  }

  /**
   * Analyze code to determine what parameters and return values are needed
   */
  private analyzeCodeForExtraction(
    sourceFile: any,
    startLine: number,
    endLine: number,
    _code: string
  ): {
    parameters: string[];
    returnType: string;
    returnVariable?: string;
    usedVariables: Set<string>;
    declaredVariables: Set<string>;
  } {
    const usedVariables = new Set<string>();
    const declaredVariables = new Set<string>();
    let returnVariable: string | undefined;
    let returnType = "void";

    // Get all statements in the range
    const statements = this.getStatementsInRange(sourceFile, startLine, endLine);

    // Find all variable declarations in the extracted code
    for (const stmt of statements) {
      stmt.forEachDescendant((node: any) => {
        // Track variable declarations
        if (node.getKind() === SyntaxKind.VariableDeclaration) {
          const name = node.getName();
          declaredVariables.add(name);
        }

        // Track identifiers (potential variable uses)
        if (node.getKind() === SyntaxKind.Identifier) {
          const name = node.getText();
          usedVariables.add(name);
        }
      });
    }

    // Find variables used but not declared (these become parameters)
    const parameters: string[] = [];
    for (const used of usedVariables) {
      if (!declaredVariables.has(used) && !this.isBuiltIn(used)) {
        parameters.push(used);
      }
    }

    // Check if any variable is returned or used after the extracted code
    // This is a simplified heuristic - in reality, need data flow analysis
    const lastStatement = statements[statements.length - 1];
    if (lastStatement) {
      // Check if last statement is a return
      if (lastStatement.getKind() === SyntaxKind.ReturnStatement) {
        const returnExpr = (lastStatement as any).getExpression();
        if (returnExpr) {
          returnVariable = returnExpr.getText();
          returnType = this.inferType(returnExpr);
        }
      }
      // Check if last statement assigns to a variable that's used later
      else if (lastStatement.getKind() === SyntaxKind.ExpressionStatement) {
        const expr = (lastStatement as any).getExpression();
        if (expr && expr.getKind() === SyntaxKind.BinaryExpression) {
          const left = expr.getLeft();
          if (left.getKind() === SyntaxKind.Identifier) {
            const varName = left.getText();
            // Check if this variable is used after the extracted range
            if (this.isVariableUsedAfter(sourceFile, varName, endLine)) {
              returnVariable = varName;
              returnType = this.inferType(left);
            }
          }
        }
      }
    }

    return {
      parameters: Array.from(new Set(parameters)).sort(),
      returnType,
      returnVariable,
      usedVariables,
      declaredVariables,
    };
  }

  /**
   * Get statements within a line range
   */
  private getStatementsInRange(sourceFile: any, startLine: number, endLine: number): any[] {
    const statements: any[] = [];

    sourceFile.forEachDescendant((node: any) => {
      const nodeStart = node.getStartLineNumber();
      const nodeEnd = node.getEndLineNumber();

      // Check if statement is within range
      if (nodeStart >= startLine && nodeEnd <= endLine) {
        // Only include top-level statements in the range
        const parent = node.getParent();
        if (
          parent &&
          (parent.getStartLineNumber() < startLine || parent.getEndLineNumber() > endLine)
        ) {
          statements.push(node);
        }
      }
    });

    return statements;
  }

  /**
   * Check if a variable is used after a certain line
   */
  private isVariableUsedAfter(sourceFile: any, varName: string, afterLine: number): boolean {
    let usedAfter = false;

    sourceFile.forEachDescendant((node: any) => {
      if (node.getKind() === SyntaxKind.Identifier && node.getText() === varName) {
        if (node.getStartLineNumber() > afterLine) {
          usedAfter = true;
        }
      }
    });

    return usedAfter;
  }

  /**
   * Check if an identifier is a built-in or keyword
   */
  private isBuiltIn(name: string): boolean {
    const builtIns = new Set([
      "console",
      "process",
      "window",
      "document",
      "Math",
      "Date",
      "JSON",
      "Array",
      "Object",
      "String",
      "Number",
      "Boolean",
      "undefined",
      "null",
      "true",
      "false",
      "this",
      "super",
      "require",
      "module",
      "exports",
      "__dirname",
      "__filename",
    ]);

    return builtIns.has(name);
  }

  /**
   * Infer type from an expression node
   */
  private inferType(node: any): string {
    try {
      const type = node.getType();
      const typeText = type.getText();

      // Simplify complex types
      if (typeText.length > 50) {
        return "any";
      }

      return typeText;
    } catch {
      return "any";
    }
  }

  /**
   * Generate function signature
   */
  private generateFunctionSignature(
    functionName: string,
    parameters: string[],
    returnType: string,
    isMethod: boolean
  ): string {
    const params = parameters.map((p) => `${p}: any`).join(", ");
    const returnTypeAnnotation = returnType !== "void" ? `: ${returnType}` : "";

    if (isMethod) {
      return `${functionName}(${params})${returnTypeAnnotation} {
  // ... extracted code ...
}`;
    } else {
      return `function ${functionName}(${params})${returnTypeAnnotation} {
  // ... extracted code ...
}`;
    }
  }

  /**
   * Generate function call
   */
  private generateFunctionCall(
    functionName: string,
    parameters: string[],
    returnVariable?: string
  ): string {
    const args = parameters.join(", ");
    const call = `${functionName}(${args})`;

    if (returnVariable) {
      return `const ${returnVariable} = ${call};`;
    } else {
      return `${call};`;
    }
  }

  /**
   * Generate preview of the extraction
   */
  private generatePreview(
    extractedCode: string,
    functionSignature: string,
    functionCall: string,
    analysis: any
  ): string {
    let preview = "## New Function\n\n```typescript\n";
    preview += functionSignature.replace("// ... extracted code ...", extractedCode);
    preview += "\n```\n\n";

    preview += "## Replacement Code\n\n```typescript\n";
    preview += functionCall;
    preview += "\n```\n\n";

    preview += "## Analysis\n\n";
    preview += `- **Parameters**: ${analysis.parameters.length > 0 ? analysis.parameters.join(", ") : "none"}\n`;
    preview += `- **Return Type**: ${analysis.returnType}\n`;
    if (analysis.returnVariable) {
      preview += `- **Return Variable**: ${analysis.returnVariable}\n`;
    }

    return preview;
  }

  /**
   * Format output for display
   */
  private formatOutput(output: RefactorExtractOutput): string {
    const {
      success,
      functionName,
      filePath,
      parameters,
      returnType,
      preview,
      error,
    } = output;

    if (!success) {
      return `# Extract Function Failed ❌

**Error**: ${error}

Could not extract code to function '${functionName}' in ${filePath}.
`;
    }

    const result = `# Extract Function: ${functionName}

## Summary
- **File**: ${filePath}
- **New Function**: \`${functionName}\`
- **Parameters**: ${parameters.length > 0 ? parameters.map(p => `\`${p}\``).join(", ") : "none"}
- **Return Type**: \`${returnType}\`

${preview}

## Implementation Steps

1. **Add the new function** to your file (suggested location: near the code being extracted)
2. **Replace the original code** with the function call
3. **Review and adjust**:
   - Verify parameter types are correct (currently typed as \`any\`)
   - Ensure return type matches your needs
   - Check for any side effects or dependencies
   - Add JSDoc comments to document the function

## Next Steps

**Option 1**: Use \`refactor_execute_safe\` to apply the changes automatically

**Option 2**: Manually apply the changes in your IDE for more control

**Note**: This is a preview. The actual implementation may need adjustments based on:
- Variable scope and closure requirements
- Side effects and state mutations
- Type annotations and interfaces
- Error handling
`;

    return result;
  }
}
