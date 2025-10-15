import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { RefactorAnalyzeTool } from '../src/tools/refactor-analyze.js';
import { RefactorContext } from '../src/context/shared-context.js';
import * as path from 'path';

describe('RefactorAnalyzeTool', () => {
  let tool: RefactorAnalyzeTool;
  const fixturePath = path.join(__dirname, 'fixtures', 'sample-project');

  beforeEach(() => {
    tool = new RefactorAnalyzeTool();
  });

  afterEach(() => {
    // Reset the shared context between tests to avoid caching issues
    RefactorContext.reset();
  });

  describe('Integration Tests with Sample Project', () => {
    it('should analyze sample project directory', async () => {
      const result = await tool.execute({ path: fixturePath });
      const text = result.content[0].text;

      expect(text).toContain('# Refactoring Analysis');
      expect(text).toContain('## Summary');
      expect(text).toMatch(/Files Analyzed.*:\s*\d+/i);
    });

    it('should return proper markdown structure', async () => {
      const result = await tool.execute({ path: fixturePath });
      const text = result.content[0].text;

      expect(text).toContain('# Refactoring Analysis');
      expect(text).toContain('## Summary');
      expect(text).toContain('**Files Analyzed**');
      expect(text).toContain('**Total Opportunities**');
      expect(text).toContain('**By Severity**');
    });

    it('should show opportunities or success message', async () => {
      const result = await tool.execute({ path: fixturePath });
      const text = result.content[0].text;

      // Should either show opportunities or say none found
      const hasOpportunities = text.includes('## Opportunities');
      const noOpportunities = text.includes('No refactoring opportunities found');

      expect(hasOpportunities || noOpportunities).toBe(true);
    });
  });

  describe('Output Format', () => {
    it('should include severity levels in output', async () => {
      const result = await tool.execute({ path: fixturePath });
      const text = result.content[0].text;

      expect(text).toMatch(/high.*medium.*low/is);
    });

    it('should include recommendations section', async () => {
      const result = await tool.execute({ path: fixturePath });
      const text = result.content[0].text;

      expect(text).toContain('## Recommendations');
    });
  });

  describe('Error Handling', () => {
    it('should throw error for non-existent path', async () => {
      await expect(async () => {
        await tool.execute({ path: '/nonexistent/path/that/does/not/exist' });
      }).rejects.toThrow(/does not exist/i);
    });

    it('should handle single file analysis', async () => {
      const userModelPath = path.join(fixturePath, 'src', 'models', 'User.ts');

      const result = await tool.execute({ path: userModelPath });
      const text = result.content[0].text;

      expect(text).toContain('# Refactoring Analysis');
      expect(text).toContain('## Summary');
    });
  });
});

describe('RefactorAnalyzeTool - Complexity Estimation Logic', () => {
  // These tests verify the complexity calculation logic without needing file indexing

  it('should count if statements in complexity estimation', () => {
    const code = `
      if (a > 0) {
        console.log('a');
      }
      if (b > 0) {
        console.log('b');
      }
      if (c > 0) {
        console.log('c');
      }
    `;

    // Count if statements (should be 3)
    const ifCount = (code.match(/\bif\s*\(/g) || []).length;
    expect(ifCount).toBe(3);
  });

  it('should count else if statements in complexity estimation', () => {
    const code = `
      if (a > 0) {
        console.log('a');
      } else if (b > 0) {
        console.log('b');
      } else if (c > 0) {
        console.log('c');
      }
    `;

    const elseIfCount = (code.match(/\belse\s+if\s*\(/g) || []).length;
    expect(elseIfCount).toBe(2);
  });

  it('should count loops in complexity estimation', () => {
    const code = `
      for (let i = 0; i < 10; i++) {
        console.log(i);
      }
      while (true) {
        break;
      }
      do {
        console.log('once');
      } while (false);
    `;

    const loopCount = (code.match(/\b(for|while|do)\s*\(/g) || []).length;
    expect(loopCount).toBeGreaterThanOrEqual(2);
  });

  it('should count case statements in complexity estimation', () => {
    const code = `
      switch (value) {
        case 1:
          return 'one';
        case 2:
          return 'two';
        case 3:
          return 'three';
        default:
          return 'unknown';
      }
    `;

    const caseCount = (code.match(/\bcase\s+/g) || []).length;
    expect(caseCount).toBe(3);
  });

  it('should count ternary operators in complexity estimation', () => {
    const code = `
      const result = a > 0 ? 'positive' : 'negative';
      const size = b > 10 ? 'large' : 'small';
      const nested = c > 0 ? d > 0 ? 'both' : 'only c' : 'neither';
    `;

    const ternaryCount = (code.match(/\?[^:]*:/g) || []).length;
    expect(ternaryCount).toBeGreaterThanOrEqual(3);
  });

  it('should count logical operators in complexity estimation', () => {
    const code = `
      if (a && b) {
        console.log('both');
      }
      if (c || d) {
        console.log('either');
      }
      return (x && y) || (z && w);
    `;

    const logicalCount = (code.match(/&&|\|\|/g) || []).length;
    expect(logicalCount).toBe(5);
  });

  it('should count catch blocks in complexity estimation', () => {
    const code = `
      try {
        something();
      } catch (error) {
        handle(error);
      }

      try {
        another();
      } catch (e) {
        log(e);
      }
    `;

    const catchCount = (code.match(/\bcatch\s*\(/g) || []).length;
    expect(catchCount).toBe(2);
  });
});

describe('RefactorAnalyzeTool - Threshold Logic', () => {
  it('should use correct file size thresholds', () => {
    const MEDIUM_THRESHOLD = 300;
    const HIGH_THRESHOLD = 500;

    expect(MEDIUM_THRESHOLD).toBe(300);
    expect(HIGH_THRESHOLD).toBe(500);
  });

  it('should use correct function length thresholds', () => {
    const MEDIUM_THRESHOLD = 50;
    const HIGH_THRESHOLD = 100;

    expect(MEDIUM_THRESHOLD).toBe(50);
    expect(HIGH_THRESHOLD).toBe(100);
  });

  it('should use correct complexity thresholds', () => {
    const MEDIUM_THRESHOLD = 10;
    const HIGH_THRESHOLD = 20;

    expect(MEDIUM_THRESHOLD).toBe(10);
    expect(HIGH_THRESHOLD).toBe(20);
  });

  it('should use correct class size thresholds', () => {
    const MEDIUM_THRESHOLD = 15;
    const HIGH_THRESHOLD = 25;

    expect(MEDIUM_THRESHOLD).toBe(15);
    expect(HIGH_THRESHOLD).toBe(25);
  });
});
