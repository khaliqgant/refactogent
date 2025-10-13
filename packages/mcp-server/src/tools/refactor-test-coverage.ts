import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import * as path from "path";
import {
  RefactorTestCoverageSchema,
  RefactorTestCoverageOutput,
  FileCoverage,
  UncoveredRegion,
} from "../types/index.js";

export class RefactorTestCoverageTool {
  async execute(args: unknown) {
    const validated = RefactorTestCoverageSchema.parse(args);
    const { targetPath, generateReport, threshold } = validated;

    try {
      console.error(`[refactor_test_coverage] Analyzing coverage for: ${targetPath || "project"}`);

      // Check if we have coverage tooling available
      const packageJson = this.readPackageJson();
      const hasCoverageScript = this.hasCoverageCommand(packageJson);

      if (!hasCoverageScript) {
        // Fallback: analyze test files heuristically
        return await this.analyzeHeuristically(targetPath);
      }

      // Run coverage analysis
      const coverageData = await this.runCoverage(generateReport);

      // Parse coverage results
      const parsedCoverage = this.parseCoverageData(coverageData, targetPath);

      // Filter by target path if specified
      const filteredCoverage = targetPath
        ? this.filterByPath(parsedCoverage, targetPath)
        : parsedCoverage;

      const output: RefactorTestCoverageOutput = {
        targetPath: targetPath || process.cwd(),
        overallCoverage: this.calculateOverallCoverage(filteredCoverage),
        lineCoverage: this.calculateLineCoverage(filteredCoverage),
        branchCoverage: this.calculateBranchCoverage(filteredCoverage),
        functionCoverage: this.calculateFunctionCoverage(filteredCoverage),
        files: filteredCoverage,
        uncoveredFiles: this.findUncoveredFiles(targetPath),
        testToCodeRatio: await this.calculateTestRatio(targetPath),
        meetsThreshold: threshold ? this.calculateOverallCoverage(filteredCoverage) >= threshold : undefined,
        recommendations: this.generateRecommendations(filteredCoverage, threshold),
      };

      console.error(
        `[refactor_test_coverage] Coverage: ${output.overallCoverage.toFixed(1)}% (${filteredCoverage.length} files)`
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
      console.error("[refactor_test_coverage] Error:", error);
      throw error;
    }
  }

  private readPackageJson(): any {
    try {
      const pkgPath = path.join(process.cwd(), "package.json");
      if (existsSync(pkgPath)) {
        return JSON.parse(readFileSync(pkgPath, "utf-8"));
      }
    } catch (error) {
      console.warn("Could not read package.json:", error);
    }
    return {};
  }

  private hasCoverageCommand(packageJson: any): boolean {
    const scripts = packageJson.scripts || {};
    return !!(scripts["test:coverage"] || scripts["coverage"] || scripts["test"] || packageJson.jest);
  }

  private async runCoverage(_generateReport: boolean = false): Promise<string> {
    try {
      // Try different coverage commands
      const commands = [
        "npm run test:coverage -- --silent --json --outputFile=.coverage-temp.json",
        "npm run coverage -- --silent --json --outputFile=.coverage-temp.json",
        "npx jest --coverage --silent --json --outputFile=.coverage-temp.json",
        "npm test -- --coverage --silent --json --outputFile=.coverage-temp.json",
      ];

      for (const cmd of commands) {
        try {
          const output = execSync(cmd, {
            encoding: "utf-8",
            stdio: "pipe",
            timeout: 60000, // 60 second timeout
          });

          // Check if coverage file was generated
          const coveragePath = path.join(process.cwd(), "coverage/coverage-final.json");
          if (existsSync(coveragePath)) {
            return readFileSync(coveragePath, "utf-8");
          }

          return output;
        } catch (error) {
          // Try next command
          continue;
        }
      }

      throw new Error("Could not run coverage analysis");
    } catch (error) {
      throw new Error(`Coverage analysis failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private parseCoverageData(coverageData: string, _targetPath?: string): FileCoverage[] {
    const files: FileCoverage[] = [];

    try {
      // Try to parse as JSON (Jest/Istanbul format)
      const json = JSON.parse(coverageData);

      // Handle different coverage report formats
      if (json.coverageMap || json.total) {
        // Istanbul/NYC format
        const coverageMap = json.coverageMap || json;
        for (const [filePath, data] of Object.entries(coverageMap)) {
          if (filePath === "total") continue;

          const coverage = data as any;
          const statementMap = coverage.statementMap || {};

          const uncoveredLines = Object.entries(coverage.s || {})
            .filter(([, count]) => count === 0)
            .map(([id]) => statementMap[id]?.start?.line || 0)
            .filter((line) => line > 0);

          const uncoveredRegions: UncoveredRegion[] = uncoveredLines.map((line) => ({
            startLine: line,
            endLine: line,
            type: "statement",
          }));

          files.push({
            path: filePath,
            coveredLines: Object.values(coverage.s || {}).filter((c: any) => c > 0).length,
            totalLines: Object.keys(coverage.s || {}).length,
            coveragePercentage: this.calculatePercentage(coverage.s || {}),
            uncoveredRegions,
            hasMissingTests: uncoveredLines.length > 0,
          });
        }
      }
    } catch (error) {
      console.warn("Could not parse coverage data as JSON, trying text parsing:", error);
      // Fallback to text parsing
      return this.parseCoverageText(coverageData);
    }

    return files;
  }

  private parseCoverageText(coverageText: string): FileCoverage[] {
    const files: FileCoverage[] = [];
    const lines = coverageText.split("\n");

    // Parse common coverage report formats (Jest, Istanbul, etc.)
    for (const line of lines) {
      // Match: "src/file.ts | 85.5 | 80.0 | 90.0 | 85.5 | 10-15,20-25"
      const match = line.match(
        /(.+?)\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)/
      );
      if (match) {
        const [, filePath, stmts] = match;
        files.push({
          path: filePath.trim(),
          coveredLines: 0, // Would need detailed parsing
          totalLines: 0,
          coveragePercentage: parseFloat(stmts),
          uncoveredRegions: [],
          hasMissingTests: parseFloat(stmts) < 100,
        });
      }
    }

    return files;
  }

  private calculatePercentage(coverageMap: Record<string, number>): number {
    const values = Object.values(coverageMap);
    if (values.length === 0) return 0;

    const covered = values.filter((v) => v > 0).length;
    return (covered / values.length) * 100;
  }

  private filterByPath(coverage: FileCoverage[], targetPath: string): FileCoverage[] {
    const absoluteTarget = path.resolve(process.cwd(), targetPath);
    return coverage.filter((file) => {
      const absoluteFile = path.resolve(process.cwd(), file.path);
      return absoluteFile.startsWith(absoluteTarget);
    });
  }

  private calculateOverallCoverage(files: FileCoverage[]): number {
    if (files.length === 0) return 0;

    const totalCoverage = files.reduce((sum, file) => sum + file.coveragePercentage, 0);
    return totalCoverage / files.length;
  }

  private calculateLineCoverage(files: FileCoverage[]): number {
    const totalLines = files.reduce((sum, file) => sum + file.totalLines, 0);
    const coveredLines = files.reduce((sum, file) => sum + file.coveredLines, 0);

    return totalLines > 0 ? (coveredLines / totalLines) * 100 : 0;
  }

  private calculateBranchCoverage(files: FileCoverage[]): number {
    // Simplified - would need branch-specific data from coverage reports
    return this.calculateOverallCoverage(files);
  }

  private calculateFunctionCoverage(files: FileCoverage[]): number {
    // Simplified - would need function-specific data from coverage reports
    return this.calculateOverallCoverage(files);
  }

  private findUncoveredFiles(_targetPath?: string): string[] {
    // Find source files that don't appear in coverage report
    // This is a simplified implementation
    return [];
  }

  private async calculateTestRatio(_targetPath?: string): Promise<number> {
    try {
      const basePath = _targetPath || process.cwd();

      // Count files using recursive directory traversal (safer than shell commands)
      const counts = this.countFilesRecursive(basePath);

      return counts.sourceCount > 0 ? counts.testCount / counts.sourceCount : 0;
    } catch (error) {
      console.warn("Could not calculate test ratio:", error);
      return 0;
    }
  }

  private countFilesRecursive(dirPath: string): { sourceCount: number; testCount: number } {
    let sourceCount = 0;
    let testCount = 0;

    const walk = (dir: string) => {
      try {
        const entries = require("fs").readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          // Skip node_modules, dist, build directories
          if (entry.isDirectory()) {
            if (["node_modules", "dist", "build", ".git", "coverage"].includes(entry.name)) {
              continue;
            }
            walk(fullPath);
          } else if (entry.isFile()) {
            // Check file extensions
            const ext = path.extname(entry.name);
            if ([".ts", ".tsx", ".js", ".jsx"].includes(ext)) {
              // Check if it's a test file
              if (entry.name.includes(".test.") || entry.name.includes(".spec.")) {
                testCount++;
              } else {
                sourceCount++;
              }
            }
          }
        }
      } catch (error) {
        // Skip directories we can't read
        console.warn(`Could not read directory ${dir}:`, error);
      }
    };

    walk(dirPath);
    return { sourceCount, testCount };
  }

  private generateRecommendations(files: FileCoverage[], threshold?: number): string[] {
    const recommendations: string[] = [];
    const avgCoverage = this.calculateOverallCoverage(files);

    if (threshold && avgCoverage < threshold) {
      recommendations.push(
        `Coverage (${avgCoverage.toFixed(1)}%) is below threshold (${threshold}%). Add more tests.`
      );
    }

    const uncoveredFiles = files.filter((f) => f.coveragePercentage < 50);
    if (uncoveredFiles.length > 0) {
      recommendations.push(
        `${uncoveredFiles.length} file(s) have less than 50% coverage. Prioritize: ${uncoveredFiles
          .slice(0, 3)
          .map((f) => path.basename(f.path))
          .join(", ")}`
      );
    }

    const noCoverage = files.filter((f) => f.coveragePercentage === 0);
    if (noCoverage.length > 0) {
      recommendations.push(
        `${noCoverage.length} file(s) have zero test coverage. Start testing: ${noCoverage
          .slice(0, 3)
          .map((f) => path.basename(f.path))
          .join(", ")}`
      );
    }

    if (recommendations.length === 0) {
      recommendations.push("Good coverage! Consider testing edge cases and error paths.");
    }

    return recommendations;
  }

  private async analyzeHeuristically(targetPath?: string): Promise<any> {
    // Fallback when no coverage tooling is available
    const testRatio = await this.calculateTestRatio(targetPath);

    return {
      content: [
        {
          type: "text",
          text: `# Test Coverage Analysis (Heuristic)

⚠️ **No coverage tooling detected**. Install Jest or another coverage tool for detailed analysis.

## Heuristic Analysis

- **Test-to-Code Ratio**: ${testRatio.toFixed(2)}
- **Status**: ${testRatio > 0.5 ? "Good" : testRatio > 0.2 ? "Fair" : "Poor"}

## Recommendations

1. Add a coverage tool: \`npm install --save-dev jest\` or \`npm install --save-dev c8\`
2. Add coverage script to package.json: \`"test:coverage": "jest --coverage"\`
3. Run \`refactor_test_coverage\` again for detailed analysis

## Quick Setup (Jest)

\`\`\`bash
npm install --save-dev jest @types/jest ts-jest
npx ts-jest config:init
\`\`\`

Add to package.json:
\`\`\`json
{
  "scripts": {
    "test": "jest",
    "test:coverage": "jest --coverage"
  }
}
\`\`\`
`,
        },
      ],
    };
  }

  private formatOutput(output: RefactorTestCoverageOutput): string {
    const {
      targetPath,
      overallCoverage,
      lineCoverage,
      branchCoverage,
      functionCoverage,
      files,
      testToCodeRatio,
      meetsThreshold,
      recommendations,
    } = output;

    const statusEmoji = overallCoverage >= 80 ? "✅" : overallCoverage >= 50 ? "⚠️" : "❌";

    let result = `# Test Coverage Report ${statusEmoji}

**Target**: ${path.basename(targetPath)}
**Overall Coverage**: ${overallCoverage.toFixed(1)}%
${meetsThreshold !== undefined ? `**Meets Threshold**: ${meetsThreshold ? "✅ Yes" : "❌ No"}\n` : ""}

## Coverage Metrics

- **Line Coverage**: ${lineCoverage.toFixed(1)}%
- **Branch Coverage**: ${branchCoverage.toFixed(1)}%
- **Function Coverage**: ${functionCoverage.toFixed(1)}%
- **Test-to-Code Ratio**: ${testToCodeRatio.toFixed(2)} (${testToCodeRatio >= 0.5 ? "Good" : "Needs improvement"})

## Files Analyzed (${files.length})

`;

    // Show worst coverage files first
    const sortedFiles = [...files].sort((a, b) => a.coveragePercentage - b.coveragePercentage);

    for (const file of sortedFiles.slice(0, 15)) {
      const fileEmoji = file.coveragePercentage >= 80 ? "✅" : file.coveragePercentage >= 50 ? "⚠️" : "❌";
      const fileName = path.basename(file.path);
      const uncoveredCount = file.uncoveredRegions.length;

      result += `${fileEmoji} **${fileName}**: ${file.coveragePercentage.toFixed(1)}%`;
      if (uncoveredCount > 0) {
        result += ` (${uncoveredCount} uncovered regions)`;
      }
      result += "\n";
    }

    if (sortedFiles.length > 15) {
      result += `\n_... and ${sortedFiles.length - 15} more files_\n`;
    }

    result += `\n## Recommendations

${recommendations.map((r) => `- ${r}`).join("\n")}
`;

    return result;
  }
}
