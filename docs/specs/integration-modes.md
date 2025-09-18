# Refactogent — Alternative Integration Modes (No GitHub App Required)

## Local‑Only IDE Mode
- Runs entirely offline; generates patches in `.refactogent/out/`.
- Supports VS Code and JetBrains plugins via JSON-RPC (`refactogent --lsp`).

## CLI Workflow
```bash
refactogent stabilize --routes 10
refactogent plan --mode organize-only
refactogent patch --out ./.refactogent/out
```

## Git Hooks
- Pre-commit: run name hygiene & tests-first only.
- Fails if characterization cannot be established.

## CI Without App
- PAT mode, deploy key mode, or Actions workflow-only with `GITHUB_TOKEN`.
- Other forges supported via plain `git` + REST.

## Review Server (Optional)
- Localhost web UI to preview diffs/artifacts/logs.
- No data leaves machine unless user opts in.

> **Note:** These integration modes are incorporated into the [unified specification](../../.kiro/specs/refactogent-unified/). This file is kept for reference.