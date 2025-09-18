# Refactogent

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Python](https://img.shields.io/badge/Python-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![Go](https://img.shields.io/badge/Go-00ADD8?logo=go&logoColor=white)](https://golang.org/)

> **Safe, incremental, and reviewable code refactoring with strong behavior preservation guarantees**

Refactogent is an AI-powered refactoring assistant that helps developers improve code quality without breaking functionality. It uses characterization tests, semantic equivalence checks, and comprehensive safety gates to ensure that refactoring operations never introduce bugs.

## 🎯 Key Features

- **Safety First**: Characterization tests and semantic equivalence checks ensure no behavior changes
- **Local Testing**: Comprehensive local testing infrastructure before any remote operations  
- **Multi-Language**: TypeScript, Python, and Go support with extensible architecture
- **Vibe-Coded Friendly**: Special support for messy codebases with limited test coverage
- **GitHub Integration**: Full GitHub App integration with PR automation and safety checks

## 🚀 Quick Start

### Local Development

```bash
# Set up the starter project
cd refactogent-starter
npm install

# Try the CLI
cd cli && npm run build
node dist/index.js --help
node dist/index.js plan --mode organize-only
```

### VS Code Extension

```bash
cd refactogent-starter/vscode-extension
npm install && npm run compile
# Load in VS Code using "Run -> Start Debugging"
```

## 📋 Implementation Plan

The project is organized into 10 phases:

1. **Phase 1-3**: Local foundation (test infrastructure, project analysis, characterization tests)
2. **Phase 4-6**: Core engine (refactoring, safety validation, policy enforcement)  
3. **Phase 7-8**: Advanced features (multi-language support, complex operations)
4. **Phase 9-10**: Integration and production (GitHub App, IDE extensions, monitoring)

## 📚 Documentation

- **[Unified Specification](.kiro/specs/refactogent-unified/)** - Complete requirements, design, and implementation plan
- **[Documentation](docs/)** - All project documentation and examples
- **[Starter Project](refactogent-starter/)** - Local development setup

## 🏗️ Project Structure

```
├── .kiro/specs/refactogent-unified/    # Main specification
│   ├── requirements.md                  # Requirements document
│   ├── design.md                       # System design
│   └── tasks.md                        # Implementation plan
├── docs/                               # Documentation
│   ├── specs/                          # Original specifications
│   ├── config/                         # Configuration examples
│   └── examples/                       # Templates and examples
├── refactogent-starter/               # Starter project
│   ├── cli/                           # CLI implementation
│   └── vscode-extension/              # VS Code extension
└── README.md                          # This file
```

## 🛠️ Development

### Getting Started

1. **Review the Specification**: Start with the [unified specification](.kiro/specs/refactogent-unified/)
2. **Set Up Local Environment**: Use the [starter project](refactogent-starter/)
3. **Begin Implementation**: Start with Phase 1 tasks from [tasks.md](.kiro/specs/refactogent-unified/tasks.md)

### Implementation Approach

- **Local First**: Build and test everything locally before any GitHub integration
- **Safety Focused**: Every change must pass comprehensive safety checks
- **Incremental**: Each phase builds working functionality on the previous phases
- **Test Driven**: Extensive testing at every level

## 🔒 Safety Guarantees

- Never push to default branches
- Characterization tests before any changes
- Build, test, and coverage validation on every change
- Semantic equivalence checking for API compatibility
- Comprehensive rollback capabilities

## 📖 Key Concepts

- **Characterization Tests**: Golden tests that capture current behavior
- **Semantic Equivalence**: API-level behavior comparison with tolerance for non-semantic changes
- **Safety Gates**: Comprehensive validation pipeline that must pass before any changes
- **Vibe-Coded Support**: Special handling for messy codebases with technical debt

## 🤝 Contributing

We welcome contributions! Refactogent is built by the community, for the community.

### Getting Started

1. **Fork the repository** and clone your fork
2. **Read our [Contributing Guide](CONTRIBUTING.md)** for detailed instructions
3. **Review the [Code of Conduct](CODE_OF_CONDUCT.md)** 
4. **Check the [implementation plan](.kiro/specs/refactogent-unified/tasks.md)** for available tasks
5. **Join our discussions** in GitHub Issues and Discussions

### Ways to Contribute

- 🐛 **Report bugs** and suggest features
- 📝 **Improve documentation** and examples
- 🧪 **Add test cases** and sample projects
- 💻 **Implement features** from the roadmap
- 🎨 **Enhance the CLI/IDE experience**
- 🔍 **Review pull requests**

### Development Setup

```bash
# Clone your fork
git clone https://github.com/yourusername/refactogent.git
cd refactogent

# Set up the development environment
cd refactogent-starter
npm install

# Run tests
npm test

# Start developing!
```

See our [Development Guide](docs/DEVELOPMENT.md) for detailed setup instructions.

## 🌟 Why Refactogent?

- **🛡️ Zero-Risk Refactoring**: Comprehensive safety checks ensure no behavior changes
- **🧪 Test-First Approach**: Generates characterization tests before making any changes
- **🎯 Smart Analysis**: Understands your codebase structure and identifies safe refactoring opportunities
- **🔄 Incremental Improvements**: Small, reviewable changes that build up to significant improvements
- **🌍 Multi-Language**: Native support for TypeScript, Python, and Go with extensible architecture
- **💻 Developer-Friendly**: Works locally, in your IDE, or as a GitHub App

## 📊 Project Status

🚧 **In Active Development** - Currently implementing Phase 1 (Local Test Infrastructure)

- ✅ Comprehensive specification complete
- ✅ Architecture and design finalized  
- 🚧 Local testing infrastructure (Phase 1)
- ⏳ Core refactoring engine (Phase 2-3)
- ⏳ GitHub integration (Phase 4-5)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Inspired by the need for safe, automated refactoring in fast-moving codebases
- Built with safety-first principles from the refactoring and testing communities
- Special thanks to contributors and early adopters

---

**Made with ❤️ for the developer community**