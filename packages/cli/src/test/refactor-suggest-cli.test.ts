import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { execSync } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';

describe.skip('Refactor Suggest CLI', () => {
  const testProjectDir = path.join(__dirname, '../../test-project-cli');
  const cliPath = path.join(__dirname, '../../dist/index.js');

  beforeEach(async () => {
    // Create test project directory
    await fs.mkdir(testProjectDir, { recursive: true });

    // Create a simple TypeScript file for testing
    const testFile = `
export class TestClass {
  // Complex function that should trigger extract function suggestion
  public complexMethod(a: number, b: number, c: number, d: number): number {
    if (a > 0) {
      if (b > 0) {
        if (c > 0) {
          const result = a * b + c * d;
          const adjusted = result > 100 ? result * 0.9 : result * 1.1;
          return adjusted + (a + b + c + d) / 5;
        }
      }
    }
    return 0;
  }

  // Function with magic numbers
  public processNumbers(nums: number[]): number[] {
    return nums.map(x => x * 3.14159 + 42).filter(x => x > 100);
  }
}
`;

    await fs.writeFile(path.join(testProjectDir, 'test.ts'), testFile);

    // Create tsconfig.json for TypeScript analysis (no package.json to avoid mixed detection)
    const tsConfig = {
      compilerOptions: {
        target: 'ES2020',
        module: 'commonjs',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
      },
      include: ['**/*.ts'],
      exclude: ['node_modules'],
    };

    await fs.writeFile(
      path.join(testProjectDir, 'tsconfig.json'),
      JSON.stringify(tsConfig, null, 2)
    );
  });

  afterEach(async () => {
    // Clean up test project
    try {
      await fs.rm(testProjectDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it('should display help when --help flag is used', () => {
    const result = execSync(`node ${cliPath} refactor-suggest --help`, {
      encoding: 'utf8',
      cwd: path.dirname(cliPath),
    });

    expect(result).toContain('Generate intelligent refactoring suggestions');
    expect(result).toContain('--format');
    expect(result).toContain('--prioritize');
    expect(result).toContain('--max-suggestions');
    expect(result).toContain('--skill-level');
  });

  it('should run analysis on test project with default options', () => {
    const result = execSync(`node ${cliPath} refactor-suggest ${testProjectDir}`, {
      encoding: 'utf8',
      cwd: path.dirname(cliPath),
      timeout: 30000, // 30 second timeout
    });

    expect(result).toContain('Refactoring Suggestions Analysis');
    expect(result).toContain('Summary:');
    expect(result).toContain('Total Suggestions:');
    expect(result).toContain('Next Steps:');
  });

  it.skip('should output JSON format when requested', () => {
    let result: string;
    let errorOutput: string = '';

    try {
      result = execSync(`node ${cliPath} refactor-suggest ${testProjectDir} --format json`, {
        encoding: 'utf8',
        cwd: path.dirname(cliPath),
        timeout: 30000,
      });
    } catch (error: any) {
      // Capture stderr if command fails
      errorOutput = error.stderr || error.stdout || error.message || '';
      result = error.stdout || '';
    }

    // Debug output
    console.log('=== DEBUG OUTPUT ===');
    console.log('Result length:', result.length);
    console.log('First 200 chars:', result.substring(0, 200));
    console.log('Error output:', errorOutput);
    console.log('=== END DEBUG ===');

    // Should be valid JSON
    expect(() => JSON.parse(result)).not.toThrow();

    const parsed = JSON.parse(result);
    expect(parsed).toHaveProperty('suggestions');
    expect(parsed).toHaveProperty('summary');
    expect(parsed).toHaveProperty('recommendations');
  });

  it.skip('should respect max-suggestions limit', () => {
    const result = execSync(
      `node ${cliPath} refactor-suggest ${testProjectDir} --max-suggestions 3 --format json`,
      {
        encoding: 'utf8',
        cwd: path.dirname(cliPath),
        timeout: 30000,
      }
    );

    const parsed = JSON.parse(result);
    expect(parsed.suggestions.length).toBeLessThanOrEqual(3);
  });

  it.skip('should handle different skill levels', () => {
    const beginnerResult = execSync(
      `node ${cliPath} refactor-suggest ${testProjectDir} --skill-level beginner --format json`,
      {
        encoding: 'utf8',
        cwd: path.dirname(cliPath),
        timeout: 30000,
      }
    );

    const advancedResult = execSync(
      `node ${cliPath} refactor-suggest ${testProjectDir} --skill-level advanced --format json`,
      {
        encoding: 'utf8',
        cwd: path.dirname(cliPath),
        timeout: 30000,
      }
    );

    // Both should be valid JSON
    expect(() => JSON.parse(beginnerResult)).not.toThrow();
    expect(() => JSON.parse(advancedResult)).not.toThrow();
  });

  it.skip('should handle different prioritization options', () => {
    const priorities = ['safety', 'impact', 'effort', 'readiness'];

    for (const priority of priorities) {
      const result = execSync(
        `node ${cliPath} refactor-suggest ${testProjectDir} --prioritize ${priority} --format json`,
        {
          encoding: 'utf8',
          cwd: path.dirname(cliPath),
          timeout: 30000,
        }
      );

      expect(() => JSON.parse(result)).not.toThrow();
    }
  });

  it.skip('should show quick wins when requested', () => {
    const result = execSync(
      `node ${cliPath} refactor-suggest ${testProjectDir} --quick-wins-only`,
      {
        encoding: 'utf8',
        cwd: path.dirname(cliPath),
        timeout: 30000,
      }
    );

    expect(result).toContain('Refactoring Suggestions Analysis');
    // Should complete without errors
  });

  it('should handle non-existent project path gracefully', () => {
    const nonExistentPath = path.join(__dirname, 'non-existent-project');

    expect(() => {
      execSync(`node ${cliPath} refactor-suggest ${nonExistentPath}`, {
        encoding: 'utf8',
        cwd: path.dirname(cliPath),
        timeout: 10000,
      });
    }).toThrow();
  });

  it('should validate invalid options', () => {
    // Invalid format
    expect(() => {
      execSync(`node ${cliPath} refactor-suggest ${testProjectDir} --format invalid`, {
        encoding: 'utf8',
        cwd: path.dirname(cliPath),
        timeout: 10000,
      });
    }).toThrow();

    // Invalid skill level
    expect(() => {
      execSync(`node ${cliPath} refactor-suggest ${testProjectDir} --skill-level invalid`, {
        encoding: 'utf8',
        cwd: path.dirname(cliPath),
        timeout: 10000,
      });
    }).toThrow();

    // Invalid prioritization
    expect(() => {
      execSync(`node ${cliPath} refactor-suggest ${testProjectDir} --prioritize invalid`, {
        encoding: 'utf8',
        cwd: path.dirname(cliPath),
        timeout: 10000,
      });
    }).toThrow();
  });

  it.skip('should save output to file when specified', async () => {
    const outputFile = path.join(testProjectDir, 'suggestions.json');

    execSync(
      `node ${cliPath} refactor-suggest ${testProjectDir} --format json --output ${outputFile}`,
      {
        encoding: 'utf8',
        cwd: path.dirname(cliPath),
        timeout: 30000,
      }
    );

    // Check that file was created
    const stats = await fs.stat(outputFile);
    expect(stats.isFile()).toBe(true);

    // Check that file contains valid JSON
    const content = await fs.readFile(outputFile, 'utf8');
    expect(() => JSON.parse(content)).not.toThrow();
  });
});
