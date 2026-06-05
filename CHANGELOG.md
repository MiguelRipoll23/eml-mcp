# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
