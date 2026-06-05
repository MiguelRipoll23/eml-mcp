# Agents

## Project Overview

`eml-mcp` is an MCP server for managing email archives stored as `.eml` files. It provides AI assistants full read/write access to inbox, sent items, and drafts through a structured set of tools.

## Tech Stack

- **Runtime**: Node.js 20+ with ESM modules
- **Language**: TypeScript (ES2022, NodeNext module resolution)
- **Database**: sql.js (SQLite via WASM) for FTS4 full-text search index
- **Email parsing**: mailparser
- **Email composition**: nodemailer
- **Testing**: vitest
- **Package manager**: npm

## Project Structure

```
eml-mcp/
├── src/
│   ├── server.ts              # Entry point — MCP server setup, tool registration, CLI args
│   ├── constants/
│   │   └── paths.ts           # Default paths (db, email directories)
│   ├── services/
│   │   ├── attachment-service.ts   # Attachment extraction and shell-open
│   │   ├── email-composer.ts       # RFC 2822 email builder using nodemailer
│   │   ├── email-parser.ts         # .eml parser with LRU cache via mailparser
│   │   ├── filesystem-service.ts   # Safe-path enforcement and directory walk
│   │   └── index-service.ts        # sql.js FTS4 index with upsert/delete
│   ├── tools/
│   │   ├── attachment-tools.ts     # extract_attachments, open_attachment, search_attachments
│   │   ├── email-tools.ts          # search_emails, get_email, compose_email, update_email, open_email, delete_email
│   │   └── index-tools.ts          # refresh_index
│   └── types/
│       ├── email.types.ts
│       ├── error.types.ts
│       ├── index.types.ts
│       └── service.types.ts
├── tests/                     # Vitest test files
├── dist/                      # Compiled output (gitignored)
└── package.json
```

## Key Design Decisions

- **Email directories**: Must contain `inbox/`, `outbox/`, and `drafts/` subdirectories (created on first run)
- **Index**: Stored at `~/.eml-mcp/index.db` by default; uses SQLite FTS4 for full-text search
- **Draft workflow**: `compose_email` creates a `.eml` file and opens it in the default mail client; `update_email` modifies existing drafts while preserving threading headers
- **Threading**: `inReplyTo` and `references` RFC 2822 headers are preserved through compose/update cycles
- **Inline images**: `get_email` can replace `cid:` references with base64 data URIs for rendering

## Commands

- `npm run build` — compile TypeScript to `dist/`
- `npm run dev` — start dev server with tsx
- `npm test` — run tests with vitest
- `npm run test:watch` — run tests in watch mode
- `npm start` — run compiled server

## Code Conventions

- All imports use `.js` extension (ESM requirement with NodeNext resolution)
- Services are instantiated in `server.ts` and passed to tool handlers
- Tool definitions live in `src/tools/` — each file exports a function that registers tools on the MCP server
- Types are centralized in `src/types/`
- Error handling uses custom error classes from `error.types.ts`

## Release Workflow

1. Go to Actions → "Bump version" → Run workflow
2. Pick channel: `stable`, `beta`, or `alpha`
3. A draft PR will be created on `version/x.y.z`
4. Review and merge the PR (with `new-release` label)
5. Publishing to npm happens automatically

