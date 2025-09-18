import { BaseCommand } from './base.js';
import { ProjectAnalyzer, ProjectHealthReport } from '../utils/project.js';
import fs from 'fs';
import path from 'path';

interface AnalyzeOptions {
  project: string;
  output: string;
  format: 'json' | 'html' | 'markdown';
  detailed: boolean;
  verbose: boolean;
}

export class AnalyzeCommand extends BaseCommand {
  async execute(options: AnalyzeOptions): Promise<any> {
    try {
      this.logger.info('Starting project analysis', {
        project: options.project,
        format: options.format,
        detailed: options.detailed
      });

      // Initialize project analyzer
      const analyzer = new ProjectAnalyzer(this.logger);

      // Generate health report
      const healthReport = await analyzer.generateHealthReport(options.project);

      // Save report in requested format
      const reportPath = await this.saveReport(healthReport, options);

      // Display summary
      this.displaySummary(healthReport, options.verbose);

      return this.success('Project analysis completed', [reportPath], {
        projectType: healthReport.projectInfo.type,
        totalFiles: healthReport.structure.totalFiles,
        dependencies: healthReport.dependencies.length,
        riskFactors: healthReport.riskFactors.length,
        maintainabilityIndex: healthReport.metrics.maintainabilityIndex,
        reportPath
      });

    } catch (error) {
      this.logger.error('Project analysis failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      return this.failure(`Analysis failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async saveReport(report: ProjectHealthReport, options: AnalyzeOptions): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const projectName = path.basename(options.project);
    
    let filename: string;
    let content: string;

    switch (options.format) {
      case 'json':
        filename = `${projectName}-analysis-${timestamp}.json`;
        content = JSON.stringify(report, this.jsonReplacer, 2);
        break;
      case 'html':
        filename = `${projectName}-analysis-${timestamp}.html`;
        content = this.generateHtmlReport(report);
        break;
      case 'markdown':
        filename = `${projectName}-analysis-${timestamp}.md`;
        content = this.generateMarkdownReport(report);
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
    
    this.logger.info('Report saved', { path: reportPath, format: options.format });
    return reportPath;
  }

  private displaySummary(report: ProjectHealthReport, verbose: boolean): void {
    console.log('\n📊 Project Analysis Summary');
    console.log('============================');
    console.log(`Project: ${path.basename(report.projectInfo.path)}`);
    console.log(`Type: ${report.projectInfo.type}`);
    console.log(`Languages: ${report.projectInfo.languages.join(', ')}`);
    console.log(`Files: ${report.structure.totalFiles}`);
    console.log(`Directories: ${report.structure.totalDirectories}`);
    console.log(`Dependencies: ${report.dependencies.length}`);
    console.log(`Has Tests: ${report.projectInfo.hasTests ? '✅' : '❌'}`);
    console.log(`Has Config: ${report.projectInfo.hasConfig ? '✅' : '❌'}`);

    console.log('\n📈 Metrics:');
    console.log(`  Code-to-Test Ratio: ${report.metrics.codeToTestRatio.toFixed(1)}`);
    console.log(`  Average File Size: ${report.metrics.averageFileSize.toFixed(0)} bytes`);
    console.log(`  Complexity Score: ${report.metrics.complexityScore}/10`);
    console.log(`  Maintainability Index: ${report.metrics.maintainabilityIndex}/100`);

    if (report.riskFactors.length > 0) {
      console.log('\n⚠️  Risk Factors:');
      report.riskFactors.forEach(risk => {
        const icon = risk.type === 'high' ? '🔴' : risk.type === 'medium' ? '🟡' : '🟢';
        console.log(`  ${icon} ${risk.description} (${risk.category})`);
        if (verbose) {
          console.log(`     Impact: ${risk.impact}`);
          console.log(`     Recommendation: ${risk.recommendation}`);
        }
      });
    }

    if (report.recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      report.recommendations.slice(0, verbose ? undefined : 5).forEach((rec, index) => {
        console.log(`  ${index + 1}. ${rec}`);
      });
      
      if (!verbose && report.recommendations.length > 5) {
        console.log(`  ... and ${report.recommendations.length - 5} more (use --verbose for full list)`);
      }
    }

    if (verbose && report.structure.largestFiles.length > 0) {
      console.log('\n📁 Largest Files:');
      report.structure.largestFiles.slice(0, 5).forEach(file => {
        const relativePath = path.relative(report.projectInfo.path, file.path);
        console.log(`  ${relativePath} (${(file.size / 1024).toFixed(1)} KB)`);
      });
    }

    if (verbose && report.structure.duplicateFiles.length > 0) {
      console.log('\n🔄 Duplicate Files:');
      const duplicateGroups = new Map<string, typeof report.structure.duplicateFiles>();
      report.structure.duplicateFiles.forEach(file => {
        if (!duplicateGroups.has(file.hash!)) {
          duplicateGroups.set(file.hash!, []);
        }
        duplicateGroups.get(file.hash!)!.push(file);
      });

      let count = 0;
      for (const [hash, files] of duplicateGroups) {
        if (count >= 3) break; // Show only first 3 groups
        console.log(`  Group ${count + 1}:`);
        files.forEach(file => {
          const relativePath = path.relative(report.projectInfo.path, file.path);
          console.log(`    ${relativePath}`);
        });
        count++;
      }
    }
  }

  private generateHtmlReport(report: ProjectHealthReport): string {
    const projectName = path.basename(report.projectInfo.path);
    
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Project Analysis Report - ${projectName}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
        .section { margin: 20px 0; }
        .metric { display: inline-block; margin: 10px; padding: 15px; background: #e9ecef; border-radius: 5px; }
        .risk-high { color: #dc3545; }
        .risk-medium { color: #ffc107; }
        .risk-low { color: #28a745; }
        .recommendation { background: #d1ecf1; padding: 10px; margin: 5px 0; border-radius: 3px; }
        table { width: 100%; border-collapse: collapse; margin: 10px 0; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
        .file-list { max-height: 300px; overflow-y: auto; }
        pre { background: #f8f9fa; padding: 10px; overflow-x: auto; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Project Analysis Report</h1>
        <h2>${projectName}</h2>
        <p><strong>Generated:</strong> ${new Date().toISOString()}</p>
        <p><strong>Project Type:</strong> ${report.projectInfo.type}</p>
        <p><strong>Languages:</strong> ${report.projectInfo.languages.join(', ')}</p>
    </div>

    <div class="section">
        <h3>📊 Key Metrics</h3>
        <div class="metric">
            <strong>Files:</strong><br>
            ${report.structure.totalFiles}
        </div>
        <div class="metric">
            <strong>Dependencies:</strong><br>
            ${report.dependencies.length}
        </div>
        <div class="metric">
            <strong>Complexity:</strong><br>
            ${report.metrics.complexityScore}/10
        </div>
        <div class="metric">
            <strong>Maintainability:</strong><br>
            ${report.metrics.maintainabilityIndex}/100
        </div>
        <div class="metric">
            <strong>Code/Test Ratio:</strong><br>
            ${report.metrics.codeToTestRatio.toFixed(1)}
        </div>
    </div>

    ${report.riskFactors.length > 0 ? `
    <div class="section">
        <h3>⚠️ Risk Factors</h3>
        ${report.riskFactors.map(risk => `
            <div class="risk-${risk.type}">
                <h4>${risk.description}</h4>
                <p><strong>Category:</strong> ${risk.category}</p>
                <p><strong>Impact:</strong> ${risk.impact}</p>
                <p><strong>Recommendation:</strong> ${risk.recommendation}</p>
            </div>
        `).join('')}
    </div>
    ` : ''}

    <div class="section">
        <h3>💡 Recommendations</h3>
        ${report.recommendations.map(rec => `
            <div class="recommendation">${rec}</div>
        `).join('')}
    </div>

    <div class="section">
        <h3>📁 File Structure</h3>
        <table>
            <tr><th>Extension</th><th>Count</th></tr>
            ${Array.from(report.structure.filesByExtension.entries())
              .sort((a, b) => b[1] - a[1])
              .map(([ext, count]) => `<tr><td>${ext || '(no extension)'}</td><td>${count}</td></tr>`)
              .join('')}
        </table>
    </div>

    ${report.structure.largestFiles.length > 0 ? `
    <div class="section">
        <h3>📈 Largest Files</h3>
        <div class="file-list">
            <table>
                <tr><th>File</th><th>Size (KB)</th></tr>
                ${report.structure.largestFiles.map(file => `
                    <tr>
                        <td>${path.relative(report.projectInfo.path, file.path)}</td>
                        <td>${(file.size / 1024).toFixed(1)}</td>
                    </tr>
                `).join('')}
            </table>
        </div>
    </div>
    ` : ''}

    ${report.dependencies.length > 0 ? `
    <div class="section">
        <h3>📦 Dependencies</h3>
        <div class="file-list">
            <table>
                <tr><th>Name</th><th>Version</th><th>Type</th><th>Source</th></tr>
                ${report.dependencies.map(dep => `
                    <tr>
                        <td>${dep.name}</td>
                        <td>${dep.version}</td>
                        <td>${dep.type}</td>
                        <td>${dep.source}</td>
                    </tr>
                `).join('')}
            </table>
        </div>
    </div>
    ` : ''}

    <div class="section">
        <h3>🔧 Raw Data</h3>
        <details>
            <summary>View JSON Data</summary>
            <pre>${JSON.stringify(report, this.jsonReplacer, 2)}</pre>
        </details>
    </div>
</body>
</html>
    `;
  }

  private generateMarkdownReport(report: ProjectHealthReport): string {
    const projectName = path.basename(report.projectInfo.path);
    
    return `# Project Analysis Report: ${projectName}

**Generated:** ${new Date().toISOString()}  
**Project Type:** ${report.projectInfo.type}  
**Languages:** ${report.projectInfo.languages.join(', ')}  

## 📊 Key Metrics

| Metric | Value |
|--------|-------|
| Total Files | ${report.structure.totalFiles} |
| Total Directories | ${report.structure.totalDirectories} |
| Dependencies | ${report.dependencies.length} |
| Complexity Score | ${report.metrics.complexityScore}/10 |
| Maintainability Index | ${report.metrics.maintainabilityIndex}/100 |
| Code-to-Test Ratio | ${report.metrics.codeToTestRatio.toFixed(1)} |
| Average File Size | ${report.metrics.averageFileSize.toFixed(0)} bytes |
| Has Tests | ${report.projectInfo.hasTests ? '✅' : '❌'} |
| Has Config | ${report.projectInfo.hasConfig ? '✅' : '❌'} |

${report.riskFactors.length > 0 ? `
## ⚠️ Risk Factors

${report.riskFactors.map(risk => `
### ${risk.type === 'high' ? '🔴' : risk.type === 'medium' ? '🟡' : '🟢'} ${risk.description}

**Category:** ${risk.category}  
**Impact:** ${risk.impact}  
**Recommendation:** ${risk.recommendation}
`).join('')}
` : ''}

## 💡 Recommendations

${report.recommendations.map((rec, index) => `${index + 1}. ${rec}`).join('\n')}

## 📁 File Structure

| Extension | Count |
|-----------|-------|
${Array.from(report.structure.filesByExtension.entries())
  .sort((a, b) => b[1] - a[1])
  .map(([ext, count]) => `| ${ext || '(no extension)'} | ${count} |`)
  .join('\n')}

${report.structure.largestFiles.length > 0 ? `
## 📈 Largest Files

| File | Size (KB) |
|------|-----------|
${report.structure.largestFiles.map(file => 
  `| ${path.relative(report.projectInfo.path, file.path)} | ${(file.size / 1024).toFixed(1)} |`
).join('\n')}
` : ''}

${report.dependencies.length > 0 ? `
## 📦 Dependencies

| Name | Version | Type | Source |
|------|---------|------|--------|
${report.dependencies.map(dep => 
  `| ${dep.name} | ${dep.version} | ${dep.type} | ${dep.source} |`
).join('\n')}
` : ''}

## 🔧 Technical Details

- **Total Files:** ${report.structure.totalFiles}
- **Total Directories:** ${report.structure.totalDirectories}
- **Duplicate Files:** ${report.structure.duplicateFiles.length}
- **Outdated Dependencies:** ${report.metrics.outdatedDependencies}

---
*Report generated by Refactogent CLI*
`;
  }

  private jsonReplacer(key: string, value: any): any {
    if (value instanceof Map) {
      return Object.fromEntries(value);
    }
    return value;
  }
}