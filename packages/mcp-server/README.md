# @refactogent/mcp-server

> Model Context Protocol server for AI-powered refactoring with safety guardrails

Transform how you refactor code with AI! This MCP server provides AI assistants (Claude, GPT, etc.) with powerful tools for **safe, intelligent refactoring** of your codebase.

## 🎯 What is this?

This is an [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that gives AI assistants superpowers for refactoring:

- 🔍 **Deep codebase analysis** with dependency mapping
- 🛡️ **Safety checkpoints** with automatic rollback
- 🧪 **Validation workflows** (tests, linting, type checking)
- 📊 **Impact analysis** showing blast radius of changes
- 🤖 **AI-powered suggestions** using Claude (Anthropic) or GPT (OpenAI)

**The key insight**: Modern AI is already amazing at understanding and modifying code. This MCP server provides the **safety guardrails** and **structured workflows** to make refactoring risk-free.

## 🚀 Quick Start

### Installation

```bash
npm install -g @refactogent/mcp-server
```

### Configuration

#### Option 1: Claude (Anthropic)

Add to your Claude Code configuration (`~/.config/claude/mcp.json`):

```json
{
  "mcpServers": {
    "refactogent": {
      "command": "npx",
      "args": ["-y", "@refactogent/mcp-server"],
      "env": {
        "ANTHROPIC_API_KEY": "${ANTHROPIC_API_KEY}",
        "AI_PROVIDER": "anthropic"
      }
    }
  }
}
```

#### Option 2: OpenAI (GPT)

```json
{
  "mcpServers": {
    "refactogent": {
      "command": "npx",
      "args": ["-y", "@refactogent/mcp-server"],
      "env": {
        "OPENAI_API_KEY": "${OPENAI_API_KEY}",
        "AI_PROVIDER": "openai"
      }
    }
  }
}
```

#### Option 3: Without AI Suggestions (Recommended for Claude Code)

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

> **Note**: Only the `refactor_suggest` tool requires an AI API key. **If you're using refactogent with Claude or another AI assistant, you don't need the API key** - the AI can analyze code itself using `refactor_context` instead of calling `refactor_suggest`. The API key is only needed for standalone CLI usage of `refactor_suggest`.

###  Why Does the MCP Server Need Its Own API Key? (Spoiler: You Probably Don't!)

**TL;DR**: If you're using Claude or another AI assistant, **you don't need an API key**. The API key is only for the `refactor_suggest` tool, which is redundant when an AI is already in the loop.

#### When You DON'T Need an API Key

✅ Using with Claude Code / Claude Desktop
✅ Using with any AI assistant via MCP
✅ AI can read code and suggest refactorings itself using `refactor_context`

#### When You DO Need an API Key

❌ Using `refactor_suggest` from CLI directly (without an AI)
❌ Want refactogent to generate suggestions autonomously

#### Technical Details

The MCP server runs as a **separate Node.js process**:

```
┌─────────────────┐
│   Claude Code   │ ← Already has AI + your API key
└────────┬────────┘
         │ MCP Protocol
         ↓
┌─────────────────┐
│ Refactogent MCP │ ← refactor_suggest would call AI again (redundant!)
└─────────────────┘
```

The `refactor_suggest` tool was designed for standalone CLI use, but when Claude is already analyzing your code, it's redundant to call another AI API.

### Set API Key (Optional, for AI suggestions)

For Anthropic/Claude:
```bash
export ANTHROPIC_API_KEY="sk-ant-..."
export AI_PROVIDER="anthropic"  # Optional, default
export ANTHROPIC_MODEL="claude-3-5-sonnet-20241022"  # Optional, default
```

For OpenAI/GPT:
```bash
export OPENAI_API_KEY="sk-..."
export AI_PROVIDER="openai"
export OPENAI_MODEL="gpt-4-turbo-preview"  # Optional, default
```

The API key is **only required** for the `refactor_suggest` tool. All other tools work without it.

## 🛠️ Available Tools

All tools for comprehensive refactoring workflows:

| Tool | Purpose | Requires API Key |
|------|---------|-----------------|
| `refactor_context` | Analyze codebase structure and dependencies | No |
| `refactor_analyze` | **NEW!** Get opinionated refactoring suggestions based on static analysis | No |
| `refactor_checkpoint` | Create safety rollback points (git stash) | No |
| `refactor_validate` | Run tests, linting, type checking | No |
| `refactor_impact` | Analyze blast radius of changes | No |
| `refactor_suggest` | ~~AI-powered suggestions~~ (deprecated, use `refactor_analyze`) | Yes |
| `refactor_execute_safe` | Safely execute changes with auto-rollback | No |
| `refactor_dependency_trace` | Trace import/dependency chains | No |
| `refactor_test_coverage` | Analyze real test coverage | No |

### 1. `refactor_context` - Analyze Codebase

Get a comprehensive understanding of your codebase structure.

**Use when**: You need to understand dependencies, complexity, or test coverage before refactoring.

```typescript
// Example AI interaction:
User: "Analyze the src/components directory"

AI uses refactor_context:
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

### 2. `refactor_analyze` - Get Opinionated Refactoring Suggestions

**NEW!** Analyze code for refactoring opportunities based on static analysis metrics.

**Use when**: You want objective, data-driven suggestions on what needs refactoring. Perfect for Claude or other AI assistants to understand where to focus.

```typescript
User: "What should I refactor in src/services?"

AI uses refactor_analyze:
{
  "path": "src/services"
}

// Returns: Prioritized opportunities based on:
// - File size (>300 lines = warning)
// - Function length (>50 lines = warning)
// - Function complexity (>10 = warning)
// - Class size (>15 methods = warning)
```

**Returns**:
- List of refactoring opportunities sorted by severity (high/medium/low)
- Specific locations (file, line numbers, symbol names)
- Metrics (current value vs threshold)
- Actionable suggestions for each opportunity
- Effort and impact estimates
- Overall recommendations

**Example Output**:
```
🔴 HIGH: Function 'processPayment' is very complex
  File: src/services/payment.ts
  Lines: 45-180
  Complexity: 25 (threshold: 10)
  💡 Suggestion: Break into smaller functions using early returns...
  Effort: ⏰⏰ medium | Impact: 💥💥💥 high

🟡 MEDIUM: File is getting large
  File: src/services/user.ts
  Size: 380 lines (threshold: 300)
  💡 Suggestion: Extract related functions into separate modules...
```

**Why use this instead of refactor_suggest?**
- No API key needed
- Based on objective metrics (not AI hallucination)
- Consistent, repeatable results
- Fast (pure static analysis)
- Perfect for guiding AI on what to refactor

---

### 3. `refactor_checkpoint` - Create Safety Rollback Point

Create a git stash checkpoint before making changes.

**Use when**: You're about to make significant changes and want the ability to rollback.

```typescript
User: "Create a checkpoint before I refactor the auth system"

AI uses refactor_checkpoint:
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

AI uses refactor_validate:
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

AI uses refactor_impact:
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

Use AI (Claude or GPT) to analyze code and suggest intelligent refactorings.

**Use when**: You want AI-generated refactoring suggestions for a file.

**Requires**: `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` environment variable

```typescript
User: "Suggest refactorings for this file focused on types"

AI uses refactor_suggest:
{
  "file": "src/utils/helpers.ts",
  "focus": "types",
  "maxSuggestions": 5
}

// AI analyzes the file and returns prioritized suggestions
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

### 6. `refactor_execute_safe` - Safely Execute Refactoring

Execute refactoring changes with automatic checkpoint creation, validation, and rollback on failure. This is the AI's best friend for applying code changes safely.

**Use when**: You need to apply multiple file changes with built-in safety guarantees.

```typescript
User: "Rename UserService to UserManager across the codebase"

AI uses refactor_execute_safe:
{
  "changes": [
    {
      "filePath": "src/services/UserService.ts",
      "operation": "update",
      "newContent": "export class UserManager { ... }"
    },
    {
      "filePath": "src/index.ts",
      "operation": "update",
      "newContent": "import { UserManager } from './services/UserService';"
    }
  ],
  "description": "Rename UserService to UserManager",
  "autoRollback": true
}

// Automatically:
// 1. Creates a checkpoint
// 2. Applies all changes
// 3. Runs tests, linting, type checking
// 4. Rolls back if any validation fails
```

**Parameters**:
- `changes` - Array of file operations (update, create, delete)
- `description` - Human-readable description of the refactoring
- `skipValidation` - Skip validation after applying changes (default: false)
- `autoRollback` - Auto-rollback on validation failure (default: true)
- `skipTests`, `skipLint`, `skipTypeCheck` - Fine-tune validation steps

**Operations**:
- `update` - Modify an existing file
- `create` - Create a new file
- `delete` - Delete a file

**Returns**:
- Success status
- Checkpoint ID
- Number of applied changes
- Validation results
- Rollback status if failed

**Safety Features**:
- ✅ Automatic checkpoint before changes
- ✅ Atomic operations (all or nothing)
- ✅ Full validation suite
- ✅ Auto-rollback on failure
- ✅ Clear error messages

---

### 7. `refactor_dependency_trace` - Trace Dependencies

Trace forward and backward dependencies for a file. Shows import chains, what depends on this file, circular dependencies, and unused imports/exports. Essential for understanding impact.

**Use when**: You need to understand the full dependency tree before making changes.

```typescript
User: "Show me everything that depends on UserService.ts"

AI uses refactor_dependency_trace:
{
  "targetFile": "src/services/UserService.ts",
  "direction": "backward",
  "maxDepth": 3,
  "includeUnused": true
}

// Returns complete dependency chains
```

**Parameters**:
- `targetFile` - File to trace dependencies for
- `direction` - "forward" (imports), "backward" (dependents), or "both" (default: "both")
- `maxDepth` - Maximum depth to trace (default: 3)
- `includeUnused` - Include unused imports/exports analysis (default: true)

**Direction Options**:
- `forward` - What this file imports (dependencies)
- `backward` - What imports this file (dependents)
- `both` - Complete picture of all relationships

**Returns**:
- **Forward Dependencies**: Files and symbols this file imports
  - Full import chains with depth tracking
  - Imported symbols at each level
  - Transitive dependencies

- **Backward Dependencies**: Files that import this file
  - Direct dependents
  - Transitive dependents (files that depend on your dependents)
  - Complete impact tree

- **Circular Dependencies**: Detected cycles with severity levels
  - Low: Simple 2-file cycles
  - Medium: 3-4 file cycles
  - High: Complex 5+ file cycles

- **Unused Analysis** (when enabled):
  - Unused imports (imported but never used)
  - Unused exports (exported but never imported elsewhere)
  - Cleanup recommendations

- **Summary**:
  - Total files affected
  - Risk assessment
  - Refactoring recommendations

**Example Output**:
```
# Dependency Trace: UserService.ts

Direction: both
Total Files Affected: 23

This file has 5 forward dependencies and 18 backward dependencies.
This file is heavily depended upon - refactor with caution.

## Forward Dependencies (What This File Imports)
  - DatabaseService (query, transaction)
    - ConnectionPool (getConnection)
      - ConfigService (getDatabaseConfig)

## Backward Dependencies (What Imports This File)
  - UserController
    - AuthController
      - AppRouter
  - UserRepository
  - AdminService
  ... and 15 more

## ⚠️ Circular Dependencies Found
- [medium] UserService → RoleService → PermissionService → UserService

## Unused Imports
- lodash.debounce from 'lodash/debounce'
- OldHelper from './helpers/old'
```

---

### 8. `refactor_test_coverage` - Analyze Test Coverage

Analyze REAL test coverage using actual coverage tools (Jest, c8, etc). Shows line/branch/function coverage, uncovered regions, test-to-code ratio, and specific recommendations.

**Use when**: You need to verify test coverage before or after refactoring changes.

```typescript
User: "What's the test coverage for the services directory?"

AI uses refactor_test_coverage:
{
  "targetPath": "src/services",
  "generateReport": false,
  "threshold": 80
}

// Runs coverage tools and analyzes results
```

**Parameters**:
- `targetPath` - Specific file or directory to analyze (default: project root)
- `generateReport` - Generate detailed HTML coverage report (default: false)
- `threshold` - Minimum coverage percentage required for validation (optional)

**How It Works**:
1. Detects available coverage tools (Jest, c8, nyc, etc.)
2. Runs coverage analysis using `npm run test:coverage` or similar
3. Parses coverage reports (Istanbul/NYC JSON format)
4. Analyzes coverage data by file
5. Generates actionable recommendations

**Fallback Mode**:
If no coverage tools are detected, provides:
- Heuristic analysis based on test file count
- Setup instructions for Jest/c8
- Quick start guide

**Returns**:
- **Overall Coverage**: Average coverage percentage
- **Line Coverage**: Percentage of lines covered by tests
- **Branch Coverage**: Percentage of branches (if/else) covered
- **Function Coverage**: Percentage of functions covered
- **Test-to-Code Ratio**: Ratio of test files to source files
  - \> 0.5 = Good
  - 0.2-0.5 = Fair
  - < 0.2 = Needs improvement

**Per-File Breakdown**:
- Coverage percentage per file
- Uncovered regions (line ranges not covered)
- Specific recommendations for each file

**Threshold Validation**:
When threshold is specified:
- `meetsThreshold: true/false` - Whether coverage meets requirement
- Useful for validation gates in refactoring workflows

**Recommendations**:
- Files with < 50% coverage (prioritized)
- Files with zero coverage (critical)
- Specific line ranges needing tests
- Overall testing strategy suggestions

**Example Output**:
```
# Test Coverage Report ✅

Target: src/services
Overall Coverage: 78.5%
Meets Threshold: ❌ No (requires 80%)

## Coverage Metrics
- Line Coverage: 78.5%
- Branch Coverage: 72.3%
- Function Coverage: 85.2%
- Test-to-Code Ratio: 0.65 (Good)

## Files Analyzed (8)
❌ UserService.ts: 45.2% (15 uncovered regions)
⚠️ AuthService.ts: 68.9% (5 uncovered regions)
✅ DatabaseService.ts: 92.1%
✅ CacheService.ts: 88.7%
... and 4 more files

## Recommendations
- UserService.ts has less than 50% coverage. Prioritize adding tests.
- 2 file(s) need more branch coverage for edge cases.
- Consider testing error paths in AuthService.ts lines 45-67.
```

**Integration Example**:
```typescript
// Use with refactor_execute_safe for coverage-gated refactoring:
{
  "changes": [...],
  "description": "Refactor UserService",
  "skipTests": false  // Will run coverage as part of validation
}

// Or run standalone before refactoring:
1. refactor_test_coverage to get baseline
2. Make changes
3. refactor_test_coverage again to verify coverage maintained
```

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

AI:
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

AI:
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

AI:
1. Reads refactogent://project-health resource
2. Uses refactor_suggest with focus='all' on each file
3. Prioritizes high-impact, low-risk suggestions
4. Applies refactorings incrementally
5. Validates continuously
```

### Safe Multi-File Refactoring

```
User: "Rename UserService to UserManager everywhere"

AI:
1. Uses refactor_dependency_trace to find all dependent files
2. Reports: "Found 15 files that import UserService"
3. Uses refactor_execute_safe to:
   - Create automatic checkpoint
   - Update all 15 files
   - Run full test suite
   - Auto-rollback if anything fails
4. Success! All changes applied safely
```

### Coverage-Gated Refactoring

```
User: "Refactor the payment processing code but maintain 80% coverage"

AI:
1. Uses refactor_test_coverage with threshold=80 (baseline)
2. Reports: "Current coverage: 82.3%"
3. Uses refactor_execute_safe to apply refactoring
4. Validation runs tests with coverage
5. If coverage drops below 80%, auto-rolls back
6. Reports: "Refactoring complete. Coverage: 83.1%"
```

### Circular Dependency Cleanup

```
User: "Find and fix circular dependencies in src/"

AI:
1. Uses refactor_dependency_trace on each file
2. Reports: "Found 3 circular dependency chains"
3. Visualizes the cycles
4. Uses refactor_suggest for resolution strategies
5. Applies fixes using refactor_execute_safe
6. Validates with refactor_dependency_trace again
7. Reports: "All circular dependencies resolved"
```

---

## 🔧 Configuration

### Environment Variables

Create a `.env` file or export these variables:

```bash
# AI Provider Configuration (Optional - only for refactor_suggest tool)
AI_PROVIDER=anthropic              # or "openai"
ANTHROPIC_API_KEY=sk-ant-...       # If using Anthropic/Claude
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022  # Optional, default shown
OPENAI_API_KEY=sk-...              # If using OpenAI/GPT
OPENAI_MODEL=gpt-4-turbo-preview   # Optional, default shown

# Optional limits
MAX_SUGGESTIONS=10
MAX_FILES_TO_ANALYZE=1000

# Optional safety settings
AUTO_ROLLBACK=true
REQUIRE_TESTS=true
```

### MCP Client Configuration Examples

#### Claude Desktop

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
        "ANTHROPIC_API_KEY": "sk-ant-...",
        "AI_PROVIDER": "anthropic"
      }
    }
  }
}
```

#### Other MCP Clients

The same configuration works with any MCP-compatible client. Just ensure the `AI_PROVIDER` and corresponding API key are set.

---

## 🏗️ Architecture

### How It Works

```
┌─────────────┐
│  AI Client  │  ← User asks for refactoring help
│ (Claude/GPT)│     (Claude, GPT, or any MCP client)
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
       └─ refactor_suggest ───┐          │
              │                │         │
              │                ▼         │
              │         ┌──────────────┐ │
              │         │  AI Provider │ │
              │         │ Claude / GPT │ │
              │         └──────────────┘ │
              ▼                          ▼
       ┌─────────────────────────────────────┐
       │     @refactogent/core               │
       │  (AST Analysis, Indexing, etc.)     │
       └─────────────────────────────────────┘
```

**Key Principle**: Refactogent doesn't try to do refactoring itself. Instead, it:
1. **Provides context** to AI assistants about the codebase
2. **Enforces safety** through checkpoints and validation
3. **Structures workflows** with clear steps and gates
4. **Augments intelligence** by calling AI providers (Claude/GPT) for suggestions

---

## 🎓 Philosophy

Traditional refactoring tools try to be smart about *what* to refactor. This MCP server does something different:

**Modern AI is already smart.** LLMs like Claude and GPT understand code better than any static analysis tool.

What AI assistants need is:
- ✅ Deep context about the codebase
- ✅ Safety mechanisms (checkpoints, validation)
- ✅ Structured workflows (analyze → plan → validate → rollback)
- ✅ Impact analysis (what breaks if I change this?)

That's what this MCP server provides. Think of it as **training wheels for refactoring** - not because AI isn't smart enough, but because refactoring should be **safe and structured**.

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
