import { describe, it, expect } from '@jest/globals';
import { OutputFormatter } from '../src/utils/output-formatter';

describe('OutputFormatter', () => {
  describe('Basic formatting', () => {
    it('should format header messages', () => {
      const result = OutputFormatter.header('Test Header');
      expect(result).toBe('\n🚀 Test Header');
    });

    it('should format info messages', () => {
      const result = OutputFormatter.info('Test Info');
      expect(result).toBe('ℹ️  Test Info');
    });

    it('should format success messages', () => {
      const result = OutputFormatter.success('Test Success');
      expect(result).toBe('✅ Test Success');
    });

    it('should format warning messages', () => {
      const result = OutputFormatter.warning('Test Warning');
      expect(result).toBe('⚠️  Test Warning');
    });

    it('should format error messages', () => {
      const result = OutputFormatter.error('Test Error');
      expect(result).toBe('❌ Test Error');
    });

    it('should format section messages', () => {
      const result = OutputFormatter.section('Test Section');
      expect(result).toBe('\n📋 Test Section');
    });
  });

  describe('Statistics formatting', () => {
    it('should format statistics correctly', () => {
      const stats = {
        totalFiles: 10,
        totalSymbols: 25,
        languageBreakdown: {
          typescript: 8,
          javascript: 2
        },
        testFiles: 3,
        averageComplexity: 5.5
      };

      const result = OutputFormatter.stats(stats);
      
      expect(result).toContain('📊 Indexing Statistics:');
      expect(result).toContain('• Total files: 10');
      expect(result).toContain('• Total symbols: 25');
      expect(result).toContain('• Test files: 3');
      expect(result).toContain('• Average complexity: 5.50');
      expect(result).toContain('• Languages:');
      expect(result).toContain('- typescript: 8 files');
      expect(result).toContain('- javascript: 2 files');
    });

    it('should handle empty language breakdown', () => {
      const stats = {
        totalFiles: 0,
        totalSymbols: 0,
        languageBreakdown: {},
        testFiles: 0,
        averageComplexity: 0
      };

      const result = OutputFormatter.stats(stats);
      
      expect(result).toContain('📊 Indexing Statistics:');
      expect(result).toContain('• Total files: 0');
      expect(result).not.toContain('• Languages:');
    });
  });

  describe('File list formatting', () => {
    const mockFiles = [
      {
        path: '/path/to/file1.ts',
        relativePath: 'file1.ts',
        language: 'typescript' as const,
        size: 1000,
        lastModified: new Date(),
        symbols: [
          { name: 'func1', type: 'function' as const, startLine: 1, endLine: 5, startColumn: 0, endColumn: 10, isExported: true, isPrivate: false },
          { name: 'func2', type: 'function' as const, startLine: 6, endLine: 10, startColumn: 0, endColumn: 10, isExported: true, isPrivate: false }
        ],
        dependencies: ['fs'],
        isTestFile: false,
        complexity: 5
      },
      {
        path: '/path/to/file2.js',
        relativePath: 'file2.js',
        language: 'javascript' as const,
        size: 800,
        lastModified: new Date(),
        symbols: [
          { name: 'func3', type: 'function' as const, startLine: 1, endLine: 3, startColumn: 0, endColumn: 8, isExported: true, isPrivate: false }
        ],
        dependencies: ['path'],
        isTestFile: false,
        complexity: 3
      }
    ];

    it('should format file list correctly', () => {
      const result = OutputFormatter.fileList(mockFiles);
      
      expect(result).toContain('📁 Sample refactorable files:');
      expect(result).toContain('• file1.ts (typescript, 2 symbols, complexity: 5)');
      expect(result).toContain('• file2.js (javascript, 1 symbols, complexity: 3)');
    });

    it('should limit files to maxFiles parameter', () => {
      const result = OutputFormatter.fileList(mockFiles, 1);
      
      expect(result).toContain('• file1.ts (typescript, 2 symbols, complexity: 5)');
      expect(result).not.toContain('• file2.js');
      expect(result).toContain('... and 1 more files');
    });

    it('should handle empty file list', () => {
      const result = OutputFormatter.fileList([]);
      expect(result).toBe('   No refactorable files found.');
    });
  });

  describe('Help formatting', () => {
    it('should format help text', () => {
      const result = OutputFormatter.help();
      
      expect(result).toContain('🚀 RefactoGent CLI');
      expect(result).toContain('Usage: refactogent [options] [command]');
      expect(result).toContain('Commands:');
      expect(result).toContain('refactor [options] [path]');
      expect(result).toContain('Options:');
      expect(result).toContain('Examples:');
    });
  });

  describe('Progress formatting', () => {
    it('should format progress correctly', () => {
      const result = OutputFormatter.progress('Processing', 5, 10);
      
      expect(result).toContain('🔄 Processing');
      expect(result).toContain('50%');
      expect(result).toContain('(5/10)');
      expect(result).toContain('██████████░░░░░░░░░░');
    });

    it('should handle 100% progress', () => {
      const result = OutputFormatter.progress('Complete', 10, 10);
      
      expect(result).toContain('100%');
      expect(result).toContain('(10/10)');
      expect(result).toContain('████████████████████');
    });

    it('should handle 0% progress', () => {
      const result = OutputFormatter.progress('Starting', 0, 10);
      
      expect(result).toContain('0%');
      expect(result).toContain('(0/10)');
      expect(result).toContain('░░░░░░░░░░░░░░░░░░░░');
    });
  });

  describe('Complete formatting', () => {
    it('should format completion message', () => {
      const result = OutputFormatter.complete('Task');
      expect(result).toBe('\r✅ Task completed!');
    });
  });
});
