import * as path from "path";
import * as fs from "fs";
import { CodebaseIndexer, RefactorableFile } from "@refactogent/core";
import {
  RefactorContextSchema,
  RefactorContextOutput,
  FileInfo,
  DependencyGraph,
  CoverageInfo,
  ComplexityMetrics,
} from "../types/index.js";

export class RefactorContextTool {
  async execute(args: unknown) {
    const validated = RefactorContextSchema.parse(args);
    const { path: targetPath, includeTests, includeDependencies } = validated;

    try {
      console.error(`[refactor_context] Analyzing: ${targetPath}`);

      // Resolve absolute path
      const absolutePath = path.resolve(process.cwd(), targetPath);

      // Check if path exists
      if (!fs.existsSync(absolutePath)) {
        throw new Error(`Path does not exist: ${targetPath}`);
      }

      // Determine if it's a file or directory
      const stats = fs.statSync(absolutePath);
      const isDirectory = stats.isDirectory();

      // Index the codebase
      const indexer = new CodebaseIndexer({
        rootPath: isDirectory ? absolutePath : path.dirname(absolutePath),
        includeTests,
      });

      let refactorableFiles: RefactorableFile[] = await indexer.indexCodebase();

      // If analyzing a single file, filter to just that file
      if (!isDirectory) {
        refactorableFiles = refactorableFiles.filter((f) => f.path === absolutePath);
      }

      console.error(`[refactor_context] Found ${refactorableFiles.length} files`);

      // Convert to FileInfo format
      const files: FileInfo[] = refactorableFiles.map((f) => ({
        path: f.path,
        relativePath: f.relativePath,
        language: f.language,
        size: f.size,
        symbols: f.symbols.map((s: any) => ({
          name: s.name,
          type: s.type,
          startLine: s.startLine,
          endLine: s.endLine,
          isExported: s.isExported,
          complexity: undefined, // TODO: Calculate complexity per symbol
        })),
        exports: f.symbols.filter((s: any) => s.isExported).map((s: any) => s.name),
        imports: f.dependencies.map((dep: any) => ({
          source: dep,
          symbols: [], // TODO: Extract imported symbols
          isTypeOnly: false,
        })),
        complexity: f.complexity,
      }));

      // Build dependency graph
      let dependencyGraph: DependencyGraph = {
        nodes: [],
        edges: [],
      };

      if (includeDependencies) {
        dependencyGraph = this.buildDependencyGraph(files);
      }

      // Calculate test coverage (placeholder)
      const coverageInfo: CoverageInfo = {
        covered: 0,
        total: files.length,
        percentage: 0,
        uncoveredFiles: files.map((f) => f.relativePath),
      };

      // Calculate complexity metrics
      const complexities = files.map((f) => f.complexity);
      const complexityMetrics: ComplexityMetrics = {
        averageComplexity:
          complexities.reduce((a, b) => a + b, 0) / complexities.length || 0,
        maxComplexity: Math.max(...complexities, 0),
        filesAboveThreshold: files.filter((f) => f.complexity > 10).map((f) => f.relativePath),
      };

      // Calculate safety score (0-100, higher = safer to refactor)
      const safetyScore = this.calculateSafetyScore(
        files,
        coverageInfo,
        complexityMetrics
      );

      const output: RefactorContextOutput = {
        files,
        dependencies: dependencyGraph,
        testCoverage: coverageInfo,
        complexityMetrics,
        safetyScore,
      };

      console.error(
        `[refactor_context] Analysis complete. Safety score: ${safetyScore.toFixed(1)}/100`
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
      console.error("[refactor_context] Error:", error);
      throw error;
    }
  }

  private buildDependencyGraph(files: FileInfo[]): DependencyGraph {
    const nodes = files.map((f) => f.relativePath);
    const edges: { from: string; to: string; symbols: string[] }[] = [];

    for (const file of files) {
      for (const imp of file.imports) {
        // Try to resolve the import to a file in our analyzed set
        const targetFile = this.resolveImport(imp.source, file.path, files);
        if (targetFile) {
          edges.push({
            from: file.relativePath,
            to: targetFile.relativePath,
            symbols: imp.symbols,
          });
        }
      }
    }

    return { nodes, edges };
  }

  private resolveImport(
    importSource: string,
    fromFile: string,
    allFiles: FileInfo[]
  ): FileInfo | null {
    // Simple resolution - just match relative imports
    if (importSource.startsWith(".")) {
      const fromDir = path.dirname(fromFile);
      const resolved = path.resolve(fromDir, importSource);

      // Try with various extensions
      for (const ext of [".ts", ".tsx", ".js", ".jsx", ""]) {
        const withExt = resolved + ext;
        const found = allFiles.find((f) => f.path === withExt);
        if (found) return found;
      }
    }
    return null;
  }

  private calculateSafetyScore(
    files: FileInfo[],
    coverage: CoverageInfo,
    complexity: ComplexityMetrics
  ): number {
    let score = 100;

    // Penalize for low test coverage
    score -= (100 - coverage.percentage) * 0.3;

    // Penalize for high complexity
    if (complexity.averageComplexity > 10) {
      score -= (complexity.averageComplexity - 10) * 2;
    }

    // Penalize for many high-complexity files
    score -= complexity.filesAboveThreshold.length * 2;

    // Ensure score is between 0 and 100
    return Math.max(0, Math.min(100, score));
  }

  private formatOutput(output: RefactorContextOutput): string {
    const { files, dependencies, testCoverage, complexityMetrics, safetyScore } = output;

    return `# Codebase Context Analysis

## Summary
- **Files analyzed**: ${files.length}
- **Total symbols**: ${files.reduce((acc, f) => acc + f.symbols.length, 0)}
- **Safety score**: ${safetyScore.toFixed(1)}/100 ${this.getSafetyEmoji(safetyScore)}

## Complexity Metrics
- **Average complexity**: ${complexityMetrics.averageComplexity.toFixed(1)}
- **Max complexity**: ${complexityMetrics.maxComplexity}
- **High complexity files**: ${complexityMetrics.filesAboveThreshold.length}

## Test Coverage
- **Coverage**: ${testCoverage.percentage.toFixed(1)}%
- **Covered files**: ${testCoverage.covered}/${testCoverage.total}

## Dependency Graph
- **Nodes**: ${dependencies.nodes.length}
- **Edges**: ${dependencies.edges.length}

## Files
${files
  .slice(0, 10)
  .map(
    (f) => `- ${f.relativePath} (${f.symbols.length} symbols, complexity: ${f.complexity})`
  )
  .join("\n")}
${files.length > 10 ? `\n... and ${files.length - 10} more files` : ""}

## Recommendations
${this.generateRecommendations(output).map((r) => `- ${r}`).join("\n")}
`;
  }

  private getSafetyEmoji(score: number): string {
    if (score >= 80) return "✅";
    if (score >= 60) return "⚠️";
    return "❌";
  }

  private generateRecommendations(output: RefactorContextOutput): string[] {
    const recommendations: string[] = [];

    if (output.safetyScore < 70) {
      recommendations.push(
        "Consider improving test coverage and reducing complexity before refactoring"
      );
    }

    if (output.complexityMetrics.filesAboveThreshold.length > 0) {
      recommendations.push(
        `${output.complexityMetrics.filesAboveThreshold.length} files have high complexity - prioritize these for refactoring`
      );
    }

    if (output.testCoverage.percentage < 50) {
      recommendations.push("Add tests before refactoring to ensure behavior is preserved");
    }

    if (recommendations.length === 0) {
      recommendations.push("Codebase looks good! Safe to proceed with refactoring.");
    }

    return recommendations;
  }
}
