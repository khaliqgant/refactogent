# Refactogent Feature Roadmap - Based on Real Usage Feedback

Prioritized list of features that would genuinely speed up refactoring with AI assistants like Claude.

## High Priority - Quick Wins

### 1. ✅ refactor_analyze (COMPLETED)
Static analysis-based suggestions - file size, complexity, function length
**Status**: Shipped in v0.2

### 2. 🚧 refactor_rename - Batch Multi-File Renaming
**Problem**: Renaming across 25 files requires 25 Edit tool calls
**Solution**: One tool call to rename symbol across entire codebase
**Speed Gain**: 25x (1 call vs 25)
**Priority**: HIGH - solves immediate pain point

```typescript
refactor_rename({
  symbol: "getStatusColor",
  newName: "getThemeStatusColor",
  scope: "workspace", // or "file"
  updateImports: true,
  updateTests: true
})
```

**Note**: `refactor_rename` tool already exists! Just needs better integration and testing.

### 3. 🎯 refactor_extract_function - AST-Based Function Extraction
**Problem**: Text-based extract is fragile, breaks easily
**Solution**: AST-aware extraction with auto-parameter detection
**Speed Gain**: 10x vs manual
**Priority**: HIGH - core refactoring operation

```typescript
refactor_extract_function({
  file: "StatusPanel.tsx",
  selection: { startLine: 234, endLine: 272 },
  newFunction: {
    name: "NotificationIcon",
    extractParams: true,
    location: "same_file" // or new file path
  }
})
```

**Note**: `refactor_extract` tool already exists! Just needs enhancement for parameter extraction.

### 4. 🔍 refactor_find_dead_code - Unused Code Detection
**Problem**: Don't know what's safe to delete
**Solution**: Entry-point based reachability analysis
**Speed Gain**: 2x (confident deletion)
**Priority**: MEDIUM - high value, moderate complexity

```typescript
refactor_find_dead_code({
  entryPoints: ["src/index.tsx"],
  includeTests: true
})

// Returns: unused exports, unreachable code, safe-to-remove list
```

---

## Medium Priority - High Impact

### 5. 📋 refactor_pattern - Refactoring Pattern Library
**Problem**: Reinventing common refactorings
**Solution**: Pre-built patterns for common operations
**Speed Gain**: 5x (one-liner vs multi-step)
**Priority**: MEDIUM - needs pattern catalog

Initial patterns:
- `extract_react_hook` - Pull state/effects into custom hook
- `component_composition` - Split monolithic component
- `extract_interface` - Generate TS interfaces from usage
- `consolidate_conditional` - Simplify nested if/else

### 6. 🔮 refactor_preview - Impact Preview Before Changes
**Problem**: Don't see what breaks until after changes
**Solution**: Dry-run with breaking change detection
**Speed Gain**: 3x (no trial-and-error)
**Priority**: MEDIUM - complex but valuable

```typescript
refactor_preview({
  changes: [
    { file: "helpers.ts", operation: "change_signature",
      function: "getStatusColor", newParams: ["status", "theme"] }
  ],
  showBreakingChanges: true
})

// Returns: will-break list, auto-fixable count, test impact
```

**Note**: `refactor_preview` tool already exists! Just needs signature change detection.

### 7. 🧪 refactor_generate_tests - Auto Test Generation
**Problem**: Writing tests after refactoring is tedious
**Solution**: Generate tests based on actual usage patterns
**Speed Gain**: 4x
**Priority**: MEDIUM - nice to have

---

## Lower Priority - Advanced Features

### 8. 📚 refactor_execute_recipe - Multi-Step Refactoring Plans
**Problem**: Complex refactorings have many steps to track
**Solution**: Atomic multi-step operations with rollback
**Priority**: LOW - cool but complex

Example recipes:
- `extract_service_layer` - Move logic to service class
- `add_error_handling` - Wrap operations with try/catch
- `migrate_to_composition` - Replace inheritance

### 9. 🔥 refactor_smell_analysis - Historical Code Smell Detection
**Problem**: Don't know which code is actually problematic
**Solution**: Git history + churn analysis
**Priority**: LOW - research needed

Detects:
- High-churn files (many changes = problematic)
- Bug magnets (frequent fixes)
- God components (too many responsibilities)

### 10. 🔎 refactor_semantic_search - Behavioral Code Search
**Problem**: Can only search text, not behavior
**Solution**: AST-based semantic pattern matching
**Priority**: LOW - research project

### 11. 📅 refactor_plan_incremental - Incremental Refactoring Scheduler
**Problem**: Big refactorings are risky
**Solution**: Break into safe, ordered steps
**Priority**: LOW - interesting but niche

---

## Implementation Strategy

### Phase 1: Core Refactoring Operations (Q2 2025)
- [x] refactor_analyze (shipped)
- [ ] Enhance refactor_rename (tool exists, needs docs)
- [ ] Enhance refactor_extract (tool exists, needs param extraction)
- [ ] Enhance refactor_preview (tool exists, needs signature detection)
- [ ] refactor_find_dead_code (NEW)

**Goal**: Cover 80% of daily refactoring needs

### Phase 2: Pattern Library (Q3 2025)
- [ ] refactor_pattern infrastructure
- [ ] 5 common patterns (React hooks, component split, etc.)
- [ ] Enhanced preview with breaking change detection

**Goal**: Make complex refactorings repeatable

### Phase 3: Advanced Analysis (Q4 2025)
- [ ] refactor_generate_tests
- [ ] refactor_smell_analysis (historical)
- [ ] refactor_execute_recipe

**Goal**: Proactive refactoring assistance

### Phase 4: Research (2026)
- [ ] refactor_semantic_search
- [ ] refactor_plan_incremental

**Goal**: Push boundaries of automated refactoring

---

## Key Principles

1. **AST over Text**: Semantic transformations, not find/replace
2. **Atomic Operations**: All-or-nothing with rollback
3. **Real Metrics**: Base decisions on actual data (complexity, churn, etc.)
4. **AI-Friendly**: Tools that guide AI decisions, not replace them
5. **Fast**: 10x speed improvement minimum

---

## Contributing

Interested in building these features?

1. Check existing tools - many are already implemented!
2. See individual GitHub issues for each feature
3. Read [CONTRIBUTING.md](./CONTRIBUTING.md)
4. Share your refactoring pain points!

---

**Feedback from actual users drives this roadmap.** If you have refactoring workflows that are slow or tedious, please open an issue!
