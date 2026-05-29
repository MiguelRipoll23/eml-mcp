# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `open_email` — opens an existing `.eml` file in the default mail client. Works for emails from any folder (inbox, outbox, drafts). Use `search_emails` to locate the file path first.

### Fixed

- **Line breaks disappearing on reply/forward in Outlook** — composed `.eml` files now generate a `multipart/alternative` structure with both `text/plain` and `text/html` parts. Outlook uses the HTML part for quoting in replies/forwards, preserving line breaks via `<br>` tags instead of performing a lossy plain-text-to-HTML conversion.
- **RFC 2822 CRLF compliance** — `textBody` line endings are normalized to `\r\n` before being passed to nodemailer, ensuring all body lines use CRLF as required by the email standard.

### Tests

- Added test asserting composed emails produce `multipart/alternative` with an HTML part when only `textBody` is provided.
- Added test asserting zero bare LF line endings throughout the generated `.eml` file.

---

## [1.0.0] — 2026-05-22

### Added

- `compose_email` — creates a new `.eml` draft and opens it in the default mail client. Accepts `to`, `cc`, `bcc`, `subject`, `textBody`, `htmlBody`, and `attachmentPaths`.
- `get_email` — parses and returns a single `.eml` file with full headers, body, and attachment metadata. Supports `textOnly` flag to reduce response size.
- `search_emails` — full-text search across body, subject, sender, and attachments with filters for date range, folder, and attachment presence.
- `update_email` — modifies an existing `.eml` draft in place, preserving existing attachments and re-opening the file.
- `delete_email` — permanently deletes an `.eml` file from disk and removes it from the index.
- `extract_attachments` — extracts one or all attachments from an `.eml` file to a target directory.
- `open_attachment` — opens a specific attachment from an `.eml` with the system default application.
- `search_attachments` — searches for attachments by filename or MIME type across indexed emails.
- `refresh_index` — rescans all email directories and updates the SQLite index with new or modified files.
- `--from` CLI argument to set the sender display name and address for composed drafts (e.g. `--from="Name <email@domain.com>"`).
- Auto-indexing on server startup — new `.eml` files not yet in the index are indexed automatically at launch.
- SQLite-backed full-text search index with folder inference (`inbox`, `outbox`, `drafts`) based on file path.

### Removed

- `list_attachments` — superseded by `get_email`, which already returns attachment metadata.
- `add_attachment` — superseded by `update_email` with `attachmentPaths`.
- `index_emails` — superseded by `refresh_index`, which is strictly equivalent and clearer.
- `get_index_stats` — diagnostic tool not needed in the MCP surface.
- Separate `extract_attachment` and `extract_all_attachments` tools — merged into a single `extract_attachments` tool.

### Fixed

- `update_email` now overwrites the file in place using an atomic write (write to `.tmp` then rename), preserving existing attachments across updates.
- `search_emails` returns the true total count via a dedicated `count()` query instead of the size of the result page.
- Folder inference in `update_email` now uses the file path directly instead of falling back to stale index data.
- Attachment filename extraction uses the MIME type to derive the extension rather than returning raw MIME strings.
- Full-text search errors are now propagated correctly instead of being silently swallowed.
