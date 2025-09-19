import { BaseCommand } from './base.js';
import { ASTService } from '../analysis/ast-service.js';
import { ProjectAnalyzer } from '../utils/project.js';
import fs from 'fs';
import path from 'path';

interface ASTAnalyzeOptions {
  project: string;
  output: string;
  format: 'json' | 'html' | 'markdown';
  symbols: boolean;
  complexity: boolean;
  dependencies: boolean;
  verbose: boolean;
}

export class ASTAnalyzeCommand extends BaseCommand {
  async execute(options: ASTAnalyzeOptions): Promise<any> {
    try {
      this.logger.info('Starting AST analysis', {
        project: options.project,
        format: options.format,
      });

      // Analyze project type first
      const projectAnalyzer = new ProjectAnalyzer(this.logger);
      const projectInfo = await projectAnalyzer.analyzeProject(options.project);

      if (!projectInfo) {
        return this.failure('Could not analyze project structure');
      }

      // Perform AST analysis
      const astService = new ASTService(this.logger);
      const analysis = await astService.analyzeProject(options.project, projectInfo.type);

      // Display summary
      this.displaySummary(analysis, options.verbose);

      // Save detailed report
      const reportPath = await this.saveReport(analysis, options);

      return this.success('AST analysis completed', [reportPath], {
        languages: analysis.languages,
        totalSymbols: analysis.unifiedSymbols.length,
        totalFiles: analysis.overallMetrics.totalFiles,
        architecturalScore: analysis.overallMetrics.architecturalScore,
        recommendations: analysis.recommendations.length,
        reportPath,
      });
    } catch (error) {
      this.logger.error('AST analysis failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return this.failure(
        `AST analysis failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private displaySummary(analysis: any, verbose: boolean): void {
    console.log('\n🔍 AST Analysis Summary');
    console.log('======================');
    console.log(`Project: ${path.basename(analysis.projectPath)}`);
    console.log(`Languages: ${analysis.languages.join(', ')}`);
    console.log(`Total Files: ${analysis.overallMetrics.totalFiles}`);
    console.log(`Total Symbols: ${analysis.overallMetrics.totalSymbols}`);
    console.log(`Lines of Code: ${analysis.overallMetrics.totalLOC}`);
    console.log(`Public API Count: ${analysis.overallMetrics.publicAPICount}`);
    console.log(`Average Complexity: ${analysis.overallMetrics.averageComplexity}`);
    console.log(`Max Complexity: ${analysis.overallMetrics.maxComplexity}`);
    console.log(`Architectural Score: ${analysis.overallMetrics.architecturalScore}/100`);

    // API Surface Summary
    console.log('\n🌐 API Surface:');
    console.log(`  HTTP Endpoints: ${analysis.apiSurface.summary.httpEndpoints}`);
    console.log(`  CLI Commands: ${analysis.apiSurface.summary.cliCommands}`);
    console.log(`  Public Functions: ${analysis.apiSurface.summary.publicFunctions}`);
    console.log(`  Public Classes: ${analysis.apiSurface.summary.publicClasses}`);
    console.log(
      `  Frameworks: ${analysis.apiSurface.summary.frameworks.join(', ') || 'None detected'}`
    );
    console.log(`  Risk Score: ${analysis.apiSurface.summary.riskScore}/100`);

    // Show language breakdown
    console.log('\n📊 Language Breakdown:');
    for (const [language, ast] of analysis.astByLanguage) {
      console.log(`  ${language}:`);
      console.log(`    Files: ${ast.modules.length}`);
      console.log(`    Symbols: ${ast.metrics.publicAPICount}`);
      console.log(`    Avg Complexity: ${ast.metrics.averageComplexity}`);
      if (ast.metrics.circularDependencies.length > 0) {
        console.log(`    ⚠️  Circular Dependencies: ${ast.metrics.circularDependencies.length}`);
      }
    }

    // Show recommendations
    if (analysis.recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      analysis.recommendations.forEach((rec: any, index: number) => {
        const icon = rec.severity === 'high' ? '🔴' : rec.severity === 'medium' ? '🟡' : '🟢';
        console.log(`  ${icon} ${rec.title}`);
        if (verbose) {
          console.log(`     ${rec.description}`);
          console.log(`     Suggestion: ${rec.suggestion}`);
        }
      });

      if (!verbose && analysis.recommendations.length > 3) {
        console.log(
          `  ... and ${analysis.recommendations.length - 3} more (use --verbose for full list)`
        );
      }
    }

    // Show complexity hotspots
    if (verbose) {
      const astService = new ASTService(this.logger);
      const hotspots = astService.getComplexityHotspots(analysis, 5);
      if (hotspots.length > 0) {
        console.log('\n🔥 Complexity Hotspots:');
        hotspots.slice(0, 5).forEach(symbol => {
          console.log(
            `  ${symbol.name} (${symbol.type}) - ${symbol.location.file}:${symbol.location.startLine}`
          );
        });
      }

      // Show circular dependencies
      const cycles = astService.detectCircularDependencies(analysis);
      if (cycles.length > 0) {
        console.log('\n🔄 Circular Dependencies:');
        cycles.slice(0, 3).forEach((cycle, index) => {
          console.log(`  ${index + 1}. ${cycle.join(' → ')}`);
        });
      }

      // Show API endpoints
      if (analysis.apiSurface.httpRoutes.length > 0) {
        console.log('\n🌐 HTTP Endpoints:');
        analysis.apiSurface.httpRoutes.slice(0, 5).forEach((route: any) => {
          console.log(`  ${route.method} ${route.path} (${route.framework})`);
        });
        if (analysis.apiSurface.httpRoutes.length > 5) {
          console.log(`  ... and ${analysis.apiSurface.httpRoutes.length - 5} more`);
        }
      }

      if (analysis.apiSurface.cliCommands.length > 0) {
        console.log('\n⌨️  CLI Commands:');
        analysis.apiSurface.cliCommands.slice(0, 5).forEach((cmd: any) => {
          console.log(`  ${cmd.command} (${cmd.framework})`);
        });
        if (analysis.apiSurface.cliCommands.length > 5) {
          console.log(`  ... and ${analysis.apiSurface.cliCommands.length - 5} more`);
        }
      }
    }
  }

  private async saveReport(analysis: any, options: ASTAnalyzeOptions): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const projectName = path.basename(analysis.projectPath);

    let filename: string;
    let content: string;

    switch (options.format) {
      case 'json':
        filename = `${projectName}-ast-analysis-${timestamp}.json`;
        content = JSON.stringify(analysis, this.jsonReplacer, 2);
        break;
      case 'html':
        filename = `${projectName}-ast-analysis-${timestamp}.html`;
        content = this.generateHtmlReport(analysis);
        break;
      case 'markdown':
        filename = `${projectName}-ast-analysis-${timestamp}.md`;
        content = this.generateMarkdownReport(analysis);
        break;
      default:
        throw new Error(`Unsupported format: ${options.format}`);
    }

    const reportPath = path.join(options.output, filename);

    // Ensure output directory exists
    if (!fs.existsSync(options.output)) {
      fs.mkdirSync(options.output, { recursive: true });
    }

    fs.writeFileSync(reportPath, content, 'utf8');

    this.logger.info('AST analysis report saved', { path: reportPath, format: options.format });
    return reportPath;
  }

  private generateHtmlReport(analysis: any): string {
    const projectName = path.basename(analysis.projectPath);

    return `
<!DOCTYPE html>
<html>
<head>
    <title>AST Analysis Report - ${projectName}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
        .section { margin: 20px 0; }
        .metric { display: inline-block; margin: 10px; padding: 15px; background: #e9ecef; border-radius: 5px; }
        .language { border: 1px solid #ddd; margin: 10px 0; padding: 15px; border-radius: 5px; }
        .recommendation { margin: 10px 0; padding: 10px; border-radius: 5px; }
        .high { background: #f8d7da; border-left: 4px solid #dc3545; }
        .medium { background: #fff3cd; border-left: 4px solid #ffc107; }
        .low { background: #d4edda; border-left: 4px solid #28a745; }
        .symbol { font-family: monospace; background: #f8f9fa; padding: 2px 4px; border-radius: 3px; }
        table { width: 100%; border-collapse: collapse; margin: 10px 0; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
    </style>
</head>
<body>
    <div class="header">
        <h1>AST Analysis Report</h1>
        <h2>${projectName}</h2>
        <p><strong>Generated:</strong> ${new Date().toISOString()}</p>
        <p><strong>Languages:</strong> ${analysis.languages.join(', ')}</p>
        <p><strong>Architectural Score:</strong> ${analysis.overallMetrics.architecturalScore}/100</p>
    </div>

    <div class="section">
        <h3>📊 Overall Metrics</h3>
        <div class="metric">
            <strong>Total Files:</strong><br>
            ${analysis.overallMetrics.totalFiles}
        </div>
        <div class="metric">
            <strong>Total Symbols:</strong><br>
            ${analysis.overallMetrics.totalSymbols}
        </div>
        <div class="metric">
            <strong>Lines of Code:</strong><br>
            ${analysis.overallMetrics.totalLOC}
        </div>
        <div class="metric">
            <strong>Public API:</strong><br>
            ${analysis.overallMetrics.publicAPICount}
        </div>
        <div class="metric">
            <strong>Avg Complexity:</strong><br>
            ${analysis.overallMetrics.averageComplexity}
        </div>
        <div class="metric">
            <strong>Max Complexity:</strong><br>
            ${analysis.overallMetrics.maxComplexity}
        </div>
    </div>

    <div class="section">
        <h3>🔍 Language Analysis</h3>
        ${Array.from(analysis.astByLanguage.entries())
          .map((entry: any) => {
            const [language, ast] = entry;
            return `
            <div class="language">
                <h4>${language.charAt(0).toUpperCase() + language.slice(1)}</h4>
                <table>
                    <tr><th>Metric</th><th>Value</th></tr>
                    <tr><td>Files</td><td>${ast.modules.length}</td></tr>
                    <tr><td>Total Nodes</td><td>${ast.metrics.totalNodes}</td></tr>
                    <tr><td>Average Complexity</td><td>${ast.metrics.averageComplexity}</td></tr>
                    <tr><td>Max Complexity</td><td>${ast.metrics.maxComplexity}</td></tr>
                    <tr><td>Public API Count</td><td>${ast.metrics.publicAPICount}</td></tr>
                    <tr><td>Circular Dependencies</td><td>${ast.metrics.circularDependencies.length}</td></tr>
                </table>
            </div>
        `;
          })
          .join('')}
    </div>

    ${
      analysis.recommendations.length > 0
        ? `
    <div class="section">
        <h3>💡 Recommendations</h3>
        ${analysis.recommendations
          .map(
            (rec: any) => `
            <div class="recommendation ${rec.severity}">
                <h4>${rec.title}</h4>
                <p><strong>Type:</strong> ${rec.type} | <strong>Severity:</strong> ${rec.severity}</p>
                <p>${rec.description}</p>
                <p><strong>Suggestion:</strong> ${rec.suggestion}</p>
            </div>
        `
          )
          .join('')}
    </div>
    `
        : ''
    }

    <div class="section">
        <h3>🔧 Symbol Summary</h3>
        <table>
            <tr><th>Symbol Type</th><th>Count</th><th>Public</th></tr>
            ${this.getSymbolSummary(analysis.unifiedSymbols)
              .map(
                ([type, count, publicCount]: [string, number, number]) => `
                <tr>
                    <td>${type}</td>
                    <td>${count}</td>
                    <td>${publicCount}</td>
                </tr>
            `
              )
              .join('')}
        </table>
    </div>
</body>
</html>
    `;
  }

  private generateMarkdownReport(analysis: any): string {
    const projectName = path.basename(analysis.projectPath);

    return `# AST Analysis Report: ${projectName}

**Generated:** ${new Date().toISOString()}  
**Languages:** ${analysis.languages.join(', ')}  
**Architectural Score:** ${analysis.overallMetrics.architecturalScore}/100

## 📊 Overall Metrics

| Metric | Value |
|--------|-------|
| Total Files | ${analysis.overallMetrics.totalFiles} |
| Total Symbols | ${analysis.overallMetrics.totalSymbols} |
| Lines of Code | ${analysis.overallMetrics.totalLOC} |
| Public API Count | ${analysis.overallMetrics.publicAPICount} |
| Average Complexity | ${analysis.overallMetrics.averageComplexity} |
| Max Complexity | ${analysis.overallMetrics.maxComplexity} |

## 🔍 Language Analysis

${Array.from(analysis.astByLanguage.entries())
  .map((entry: any) => {
    const [language, ast] = entry;
    return `
### ${language.charAt(0).toUpperCase() + language.slice(1)}

| Metric | Value |
|--------|-------|
| Files | ${ast.modules.length} |
| Total Nodes | ${ast.metrics.totalNodes} |
| Average Complexity | ${ast.metrics.averageComplexity} |
| Max Complexity | ${ast.metrics.maxComplexity} |
| Public API Count | ${ast.metrics.publicAPICount} |
| Circular Dependencies | ${ast.metrics.circularDependencies.length} |
`;
  })
  .join('')}

${
  analysis.recommendations.length > 0
    ? `
## 💡 Recommendations

${analysis.recommendations
  .map(
    (rec: any) => `
### ${rec.severity === 'high' ? '🔴' : rec.severity === 'medium' ? '🟡' : '🟢'} ${rec.title}

**Type:** ${rec.type} | **Severity:** ${rec.severity}

${rec.description}

**Suggestion:** ${rec.suggestion}
`
  )
  .join('')}
`
    : ''
}

## 🔧 Symbol Summary

| Symbol Type | Count | Public |
|-------------|-------|--------|
${this.getSymbolSummary(analysis.unifiedSymbols)
  .map(
    ([type, count, publicCount]: [string, number, number]) =>
      `| ${type} | ${count} | ${publicCount} |`
  )
  .join('\n')}

---
*Report generated by Refactogent AST Analyzer*
`;
  }

  private getSymbolSummary(symbols: any[]): [string, number, number][] {
    const summary = new Map<string, { total: number; public: number }>();

    for (const symbol of symbols) {
      const type = symbol.type;
      if (!summary.has(type)) {
        summary.set(type, { total: 0, public: 0 });
      }

      const entry = summary.get(type)!;
      entry.total++;
      if (symbol.isExported) {
        entry.public++;
      }
    }

    return Array.from(summary.entries()).map(([type, counts]) => [
      type,
      counts.total,
      counts.public,
    ]);
  }

  private jsonReplacer(key: string, value: any): any {
    if (value instanceof Map) {
      return Object.fromEntries(value);
    }
    return value;
  }
}
