# Contributing to RefactoAgent

Thank you for your interest in contributing to RefactoAgent! This document provides guidelines and information for contributors.

## 🎯 Project Vision

RefactoAgent aims to make code refactoring safe, automated, and accessible to all developers. We prioritize:

- **Safety first**: No changes without comprehensive validation
- **Developer experience**: Tools that enhance rather than complicate workflows  
- **Community-driven**: Built by developers, for developers
- **Quality code**: Well-tested, documented, and maintainable

## 🚀 Getting Started

### Prerequisites

- **Node.js 18+** and **npm 8+** (primary package manager)
- **Python 3.9+** (for Python language support)
- **Go 1.19+** (for Go language support)
- **Git**
- **Docker** (for testing environments)

> **Package Manager**: This project uses npm as the standard package manager. All scripts and documentation assume npm usage.

### Development Setup

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/yourusername/refactoagent.git
   cd refactoagent
   ```

2. **Set up the development environment**
   ```bash
   cd refactoagent-starter
   npm install
   cd cli && npm install && npm run build
   cd ../vscode-extension && npm install
   ```

3. **Run the test suite**
   ```bash
   npm test
   ```

4. **Try the CLI**
   ```bash
   cd cli
   node dist/index.js --help
   ```

## 📋 How to Contribute

### 1. Choose Your Contribution Type

#### 🐛 Bug Reports
- Use the bug report template
- Include reproduction steps
- Provide system information
- Add relevant logs or screenshots

#### ✨ Feature Requests  
- Check existing issues first
- Use the feature request template
- Explain the use case and benefits
- Consider implementation complexity

#### 💻 Code Contributions
- Check the [implementation plan](.kiro/specs/refactoagent-unified/tasks.md)
- Look for issues labeled `good first issue` or `help wanted`
- Comment on the issue before starting work

#### 📝 Documentation
- Fix typos and improve clarity
- Add examples and use cases
- Update outdated information
- Translate documentation

### 2. Development Workflow

#### Branch Naming
- `feature/description` - New features
- `fix/description` - Bug fixes  
- `docs/description` - Documentation updates
- `refactor/description` - Code refactoring

#### Commit Messages
Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description

feat(cli): add project analysis command
fix(parser): handle edge case in TypeScript parsing
docs(readme): update installation instructions
test(engine): add characterization test cases
```

#### Pull Request Process

1. **Create a focused PR**
   - One feature/fix per PR
   - Keep changes small and reviewable
   - Update tests and documentation

2. **Write a clear description**
   - Explain what and why
   - Link related issues
   - Include testing instructions

3. **Ensure quality**
   - All tests pass
   - Code follows style guidelines
   - Documentation is updated
   - No breaking changes without discussion

4. **Respond to feedback**
   - Address review comments promptly
   - Ask questions if unclear
   - Update the PR as needed

## 🧪 Testing Guidelines

### Test Categories

1. **Unit Tests**: Test individual functions and classes
2. **Integration Tests**: Test component interactions
3. **System Tests**: Test full workflows
4. **Safety Tests**: Validate refactoring safety guarantees

### Writing Tests

- Use descriptive test names
- Follow the AAA pattern (Arrange, Act, Assert)
- Test both happy path and edge cases
- Mock external dependencies
- Keep tests fast and reliable

### Running Tests

```bash
# Run all tests
npm test

# Run specific test suite
npm test -- --grep "ProjectAnalyzer"

# Run tests with coverage
npm run test:coverage

# Run integration tests
npm run test:integration
```

## 📚 Code Style Guidelines

### General Principles

- **Clarity over cleverness**: Write code that's easy to understand
- **Consistency**: Follow existing patterns in the codebase
- **Safety**: Validate inputs and handle errors gracefully
- **Performance**: Consider efficiency but prioritize correctness

### TypeScript/JavaScript

- Use TypeScript for all new code
- Follow the existing ESLint configuration
- Use meaningful variable and function names
- Add JSDoc comments for public APIs
- Prefer functional programming patterns

### Python

- Follow PEP 8 style guidelines
- Use type hints for all functions
- Write docstrings for modules, classes, and functions
- Use meaningful variable names
- Handle errors explicitly

### Go

- Follow standard Go conventions
- Use `gofmt` for formatting
- Write clear, idiomatic Go code
- Include comprehensive error handling
- Add package documentation

## 🏗️ Architecture Guidelines

### Design Principles

1. **Modularity**: Components should be loosely coupled
2. **Testability**: Design for easy testing
3. **Extensibility**: Support adding new languages and features
4. **Safety**: Fail fast and provide clear error messages
5. **Performance**: Optimize for common use cases

### Adding New Features

1. **Review the specification**: Check if it aligns with the project goals
2. **Design first**: Consider the architecture impact
3. **Start small**: Implement a minimal version first
4. **Add tests**: Comprehensive test coverage is required
5. **Document**: Update relevant documentation

### Adding Language Support

1. **Follow the plugin pattern**: Use the existing language interface
2. **Implement core operations**: Parsing, analysis, and transformation
3. **Add comprehensive tests**: Include sample projects
4. **Update documentation**: Add language-specific guides

## 🔍 Code Review Guidelines

### For Authors

- Keep PRs small and focused
- Write clear commit messages and PR descriptions
- Respond to feedback constructively
- Test thoroughly before requesting review

### For Reviewers

- Be constructive and specific in feedback
- Focus on code quality, safety, and maintainability
- Ask questions to understand the approach
- Approve when ready, request changes when needed

## 🎯 Implementation Phases

We're implementing RefactoAgent in phases. Check the [implementation plan](.kiro/specs/refactoagent-unified/tasks.md) for current priorities:

- **Phase 1-3**: Local foundation and testing infrastructure
- **Phase 4-6**: Core refactoring engine and safety systems
- **Phase 7-8**: Multi-language support and advanced features
- **Phase 9-10**: GitHub integration and production features

## 📞 Getting Help

- **GitHub Discussions**: Ask questions and share ideas
- **GitHub Issues**: Report bugs and request features
- **Documentation**: Check the [docs](docs/) directory
- **Code**: Review existing implementations for patterns

## 🏆 Recognition

Contributors are recognized in:

- The project README
- Release notes for significant contributions
- The contributors page (coming soon)

## 📜 Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold this code.

---

Thank you for contributing to RefactoAgent! Together, we're making code refactoring safer and more accessible for everyone. 🚀