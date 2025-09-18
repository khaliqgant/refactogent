# Refactogent Starter (CLI + VS Code Extension)

This is a minimal scaffold to run Refactogent locally (no GitHub App required).

## What's inside
- `cli/`: A TypeScript CLI with safe commands:
  - `stabilize`, `plan`, `apply`, `patch`, `revert`, and `lsp` (JSON-RPC stub)
- `vscode-extension/`: A VS Code extension that shells out to the CLI
  - Commands: Stabilize, Organize Only, Name Hygiene, Micro‑Simplify, Show Public Surface Map

## Quick start
```bash
# Install dependencies (CLI + Extension)
cd cli && npm install && npm run build

# Try the CLI
node dist/index.js --help
node dist/index.js plan --mode organize-only
node dist/index.js patch --out ./.refactogent/out

# Pack the VS Code extension
cd ../vscode-extension
npm install
npm run compile
# Load the extension folder in VS Code using "Run -> Start Debugging" or package with vsce (optional)
```

## Notes
- All edits are local. The CLI writes output to `./.refactogent/out/` and/or a new branch `refactor/<slug>`.
- The LSP server is a simple JSON‑RPC stub for IDE integration; expand as you add real functionality.
