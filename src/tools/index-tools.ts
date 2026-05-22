import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Services } from '../types/service.types.js';
import { toMcpSuccess } from '../types/error.types.js';
import type { IndexEntry } from '../types/index.types.js';
import type { EmailFolder } from '../types/email.types.js';

function folderDirectories(services: Services): Array<{ directory: string; folder: EmailFolder }> {
  return [
    { directory: services.config.inboxDirectory, folder: 'inbox' },
    { directory: services.config.outboxDirectory, folder: 'outbox' },
    { directory: services.config.draftsDirectory, folder: 'drafts' },
  ];
}

export async function handleRefreshIndex(services: Services) {
  const folders = folderDirectories(services);
  const diskFiles = new Map<string, EmailFolder>();
  for (const { directory, folder } of folders) {
    for (const file of services.filesystem.walkDirectory(directory)) {
      diskFiles.set(file.filePath, folder);
    }
  }

  const existing = services.index.getAll() as { messageId: string; filePath: string; indexedAt: string }[];
  const existingPaths = new Set(existing.map((entry: { filePath: string }) => entry.filePath));

  let added = 0;
  let removed = 0;
  let updated = 0;

  for (const entry of existing) {
    if (!diskFiles.has(entry.filePath)) {
      services.index.remove(entry.messageId);
      removed++;
    }
  }

  // Rebuild files list with mtime for stale detection
  const allFiles: Array<{ filePath: string; mtime: Date; size: number; folder: EmailFolder }> = [];
  for (const { directory, folder } of folders) {
    for (const file of services.filesystem.walkDirectory(directory)) {
      allFiles.push({ ...file, folder });
    }
  }

  for (const file of allFiles) {
    const isNew = !existingPaths.has(file.filePath);
    const existingEntry = existing.find((entry: { filePath: string }) => entry.filePath === file.filePath);
    const isStale = existingEntry !== undefined && file.mtime > new Date(existingEntry.indexedAt);

    if (!isNew && !isStale) continue;

    try {
      const parsed = await services.parser.parse(file.filePath);
      const indexEntry: IndexEntry = {
        messageId: parsed.header.messageId,
        filePath: parsed.header.filePath,
        fromAddress: parsed.header.from,
        toAddresses: parsed.header.to.join(', '),
        ccAddresses: parsed.header.cc.join(', '),
        subject: parsed.header.subject,
        date: parsed.header.date.toISOString(),
        textBody: parsed.textBody ?? '',
        attachmentNames: parsed.attachments.map((a: { filename: string }) => a.filename).join(' '),
        hasAttachments: parsed.attachments.length > 0 ? 1 : 0,
        fileSize: file.size,
        indexedAt: new Date().toISOString(),
        folder: file.folder,
      };
      services.index.upsert(indexEntry);
      isNew ? added++ : updated++;
    } catch {
      // skip files that fail to parse
    }
  }

  return toMcpSuccess({ added, removed, updated });
}

export function registerIndexTools(server: McpServer, services: Services): void {
  server.tool(
    'refresh_index',
    'Incrementally update the index: add new, remove deleted, update changed files',
    {},
    () => handleRefreshIndex(services),
  );
}
