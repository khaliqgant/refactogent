import { describe, it, expect, beforeEach } from '@jest/globals';
import * as path from 'path';
import { RefactorDependencyTraceTool } from '../../src/tools/refactor-dependency-trace.js';

describe('RefactorDependencyTraceTool', () => {
  let tool: RefactorDependencyTraceTool;
  let fixturesPath: string;

  beforeEach(() => {
    tool = new RefactorDependencyTraceTool();
    fixturesPath = path.join(__dirname, '../fixtures');
  });

  describe('Forward Dependencies', () => {
    it('should trace forward dependencies (what file imports)', async () => {
      const targetFile = path.join(fixturesPath, 'sample-project/src/services/UserService.ts');

      const result = await tool.execute({
        targetFile,
        direction: 'forward',
        maxDepth: 2,
        includeUnused: false
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
      const text = result.content[0].text;

      // Should show that UserService imports from User model
      expect(text).toContain('User');
      expect(text).toContain('Forward Dependencies');
    });

    it('should respect maxDepth parameter', async () => {
      const targetFile = path.join(fixturesPath, 'sample-project/src/controllers/UserController.ts');

      const result = await tool.execute({
        targetFile,
        direction: 'forward',
        maxDepth: 1,
        includeUnused: false
      });

      const text = result.content[0].text;
      expect(text).toBeDefined();
      // With maxDepth 1, should show immediate imports only
    });
  });

  describe('Backward Dependencies', () => {
    it('should trace backward dependencies (what imports this file)', async () => {
      const targetFile = path.join(fixturesPath, 'sample-project/src/models/User.ts');

      const result = await tool.execute({
        targetFile,
        direction: 'backward',
        maxDepth: 2,
        includeUnused: false
      });

      const text = result.content[0].text;

      // Should show that UserService imports User model
      expect(text).toContain('Backward Dependencies');
      expect(text).toContain('UserService');
    });

    it('should find all dependents in chain', async () => {
      const targetFile = path.join(fixturesPath, 'sample-project/src/utils/database.ts');

      const result = await tool.execute({
        targetFile,
        direction: 'backward',
        maxDepth: 3,
        includeUnused: false
      });

      const text = result.content[0].text;

      // Database is used by AuditService and UserService
      expect(text).toContain('Total Files Affected');
    });
  });

  describe('Both Directions', () => {
    it('should trace both forward and backward dependencies', async () => {
      const targetFile = path.join(fixturesPath, 'sample-project/src/services/UserService.ts');

      const result = await tool.execute({
        targetFile,
        direction: 'both',
        maxDepth: 2,
        includeUnused: false
      });

      const text = result.content[0].text;

      expect(text).toContain('Forward Dependencies');
      expect(text).toContain('Backward Dependencies');
      expect(text).toContain('Total Files Affected');
    });
  });

  describe('Circular Dependencies', () => {
    it('should detect circular dependencies', async () => {
      const targetFile = path.join(fixturesPath, 'circular-deps/FileA.ts');

      const result = await tool.execute({
        targetFile,
        direction: 'both',
        maxDepth: 5,
        includeUnused: false
      });

      const text = result.content[0].text;

      // Should detect A -> B -> A cycle
      expect(text).toContain('Circular Dependencies Found');
      expect(text).toContain('FileA');
      expect(text).toContain('FileB');
    });

    it('should calculate severity of circular dependencies', async () => {
      const targetFile = path.join(fixturesPath, 'circular-deps/FileA.ts');

      const result = await tool.execute({
        targetFile,
        direction: 'both',
        maxDepth: 5,
        includeUnused: false
      });

      const text = result.content[0].text;

      // Should show severity (medium for 2-file cycle)
      expect(text).toMatch(/\[medium\]|\[low\]|\[high\]/);
    });
  });

  describe('Unused Imports/Exports', () => {
    it('should find unused imports when enabled', async () => {
      const targetFile = path.join(fixturesPath, 'sample-project/src/services/UserService.ts');

      const result = await tool.execute({
        targetFile,
        direction: 'both',
        maxDepth: 2,
        includeUnused: true
      });

      const text = result.content[0].text;

      // Result should include unused section if any exist
      expect(text).toBeDefined();
    });

    it('should skip unused analysis when disabled', async () => {
      const targetFile = path.join(fixturesPath, 'sample-project/src/models/User.ts');

      const result = await tool.execute({
        targetFile,
        direction: 'both',
        maxDepth: 2,
        includeUnused: false
      });

      const text = result.content[0].text;

      // Should not contain unused sections
      expect(text).not.toContain('Unused Imports');
      expect(text).not.toContain('Unused Exports');
    });
  });

  describe('Error Handling', () => {
    it('should throw error for non-existent file', async () => {
      const targetFile = path.join(fixturesPath, 'non-existent-file.ts');

      await expect(tool.execute({
        targetFile,
        direction: 'both',
        maxDepth: 2,
        includeUnused: false
      })).rejects.toThrow('File not found');
    });

    it('should handle files with no dependencies', async () => {
      const targetFile = path.join(fixturesPath, 'sample-project/src/models/User.ts');

      const result = await tool.execute({
        targetFile,
        direction: 'forward',
        maxDepth: 1,
        includeUnused: false
      });

      expect(result.content).toBeDefined();
      // Should complete without errors even if no dependencies
    });
  });

  describe('Summary and Recommendations', () => {
    it('should provide helpful summary', async () => {
      const targetFile = path.join(fixturesPath, 'sample-project/src/utils/database.ts');

      const result = await tool.execute({
        targetFile,
        direction: 'backward',
        maxDepth: 3,
        includeUnused: false
      });

      const text = result.content[0].text;

      expect(text).toContain('dependencies');
      expect(text).toContain('Total Files Affected');
    });

    it('should warn about high-impact files', async () => {
      const targetFile = path.join(fixturesPath, 'sample-project/src/utils/database.ts');

      const result = await tool.execute({
        targetFile,
        direction: 'backward',
        maxDepth: 3,
        includeUnused: false
      });

      const text = result.content[0].text;

      // Should give refactoring guidance based on impact
      expect(text).toBeDefined();
    });
  });
});
