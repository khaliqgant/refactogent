# Refactogent — Product & Technical Spec (v1.0)

**Owner:** You  
**Target repos:** GitHub (via GitHub App)  
**Primary goals:** Safe, incremental, reviewable refactors with *strong* guarantees that behavior is unchanged.  
**Non‑goals:** End‑to‑end feature development, risky rewrites, or merges without human visibility.

---

## 1) Design Principles & Safety Guarantees

1. **Safety first, always.**
   - Never push to default branches. Create short‑lived branches via a GitHub App.
   - Never merge unless: build ✅, tests ✅, characterization tests ✅, and policy gates ✅.
2. **Characterize before you change.**
   - For every targeted unit/API, the agent first generates **characterization tests** (golden/master tests) capturing current behavior.
3. **Small, auditable diffs.**
   - Max 200–400 LOC per PR, single purpose per PR (configurable).
4. **No coverage regressions.**
   - PRs must keep or increase line+branch coverage relative to base.
5. **Stateless refactors.**
   - No side‑effects beyond text edits; no dependency upgrades unless explicitly allowed.
6. **Deterministic pipelines.**
   - Every action is reproducible in a hermetic container; same inputs produce same outputs.

> **Hard rule:** The agent **never** bypasses guards. If any gate fails, it abandons the change and opens an issue with debug context instead of creating/merging a PR.

---

## 2) Architecture (High‑Level)

```
┌──────────────────────┐
│   GitHub App (Auth)  │  Webhooks: push, PR, check_run
└─────────┬────────────┘
          │
          ▼
┌──────────────────────┐   ┌──────────────────────┐
│ Orchestrator/Planner │◀──│ Policy Engine        │ (YAML rules)
└─────────┬────────────┘   └──────────────────────┘
          │
          ▼
┌──────────────────────┐   ┌──────────────────────┐   ┌──────────────────────┐
│ Repo Mapper/Index    │   │ Static Analyzer      │   │ Test Synthesizer     │
│ (treesitter+embeds)  │   │ (LSP/linters/AST)    │   │ (char/unit/property) │
└─────────┬────────────┘   └─────────┬────────────┘   └─────────┬────────────┘
          │                          │                          │
          ▼                          ▼                          ▼
┌────────────────────────────────────────────────────────────────────────────┐
│            Refactor Executor (LLM+AST) + Edit Planner (diffs)              │
└─────────┬───────────────────────────────────────────────────┬──────────────┘
          │                                                   │
          ▼                                                   ▼
┌──────────────────────┐                           ┌─────────────────────────┐
│ Validator            │  build/test/mutation      │ PR Bot (GitHub Checks) │
│ (build, tests, SEM)  │──────────────────────────▶│ Comments, labels, gates│
└─────────┬────────────┘                           └─────────┬───────────────┘
          │                                                 │
          ▼                                                 ▼
   If all green:                                    Human review & merge
   Auto‑label "safe‑merge" (optional)
```

**Core components**
- **GitHub App**: auth + least‑privilege permissions; branch & PR creation; status checks.
- **Orchestrator**: task selection, chunking, retries, backoff, and state.
- **Repo Mapper/Index**: builds a symbol map + embedding index; supports impact analysis.
- **Static Analyzer**: LSP servers & linters; language‑aware AST diffs.
- **Test Synthesizer**: characterization, regression and property‑based tests.
- **Refactor Executor**: LLM + AST transforms; plans small, reversible edits.
- **Validator**: hermetic build, full test run, **semantic equivalence** harness (SEM).
- **PR Bot**: explains intent, risks, diffs, and adds checklists & artifacts.

---

*[Rest of the original specification content continues...]*

> **Note:** This is the original specification. See the [unified specification](../../.kiro/specs/refactogent-unified/) for the current implementation plan.