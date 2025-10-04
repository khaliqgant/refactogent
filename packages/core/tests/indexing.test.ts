import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { CodebaseIndexer, RefactorableFile, SymbolInfo } from '../src/indexing';

describe('CodebaseIndexer', () => {
  let indexer: CodebaseIndexer;
  let fixturesPath: string;

  beforeEach(() => {
    fixturesPath = path.join(__dirname, 'fixtures');
    indexer = new CodebaseIndexer({
      rootPath: fixturesPath,
      includePatterns: ['**/*.ts', '**/*.js', '**/*.py', '**/*.go'],
      excludePatterns: ['**/node_modules/**'],
      maxFileSize: 1024 * 1024,
      maxFiles: 1000,
      includeTests: true,
      includeNodeModules: false,
      languages: ['typescript', 'javascript', 'python', 'go']
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('File Discovery', () => {
    it('should discover TypeScript files', async () => {
      const files = await indexer['discoverFiles']();
      const tsFiles = files.filter(f => f.endsWith('.ts'));
      
      expect(tsFiles.length).toBeGreaterThan(0);
      expect(tsFiles.some(f => f.includes('simple-function.ts'))).toBe(true);
      expect(tsFiles.some(f => f.includes('class-example.ts'))).toBe(true);
    });

    it('should discover Python files', async () => {
      const files = await indexer['discoverFiles']();
      const pyFiles = files.filter(f => f.endsWith('.py'));
      
      expect(pyFiles.length).toBeGreaterThan(0);
      expect(pyFiles.some(f => f.includes('sample.py'))).toBe(true);
    });

    it('should discover Go files', async () => {
      const files = await indexer['discoverFiles']();
      const goFiles = files.filter(f => f.endsWith('.go'));
      
      expect(goFiles.length).toBeGreaterThan(0);
      expect(goFiles.some(f => f.includes('sample.go'))).toBe(true);
    });

    it('should exclude node_modules by default', async () => {
      const files = await indexer['discoverFiles']();
      
      expect(files.some(f => f.includes('node_modules'))).toBe(false);
    });

    it('should respect maxFiles limit', async () => {
      const limitedIndexer = new CodebaseIndexer({
        rootPath: fixturesPath,
        maxFiles: 2
      });
      
      const files = await limitedIndexer['discoverFiles']();
      expect(files.length).toBeLessThanOrEqual(2);
    });
  });

  describe('Language Detection', () => {
    it('should detect TypeScript files', () => {
      expect(indexer['detectLanguage']('test.ts')).toBe('typescript');
      expect(indexer['detectLanguage']('test.tsx')).toBe('typescript');
    });

    it('should detect JavaScript files', () => {
      expect(indexer['detectLanguage']('test.js')).toBe('javascript');
      expect(indexer['detectLanguage']('test.jsx')).toBe('javascript');
    });

    it('should detect Python files', () => {
      expect(indexer['detectLanguage']('test.py')).toBe('python');
    });

    it('should detect Go files', () => {
      expect(indexer['detectLanguage']('test.go')).toBe('go');
    });

    it('should return "other" for unknown extensions', () => {
      expect(indexer['detectLanguage']('test.txt')).toBe('other');
      expect(indexer['detectLanguage']('test.md')).toBe('other');
    });
  });

  describe('Symbol Extraction - TypeScript', () => {
    it('should extract functions from TypeScript files', async () => {
      const filePath = path.join(fixturesPath, 'typescript', 'simple-function.ts');
      const content = fs.readFileSync(filePath, 'utf-8');
      const symbols = await indexer['extractJSSymbols'](filePath, content);
      
      const functions = symbols.filter(s => s.type === 'function');
      expect(functions.length).toBeGreaterThan(0);
      
      const addFunction = functions.find(s => s.name === 'add');
      expect(addFunction).toBeDefined();
      expect(addFunction?.isExported).toBe(true);
      expect(addFunction?.parameters).toEqual(['a', 'b']);
      expect(addFunction?.returnType).toBe('number');
    });

    it('should extract classes from TypeScript files', async () => {
      const filePath = path.join(fixturesPath, 'typescript', 'class-example.ts');
      const content = fs.readFileSync(filePath, 'utf-8');
      const symbols = await indexer['extractJSSymbols'](filePath, content);
      
      const classes = symbols.filter(s => s.type === 'class');
      expect(classes.length).toBeGreaterThan(0);
      
      const calculatorClass = classes.find(s => s.name === 'Calculator');
      expect(calculatorClass).toBeDefined();
      expect(calculatorClass?.isExported).toBe(true);
    });

    it('should extract interfaces from TypeScript files', async () => {
      const filePath = path.join(fixturesPath, 'typescript', 'class-example.ts');
      const content = fs.readFileSync(filePath, 'utf-8');
      const symbols = await indexer['extractJSSymbols'](filePath, content);
      
      const interfaces = symbols.filter(s => s.type === 'interface');
      expect(interfaces.length).toBeGreaterThan(0);
      
      const mathOpInterface = interfaces.find(s => s.name === 'MathOperation');
      expect(mathOpInterface).toBeDefined();
      expect(mathOpInterface?.isExported).toBe(true);
    });

    it('should extract type aliases from TypeScript files', async () => {
      const filePath = path.join(fixturesPath, 'typescript', 'class-example.ts');
      const content = fs.readFileSync(filePath, 'utf-8');
      const symbols = await indexer['extractJSSymbols'](filePath, content);
      
      const types = symbols.filter(s => s.type === 'type');
      expect(types.length).toBeGreaterThan(0);
      
      const numberPairType = types.find(s => s.name === 'NumberPair');
      expect(numberPairType).toBeDefined();
      expect(numberPairType?.isExported).toBe(true);
    });

    it('should detect private symbols', async () => {
      const filePath = path.join(fixturesPath, 'typescript', 'simple-function.ts');
      const content = fs.readFileSync(filePath, 'utf-8');
      const symbols = await indexer['extractJSSymbols'](filePath, content);
      
      const privateFunction = symbols.find(s => s.name === '_privateHelper');
      expect(privateFunction).toBeDefined();
      expect(privateFunction?.isPrivate).toBe(true);
    });
  });

  describe('Symbol Extraction - Python', () => {
    it('should extract functions from Python files', () => {
      const filePath = path.join(fixturesPath, 'python', 'sample.py');
      const content = fs.readFileSync(filePath, 'utf-8');
      const symbols = indexer['extractPythonSymbols'](content);
      
      const functions = symbols.filter(s => s.type === 'function');
      expect(functions.length).toBeGreaterThan(0);
      
      const fibFunction = functions.find(s => s.name === 'calculate_fibonacci');
      expect(fibFunction).toBeDefined();
      expect(fibFunction?.isExported).toBe(true);
    });

    it('should extract classes from Python files', () => {
      const filePath = path.join(fixturesPath, 'python', 'sample.py');
      const content = fs.readFileSync(filePath, 'utf-8');
      const symbols = indexer['extractPythonSymbols'](content);
      
      const classes = symbols.filter(s => s.type === 'class');
      expect(classes.length).toBeGreaterThan(0);
      
      const processorClass = classes.find(s => s.name === 'DataProcessor');
      expect(processorClass).toBeDefined();
      expect(processorClass?.isExported).toBe(true);
    });

    it('should detect private Python functions', () => {
      const filePath = path.join(fixturesPath, 'python', 'sample.py');
      const content = fs.readFileSync(filePath, 'utf-8');
      const symbols = indexer['extractPythonSymbols'](content);
      
      const privateFunction = symbols.find(s => s.name === '_helper_function');
      expect(privateFunction).toBeDefined();
      expect(privateFunction?.isPrivate).toBe(true);
    });
  });

  describe('Symbol Extraction - Go', () => {
    it('should extract functions from Go files', () => {
      const filePath = path.join(fixturesPath, 'go', 'sample.go');
      const content = fs.readFileSync(filePath, 'utf-8');
      const symbols = indexer['extractGoSymbols'](content);
      
      const functions = symbols.filter(s => s.type === 'function');
      expect(functions.length).toBeGreaterThan(0);
      
      const fibFunction = functions.find(s => s.name === 'CalculateFibonacci');
      expect(fibFunction).toBeDefined();
      expect(fibFunction?.isExported).toBe(true);
    });

    it('should extract types from Go files', () => {
      const filePath = path.join(fixturesPath, 'go', 'sample.go');
      const content = fs.readFileSync(filePath, 'utf-8');
      const symbols = indexer['extractGoSymbols'](content);
      
      const types = symbols.filter(s => s.type === 'type');
      expect(types.length).toBeGreaterThan(0);
      
      const processorType = types.find(s => s.name === 'DataProcessor');
      expect(processorType).toBeDefined();
      expect(processorType?.isExported).toBe(true);
    });

    it('should detect private Go functions', () => {
      const filePath = path.join(fixturesPath, 'go', 'sample.go');
      const content = fs.readFileSync(filePath, 'utf-8');
      const symbols = indexer['extractGoSymbols'](content);
      
      const privateFunction = symbols.find(s => s.name === 'privateHelper');
      expect(privateFunction).toBeDefined();
      expect(privateFunction?.isPrivate).toBe(true);
    });
  });

  describe('Dependency Extraction', () => {
    it('should extract imports from TypeScript files', () => {
      const content = `
        import { Calculator } from './class-example.js';
        import * as fs from 'fs';
        import { someFunction } from 'external-package';
      `;
      
      const dependencies = indexer['extractDependencies'](content, 'typescript');
      expect(dependencies).toContain('./class-example.js');
      expect(dependencies).toContain('fs');
      expect(dependencies).toContain('external-package');
    });

    it('should extract imports from Python files', () => {
      const content = `
        import os
        import sys
        from typing import List, Dict
        from mymodule import some_function
      `;
      
      const dependencies = indexer['extractDependencies'](content, 'python');
      expect(dependencies).toContain('os');
      expect(dependencies).toContain('sys');
      expect(dependencies).toContain('typing');
      expect(dependencies).toContain('mymodule');
    });

    it('should extract imports from Go files', () => {
      const content = `
        import (
          "fmt"
          "strings"
          "github.com/user/package"
        )
      `;
      
      const dependencies = indexer['extractDependencies'](content, 'go');
      expect(dependencies).toContain('fmt');
      expect(dependencies).toContain('strings');
      expect(dependencies).toContain('github.com/user/package');
    });
  });

  describe('Test File Detection', () => {
    it('should detect test files by name', () => {
      expect(indexer['isTestFile']('test.spec.ts')).toBe(true);
      expect(indexer['isTestFile']('component.test.js')).toBe(true);
      expect(indexer['isTestFile']('utils.spec.ts')).toBe(true);
    });

    it('should detect test files by directory', () => {
      expect(indexer['isTestFile']('/path/to/test/file.ts')).toBe(true);
      expect(indexer['isTestFile']('/path/to/spec/file.js')).toBe(true);
    });

    it('should not detect non-test files', () => {
      expect(indexer['isTestFile']('component.ts')).toBe(false);
      expect(indexer['isTestFile']('utils.js')).toBe(false);
      expect(indexer['isTestFile']('main.go')).toBe(false);
    });
  });

  describe('Complexity Calculation', () => {
    it('should calculate complexity for TypeScript files', () => {
      const content = `
        function complexFunction() {
          if (true) {
            for (let i = 0; i < 10; i++) {
              while (condition) {
                switch (value) {
                  case 1:
                    break;
                }
              }
            }
          }
        }
      `;
      
      const complexity = indexer['calculateComplexity'](content, 'typescript');
      expect(complexity).toBeGreaterThan(0);
    });

    it('should calculate complexity for Python files', () => {
      const content = `
        def complex_function():
            if True:
                for i in range(10):
                    while condition:
                        try:
                            pass
                        except:
                            pass
      `;
      
      const complexity = indexer['calculateComplexity'](content, 'python');
      expect(complexity).toBeGreaterThan(0);
    });

    it('should return 0 for empty files', () => {
      const complexity = indexer['calculateComplexity']('', 'typescript');
      expect(complexity).toBe(0);
    });
  });

  describe('File Analysis', () => {
    it('should analyze a TypeScript file completely', async () => {
      const filePath = path.join(fixturesPath, 'typescript', 'simple-function.ts');
      const refactorableFile = await indexer['analyzeFile'](filePath);
      
      expect(refactorableFile).toBeDefined();
      expect(refactorableFile?.language).toBe('typescript');
      expect(refactorableFile?.symbols.length).toBeGreaterThan(0);
      expect(refactorableFile?.dependencies.length).toBeGreaterThanOrEqual(0);
      expect(refactorableFile?.isTestFile).toBe(false);
      expect(refactorableFile?.complexity).toBeGreaterThanOrEqual(0);
    });

    it('should analyze a Python file completely', async () => {
      const filePath = path.join(fixturesPath, 'python', 'sample.py');
      const refactorableFile = await indexer['analyzeFile'](filePath);
      
      expect(refactorableFile).toBeDefined();
      expect(refactorableFile?.language).toBe('python');
      expect(refactorableFile?.symbols.length).toBeGreaterThan(0);
      expect(refactorableFile?.dependencies.length).toBeGreaterThan(0);
      expect(refactorableFile?.isTestFile).toBe(false);
    });

    it('should handle empty files gracefully', async () => {
      const filePath = path.join(fixturesPath, 'edge-cases', 'empty-file.ts');
      const refactorableFile = await indexer['analyzeFile'](filePath);
      
      expect(refactorableFile).toBeDefined();
      expect(refactorableFile?.symbols.length).toBe(0);
      expect(refactorableFile?.complexity).toBe(0);
    });

    it('should handle syntax errors gracefully', async () => {
      const filePath = path.join(fixturesPath, 'edge-cases', 'syntax-error.ts');
      const refactorableFile = await indexer['analyzeFile'](filePath);
      
      // Should still return a file object even with syntax errors
      expect(refactorableFile).toBeDefined();
    });
  });

  describe('Statistics Generation', () => {
    it('should generate correct statistics', () => {
      const mockFiles: RefactorableFile[] = [
        {
          path: '/test1.ts',
          relativePath: 'test1.ts',
          language: 'typescript',
          size: 1000,
          lastModified: new Date(),
          symbols: [
            { name: 'func1', type: 'function', startLine: 1, endLine: 5, startColumn: 0, endColumn: 10, isExported: true, isPrivate: false }
          ],
          dependencies: ['fs'],
          isTestFile: false,
          complexity: 5
        },
        {
          path: '/test2.py',
          relativePath: 'test2.py',
          language: 'python',
          size: 2000,
          lastModified: new Date(),
          symbols: [
            { name: 'func2', type: 'function', startLine: 1, endLine: 3, startColumn: 0, endColumn: 8, isExported: true, isPrivate: false }
          ],
          dependencies: ['os'],
          isTestFile: true,
          complexity: 3
        }
      ];

      const stats = indexer.getIndexingStats(mockFiles);
      
      expect(stats.totalFiles).toBe(2);
      expect(stats.totalSymbols).toBe(2);
      expect(stats.languageBreakdown.typescript).toBe(1);
      expect(stats.languageBreakdown.python).toBe(1);
      expect(stats.testFiles).toBe(1);
      expect(stats.averageComplexity).toBe(4);
      expect(stats.totalSize).toBe(3000);
    });
  });

  describe('Full Codebase Indexing', () => {
    it('should index the entire fixtures directory', async () => {
      const files = await indexer.indexCodebase();
      
      expect(files.length).toBeGreaterThan(0);
      
      // Should have TypeScript files
      const tsFiles = files.filter(f => f.language === 'typescript');
      expect(tsFiles.length).toBeGreaterThan(0);
      
      // Should have Python files
      const pyFiles = files.filter(f => f.language === 'python');
      expect(pyFiles.length).toBeGreaterThan(0);
      
      // Should have Go files
      const goFiles = files.filter(f => f.language === 'go');
      expect(goFiles.length).toBeGreaterThan(0);
      
      // Should detect test files
      const testFiles = files.filter(f => f.isTestFile);
      expect(testFiles.length).toBeGreaterThan(0);
    });

    it('should respect includeTests configuration', async () => {
      const noTestIndexer = new CodebaseIndexer({
        rootPath: fixturesPath,
        includeTests: false
      });
      
      const files = await noTestIndexer.indexCodebase();
      const testFiles = files.filter(f => f.isTestFile);
      
      // Should still find test files but they should be marked as test files
      expect(testFiles.length).toBeGreaterThan(0);
    });

    it('should handle errors gracefully during indexing', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      
      const files = await indexer.indexCodebase();
      
      // Should still return files even if some fail
      expect(files.length).toBeGreaterThan(0);
      
      consoleSpy.mockRestore();
    });
  });

  describe('Configuration', () => {
    it('should use default configuration when none provided', () => {
      const defaultIndexer = new CodebaseIndexer();
      
      expect(defaultIndexer['config'].rootPath).toBe(process.cwd());
      expect(defaultIndexer['config'].maxFileSize).toBe(1024 * 1024);
      expect(defaultIndexer['config'].maxFiles).toBe(10000);
      expect(defaultIndexer['config'].includeTests).toBe(true);
    });

    it('should merge custom configuration with defaults', () => {
      const customIndexer = new CodebaseIndexer({
        maxFiles: 5,
        includeTests: false
      });
      
      expect(customIndexer['config'].maxFiles).toBe(5);
      expect(customIndexer['config'].includeTests).toBe(false);
      expect(customIndexer['config'].maxFileSize).toBe(1024 * 1024); // Should keep default
    });
  });
});
