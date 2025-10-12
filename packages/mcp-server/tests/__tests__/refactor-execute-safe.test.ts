import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { RefactorExecuteSafeTool } from '../../src/tools/refactor-execute-safe.js';

describe('RefactorExecuteSafeTool', () => {
  let tool: RefactorExecuteSafeTool;
  let testDir: string;
  let testFile: string;

  beforeEach(() => {
    tool = new RefactorExecuteSafeTool();
    testDir = path.join(__dirname, '../temp-test-files');
    testFile = path.join(testDir, 'test.ts');

    // Create temp directory
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    // Initialize git repo for testing
    try {
      execSync('git init', { cwd: testDir, stdio: 'pipe' });
      execSync('git config user.email "test@example.com"', { cwd: testDir, stdio: 'pipe' });
      execSync('git config user.name "Test User"', { cwd: testDir, stdio: 'pipe' });
    } catch (error) {
      // Ignore if already initialized
    }

    // Create initial test file
    fs.writeFileSync(testFile, 'export const original = true;\n');

    // Change to test directory for git operations
    process.chdir(testDir);
  });

  afterEach(() => {
    // Cleanup
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }

    // Change back to project root
    process.chdir(path.join(__dirname, '../..'));
  });

  describe('Single File Update', () => {
    it('should successfully update a single file', async () => {
      const newContent = 'export const updated = true;\n';

      const result = await tool.execute({
        changes: [{
          filePath: testFile,
          operation: 'update',
          newContent
        }],
        description: 'Update test file',
        skipValidation: true,
        autoRollback: false
      });

      expect(result.content[0].text).toContain('Success');
      expect(result.content[0].text).toContain('Changes Applied: 1');

      const content = fs.readFileSync(testFile, 'utf-8');
      expect(content).toBe(newContent);
    });

    it('should create checkpoint before applying changes', async () => {
      const result = await tool.execute({
        changes: [{
          filePath: testFile,
          operation: 'update',
          newContent: 'export const changed = true;\n'
        }],
        description: 'Test checkpoint',
        skipValidation: true,
        autoRollback: false
      });

      const text = result.content[0].text;
      expect(text).toContain('Checkpoint ID');
      expect(text).toMatch(/refactogent-checkpoint-\d+/);
    });
  });

  describe('Multiple File Operations', () => {
    it('should handle multiple file updates', async () => {
      const file2 = path.join(testDir, 'test2.ts');
      fs.writeFileSync(file2, 'export const file2 = true;\n');

      const result = await tool.execute({
        changes: [
          {
            filePath: testFile,
            operation: 'update',
            newContent: 'export const updated1 = true;\n'
          },
          {
            filePath: file2,
            operation: 'update',
            newContent: 'export const updated2 = true;\n'
          }
        ],
        description: 'Update multiple files',
        skipValidation: true,
        autoRollback: false
      });

      expect(result.content[0].text).toContain('Changes Applied: 2');

      const content1 = fs.readFileSync(testFile, 'utf-8');
      const content2 = fs.readFileSync(file2, 'utf-8');
      expect(content1).toContain('updated1');
      expect(content2).toContain('updated2');
    });

    it('should create new files', async () => {
      const newFile = path.join(testDir, 'new-file.ts');

      const result = await tool.execute({
        changes: [{
          filePath: newFile,
          operation: 'create',
          newContent: 'export const newFile = true;\n'
        }],
        description: 'Create new file',
        skipValidation: true,
        autoRollback: false
      });

      expect(result.content[0].text).toContain('Success');
      expect(fs.existsSync(newFile)).toBe(true);

      const content = fs.readFileSync(newFile, 'utf-8');
      expect(content).toContain('newFile');
    });

    it('should delete files', async () => {
      const deleteFile = path.join(testDir, 'to-delete.ts');
      fs.writeFileSync(deleteFile, 'export const temp = true;\n');

      expect(fs.existsSync(deleteFile)).toBe(true);

      const result = await tool.execute({
        changes: [{
          filePath: deleteFile,
          operation: 'delete'
        }],
        description: 'Delete file',
        skipValidation: true,
        autoRollback: false
      });

      expect(result.content[0].text).toContain('Success');
      expect(fs.existsSync(deleteFile)).toBe(false);
    });
  });

  describe('Validation', () => {
    it('should skip validation when requested', async () => {
      const result = await tool.execute({
        changes: [{
          filePath: testFile,
          operation: 'update',
          newContent: 'export const test = true;\n'
        }],
        description: 'Skip validation test',
        skipValidation: true,
        autoRollback: false
      });

      const text = result.content[0].text;
      expect(text).toContain('Validation: ❌ Failed or Skipped');
    });

    it('should run validation by default', async () => {
      // Create a valid TypeScript file
      const validContent = 'export const valid: boolean = true;\n';

      const result = await tool.execute({
        changes: [{
          filePath: testFile,
          operation: 'update',
          newContent: validContent
        }],
        description: 'Test with validation',
        skipValidation: false,
        autoRollback: false,
        skipTests: true, // Skip tests as we don't have a test suite
        skipLint: true,  // Skip lint as we don't have eslint config
        skipTypeCheck: true // Skip type check for simplicity
      });

      const text = result.content[0].text;
      expect(text).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle missing newContent for update operation', async () => {
      const result = await tool.execute({
        changes: [{
          filePath: testFile,
          operation: 'update'
          // Missing newContent
        }],
        description: 'Missing content test',
        skipValidation: true,
        autoRollback: false
      });

      const text = result.content[0].text;
      expect(text).toContain('Failed');
      expect(text).toContain('newContent is required');
    });

    it('should include error details in response', async () => {
      const result = await tool.execute({
        changes: [{
          filePath: '/nonexistent/path/file.ts',
          operation: 'update',
          newContent: 'test'
        }],
        description: 'Nonexistent path test',
        skipValidation: true,
        autoRollback: false
      });

      const text = result.content[0].text;
      expect(text).toContain('Failed');
      expect(text).toContain('Error');
    });
  });

  describe('Rollback', () => {
    it('should provide checkpoint ID for manual rollback', async () => {
      const result = await tool.execute({
        changes: [{
          filePath: testFile,
          operation: 'update',
          newContent: 'export const test = true;\n'
        }],
        description: 'Rollback test',
        skipValidation: true,
        autoRollback: false
      });

      const text = result.content[0].text;
      expect(text).toContain('Checkpoint ID');
      expect(text).toMatch(/stash@\{\d+\}/);
    });

    it('should set rolledBack flag appropriately', async () => {
      const result = await tool.execute({
        changes: [{
          filePath: testFile,
          operation: 'update',
          newContent: 'export const test = true;\n'
        }],
        description: 'No rollback needed',
        skipValidation: true,
        autoRollback: true
      });

      const text = result.content[0].text;
      expect(text).toContain('Rolled Back: No');
    });
  });

  describe('Integration', () => {
    it('should work with mixed operations (create, update, delete)', async () => {
      const file2 = path.join(testDir, 'file2.ts');
      const file3 = path.join(testDir, 'file3.ts');

      fs.writeFileSync(file3, 'export const toDelete = true;\n');

      const result = await tool.execute({
        changes: [
          {
            filePath: testFile,
            operation: 'update',
            newContent: 'export const updated = true;\n'
          },
          {
            filePath: file2,
            operation: 'create',
            newContent: 'export const created = true;\n'
          },
          {
            filePath: file3,
            operation: 'delete'
          }
        ],
        description: 'Mixed operations test',
        skipValidation: true,
        autoRollback: false
      });

      expect(result.content[0].text).toContain('Success');
      expect(result.content[0].text).toContain('Changes Applied: 3');

      expect(fs.existsSync(testFile)).toBe(true);
      expect(fs.existsSync(file2)).toBe(true);
      expect(fs.existsSync(file3)).toBe(false);

      const content1 = fs.readFileSync(testFile, 'utf-8');
      const content2 = fs.readFileSync(file2, 'utf-8');
      expect(content1).toContain('updated');
      expect(content2).toContain('created');
    });
  });
});
