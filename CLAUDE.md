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

Override with `--data-path=<path>` on any entry point.

## Shared Config

The MCP server writes `config.json` on startup. CLI and TUI read it so the email directory does not need to be passed on every invocation after first run.

## Project Hierarchy

```
src/
├── server.ts                  # MCP server entry point
├── cli.ts                     # CLI entry point
├── constants/
│   ├── paths.ts               # Data directory path helpers (~/.eml/*)
│   └── version.ts             # Package version constant
├── types/
│   ├── email.types.ts         # ParsedEmail, EmailHeader, SearchFilters
│   ├── index.types.ts         # IndexEntry, index DB row shape
│   ├── service.types.ts       # Services, ServerConfig interfaces
│   └── error.types.ts         # MCP error helpers (toMcpSuccess/toMcpError)
├── services/
│   ├── email-parser.ts        # .eml → ParsedEmail (mailparser)
│   ├── index-service.ts       # SQLite FTS index (search, upsert, refresh)
│   ├── filesystem-service.ts  # Inbox/outbox/drafts file discovery
│   ├── attachment-service.ts  # Attachment extraction and temp-file handling
│   └── email-composer.ts      # Compose/reply .eml files
├── tools/
│   ├── email-tools.ts         # MCP tools: search_emails, get_email, compose_email, …
│   ├── index-tools.ts         # MCP tools: refresh_index
│   └── attachment-tools.ts    # MCP tools: extract_attachments, open_attachment
└── tui/
    ├── index.tsx              # TUI entry point — arg parsing, bootstrap
    ├── types/
    │   └── workflow.types.ts  # WorkflowConfigSchema, LogEntry, WorkflowRunStats
    ├── hooks/
    │   ├── useIndexWatcher.ts # Polls inbox, runs matching workflows, emits log
    │   └── useWorkflows.ts    # Loads and validates workflow JSON files
    ├── services/
    │   ├── workflow-runner.ts # buildPreamble, processEmail — spawns claude in wt
    │   ├── processed-store.ts # Tracks already-processed message IDs
    │   └── config-store.ts    # Reads/writes ~/.eml/config.json
    ├── components/
    │   ├── Dashboard.tsx      # Root TUI layout, tab navigation (log / workflows)
    │   ├── LogPanel.tsx       # Scrolling activity log with spinner
    │   ├── WorkflowsPanel.tsx # Workflow detail cards (keywords, stats, directory)
    │   └── WorkflowNamesPanel.tsx # Compact workflow name list (sidebar)
    └── utils/
        └── relative-time.ts   # toRelative() — human-friendly elapsed time
```

## Dev Scripts

```bash
npm run dev          # tsx src/server.ts (MCP server)
npm run dev:tui -- "<email-dir>"   # TUI against a live directory
npm run dev:cli      # CLI via tsx
```
