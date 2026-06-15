# eml-mcp

MCP server for managing email archives stored as `.eml` files. Designed to work alongside a pair of Power Automate flows that automatically export Outlook emails to OneDrive as `.eml` files, giving AI assistants full read and write access to your inbox, sent items, and drafts through a structured set of tools.

Comes with a terminal dashboard (`eml`) and a CLI (`eml-cli`) for standalone use outside of an AI assistant.

## Requirements

- Node.js 20+
- A OneDrive folder (synced locally) — `inbox/`, `outbox/`, and `drafts/` sub-directories are created automatically on first run

## Installation

```bash
npm install -g eml-mcp
```

Or run directly with npx:

```bash
npx eml-mcp /path/to/emails --from=you@example.com
```

## MCP Server

```bash
eml-mcp <email-directory> [--from=<address>] [--data-path=<path>]
```

### Add to your MCP client

<details>
<summary>Claude Code</summary>

```bash
claude mcp add eml -- npx -y eml-mcp /path/to/emails --from=you@example.com
```

</details>

<details>
<summary>GitHub Copilot</summary>

Add to `~/.copilot/mcp-config.json`:

```json
{
  "mcpServers": {
    "eml": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/eml-mcp/dist/server.js", "/path/to/emails", "--from=you@example.com"]
    }
  }
}
```

</details>

<details>
<summary>Codex CLI</summary>

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.eml]
command = "npx"
args = ["-y", "eml-mcp", "/path/to/emails", "--from=you@example.com"]
```

</details>

## Arguments (MCP server)

| Argument | Required | Description |
|---|---|---|
| `<email-directory>` | Yes | Root directory; `inbox/`, `outbox/`, and `drafts/` sub-directories must exist inside |
| `--from=<address>` | No | From address for composed drafts (default: `draft@eml-mcp`) |
| `--data-path=<path>` | No | Base data directory (default: `~/.eml`) |

## Power Automate — Automatic .eml archiving

Each flow watches one Outlook folder and saves every email as an `.eml` file to the corresponding OneDrive directory. Set up the inbox flow first, then duplicate it for sent items — the only two values that change are noted in the second section.

<details>
<summary>Inbox flow — archive received emails</summary>

### Trigger

**When a new email arrives (V3)** — Office 365 Outlook

Set the folder to **Inbox**. Add subject/sender filters as needed.

### Step 1 — Export email (V2)

**Export email (V2)** — Office 365 Outlook

- **Message Id**: `Message Id` (dynamic value from trigger)

This action returns the raw MIME content of the email (RFC-2822 format, compatible with `.eml`).

### Step 2 — Create file

**Create file** — OneDrive for Business

- **Folder Path**: `/Outlook/inbox`
- **File Name**: `<Subject>-<Received Time>.eml` — compose using dynamic values from the trigger, sanitizing characters not allowed in file names
- **File Content**: `Body` (dynamic value from the **Export email (V2)** step)

The file is created in OneDrive and, on next `refresh_index` call or server restart, it will be picked up automatically by eml-mcp tagged as `inbox`.

</details>

<details>
<summary>Sent Items flow — archive sent emails</summary>

Duplicate the inbox flow and change only two values:

- **Trigger folder**: `Sent Items`
- **Folder Path** (Create file step): `/Outlook/outbox`

eml-mcp will tag these emails as `outbox`.

</details>

---

## Tools

| Tool | Description |
|---|---|
| `search_emails` | Full-text search with filters (from, date, attachments, **folder**…) |
| `get_email` | Parse and return a single email |
| `compose_email` | Create a new draft `.eml` and open it |
| `update_email` | Modify an existing draft and re-open it |
| `open_email` | Open an existing `.eml` in the default mail client (works for inbox, outbox, and drafts) |
| `delete_email` | Permanently delete an `.eml` file and remove it from the index |
| `extract_attachments` | Save one or all attachments from an email to a directory |
| `open_attachment` | Open an attachment with the system default application |
| `search_attachments` | Find emails containing attachments by filename, type, or keyword |
| `refresh_index` | Incrementally sync the index with disk state (add new, remove deleted, update changed) |

## Terminal Dashboard (TUI)

```bash
eml [--data-path=<path>]
```

Opens an interactive terminal dashboard that watches your email index and runs configured workflows automatically. Panels show active workflows and a live activity log.

The `--data-path` flag sets the base data directory (default: `~/.eml`). The MCP server must have been started at least once to create the config file — or pass the email directory explicitly via `--data-path`.

## CLI

```bash
eml-cli <command> [<email-directory>] [--data-path=<path>]
```

| Command | Description |
|---|---|
| `refresh_index` | Sync the index with disk (add new, remove deleted, update changed) |
| `stats` | Show file counts on disk vs indexed per folder; flags duplicates |
| `last-indexed` | Show when the index was last updated |

The email directory argument is optional if the MCP server has run at least once (it saves the path to `~/.eml/config.json`).

### Options

| Flag | Description |
|---|---|
| `--data-path=<path>` | Base data directory (default: `~/.eml`) |

### Examples

```bash
# Refresh the index
eml-cli refresh_index

# Check for duplicates or missing files
eml-cli stats

# Use a custom data directory
eml-cli stats --data-path=/custom/path
```

---

## Development build

```bash
npm install
npm run build   # compiles TypeScript and re-links the eml/eml-cli/eml-mcp bins
```

Register the local build in Claude Code:

```bash
claude mcp add eml node "/absolute/path/to/eml-mcp/dist/server.js" -- "/path/to/emails" --from=you@example.com
```
