import { describe, it, expect } from '@jest/globals';
import { RefactorRenameTool } from '../src/tools/refactor-rename.js';
import * as path from 'path';

describe('RefactorRenameTool', () => {
  let tool: RefactorRenameTool;

  beforeEach(() => {
    tool = new RefactorRenameTool();
  });

  describe('Error Handling', () => {
    it('should handle non-existent file gracefully', async () => {
      const result = await tool.execute({
        filePath: '/nonexistent/file.ts',
        symbolName: 'Foo',
        newName: 'Bar',
        scope: 'project',
      });

      const text = result.content[0].text;

      expect(text).toContain('Rename Failed');
      expect(text).toContain('Error');
      expect(text).toMatch(/not found|does not exist/i);
    });

    it('should handle invalid scope gracefully', async () => {
      const fixturePath = path.join(__dirname, 'fixtures', 'sample-project');
      const filePath = path.join(fixturePath, 'src', 'services', 'UserService.ts');

      await expect(async () => {
        await tool.execute({
          filePath,
          symbolName: 'UserService',
          newName: 'UserManager',
          scope: 'invalid',
        });
      }).rejects.toThrow();
    });
  });

  describe('Output Format Validation', () => {
    it('should include all required sections in error output', async () => {
      const result = await tool.execute({
        filePath: '/nonexistent/file.ts',
        symbolName: 'Foo',
        newName: 'Bar',
        scope: 'project',
      });

      const text = result.content[0].text;

      // Check error format
      expect(text).toContain('# Rename Failed');
      expect(text).toContain('**Error**:');
      expect(text).toContain('Could not rename');
      expect(text).toContain('Foo');
      expect(text).toContain('Bar');
    });
  });

  // TODO: Add integration tests once indexing issue in test environment is resolved
  // The indexer is not discovering files in test fixtures, causing ts-morph Project
  // to not load source files. This affects all tools that depend on the indexer.
  //
  // Related issue: Similar TODOs exist in refactor-context.test.ts
  //
  // To test manually:
  // 1. Run the MCP server: npm run dev
  // 2. Use MCP Inspector: npm run test:inspector
  // 3. Call refactor_rename with real project files
  //
  // Future work:
  // - Fix indexer to work in test environment
  // - Add comprehensive integration tests for:
  //   - Function renaming
  //   - Class renaming
  //   - Interface renaming
  //   - Type alias renaming
  //   - Cross-file reference detection
  //   - Scope handling (file vs project)
  //   - Preview generation

  describe.skip('Integration Tests (TODO: Fix indexer in test environment)', () => {
    it('should find and preview renaming a function', async () => {
      const fixturePath = path.join(__dirname, 'fixtures', 'sample-project');
      const filePath = path.join(fixturePath, 'src', 'services', 'UserService.ts');

      const result = await tool.execute({
        filePath,
        symbolName: 'createUser',
        newName: 'registerUser',
        scope: 'project',
      });

      const text = result.content[0].text;

      expect(text).toContain('Symbol Rename Preview');
      expect(text).toContain('createUser');
      expect(text).toContain('registerUser');
    });
  });
});
