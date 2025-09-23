# RefactoGent: Phased Plan for Project‑Aware Code Intelligence (Post‑Big‑Dev)

> Goal: Evolve RefactoGent from “smart refactorer” to a **project‑aware engineering copilot** with deep repo understanding, reliable edits, and measurable quality guarantees.

---

## Outcomes & Guardrails
- **Primary outcomes**
  - Accurate retrieval of relevant code, tests, and docs across large repos.
  - Safer code transformations with automated verification (tests, type checks, static analysis).
  - Lower hallucination via dependency‑aware retrieval and strict grounding.
  - Repeatable evals demonstrating improved precision/recall and refactor safety.
- **Non‑goals (for now)**: Fine‑tuning base LLMs; broad IDE parity; speculative “rewrite entire service” actions.
- **Guardrails**: No write operations to default branch; changes must pass gating pipeline (lint, typecheck, tests, risk checks); explicit user diff review.

---

## Success Metrics (tracked per phase)
- **R@K / MRR@K** for retrieval on benchmark queries.
- **Change Safety Rate**: % of suggested diffs that pass CI gates.
- **Edit Acceptance Rate**: % of PRs merged w/o rework.
- **Latency** (P50/P95) for: first‑token, completion, end‑to‑end (query→diff).
- **Grounding Score**: % generations with all symbols/API calls verified in repo.

---

## Architecture at a Glance
```
User Intent → Task Planner → Retrieval Orchestrator → Context Packager → LLM(s)
                                           ↘ Code Graph ↙
             Repo Ingestor → Embedding Store → Snippetizer → Safety Gate → PR
```

---

## Phase 0 — Stabilize & Instrument (2–3 weeks)
**Objective:** Make the current system measurable and safe to evolve.
- **Work**
  - Add tracing (OpenTelemetry) around: retrieval hits/misses, tokens, timing, model/version, repo size.
  - Central config: `refactogent.yaml` for repo‑level rules (paths to ignore, style, test cmds, risk thresholds).
  - Introduce **Safety Gate v0**: lint + typecheck + unit tests; block writes on failure; record artifact logs.
  - Add red‑team prompts + logging for grounding failures.
- **Deliverables**: dashboards (Grafana/Datadog), YAML schema, CI job templates, red‑team suite v0.
- **Exit criteria**: baseline metrics captured on 10+ repos.

---

## Phase 1 — Ingestion & Embeddings v1 (3–4 weeks)
**Objective:** Build a scalable indexing pipeline for large repos.
- **Work**
  - Language‑aware **chunking/snippetizer** (AST‑guided when possible). Separate code vs docs vs configs.
  - Multi‑index: **symbol index** (defs/refs), **semantic index** (embeddings), **text index** (BM25/keyword).
  - Incremental indexing: file watchers or `git diff` streams; debounce; backfills.
  - Storage: vector DB (Faiss/pgvector) + Postgres for metadata; content‑hash dedup.
- **Deliverables**: `ingestor` service; CLI `refacto index`; indexing metrics (QPS, lag, coverage).
- **Exit criteria**: Full repo index < 30 min for 100k LOC; incremental updates < 5s for single‑file edits.

---

## Phase 2 — Code Graph v1 (3 weeks)
**Objective:** Build a dependency & reference graph to power precise retrieval.
- **Work**
  - Parse imports, inheritance, call sites, symbol defs/refs across supported languages (start: TS/JS, Python; add Go/Java later).
  - Persist as a property graph (e.g., SQLite/PG tables or lightweight graph DB). Edges: `imports`, `calls`, `inherits`, `tests`, `touches-config`.
  - Graph APIs: get neighborhood by file/symbol; impact analysis; test‑mapping.
- **Deliverables**: `codegraph` module + API; graph visual debug.
- **Exit criteria**: For a changed symbol, retrieve all dependent files & mapped tests with ≥ 0.9 recall in eval set.

---

## Phase 3 — Retrieval Orchestrator & Context Packing (3–4 weeks)
**Objective:** Combine semantic + lexical + graph retrieval to build **tight, relevant** prompts.
- **Work**
  - Hybrid retrieval: BM25 prefilter → embeddings rerank → graph expansion (+k hops, capped by token budget).
  - **Grounding checks**: resolve symbols to canonical paths; drop snippets that conflict; prefer test+impl pairs.
  - Prompt packer: role‑segmented context (constraints, repo policies, style guide, APIs) + minimal working set.
  - Add **reference citations** into the prompt (file:path#line) for auditability and UX hover in IDE.
- **Deliverables**: `retriever` and `context-packer` services; sampling evaluator scripts.
- **Exit criteria**: +25% MRR@10 vs embeddings‑only; prompt sizes kept < target token budget with no performance loss.

---

## Phase 4 — Planner & Multi‑Tool Agents (3 weeks)
**Objective:** Turn intents into constrained plans with tool usage and verifications.
- **Work**
  - Intent classifier: refactor/edit/explain/test‑gen/doc‑gen/migration.
  - Planner LLM that emits a plan graph: steps with tools (search, read, edit, run tests, typecheck, format).
  - Deterministic executors for tools; all edits are patch‑sets (unified diff); idempotent retries.
  - Speculative parallelism: run retrieval + typecheck in parallel where safe.
- **Deliverables**: `planner` + `tool-exec` modules; structured run logs.
- **Exit criteria**: 90% of intents map to valid tool plans on benchmark set; rollback safety verified.

---

## Phase 5 — Safer Edits & Verification (4 weeks)
**Objective:** Raise confidence that generated diffs don’t break things.
- **Work**
  - **Edit validators**: syntax, lints, types, `danger` rules (e.g., don’t delete exports used elsewhere), secret scanners.
  - Test strategy: auto‑locate impacted tests via code graph; if missing, **generate focused tests** (property‑based where possible) and run.
  - Runtime smoke: ephemeral container runs for simple CLIs/services; contract tests for API changes.
  - Risk scoring: change size, touched critical paths, test deltas; route high‑risk to manual review.
- **Deliverables**: `safety-gate v1`, PR annotations, failing‑case corpus.
- **Exit criteria**: +30% Change Safety Rate; <5% post‑merge breakages on pilot repos.

---

## Phase 6 — Product UX (2–3 weeks)
**Objective:** Tight IDE/CLI flow with transparency.
- **Work**
  - **Context preview**: show what the model sees (files, lines, symbols) with toggle to exclude/include.
  - Diff sandbox with inline rationales and citations; quick “re‑ground” button to refresh retrieval.
  - `refacto plan` (dry‑run) to preview steps and risk before edit.
- **Deliverables**: VS Code & Cursor extension surfaces; CLI TUI.
- **Exit criteria**: P95 time to usable diff < 60s on median tasks; positive UX feedback from pilots.

---

## Phase 7 — Scaling & Caching (2 weeks)
**Objective:** Handle large repos & repeated tasks efficiently.
- **Work**
  - Response caching keyed by (intent, query, repo‑state‑hash, packer‑signature).
  - Warm shards: pre‑compute embeddings for hot paths; shard by package/module.
  - Batch inference for retrieval rerank and doc‑gen; multiplexing where available.
- **Deliverables**: cache layer; shard manager; cost dashboards.
- **Exit criteria**: 40% cost reduction for common workflows; stable P95 latency under load.

---

## Phase 8 — Policy, Privacy & Compliance (1–2 weeks)
**Objective:** Enterprise‑ready controls.
- **Work**
  - Data residency flags; per‑repo redaction rules; opt‑out files.
  - PII & secret filtering at ingest and pre‑prompt.
  - Access control via repo provider (GitHub App, GitLab, local‑only mode).
- **Deliverables**: policy engine; admin config UI.
- **Exit criteria**: SOC2‑friendly logs; access violations = 0 in tests.

---

## Phase 9 — Evaluation & Benchmarks (ongoing, first push 2 weeks)
**Objective:** Prove it works and keeps working.
- **Work**
  - Create **RefactoBench**: curated tasks per language (rename symbol, extract method, migrate API, upgrade lib, tighten types, add tests).
  - Golden repos (OSS) with deterministic CI; seeded failure cases.
  - Nightly evals; regression alerts; publish scorecards.
- **Deliverables**: datasets, harness, dashboards.
- **Exit criteria**: Documented lift vs baseline for each phase; no regressions >2% without justification.

---

## Phase 10 — Rollout & GTM (1–2 weeks)
**Objective:** Pilot → GA with feature flags.
- **Work**
  - Pilot cohorts (5–10 teams); feedback loops; pricing experiments.
  - Feature flags per capability; safe feature degradation when systems down.
- **Deliverables**: release notes; onboarding guides; success stories.
- **Exit criteria**: Target adoption metrics, NPS ≥ 40 among pilot users.

---

## Implementation Notes
- **Language support order**: TS/JS → Python → Go → Java → Ruby.
- **Model policy**: prefer latest GPT‑class for planning; smaller local/hosted models for rerankers and linters; keep model abstraction layer.
- **Storage**: start with Postgres + pgvector; abstract behind DAO to swap later.
- **Testing**: heavy use of containerized fixtures; snapshot‑based diff checks.

---

## Risks & Mitigations
- **Index drift** → aggressive incremental indexing; repo‑state hash in cache keys; periodic full reindex.
- **Prompt bloat** → strict token budgeter; rerankers; hierarchical summaries.
- **Hallucination** → grounding checks; reject generations referencing non‑existent symbols.
- **Cost creep** → batch rerank, cache hits, distillation for common tasks.
- **Slow CI** → selective test running from code graph; flaky test quarantine.

---

## Deliverable Checklist (by end of plan)
- [ ] Ingestor + multi‑index + incremental updates
- [ ] Code graph with APIs and tests mapping
- [ ] Retrieval orchestrator + packer with audits
- [ ] Planner + tool exec with rollback
- [ ] Safety gate v1 with PR annotations
- [ ] UX surfaces (IDE + CLI) with context preview
- [ ] Eval harness + RefactoBench + dashboards
- [ ] Policy & privacy controls

---

## Appendix A — Minimal Data Schemas
**Snippet**: `{ id, repo_id, relpath, lang, hash, start, end, kind, tokens, embedding[] }`

**Symbol**: `{ id, name, kind, file, span, lang }`

**Edges**: `{ src_symbol_id, dst_symbol_id, type, evidence }`

**Retrieval Log**: `{ run_id, query, candidates[], selected[], reasons, token_budget }`

---

## Appendix B — CLI Sketch
```
refacto index                # full or incremental (detects)
refacto query "migrate X"    # shows context pack + plan (dry run)
refacto plan --apply         # executes plan → diffs
refacto test --impacted      # runs mapped tests only
refacto eval --suite core    # nightly benchmarks
```

