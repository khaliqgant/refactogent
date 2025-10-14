# Refactogent

> Intelligent code refactoring - with or without AI

Transform how you refactor code with intelligent analysis, safety checkpoints, and structured workflows. Use it standalone for deterministic refactoring, or with AI for intelligent, context-aware changes.

## 🎯 What is Refactogent?

Refactogent is a **dual-mode refactoring tool** that works two ways:

### Mode 1: Standalone CLI (Deterministic)
Run automated refactoring directly without AI. Perfect for:
- **Type extraction**: Automatically extract interfaces/types to separate files
- **Batch operations**: Process entire codebases at once
- **CI/CD integration**: Consistent, repeatable refactoring
- **Quick wins**: Apply best practices without AI overhead

### Mode 2: MCP Server (AI-Assisted)
Enhance Claude or other AI assistants with refactoring superpowers via [Model Context Protocol (MCP)](https://modelcontextprotocol.io):
- 🔍 **Deep codebase analysis** with dependency mapping
- 🛡️ **Safety checkpoints** with automatic rollback
- 🧪 **Validation workflows** (tests, linting, type checking)
- 📊 **Impact analysis** showing blast radius of changes
- 🤖 **AI-powered suggestions** using the AI's intelligence

**Key insight**: The CLI handles deterministic operations (like type extraction) while the MCP server gives AI the tools to orchestrate complex, context-aware refactorings using those same primitives.

## 🚀 Quick Start

### Mode 1: Standalone CLI (No AI Required)

```bash
# Install CLI
npm install -g refactogent

# Run automated type extraction
refactogent refactor ./src

# With options
refactogent refactor ./src \
  --ignore "**/*.test.ts" \
  --types-path "src/types" \
  --dry-run

# Verify changes
npm run build  # Your tests should pass!
```

**What it does**: Automatically extracts interface/type definitions from implementation files, creates `.types.ts` files, and updates imports. All changes are deterministic and safe.

See [CLI documentation](./packages/cli/README.md) for all commands.

### Mode 2: MCP Server (AI-Assisted)

```bash
# Install MCP server
npm install -g @refactogent/mcp-server

# Configure with Claude Code
claude mcp add --transport stdio refactogent -- npx -y @refactogent/mcp-server
```

**What it does**: Gives Claude (or other AI) access to refactoring tools like `refactor_context`, `refactor_checkpoint`, `refactor_validate`, etc. The AI orchestrates complex refactorings using its intelligence while the tools provide safety and validation.

See [MCP Server documentation](./packages/mcp-server/README.md) for detailed setup.

### Mode 3: Claude Code Plugin (Enhanced Experience)

```bash
# Install the refactoring expert plugin in Claude Code
/plugin marketplace add khaliqgant/refactogent
```

**What it does**: Adds a specialized "refactoring-expert" agent to Claude Code that automatically follows best practices for safe refactoring. The agent knows when to analyze context, check impact, create checkpoints, and validate changes.

See [Plugin documentation](./.claude-plugin/README.md) for installation and usage.

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

### Mode 1: Standalone CLI (Deterministic Refactoring)

**Direct refactoring without AI - just run and apply:**

- **Type Abstraction**: Automatically extract interfaces/types to `.types.ts` files
- **Smart Import Management**: Handles multi-line imports, merges duplicates
- **Batch Processing**: Process entire directories at once
- **Flexible Ignore Patterns**: Skip specific files or directories with `--ignore`
- **Dry Run Mode**: Preview changes before applying
- **Multi-language Support**: TypeScript, JavaScript, Python, Go
- **Zero Dependencies on AI**: Fast, deterministic, repeatable

**Use when**: You want automated, consistent refactoring without AI decision-making.

### Mode 2: MCP Server (AI-Assisted Intelligence)

**Tools that enhance AI's refactoring capabilities:**

- **refactor_context**: Deep codebase analysis with dependency graphs
- **refactor_checkpoint**: Git-based safety checkpoints with rollback
- **refactor_validate**: Automated testing, linting, and type checking
- **refactor_impact**: Blast radius analysis for proposed changes
- **refactor_suggest**: AI-powered refactoring suggestions
- **refactor_execute_safe**: Safe change application with auto-rollback
- **refactor_dependency_trace**: Forward/backward dependency tracing
- **refactor_test_coverage**: Real coverage analysis with recommendations

**Use when**: You want AI to make intelligent, context-aware refactoring decisions with safety guardrails.

**Note**: Type abstraction is NOT exposed via MCP because AI can handle it better using `refactor_execute_safe` with full context awareness.

## 🎯 Use Cases

### Mode 1: Standalone CLI - Batch Type Extraction

```bash
# Before: Types mixed with implementation across 50 files
# After: Clean separation with .types.ts files

$ refactogent refactor ./src/components --ignore "**/*.test.ts"
🚀 RefactoGent: Complete AI-Powered Refactoring Workflow
📁 Discovered 50 files
✅ Successfully indexed 50 files with 120 symbols
✅ Found 35 type abstraction opportunities
✅ Successfully applied 35 type abstractions

$ npm run build
✓ Build passes - all imports resolved correctly!
```

**Result**: All interface and type definitions extracted to co-located `.types.ts` files, imports updated, multi-line imports preserved.

### Mode 2: AI-Assisted - Safe Complex Refactoring

```
User: "Extract types from src/components/UserProfile.tsx"

Claude (using MCP):
1. Uses refactor_context to analyze the file and its dependencies
2. Uses refactor_checkpoint to create a safety point
3. Extracts types to a separate file with context-aware naming
4. Updates imports in all dependent files
5. Uses refactor_validate to run tests
6. If tests fail, auto-rolls back to checkpoint
```

### Mode 2: AI-Assisted - Impact Analysis

```
User: "What's the impact of changing the UserService class?"

Claude (using MCP):
1. Uses refactor_impact to analyze dependencies
2. Reports: "47 files depend on this. High risk (82/100)"
3. Uses refactor_dependency_trace to show the chain
4. Suggests breaking the refactor into smaller steps
```

### Mode 2: AI-Assisted - Intelligent Suggestions

```
User: "Improve code quality in src/services"

Claude (using MCP):
1. Uses refactor_suggest on each file
2. Prioritizes high-impact, low-risk suggestions
3. Uses refactor_execute_safe to apply changes incrementally
4. Validates after each change with automatic rollback
```

### When to Use Each Mode

**Use CLI Mode** when:
- You want fast, automated batch operations
- Changes are deterministic (type extraction, formatting)
- Running in CI/CD pipelines
- You don't need context-aware decision making

**Use MCP Mode** when:
- Changes require understanding context and intent
- You need impact analysis before proceeding
- Refactoring affects multiple interconnected files
- You want AI to make intelligent decisions with safety nets

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