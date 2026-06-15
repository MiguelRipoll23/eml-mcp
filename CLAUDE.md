# eml-mcp

Email MCP server with CLI and TUI for managing `.eml` files.

## Entry Points

| Command | Source | Description |
|---------|--------|-------------|
| `eml-mcp` | `src/server.ts` | MCP server (used by Claude Desktop) |
| `eml` / `eml-tui` | `src/tui/index.tsx` | Terminal UI — watch, run workflows |
| `eml-cli` | `src/cli.ts` | CLI utility — refresh index, stats |

## Build

**Always run `npm run build` after making changes** — not just `npx tsc --noEmit`.  
`npm run build` compiles TypeScript (`tsc`) and runs `npm link`, which updates the globally linked `eml` bin so the command immediately uses the new code.

```bash
npm run build   # compile + re-link eml bin
npm test        # run vitest suite
```

## Data Directory

All runtime data lives under a single configurable base path (default `~/.eml`):

| Path | Contents |
|------|----------|
| `~/.eml/index.db` | SQLite full-text search index |
| `~/.eml/config.json` | Saved email directory path |
| `~/.eml/workflows/` | Workflow JSON definitions |
| `~/.eml/prompts/` | Prompt templates |

Override with `--data-path=<path>` on any entry point, or set `EML_HOME` env var.

## Shared Config

The MCP server writes `config.json` on startup. CLI and TUI read it so the email directory does not need to be passed on every invocation after first run.

## Dev Scripts

```bash
npm run dev          # tsx src/server.ts (MCP server)
npm run dev:tui -- "<email-dir>"   # TUI against a live directory
npm run dev:cli      # CLI via tsx
```
