# Refactogent Claude Code Plugin

> Expert refactoring agent with safety checkpoints, impact analysis, and automatic validation

This plugin adds a specialized **Refactoring Expert** agent to Claude Code that knows how to use refactogent's powerful MCP tools for safe, intelligent code refactoring.

## Features

- 🔍 **Deep Analysis** - Understand code structure, dependencies, and complexity before refactoring
- 🛡️ **Safety First** - Automatic git checkpoints with rollback on validation failure
- 📊 **Impact Awareness** - See the blast radius and risk score before making changes
- 🤖 **AI Suggestions** - Get intelligent refactoring recommendations
- ✅ **Auto Validation** - Tests, linting, and type checking after every change
- 🔄 **Smart Rollback** - Automatically reverts if anything breaks

## Quick Start

### 1. Install Plugin

```bash
# In Claude Code
/plugin marketplace add khaliqgant/refactogent
```

### 2. Configure MCP Server

```bash
claude mcp add --transport stdio refactogent -- npx -y @refactogent/mcp-server
```

### 3. Start Refactoring

```
"Extract types from src/services/user.ts"
```

Claude will automatically use the refactoring-expert agent for safe, validated refactoring.

## What You Get

### Specialized Agent

The plugin includes a **refactoring-expert** agent that:

- Analyzes code context before making changes
- Checks impact and calculates risk scores
- Creates safety checkpoints automatically
- Makes changes incrementally
- Validates with tests after each step
- Rolls back automatically if tests fail
- Explains its reasoning and shows impact

### Systematic Workflow

Every refactoring follows a proven process:

1. **Context** - Analyze the code structure
2. **Impact** - Check blast radius and risk
3. **Checkpoint** - Create git safety point
4. **Execute** - Make changes incrementally
5. **Validate** - Run tests/linting/types
6. **Rollback** - Auto-revert on failure

## Example Usage

### Type Extraction

```
You: "Extract types from auth.ts"

Agent:
- Analyzes auth.ts structure
- Finds 8 interfaces, 3 type aliases
- Checks impact: 12 dependent files, risk 45/100
- Creates checkpoint
- Extracts to auth.types.ts
- Updates all imports
- Validates: ✓ All tests pass
```

### Complex Refactoring

```
You: "The UserService class is too complex, please refactor it"

Agent:
- Analyzes complexity: 87/100 (Very High)
- Shows 23 dependent files, risk 78/100
- Suggests breaking into 3 services
- Creates checkpoint
- Refactors incrementally
- Validates after each step
- Reports completion with new complexity: 42/100
```

### Impact Analysis

```
You: "What's the impact of changing the Database interface?"

Agent:
- Maps 47 dependent files
- Calculates risk score: 92/100 (Very High)
- Shows dependency chain
- Recommends incremental approach
- Suggests adding deprecation warnings first
```

## Why Use This Plugin?

### Without the Agent

```
You: "Extract types from auth.ts"

Claude:
- Makes changes directly
- Might miss dependencies
- No validation
- No safety net
- You manually test afterward
```

### With the Agent

```
You: "Extract types from auth.ts"

Refactoring Expert:
- Analyzes code structure first
- Checks impact on 12 files
- Creates safety checkpoint
- Makes changes carefully
- Updates all imports
- Runs full test suite
- Rolls back if anything fails
- Reports success with metrics
```

## Requirements

- **Claude Code** (latest version)
- **Refactogent MCP Server** (auto-installed via npx)
- **Git repository** (for safety checkpoints)
- **Node.js 18+** (for running tests/validation)

## Documentation

- [Usage Guide](docs/USAGE.md) - Detailed usage instructions and examples
- [Agent Configuration](agents/refactoring-expert.md) - Agent prompt and capabilities
- [Refactogent Docs](../../README.md) - Main project documentation

## Agent Capabilities

The refactoring-expert agent has access to:

### Refactogent MCP Tools
- `refactor_context` - Deep codebase analysis
- `refactor_impact` - Blast radius and risk scoring
- `refactor_dependency_trace` - Dependency chain mapping
- `refactor_suggest` - AI-powered refactoring suggestions
- `refactor_checkpoint` - Git safety checkpoints
- `refactor_validate` - Test/lint/type validation
- `refactor_execute_safe` - Safe execution with auto-rollback
- `project-health` - Codebase health metrics

### Standard Tools
- File operations (Read, Write, Edit)
- Shell commands (Bash)
- Code search (Grep, Glob)

## Use Cases

Perfect for:

- ✅ Type extraction and organization
- ✅ Function/class refactoring
- ✅ Symbol renaming across files
- ✅ Complexity reduction
- ✅ Code structure reorganization
- ✅ Pre-commit cleanup
- ✅ Technical debt reduction
- ✅ Safe experimentation

Not needed for:

- ❌ Simple file edits
- ❌ Documentation changes
- ❌ Configuration updates
- ❌ Non-executable code

## Tips

1. **Be specific** - "Extract user validation logic" vs "refactor this"
2. **Trust the process** - Let the agent analyze first
3. **Review impact** - Pay attention to risk scores
4. **Start small** - Break large refactorings into steps
5. **Use checkpoints** - Safety nets prevent disasters

## Troubleshooting

**Agent not showing up?**
```bash
/agents  # Should list refactoring-expert
/plugin list  # Verify plugin is installed
```

**MCP server not connected?**
```bash
/mcp status
claude mcp add --transport stdio refactogent -- npx -y @refactogent/mcp-server
```

**Not being used automatically?**
- Mention "refactor" explicitly in your request
- Or invoke directly: "Use the refactoring-expert to..."

## Contributing

Contributions welcome! See [CONTRIBUTING.md](../../CONTRIBUTING.md)

## License

MIT - see [LICENSE](../../LICENSE)

## Support

- 🐛 [Report Issues](https://github.com/khaliqgant/refactogent/issues)
- 💡 [Feature Requests](https://github.com/khaliqgant/refactogent/discussions)
- 📖 [Documentation](https://github.com/khaliqgant/refactogent#readme)

---

**Made with ❤️ for the Claude Code community**
