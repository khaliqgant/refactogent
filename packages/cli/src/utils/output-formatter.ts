import { RefactorableFile } from '@refactogent/core';

export class OutputFormatter {
  static header(message: string): string {
    return `\n🚀 ${message}`;
  }

  static info(message: string): string {
    return `ℹ️  ${message}`;
  }

  static success(message: string): string {
    return `✅ ${message}`;
  }

  static error(message: string): string {
    return `❌ ${message}`;
  }

  static stats(stats: {
    totalFiles: number;
    totalSymbols: number;
    languageBreakdown: Record<string, number>;
    testFiles: number;
    averageComplexity: number;
  }): string {
    let output = `\n📊 Indexing Statistics:\n`;
    output += `   • Total files: ${stats.totalFiles}\n`;
    output += `   • Total symbols: ${stats.totalSymbols}\n`;
    output += `   • Test files: ${stats.testFiles}\n`;
    output += `   • Average complexity: ${stats.averageComplexity.toFixed(2)}\n`;

    if (Object.keys(stats.languageBreakdown).length > 0) {
      output += `   • Languages:\n`;
      Object.entries(stats.languageBreakdown).forEach(([lang, count]) => {
        output += `     - ${lang}: ${count} files\n`;
      });
    }

    return output;
  }

  static fileList(files: RefactorableFile[], maxFiles: number = 5): string {
    if (files.length === 0) {
      return `   No refactorable files found.`;
    }

    let output = `\n📁 Sample refactorable files:\n`;
    files.slice(0, maxFiles).forEach(file => {
      const symbolCount = file.symbols.length;
      const complexity = file.complexity;
      output += `   • ${file.relativePath} (${file.language}, ${symbolCount} symbols, complexity: ${complexity})\n`;
    });

    if (files.length > maxFiles) {
      output += `   ... and ${files.length - maxFiles} more files\n`;
    }

    return output;
  }

  static help(): string {
    return `
🚀 RefactoGent CLI — AI-powered refactoring with deterministic pre-analysis

Usage: refactogent [options] [command]

Commands:
  refactor [options] [path]  Complete refactoring workflow: analyze + suggest + apply AI-powered changes
  help [command]             display help for command

Options:
  -V, --version              output the version number
  -v, --verbose              Enable verbose logging
  -o, --output <dir>         Output directory (default: ".refactogent/out")
  -p, --project <path>       Project path (default: current directory)
  -h, --help                 display help for command

Examples:
  refactogent refactor                    # Analyze current directory
  refactogent refactor ./src --verbose    # Analyze src directory with verbose output
  refactogent refactor --include-tests    # Include test files in analysis
`;
  }
}
