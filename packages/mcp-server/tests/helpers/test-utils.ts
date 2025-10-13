import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Test utilities for MCP server tests
 */

export interface TestRepo {
  path: string;
  cleanup: () => void;
}

/**
 * Create a temporary git repository for testing
 */
export function createTestRepo(): TestRepo {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'refactogent-test-'));

  // Initialize git repo
  execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git config user.name "Test User"', { cwd: tmpDir, stdio: 'pipe' });

  // Create initial commit
  fs.writeFileSync(path.join(tmpDir, 'README.md'), '# Test Repo\n');
  execSync('git add .', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git commit -m "Initial commit"', { cwd: tmpDir, stdio: 'pipe' });

  return {
    path: tmpDir,
    cleanup: () => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch (error) {
        console.error(`Failed to cleanup test repo: ${error}`);
      }
    }
  };
}

/**
 * Create a test file with content in a directory
 */
export function createTestFile(dir: string, relativePath: string, content: string): string {
  const filePath = path.join(dir, relativePath);
  const dirPath = path.dirname(filePath);

  // Create directories if needed
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  fs.writeFileSync(filePath, content);
  return filePath;
}

/**
 * Create a package.json file with test scripts
 */
export function createPackageJson(
  dir: string,
  options: {
    hasTest?: boolean;
    hasLint?: boolean;
    hasTypeScript?: boolean;
  } = {}
): void {
  const scripts: Record<string, string> = {};

  if (options.hasTest) {
    scripts.test = 'jest';
  }

  if (options.hasLint) {
    scripts.lint = 'eslint .';
  }

  const packageJson = {
    name: 'test-project',
    version: '1.0.0',
    scripts,
  };

  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );

  if (options.hasTypeScript) {
    fs.writeFileSync(
      path.join(dir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2020',
          module: 'commonjs',
          strict: true,
        }
      }, null, 2)
    );
  }
}

/**
 * Mock execSync to return specific outputs
 */
export function mockExecSync(mockImplementation: (cmd: string) => string) {
  const originalExecSync = execSync;

  // @ts-ignore
  global.execSync = (cmd: string, options?: any) => {
    try {
      return mockImplementation(cmd);
    } catch (error) {
      throw error;
    }
  };

  return () => {
    // @ts-ignore
    global.execSync = originalExecSync;
  };
}

/**
 * Wait for a promise to resolve or timeout
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout: number = 5000,
  interval: number = 100
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error('Timeout waiting for condition');
}

/**
 * Get git stash list
 */
export function getStashList(cwd: string): string[] {
  try {
    const output = execSync('git stash list', { cwd, encoding: 'utf-8', stdio: 'pipe' });
    return output.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Check if file exists
 */
export function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

/**
 * Read file content
 */
export function readFile(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * Write file content
 */
export function writeFile(filePath: string, content: string): void {
  fs.writeFileSync(filePath, content, 'utf-8');
}

/**
 * Get current working directory and temporarily change it
 */
export function withCwd(newCwd: string): { restore: () => void } {
  const originalCwd = process.cwd();
  process.chdir(newCwd);

  return {
    restore: () => process.chdir(originalCwd)
  };
}

/**
 * Create a sample TypeScript file for testing
 */
export function createSampleTsFile(dir: string, name: string): string {
  const content = `
export interface ${name}Config {
  enabled: boolean;
  timeout: number;
}

export class ${name}Service {
  constructor(private config: ${name}Config) {}

  execute(): void {
    if (this.config.enabled) {
      console.log('Executing ${name}');
    }
  }

  getTimeout(): number {
    return this.config.timeout;
  }
}

export function create${name}(config: ${name}Config): ${name}Service {
  return new ${name}Service(config);
}
`.trim();

  return createTestFile(dir, `src/${name}.ts`, content);
}

/**
 * Commit all changes in a git repo
 */
export function commitChanges(cwd: string, message: string): void {
  execSync('git add .', { cwd, stdio: 'pipe' });
  execSync(`git commit -m "${message}"`, { cwd, stdio: 'pipe' });
}

/**
 * Get git status
 */
export function getGitStatus(cwd: string): string {
  try {
    return execSync('git status --porcelain', { cwd, encoding: 'utf-8', stdio: 'pipe' });
  } catch {
    return '';
  }
}
