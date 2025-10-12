# @refactogent/mcp-server

> Model Context Protocol server for AI-powered refactoring with safety guardrails

Transform how you refactor code with Claude! This MCP server provides Claude with powerful tools for **safe, intelligent refactoring** of your codebase.

## 🎯 What is this?

This is an [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that gives Claude Code superpowers for refactoring:

- 🔍 **Deep codebase analysis** with dependency mapping
- 🛡️ **Safety checkpoints** with automatic rollback
- 🧪 **Validation workflows** (tests, linting, type checking)
- 📊 **Impact analysis** showing blast radius of changes
- 🤖 **AI-powered suggestions** using Claude's intelligence

**The key insight**: Claude is already amazing at understanding and modifying code. This MCP server provides the **safety guardrails** and **structured workflows** to make refactoring risk-free.

## 🚀 Quick Start

### Installation

```bash
npm install -g @refactogent/mcp-server
```

### Configure with Claude Code

Add to your Claude Code configuration:

```bash
# Using the CLI
claude mcp add --transport stdio refactogent -- npx -y @refactogent/mcp-server

# Or manually edit ~/.config/claude/mcp.json
```

```json
{
  "mcpServers": {
    "refactogent": {
      "command": "npx",
      "args": ["-y", "@refactogent/mcp-server"],
      "env": {
        "ANTHROPIC_API_KEY": "${ANTHROPIC_API_KEY}"
      }
    }
  }
}
```

### Set API Key (Optional, for AI suggestions)

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

The API key is **only required** for the `refactor_suggest` tool. All other tools work without it.

## 🛠️ Available Tools

### 1. `refactor_context` - Analyze Codebase

Get a comprehensive understanding of your codebase structure.

**Use when**: You need to understand dependencies, complexity, or test coverage before refactoring.

```typescript
// Example Claude interaction:
User: "Analyze the src/components directory"

Claude uses refactor_context:
{
  "path": "src/components",
  "includeTests": true,
  "includeDependencies": true
}

// Returns: File structure, symbols, dependencies, complexity metrics, safety score
```

**Returns**:
- List of files with symbols and exports
- Dependency graph
- Test coverage metrics
- Complexity metrics
- Safety score (0-100)

---

### 2. `refactor_checkpoint` - Create Safety Rollback Point

Create a git stash checkpoint before making changes.

**Use when**: You're about to make significant changes and want the ability to rollback.

```typescript
User: "Create a checkpoint before I refactor the auth system"

Claude uses refactor_checkpoint:
{
  "message": "Before refactoring auth system"
}

// Creates a git stash with timestamp
// Returns checkpoint ID for later rollback
```

**Returns**: Checkpoint ID, timestamp, list of tracked files

---

### 3. `refactor_validate` - Run Tests & Checks

Execute tests, linting, and type checking after changes.

**Use when**: After making refactoring changes to verify everything still works.

```typescript
User: "Run tests and rollback if they fail"

Claude uses refactor_validate:
{
  "checkpointId": "refactogent-checkpoint-1234567890",
  "autoRollback": true
}

// Runs: npm test, npm run lint, tsc --noEmit
// Auto-rolls back to checkpoint if any fail
```

**Returns**: Test results, lint results, type check results, rollback status

---

### 4. `refactor_impact` - Analyze Blast Radius

Understand what will be affected by changing a file or symbol.

**Use when**: You want to know how many files depend on something before changing it.

```typescript
User: "What's the impact of changing UserService?"

Claude uses refactor_impact:
{
  "targetFile": "src/services/UserService.ts",
  "targetSymbol": "UserService"
}

// Returns dependency tree and risk analysis
```

**Returns**:
- Direct dependents
- Transitive dependents
- Total affected files
- Test coverage
- Risk score (0-100)
- Recommendations

---

### 5. `refactor_suggest` - AI-Powered Suggestions

Use Claude AI to analyze code and suggest intelligent refactorings.

**Use when**: You want AI-generated refactoring suggestions for a file.

**Requires**: `ANTHROPIC_API_KEY` environment variable

```typescript
User: "Suggest refactorings for this file focused on types"

Claude uses refactor_suggest:
{
  "file": "src/utils/helpers.ts",
  "focus": "types",
  "maxSuggestions": 5
}

// Claude analyzes the file and returns prioritized suggestions
```

**Focus areas**:
- `types` - Type extraction, type safety improvements
- `duplicates` - Code duplication detection
- `complexity` - Complexity reduction
- `naming` - Naming improvements
- `structure` - File organization
- `all` - All refactoring opportunities

**Returns**: List of suggestions with risk scores, priorities, and reasoning

---

## 📊 Available Resources

### `refactogent://project-health` - Project Health Report

Get a comprehensive health score for your entire project.

```typescript
// Claude can read this resource to understand overall project health
// Returns:
{
  "overallScore": 75,
  "metrics": {
    "totalFiles": 150,
    "totalLines": 12500,
    "averageComplexity": 8.5,
    "testCoverage": 65
  },
  "opportunities": {
    "typeAbstractions": 12,
    "duplicateCode": 5,
    "complexFunctions": 8
  },
  "recommendations": [...]
}
```

---

## 💡 Example Workflows

### Safe Type Abstraction

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

### Complex Refactoring with Impact Analysis

```
User: "I want to refactor the authentication system"

Claude:
1. Uses refactor_impact to see what depends on auth files
2. Reports: "This affects 47 files. High risk (score: 82/100)"
3. Uses refactor_suggest to get AI recommendations
4. Suggests breaking into smaller steps
5. Creates checkpoint before each step
6. Validates after each change
```

### Code Quality Improvement

```
User: "Improve code quality in src/services"

Claude:
1. Reads refactogent://project-health resource
2. Uses refactor_suggest with focus='all' on each file
3. Prioritizes high-impact, low-risk suggestions
4. Applies refactorings incrementally
5. Validates continuously
```

---

## 🔧 Configuration

### Environment Variables

Create a `.env` file or export these variables:

```bash
# Required for refactor_suggest tool
ANTHROPIC_API_KEY=sk-ant-...

# Optional limits
MAX_SUGGESTIONS=10
MAX_FILES_TO_ANALYZE=1000

# Optional safety settings
AUTO_ROLLBACK=true
REQUIRE_TESTS=true
```

### Claude Desktop Configuration

For Claude Desktop app, edit:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "refactogent": {
      "command": "npx",
      "args": ["-y", "@refactogent/mcp-server"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-..."
      }
    }
  }
}
```

---

## 🏗️ Architecture

### How It Works

```
┌─────────────┐
│   Claude    │  ← User asks for refactoring help
└──────┬──────┘
       │
       ├─────────────────────────────────────┐
       │                                     │
       ▼                                     ▼
┌──────────────────┐              ┌──────────────────┐
│  MCP Tools       │              │  MCP Resources   │
│  (Actions)       │              │  (Data)          │
└──────┬───────────┘              └──────┬───────────┘
       │                                 │
       ├─ refactor_context              ├─ project-health
       ├─ refactor_checkpoint            │
       ├─ refactor_validate              │
       ├─ refactor_impact                │
       └─ refactor_suggest               │
              │                          │
              ▼                          ▼
       ┌─────────────────────────────────────┐
       │     @refactogent/core               │
       │  (AST Analysis, Indexing, etc.)     │
       └─────────────────────────────────────┘
```

**Key Principle**: Refactogent doesn't try to do refactoring itself. Instead, it:
1. **Provides context** to Claude about the codebase
2. **Enforces safety** through checkpoints and validation
3. **Structures workflows** with clear steps and gates
4. **Augments intelligence** by calling Claude API for suggestions

---

## 🎓 Philosophy

Traditional refactoring tools try to be smart about *what* to refactor. This MCP server does something different:

**Claude is already smart.** It understands code better than any static analysis tool.

What Claude needs is:
- ✅ Deep context about the codebase
- ✅ Safety mechanisms (checkpoints, validation)
- ✅ Structured workflows (analyze → plan → validate → rollback)
- ✅ Impact analysis (what breaks if I change this?)

That's what this MCP server provides. Think of it as **training wheels for refactoring** - not because Claude isn't smart enough, but because refactoring should be **safe and structured**.

---

## 🚦 Roadmap

### Phase 1: MCP Server ✅ (Current)
- Core refactoring tools
- Safety checkpoints
- Impact analysis
- AI-powered suggestions

### Phase 2: Enhanced Intelligence (Q2 2025)
- Multi-file refactoring workflows
- Custom refactoring patterns
- Learning from outcomes
- Team-wide refactoring standards

### Phase 3: SaaS Platform (Q3 2025)
- Web dashboard
- Refactoring history
- Team collaboration
- CI/CD integration

### Phase 4: GitHub App (Q4 2025)
- Automated PR suggestions
- Code review integration
- Technical debt tracking

---

## 📝 License

MIT

---

## 🤝 Contributing

Contributions welcome! See [CONTRIBUTING.md](../../CONTRIBUTING.md)

---

## 💬 Support

- 🐛 [Report issues](https://github.com/khaliqgant/refactogent/issues)
- 💡 [Feature requests](https://github.com/khaliqgant/refactogent/discussions)
- 📖 [Documentation](https://github.com/khaliqgant/refactogent#readme)

---

**Built with ❤️ by the Refactogent team**
