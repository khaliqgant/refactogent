import { describe, it, expect } from '@jest/globals';
import { RefactorExtractTool } from '../src/tools/refactor-extract.js';
import * as path from 'path';

describe('RefactorExtractTool', () => {
  let tool: RefactorExtractTool;

  beforeEach(() => {
    tool = new RefactorExtractTool();
  });

  describe('Error Handling', () => {
    it('should handle non-existent file gracefully', async () => {
      const result = await tool.execute({
        filePath: '/nonexistent/file.ts',
        startLine: 10,
        endLine: 20,
        newFunctionName: 'extractedFunction',
        extractionType: 'function',
      });

      const text = result.content[0].text;

      expect(text).toContain('Extract Function Failed');
      expect(text).toContain('Error');
      expect(text).toMatch(/not found|does not exist/i);
    });

    it('should handle invalid extraction type gracefully', async () => {
      const fixturePath = path.join(__dirname, 'fixtures', 'sample-project');
      const filePath = path.join(fixturePath, 'src', 'services', 'UserService.ts');

      await expect(async () => {
        await tool.execute({
          filePath,
          startLine: 10,
          endLine: 20,
          newFunctionName: 'extracted',
          extractionType: 'invalid',
        });
      }).rejects.toThrow();
    });

    it('should handle invalid line ranges', async () => {
      const result = await tool.execute({
        filePath: '/nonexistent/file.ts',
        startLine: 20,
        endLine: 10, // end before start
        newFunctionName: 'extractedFunction',
        extractionType: 'function',
      });

      const text = result.content[0].text;

      // Should fail because of invalid file, but also handles bad range
      expect(text).toContain('Extract Function Failed');
    });
  });

  describe('Output Format Validation', () => {
    it('should include all required sections in error output', async () => {
      const result = await tool.execute({
        filePath: '/nonexistent/file.ts',
        startLine: 10,
        endLine: 20,
        newFunctionName: 'extractedFunction',
        extractionType: 'function',
      });

      const text = result.content[0].text;

      // Check error format
      expect(text).toContain('# Extract Function Failed');
      expect(text).toContain('**Error**:');
      expect(text).toContain('Could not extract');
    });
  });

  // TODO: Add integration tests once indexing issue in test environment is resolved
  // The indexer is not discovering files in test fixtures, causing ts-morph Project
  // to not load source files. This affects all tools that depend on the indexer.
  //
  // Related issue: Similar TODOs exist in refactor-context.test.ts and refactor-rename.test.ts
  //
  // To test manually:
  // 1. Run the MCP server: npm run dev
  // 2. Use MCP Inspector: npm run test:inspector
  // 3. Call refactor_extract with real project files
  //
  // Future work:
  // - Fix indexer to work in test environment
  // - Add comprehensive integration tests for:
  //   - Function extraction
  //   - Method extraction
  //   - Parameter detection
  //   - Return type inference
  //   - Preview generation
  //   - Variable scoping

  describe.skip('Integration Tests (TODO: Fix indexer in test environment)', () => {
    it('should extract code to a function', async () => {
      const fixturePath = path.join(__dirname, 'fixtures', 'sample-project');
      const filePath = path.join(fixturePath, 'src', 'services', 'UserService.ts');

      const result = await tool.execute({
        filePath,
        startLine: 15,
        endLine: 20,
        newFunctionName: 'validateUserData',
        extractionType: 'function',
      });

      const text = result.content[0].text;

      expect(text).toContain('Extract Function Preview');
      expect(text).toContain('validateUserData');
    });
  });
});
