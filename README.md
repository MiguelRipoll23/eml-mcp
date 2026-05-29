# eml-mcp

MCP server for managing email archives stored as `.eml` files. Designed to work alongside a pair of Power Automate flows that automatically export Outlook emails to OneDrive as `.eml` files, giving AI assistants full read and write access to your inbox, sent items, and drafts through a structured set of tools.

## Requirements

- Node.js 20+
- A OneDrive folder (synced locally) — `inbox/`, `outbox/`, and `drafts/` sub-directories are created automatically on first run

## Installation

```bash
npx eml-mcp /path/to/emails --from=you@example.com
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

## Arguments

| Argument | Required | Description |
|---|---|---|
| `<email-directory>` | Yes | Root directory; `inbox/`, `outbox/`, and `drafts/` sub-directories must exist inside |
| `--db-path=<path>` | No | SQLite index path (default: `~/.eml-mcp/index.db`) |
| `--from=<address>` | No | From address for composed drafts (default: `draft@eml-mcp`) |

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

---

## Development build

```bash
npm install
npm run build
```

Register the local build in Claude Code:

```bash
claude mcp add eml node "/absolute/path/to/eml-mcp/dist/server.js" -- "/path/to/emails" --from=you@example.com
```
