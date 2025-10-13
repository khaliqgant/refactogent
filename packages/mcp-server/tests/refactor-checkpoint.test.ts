import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { execSync } from 'child_process';
import { RefactorCheckpointTool } from '../src/tools/refactor-checkpoint.js';
import {
  createTestRepo,
  createTestFile,
  withCwd,
  getStashList,
  writeFile,
  readFile,
  commitChanges,
  getGitStatus,
  TestRepo
} from './helpers/test-utils.js';

describe('RefactorCheckpointTool', () => {
  let tool: RefactorCheckpointTool;
  let testRepo: TestRepo;
  let cwdRestore: { restore: () => void };

  beforeEach(() => {
    tool = new RefactorCheckpointTool();
    testRepo = createTestRepo();
    cwdRestore = withCwd(testRepo.path);
  });

  afterEach(() => {
    cwdRestore.restore();
    testRepo.cleanup();
  });

  describe('Creating Checkpoints', () => {
    it('should create a checkpoint with changed files', async () => {
      // Make some changes
      createTestFile(testRepo.path, 'test.txt', 'original content');
      execSync('git add .', { cwd: testRepo.path, stdio: 'pipe' });
      execSync('git commit -m "Add test file"', { cwd: testRepo.path, stdio: 'pipe' });

      // Modify the file
      writeFile(`${testRepo.path}/test.txt`, 'modified content');

      const result = await tool.execute({
        message: 'Before refactoring',
        includeUntracked: false,
      });

      const text = result.content[0].text;
      expect(text).toContain('Checkpoint Created');
      expect(text).toContain('Checkpoint ID');
      expect(text).toContain('Before refactoring');
      expect(text).toContain('test.txt');
    });

    it('should create checkpoint with stable ID (git hash)', async () => {
      // Create and commit a file
      createTestFile(testRepo.path, 'app.js', 'console.log("test");');
      commitChanges(testRepo.path, 'Add app.js');

      // Modify it
      writeFile(`${testRepo.path}/app.js`, 'console.log("modified");');

      const result = await tool.execute({
        message: 'Test checkpoint',
        includeUntracked: false,
      });

      const text = result.content[0].text;
      const checkpointMatch = text.match(/\*\*Checkpoint ID\*\*:\s*`([a-f0-9]{40})`/i);

      expect(checkpointMatch).toBeTruthy();
      expect(checkpointMatch![1]).toHaveLength(40); // Git hash is 40 chars
    });

    it('should handle no changes to checkpoint', async () => {
      // No changes made
      const result = await tool.execute({
        message: 'Nothing to save',
        includeUntracked: false,
      });

      const text = result.content[0].text;
      expect(text).toContain('No local changes');
    });

    it('should include untracked files when includeUntracked=true', async () => {
      // Create untracked file
      createTestFile(testRepo.path, 'untracked.txt', 'untracked content');

      const result = await tool.execute({
        message: 'With untracked',
        includeUntracked: true,
      });

      const text = result.content[0].text;
      expect(text).toContain('Checkpoint Created');
      expect(text).toContain('untracked.txt');
    });

    it('should not include untracked files when includeUntracked=false', async () => {
      // Create committed file and modify it
      createTestFile(testRepo.path, 'tracked.txt', 'tracked');
      commitChanges(testRepo.path, 'Add tracked file');
      writeFile(`${testRepo.path}/tracked.txt`, 'tracked modified');

      // Create untracked file
      createTestFile(testRepo.path, 'untracked.txt', 'untracked');

      const result = await tool.execute({
        message: 'Without untracked',
        includeUntracked: false,
      });

      const text = result.content[0].text;
      expect(text).toContain('Checkpoint Created');
      expect(text).toContain('tracked.txt');
      expect(text).not.toContain('untracked.txt');
    });

    it('should track multiple files in checkpoint', async () => {
      // Create and commit multiple files
      createTestFile(testRepo.path, 'file1.txt', 'content1');
      createTestFile(testRepo.path, 'file2.txt', 'content2');
      createTestFile(testRepo.path, 'file3.txt', 'content3');
      commitChanges(testRepo.path, 'Add files');

      // Modify all files
      writeFile(`${testRepo.path}/file1.txt`, 'modified1');
      writeFile(`${testRepo.path}/file2.txt`, 'modified2');
      writeFile(`${testRepo.path}/file3.txt`, 'modified3');

      const result = await tool.execute({
        message: 'Multiple files',
        includeUntracked: false,
      });

      const text = result.content[0].text;
      expect(text).toContain('Checkpoint Created');
      expect(text).toContain('file1.txt');
      expect(text).toContain('file2.txt');
      expect(text).toContain('file3.txt');
    });
  });

  describe('Checkpoint IDs', () => {
    it('should generate stable checkpoint ID based on git hash', async () => {
      createTestFile(testRepo.path, 'test.txt', 'content');
      commitChanges(testRepo.path, 'Add test file');
      writeFile(`${testRepo.path}/test.txt`, 'modified');

      const result = await tool.execute({
        message: 'Test checkpoint',
        includeUntracked: false,
      });

      const text = result.content[0].text;
      const checkpointMatch = text.match(/\*\*Checkpoint ID\*\*:\s*`([a-f0-9]{40})`/i);
      expect(checkpointMatch).toBeTruthy();

      const checkpointId = checkpointMatch![1];

      // Verify the checkpoint ID is a valid git hash
      const verifyHash = execSync(`git rev-parse --verify ${checkpointId}`, {
        cwd: testRepo.path,
        encoding: 'utf-8',
        stdio: 'pipe'
      }).trim();

      expect(verifyHash).toBe(checkpointId);
    });

    it('should include timestamp in checkpoint output', async () => {
      createTestFile(testRepo.path, 'test.txt', 'content');
      commitChanges(testRepo.path, 'Add file');
      writeFile(`${testRepo.path}/test.txt`, 'modified');

      const result = await tool.execute({
        message: 'Test',
        includeUntracked: false,
      });

      const text = result.content[0].text;
      expect(text).toContain('Timestamp');
      expect(text).toMatch(/\d{4}-\d{2}-\d{2}/); // ISO date format
    });
  });

  describe('Rollback Functionality', () => {
    it('should rollback to checkpoint using static method', async () => {
      // Create and commit file
      createTestFile(testRepo.path, 'app.js', 'original code');
      commitChanges(testRepo.path, 'Add app.js');

      // Modify file
      writeFile(`${testRepo.path}/app.js`, 'modified code');

      // Create checkpoint
      const result = await tool.execute({
        message: 'Before changes',
        includeUntracked: false,
      });

      const text = result.content[0].text;
      const checkpointMatch = text.match(/\*\*Checkpoint ID\*\*:\s*`([a-f0-9]{40})`/i);
      const checkpointId = checkpointMatch![1];

      // Make more changes
      writeFile(`${testRepo.path}/app.js`, 'even more changes');

      // Rollback
      await RefactorCheckpointTool.rollback(checkpointId);

      // Verify file was restored
      const content = readFile(`${testRepo.path}/app.js`);
      expect(content).toBe('modified code');
    });

    it('should throw error when rolling back to invalid checkpoint', async () => {
      await expect(async () => {
        await RefactorCheckpointTool.rollback('invalid-checkpoint-id');
      }).rejects.toThrow(/Checkpoint not found/i);
    });

    it('should restore multiple files on rollback', async () => {
      // Create and commit files
      createTestFile(testRepo.path, 'file1.js', 'content1');
      createTestFile(testRepo.path, 'file2.js', 'content2');
      commitChanges(testRepo.path, 'Add files');

      // Modify files
      writeFile(`${testRepo.path}/file1.js`, 'modified1');
      writeFile(`${testRepo.path}/file2.js`, 'modified2');

      // Create checkpoint
      const result = await tool.execute({
        message: 'Before changes',
        includeUntracked: false,
      });

      const text = result.content[0].text;
      const checkpointMatch = text.match(/\*\*Checkpoint ID\*\*:\s*`([a-f0-9]{40})`/i);
      const checkpointId = checkpointMatch![1];

      // Make more changes
      writeFile(`${testRepo.path}/file1.js`, 'changed again 1');
      writeFile(`${testRepo.path}/file2.js`, 'changed again 2');

      // Rollback
      await RefactorCheckpointTool.rollback(checkpointId);

      // Verify files were restored
      expect(readFile(`${testRepo.path}/file1.js`)).toBe('modified1');
      expect(readFile(`${testRepo.path}/file2.js`)).toBe('modified2');
    });
  });

  describe('List Checkpoints', () => {
    it('should be able to list checkpoints via git stash list', async () => {
      // Create file and checkpoint
      createTestFile(testRepo.path, 'test.txt', 'content');
      commitChanges(testRepo.path, 'Add file');
      writeFile(`${testRepo.path}/test.txt`, 'modified');

      await tool.execute({
        message: 'First checkpoint',
        includeUntracked: false,
      });

      // Make more changes and another checkpoint
      writeFile(`${testRepo.path}/test.txt`, 'modified again');

      await tool.execute({
        message: 'Second checkpoint',
        includeUntracked: false,
      });

      const stashes = getStashList(testRepo.path);
      expect(stashes.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Error Handling', () => {
    it('should throw error when not in a git repository', async () => {
      // Create non-git directory
      const nonGitRepo = createTestRepo();
      execSync('rm -rf .git', { cwd: nonGitRepo.path, stdio: 'pipe' });

      const nonGitRestore = withCwd(nonGitRepo.path);

      await expect(async () => {
        await tool.execute({
          message: 'Test',
          includeUntracked: false,
        });
      }).rejects.toThrow(/git repository/i);

      nonGitRestore.restore();
      nonGitRepo.cleanup();
    });

    it('should handle git errors gracefully', async () => {
      // Create a scenario that might cause git issues
      createTestFile(testRepo.path, 'test.txt', 'content');

      // Note: This test ensures the tool handles errors without crashing
      const result = await tool.execute({
        message: 'Test checkpoint',
        includeUntracked: false,
      });

      expect(result.content[0]).toHaveProperty('text');
    });
  });

  describe('Output Format', () => {
    it('should return properly formatted markdown output', async () => {
      createTestFile(testRepo.path, 'test.txt', 'content');
      commitChanges(testRepo.path, 'Add file');
      writeFile(`${testRepo.path}/test.txt`, 'modified');

      const result = await tool.execute({
        message: 'Test checkpoint',
        includeUntracked: false,
      });

      const text = result.content[0].text;
      expect(text).toContain('# Checkpoint Created');
      expect(text).toContain('**Checkpoint ID**');
      expect(text).toContain('**Timestamp**');
      expect(text).toContain('**Message**');
      expect(text).toContain('## Files Tracked');
      expect(text).toContain('## Rollback Instructions');
    });

    it('should include rollback instructions in output', async () => {
      createTestFile(testRepo.path, 'test.txt', 'content');
      commitChanges(testRepo.path, 'Add file');
      writeFile(`${testRepo.path}/test.txt`, 'modified');

      const result = await tool.execute({
        message: 'Test',
        includeUntracked: false,
      });

      const text = result.content[0].text;
      expect(text).toContain('git stash list');
      expect(text).toContain('git stash pop');
      expect(text).toContain('refactor_validate');
    });
  });

  describe('Integration with Git', () => {
    it('should work with staged changes', async () => {
      createTestFile(testRepo.path, 'staged.txt', 'content');
      execSync('git add staged.txt', { cwd: testRepo.path, stdio: 'pipe' });

      const result = await tool.execute({
        message: 'Staged changes',
        includeUntracked: false,
      });

      const text = result.content[0].text;
      expect(text).toContain('Checkpoint Created');
      expect(text).toContain('staged.txt');
    });

    it('should work with unstaged changes', async () => {
      createTestFile(testRepo.path, 'file.txt', 'original');
      commitChanges(testRepo.path, 'Add file');

      writeFile(`${testRepo.path}/file.txt`, 'unstaged changes');

      const result = await tool.execute({
        message: 'Unstaged changes',
        includeUntracked: false,
      });

      const text = result.content[0].text;
      expect(text).toContain('Checkpoint Created');
      expect(text).toContain('file.txt');
    });

    it('should work with mixed staged and unstaged changes', async () => {
      // Create and commit files
      createTestFile(testRepo.path, 'file1.txt', 'content1');
      createTestFile(testRepo.path, 'file2.txt', 'content2');
      commitChanges(testRepo.path, 'Add files');

      // Make staged changes
      writeFile(`${testRepo.path}/file1.txt`, 'staged change');
      execSync('git add file1.txt', { cwd: testRepo.path, stdio: 'pipe' });

      // Make unstaged changes
      writeFile(`${testRepo.path}/file2.txt`, 'unstaged change');

      const result = await tool.execute({
        message: 'Mixed changes',
        includeUntracked: false,
      });

      const text = result.content[0].text;
      expect(text).toContain('Checkpoint Created');
      expect(text).toContain('file1.txt');
      expect(text).toContain('file2.txt');
    });
  });
});
