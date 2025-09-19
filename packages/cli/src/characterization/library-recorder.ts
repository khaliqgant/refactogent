import { Project, SourceFile, Node, SyntaxKind, FunctionDeclaration, MethodDeclaration } from 'ts-morph';
import fs from 'fs';
import path from 'path';
import { Logger } from '../utils/logger.js';

export interface FunctionSignature {
  name: string;
  parameters: Parameter[];
  returnType: string;
  isAsync: boolean;
  isExported: boolean;
  filePath: string;
  startLine: number;
  endLine: number;
}

export interface Parameter {
  name: string;
  type: string;
  optional: boolean;
  defaultValue?: string;
}

export interface TestCase {
  id: string;
  functionName: string;
  inputs: any[];
  expectedOutput: any;
  expectsError: boolean;
  errorType?: string;
  metadata: {
    generationStrategy: 'boundary' | 'random' | 'property' | 'manual';
    description: string;
  };
}

export interface LibraryRecordingSession {
  id: string;
  projectPath: string;
  startTime: number;
  endTime?: number;
  functions: FunctionSignature[];
  testCases: TestCase[];
  metadata: {
    language: 'typescript' | 'javascript';
    testFramework: string;
    propertyTestingLibrary?: string;
  };
}

export interface LibraryRecordingOptions {
  projectPath: string;
  includePatterns?: string[];
  excludePatterns?: string[];
  testFramework?: 'jest' | 'vitest' | 'mocha';
  propertyTesting?: boolean;
  propertyTestingLibrary?: 'fast-check' | 'jsverify';
  maxTestCases?: number;
  includePrivate?: boolean;
}

export class LibraryRecorder {
  private logger: Logger;
  private project: Project;
  private session?: LibraryRecordingSession;
  private testCaseCount = 0;

  constructor(logger: Logger) {
    this.logger = logger;
    this.project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        target: 99, // Latest
        module: 99, // ESNext
        strict: false,
        allowJs: true,
        checkJs: false,
      },
    });
  }

  /**
   * Start recording library function characterization
   */
  async startRecording(options: LibraryRecordingOptions): Promise<string> {
    this.logger.info('Starting library function recording session', { 
      projectPath: options.projectPath 
    });

    const sessionId = `library-session-${Date.now()}`;
    this.session = {
      id: sessionId,
      projectPath: options.projectPath,
      startTime: Date.now(),
      functions: [],
      testCases: [],
      metadata: {
        language: 'typescript', // Will be detected
        testFramework: options.testFramework || 'jest',
        propertyTestingLibrary: options.propertyTestingLibrary,
      },
    };

    this.logger.info('Library recording session started', { sessionId });
    return sessionId;
  }

  /**
   * Analyze and record library functions
   */
  async recordFunctions(options: LibraryRecordingOptions): Promise<FunctionSignature[]> {
    if (!this.session) {
      throw new Error('Recording session not started');
    }

    const sourceFiles = this.findSourceFiles(options);
    const functions: FunctionSignature[] = [];

    for (const filePath of sourceFiles) {
      try {
        this.logger.info('Analyzing file for functions', { filePath });

        const fileExtension = path.extname(filePath);
        const isTypeScript = ['.ts', '.tsx'].includes(fileExtension);
        
        if (isTypeScript) {
          const fileFunctions = await this.analyzeTypeScriptFile(filePath, options);
          functions.push(...fileFunctions);
        } else {
          const fileFunctions = await this.analyzeJavaScriptFile(filePath, options);
          functions.push(...fileFunctions);
        }

      } catch (error) {
        this.logger.warn('Failed to analyze file', { 
          filePath, 
          error: error instanceof Error ? error.message : String(error) 
        });
      }
    }

    this.session.functions = functions;
    this.logger.info('Function analysis completed', { 
      functions: functions.length,
      files: sourceFiles.length 
    });

    return functions;
  }

  /**
   * Generate test cases for recorded functions
   */
  async generateTestCases(options: LibraryRecordingOptions): Promise<TestCase[]> {
    if (!this.session) {
      throw new Error('Recording session not started');
    }

    const testCases: TestCase[] = [];
    const maxTestCases = options.maxTestCases || 5;

    for (const func of this.session.functions) {
      try {
        this.logger.info('Generating test cases for function', { 
          function: func.name,
          parameters: func.parameters.length 
        });

        // Generate boundary value test cases
        const boundaryTests = this.generateBoundaryTests(func, maxTestCases);
        testCases.push(...boundaryTests);

        // Generate random test cases
        const randomTests = this.generateRandomTests(func, Math.min(3, maxTestCases));
        testCases.push(...randomTests);

        // Generate property-based test cases if enabled
        if (options.propertyTesting) {
          const propertyTests = this.generatePropertyTests(func, options.propertyTestingLibrary);
          testCases.push(...propertyTests);
        }

      } catch (error) {
        this.logger.warn('Failed to generate test cases for function', { 
          function: func.name,
          error: error instanceof Error ? error.message : String(error) 
        });
      }
    }

    this.session.testCases = testCases;
    this.logger.info('Test case generation completed', { 
      testCases: testCases.length,
      functions: this.session.functions.length 
    });

    return testCases;
  }

  /**
   * Stop recording and return session data
   */
  async stopRecording(): Promise<LibraryRecordingSession> {
    if (!this.session) {
      throw new Error('No recording session active');
    }

    this.session.endTime = Date.now();

    this.logger.info('Library recording session completed', {
      sessionId: this.session.id,
      functions: this.session.functions.length,
      testCases: this.session.testCases.length,
      duration: this.session.endTime - this.session.startTime,
    });

    const completedSession = this.session;
    this.session = undefined;

    return completedSession;
  }

  /**
   * Generate characterization tests from recorded session
   */
  generateCharacterizationTests(
    session: LibraryRecordingSession,
    options: {
      outputDir: string;
      testFramework?: 'jest' | 'vitest' | 'mocha';
      includePropertyTests?: boolean;
    }
  ): string[] {
    const { outputDir, testFramework = 'jest', includePropertyTests = false } = options;
    const generatedFiles: string[] = [];

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Group functions by file
    const fileGroups = this.groupFunctionsByFile(session.functions);

    for (const [filePath, functions] of Object.entries(fileGroups)) {
      const relativePath = path.relative(session.projectPath, filePath);
      const testFileName = this.generateTestFileName(relativePath);
      const testFilePath = path.join(outputDir, testFileName);

      const testContent = this.generateTestFile(
        relativePath,
        functions,
        session,
        testFramework,
        includePropertyTests
      );

      fs.writeFileSync(testFilePath, testContent);
      generatedFiles.push(testFilePath);
    }

    // Generate test data files
    const testDataFile = path.join(outputDir, 'test-data.json');
    fs.writeFileSync(testDataFile, JSON.stringify(session.testCases, null, 2));
    generatedFiles.push(testDataFile);

    this.logger.info('Generated library characterization tests', {
      files: Object.keys(fileGroups).length,
      functions: session.functions.length,
      testCases: session.testCases.length,
      outputDir,
    });

    return generatedFiles;
  }

  /**
   * Find source files to analyze
   */
  private findSourceFiles(options: LibraryRecordingOptions): string[] {
    const files: string[] = [];
    const includePatterns = options.includePatterns || ['**/*.ts', '**/*.js', '**/*.tsx', '**/*.jsx'];
    const excludePatterns = options.excludePatterns || [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/*.test.*',
      '**/*.spec.*',
    ];

    const searchDir = (dir: string) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relativePath = path.relative(options.projectPath, fullPath);

          // Check exclude patterns
          if (excludePatterns.some(pattern => this.matchesPattern(relativePath, pattern))) {
            continue;
          }

          if (entry.isFile()) {
            // Check include patterns
            if (includePatterns.some(pattern => this.matchesPattern(relativePath, pattern))) {
              files.push(fullPath);
            }
          } else if (entry.isDirectory()) {
            searchDir(fullPath);
          }
        }
      } catch (error) {
        this.logger.debug('Error reading directory', { dir, error });
      }
    };

    searchDir(options.projectPath);
    return files;
  }

  /**
   * Analyze TypeScript file for functions
   */
  private async analyzeTypeScriptFile(filePath: string, options: LibraryRecordingOptions): Promise<FunctionSignature[]> {
    const code = fs.readFileSync(filePath, 'utf8');
    const sourceFile = this.project.createSourceFile(filePath, code, { overwrite: true });
    const functions: FunctionSignature[] = [];

    // Find function declarations
    sourceFile.forEachDescendant((node) => {
      if (Node.isFunctionDeclaration(node) || Node.isMethodDeclaration(node)) {
        const signature = this.extractFunctionSignature(node, filePath, sourceFile);
        
        // Filter based on options
        if (!options.includePrivate && !signature.isExported) {
          return;
        }

        functions.push(signature);
      }
    });

    return functions;
  }

  /**
   * Analyze JavaScript file for functions (simplified)
   */
  private async analyzeJavaScriptFile(filePath: string, options: LibraryRecordingOptions): Promise<FunctionSignature[]> {
    const code = fs.readFileSync(filePath, 'utf8');
    const functions: FunctionSignature[] = [];

    // Simple regex-based function detection for JavaScript
    const functionRegex = /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/g;
    let match;

    while ((match = functionRegex.exec(code)) !== null) {
      const [fullMatch, name, paramString] = match;
      const isExported = fullMatch.includes('export');
      const isAsync = fullMatch.includes('async');
      
      const parameters = this.parseJavaScriptParameters(paramString);
      
      functions.push({
        name,
        parameters,
        returnType: 'any', // Can't determine from JS
        isAsync,
        isExported,
        filePath,
        startLine: this.getLineNumber(code, match.index),
        endLine: this.getLineNumber(code, match.index + fullMatch.length),
      });
    }

    return functions;
  }

  /**
   * Extract function signature from TypeScript AST node
   */
  private extractFunctionSignature(
    node: FunctionDeclaration | MethodDeclaration,
    filePath: string,
    sourceFile: SourceFile
  ): FunctionSignature {
    const name = node.getName() || 'anonymous';
    const parameters = node.getParameters().map(param => ({
      name: param.getName(),
      type: param.getTypeNode()?.getText() || 'any',
      optional: param.hasQuestionToken(),
      defaultValue: param.getInitializer()?.getText(),
    }));

    const returnType = node.getReturnTypeNode()?.getText() || 'any';
    const isAsync = node.isAsync();
    
    // Check if exported
    const isExported = Node.isFunctionDeclaration(node) 
      ? node.isExported() 
      : node.getModifiers().some(m => m.getKind() === SyntaxKind.ExportKeyword);

    const start = sourceFile.getLineAndColumnAtPos(node.getStart());
    const end = sourceFile.getLineAndColumnAtPos(node.getEnd());

    return {
      name,
      parameters,
      returnType,
      isAsync,
      isExported,
      filePath,
      startLine: start.line,
      endLine: end.line,
    };
  }

  /**
   * Parse JavaScript function parameters
   */
  private parseJavaScriptParameters(paramString: string): Parameter[] {
    if (!paramString.trim()) return [];

    return paramString.split(',').map(param => {
      const trimmed = param.trim();
      const [name, defaultValue] = trimmed.split('=').map(s => s.trim());
      
      return {
        name: name.replace(/[{}[\]]/g, ''), // Remove destructuring syntax
        type: 'any',
        optional: !!defaultValue,
        defaultValue,
      };
    });
  }

  /**
   * Generate boundary value test cases
   */
  private generateBoundaryTests(func: FunctionSignature, maxTests: number): TestCase[] {
    const testCases: TestCase[] = [];
    
    // Generate test cases based on parameter types
    const boundaryValues = this.getBoundaryValues(func.parameters);
    
    for (let i = 0; i < Math.min(maxTests, boundaryValues.length); i++) {
      testCases.push({
        id: `test-${this.testCaseCount++}`,
        functionName: func.name,
        inputs: boundaryValues[i],
        expectedOutput: null, // Will be filled during actual execution
        expectsError: false,
        metadata: {
          generationStrategy: 'boundary',
          description: `Boundary value test case ${i + 1}`,
        },
      });
    }

    return testCases;
  }

  /**
   * Generate random test cases
   */
  private generateRandomTests(func: FunctionSignature, maxTests: number): TestCase[] {
    const testCases: TestCase[] = [];
    
    for (let i = 0; i < maxTests; i++) {
      const inputs = func.parameters.map(param => this.generateRandomValue(param.type));
      
      testCases.push({
        id: `test-${this.testCaseCount++}`,
        functionName: func.name,
        inputs,
        expectedOutput: null,
        expectsError: false,
        metadata: {
          generationStrategy: 'random',
          description: `Random test case ${i + 1}`,
        },
      });
    }

    return testCases;
  }

  /**
   * Generate property-based test cases
   */
  private generatePropertyTests(func: FunctionSignature, library?: string): TestCase[] {
    const testCases: TestCase[] = [];
    
    // This would integrate with property testing libraries
    // For now, generate a placeholder property test
    testCases.push({
      id: `test-${this.testCaseCount++}`,
      functionName: func.name,
      inputs: [], // Property tests generate inputs dynamically
      expectedOutput: null,
      expectsError: false,
      metadata: {
        generationStrategy: 'property',
        description: `Property-based test using ${library || 'fast-check'}`,
      },
    });

    return testCases;
  }

  /**
   * Get boundary values for parameters
   */
  private getBoundaryValues(parameters: Parameter[]): any[][] {
    const combinations: any[][] = [];
    
    // Generate combinations of boundary values
    const parameterValues = parameters.map(param => this.getTypeSpecificBoundaryValues(param.type));
    
    // Generate cartesian product (limited to avoid explosion)
    const maxCombinations = 10;
    for (let i = 0; i < Math.min(maxCombinations, this.cartesianProductSize(parameterValues)); i++) {
      const combination = parameters.map((param, index) => {
        const values = parameterValues[index];
        return values[i % values.length];
      });
      combinations.push(combination);
    }

    return combinations;
  }

  /**
   * Get boundary values for a specific type
   */
  private getTypeSpecificBoundaryValues(type: string): any[] {
    switch (type.toLowerCase()) {
      case 'number':
        return [0, 1, -1, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, NaN, Infinity, -Infinity];
      case 'string':
        return ['', 'a', 'test', ' ', '\n', '🚀', 'a'.repeat(1000)];
      case 'boolean':
        return [true, false];
      case 'array':
      case 'any[]':
        return [[], [1], [1, 2, 3], ['a', 'b'], [null, undefined]];
      case 'object':
        return [{}, { a: 1 }, { nested: { value: true } }, null];
      default:
        return [null, undefined, 0, '', false, {}, []];
    }
  }

  /**
   * Generate random value for a type
   */
  private generateRandomValue(type: string): any {
    switch (type.toLowerCase()) {
      case 'number':
        return Math.floor(Math.random() * 1000) - 500;
      case 'string':
        return Math.random().toString(36).substring(7);
      case 'boolean':
        return Math.random() > 0.5;
      case 'array':
      case 'any[]':
        return Array.from({ length: Math.floor(Math.random() * 5) }, () => Math.random());
      case 'object':
        return { randomKey: Math.random() };
      default:
        return Math.random() > 0.5 ? Math.random() : Math.random().toString(36).substring(7);
    }
  }

  /**
   * Calculate cartesian product size
   */
  private cartesianProductSize(arrays: any[][]): number {
    return arrays.reduce((size, arr) => size * arr.length, 1);
  }

  /**
   * Group functions by file
   */
  private groupFunctionsByFile(functions: FunctionSignature[]): Record<string, FunctionSignature[]> {
    const groups: Record<string, FunctionSignature[]> = {};
    
    for (const func of functions) {
      if (!groups[func.filePath]) {
        groups[func.filePath] = [];
      }
      groups[func.filePath].push(func);
    }
    
    return groups;
  }

  /**
   * Generate test file name
   */
  private generateTestFileName(relativePath: string): string {
    const parsed = path.parse(relativePath);
    return `${parsed.name}.characterization.test.js`;
  }

  /**
   * Generate test file content
   */
  private generateTestFile(
    relativePath: string,
    functions: FunctionSignature[],
    session: LibraryRecordingSession,
    framework: string,
    includePropertyTests: boolean
  ): string {
    const importPath = `./${relativePath}`;
    
    if (framework === 'jest') {
      return this.generateJestLibraryTest(importPath, functions, session, includePropertyTests);
    } else if (framework === 'vitest') {
      return this.generateVitestLibraryTest(importPath, functions, session, includePropertyTests);
    }
    
    return this.generateJestLibraryTest(importPath, functions, session, includePropertyTests);
  }

  /**
   * Generate Jest library test
   */
  private generateJestLibraryTest(
    importPath: string,
    functions: FunctionSignature[],
    session: LibraryRecordingSession,
    includePropertyTests: boolean
  ): string {
    const functionNames = functions.map(f => f.name);
    
    return `// Generated library characterization test
// Generated at: ${new Date().toISOString()}

const { ${functionNames.join(', ')} } = require('${importPath}');
const testData = require('./test-data.json');
${includePropertyTests && session.metadata.propertyTestingLibrary ? `const fc = require('${session.metadata.propertyTestingLibrary}');` : ''}

describe('Library characterization tests for ${importPath}', () => {
${functions.map(func => `
  describe('${func.name}', () => {
    const functionTestCases = testData.filter(tc => tc.functionName === '${func.name}');
    
    functionTestCases.forEach((testCase, index) => {
      if (testCase.metadata.generationStrategy !== 'property') {
        test(\`\${testCase.metadata.description} (case \${index + 1})\`, ${func.isAsync ? 'async ' : ''}() => {
          ${func.isAsync ? 'const result = await ' : 'const result = '}${func.name}(...testCase.inputs);
          
          if (testCase.expectsError) {
            expect(() => result).toThrow();
          } else {
            // This is a characterization test - we're capturing current behavior
            // Update testCase.expectedOutput with actual results when behavior is correct
            if (testCase.expectedOutput !== null) {
              expect(result).toEqual(testCase.expectedOutput);
            } else {
              // First run - capture the output
              console.log(\`Captured output for \${testCase.id}:\`, result);
            }
          }
        });
      }
    });
    
    ${includePropertyTests ? `
    // Property-based test
    test('property: function should be deterministic with same inputs', () => {
      fc.assert(fc.property(
        ${func.parameters.map(param => this.generatePropertyArbitrary(param.type)).join(', ')},
        (${func.parameters.map(p => p.name).join(', ')}) => {
          const result1 = ${func.name}(${func.parameters.map(p => p.name).join(', ')});
          const result2 = ${func.name}(${func.parameters.map(p => p.name).join(', ')});
          return JSON.stringify(result1) === JSON.stringify(result2);
        }
      ));
    });
    ` : ''}
  });`).join('\n')}
});
`;
  }

  /**
   * Generate Vitest library test
   */
  private generateVitestLibraryTest(
    importPath: string,
    functions: FunctionSignature[],
    session: LibraryRecordingSession,
    includePropertyTests: boolean
  ): string {
    const functionNames = functions.map(f => f.name);
    
    return `// Generated library characterization test
// Generated at: ${new Date().toISOString()}

import { describe, test, expect } from 'vitest';
import { ${functionNames.join(', ')} } from '${importPath}';
import testData from './test-data.json';
${includePropertyTests && session.metadata.propertyTestingLibrary ? `import fc from '${session.metadata.propertyTestingLibrary}';` : ''}

describe('Library characterization tests for ${importPath}', () => {
${functions.map(func => `
  describe('${func.name}', () => {
    const functionTestCases = testData.filter(tc => tc.functionName === '${func.name}');
    
    functionTestCases.forEach((testCase, index) => {
      if (testCase.metadata.generationStrategy !== 'property') {
        test(\`\${testCase.metadata.description} (case \${index + 1})\`, ${func.isAsync ? 'async ' : ''}() => {
          ${func.isAsync ? 'const result = await ' : 'const result = '}${func.name}(...testCase.inputs);
          
          if (testCase.expectsError) {
            expect(() => result).toThrow();
          } else {
            if (testCase.expectedOutput !== null) {
              expect(result).toEqual(testCase.expectedOutput);
            } else {
              console.log(\`Captured output for \${testCase.id}:\`, result);
            }
          }
        });
      }
    });
    
    ${includePropertyTests ? `
    test('property: function should be deterministic with same inputs', () => {
      fc.assert(fc.property(
        ${func.parameters.map(param => this.generatePropertyArbitrary(param.type)).join(', ')},
        (${func.parameters.map(p => p.name).join(', ')}) => {
          const result1 = ${func.name}(${func.parameters.map(p => p.name).join(', ')});
          const result2 = ${func.name}(${func.parameters.map(p => p.name).join(', ')});
          return JSON.stringify(result1) === JSON.stringify(result2);
        }
      ));
    });
    ` : ''}
  });`).join('\n')}
});
`;
  }

  /**
   * Generate property testing arbitrary for a type
   */
  private generatePropertyArbitrary(type: string): string {
    switch (type.toLowerCase()) {
      case 'number':
        return 'fc.integer()';
      case 'string':
        return 'fc.string()';
      case 'boolean':
        return 'fc.boolean()';
      case 'array':
      case 'any[]':
        return 'fc.array(fc.anything())';
      case 'object':
        return 'fc.object()';
      default:
        return 'fc.anything()';
    }
  }

  /**
   * Check if path matches pattern
   */
  private matchesPattern(filePath: string, pattern: string): boolean {
    // Simple glob pattern matching
    const regexPattern = pattern
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '.');
    
    return new RegExp(`^${regexPattern}$`).test(filePath);
  }

  /**
   * Get line number from character index
   */
  private getLineNumber(code: string, index: number): number {
    return code.substring(0, index).split('\n').length;
  }
}