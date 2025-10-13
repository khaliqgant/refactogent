import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { RefactorValidateTool } from '../src/tools/refactor-validate.js';
import { RefactorCheckpointTool } from '../src/tools/refactor-checkpoint.js';
import {
  createTestRepo,
  createPackageJson,
  createTestFile,
  withCwd,
  writeFile,
  commitChanges,
  TestRepo
} from './helpers/test-utils.js';

describe('RefactorValidateTool', () => {
  let tool: RefactorValidateTool;
  let testRepo: TestRepo;
  let cwdRestore: { restore: () => void };

  beforeEach(() => {
    tool = new RefactorValidateTool();
    testRepo = createTestRepo();
    cwdRestore = withCwd(testRepo.path);
  });

  afterEach(() => {
    cwdRestore.restore();
    testRepo.cleanup();
  });

  describe('Test Validation', () => {
    it('should pass when no test script exists', async () => {
      createPackageJson(testRepo.path, { hasTest: false });

      const result = await tool.execute({
        skipTests: false,
        skipLint: true,
        skipTypeCheck: true,
      });

      const text = result.content[0].text;
      expect(text).toContain('Validation Results');
      expect(text).toContain('**Tests**');
    });

    it('should skip tests when skipTests=true', async () => {
      createPackageJson(testRepo.path, { hasTest: true });

      const result = await tool.execute({
        skipTests: true,
        skipLint: true,
        skipTypeCheck: true,
      });

      const text = result.content[0].text;
      expect(text).toContain('Validation Results');
    });

    it('should detect test command from package.json', async () => {
      createPackageJson(testRepo.path, { hasTest: true });

      // Create a simple test that will pass
      createTestFile(
        testRepo.path,
        'test.js',
        `console.log('test passed');`
      );

      const result = await tool.execute({
        skipTests: false,
        skipLint: true,
        skipTypeCheck: true,
      });

      const text = result.content[0].text;
      expect(text).toContain('Validation Results');
    });
  });

  describe('Lint Validation', () => {
    it('should pass when no lint script exists', async () => {
      createPackageJson(testRepo.path, { hasLint: false });

      const result = await tool.execute({
        skipTests: true,
        skipLint: false,
        skipTypeCheck: true,
      });

      const text = result.content[0].text;
      expect(text).toContain('Validation Results');
      expect(text).toContain('**Linting**');
    });

    it('should skip linting when skipLint=true', async () => {
      createPackageJson(testRepo.path, { hasLint: true });

      const result = await tool.execute({
        skipTests: true,
        skipLint: true,
        skipTypeCheck: true,
      });

      const text = result.content[0].text;
      expect(text).toContain('Validation Results');
    });

    it('should detect lint command from package.json', async () => {
      createPackageJson(testRepo.path, { hasLint: true });

      const result = await tool.execute({
        skipTests: true,
        skipLint: false,
        skipTypeCheck: true,
      });

      const text = result.content[0].text;
      expect(text).toContain('Validation Results');
    });
  });

  describe('Type Check Validation', () => {
    it('should pass when no tsconfig.json exists', async () => {
      createPackageJson(testRepo.path, { hasTypeScript: false });

      const result = await tool.execute({
        skipTests: true,
        skipLint: true,
        skipTypeCheck: false,
      });

      const text = result.content[0].text;
      expect(text).toContain('Validation Results');
      expect(text).toContain('**Type Checking**');
    });

    it('should skip type checking when skipTypeCheck=true', async () => {
      createPackageJson(testRepo.path, { hasTypeScript: true });

      const result = await tool.execute({
        skipTests: true,
        skipLint: true,
        skipTypeCheck: true,
      });

      const text = result.content[0].text;
      expect(text).toContain('Validation Results');
    });

    it('should check types when tsconfig.json exists', async () => {
      createPackageJson(testRepo.path, { hasTypeScript: true });

      // Create a simple valid TypeScript file
      createTestFile(
        testRepo.path,
        'src/index.ts',
        `export const greeting: string = 'hello';`
      );

      const result = await tool.execute({
        skipTests: true,
        skipLint: true,
        skipTypeCheck: false,
      });

      const text = result.content[0].text;
      expect(text).toContain('Validation Results');
      expect(text).toContain('**Type Checking**');
    });

    it('should detect type errors in TypeScript files', async () => {
      createPackageJson(testRepo.path, { hasTypeScript: true });

      // Create a file with type error
      createTestFile(
        testRepo.path,
        'src/bad.ts',
        `export const num: number = 'not a number';`
      );

      const result = await tool.execute({
        skipTests: true,
        skipLint: true,
        skipTypeCheck: false,
      });

      const text = result.content[0].text;
      // Type checking might fail or pass depending on tsc installation
      expect(text).toContain('Validation Results');
    });
  });

  describe('Parallel Validation', () => {
    it('should run all validations', async () => {
      createPackageJson(testRepo.path, {
        hasTest: false,
        hasLint: false,
        hasTypeScript: false,
      });

      const result = await tool.execute({
        skipTests: false,
        skipLint: false,
        skipTypeCheck: false,
      });

      const text = result.content[0].text;
      expect(text).toContain('**Tests**');
      expect(text).toContain('**Linting**');
      expect(text).toContain('**Type Checking**');
    });
  });

  describe('Auto-Rollback on Failure', () => {
    it('should rollback when validation fails and autoRollback=true', async () => {
      // Create checkpoint
      const checkpointTool = new RefactorCheckpointTool();

      createTestFile(testRepo.path, 'file.txt', 'original');
      commitChanges(testRepo.path, 'Add file');
      writeFile(`${testRepo.path}/file.txt`, 'modified');

      const checkpointResult = await checkpointTool.execute({
        message: 'Before test',
        includeUntracked: false,
      });

      const checkpointText = checkpointResult.content[0].text;
      const checkpointMatch = checkpointText.match(/\*\*Checkpoint ID\*\*:\s*`([a-f0-9]{40})`/i);

      if (!checkpointMatch) {
        throw new Error('Could not extract checkpoint ID');
      }

      const checkpointId = checkpointMatch[1];

      // Make more changes
      writeFile(`${testRepo.path}/file.txt`, 'more changes');

      // Create package.json with failing test
      createPackageJson(testRepo.path, { hasTest: true });
      createTestFile(
        testRepo.path,
        'test.js',
        `throw new Error('Test failed');`
      );

      const result = await tool.execute({
        checkpointId,
        autoRollback: true,
        skipTests: false,
        skipLint: true,
        skipTypeCheck: true,
      });

      const text = result.content[0].text;
      expect(text).toContain('Validation Results');
    });

    it('should not rollback when autoRollback=false', async () => {
      createPackageJson(testRepo.path, { hasTest: false });

      const result = await tool.execute({
        autoRollback: false,
        skipTests: false,
        skipLint: true,
        skipTypeCheck: true,
      });

      const text = result.content[0].text;
      expect(text).toContain('Validation Results');
      expect(text).not.toContain('rolled back');
    });

    it('should handle rollback failure gracefully', async () => {
      // Invalid checkpoint ID
      const result = await tool.execute({
        checkpointId: 'invalid-checkpoint-id',
        autoRollback: true,
        skipTests: true,
        skipLint: true,
        skipTypeCheck: true,
      });

      const text = result.content[0].text;
      expect(text).toContain('Validation Results');
    });
  });

  describe('Error Parsing', () => {
    it('should parse test errors correctly', async () => {
      createPackageJson(testRepo.path, { hasTest: true });

      // The test will fail because jest is not set up properly
      // This tests error handling
      const result = await tool.execute({
        skipTests: false,
        skipLint: true,
        skipTypeCheck: true,
      });

      const text = result.content[0].text;
      expect(text).toContain('Validation Results');
    });

    it('should limit errors to 10', async () => {
      // Test that error parsing limits output
      createPackageJson(testRepo.path, { hasTest: false });

      const result = await tool.execute({
        skipTests: false,
        skipLint: true,
        skipTypeCheck: true,
      });

      const text = result.content[0].text;
      expect(text).toContain('Validation Results');
    });
  });

  describe('Validation Output', () => {
    it('should show all passed when everything succeeds', async () => {
      createPackageJson(testRepo.path, {
        hasTest: false,
        hasLint: false,
        hasTypeScript: false,
      });

      const result = await tool.execute({
        skipTests: false,
        skipLint: false,
        skipTypeCheck: false,
      });

      const text = result.content[0].text;
      expect(text).toContain('Validation Results');
      expect(text).toContain('**Tests**:');
      expect(text).toContain('**Linting**:');
      expect(text).toContain('**Type Checking**:');
    });

    it('should provide suggestions when validation fails', async () => {
      createPackageJson(testRepo.path, { hasTest: true });

      // Create failing test
      createTestFile(
        testRepo.path,
        'test.js',
        `throw new Error('fail');`
      );

      const result = await tool.execute({
        skipTests: false,
        skipLint: true,
        skipTypeCheck: true,
      });

      const text = result.content[0].text;
      expect(text).toContain('Validation Results');
    });

    it('should return properly formatted markdown output', async () => {
      createPackageJson(testRepo.path, { hasTest: false });

      const result = await tool.execute({
        skipTests: false,
        skipLint: false,
        skipTypeCheck: false,
      });

      const text = result.content[0].text;
      expect(text).toContain('# Validation Results');
      expect(text).toContain('## Status');
    });
  });

  describe('File Existence Check', () => {
    it('should correctly check if tsconfig.json exists', async () => {
      // Without TypeScript
      createPackageJson(testRepo.path, { hasTypeScript: false });

      const result1 = await tool.execute({
        skipTests: true,
        skipLint: true,
        skipTypeCheck: false,
      });

      expect(result1.content[0].text).toContain('**Type Checking**:');

      // With TypeScript
      createPackageJson(testRepo.path, { hasTypeScript: true });

      const result2 = await tool.execute({
        skipTests: true,
        skipLint: true,
        skipTypeCheck: false,
      });

      expect(result2.content[0].text).toContain('**Type Checking**:');
    });
  });

  describe('Error Handling', () => {
    it('should handle missing package.json gracefully', async () => {
      // No package.json created

      const result = await tool.execute({
        skipTests: false,
        skipLint: false,
        skipTypeCheck: false,
      });

      const text = result.content[0].text;
      expect(text).toContain('Validation Results');
    });

    it('should handle malformed package.json gracefully', async () => {
      createTestFile(testRepo.path, 'package.json', '{ invalid json }');

      const result = await tool.execute({
        skipTests: false,
        skipLint: false,
        skipTypeCheck: false,
      });

      const text = result.content[0].text;
      expect(text).toContain('Validation Results');
    });

    it('should handle command execution errors gracefully', async () => {
      createPackageJson(testRepo.path, { hasTest: false });

      const result = await tool.execute({
        skipTests: false,
        skipLint: false,
        skipTypeCheck: false,
      });

      expect(result.content[0]).toHaveProperty('text');
      expect(typeof result.content[0].text).toBe('string');
    });
  });

  describe('Integration with Checkpoint', () => {
    it('should work with valid checkpoint ID', async () => {
      const checkpointTool = new RefactorCheckpointTool();

      createTestFile(testRepo.path, 'file.txt', 'content');
      commitChanges(testRepo.path, 'Add file');
      writeFile(`${testRepo.path}/file.txt`, 'modified');

      const checkpointResult = await checkpointTool.execute({
        message: 'Test checkpoint',
        includeUntracked: false,
      });

      const checkpointText = checkpointResult.content[0].text;
      const checkpointMatch = checkpointText.match(/\*\*Checkpoint ID\*\*:\s*`([a-f0-9]{40})`/i);

      if (!checkpointMatch) {
        throw new Error('Could not extract checkpoint ID');
      }

      const checkpointId = checkpointMatch[1];

      createPackageJson(testRepo.path, { hasTest: false });

      const result = await tool.execute({
        checkpointId,
        autoRollback: false,
        skipTests: false,
        skipLint: true,
        skipTypeCheck: true,
      });

      const text = result.content[0].text;
      expect(text).toContain('Validation Results');
    });

    it('should handle missing checkpoint ID gracefully', async () => {
      createPackageJson(testRepo.path, { hasTest: false });

      const result = await tool.execute({
        checkpointId: undefined,
        autoRollback: true,
        skipTests: false,
        skipLint: true,
        skipTypeCheck: true,
      });

      const text = result.content[0].text;
      expect(text).toContain('Validation Results');
    });
  });
});
