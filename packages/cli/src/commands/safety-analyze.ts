import { Command } from 'commander';
import { BaseCommand } from './base.js';
import { CommandResult, RefactoringMode } from '../types/index.js';
import { SafetyAnalyzer, SafetyScore } from '../analysis/safety-analyzer.js';
import { Logger } from '../utils/logger.js';
import fs from 'fs';
import path from 'path';

interface SafetyAnalyzeOptions {
  file?: string;
  threshold?: number;
  format?: 'json' | 'table' | 'detailed';
  output?: string;
  includeRecommendations?: boolean;
}

export class SafetyAnalyzeCommand extends BaseCommand {
  private safetyAnalyzer: SafetyAnalyzer;

  constructor(logger: any) {
    super(logger);
    this.safetyAnalyzer = new SafetyAnalyzer(logger);
  }

  async execute(options: SafetyAnalyzeOptions): Promise<CommandResult> {
    this.validateContext();

    const threshold = options.threshold || 70;
    const format = options.format || 'detailed';
    const includeRecommendations = options.includeRecommendations !== false;

    this.logger.info('Starting safety analysis', {
      file: options.file,
      threshold,
      format,
    });

    try {
      let results: Array<{ file: string; score: SafetyScore }> = [];

      if (options.file) {
        // Analyze single file
        const filePath = path.resolve(options.file);
        if (!fs.existsSync(filePath)) {
          return this.failure(`File not found: ${options.file}`);
        }

        const score = await this.safetyAnalyzer.calculateSafetyScore(filePath, {
          includeTestCoverage: true,
          includeChangeFrequency: true,
          projectRoot: this.context!.projectInfo.path,
        });

        results.push({ file: options.file, score });
      } else {
        // Analyze project files
        const files = this.findSourceFiles(this.context!.projectInfo.path, [
          '.ts',
          '.js',
          '.tsx',
          '.jsx',
        ]);
        const maxFiles = 10; // Limit for performance

        for (const file of files.slice(0, maxFiles)) {
          try {
            const score = await this.safetyAnalyzer.calculateSafetyScore(file, {
              includeTestCoverage: true,
              includeChangeFrequency: true,
              projectRoot: this.context!.projectInfo.path,
            });

            const relativePath = path.relative(this.context!.projectInfo.path, file);
            results.push({ file: relativePath, score });
          } catch (error) {
            this.logger.warn('Failed to analyze file', { file, error });
          }
        }
      }

      // Generate report
      const report = this.generateSafetyReport(results, threshold, format, includeRecommendations);

      // Write output
      let outputPath: string;
      if (options.output) {
        outputPath = options.output;
        fs.writeFileSync(outputPath, report);
      } else {
        outputPath = this.writeOutput('safety-analysis.md', report);
      }

      // Calculate summary statistics
      const averageScore = results.reduce((sum, r) => sum + r.score.overall, 0) / results.length;
      const safeFiles = results.filter(r => r.score.overall >= threshold).length;
      const riskyFiles = results.filter(r => r.score.overall < threshold).length;

      this.logger.success('Safety analysis completed', {
        filesAnalyzed: results.length,
        averageScore: Math.round(averageScore),
        safeFiles,
        riskyFiles,
      });

      return this.success(
        `Analyzed ${results.length} files with average safety score of ${Math.round(averageScore)}`,
        [outputPath],
        {
          filesAnalyzed: results.length,
          averageScore: Math.round(averageScore),
          safeFiles,
          riskyFiles,
          threshold,
        }
      );
    } catch (error) {
      return this.failure(
        `Safety analysis failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private findSourceFiles(projectPath: string, extensions: string[]): string[] {
    const files: string[] = [];

    try {
      const entries = fs.readdirSync(projectPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (extensions.includes(ext)) {
            files.push(path.join(projectPath, entry.name));
          }
        } else if (
          entry.isDirectory() &&
          !['node_modules', '.git', 'dist', 'build', '.refactogent'].includes(entry.name)
        ) {
          const subFiles = this.findSourceFiles(path.join(projectPath, entry.name), extensions);
          files.push(...subFiles);
        }
      }
    } catch (error) {
      this.logger.debug('Error reading directory', { path: projectPath, error });
    }

    return files;
  }

  private generateSafetyReport(
    results: Array<{ file: string; score: SafetyScore }>,
    threshold: number,
    format: string,
    includeRecommendations: boolean
  ): string {
    if (format === 'json') {
      return JSON.stringify(results, null, 2);
    }

    if (format === 'table') {
      return this.generateTableReport(results, threshold);
    }

    return this.generateDetailedReport(results, threshold, includeRecommendations);
  }

  private generateTableReport(
    results: Array<{ file: string; score: SafetyScore }>,
    threshold: number
  ): string {
    const header =
      '| File | Overall | Complexity | Test Coverage | API Exposure | Dependencies | Status |\n' +
      '|------|---------|------------|---------------|--------------|--------------|--------|\n';

    const rows = results
      .map(({ file, score }) => {
        const status = score.overall >= threshold ? '✅ Safe' : '⚠️ Risky';
        return `| ${file} | ${score.overall} | ${score.complexity} | ${score.testCoverage} | ${score.apiExposure} | ${score.dependencyFanOut} | ${status} |`;
      })
      .join('\n');

    return header + rows;
  }

  private generateDetailedReport(
    results: Array<{ file: string; score: SafetyScore }>,
    threshold: number,
    includeRecommendations: boolean
  ): string {
    const averageScore = results.reduce((sum, r) => sum + r.score.overall, 0) / results.length;
    const safeFiles = results.filter(r => r.score.overall >= threshold);
    const riskyFiles = results.filter(r => r.score.overall < threshold);

    let report = `# Safety Analysis Report

## Summary
- **Files Analyzed**: ${results.length}
- **Average Safety Score**: ${Math.round(averageScore)}/100
- **Safe Files** (≥${threshold}): ${safeFiles.length}
- **Risky Files** (<${threshold}): ${riskyFiles.length}
- **Analysis Date**: ${new Date().toISOString()}

## Score Breakdown
- **Complexity**: Code complexity and maintainability
- **Test Coverage**: Test coverage and quality
- **API Exposure**: Public API surface area
- **Change Frequency**: How often the file changes
- **Dependencies**: Dependency fan-out and coupling

`;

    // Safe files section
    if (safeFiles.length > 0) {
      report += `## ✅ Safe Files (${safeFiles.length})\n\n`;
      safeFiles.forEach(({ file, score }) => {
        report += `### ${file}\n`;
        report += `- **Overall Score**: ${score.overall}/100\n`;
        report += `- **Complexity**: ${score.complexity}/100\n`;
        report += `- **Test Coverage**: ${score.testCoverage}/100\n`;
        report += `- **API Exposure**: ${score.apiExposure}/100\n`;
        report += `- **Dependencies**: ${score.dependencyFanOut}/100\n\n`;
      });
    }

    // Risky files section
    if (riskyFiles.length > 0) {
      report += `## ⚠️ Risky Files (${riskyFiles.length})\n\n`;
      riskyFiles.forEach(({ file, score }) => {
        report += `### ${file}\n`;
        report += `- **Overall Score**: ${score.overall}/100 ⚠️\n`;
        report += `- **Complexity**: ${score.complexity}/100\n`;
        report += `- **Test Coverage**: ${score.testCoverage}/100\n`;
        report += `- **API Exposure**: ${score.apiExposure}/100\n`;
        report += `- **Dependencies**: ${score.dependencyFanOut}/100\n`;

        if (includeRecommendations && score.recommendations.length > 0) {
          report += `\n**Recommendations:**\n`;
          score.recommendations.forEach(rec => {
            const icon = rec.type === 'warning' ? '⚠️' : rec.type === 'suggestion' ? '💡' : 'ℹ️';
            report += `- ${icon} **${rec.category}**: ${rec.message}\n`;
            if (rec.details) {
              report += `  - ${rec.details}\n`;
            }
          });
        }
        report += '\n';
      });
    }

    // Overall recommendations
    report += `## 📋 Overall Recommendations\n\n`;

    if (riskyFiles.length === 0) {
      report += `✅ All files appear safe for refactoring!\n\n`;
    } else {
      report += `⚠️ ${riskyFiles.length} files require attention before refactoring:\n\n`;

      const highRiskFiles = riskyFiles.filter(r => r.score.overall < 50);
      if (highRiskFiles.length > 0) {
        report += `**High Risk Files** (score < 50):\n`;
        highRiskFiles.forEach(({ file }) => {
          report += `- ${file}\n`;
        });
        report += '\n';
      }

      const mediumRiskFiles = riskyFiles.filter(
        r => r.score.overall >= 50 && r.score.overall < threshold
      );
      if (mediumRiskFiles.length > 0) {
        report += `**Medium Risk Files** (score ${50}-${threshold - 1}):\n`;
        mediumRiskFiles.forEach(({ file }) => {
          report += `- ${file}\n`;
        });
        report += '\n';
      }
    }

    report += `## 🛡️ Safety Guidelines\n\n`;
    report += `- **Score ≥ 80**: Very safe for refactoring\n`;
    report += `- **Score 70-79**: Generally safe, review recommendations\n`;
    report += `- **Score 50-69**: Proceed with caution, address major issues\n`;
    report += `- **Score < 50**: High risk, significant preparation needed\n\n`;

    report += `Generated by Refactogent Safety Analyzer\n`;

    return report;
  }
}

/**
 * Create the safety-analyze command for the CLI
 */
export function createSafetyAnalyzeCommand(): Command {
  const command = new Command('safety-analyze')
    .description('Analyze project safety for refactoring operations')
    .option('--file <path>', 'Analyze specific file instead of entire project')
    .option('--threshold <number>', 'Safety threshold (0-100)', '70')
    .option('--format <format>', 'Output format: json | table | detailed', 'detailed')
    .option('--output <path>', 'Output file path')
    .option('--no-recommendations', 'Exclude recommendations from output')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.parent?.parent?.opts() || {};

      // Initialize CLI context (simplified for this command)
      const logger = new Logger(globalOpts.verbose);

      try {
        // Create command instance
        const safetyCommand = new SafetyAnalyzeCommand(logger);

        // Set up minimal context
        const projectPath = globalOpts.project || process.cwd();
        const outputDir = path.resolve(projectPath, globalOpts.output || '.refactogent/out');

        // Ensure output directory exists
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }

        // Mock context for this command
        const context = {
          config: {
            version: '1.0',
            maxPrLoc: 300,
            branchPrefix: 'refactor/',
            protectedPaths: [],
            modesAllowed: [
              'organize-only',
              'name-hygiene',
              'tests-first',
              'micro-simplify',
            ] as RefactoringMode[],
            gates: {
              requireCharacterizationTests: true,
              requireGreenCi: true,
              minLineCoverageDelta: '0%',
              minBranchCoverageDelta: '0%',
              mutationScoreThreshold: 80,
              forbidPublicApiChanges: false,
              forbidDependencyChanges: false,
            },
            languages: {
              typescript: { build: 'tsc', test: 'jest', lints: ['eslint'] },
              javascript: { build: 'babel', test: 'jest', lints: ['eslint'] },
            },
          },
          projectInfo: {
            path: projectPath,
            type: 'mixed' as const,
            languages: ['typescript', 'javascript'],
            hasTests: true,
            hasConfig: false,
          },
          outputDir,
          verbose: globalOpts.verbose || false,
        };

        safetyCommand.setContext(context);

        // Execute command
        const result = await safetyCommand.execute({
          file: opts.file,
          threshold: parseInt(opts.threshold, 10),
          format: opts.format,
          output: opts.output,
          includeRecommendations: opts.recommendations !== false,
        });

        if (result.success) {
          console.log(`✅ ${result.message}`);
          if (result.artifacts) {
            console.log(`📁 Generated files: ${result.artifacts.join(', ')}`);
          }
          if (result.data) {
            console.log(`📊 Files analyzed: ${result.data.filesAnalyzed}`);
            console.log(`🎯 Average score: ${result.data.averageScore}/100`);
            if (result.data.riskyFiles > 0) {
              console.log(`⚠️  Risky files: ${result.data.riskyFiles}`);
            }
          }
        } else {
          console.error(`❌ ${result.message}`);
          process.exit(1);
        }
      } catch (error) {
        logger.error('Safety analysis failed', { error });
        console.error(
          `❌ Safety analysis failed: ${error instanceof Error ? error.message : String(error)}`
        );
        process.exit(1);
      }
    });

  return command;
}
