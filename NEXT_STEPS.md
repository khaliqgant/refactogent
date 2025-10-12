# Next Steps: Testing the MCP Server

## Local Development Testing

### 1. Build the MCP Server
```bash
cd packages/mcp-server
npm run build
```

### 2. Test with MCP Inspector
```bash
npm run test:inspector
```

This will:
- Build the server
- Launch the MCP Inspector UI
- Allow you to test each tool interactively

### 3. Manual Testing with npx
```bash
# From the project root
npx packages/mcp-server/build/index.js
```

## Integration Testing with Claude Code

### Option 1: Local Development (Recommended)

Add to your `~/.config/claude/mcp.json`:

```json
{
  "mcpServers": {
    "refactogent-dev": {
      "command": "node",
      "args": ["/absolute/path/to/refactogent/packages/mcp-server/build/index.js"],
      "env": {
        "ANTHROPIC_API_KEY": "${ANTHROPIC_API_KEY}"
      }
    }
  }
}
```

Replace `/absolute/path/to/refactogent` with your actual project path.

### Option 2: Test Published Package

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

## Testing Each Tool

### Test refactor_context
```
In Claude Code:
"Analyze the packages/core/src directory and show me the dependency structure"
```

Expected: File list, symbols, dependency graph, complexity metrics

### Test refactor_checkpoint
```
In Claude Code:
"Create a checkpoint before I start refactoring"
```

Expected: Checkpoint ID, timestamp, files tracked

### Test refactor_impact
```
In Claude Code:
"What's the impact of changing packages/core/src/indexing.ts?"
```

Expected: List of dependents, risk score, recommendations

### Test refactor_validate
```
In Claude Code (after making changes):
"Run validation checks and rollback if they fail"
```

Expected: Test results, lint results, type check status

### Test refactor_suggest
```
In Claude Code:
"Suggest refactorings for packages/cli/src/index.ts focused on complexity"
```

Expected: AI-generated suggestions with priorities and risk scores

### Test project-health resource
```
In Claude Code:
"What's the health score of this project?"
```

Expected: Claude reads the resource and reports overall health metrics

## Debugging

### Enable Verbose Logging
```bash
export DEBUG=mcp:*
```

### Check Server Stderr
The MCP server logs to stderr. In Claude Code, check the MCP logs:
- View → Developer → Show MCP Logs

### Common Issues

1. **"Tool not found"**: Server not registered correctly in mcp.json
2. **"Permission denied"**: Build file not executable - run `chmod +x build/index.js`
3. **"API key error"**: Only affects refactor_suggest, other tools work without it
4. **"Git errors"**: Checkpoint tools require git repository

## Production Testing Checklist

- [ ] All 5 tools respond correctly
- [ ] Project-health resource loads
- [ ] Checkpoint creation works in git repo
- [ ] Validation runs tests/lint/typecheck
- [ ] Impact analysis shows dependents
- [ ] Suggest tool works with API key
- [ ] Error handling for missing API key
- [ ] Error handling for non-git directories
- [ ] Large project performance (1000+ files)
- [ ] Works with TypeScript projects
- [ ] Works with JavaScript projects

## Next Steps After Testing

1. Fix any bugs found during testing
2. Add integration tests
3. Document edge cases
4. Publish to npm
5. Update README with real examples
6. Create video demo
