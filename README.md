# Refactogent

> AI-powered refactoring with safety guardrails for Claude Code

Transform how you refactor code with intelligent analysis, safety checkpoints, and structured workflows designed for AI-assisted development.

## 🎯 What is Refactogent?

Refactogent provides Claude with powerful tools for **safe, intelligent refactoring** through the [Model Context Protocol (MCP)](https://modelcontextprotocol.io). It doesn't try to replace Claude's intelligence—it enhances it with:

- 🔍 **Deep codebase analysis** with dependency mapping
- 🛡️ **Safety checkpoints** with automatic rollback
- 🧪 **Validation workflows** (tests, linting, type checking)
- 📊 **Impact analysis** showing blast radius of changes
- 🤖 **AI-powered suggestions** using Claude's intelligence

## 🚀 Quick Start

### Option 1: MCP Server (Recommended for Claude Code)

```bash
# Install globally
npm install -g @refactogent/mcp-server

# Configure with Claude Code
claude mcp add --transport stdio refactogent -- npx -y @refactogent/mcp-server
```

See [MCP Server documentation](./packages/mcp-server/README.md) for detailed setup.

### Option 2: CLI Tool

```bash
# Install CLI
npm install -g refactogent

# Analyze your project
refactogent refactor ./src
```

See [CLI documentation](./packages/cli/README.md) for all commands.

## 📦 Packages

This monorepo contains three packages:

### [@refactogent/mcp-server](./packages/mcp-server)
Model Context Protocol server providing Claude with refactoring tools and safety guardrails.

**Status**: ✅ Production Ready

### [refactogent](./packages/cli)
Command-line interface for standalone refactoring analysis.

**Status**: ✅ Production Ready

### [@refactogent/core](./packages/core)
Core analysis engine with AST parsing, indexing, and type abstraction.

**Status**: ✅ Production Ready

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Claude Code                          │
│          (AI-powered development environment)                │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ MCP Protocol
                         │
┌────────────────────────▼────────────────────────────────────┐
│                  @refactogent/mcp-server                     │
│                                                               │
│  Tools:                          Resources:                  │
│  • refactor_context              • project-health           │
│  • refactor_checkpoint                                       │
│  • refactor_validate                                         │
│  • refactor_impact                                           │
│  • refactor_suggest                                          │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ Uses
                         │
┌────────────────────────▼────────────────────────────────────┐
│                    @refactogent/core                         │
│                                                               │
│  • AST Analysis & Parsing                                    │
│  • Project Indexing                                          │
│  • Dependency Mapping                                        │
│  • Type Abstraction                                          │
│  • Complexity Analysis                                       │
└──────────────────────────────────────────────────────────────┘
```

## 🛠️ Development

```bash
# Install dependencies for all packages
npm install

# Build all packages
npm run build

# Test all packages
npm run test

# Lint all packages
npm run lint

# Format code
npm run format

# Clean build artifacts
npm run clean
```

### Working on Individual Packages

```bash
# MCP Server
cd packages/mcp-server
npm run build
npm run test:inspector  # Test with MCP Inspector

# CLI
cd packages/cli
npm run dev

# Core
cd packages/core
npm test
```

## 📋 Key Features

### For Claude Code (MCP Server)

- **refactor_context**: Deep codebase analysis with dependency graphs
- **refactor_checkpoint**: Git-based safety checkpoints with rollback
- **refactor_validate**: Automated testing, linting, and type checking
- **refactor_impact**: Blast radius analysis for proposed changes
- **refactor_suggest**: AI-powered refactoring suggestions
- **project-health**: Comprehensive project health metrics

### For Standalone Use (CLI)

- **Type Abstraction**: Extract and centralize duplicate types
- **Project Indexing**: Fast symbol extraction and dependency mapping
- **Multi-language Support**: TypeScript, JavaScript, Python, Go
- **Complexity Analysis**: Cyclomatic complexity for functions
- **Test File Detection**: Automatic test file identification

## 🎯 Use Cases

### Safe Refactoring with Claude

```
User: "Extract types from src/components/UserProfile.tsx"

Claude:
1. Uses refactor_context to analyze the file
2. Uses refactor_checkpoint to create a safety point
3. Extracts types to a separate file
4. Updates imports
5. Uses refactor_validate to run tests
6. If tests fail, auto-rolls back to checkpoint
```

### Impact Analysis Before Changes

```
User: "What's the impact of changing the UserService class?"

Claude:
1. Uses refactor_impact to analyze dependencies
2. Reports: "47 files depend on this. High risk (82/100)"
3. Suggests breaking the refactor into smaller steps
```

### AI-Powered Suggestions

```
User: "Improve code quality in src/services"

Claude:
1. Uses refactor_suggest on each file
2. Prioritizes high-impact, low-risk suggestions
3. Applies refactorings incrementally with validation
```

## 🚦 Roadmap

### Phase 1: Core MCP Server ✅ (Complete - Q1 2025)
- [x] MCP server implementation with 5 core tools
- [x] Git-based safety checkpoints
- [x] Impact analysis and dependency mapping
- [x] AI-powered refactoring suggestions
- [x] Project health metrics
- [x] CLI tool for standalone usage
- [x] TypeScript/JavaScript/Python/Go support

### Phase 2: Enhanced Intelligence (Q2 2025)
- [ ] Multi-file refactoring workflows
- [ ] Custom refactoring patterns and templates
- [ ] Learning from refactoring outcomes
- [ ] Team-wide refactoring standards enforcement
- [ ] Enhanced Python/Go AST analysis
- [ ] Real test coverage calculation (vs. placeholder)
- [ ] Duplicate code detection implementation
- [ ] Cross-file type usage detection

### Phase 3: Enterprise Features (Q3 2025)
- [ ] Web dashboard for refactoring history
- [ ] Team collaboration features
- [ ] Refactoring analytics and reporting
- [ ] CI/CD integration hooks
- [ ] Custom validation rules
- [ ] Slack/Teams notifications
- [ ] SSO and team management

### Phase 4: GitHub Integration (Q4 2025)
- [ ] GitHub App for automated PR suggestions
- [ ] Code review integration
- [ ] Technical debt tracking dashboard
- [ ] Automated refactoring PRs
- [ ] Commit-based refactoring suggestions
- [ ] Repository health badges

### Phase 5: AI Enhancements (2026)
- [ ] Fine-tuned models for specific refactoring patterns
- [ ] Learning from accepted/rejected suggestions
- [ ] Context-aware suggestions based on team conventions
- [ ] Predictive technical debt alerts
- [ ] Automated migration path generation
- [ ] Multi-repository refactoring coordination

### Long-term Vision
- **Self-improving system**: Learn from user feedback to improve suggestions
- **Proactive refactoring**: Detect issues before they become problems
- **Migration assistant**: Automated framework/library upgrades
- **IDE plugins**: VSCode, JetBrains, and other IDE integrations
- **Language expansion**: Ruby, Java, C#, Rust, and more
- **Refactoring marketplace**: Share and discover custom patterns

## 🤝 Contributing

Contributions are welcome! Areas where we need help:

- **Language support**: Improve Python/Go parsing, add new languages
- **Test coverage**: Integration tests for MCP tools
- **Documentation**: Examples, tutorials, and guides
- **Bug reports**: Test with your projects and report issues
- **Feature requests**: Share your use cases and needs

See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed guidelines.

## 📄 License

MIT - see [LICENSE](./LICENSE) for details.

## 💬 Support

- 🐛 [Report issues](https://github.com/khaliqgant/refactogent/issues)
- 💡 [Feature requests](https://github.com/khaliqgant/refactogent/discussions)
- 📖 [Documentation](https://github.com/khaliqgant/refactogent#readme)
- 🔐 [Security policy](./SECURITY.md)

---

**Built with ❤️ for the Claude Code community**