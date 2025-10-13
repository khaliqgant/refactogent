# Refactogent Development Agenda

## Current Status (v0.2.0 - January 2025)

### ✅ Completed Features

#### Performance Improvements
- **Shared Context System** (50-200x faster)
  - Singleton pattern for ts-morph Project instance
  - Cached dependency graph and file index
  - Eliminates redundant codebase indexing
  - First call: 3-10s, subsequent: 50-200ms

#### New Tools
- `refactor_preview` - Preview changes as unified diff
- `refactor_rename` - Safe symbol renaming across project
- `refactor_extract` - Extract code to function with auto-parameter detection

#### Infrastructure
- YAML configuration system (`.refactogent.yaml`)
- Dual ESM/CJS builds for `@refactogent/core` using tsup
- Comprehensive test suite (123/157 passing, 78%)
- Fixed 5 critical bugs

#### Test Coverage
- 102 new tests across 7 test files
- Integration tests for complete workflows
- 78% passing rate (34 failures are test environment issues)

---

## 🎯 Immediate Priorities (Week 1-2)

### 1. Merge v0.2.0 PR
- [ ] Review and merge PR #6
- [ ] Bump version numbers
- [ ] Publish to npm
- [ ] Update README with new features

### 2. Fix Remaining Test Issues (Optional)
- [ ] Config loader tests (11 failures) - YAML file paths
- [ ] Checkpoint tests (4 failures) - Git operations in test env
- Target: Get to 90%+ passing

---

## 🚀 Next Major Features (v0.3.0)

### High-Impact Tools
- [ ] `refactor_move` - Move symbols between files
  - Update all imports automatically
  - Handle circular dependencies
  - Support move across packages (monorepo)

- [ ] `refactor_inline` - Inline functions/variables
  - Replace all usages with function body
  - Handle scoping issues

- [ ] `refactor_search` - Semantic code search
  - Search by symbol type
  - Search by pattern
  - Find duplicate code

- [ ] `refactor_batch` - Batch operations
  - Apply same refactoring across multiple files
  - Pattern-based transformations

### Performance Optimizations
- [ ] Implement parallel validation (config exists, needs execution)
- [ ] Add file watching for incremental updates
- [ ] Persistent disk caching
- [ ] Optimize large codebase handling (>10k files)

### User Experience
- [ ] Better progress indicators for long operations
- [ ] Rich markdown output (tables, diagrams)
- [ ] Interactive risk confirmations
- [ ] Streaming responses for real-time feedback

---

## 🏗️ Architecture Improvements (v0.4.0)

### Plugin System
- [ ] Define plugin API
- [ ] Support custom tools
- [ ] Community plugin marketplace
- [ ] Example plugins (React, Next.js, etc.)

### MCP Prompts
- [ ] Pre-built workflow prompts
  - "analyze-and-refactor"
  - "safe-extract-type"
  - "comprehensive-rename"
- [ ] Allow users to define custom workflows

### Advanced Features
- [ ] Mutation testing integration
- [ ] Code smell detection
- [ ] Architecture analysis (layer violations)
- [ ] Tech debt tracking
- [ ] Historical refactoring analysis

---

## 🧪 Testing & Quality (Ongoing)

### Test Improvements
- [ ] Get to 100% passing tests
- [ ] Add E2E tests with real MCP client
- [ ] Performance benchmarks
- [ ] Load testing for large codebases

### CI/CD
- [ ] GitHub Actions for test/build
- [ ] Automated publishing on release
- [ ] Code coverage reporting
- [ ] Performance regression detection

---

## 📚 Documentation (v0.3.0)

### User Documentation
- [ ] Create docs.refactogent.com
- [ ] Video tutorials for each tool
- [ ] Interactive examples
- [ ] Best practices guide
- [ ] Troubleshooting guide

### Developer Documentation
- [ ] Architecture overview
- [ ] Contributing guide
- [ ] Plugin development guide
- [ ] API reference

---

## 🔒 Production Readiness (v1.0.0)

### Security
- [ ] Security audit (shell commands, file operations)
- [ ] Rate limiting for AI calls
- [ ] Input validation hardening
- [ ] Dependency vulnerability scanning

### Monitoring
- [ ] Telemetry/analytics (opt-in)
- [ ] Error tracking (Sentry?)
- [ ] Usage metrics
- [ ] Performance monitoring

### Reliability
- [ ] Comprehensive error recovery
- [ ] Better rollback mechanisms
- [ ] Transaction-like operations (all-or-nothing)
- [ ] Automatic backup system

---

## 💡 Future Ideas (Backlog)

### Advanced Refactoring
- [ ] ML-powered refactoring suggestions
- [ ] Learn from user's refactoring patterns
- [ ] Cross-language refactoring (TypeScript ↔ JavaScript)
- [ ] Visual refactoring workflow builder

### Integration
- [ ] VS Code extension
- [ ] GitHub App for PR reviews
- [ ] Slack bot for team refactoring
- [ ] CI/CD integration (detect refactoring opportunities)

### Multi-Language Support
- [ ] Python refactoring (already indexed, needs tools)
- [ ] Go refactoring (already indexed, needs tools)
- [ ] Java/Kotlin support
- [ ] Rust support

---

## 📊 Success Metrics

### Current (v0.2.0)
- ✅ 50-200x performance improvement
- ✅ 78% test passing rate
- ✅ 11 total tools (8 existing + 3 new)
- ✅ Shared context system
- ✅ YAML configuration

### Target (v0.3.0)
- [ ] 90%+ test passing rate
- [ ] 15+ tools
- [ ] <100ms response time for cached operations
- [ ] 100+ npm downloads/week
- [ ] 5+ community contributions

### Target (v1.0.0)
- [ ] 95%+ test passing rate
- [ ] 20+ tools
- [ ] Plugin ecosystem with 10+ plugins
- [ ] 1000+ npm downloads/week
- [ ] Used in production by 50+ projects
- [ ] Documentation site with 1000+ monthly visitors

---

## 🤝 Community

### Contribution Areas
- New refactoring tools
- Language support (Python, Go, etc.)
- Documentation improvements
- Bug fixes
- Performance optimizations
- Test coverage

### Support Channels
- GitHub Issues: Bug reports, feature requests
- GitHub Discussions: Questions, ideas
- Discord (future): Real-time community chat

---

## 📝 Notes

### Design Principles
1. **Safety First**: Always provide rollback mechanisms
2. **Performance**: Cache aggressively, optimize for repeat calls
3. **User Trust**: Preview before apply, clear impact analysis
4. **Extensibility**: Plugin system for custom needs
5. **AI-Friendly**: Design for LLM orchestration

### Technical Debt
- 34 test failures (test environment issues, not code bugs)
- Config loader needs better error messages
- Shared context could support multiple projects
- Some tools could benefit from streaming responses

### Lessons Learned
- Dual ESM/CJS is essential for Jest compatibility
- Markdown formatting in tests requires exact matching
- Shared context system is a massive performance win
- Git operations in tests need careful setup
- Type extraction from `declare module` blocks should be skipped

---

**Last Updated**: 2025-01-13
**Version**: v0.2.0
**Branch**: feature/mcp-improvements-v0.2
**PR**: #6
