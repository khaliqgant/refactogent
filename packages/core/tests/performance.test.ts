import { describe, it, expect, beforeEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { CodebaseIndexer } from '../src/indexing';

describe('Performance Tests', () => {
  let indexer: CodebaseIndexer;
  let fixturesPath: string;

  beforeEach(() => {
    fixturesPath = path.join(__dirname, 'fixtures');
    indexer = new CodebaseIndexer({
      rootPath: fixturesPath,
      maxFiles: 100,
      maxFileSize: 1024 * 1024
    });
  });

  describe('Indexing Performance', () => {
    it('should index files within reasonable time', async () => {
      const startTime = Date.now();
      
      const files = await indexer.indexCodebase();
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      expect(files.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
    }, 15000);

    it('should handle large files efficiently', async () => {
      // Create a large test file
      const largeFilePath = path.join(fixturesPath, 'large-file.ts');
      const largeContent = `
        // Large file with many functions
        ${Array.from({ length: 100 }, (_, i) => `
          export function function${i}(): number {
            if (true) {
              for (let j = 0; j < 10; j++) {
                while (j < 5) {
                  switch (j) {
                    case 1:
                      return j;
                    default:
                      break;
                  }
                }
              }
            }
            return ${i};
          }
        `).join('\n')}
      `;
      
      fs.writeFileSync(largeFilePath, largeContent);
      
      try {
        const startTime = Date.now();
        const refactorableFile = await indexer['analyzeFile'](largeFilePath);
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        expect(refactorableFile).toBeDefined();
        expect(refactorableFile?.symbols.length).toBe(100);
        expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      } finally {
        // Clean up
        if (fs.existsSync(largeFilePath)) {
          fs.unlinkSync(largeFilePath);
        }
      }
    }, 10000);

    it('should handle many small files efficiently', async () => {
      const tempDir = path.join(fixturesPath, 'temp-many-files');
      
      try {
        // Create temporary directory with many small files
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        
        // Create 50 small TypeScript files
        for (let i = 0; i < 50; i++) {
          const filePath = path.join(tempDir, `file${i}.ts`);
          const content = `
            export function func${i}(): number {
              return ${i};
            }
          `;
          fs.writeFileSync(filePath, content);
        }
        
        const manyFilesIndexer = new CodebaseIndexer({
          rootPath: tempDir,
          maxFiles: 100
        });
        
        const startTime = Date.now();
        const files = await manyFilesIndexer.indexCodebase();
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        expect(files.length).toBe(50);
        expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
        
      } finally {
        // Clean up
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      }
    }, 15000);
  });

  describe('Memory Usage', () => {
    it('should not leak memory during indexing', async () => {
      const initialMemory = process.memoryUsage();
      
      // Run indexing multiple times
      for (let i = 0; i < 5; i++) {
        const files = await indexer.indexCodebase();
        expect(files.length).toBeGreaterThan(0);
      }
      
      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      
      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    }, 30000);
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent file analysis', async () => {
      const files = await indexer['discoverFiles']();
      const testFiles = files.slice(0, 5); // Test with first 5 files
      
      const startTime = Date.now();
      
      // Analyze files concurrently
      const promises = testFiles.map(file => indexer['analyzeFile'](file));
      const results = await Promise.all(promises);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      expect(results.length).toBe(testFiles.length);
      expect(results.every(result => result !== null)).toBe(true);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    }, 10000);
  });
});
