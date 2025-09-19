# Refactogent

Safe, incremental code refactoring tools and platform.

## 🚀 Quick Start

```bash
# Install the CLI
npm install -g @refactogent/cli

# Analyze your project
refactogent refactor-suggest

# Get comprehensive analysis
refactogent analyze
```

## 📦 Packages

This is a monorepo containing multiple packages:

### [@refactogent/cli](./packages/cli)
Command-line interface for refactoring analysis and suggestions.

```bash
npm install -g @refactogent/cli
```

### [@refactogent/core](./packages/core) *(Coming Soon)*
Core analysis engine and shared utilities.

```bash
npm install @refactogent/core
```

## 🏗️ Project Structure

```
refactogent/
├── packages/
│   ├── cli/                 # @refactogent/cli - Command line tool
│   ├── core/                # @refactogent/core - Shared analysis engine
│   ├── github-app/          # @refactogent/github-app (planned)
│   └── cloud/               # @refactogent/cloud (planned)
├── apps/
│   └── web/                 # Web dashboard (planned)
└── tools/                   # Build tools and scripts
```

## 🛠️ Development

```bash
# Install dependencies for all packages
npm install

# Build all packages
npm run build

# Test all packages
npm run test

# Run CLI in development
npm run dev:cli

# Publish CLI package
npm run publish:cli
```

## 📋 Features

- **Safe Refactoring**: AI-powered analysis ensures safe code transformations
- **Multi-language Support**: TypeScript, JavaScript, Python, Go, and more
- **Incremental Approach**: Small, manageable changes with clear impact assessment
- **Test Coverage Analysis**: Understand test coverage before refactoring
- **Safety Scoring**: Risk assessment for each suggested change
- **AST Analysis**: Deep code structure understanding
- **Project Health Reports**: Comprehensive codebase analysis

## 🎯 Use Cases

- **Legacy Code Modernization**: Safely update old codebases
- **Code Quality Improvement**: Identify and fix code smells
- **Performance Optimization**: Find performance improvement opportunities
- **Technical Debt Reduction**: Systematic approach to reducing technical debt
- **Team Onboarding**: Help new developers understand codebase structure

## 🔧 Commands

### `refactor-suggest`
Generate intelligent refactoring suggestions for your codebase.

```bash
refactogent refactor-suggest --format json --max-suggestions 5
```

### `analyze`
Comprehensive project analysis and health report.

```bash
refactogent analyze --format html --output ./reports
```

### `safety-analyze`
Analyze project safety for refactoring operations.

```bash
refactogent safety-analyze --threshold 0.8
```

## 🚀 Publishing

### CLI Package

```bash
# Build and test
cd packages/cli
npm run ci

# Publish to npm
npm publish
```

### Core Package (When Ready)

```bash
# Build and test
cd packages/core
npm run ci

# Publish to npm
npm publish
```

## 📄 License

MIT - see [LICENSE](./LICENSE) for details.

## 🤝 Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for contribution guidelines.

## 🔒 Security

See [SECURITY.md](./SECURITY.md) for security policy and reporting vulnerabilities.