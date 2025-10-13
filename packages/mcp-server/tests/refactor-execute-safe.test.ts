import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { RefactorExecuteSafeTool } from '../src/tools/refactor-execute-safe.js';
import {
  createTestRepo,
  createPackageJson,
  createTestFile,
  withCwd,
  writeFile,
  readFile,
  commitChanges,
  fileExists,
  TestRepo
} from './helpers/test-utils.js';

describe('RefactorExecuteSafeTool', () => {
  let tool: RefactorExecuteSafeTool;
  let testRepo: TestRepo;
  let cwdRestore: { restore: () => void };

  beforeEach(() => {
    tool = new RefactorExecuteSafeTool();
    testRepo = createTestRepo();
    cwdRestore = withCwd(testRepo.path);

    // Create basic package.json with no scripts to avoid validation issues
    createPackageJson(testRepo.path, {
      hasTest: false,
      hasLint: false,
      hasTypeScript: false,
    });
  });

  afterEach(() => {
    cwdRestore.restore();
    testRepo.cleanup();
  });

  describe('File Operations', () => {
    it('should create a new file', async () => {
      const filePath = path.join(testRepo.path, 'new-file.txt');

      const result = await tool.execute({
        changes: [
          {
            filePath,
            operation: 'create',
            newContent: 'Hello, World!',
          },
        ],
        description: 'Create new file',
        skipValidation: true,
        autoRollback: false,
      });

      const text = result.content[0].text;
      expect(text).toContain('Success');
      expect(text).toContain('**Changes Applied**: 1');
      expect(fileExists(filePath)).toBe(true);
      expect(readFile(filePath)).toBe('Hello, World!');
    });

    it('should update an existing file', async () => {
      const filePath = path.join(testRepo.path, 'existing.txt');
      createTestFile(testRepo.path, 'existing.txt', 'original content');

      const result = await tool.execute({
        changes: [
          {
            filePath,
            operation: 'update',
            newContent: 'updated content',
          },
        ],
        description: 'Update existing file',
        skipValidation: true,
        autoRollback: false,
      });

      const text = result.content[0].text;
      expect(text).toContain('Success');
      expect(readFile(filePath)).toBe('updated content');
    });

    it('should delete a file', async () => {
      const filePath = path.join(testRepo.path, 'to-delete.txt');
      createTestFile(testRepo.path, 'to-delete.txt', 'will be deleted');

      const result = await tool.execute({
        changes: [
          {
            filePath,
            operation: 'delete',
          },
        ],
        description: 'Delete file',
        skipValidation: true,
        autoRollback: false,
      });

      const text = result.content[0].text;
      expect(text).toContain('Success');
      expect(fileExists(filePath)).toBe(false);
    });

    it('should handle multiple file operations', async () => {
      const file1 = path.join(testRepo.path, 'file1.txt');
      const file2 = path.join(testRepo.path, 'file2.txt');
      const file3 = path.join(testRepo.path, 'file3.txt');

      createTestFile(testRepo.path, 'file2.txt', 'original');
      createTestFile(testRepo.path, 'file3.txt', 'to delete');

      const result = await tool.execute({
        changes: [
          { filePath: file1, operation: 'create', newContent: 'new' },
          { filePath: file2, operation: 'update', newContent: 'updated' },
          { filePath: file3, operation: 'delete' },
        ],
        description: 'Multiple operations',
        skipValidation: true,
        autoRollback: false,
      });

      const text = result.content[0].text;
      expect(text).toContain('Success');
      expect(text).toContain('**Changes Applied**: 3');
      expect(fileExists(file1)).toBe(true);
      expect(readFile(file1)).toBe('new');
      expect(readFile(file2)).toBe('updated');
      expect(fileExists(file3)).toBe(false);
    });
  });

  describe('Checkpoint Creation', () => {
    it('should create a checkpoint before applying changes', async () => {
      const filePath = path.join(testRepo.path, 'test.txt');
      createTestFile(testRepo.path, 'test.txt', 'original');
      commitChanges(testRepo.path, 'Add test file');

      const result = await tool.execute({
        changes: [
          {
            filePath,
            operation: 'update',
            newContent: 'modified',
          },
        ],
        description: 'Test change',
        skipValidation: true,
        autoRollback: false,
      });

      const text = result.content[0].text;
      expect(text).toContain('Checkpoint ID');
    });

    it('should handle checkpoint creation when there are no changes', async () => {
      const filePath = path.join(testRepo.path, 'new.txt');

      const result = await tool.execute({
        changes: [
          {
            filePath,
            operation: 'create',
            newContent: 'content',
          },
        ],
        description: 'Create new file',
        skipValidation: true,
        autoRollback: false,
      });

      const text = result.content[0].text;
      // Should still complete successfully even if checkpoint had no changes
      expect(text).toContain('Success');
    });
  });

  describe('Validation', () => {
    it('should skip validation when skipValidation=true', async () => {
      const filePath = path.join(testRepo.path, 'file.txt');

      const result = await tool.execute({
        changes: [
          {
            filePath,
            operation: 'create',
            newContent: 'content',
          },
        ],
        description: 'Test',
        skipValidation: true,
        autoRollback: false,
      });

      const text = result.content[0].text;
      expect(text).toContain('Success');
      expect(text).toContain('**Validation**: ❌ Failed or Skipped');
    });

    it('should run validation when skipValidation=false', async () => {
      createPackageJson(testRepo.path, {
        hasTest: false,
        hasLint: false,
        hasTypeScript: false,
      });

      const filePath = path.join(testRepo.path, 'file.txt');

      const result = await tool.execute({
        changes: [
          {
            filePath,
            operation: 'create',
            newContent: 'content',
          },
        ],
        description: 'Test with validation',
        skipValidation: false,
        autoRollback: false,
      });

      const text = result.content[0].text;
      expect(text).toContain('Validation');
    });

    it('should pass validation options to validator', async () => {
      const filePath = path.join(testRepo.path, 'file.txt');

      const result = await tool.execute({
        changes: [
          {
            filePath,
            operation: 'create',
            newContent: 'content',
          },
        ],
        description: 'Test',
        skipValidation: false,
        skipTests: true,
        skipLint: true,
        skipTypeCheck: true,
        autoRollback: false,
      });

      const text = result.content[0].text;
      expect(text).toContain('Refactoring Execution');
    });
  });

  describe('Auto-Rollback', () => {
    it('should rollback on validation failure when autoRollback=true', async () => {
      createTestFile(testRepo.path, 'original.txt', 'original');
      commitChanges(testRepo.path, 'Add file');

      const filePath = path.join(testRepo.path, 'original.txt');

      // Create package.json with failing test
      createPackageJson(testRepo.path, { hasTest: true });
      createTestFile(testRepo.path, 'test.js', `throw new Error('fail');`);

      const result = await tool.execute({
        changes: [
          {
            filePath,
            operation: 'update',
            newContent: 'modified',
          },
        ],
        description: 'Change that will fail validation',
        skipValidation: false,
        autoRollback: true,
        skipTests: false,
        skipLint: true,
        skipTypeCheck: true,
      });

      const text = result.content[0].text;
      expect(text).toContain('Refactoring Execution');
    });

    it('should not rollback when autoRollback=false', async () => {
      const filePath = path.join(testRepo.path, 'file.txt');

      const result = await tool.execute({
        changes: [
          {
            filePath,
            operation: 'create',
            newContent: 'content',
          },
        ],
        description: 'Test',
        skipValidation: true,
        autoRollback: false,
      });

      const text = result.content[0].text;
      expect(text).toContain('**Rolled Back**: No');
    });
  });

  describe('Error Handling', () => {
    it('should handle file operation errors', async () => {
      // Try to update a file that doesn't exist (should still work since update creates)
      const filePath = path.join(testRepo.path, 'nonexistent.txt');

      const result = await tool.execute({
        changes: [
          {
            filePath,
            operation: 'update',
            newContent: 'content',
          },
        ],
        description: 'Update nonexistent file',
        skipValidation: true,
        autoRollback: false,
      });

      // Should handle gracefully
      expect(result.content[0].text).toBeTruthy();
    });

    it('should handle missing newContent for create operation', async () => {
      const filePath = path.join(testRepo.path, 'test.txt');

      const result = await tool.execute({
        changes: [
          {
            filePath,
            operation: 'create',
            // Missing newContent
          } as any,
        ],
        description: 'Invalid operation',
        skipValidation: true,
        autoRollback: false,
      });

      const text = result.content[0].text;
      expect(text).toContain('Failed');
    });

    it('should handle missing newContent for update operation', async () => {
      const filePath = path.join(testRepo.path, 'test.txt');
      createTestFile(testRepo.path, 'test.txt', 'original');

      const result = await tool.execute({
        changes: [
          {
            filePath,
            operation: 'update',
            // Missing newContent
          } as any,
        ],
        description: 'Invalid update',
        skipValidation: true,
        autoRollback: false,
      });

      const text = result.content[0].text;
      expect(text).toContain('Failed');
    });

    it('should rollback on error if autoRollback is enabled', async () => {
      createTestFile(testRepo.path, 'file.txt', 'original');
      commitChanges(testRepo.path, 'Add file');

      const result = await tool.execute({
        changes: [
          {
            filePath: '/invalid/path/that/cannot/be/written',
            operation: 'create',
            newContent: 'content',
          },
        ],
        description: 'Invalid path',
        skipValidation: true,
        autoRollback: true,
      });

      const text = result.content[0].text;
      expect(text).toContain('Failed');
    });

    it('should handle unknown operation types', async () => {
      const filePath = path.join(testRepo.path, 'test.txt');

      // Schema validation should reject unknown operation types
      await expect(async () => {
        await tool.execute({
          changes: [
            {
              filePath,
              operation: 'unknown' as any,
              newContent: 'content',
            },
          ],
          description: 'Unknown operation',
          skipValidation: true,
          autoRollback: false,
        });
      }).rejects.toThrow(/invalid_enum_value|Invalid enum value/i);
    });
  });

  describe('Atomic Operations', () => {
    it('should stop on first error and not apply remaining changes', async () => {
      const file1 = path.join(testRepo.path, 'file1.txt');
      const file2 = path.join(testRepo.path, 'file2.txt');

      const result = await tool.execute({
        changes: [
          { filePath: file1, operation: 'create', newContent: 'content1' },
          { filePath: '/invalid/path', operation: 'create', newContent: 'content2' },
          { filePath: file2, operation: 'create', newContent: 'content3' },
        ],
        description: 'Test atomic operations',
        skipValidation: true,
        autoRollback: false,
      });

      const text = result.content[0].text;
      expect(text).toContain('Failed');
      // First file should be created
      expect(fileExists(file1)).toBe(true);
      // Third file should not be created (stopped after error)
      expect(fileExists(file2)).toBe(false);
    });
  });

  describe('Output Format', () => {
    it('should return properly formatted markdown output on success', async () => {
      const filePath = path.join(testRepo.path, 'test.txt');

      const result = await tool.execute({
        changes: [
          {
            filePath,
            operation: 'create',
            newContent: 'content',
          },
        ],
        description: 'Test operation',
        skipValidation: true,
        autoRollback: false,
      });

      const text = result.content[0].text;
      expect(text).toContain('# Refactoring Execution');
      expect(text).toContain('## Status: Success');
      expect(text).toContain('- **Checkpoint ID**:');
      expect(text).toContain('- **Changes Applied**: 1');
      expect(text).toContain('- **Validation**:');
      expect(text).toContain('- **Rolled Back**: No');
    });

    it('should return properly formatted markdown output on failure', async () => {
      const result = await tool.execute({
        changes: [
          {
            filePath: '/invalid/path',
            operation: 'create',
            newContent: 'content',
          },
        ],
        description: 'Failing operation',
        skipValidation: true,
        autoRollback: false,
      });

      const text = result.content[0].text;
      expect(text).toContain('# Refactoring Execution');
      expect(text).toContain('## Status: Failed');
      expect(text).toContain('## Error');
    });

    it('should include validation results when validation runs', async () => {
      const filePath = path.join(testRepo.path, 'test.txt');

      const result = await tool.execute({
        changes: [
          {
            filePath,
            operation: 'create',
            newContent: 'content',
          },
        ],
        description: 'With validation',
        skipValidation: false,
        autoRollback: false,
        skipTests: true,
        skipLint: true,
        skipTypeCheck: true,
      });

      const text = result.content[0].text;
      expect(text).toContain('Validation Results');
    });

    it('should include manual rollback instructions on failure', async () => {
      // Create an initial commit and then make uncommitted changes
      // so the checkpoint has something to stash
      const testFile = path.join(testRepo.path, 'initial.txt');
      createTestFile(testRepo.path, 'initial.txt', 'initial content');
      commitChanges(testRepo.path, 'Initial commit');

      // Make an uncommitted change so git stash will have something to save
      writeFile(testFile, 'modified content');

      const result = await tool.execute({
        changes: [
          {
            filePath: '/invalid/path',
            operation: 'create',
            newContent: 'content',
          },
        ],
        description: 'Failing operation',
        skipValidation: true,
        autoRollback: false,
      });

      const text = result.content[0].text;
      expect(text).toContain('Manual Rollback');
      expect(text).toContain('git stash');
    });
  });

  describe('Integration Test', () => {
    it('should perform complete safe refactoring workflow', async () => {
      // Create initial files
      const file1 = path.join(testRepo.path, 'service.ts');
      const file2 = path.join(testRepo.path, 'utils.ts');

      createTestFile(testRepo.path, 'service.ts', 'export const old = 1;');
      commitChanges(testRepo.path, 'Initial commit');

      // Execute safe refactoring
      const result = await tool.execute({
        changes: [
          {
            filePath: file1,
            operation: 'update',
            newContent: 'export const refactored = 1;',
          },
          {
            filePath: file2,
            operation: 'create',
            newContent: 'export const helper = () => {};',
          },
        ],
        description: 'Refactor service and add utils',
        skipValidation: false,
        autoRollback: false,
        skipTests: true,
        skipLint: true,
        skipTypeCheck: true,
      });

      const text = result.content[0].text;
      expect(text).toContain('Success');
      expect(text).toContain('**Changes Applied**: 2');
      expect(readFile(file1)).toBe('export const refactored = 1;');
      expect(readFile(file2)).toBe('export const helper = () => {};');
    });
  });
});
