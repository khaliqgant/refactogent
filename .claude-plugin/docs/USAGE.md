# Refactogent Plugin Usage Guide

This plugin adds a specialized **Refactoring Expert** agent to Claude Code that knows how to use refactogent's MCP tools effectively for safe, intelligent code refactoring.

## Installation

### 1. Install the Plugin

```bash
# In Claude Code
/plugin marketplace add khaliqgant/refactogent
```

Or install locally:

```bash
cd /path/to/your/project
git clone https://github.com/khaliqgant/refactogent .claude-plugin/refactogent
```

### 2. Configure the MCP Server

The plugin requires the refactogent MCP server to be configured in your Claude Code settings.

**Automatic (Recommended):**

```bash
claude mcp add --transport stdio refactogent -- npx -y @refactogent/mcp-server
```

**Manual Configuration:**

Edit `~/.claude/config.json`:

```json
{
  "mcpServers": {
    "refactogent": {
      "command": "npx",
      "args": ["-y", "@refactogent/mcp-server"]
    }
  }
}
```

### 3. Verify Installation

In Claude Code:

```
/agents
```

You should see `refactoring-expert` in the list of available agents.

## Using the Refactoring Expert Agent

### Automatic Invocation

Claude will automatically delegate refactoring tasks to the expert agent when appropriate:

```
You: "Extract the types from src/services/user.ts"
Claude: [Automatically uses refactoring-expert agent]
```

### Explicit Invocation

Force the agent to handle a task:

```
"Use the refactoring-expert to refactor the authentication module"
```

### When to Use

The refactoring expert is ideal for:

- **Type extraction** - Moving interfaces/types to separate files
- **Function extraction** - Breaking up large functions
- **Class refactoring** - Splitting or reorganizing classes
- **Symbol renaming** - Safely renaming across files
- **Code simplification** - Reducing complexity
- **Impact analysis** - Understanding change blast radius
- **Safe execution** - Changes with automatic rollback

## Example Tasks

### Basic Type Extraction

```
"Extract types from src/services/auth.ts to a separate .types.ts file"
```

The agent will:
1. Analyze the file with `refactor_context`
2. Check impact with `refactor_impact`
3. Create safety checkpoint
4. Extract and reorganize types
5. Update imports
6. Validate with tests

### Complex Refactoring

```
"Refactor the UserService class - it's too complex and needs to be split"
```

The agent will:
1. Analyze complexity and dependencies
2. Get refactoring suggestions
3. Show you the impact and risk score
4. Create checkpoint before changes
5. Split the class incrementally
6. Validate after each step
7. Auto-rollback if anything breaks

### Impact Analysis

```
"What would be the impact of changing the database connection interface?"
```

The agent will:
1. Run impact analysis
2. Show all dependent files
3. Calculate risk score
4. Provide dependency chain visualization
5. Suggest safest refactoring approach

### Risk Assessment

```
"Suggest safe refactorings for src/core/"
```

The agent will:
1. Analyze the directory
2. Identify refactoring opportunities
3. Prioritize by impact and risk
4. Recommend starting points

## Agent Capabilities

### Tools Available to the Agent

The refactoring expert has access to:

**Refactogent MCP Tools:**
- `refactor_context` - Deep code analysis
- `refactor_impact` - Blast radius calculation
- `refactor_dependency_trace` - Dependency mapping
- `refactor_suggest` - AI refactoring suggestions
- `refactor_checkpoint` - Git safety points
- `refactor_validate` - Test/lint/type checking
- `refactor_execute_safe` - Safe execution with rollback
- `project-health` - Codebase health metrics

**Standard Tools:**
- `Read`, `Write`, `Edit` - File operations
- `Bash` - Running commands
- `Grep`, `Glob` - Code search

### Agent Behavior

The agent follows a systematic workflow:

1. **Context First** - Always analyzes before acting
2. **Impact Aware** - Checks blast radius before changes
3. **Safety Focused** - Creates checkpoints automatically
4. **Validation Driven** - Runs tests after changes
5. **Incremental** - Makes small, verifiable changes
6. **Communicative** - Explains impact and risks

## Best Practices

### Let the Agent Lead

The refactoring expert knows the proper workflow. Trust it to:
- Analyze context before suggesting changes
- Create safety checkpoints
- Validate after changes
- Rollback if needed

### Provide Clear Context

Help the agent by being specific:

❌ "Refactor this file"
✅ "Extract the user authentication logic from auth.ts into a separate module"

❌ "Make this better"
✅ "Reduce the complexity of the validateUser function - it has too many branches"

### Review Impact Reports

When the agent shows you impact analysis:
- Read the risk score
- Check the list of affected files
- Approve high-risk changes explicitly
- Ask questions if unclear

### Start Small

For large refactorings:
```
"I want to refactor the entire services/ directory. What's the safest approach?"
```

The agent will break it down into manageable steps.

## Troubleshooting

### Agent Not Available

```bash
# Check agents list
/agents

# If missing, verify plugin installation
/plugin list

# Reinstall if needed
/plugin marketplace add khaliqgant/refactogent
```

### MCP Server Not Connected

```bash
# Check MCP server status
/mcp status

# Add refactogent server if missing
claude mcp add --transport stdio refactogent -- npx -y @refactogent/mcp-server

# Restart Claude Code
/restart
```

### Agent Not Being Used

If Claude isn't delegating to the agent automatically:

1. Mention refactoring explicitly: "Refactor X..."
2. Invoke directly: "Use the refactoring-expert to..."
3. Check that the task is code-related (not docs/config)

### Validation Failures

If refactor_validate fails:

1. Agent will show you the errors
2. It will attempt to fix simple issues
3. For complex issues, it will rollback
4. You can retry with a different approach

## Advanced Usage

### Custom Checkpoints

```
"Create a checkpoint named 'before-auth-refactor', then extract types from auth.ts"
```

### Incremental Validation

```
"Refactor user.ts but validate after each logical change"
```

### Dependency Exploration

```
"Show me the dependency chain for the Database class"
```

### Health Check

```
"What's the health status of the codebase? What should we refactor first?"
```

## Integration with Development Workflow

### Pre-Commit Refactoring

Before committing, use the agent to clean up:

```
"Review and refactor the files I'm about to commit"
```

### Code Review Prep

```
"Prepare this feature branch for code review - extract types and simplify complex functions"
```

### Technical Debt Reduction

```
"Identify and fix the top 3 technical debt issues in src/"
```

### Safe Experimentation

```
"I want to try refactoring this differently - create a checkpoint first"
```

## Tips for Maximum Effectiveness

1. **Be Specific** - Clear requests get better results
2. **Trust the Process** - The agent follows proven workflows
3. **Review Impact** - Always check the blast radius
4. **Iterate** - Refactor incrementally, not all at once
5. **Use Checkpoints** - Safety nets are your friend
6. **Validate Often** - Catch issues early
7. **Ask Questions** - The agent can explain its reasoning

## Example Workflow

Here's a complete refactoring session:

```
You: "I want to refactor src/services/payment.ts - it's getting too complex"

Agent: "Let me analyze the payment service..."
[Uses refactor_context]
- Found 347 lines, complexity score: 82/100 (Very High)
- 15 functions, longest is 89 lines
- Used by 8 other files

"Let me check the impact of refactoring this..."
[Uses refactor_impact]
- 8 dependent files
- Risk score: 62/100 (Medium-High)

"Here are my suggested refactorings:
1. Extract payment validation to separate module (Risk: Low)
2. Split processPayment function (Risk: Medium)
3. Extract payment provider interface (Risk: Low)

Shall I start with #1 (lowest risk)?"

You: "Yes, start with validation extraction"

Agent: "Creating safety checkpoint..."
[Uses refactor_checkpoint]
- Checkpoint: pre-payment-validation-extract

"Extracting validation logic..."
[Makes changes with Edit tool]
- Created src/services/payment-validation.ts
- Moved 5 validation functions
- Updated 3 imports in payment.ts

"Validating changes..."
[Uses refactor_validate]
- ✓ All tests pass (89/89)
- ✓ TypeScript check passed
- ✓ No linting errors

"Successfully extracted payment validation! Complexity reduced from 82 to 71.
Ready to continue with #2?"
```

## Getting Help

- Report issues: https://github.com/khaliqgant/refactogent/issues
- Documentation: https://github.com/khaliqgant/refactogent#readme
- Discussions: https://github.com/khaliqgant/refactogent/discussions

## See Also

- [Refactogent CLI](../../packages/cli/README.md)
- [Refactogent MCP Server](../../packages/mcp-server/README.md)
- [Core Library](../../packages/core/README.md)
