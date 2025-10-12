# CodebaseIndexer Test Suite

This directory contains a comprehensive testing suite for the CodebaseIndexer implementation.

## Test Structure

### Core Tests (`indexing.test.ts`)
- **File Discovery**: Tests file pattern matching, exclusion rules, and limits
- **Language Detection**: Tests detection of TypeScript, JavaScript, Python, Go, and other languages
- **Symbol Extraction**: Tests extraction of functions, classes, interfaces, types, and variables
- **Dependency Extraction**: Tests import/require statement parsing
- **Test File Detection**: Tests identification of test files by name and directory
- **Complexity Calculation**: Tests code complexity metrics
- **File Analysis**: Tests complete file analysis workflow
- **Statistics Generation**: Tests indexing statistics and metrics
- **Full Codebase Indexing**: Tests end-to-end indexing process
- **Configuration**: Tests default and custom configuration handling

### CLI Integration Tests (`cli-integration.test.ts`)
- **Command Execution**: Tests CLI command parsing and execution
- **Options Handling**: Tests command-line options and flags
- **Error Handling**: Tests graceful error handling and edge cases
- **Help and Version**: Tests help output and version information

### Performance Tests (`performance.test.ts`)
- **Indexing Performance**: Tests indexing speed with various file sizes
- **Memory Usage**: Tests memory consumption and leak detection
- **Concurrent Operations**: Tests parallel file processing
- **Large File Handling**: Tests performance with large files
- **Many Files Handling**: Tests performance with many small files

## Test Fixtures

### TypeScript Fixtures
- `simple-function.ts`: Basic function with parameters and return types
- `class-example.ts`: Classes, interfaces, types, and enums
- `complex-file.ts`: Complex code with multiple functions and control flow

### Python Fixtures
- `sample.py`: Classes, functions, imports, and async functions

### Go Fixtures
- `sample.go`: Structs, functions, imports, and complex logic

### Test Files
- `test.spec.ts`: Jest test file
- `another.test.js`: JavaScript test file

### Edge Cases
- `empty-file.ts`: Empty file for testing
- `syntax-error.ts`: File with syntax errors

## Running Tests

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:integration
npm run test:performance

# Run with coverage
npm run test:coverage

# Run all test types
npm run test:all
```

## Test Coverage

The test suite covers:
- ✅ File discovery and filtering
- ✅ Language detection
- ✅ Symbol extraction (TypeScript, Python, Go)
- ✅ Dependency extraction
- ✅ Test file detection
- ✅ Complexity calculation
- ✅ Statistics generation
- ✅ Error handling
- ✅ CLI integration
- ✅ Performance testing
- ✅ Configuration management

## Test Results

Current test status:
- **Core Functionality**: ✅ Passing
- **TypeScript Support**: ✅ Fully tested
- **Python Support**: ✅ Basic implementation tested
- **Go Support**: ✅ Basic implementation tested
- **CLI Integration**: ✅ Working with minor issues
- **Performance**: ✅ Within acceptable limits

## Notes

- Tests use Jest with TypeScript support
- ES modules are properly configured
- Tests run serially to avoid file system conflicts
- Comprehensive error handling and edge case testing
- Performance benchmarks ensure scalability
- CLI integration tests verify end-to-end functionality

The test suite provides confidence in the robustness and reliability of the CodebaseIndexer implementation.
