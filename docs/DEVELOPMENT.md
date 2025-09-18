# Development Guide

This guide provides detailed instructions for setting up and working with the RefactoAgent development environment.

## 🛠️ Prerequisites

### Required Software

- **Node.js 18+** and **npm 8+** (npm is the primary package manager for this project)
- **Python 3.9+** with pip
- **Go 1.19+**
- **Git**
- **Docker** (for testing environments)

> **Note**: This project uses npm as the primary package manager. While other package managers like yarn or pnpm may work, all documentation and scripts are optimized for npm.

### Recommended Tools

- **VS Code** with extensions:
  - TypeScript and JavaScript Language Features
  - Python
  - Go
  - ESLint
  - Prettier
- **GitHub CLI** for easier contribution workflow

## 🚀 Initial Setup

### 1. Fork and Clone

```bash
# Fork the repository on GitHub, then clone your fork
git clone https://github.com/yourusername/refactoagent.git
cd refactoagent

# Add upstream remote
git remote add upstream https://github.com/khaliqgant/refactoagent.git
```

### 2. Environment Setup

```bash
# Install Node.js dependencies
cd refactoagent-starter
npm install

# Set up CLI
cd cli
npm install
npm run build

# Set up VS Code extension
cd ../vscode-extension
npm install
npm run compile

# Return to project root
cd ../..
```

### 3. Verify Installation

```bash
# Test CLI
cd refactoagent-starter/cli
node dist/index.js --help

# Run tests
npm test

# Test VS Code extension (optional)
cd ../vscode-extension
code . # Open in VS Code and press F5 to run extension
```

## 📁 Project Structure

```
refactoagent/
├── .kiro/specs/refactoagent-unified/    # Main specification
│   ├── requirements.md                  # Project requirements
│   ├── design.md                       # System architecture
│   └── tasks.md                        # Implementation roadmap
├── docs/                               # Documentation
│   ├── specs/                          # Original specifications
│   ├── config/                         # Configuration examples
│   ├── examples/                       # Templates and examples
│   └── DEVELOPMENT.md                  # This file
├── refactoagent-starter/               # Development workspace
│   ├── cli/                           # CLI implementation
│   │   ├── src/                       # TypeScript source
│   │   ├── dist/                      # Compiled JavaScript
│   │   └── package.json               # CLI dependencies
│   ├── vscode-extension/              # VS Code extension
│   │   ├── src/                       # Extension source
│   │   └── package.json               # Extension dependencies
│   └── package.json                   # Workspace configuration
├── CONTRIBUTING.md                     # Contribution guidelines
├── CODE_OF_CONDUCT.md                 # Community guidelines
├── LICENSE                            # MIT license
└── README.md                          # Project overview
```

## 🔧 Development Workflow

### Daily Development

1. **Sync with upstream**
   ```bash
   git fetch upstream
   git checkout main
   git merge upstream/main
   ```

2. **Create feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make changes and test**
   ```bash
   # Make your changes
   npm test
   npm run lint
   ```

4. **Commit and push**
   ```bash
   git add .
   git commit -m "feat(scope): description"
   git push origin feature/your-feature-name
   ```

5. **Create pull request**
   - Use GitHub web interface or GitHub CLI
   - Fill out the PR template
   - Link related issues

### Working with the Implementation Plan

The project follows a structured implementation plan in [tasks.md](.kiro/specs/refactoagent-unified/tasks.md):

1. **Check current phase**: See which phase is currently active
2. **Pick a task**: Choose an unassigned task from the current phase
3. **Comment on the task**: Let others know you're working on it
4. **Implement incrementally**: Break large tasks into smaller commits
5. **Test thoroughly**: Ensure your changes don't break existing functionality

## 🧪 Testing

### Test Categories

1. **Unit Tests**: Test individual functions and classes
2. **Integration Tests**: Test component interactions  
3. **System Tests**: Test complete workflows
4. **Safety Tests**: Validate refactoring safety guarantees

### Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- src/analyzer.test.ts

# Run tests in watch mode
npm run test:watch

# Run integration tests
npm run test:integration
```

### Writing Tests

```typescript
// Example unit test
describe('ProjectAnalyzer', () => {
  it('should detect TypeScript projects', () => {
    const analyzer = new ProjectAnalyzer();
    const result = analyzer.detectLanguage('./sample-ts-project');
    expect(result.primary).toBe('typescript');
  });

  it('should calculate safety scores', () => {
    const analyzer = new ProjectAnalyzer();
    const analysis = { /* mock analysis */ };
    const score = analyzer.calculateSafetyScore(analysis);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});
```

## 🏗️ Architecture Overview

### Core Components

1. **CLI Interface** (`cli/src/index.ts`)
   - Command parsing and execution
   - User interaction and feedback
   - Output formatting and file management

2. **Project Analyzer** (Phase 2)
   - Language detection and analysis
   - Dependency graph construction
   - Safety score calculation

3. **Test Harness** (Phase 1-3)
   - Isolated test environments
   - Sample project generation
   - Validation and comparison

4. **Refactoring Engine** (Phase 4-6)
   - AST-based transformations
   - Safety validation
   - Policy enforcement

### Design Principles

- **Safety First**: All operations must be reversible and validated
- **Modularity**: Components should be loosely coupled
- **Testability**: Every component should be easily testable
- **Extensibility**: Support for new languages and features
- **Performance**: Optimize for common use cases

## 🔍 Debugging

### CLI Debugging

```bash
# Enable debug logging
DEBUG=refactoagent:* node dist/index.js plan --mode organize-only

# Use Node.js debugger
node --inspect-brk dist/index.js plan --mode organize-only
```

### VS Code Extension Debugging

1. Open `refactoagent-starter/vscode-extension` in VS Code
2. Press F5 to launch Extension Development Host
3. Set breakpoints in TypeScript source
4. Use the extension in the development host

### Common Issues

1. **Build failures**: Check Node.js version and dependencies
2. **Test failures**: Ensure all prerequisites are installed
3. **Extension not loading**: Check VS Code version compatibility
4. **CLI not found**: Verify build completed successfully

## 📊 Performance Considerations

### Optimization Guidelines

- **Lazy loading**: Load language processors only when needed
- **Caching**: Cache expensive analysis results
- **Streaming**: Process large files incrementally
- **Parallelization**: Use worker threads for CPU-intensive tasks

### Profiling

```bash
# Profile CLI performance
node --prof dist/index.js analyze large-project/

# Generate profile report
node --prof-process isolate-*.log > profile.txt
```

## 🚀 Release Process

### Version Management

- Follow [Semantic Versioning](https://semver.org/)
- Update version in `package.json` files
- Create git tags for releases
- Generate changelog from commit messages

### Pre-release Checklist

- [ ] All tests pass
- [ ] Documentation is updated
- [ ] Breaking changes are documented
- [ ] Performance benchmarks are acceptable
- [ ] Security review completed

## 🤝 Getting Help

### Resources

- **Documentation**: Check the [docs](.) directory
- **Specification**: Review the [unified spec](../.kiro/specs/refactoagent-unified/)
- **Examples**: Look at existing implementations
- **Tests**: Study test cases for usage patterns

### Community

- **GitHub Discussions**: Ask questions and share ideas
- **GitHub Issues**: Report bugs and request features
- **Pull Requests**: Review others' contributions
- **Code Reviews**: Learn from feedback

### Best Practices

1. **Start small**: Begin with simple contributions
2. **Ask questions**: Don't hesitate to seek clarification
3. **Follow patterns**: Study existing code for conventions
4. **Test thoroughly**: Ensure your changes work correctly
5. **Document changes**: Update relevant documentation

---

Happy coding! 🚀 Remember, RefactoAgent is all about making refactoring safe and reliable, so take your time to ensure quality in every contribution.