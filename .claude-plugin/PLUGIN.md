# Refactogent Claude Code Plugin

This directory contains the Claude Code plugin configuration for Refactogent, making it easy for anyone to use Refactogent's intelligent refactoring capabilities within Claude Code.

## Quick Start

### Option 1: Install as Plugin (Recommended)

If you want to use Refactogent as a Claude Code plugin:

1. **Install the Refactogent plugin**:
   ```bash
   # From this repository
   claude plugin install /path/to/refactogent

   # Or from a published marketplace (coming soon)
   claude plugin install refactogent
   ```

2. **The plugin will automatically**:
   - Register the Refactoring Specialist sub-agent
   - Configure the MCP server connection
   - Make all refactoring tools available to Claude

3. **Start using it**:
   ```bash
   # Invoke the agent
   /agent refactoring-specialist

   # Or just ask Claude
   "Can you help me refactor src/services/UserService.ts safely?"
   ```

### Option 2: Manual MCP Server Setup

If you just want the MCP server without the full plugin:

```bash
# Install globally
npm install -g @refactogent/mcp-server

# Add to Claude Code
claude mcp add --transport stdio refactogent -- npx -y @refactogent/mcp-server
```

## What You Get

### Refactoring Specialist Agent

A specialized AI agent that focuses on safe, intelligent code refactoring:
- **Safety-first approach** with automatic checkpoints and rollback
- **Deep analysis** of dependencies and impact before changes
- **Automated validation** running tests, linting, and type checking
- **Multi-language support** for TypeScript, JavaScript, Python, and Go

Access it with: `/agent refactoring-specialist`

### MCP Server Tools

The plugin configures access to these refactoring tools:
- `refactor_context` - Analyze codebase structure and dependencies
- `refactor_checkpoint` - Create git safety points with rollback
- `refactor_validate` - Run automated validation workflows
- `refactor_impact` - Calculate blast radius of changes
- `refactor_execute_safe` - Apply changes with auto-rollback
- `refactor_dependency_trace` - Map forward/backward dependencies
- `refactor_test_coverage` - Analyze coverage with recommendations
- `refactor_find_dead_code` - Detect unused code and exports
- `refactor_analyze` - Get opinionated improvement suggestions

## Plugin Structure

```
refactogent/
└── .claude-plugin/
    ├── plugin.json              # Plugin manifest
    ├── mcp-config.json          # MCP server configuration
    ├── agents/                  # Sub-agent definitions
    │   └── refactoring-specialist.md
    └── PLUGIN.md               # This file
```

## Example Workflows

### Safe Type Extraction
```
User: "Extract types from src/components/Dashboard.tsx"

Agent:
1. Analyzes Dashboard.tsx and its dependencies
2. Creates a git checkpoint for safety
3. Extracts interfaces/types to Dashboard.types.ts
4. Updates imports in all dependent files
5. Runs validation (tests, lint, typecheck)
6. Auto-rolls back if anything fails
```

### Impact Analysis Before Refactoring
```
User: "What would break if I change the AuthService?"

Agent:
1. Traces all AuthService dependencies
2. Shows 34 affected files
3. Calculates risk score (High: 87/100)
4. Provides dependency graph
5. Suggests incremental approach
```

### Code Quality Improvements
```
User: "Improve code quality in src/services"

Agent:
1. Analyzes all service files
2. Finds dead code in 8 files
3. Identifies 12 high-complexity functions
4. Detects 15 unused exports
5. Prioritizes fixes by impact
6. Applies changes incrementally with validation
```

## Publishing to Marketplace

To share this plugin with the community:

1. **Ensure package is published to npm**:
   ```bash
   cd packages/mcp-server
   npm publish
   ```

2. **Create a plugin repository** (if separate from main repo):
   ```bash
   git clone https://github.com/khaliqgant/refactogent.git refactogent-plugin
   cd refactogent-plugin
   # Keep only: .claude-plugin/, LICENSE, README.md
   ```

3. **Submit to Claude Code marketplace** (instructions coming soon)

4. **Or share directly**:
   ```bash
   # Users can install from GitHub
   claude plugin install github:khaliqgant/refactogent
   ```

## Configuration

### Custom MCP Server Path

If you're developing locally, you can point to a local MCP server:

```json
{
  "mcpServers": {
    "refactogent": {
      "command": "node",
      "args": ["/absolute/path/to/refactogent/packages/mcp-server/build/index.js"]
    }
  }
}
```

### Environment Variables

The MCP server respects these environment variables:
- `ANTHROPIC_API_KEY` - Only needed for `refactor_suggest` tool (optional when using with Claude)
- `REFACTOGENT_LOG_LEVEL` - Set to `debug` for verbose logging

## Troubleshooting

### Plugin Not Loading
```bash
# Check plugin status
claude plugin list

# Reload plugins
claude plugin reload

# Check logs
claude logs
```

### MCP Server Not Connecting
```bash
# Test the MCP server directly
npx @refactogent/mcp-server

# Or use the MCP Inspector
npx @modelcontextprotocol/inspector npx -y @refactogent/mcp-server
```

### Agent Not Available
```bash
# List available agents
/agents

# Verify plugin installed correctly
claude plugin list
```

## Development

To modify the plugin:

1. **Edit agent definition**:
   ```bash
   # Edit .claude-plugin/agents/refactoring-specialist.md
   # Update capabilities, examples, etc.
   ```

2. **Test locally**:
   ```bash
   # Install from local path
   claude plugin install .

   # Test the agent
   /agent refactoring-specialist
   ```

3. **Update version**:
   ```bash
   # In .claude-plugin/plugin.json and package.json
   # Follow semver
   ```

## Learn More

- **Main Documentation**: [README.md](./README.md)
- **MCP Server Docs**: [packages/mcp-server/README.md](./packages/mcp-server/README.md)
- **CLI Docs**: [packages/cli/README.md](./packages/cli/README.md)
- **Contributing**: [CONTRIBUTING.md](./CONTRIBUTING.md)

## Support

- Report issues: https://github.com/khaliqgant/refactogent/issues
- Discussions: https://github.com/khaliqgant/refactogent/discussions
- Security: See [SECURITY.md](./SECURITY.md)

---

**Built with ❤️ for the Claude Code community**
