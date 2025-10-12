import { CodebaseIndexer } from "@refactogent/core";
import { ProjectHealth } from "../types/index.js";

export class ProjectHealthResource {
  async getHealth(): Promise<ProjectHealth> {
    try {
      console.error("[project-health] Generating health report...");

      // Index the codebase
      const indexer = new CodebaseIndexer({
        rootPath: process.cwd(),
        includeTests: true,
      });

      const files = await indexer.indexCodebase();

      // Calculate metrics
      const totalFiles = files.length;
      const totalLines = files.reduce((acc: number, f: any) => acc + (f.size || 0), 0);
      const complexities = files.map((f: any) => f.complexity);
      const averageComplexity =
        complexities.reduce((a: number, b: number) => a + b, 0) / complexities.length || 0;

      // Estimate test coverage (simple heuristic)
      const testFiles = files.filter((f: any) => f.isTestFile).length;
      const sourceFiles = files.filter((f: any) => !f.isTestFile).length;
      const testCoverage = sourceFiles > 0 ? (testFiles / sourceFiles) * 100 : 0;

      // Identify opportunities
      const opportunities = this.identifyOpportunities(files);

      // Calculate overall score
      const overallScore = this.calculateOverallScore(
        averageComplexity,
        testCoverage,
        opportunities
      );

      // Generate recommendations
      const recommendations = this.generateRecommendations(
        averageComplexity,
        testCoverage,
        opportunities
      );

      const health: ProjectHealth = {
        overallScore,
        metrics: {
          totalFiles,
          totalLines,
          averageComplexity,
          testCoverage,
        },
        opportunities: {
          typeAbstractions: opportunities.typeAbstractions,
          duplicateCode: opportunities.duplicateCode,
          complexFunctions: opportunities.complexFunctions,
        },
        recommendations,
      };

      console.error(`[project-health] Health score: ${overallScore}/100`);

      return health;
    } catch (error) {
      console.error("[project-health] Error generating health report:", error);
      throw error;
    }
  }

  private identifyOpportunities(files: any[]): {
    typeAbstractions: number;
    duplicateCode: number;
    complexFunctions: number;
  } {
    let typeAbstractions = 0;
    let complexFunctions = 0;

    for (const file of files) {
      // Count potential type abstractions
      // (types/interfaces defined in implementation files)
      const hasImplementation = file.symbols.some(
        (s: any) => s.type === "function" || s.type === "class"
      );
      const hasTypes = file.symbols.some(
        (s: any) => s.type === "interface" || s.type === "type"
      );

      if (hasImplementation && hasTypes) {
        typeAbstractions += file.symbols.filter(
          (s: any) => s.type === "interface" || s.type === "type"
        ).length;
      }

      // Count complex functions
      complexFunctions += file.symbols.filter((s: any) => s.complexity && s.complexity > 10)
        .length;

      // Duplicate code detection would require more sophisticated analysis
      // For now, just flag files with similar names as potential duplicates
    }

    return {
      typeAbstractions,
      duplicateCode: 0, // TODO: Implement duplicate detection
      complexFunctions,
    };
  }

  private calculateOverallScore(
    averageComplexity: number,
    testCoverage: number,
    opportunities: { typeAbstractions: number; duplicateCode: number; complexFunctions: number }
  ): number {
    let score = 100;

    // Penalize for high complexity (0-30 points)
    if (averageComplexity > 10) {
      score -= Math.min(30, (averageComplexity - 10) * 3);
    }

    // Penalize for low test coverage (0-40 points)
    score -= (100 - testCoverage) * 0.4;

    // Penalize for refactoring opportunities (0-30 points)
    const totalOpportunities =
      opportunities.typeAbstractions +
      opportunities.duplicateCode +
      opportunities.complexFunctions;

    score -= Math.min(30, totalOpportunities * 0.5);

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  private generateRecommendations(
    averageComplexity: number,
    testCoverage: number,
    opportunities: { typeAbstractions: number; duplicateCode: number; complexFunctions: number }
  ): string[] {
    const recommendations: string[] = [];

    if (testCoverage < 50) {
      recommendations.push(
        `Increase test coverage (currently ${testCoverage.toFixed(1)}%). Use refactor_context to identify untested files.`
      );
    }

    if (averageComplexity > 10) {
      recommendations.push(
        `Reduce average complexity (currently ${averageComplexity.toFixed(1)}). Use refactor_suggest with focus='complexity' to get suggestions.`
      );
    }

    if (opportunities.typeAbstractions > 0) {
      recommendations.push(
        `${opportunities.typeAbstractions} type abstraction opportunities found. Use refactor_suggest with focus='types' to get suggestions.`
      );
    }

    if (opportunities.complexFunctions > 10) {
      recommendations.push(
        `${opportunities.complexFunctions} complex functions detected. Consider breaking them into smaller, more focused functions.`
      );
    }

    if (recommendations.length === 0) {
      recommendations.push(
        "✅ Project health looks good! Continue maintaining code quality standards."
      );
    }

    return recommendations;
  }
}
