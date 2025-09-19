import { Logger } from '../utils/logger.js';
import { ProjectType } from '../types/index.js';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

export interface CoverageReport {
  projectPath: string;
  language: string;
  timestamp: Date;
  overallCoverage: CoverageMetrics;
  fileCoverage: FileCoverageInfo[];
  summary: CoverageSummary;
  regressionAnalysis?: CoverageRegression;
}

export interface CoverageMetrics {
  linesCovered: number;
  totalLines: number;
  linePercentage: number;
  branchesCovered: number;
  totalBranches: number;
  branchPercentage: number;
  functionsCovered: number;
  totalFunctions: number;
  functionPercentage: number;
  statementsCovered: number;
  totalStatements: number;
  statementPercentage: number;
}

export interface FileCoverageInfo {
  filePath: string;
  relativePath: string;
  metrics: CoverageMetrics;
  uncoveredLines: number[];
  uncoveredBranches: BranchInfo[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  recommendations: string[];
}

export interface BranchInfo {
  line: number;
  column: number;
  type: 'if' | 'switch' | 'ternary' | 'logical' | 'loop';
  covered: boolean;
  hitCount: number;
}

export interface CoverageSummary {
  totalFiles: number;
  coveredFiles: number;
  wellCoveredFiles: number; // >80% coverage
  poorlyCoveredFiles: number; // <50% coverage
  uncoveredFiles: number;
  averageCoverage: number;
  coverageDistribution: CoverageDistribution;
  riskAssessment: CoverageRiskAssessment;
}

export interface CoverageDistribution {
  excellent: number; // 90-100%
  good: number; // 70-89%
  fair: number; // 50-69%
  poor: number; // 30-49%
  critical: number; // 0-29%
}

export interface CoverageRiskAssessment {
  highRiskFiles: string[];
  criticalGaps: CoverageGap[];
  recommendations: CoverageRecommendation[];
}

export interface CoverageGap {
  type: 'function' | 'branch' | 'line' | 'statement';
  filePath: string;
  location: {
    line: number;
    column?: number;
  };
  description: string;
  impact: 'high' | 'medium' | 'low';
  suggestion: string;
}

export interface CoverageRecommendation {
  priority: 'critical' | 'high' | 'medium' | 'low';
  category: 'missing_tests' | 'improve_existing' | 'edge_cases' | 'integration';
  title: string;
  description: string;
  files: string[];
  estimatedEffort: 'low' | 'medium' | 'high';
  expectedImpact: string;
}

export interface CoverageRegression {
  previousCoverage?: CoverageMetrics;
  currentCoverage: CoverageMetrics;
  changes: CoverageChange[];
  regressionRisk: 'none' | 'low' | 'medium' | 'high';
  recommendations: string[];
}

export interface CoverageChange {
  type: 'improvement' | 'regression' | 'new_file' | 'removed_file';
  filePath: string;
  previousCoverage?: number;
  currentCoverage: number;
  impact: number; // percentage point change
}

export interface CoverageOptions {
  threshold?: number;
  includeRegression?: boolean;
  generateReport?: boolean;
  outputFormat?: 'json' | 'html' | 'lcov' | 'text';
  excludePatterns?: string[];
  includePatterns?: string[];
}

export class CoverageAnalyzer {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Analyze test coverage for a project
   */
  async analyzeCoverage(
    projectPath: string,
    projectType: ProjectType,
    options: CoverageOptions = {}
  ): Promise<CoverageReport> {
    this.logger.info('Starting coverage analysis', { projectPath, projectType, options });

    try {
      // Generate coverage if not exists
      const coverageData = await this.generateOrFindCoverage(projectPath, projectType, options);

      // Parse coverage data
      const fileCoverage = await this.parseCoverageData(coverageData, projectPath);

      // Calculate overall metrics
      const overallCoverage = this.calculateOverallMetrics(fileCoverage);

      // Generate summary and analysis
      const summary = this.generateCoverageSummary(fileCoverage, overallCoverage);

      // Perform regression analysis if requested
      let regressionAnalysis: CoverageRegression | undefined;
      if (options.includeRegression) {
        regressionAnalysis = await this.performRegressionAnalysis(projectPath, overallCoverage);
      }

      const report: CoverageReport = {
        projectPath,
        language: projectType,
        timestamp: new Date(),
        overallCoverage,
        fileCoverage,
        summary,
        regressionAnalysis,
      };

      this.logger.info('Coverage analysis completed', {
        overallCoverage: overallCoverage.linePercentage.toFixed(1),
        filesAnalyzed: fileCoverage.length,
      });

      return report;
    } catch (error) {
      this.logger.error('Coverage analysis failed', {
        projectPath,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Generate coverage data using appropriate tools
   */
  private async generateOrFindCoverage(
    projectPath: string,
    projectType: ProjectType,
    options: CoverageOptions
  ): Promise<string> {
    // First, try to find existing coverage files
    const existingCoverage = await this.findExistingCoverage(projectPath, projectType);
    if (existingCoverage) {
      this.logger.info('Found existing coverage data', { coverageFile: existingCoverage });
      return fs.readFileSync(existingCoverage, 'utf8');
    }

    // Generate new coverage
    this.logger.info('Generating new coverage data', { projectType });
    return await this.generateCoverage(projectPath, projectType, options);
  }

  /**
   * Find existing coverage files
   */
  private async findExistingCoverage(
    projectPath: string,
    projectType: ProjectType
  ): Promise<string | null> {
    const coverageFiles = this.getCoverageFilePaths(projectType);

    for (const coverageFile of coverageFiles) {
      const fullPath = path.join(projectPath, coverageFile);
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }

    return null;
  }

  /**
   * Get expected coverage file paths for each language
   */
  private getCoverageFilePaths(projectType: ProjectType): string[] {
    switch (projectType) {
      case 'typescript':
        return [
          'coverage/lcov.info',
          'coverage/coverage-final.json',
          'coverage/clover.xml',
          '.nyc_output/coverage-final.json',
        ];
      case 'python':
        return ['.coverage', 'coverage.xml', 'htmlcov/index.html', 'coverage.json'];
      case 'go':
        return ['coverage.out', 'coverage.html', 'coverage.txt'];
      default:
        return [];
    }
  }

  /**
   * Generate coverage using language-specific tools
   */
  private async generateCoverage(
    projectPath: string,
    projectType: ProjectType,
    options: CoverageOptions
  ): Promise<string> {
    const originalCwd = process.cwd();

    try {
      process.chdir(projectPath);

      switch (projectType) {
        case 'typescript':
          return await this.generateJavaScriptCoverage(projectPath, options);
        case 'python':
          return await this.generatePythonCoverage(projectPath, options);
        case 'go':
          return await this.generateGoCoverage(projectPath, options);
        default:
          throw new Error(`Unsupported project type for coverage: ${projectType}`);
      }
    } finally {
      process.chdir(originalCwd);
    }
  }

  /**
   * Generate JavaScript/TypeScript coverage using nyc or jest
   */
  private async generateJavaScriptCoverage(
    projectPath: string,
    options: CoverageOptions
  ): Promise<string> {
    try {
      // Try Jest first (most common)
      if (fs.existsSync('package.json')) {
        const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

        if (packageJson.scripts?.test) {
          this.logger.info('Running Jest coverage');
          execSync('npm test -- --coverage --coverageReporters=lcov --coverageReporters=json', {
            stdio: ['pipe', 'pipe', 'pipe'],
          });

          // Return LCOV format if available
          if (fs.existsSync('coverage/lcov.info')) {
            return fs.readFileSync('coverage/lcov.info', 'utf8');
          }

          // Fallback to JSON format
          if (fs.existsSync('coverage/coverage-final.json')) {
            return fs.readFileSync('coverage/coverage-final.json', 'utf8');
          }
        }
      }

      // Try nyc as fallback
      this.logger.info('Trying nyc coverage');
      execSync('npx nyc --reporter=lcov --reporter=json npm test', {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      if (fs.existsSync('coverage/lcov.info')) {
        return fs.readFileSync('coverage/lcov.info', 'utf8');
      }

      throw new Error('Could not generate JavaScript coverage');
    } catch (error) {
      this.logger.warn('Failed to generate JavaScript coverage', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Generate Python coverage using coverage.py
   */
  private async generatePythonCoverage(
    projectPath: string,
    options: CoverageOptions
  ): Promise<string> {
    try {
      // Try pytest with coverage
      if (
        fs.existsSync('pytest.ini') ||
        fs.existsSync('pyproject.toml') ||
        fs.readdirSync('.').some(file => file.includes('test'))
      ) {
        this.logger.info('Running pytest coverage');
        execSync('python -m pytest --cov=. --cov-report=xml --cov-report=json', {
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        if (fs.existsSync('coverage.xml')) {
          return fs.readFileSync('coverage.xml', 'utf8');
        }
      }

      // Try coverage.py directly
      this.logger.info('Running coverage.py');
      execSync('python -m coverage run -m pytest', { stdio: ['pipe', 'pipe', 'pipe'] });
      execSync('python -m coverage xml', { stdio: ['pipe', 'pipe', 'pipe'] });

      if (fs.existsSync('coverage.xml')) {
        return fs.readFileSync('coverage.xml', 'utf8');
      }

      throw new Error('Could not generate Python coverage');
    } catch (error) {
      this.logger.warn('Failed to generate Python coverage', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Generate Go coverage using go test
   */
  private async generateGoCoverage(projectPath: string, options: CoverageOptions): Promise<string> {
    try {
      this.logger.info('Running Go coverage');
      execSync('go test -coverprofile=coverage.out ./...', {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      if (fs.existsSync('coverage.out')) {
        return fs.readFileSync('coverage.out', 'utf8');
      }

      throw new Error('Could not generate Go coverage');
    } catch (error) {
      this.logger.warn('Failed to generate Go coverage', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Parse coverage data based on format
   */
  private async parseCoverageData(
    coverageData: string,
    projectPath: string
  ): Promise<FileCoverageInfo[]> {
    // Detect format
    const format = this.detectCoverageFormat(coverageData);

    switch (format) {
      case 'lcov':
        return this.parseLcovCoverage(coverageData, projectPath);
      case 'json':
        return this.parseJsonCoverage(coverageData, projectPath);
      case 'xml':
        return this.parseXmlCoverage(coverageData, projectPath);
      case 'go':
        return this.parseGoCoverage(coverageData, projectPath);
      default:
        throw new Error(`Unsupported coverage format: ${format}`);
    }
  }

  /**
   * Detect coverage data format
   */
  private detectCoverageFormat(data: string): string {
    if (data.includes('TN:') && data.includes('SF:')) return 'lcov';
    if (data.startsWith('{') && data.includes('"coverage"')) return 'json';
    if (data.includes('<?xml') && data.includes('coverage')) return 'xml';
    if (data.includes('mode:') && data.includes('.go:')) return 'go';
    return 'unknown';
  }

  /**
   * Parse LCOV format coverage data
   */
  private parseLcovCoverage(data: string, projectPath: string): FileCoverageInfo[] {
    const files: FileCoverageInfo[] = [];
    const sections = data.split('end_of_record');

    for (const section of sections) {
      if (!section.trim()) continue;

      const lines = section.split('\n');
      let filePath = '';
      let linesCovered = 0;
      let totalLines = 0;
      let branchesCovered = 0;
      let totalBranches = 0;
      let functionsCovered = 0;
      let totalFunctions = 0;
      const uncoveredLines: number[] = [];

      for (const line of lines) {
        if (line.startsWith('SF:')) {
          filePath = line.substring(3);
        } else if (line.startsWith('LH:')) {
          linesCovered = parseInt(line.substring(3));
        } else if (line.startsWith('LF:')) {
          totalLines = parseInt(line.substring(3));
        } else if (line.startsWith('BRH:')) {
          branchesCovered = parseInt(line.substring(4));
        } else if (line.startsWith('BRF:')) {
          totalBranches = parseInt(line.substring(4));
        } else if (line.startsWith('FNH:')) {
          functionsCovered = parseInt(line.substring(4));
        } else if (line.startsWith('FNF:')) {
          totalFunctions = parseInt(line.substring(4));
        } else if (line.startsWith('DA:')) {
          const [lineNum, hitCount] = line.substring(3).split(',');
          if (parseInt(hitCount) === 0) {
            uncoveredLines.push(parseInt(lineNum));
          }
        }
      }

      if (filePath) {
        const metrics: CoverageMetrics = {
          linesCovered,
          totalLines,
          linePercentage: totalLines > 0 ? (linesCovered / totalLines) * 100 : 0,
          branchesCovered,
          totalBranches,
          branchPercentage: totalBranches > 0 ? (branchesCovered / totalBranches) * 100 : 0,
          functionsCovered,
          totalFunctions,
          functionPercentage: totalFunctions > 0 ? (functionsCovered / totalFunctions) * 100 : 0,
          statementsCovered: linesCovered, // Approximation
          totalStatements: totalLines,
          statementPercentage: totalLines > 0 ? (linesCovered / totalLines) * 100 : 0,
        };

        files.push({
          filePath,
          relativePath: path.relative(projectPath, filePath),
          metrics,
          uncoveredLines,
          uncoveredBranches: [], // Would need more detailed parsing
          riskLevel: this.calculateRiskLevel(metrics.linePercentage),
          recommendations: this.generateFileRecommendations(metrics, uncoveredLines),
        });
      }
    }

    return files;
  }

  /**
   * Parse JSON format coverage data
   */
  private parseJsonCoverage(data: string, projectPath: string): FileCoverageInfo[] {
    try {
      const coverage = JSON.parse(data);
      const files: FileCoverageInfo[] = [];

      // Handle different JSON formats (Jest, nyc, etc.)
      const fileData = coverage.coverage || coverage;

      for (const [filePath, fileInfo] of Object.entries(fileData)) {
        const info = fileInfo as any;

        const linesCovered = Object.values(info.s || info.statementMap || {}).filter(
          (hits: any) => hits > 0
        ).length;
        const totalLines = Object.keys(info.s || info.statementMap || {}).length;
        const branchesCovered = Object.values(info.b || info.branchMap || {})
          .flat()
          .filter((hits: any) => hits > 0).length;
        const totalBranches = Object.values(info.b || info.branchMap || {}).flat().length;
        const functionsCovered = Object.values(info.f || info.fnMap || {}).filter(
          (hits: any) => hits > 0
        ).length;
        const totalFunctions = Object.keys(info.f || info.fnMap || {}).length;

        const uncoveredLines: number[] = [];
        if (info.s) {
          Object.entries(info.s).forEach(([stmt, hits]: [string, any]) => {
            if (hits === 0 && info.statementMap?.[stmt]) {
              uncoveredLines.push(info.statementMap[stmt].start.line);
            }
          });
        }

        const metrics: CoverageMetrics = {
          linesCovered,
          totalLines,
          linePercentage: totalLines > 0 ? (linesCovered / totalLines) * 100 : 0,
          branchesCovered,
          totalBranches,
          branchPercentage: totalBranches > 0 ? (branchesCovered / totalBranches) * 100 : 0,
          functionsCovered,
          totalFunctions,
          functionPercentage: totalFunctions > 0 ? (functionsCovered / totalFunctions) * 100 : 0,
          statementsCovered: linesCovered,
          totalStatements: totalLines,
          statementPercentage: totalLines > 0 ? (linesCovered / totalLines) * 100 : 0,
        };

        files.push({
          filePath,
          relativePath: path.relative(projectPath, filePath),
          metrics,
          uncoveredLines,
          uncoveredBranches: [],
          riskLevel: this.calculateRiskLevel(metrics.linePercentage),
          recommendations: this.generateFileRecommendations(metrics, uncoveredLines),
        });
      }

      return files;
    } catch (error) {
      throw new Error(`Failed to parse JSON coverage: ${error}`);
    }
  }

  /**
   * Parse XML format coverage data (Cobertura/Clover)
   */
  private parseXmlCoverage(data: string, projectPath: string): FileCoverageInfo[] {
    // Simplified XML parsing - in production would use proper XML parser
    const files: FileCoverageInfo[] = [];

    // Extract file information using regex (simplified)
    const fileMatches = data.matchAll(
      /<class.*?name="([^"]+)".*?line-rate="([^"]+)".*?branch-rate="([^"]+)"/g
    );

    for (const match of Array.from(fileMatches)) {
      const fileName = match[1];
      const lineRate = parseFloat(match[2]);
      const branchRate = parseFloat(match[3]);

      const metrics: CoverageMetrics = {
        linesCovered: 0, // Would need more detailed parsing
        totalLines: 0,
        linePercentage: lineRate * 100,
        branchesCovered: 0,
        totalBranches: 0,
        branchPercentage: branchRate * 100,
        functionsCovered: 0,
        totalFunctions: 0,
        functionPercentage: 0,
        statementsCovered: 0,
        totalStatements: 0,
        statementPercentage: lineRate * 100,
      };

      files.push({
        filePath: fileName,
        relativePath: path.relative(projectPath, fileName),
        metrics,
        uncoveredLines: [],
        uncoveredBranches: [],
        riskLevel: this.calculateRiskLevel(metrics.linePercentage),
        recommendations: this.generateFileRecommendations(metrics, []),
      });
    }

    return files;
  }

  /**
   * Parse Go coverage format
   */
  private parseGoCoverage(data: string, projectPath: string): FileCoverageInfo[] {
    const files: FileCoverageInfo[] = [];
    const lines = data.split('\n').filter(line => line.trim() && !line.startsWith('mode:'));

    const fileMap = new Map<string, { covered: number; total: number }>();

    for (const line of lines) {
      const parts = line.split(':');
      if (parts.length >= 2) {
        const filePath = parts[0];
        const coverageInfo = parts[1];
        const [, , hitCount] = coverageInfo.split(' ');

        if (!fileMap.has(filePath)) {
          fileMap.set(filePath, { covered: 0, total: 0 });
        }

        const fileInfo = fileMap.get(filePath)!;
        fileInfo.total++;
        if (parseInt(hitCount) > 0) {
          fileInfo.covered++;
        }
      }
    }

    for (const [filePath, info] of Array.from(fileMap.entries())) {
      const metrics: CoverageMetrics = {
        linesCovered: info.covered,
        totalLines: info.total,
        linePercentage: info.total > 0 ? (info.covered / info.total) * 100 : 0,
        branchesCovered: 0, // Go coverage doesn't track branches the same way
        totalBranches: 0,
        branchPercentage: 0,
        functionsCovered: 0,
        totalFunctions: 0,
        functionPercentage: 0,
        statementsCovered: info.covered,
        totalStatements: info.total,
        statementPercentage: info.total > 0 ? (info.covered / info.total) * 100 : 0,
      };

      files.push({
        filePath,
        relativePath: path.relative(projectPath, filePath),
        metrics,
        uncoveredLines: [],
        uncoveredBranches: [],
        riskLevel: this.calculateRiskLevel(metrics.linePercentage),
        recommendations: this.generateFileRecommendations(metrics, []),
      });
    }

    return files;
  }

  /**
   * Calculate overall coverage metrics
   */
  private calculateOverallMetrics(fileCoverage: FileCoverageInfo[]): CoverageMetrics {
    const totals = fileCoverage.reduce(
      (acc, file) => ({
        linesCovered: acc.linesCovered + file.metrics.linesCovered,
        totalLines: acc.totalLines + file.metrics.totalLines,
        branchesCovered: acc.branchesCovered + file.metrics.branchesCovered,
        totalBranches: acc.totalBranches + file.metrics.totalBranches,
        functionsCovered: acc.functionsCovered + file.metrics.functionsCovered,
        totalFunctions: acc.totalFunctions + file.metrics.totalFunctions,
        statementsCovered: acc.statementsCovered + file.metrics.statementsCovered,
        totalStatements: acc.totalStatements + file.metrics.totalStatements,
      }),
      {
        linesCovered: 0,
        totalLines: 0,
        branchesCovered: 0,
        totalBranches: 0,
        functionsCovered: 0,
        totalFunctions: 0,
        statementsCovered: 0,
        totalStatements: 0,
      }
    );

    return {
      ...totals,
      linePercentage: totals.totalLines > 0 ? (totals.linesCovered / totals.totalLines) * 100 : 0,
      branchPercentage:
        totals.totalBranches > 0 ? (totals.branchesCovered / totals.totalBranches) * 100 : 0,
      functionPercentage:
        totals.totalFunctions > 0 ? (totals.functionsCovered / totals.totalFunctions) * 100 : 0,
      statementPercentage:
        totals.totalStatements > 0 ? (totals.statementsCovered / totals.totalStatements) * 100 : 0,
    };
  }

  /**
   * Generate coverage summary
   */
  private generateCoverageSummary(
    fileCoverage: FileCoverageInfo[],
    overallCoverage: CoverageMetrics
  ): CoverageSummary {
    const totalFiles = fileCoverage.length;
    const coveredFiles = fileCoverage.filter(f => f.metrics.linePercentage > 0).length;
    const wellCoveredFiles = fileCoverage.filter(f => f.metrics.linePercentage >= 80).length;
    const poorlyCoveredFiles = fileCoverage.filter(
      f => f.metrics.linePercentage < 50 && f.metrics.linePercentage > 0
    ).length;
    const uncoveredFiles = fileCoverage.filter(f => f.metrics.linePercentage === 0).length;

    const averageCoverage =
      fileCoverage.length > 0
        ? fileCoverage.reduce((sum, f) => sum + f.metrics.linePercentage, 0) / fileCoverage.length
        : 0;

    const distribution: CoverageDistribution = {
      excellent: fileCoverage.filter(f => f.metrics.linePercentage >= 90).length,
      good: fileCoverage.filter(
        f => f.metrics.linePercentage >= 70 && f.metrics.linePercentage < 90
      ).length,
      fair: fileCoverage.filter(
        f => f.metrics.linePercentage >= 50 && f.metrics.linePercentage < 70
      ).length,
      poor: fileCoverage.filter(
        f => f.metrics.linePercentage >= 30 && f.metrics.linePercentage < 50
      ).length,
      critical: fileCoverage.filter(f => f.metrics.linePercentage < 30).length,
    };

    const riskAssessment = this.generateRiskAssessment(fileCoverage, overallCoverage);

    return {
      totalFiles,
      coveredFiles,
      wellCoveredFiles,
      poorlyCoveredFiles,
      uncoveredFiles,
      averageCoverage,
      coverageDistribution: distribution,
      riskAssessment,
    };
  }

  /**
   * Generate risk assessment
   */
  private generateRiskAssessment(
    fileCoverage: FileCoverageInfo[],
    overallCoverage: CoverageMetrics
  ): CoverageRiskAssessment {
    const highRiskFiles = fileCoverage
      .filter(f => f.riskLevel === 'high' || f.riskLevel === 'critical')
      .map(f => f.filePath);

    const criticalGaps: CoverageGap[] = [];
    const recommendations: CoverageRecommendation[] = [];

    // Identify critical gaps
    fileCoverage.forEach(file => {
      if (file.metrics.linePercentage < 50) {
        criticalGaps.push({
          type: 'line',
          filePath: file.filePath,
          location: { line: 1 },
          description: `Low line coverage (${file.metrics.linePercentage.toFixed(1)}%)`,
          impact: 'high',
          suggestion: 'Add comprehensive unit tests',
        });
      }

      if (file.metrics.functionPercentage < 70) {
        criticalGaps.push({
          type: 'function',
          filePath: file.filePath,
          location: { line: 1 },
          description: `Low function coverage (${file.metrics.functionPercentage.toFixed(1)}%)`,
          impact: 'medium',
          suggestion: 'Test all public functions',
        });
      }
    });

    // Generate recommendations
    if (overallCoverage.linePercentage < 70) {
      recommendations.push({
        priority: 'high',
        category: 'missing_tests',
        title: 'Increase Overall Test Coverage',
        description: `Current coverage is ${overallCoverage.linePercentage.toFixed(1)}%, below recommended 70%`,
        files: highRiskFiles.slice(0, 5),
        estimatedEffort: 'high',
        expectedImpact: 'Significantly reduces regression risk',
      });
    }

    if (fileCoverage.filter(f => f.metrics.branchPercentage < 50).length > 0) {
      recommendations.push({
        priority: 'medium',
        category: 'edge_cases',
        title: 'Improve Branch Coverage',
        description: 'Many files have poor branch coverage, indicating missing edge case tests',
        files: fileCoverage
          .filter(f => f.metrics.branchPercentage < 50)
          .map(f => f.filePath)
          .slice(0, 5),
        estimatedEffort: 'medium',
        expectedImpact: 'Better handling of edge cases and error conditions',
      });
    }

    return {
      highRiskFiles,
      criticalGaps,
      recommendations,
    };
  }

  /**
   * Perform regression analysis
   */
  private async performRegressionAnalysis(
    projectPath: string,
    currentCoverage: CoverageMetrics
  ): Promise<CoverageRegression> {
    // Try to load previous coverage data
    const previousCoverageFile = path.join(projectPath, '.coverage-history.json');
    let previousCoverage: CoverageMetrics | undefined;

    if (fs.existsSync(previousCoverageFile)) {
      try {
        const history = JSON.parse(fs.readFileSync(previousCoverageFile, 'utf8'));
        previousCoverage = history.latest;
      } catch (error) {
        this.logger.warn('Could not load coverage history', { error });
      }
    }

    const changes: CoverageChange[] = [];
    let regressionRisk: 'none' | 'low' | 'medium' | 'high' = 'none';
    const recommendations: string[] = [];

    if (previousCoverage) {
      const lineChange = currentCoverage.linePercentage - previousCoverage.linePercentage;
      const branchChange = currentCoverage.branchPercentage - previousCoverage.branchPercentage;
      const functionChange =
        currentCoverage.functionPercentage - previousCoverage.functionPercentage;

      if (lineChange < -5) {
        regressionRisk = 'high';
        recommendations.push('Significant line coverage regression detected');
      } else if (lineChange < -2) {
        regressionRisk = 'medium';
        recommendations.push('Line coverage has decreased');
      }

      if (branchChange < -5) {
        if (regressionRisk === 'none') {
          regressionRisk = 'medium';
        }
        recommendations.push('Branch coverage regression detected');
      }

      changes.push({
        type: lineChange >= 0 ? 'improvement' : 'regression',
        filePath: 'overall',
        previousCoverage: previousCoverage.linePercentage,
        currentCoverage: currentCoverage.linePercentage,
        impact: lineChange,
      });
    }

    // Save current coverage for future comparison
    const historyData = {
      latest: currentCoverage,
      timestamp: new Date().toISOString(),
    };

    try {
      fs.writeFileSync(previousCoverageFile, JSON.stringify(historyData, null, 2));
    } catch (error) {
      this.logger.warn('Could not save coverage history', { error });
    }

    return {
      previousCoverage,
      currentCoverage,
      changes,
      regressionRisk,
      recommendations,
    };
  }

  // Helper methods
  private calculateRiskLevel(coverage: number): 'low' | 'medium' | 'high' | 'critical' {
    if (coverage >= 80) return 'low';
    if (coverage >= 60) return 'medium';
    if (coverage >= 30) return 'high';
    return 'critical';
  }

  private generateFileRecommendations(
    metrics: CoverageMetrics,
    uncoveredLines: number[]
  ): string[] {
    const recommendations: string[] = [];

    if (metrics.linePercentage < 50) {
      recommendations.push('Add basic unit tests to cover main functionality');
    }

    if (metrics.functionPercentage < 70) {
      recommendations.push('Ensure all public functions have test coverage');
    }

    if (metrics.branchPercentage < 60) {
      recommendations.push('Add tests for conditional logic and edge cases');
    }

    if (uncoveredLines.length > 0) {
      recommendations.push(`${uncoveredLines.length} lines are not covered by tests`);
    }

    return recommendations;
  }
}
