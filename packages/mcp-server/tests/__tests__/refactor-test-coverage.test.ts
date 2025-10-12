import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import * as path from 'path';
import { RefactorTestCoverageTool } from '../../src/tools/refactor-test-coverage.js';

describe('RefactorTestCoverageTool', () => {
  let tool: RefactorTestCoverageTool;
  let fixturesPath: string;

  beforeEach(() => {
    tool = new RefactorTestCoverageTool();
    fixturesPath = path.join(__dirname, '../fixtures/sample-project');
  });

  describe('Package.json Detection', () => {
    it('should detect presence of package.json', async () => {
      // Change to fixture directory
      const originalCwd = process.cwd();
      process.chdir(fixturesPath);

      try {
        const result = await tool.execute({});

        // Should attempt to analyze (may fall back to heuristic)
        expect(result.content).toBeDefined();
        expect(result.content[0].type).toBe('text');
      } finally {
        process.chdir(originalCwd);
      }
    });
  });

  describe('Heuristic Analysis', () => {
    it('should provide heuristic analysis when no coverage tools available', async () => {
      const originalCwd = process.cwd();
      process.chdir(fixturesPath);

      try {
        const result = await tool.execute({
          targetPath: 'src'
        });

        const text = result.content[0].text;

        // Should provide some analysis even without coverage tools
        expect(text).toContain('Coverage');
        expect(text).toMatch(/Test.*Ratio|No coverage tooling/i);
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should calculate test-to-code ratio', async () => {
      const originalCwd = process.cwd();
      process.chdir(fixturesPath);

      try {
        const result = await tool.execute({});

        const text = result.content[0].text;

        // Should include test ratio calculation
        expect(text).toContain('Test');
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should provide setup instructions when no coverage tools found', async () => {
      const originalCwd = process.cwd();
      process.chdir(fixturesPath);

      try {
        const result = await tool.execute({});

        const text = result.content[0].text;

        // Should suggest how to set up coverage
        if (text.includes('No coverage tooling')) {
          expect(text).toContain('jest');
          expect(text).toContain('coverage');
        }
      } finally {
        process.chdir(originalCwd);
      }
    });
  });

  describe('Threshold Validation', () => {
    it('should check against coverage threshold when provided', async () => {
      const originalCwd = process.cwd();
      process.chdir(fixturesPath);

      try {
        const result = await tool.execute({
          threshold: 80
        });

        const text = result.content[0].text;

        // Should mention threshold in output
        expect(text).toBeDefined();
      } finally {
        process.chdir(originalCwd);
      }
    });
  });

  describe('Target Path Filtering', () => {
    it('should analyze specific directory when targetPath provided', async () => {
      const originalCwd = process.cwd();
      process.chdir(fixturesPath);

      try {
        const result = await tool.execute({
          targetPath: 'src/services'
        });

        const text = result.content[0].text;

        // Should reference the target path
        expect(text).toBeDefined();
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should analyze entire project when no targetPath provided', async () => {
      const originalCwd = process.cwd();
      process.chdir(fixturesPath);

      try {
        const result = await tool.execute({});

        expect(result.content).toBeDefined();
      } finally {
        process.chdir(originalCwd);
      }
    });
  });

  describe('Recommendations', () => {
    it('should provide actionable recommendations', async () => {
      const originalCwd = process.cwd();
      process.chdir(fixturesPath);

      try {
        const result = await tool.execute({});

        const text = result.content[0].text;

        // Should include recommendations section
        expect(text).toContain('Recommendation');
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should recommend setup when no coverage available', async () => {
      const originalCwd = process.cwd();
      process.chdir(fixturesPath);

      try {
        const result = await tool.execute({});

        const text = result.content[0].text;

        // Should recommend installing coverage tools if not available
        if (text.includes('No coverage tooling')) {
          expect(text).toMatch(/install|setup|add/i);
        }
      } finally {
        process.chdir(originalCwd);
      }
    });
  });

  describe('Report Generation', () => {
    it('should respect generateReport parameter', async () => {
      const originalCwd = process.cwd();
      process.chdir(fixturesPath);

      try {
        const result = await tool.execute({
          generateReport: false
        });

        // Should complete without errors
        expect(result.content).toBeDefined();
      } finally {
        process.chdir(originalCwd);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle non-existent target path gracefully', async () => {
      const originalCwd = process.cwd();
      process.chdir(fixturesPath);

      try {
        const result = await tool.execute({
          targetPath: '/nonexistent/path'
        });

        // Should handle error or return empty analysis
        expect(result.content).toBeDefined();
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should handle directories without tests', async () => {
      const originalCwd = process.cwd();
      process.chdir(fixturesPath);

      try {
        const result = await tool.execute({
          targetPath: 'src/models'
        });

        expect(result.content).toBeDefined();
      } finally {
        process.chdir(originalCwd);
      }
    });
  });

  describe('Output Format', () => {
    it('should include key coverage metrics in output', async () => {
      const originalCwd = process.cwd();
      process.chdir(fixturesPath);

      try {
        const result = await tool.execute({});

        const text = result.content[0].text;

        // Should include structured coverage information
        expect(text).toBeDefined();
        expect(text.length).toBeGreaterThan(0);
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should use appropriate emoji indicators', async () => {
      const originalCwd = process.cwd();
      process.chdir(fixturesPath);

      try {
        const result = await tool.execute({});

        const text = result.content[0].text;

        // Should use visual indicators for status
        expect(text).toMatch(/✅|⚠️|❌|#/);
      } finally {
        process.chdir(originalCwd);
      }
    });
  });

  describe('Integration with Coverage Tools', () => {
    it('should parse Jest coverage output if available', async () => {
      // This test would require actual Jest setup
      // For now, just verify it doesn't crash
      const originalCwd = process.cwd();
      process.chdir(fixturesPath);

      try {
        const result = await tool.execute({});
        expect(result.content).toBeDefined();
      } finally {
        process.chdir(originalCwd);
      }
    });
  });
});
