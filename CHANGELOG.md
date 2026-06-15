# Changelog

## v2.1.0-beta.1 - 2026-06-15

## What's Changed
* v2.2.0: CLI overhaul, TUI redesign, workflow enhancements, SQLite processed tracking by @MiguelRipoll23 in https://github.com/MiguelRipoll23/eml-mcp/pull/18
* Bump version to v2.1.0-beta.1 by @github-actions[bot] in https://github.com/MiguelRipoll23/eml-mcp/pull/19


**Full Changelog**: https://github.com/MiguelRipoll23/eml-mcp/compare/v2.0.0...v2.1.0-beta.1


## v2.2.0 - 2026-06-15

### Added
- **`eml-cli workflow` subcommands**: `list`, `get`, `create`, `update`, `delete`, `help` — full CRUD for workflow JSON files from the command line. `create` and `update` accept `--prompt=<text>` to write the prompt template to `~/.eml/prompts/<slug>.md` in the same operation.
- **citty** adopted as the CLI argument parsing library — replaces manual string parsing with typed, self-documenting command definitions and built-in `--help` output for every command and subcommand.
- **`emails_history` table in `index.db`**: processed email message IDs are now stored in the SQLite database (`messageId`, `processedAt`) instead of a separate `processed.json` file. The file is no longer created or read.

### Changed
- CLI commands renamed to kebab-case for consistency: `refresh_index` → `refresh-index`.
- Removed keyboard hints from the TUI header bar.

### Removed
- `processed.json` (`~/.eml/processed.json`) — superseded by the `emails_history` table in `index.db`.

---

## v2.1.0 - 2026-06-15

### Added
- **Manual workflow run**: In the Workflows tab, press `Enter` on a selected workflow to open an inline run dialog. Type or paste issue text (e.g. from a chat message), then press `Enter` to run the workflow without an email file. The typed text is used as the full preamble, replacing both the email-fetch preamble and any `preambleExtra`. Press `Escape` to cancel. Log entries and workflow stats update the same as auto-triggered runs.
- Workflows tab keyboard hints updated: `[tab/←→] switch  [↑↓] select  [enter] run`.
- Workflow config supports optional `preambleExtra` field to append workflow-specific context (e.g. "only process if addressed to me") to the injected preamble.
- **Workflows panel scroll**: ↑/↓ keys scroll through workflow cards when content exceeds terminal height; `↑ N more` / `↓ N more` indicators show when content is clipped.

### Changed
- TUI workflow runner now injects a structured preamble with the email filename before the rendered prompt, instructing Claude to locate the email via `search_emails` and retrieve full content via `get_email`.
- Preamble now filters by `folder: "inbox"` and `filePath` (filename only) instead of full file path; includes workflow keywords for related-email searches.
- Prompt files cleaned up — email-fetching boilerplate removed; files now contain only domain-specific instructions.
- `search_emails` now accepts a `filePath` filter (partial match) for looking up emails by filename or path.
- All workflow prompts updated to use MCP tools (`search_emails` + `get_email`) as the authoritative email source instead of relying solely on inline template-rendered content.
- Workflows panel now sorts workflows alphabetically by name.
- Renamed `conditions:` label to `keywords:` in the workflows panel.
- Keywords now wrap instead of truncating in the workflows panel.
- TUI split into two keyboard-navigable views (`log` / `workflows`) switched with Tab, left arrow, or right arrow.
- Log view shows only the activity log; workflows view shows the full detail panel.
- Workflow last-run times displayed as relative (e.g. `just now`, `5m ago`, `2h ago`, `yesterday`), refreshing every 30 s.
- Removed panel borders and titles; tab bar provides navigation context.
- Added blank line between header and content; left-aligned content with header.
- Added vertical spacing between workflow entries; removed bullet dash prefix.
- `log` tab label coloured pink when active; `workflows` tab label coloured blue when active.
- Workflow names coloured white; attribute labels (`keywords:`, `working directory:`, `last run:`) coloured blue; attribute values coloured green.
- TUI now uses ink's built-in `alternateScreen` option instead of manual ANSI escape sequences; terminal content is restored cleanly on exit.
- Terminal width now tracked live via `useWindowSize` — the TUI reflows correctly when the terminal is resized.
- All dependencies updated to latest versions (ink 7, React 19, nodemailer 9, zod 4, TypeScript 6, vitest 4, and more).

## v2.0.0 - 2026-06-15

## What's Changed
* feat: CLI and TUI by @MiguelRipoll23 in https://github.com/MiguelRipoll23/eml-mcp/pull/10
* Bump version to v2.0.0-beta.1 by @github-actions[bot] in https://github.com/MiguelRipoll23/eml-mcp/pull/11
* fix: remove EML_HOME env var, fix publish workflow trigger by @MiguelRipoll23 in https://github.com/MiguelRipoll23/eml-mcp/pull/12
* fix: update get-next-version to v3.2.0 by @MiguelRipoll23 in https://github.com/MiguelRipoll23/eml-mcp/pull/13
* Bump version to v2.0.0-beta.2 by @github-actions[bot] in https://github.com/MiguelRipoll23/eml-mcp/pull/14
* fix: add repository field for npm provenance by @MiguelRipoll23 in https://github.com/MiguelRipoll23/eml-mcp/pull/15
* Bump version to v2.0.0-beta.3 by @github-actions[bot] in https://github.com/MiguelRipoll23/eml-mcp/pull/16
* Bump version to v2.0.0 by @github-actions[bot] in https://github.com/MiguelRipoll23/eml-mcp/pull/17


**Full Changelog**: https://github.com/MiguelRipoll23/eml-mcp/compare/v1.3.0...v2.0.0


## v2.0.0-beta.3 - 2026-06-15

## What's Changed
* fix: add repository field for npm provenance by @MiguelRipoll23 in https://github.com/MiguelRipoll23/eml-mcp/pull/15
* Bump version to v2.0.0-beta.3 by @github-actions[bot] in https://github.com/MiguelRipoll23/eml-mcp/pull/16


**Full Changelog**: https://github.com/MiguelRipoll23/eml-mcp/compare/v2.0.0-beta.2...v2.0.0-beta.3


## v2.0.0-beta.2 - 2026-06-15

## What's Changed
* fix: remove EML_HOME env var, fix publish workflow trigger by @MiguelRipoll23 in https://github.com/MiguelRipoll23/eml-mcp/pull/12
* fix: update get-next-version to v3.2.0 by @MiguelRipoll23 in https://github.com/MiguelRipoll23/eml-mcp/pull/13
* Bump version to v2.0.0-beta.2 by @github-actions[bot] in https://github.com/MiguelRipoll23/eml-mcp/pull/14


**Full Changelog**: https://github.com/MiguelRipoll23/eml-mcp/compare/v2.0.0-beta.1...v2.0.0-beta.2


All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **CLI utility** (`eml-cli`): `refresh_index` and `stats` commands for headless operations — refreshing the email index and comparing on-disk vs indexed counts per folder.
- **Terminal UI** (`eml` / `eml-tui`): Ink-based interactive dashboard for watching email directories, running workflows, and managing `.eml` files directly from the terminal.
- **`search_emails`: `sortOrder` parameter**: accepts `"asc"` or `"desc"` (default `"desc"`), controlling whether results are returned newest-first or oldest-first. Applied to both plain and full-text keyword searches.
- **`search_emails`: `indexLastRefreshedAt` field**: the response now includes the ISO timestamp of the last time any email was indexed, so the caller can tell whether the index may be stale before relying on the results.

### Fixed

- **HTML-only `.eml` files not parsed (Outlook-exported emails)**: Outlook sometimes saves sent emails as raw HTML files with a `.eml` extension instead of proper MIME format. The parser now detects this case (file content starts with `<` and has no RFC 2822 headers) and wraps the content in a minimal MIME envelope so the HTML body is correctly extracted. Subject and date are recovered from the filename timestamp pattern `YYYY-MM-DD_HH-MM-SS__Subject.eml` when MIME headers are absent. This fixes both `get_email` (returned empty headers and no body) and `refresh_index` (indexed these files with epoch date `1970-01-01`, making them invisible to date-filtered searches).
- **Full name truncated when replying to Exchange emails**: display names in `APELLIDO, NOMBRE` format (e.g. `DOE SMITH, JANE ALICE`) were returned unquoted by `formatAddressText`, causing nodemailer's address parser to split on the comma and discard the surname tokens. `formatAddressText` now wraps names containing RFC 2822 special characters (`,`, `;`, `(`, `)`, `<`, `>`, etc.) in double quotes, preserving the full name through the compose pipeline.
- **Synthetic display name used instead of bare address**: some clients/servers populate the display name with the local-part of the address (e.g. `john.doe` for `john.doe@company.com`) or repeat the full address as the display name. `formatAddressText` now discards a display name that is identical to the local-part or the full address, returning just the bare address instead.
- **Outlook adds the user as a recipient when doing Reply All on a draft**: composed `.eml` drafts did not carry `X-Unsent: 1`, so Outlook opened them as received messages. When the user clicked Reply All, Outlook included the `From` address (the user's own address) as a new recipient. All drafts now include `X-Unsent: 1`, instructing Outlook to open the file directly in compose mode.

### Changed

- `formatDateLocal` now uses the server's runtime locale and timezone (`Intl.DateTimeFormat().resolvedOptions()`) instead of hardcoded `es-ES` / `Europe/Madrid`.
- `search_emails` results now include a `dateLocal` field formatted in the server's local locale and timezone.

---

## [1.3.0] - 2026-06-05

### Added

- **AGENTS.md**: project overview, codebase structure, and development guidelines.

---

## [1.2.0] - 2026-06-04

### Added

- **`get_email`: `embedInlineImages` parameter** (default `true`): replaces `cid:` image references in `htmlBody` with base64 data URIs, so inline images render correctly in any viewer without needing the original `.eml` file's attachment parts.
- **`compose_email`: `replyToFilePath` parameter**: appends the original email as a quoted HTML thread block (including its inline images embedded as base64 data URIs) at the bottom of the composed message, matching standard email-client reply formatting.
- **`parseForRecompose` captures inline attachments**: the parser now includes attachments with a `Content-ID` header (images embedded inline in HTML bodies) in the recompose attachment list, with CIDs normalised by stripping surrounding angle brackets.

### Changed

- `formatDateLocal` now uses the server's runtime locale and timezone (`Intl.DateTimeFormat().resolvedOptions()`) instead of hardcoded `es-ES` / `Europe/Madrid`.
- `search_emails` results now include a `dateLocal` field formatted in the server's local locale and timezone.

---

## [1.1.0] - 2026-06-01

### Added

- **Thread support** (`compose_email`, `update_email`): new `inReplyTo` and `references` fields in `ComposeOptions` and the `compose_email` MCP tool. Composing a reply now writes the correct `In-Reply-To` and `References` RFC 2822 headers, allowing email clients to group messages into threads.
- **`inReplyTo` and `references` in `EmailHeader`**: `get_email` now returns both threading headers from parsed emails, so a reply can be composed with the full reference chain.
- **`dateLocal` in `EmailHeader`**: `get_email` now includes a pre-formatted date string in `Europe/Madrid` timezone (e.g. `"lunes, 1 de junio de 2026, 12:37"`). This prevents day-of-week errors that occur when computing locale dates from a raw UTC ISO string.
- **Full name format in `to`/`cc`/`bcc`**: the parser now returns recipients in `"Name <email>"` format (same as `from`), preserving the display name from the email headers.
- **MCP annotations**: tool definitions now include `readOnlyHint`, `idempotentHint`, `openWorldHint`, and `destructiveHint` annotations for better client integration.
- **Nullable search result fields**: `fromAddress`, `toAddresses`, `ccAddresses`, `subject`, `date`, and `indexedAt` in search results are now nullable to handle incomplete index entries.

### Fixed

- **Line breaks in composed HTML**: `textToHtml` previously converted every `\n` to `<br>`, including RFC 2822 hard-wrap line breaks inserted by nodemailer at 76 characters. This caused mid-sentence line breaks in the HTML part of composed emails. Single newlines are now reflowed (joined with a space) and only blank lines produce paragraph breaks (`<p>` tags).

### Changed

- `compose_email` schema: `to`, `cc`, `bcc` descriptions updated to indicate `"Name <email>"` format is accepted.
- `update_email` preserves `inReplyTo` and `references` from the existing draft automatically.

---

## [1.0.0] - 2026-05-27

### Added

- `delete_email` tool: permanently deletes a `.eml` file from disk and removes it from the index.
- `extract_attachments` tool: unified extraction supporting single or all attachments (replaces the former `extract_attachment` and `extract_all_attachments`).
- `refresh_index` tool: full re-index of configured directories.
- `search_emails`, `get_email`, `compose_email`, `update_email`, `open_email` tools.
- `search_attachments`, `open_attachment` tools.
- `EmailParser` with LRU cache and `mailparser` integration.
- `EmailComposer` with nodemailer RFC 2822 builder.
- `IndexService` with `sql.js` FTS4 full-text search and upsert.
- `AttachmentService` for extraction and shell-open.
- `FilesystemService` with safe-path enforcement and directory walk.
- CLI `--from` flag to override the draft `From` address.
- Auto-index on server startup.

### Removed

- `get_index_stats`: diagnostic tool not needed in MCP surface.
- `index_emails`: `refresh_index` is strictly superior.
- `add_attachment`: `update_email` with `attachmentPaths` is equivalent.
- `list_attachments`: `get_email` already returns attachment metadata.
