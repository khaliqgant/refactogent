import * as path from "path";
import * as fs from "fs";
import { CodebaseIndexer } from "@refactogent/core";
import { RefactorImpactSchema, RefactorImpactOutput } from "../types/index.js";

export class RefactorImpactTool {
  async execute(args: unknown) {
    const validated = RefactorImpactSchema.parse(args);
    const { targetFile, targetSymbol } = validated;

    try {
      console.error(`[refactor_impact] Analyzing impact for: ${targetFile}`);

      // Resolve absolute path
      const absolutePath = path.resolve(process.cwd(), targetFile);

      // Check if file exists
      if (!fs.existsSync(absolutePath)) {
        throw new Error(`File does not exist: ${targetFile}`);
      }

      // Index the codebase to build dependency graph
      const indexer = new CodebaseIndexer({
        rootPath: process.cwd(),
        includeTests: true,
      });

      const files = await indexer.indexCodebase();

      // Find the target file
      const target = files.find((f: any) => f.path === absolutePath);
      if (!target) {
        throw new Error(`Could not analyze file: ${targetFile}`);
      }

      console.error(`[refactor_impact] Building dependency graph...`);

      // Find direct dependents (files that import from target)
      const directDependents = this.findDirectDependents(targetFile, files);

      // Find transitive dependents (files that depend on direct dependents)
      const transitiveDependents = this.findTransitiveDependents(
        targetFile,
        directDependents,
        files
      );

      // Calculate test coverage for target file
      const testCoverage = this.calculateTestCoverage(targetFile, files);

      // Calculate risk score
      const riskScore = this.calculateRiskScore(
        target,
        directDependents,
        transitiveDependents,
        testCoverage
      );

      // Generate recommendations
      const recommendations = this.generateRecommendations(
        targetFile,
        targetSymbol,
        directDependents,
        transitiveDependents,
        testCoverage,
        riskScore
      );

      const output: RefactorImpactOutput = {
        targetFile,
        targetSymbol,
        directDependents: directDependents.map((f) => f.relativePath),
        transitiveDependents: transitiveDependents.map((f) => f.relativePath),
        totalAffectedFiles: directDependents.length + transitiveDependents.length,
        testCoverage,
        riskScore,
        recommendations,
      };

      console.error(
        `[refactor_impact] Impact analysis complete. Risk score: ${riskScore}/100`
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
      console.error("[refactor_impact] Error:", error);
      throw error;
    }
  }

  private findDirectDependents(targetFile: string, allFiles: any[]): any[] {
    const targetPath = path.resolve(process.cwd(), targetFile);
    const dependents: any[] = [];

    for (const file of allFiles) {
      // Skip the target file itself
      if (file.path === targetPath) continue;

      // Check if this file imports from the target
      for (const dep of file.dependencies) {
        const resolvedDep = this.resolveDependency(dep, file.path);
        if (resolvedDep === targetPath) {
          dependents.push(file);
          break;
        }
      }
    }

    return dependents;
  }

  private findTransitiveDependents(
    targetFile: string,
    directDependents: any[],
    allFiles: any[]
  ): any[] {
    const transitive = new Set<any>();
    const visited = new Set<string>([path.resolve(process.cwd(), targetFile)]);

    // Add direct dependents to visited
    for (const dep of directDependents) {
      visited.add(dep.path);
    }

    // BFS to find transitive dependents
    const queue = [...directDependents];

    while (queue.length > 0) {
      const current = queue.shift()!;

      // Find files that depend on current
      for (const file of allFiles) {
        if (visited.has(file.path)) continue;

        // Check if this file imports from current
        for (const dep of file.dependencies) {
          const resolvedDep = this.resolveDependency(dep, file.path);
          if (resolvedDep === current.path) {
            transitive.add(file);
            visited.add(file.path);
            queue.push(file);
            break;
          }
        }
      }
    }

    return Array.from(transitive);
  }

  private resolveDependency(importPath: string, fromFile: string): string | null {
    // Only handle relative imports for now
    if (!importPath.startsWith(".")) {
      return null;
    }

    const fromDir = path.dirname(fromFile);
    const resolved = path.resolve(fromDir, importPath);

    // Try with various extensions
    for (const ext of [".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.js", ""]) {
      const withExt = resolved + ext;
      if (fs.existsSync(withExt)) {
        return withExt;
      }
    }

    return null;
  }

  private calculateTestCoverage(targetFile: string, allFiles: any[]): number {
    // Simple heuristic: check if there's a corresponding test file
    const targetPath = path.resolve(process.cwd(), targetFile);
    const testPatterns = [
      targetPath.replace(/\.(ts|js)$/, ".test.$1"),
      targetPath.replace(/\.(ts|js)$/, ".spec.$1"),
      targetPath.replace(/\/([^/]+)\.(ts|js)$/, "/__tests__/$1.test.$1"),
    ];

    for (const pattern of testPatterns) {
      if (allFiles.some((f) => f.path === pattern)) {
        return 80; // Assume 80% coverage if test file exists
      }
    }

    return 0; // No test coverage
  }

  private calculateRiskScore(
    target: any,
    directDependents: any[],
    transitiveDependents: any[],
    testCoverage: number
  ): number {
    let risk = 0;

    // Risk increases with number of dependents
    risk += directDependents.length * 5;
    risk += transitiveDependents.length * 2;

    // Risk increases with complexity
    risk += target.complexity * 2;

    // Risk increases with low test coverage
    risk += (100 - testCoverage) * 0.3;

    // Cap at 100
    return Math.min(100, Math.round(risk));
  }

  private generateRecommendations(
    targetFile: string,
    targetSymbol: string | undefined,
    directDependents: any[],
    transitiveDependents: any[],
    testCoverage: number,
    riskScore: number
  ): string[] {
    const recommendations: string[] = [];

    if (riskScore > 70) {
      recommendations.push(
        "⚠️ High risk refactoring. Consider breaking it into smaller changes."
      );
    }

    if (testCoverage < 50) {
      recommendations.push(
        "Add tests for this file before refactoring to ensure behavior is preserved."
      );
    }

    if (directDependents.length > 10) {
      recommendations.push(
        `This file has ${directDependents.length} direct dependents. Consider creating a checkpoint before refactoring.`
      );
    }

    if (transitiveDependents.length > 20) {
      recommendations.push(
        "Large transitive dependency chain detected. Refactor incrementally and run tests frequently."
      );
    }

    if (targetSymbol) {
      recommendations.push(
        `Consider using your IDE's rename refactoring for the symbol '${targetSymbol}' to ensure all references are updated.`
      );
    }

    if (recommendations.length === 0) {
      recommendations.push("✅ Low risk refactoring. Safe to proceed with changes.");
    }

    return recommendations;
  }

  private formatOutput(output: RefactorImpactOutput): string {
    const {
      targetFile,
      targetSymbol,
      directDependents,
      transitiveDependents,
      totalAffectedFiles,
      testCoverage,
      riskScore,
      recommendations,
    } = output;

    const riskEmoji = riskScore > 70 ? "🔴" : riskScore > 40 ? "🟡" : "🟢";
    const riskLabel = riskScore > 70 ? "High" : riskScore > 40 ? "Medium" : "Low";

    return `# Impact Analysis ${riskEmoji}

## Target
- **File**: ${targetFile}
${targetSymbol ? `- **Symbol**: ${targetSymbol}` : ""}

## Blast Radius
- **Direct dependents**: ${directDependents.length} files
- **Transitive dependents**: ${transitiveDependents.length} files
- **Total affected**: ${totalAffectedFiles} files

## Risk Assessment
- **Risk score**: ${riskScore}/100 (${riskLabel})
- **Test coverage**: ${testCoverage}%

${
  directDependents.length > 0
    ? `## Direct Dependents (${directDependents.length})
${directDependents.slice(0, 10).map((f) => `- ${f}`).join("\n")}
${directDependents.length > 10 ? `... and ${directDependents.length - 10} more` : ""}
`
    : ""
}

${
  transitiveDependents.length > 0
    ? `## Transitive Dependents (${transitiveDependents.length})
${transitiveDependents.slice(0, 5).map((f) => `- ${f}`).join("\n")}
${transitiveDependents.length > 5 ? `... and ${transitiveDependents.length - 5} more` : ""}
`
    : ""
}

## Recommendations
${recommendations.map((r) => `- ${r}`).join("\n")}
`;
  }
}
