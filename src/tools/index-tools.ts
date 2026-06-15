import { z } from 'zod';
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

  // Single walk — collect all disk files with metadata needed for both removal and stale detection
  const diskFiles = new Map<string, { folder: EmailFolder; mtime: Date; size: number }>();
  for (const { directory, folder } of folders) {
    for (const file of services.filesystem.walkDirectory(directory)) {
      diskFiles.set(file.filePath, { folder, mtime: file.mtime, size: file.size });
    }
  }

  const existing = services.index.getAll() as { messageId: string; filePath: string; indexedAt: string }[];

  // Index by filePath for O(1) lookup — avoids the messageId collision problem where
  // INSERT OR REPLACE on a shared messageId would evict a different file's entry.
  const existingByPath = new Map<string, { messageId: string; indexedAt: string }>(
    existing.map(e => [e.filePath, { messageId: e.messageId, indexedAt: e.indexedAt }]),
  );
  // Track messageId → filePath to detect duplicates when indexing new files
  const messageIdToPath = new Map<string, string>(existing.map(e => [e.messageId, e.filePath]));

  let added = 0;
  let removed = 0;
  let updated = 0;

  for (const entry of existing) {
    if (!diskFiles.has(entry.filePath)) {
      services.index.remove(entry.messageId);
      removed++;
    }
  }

  for (const [filePath, { folder, mtime, size }] of diskFiles) {
    const existingEntry = existingByPath.get(filePath);
    const isNew = existingEntry === undefined;
    const isStale = !isNew && mtime > new Date(existingEntry.indexedAt);

    if (!isNew && !isStale) continue;

    try {
      const parsed = await services.parser.parse(filePath);

      // Reuse the stored messageId for stale updates so we don't create duplicate entries.
      // For new files, fall back to a filePath-derived id when the parsed messageId is already
      // claimed by a different file (duplicate Message-ID headers on forwarded/replied emails).
      let messageId: string;
      if (!isNew && existingEntry) {
        messageId = existingEntry.messageId;
      } else {
        messageId = parsed.header.messageId;
        const conflict = messageIdToPath.get(messageId);
        if (conflict !== undefined && conflict !== filePath) {
          messageId = `<path-${Buffer.from(filePath).toString('base64url')}@eml-mcp>`;
        }
        messageIdToPath.set(messageId, filePath);
      }

      const indexEntry: IndexEntry = {
        messageId,
        filePath,
        fromAddress: parsed.header.from,
        toAddresses: parsed.header.to.join(', '),
        ccAddresses: parsed.header.cc.join(', '),
        subject: parsed.header.subject,
        date: parsed.header.date.toISOString(),
        textBody: parsed.textBody ?? '',
        attachmentNames: parsed.attachments.map((a: { filename: string }) => a.filename).join(' '),
        hasAttachments: parsed.attachments.length > 0 ? 1 : 0,
        fileSize: size,
        indexedAt: new Date().toISOString(),
        folder,
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
  server.registerTool(
    'refresh_index',
    {
      description: 'Incrementally update the index: add new, remove deleted, update changed files',
      annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
      outputSchema: {
        added: z.number(),
        removed: z.number(),
        updated: z.number(),
      },
    },
    () => handleRefreshIndex(services),
  );
}
