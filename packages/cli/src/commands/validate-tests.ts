import { Command } from 'commander';
import { BaseCommand } from './base.js';
import { CommandResult, RefactoringMode } from '../types/index.js';
import { TestValidator, ValidationOptions } from '../characterization/test-validator.js';
import { Logger } from '../utils/logger.js';
import fs from 'fs';
import path from 'path';

interface ValidateTestsOptions {
  testDirectory?: string;
  maxAge?: number;
  minCoverage?: number;
  maxDuplication?: number;
  include?: string[];
  exclude?: string[];
  output?: string;
  autoFix?: boolean;
  generateReport?: boolean;
}

export class ValidateTestsCommand extends BaseCommand {
  private validator: TestValidator;

  constructor(logger: Logger) {
    super(logger);
    this.validator = new TestValidator(logger);
  }

  async execute(options: ValidateTestsOptions): Promise<CommandResult> {
    this.validateContext();

    const testDirectory = options.testDirectory || path.join(this.context!.projectInfo.path, 'tests');
    const outputDir = options.output || path.join(this.context!.outputDir, 'test-validation');

    this.logger.info('Starting test validation', {
      testDirectory,
      outputDir,
      autoFix: options.autoFix,
    });

    try {
      // Check if test directory exists
      if (!fs.existsSync(testDirectory)) {
        return this.failure(`Test directory not found: ${testDirectory}`);
      }

      // Prepare validation options
      const validationOptions: ValidationOptions = {
        testDirectory,
        tolerance: {
          maxTestAge: options.maxAge || 90,
          minCoverage: options.minCoverage || 80,
          maxDuplication: options.maxDuplication || 30,
        },
        includePatterns: options.include,
        excludePatterns: options.exclude,
      };

      // Validate tests
      const validationResults = await this.validator.validateTests(validationOptions);

      if (validationResults.length === 0) {
        return this.failure('No test files found to validate');
      }

      // Generate maintenance report
      const maintenanceReport = this.validator.generateMaintenanceReport(validationResults);

      // Ensure output directory exists
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const generatedFiles: string[] = [];

      // Update tests if requested
      if (options.autoFix) {
        const updatedFiles = await this.validator.updateTests(validationResults, {
          autoFix: true,
          backupOriginals: true,
        });
        generatedFiles.push(...updatedFiles);
      }

      // Generate detailed report
      if (options.generateReport !== false) {
        const detailedReport = this.generateDetailedReport(validationResults, maintenanceReport);
        const reportFile = path.join(outputDir, 'test-validation-report.md');
        fs.writeFileSync(reportFile, detailedReport);
        generatedFiles.push(reportFile);

        // Generate JSON report for programmatic access
        const jsonReport = {
          timestamp: new Date().toISOString(),
          summary: maintenanceReport,
          results: validationResults,
        };
        const jsonFile = path.join(outputDir, 'test-validation-results.json');
        fs.writeFileSync(jsonFile, JSON.stringify(jsonReport, null, 2));
        generatedFiles.push(jsonFile);
      }

      // Generate maintenance script
      const maintenanceScript = this.generateMaintenanceScript(validationResults, maintenanceReport);
      const scriptFile = path.join(outputDir, 'maintenance-actions.sh');
      fs.writeFileSync(scriptFile, maintenanceScript);
      fs.chmodSync(scriptFile, '755');
      generatedFiles.push(scriptFile);

      this.logger.success('Test validation completed', {
        totalTests: maintenanceReport.totalTests,
        validTests: maintenanceReport.validTests,
        invalidTests: maintenanceReport.invalidTests,
        averageQuality: Math.round(maintenanceReport.averageQuality),
      });

      return this.success(
        `Validated ${maintenanceReport.totalTests} tests (${maintenanceReport.validTests} valid, ${maintenanceReport.invalidTests} invalid)`,
        generatedFiles,
        {
          totalTests: maintenanceReport.totalTests,
          validTests: maintenanceReport.validTests,
          invalidTests: maintenanceReport.invalidTests,
          outdatedTests: maintenanceReport.outdatedTests,
          redundantTests: maintenanceReport.redundantTests,
          averageQuality: Math.round(maintenanceReport.averageQuality),
          recommendations: maintenanceReport.recommendations.length,
          outputDir,
        }
      );

    } catch (error) {
      return this.failure(`Test validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private generateDetailedReport(validationResults: any[], maintenanceReport: any): string {
    const validTests = validationResults.filter(r => r.status === 'valid');
    const invalidTests = validationResults.filter(r => r.status === 'invalid');
    const outdatedTests = validationResults.filter(r => r.status === 'outdated');
    const redundantTests = validationResults.filter(r => r.status === 'redundant');

    return `# Test Validation Report

## Summary
- **Total Tests**: ${maintenanceReport.totalTests}
- **Valid Tests**: ${maintenanceReport.validTests} (${Math.round((maintenanceReport.validTests / maintenanceReport.totalTests) * 100)}%)
- **Invalid Tests**: ${maintenanceReport.invalidTests}
- **Outdated Tests**: ${maintenanceReport.outdatedTests}
- **Redundant Tests**: ${maintenanceReport.redundantTests}
- **Average Quality**: ${Math.round(maintenanceReport.averageQuality)}/100
- **Generated**: ${new Date().toISOString()}

## Quality Distribution
${this.generateQualityDistribution(validationResults)}

## Test Status Breakdown

### ✅ Valid Tests (${validTests.length})
${validTests.length > 0 ? validTests.map(test => `
#### ${path.basename(test.testFile)}
- **Quality**: ${Math.round(test.quality.overall)}/100
- **Coverage**: ${Math.round(test.quality.coverage)}%
- **Maintainability**: ${Math.round(test.quality.maintainability)}%
- **Reliability**: ${Math.round(test.quality.reliability)}%
${test.suggestions.length > 0 ? `- **Suggestions**: ${test.suggestions.length}` : ''}
`).join('') : 'No valid tests found.'}

### ❌ Invalid Tests (${invalidTests.length})
${invalidTests.length > 0 ? invalidTests.map(test => `
#### ${path.basename(test.testFile)}
- **Issues**: ${test.issues.length}
- **Critical Issues**: ${test.issues.filter((i: any) => i.severity === 'critical').length}
- **High Issues**: ${test.issues.filter((i: any) => i.severity === 'high').length}

**Top Issues:**
${test.issues.slice(0, 3).map((issue: any) => `- **${issue.type}** (${issue.severity}): ${issue.message}`).join('\n')}
`).join('') : 'No invalid tests found.'}

### ⚠️ Outdated Tests (${outdatedTests.length})
${outdatedTests.length > 0 ? outdatedTests.map(test => `
#### ${path.basename(test.testFile)}
- **Quality**: ${Math.round(test.quality.overall)}/100
- **Issues**: ${test.issues.length}
- **Suggestions**: ${test.suggestions.length}

**Recommended Actions:**
${test.suggestions.slice(0, 2).map((suggestion: any) => `- ${suggestion.message}`).join('\n')}
`).join('') : 'No outdated tests found.'}

### 🔄 Redundant Tests (${redundantTests.length})
${redundantTests.length > 0 ? redundantTests.map(test => `
#### ${path.basename(test.testFile)}
- **Quality**: ${Math.round(test.quality.overall)}/100
- **Issues**: ${test.issues.length}
`).join('') : 'No redundant tests found.'}

## Maintenance Recommendations

${maintenanceReport.recommendations.map((rec: any) => `
### ${rec.action.toUpperCase()}: ${rec.target}
- **Reason**: ${rec.reason}
- **Impact**: ${rec.impact}
- **Effort**: ${rec.effort}
`).join('')}

## Issue Analysis

### Issue Types
${this.getIssueTypeDistribution(validationResults).map(([type, count]) => `- **${type}**: ${count} issues`).join('\n')}

### Severity Distribution
${this.getSeverityDistribution(validationResults).map(([severity, count]) => `- **${severity}**: ${count} issues`).join('\n')}

## Actionable Next Steps

### Immediate Actions (High Priority)
1. **Fix Critical Issues**: ${validationResults.reduce((sum, r) => sum + r.issues.filter((i: any) => i.severity === 'critical').length, 0)} critical issues need immediate attention
2. **Remove Invalid Tests**: ${invalidTests.length} tests should be removed or completely rewritten
3. **Update Outdated Tests**: ${outdatedTests.length} tests need updates to current standards

### Short-term Actions (Medium Priority)
1. **Improve Test Coverage**: Focus on tests with coverage below 80%
2. **Reduce Duplication**: Address high duplication in test code
3. **Add Missing Assertions**: Ensure all tests have proper validation

### Long-term Actions (Low Priority)
1. **Optimize Performance**: Address performance issues in test execution
2. **Enhance Maintainability**: Refactor complex test structures
3. **Standardize Patterns**: Establish consistent testing patterns

## Automation Opportunities

### Automated Fixes Available
- Syntax error corrections
- Missing assertion additions
- Code formatting improvements
- Import statement cleanup

### Manual Review Required
- Logic validation
- Test case relevance
- Expected value verification
- Business logic correctness

## Quality Metrics Trends

To track improvement over time, run this validation regularly and compare:
- Overall quality scores
- Issue counts by type and severity
- Test coverage percentages
- Maintenance recommendation trends

## Tools and Resources

### Recommended Tools
- **Test Coverage**: Use nyc, jest --coverage, or similar tools
- **Code Quality**: ESLint, Prettier for consistent formatting
- **Test Frameworks**: Jest, Vitest, Mocha for robust testing
- **Property Testing**: fast-check for comprehensive input testing

### Best Practices
1. Keep tests simple and focused
2. Use descriptive test names
3. Maintain test independence
4. Regular test maintenance
5. Continuous quality monitoring

Generated by Refactogent Test Validator at ${new Date().toISOString()}
`;
  }

  private generateQualityDistribution(results: any[]): string {
    const ranges = [
      { min: 90, max: 100, label: 'Excellent (90-100)' },
      { min: 70, max: 89, label: 'Good (70-89)' },
      { min: 50, max: 69, label: 'Fair (50-69)' },
      { min: 0, max: 49, label: 'Poor (0-49)' },
    ];

    return ranges.map(range => {
      const count = results.filter(r => 
        r.quality.overall >= range.min && r.quality.overall <= range.max
      ).length;
      const percentage = results.length > 0 ? Math.round((count / results.length) * 100) : 0;
      return `- **${range.label}**: ${count} tests (${percentage}%)`;
    }).join('\n');
  }

  private getIssueTypeDistribution(results: any[]): [string, number][] {
    const distribution: Record<string, number> = {};
    
    for (const result of results) {
      for (const issue of result.issues) {
        distribution[issue.type] = (distribution[issue.type] || 0) + 1;
      }
    }
    
    return Object.entries(distribution).sort((a, b) => b[1] - a[1]);
  }

  private getSeverityDistribution(results: any[]): [string, number][] {
    const distribution: Record<string, number> = {};
    
    for (const result of results) {
      for (const issue of result.issues) {
        distribution[issue.severity] = (distribution[issue.severity] || 0) + 1;
      }
    }
    
    return Object.entries(distribution).sort((a, b) => b[1] - a[1]);
  }

  private generateMaintenanceScript(validationResults: any[], maintenanceReport: any): string {
    const invalidTests = validationResults.filter(r => r.status === 'invalid');
    const outdatedTests = validationResults.filter(r => r.status === 'outdated');
    const redundantTests = validationResults.filter(r => r.status === 'redundant');

    return `#!/bin/bash
# Test Maintenance Script
# Generated: ${new Date().toISOString()}

echo "🔧 Starting test maintenance..."

# Backup current tests
echo "📦 Creating backup..."
BACKUP_DIR="test-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

${invalidTests.length > 0 ? `
# Remove invalid tests
echo "❌ Removing ${invalidTests.length} invalid tests..."
${invalidTests.map(test => `# rm "${test.testFile}" # Uncomment to remove`).join('\n')}
` : ''}

${outdatedTests.length > 0 ? `
# Mark outdated tests for review
echo "⚠️  Marking ${outdatedTests.length} outdated tests for review..."
${outdatedTests.map(test => `echo "TODO: Review and update ${test.testFile}"`).join('\n')}
` : ''}

${redundantTests.length > 0 ? `
# Mark redundant tests for consolidation
echo "🔄 Marking ${redundantTests.length} redundant tests for consolidation..."
${redundantTests.map(test => `echo "TODO: Consider merging ${test.testFile}"`).join('\n')}
` : ''}

echo "✅ Maintenance script completed!"
echo "📊 Summary:"
echo "  - Total tests: ${maintenanceReport.totalTests}"
echo "  - Valid tests: ${maintenanceReport.validTests}"
echo "  - Invalid tests: ${maintenanceReport.invalidTests}"
echo "  - Outdated tests: ${maintenanceReport.outdatedTests}"
echo "  - Redundant tests: ${maintenanceReport.redundantTests}"
echo ""
echo "📋 Next steps:"
echo "  1. Review marked tests manually"
echo "  2. Update outdated tests"
echo "  3. Remove or merge redundant tests"
echo "  4. Re-run validation: refactogent validate-tests"
`;
  }
}

/**
 * Create the validate-tests command for the CLI
 */
export function createValidateTestsCommand(): Command {
  const command = new Command('validate-tests')
    .description('Validate and maintain characterization tests')
    .option('--test-directory <dir>', 'Directory containing tests to validate')
    .option('--max-age <days>', 'Maximum age for tests in days', '90')
    .option('--min-coverage <percent>', 'Minimum coverage percentage', '80')
    .option('--max-duplication <percent>', 'Maximum duplication percentage', '30')
    .option('--include <patterns...>', 'File patterns to include')
    .option('--exclude <patterns...>', 'File patterns to exclude')
    .option('--output <dir>', 'Output directory for reports')
    .option('--auto-fix', 'Automatically fix issues where possible')
    .option('--no-report', 'Skip generating detailed report')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.parent?.parent?.opts() || {};
      
      // Initialize CLI context
      const logger = new Logger(globalOpts.verbose);
      
      try {
        // Create command instance
        const validateCommand = new ValidateTestsCommand(logger);
        
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
            modesAllowed: ['organize-only', 'name-hygiene', 'tests-first', 'micro-simplify'] as RefactoringMode[],
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
            }
          },
          projectInfo: { 
            path: projectPath, 
            type: 'mixed' as const, 
            languages: ['typescript', 'javascript'], 
            hasTests: true, 
            hasConfig: false 
          },
          outputDir,
          verbose: globalOpts.verbose || false,
        };
        
        validateCommand.setContext(context);
        
        // Execute command
        const result = await validateCommand.execute({
          testDirectory: opts.testDirectory,
          maxAge: parseInt(opts.maxAge, 10),
          minCoverage: parseInt(opts.minCoverage, 10),
          maxDuplication: parseInt(opts.maxDuplication, 10),
          include: opts.include,
          exclude: opts.exclude,
          output: opts.output,
          autoFix: opts.autoFix,
          generateReport: opts.report,
        });
        
        if (result.success) {
          console.log(`✅ ${result.message}`);
          if (result.artifacts) {
            console.log(`📁 Generated files: ${result.artifacts.length} files`);
            console.log(`📂 Output directory: ${result.data?.outputDir}`);
          }
          if (result.data) {
            console.log(`📊 Quality: ${result.data.averageQuality}/100`);
            console.log(`⚠️  Issues: ${result.data.invalidTests + result.data.outdatedTests} tests need attention`);
            if (result.data.recommendations > 0) {
              console.log(`💡 Recommendations: ${result.data.recommendations}`);
            }
          }
        } else {
          console.error(`❌ ${result.message}`);
          process.exit(1);
        }
      } catch (error) {
        logger.error('Test validation failed', { error });
        console.error(`❌ Test validation failed: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    });

  return command;
}