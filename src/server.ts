#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as fs from 'fs';
import * as path from 'path';
import { FilesystemService } from './services/filesystem-service.js';
import { EmailParser } from './services/email-parser.js';
import { IndexService } from './services/index-service.js';
import { AttachmentService } from './services/attachment-service.js';
import { EmailComposer } from './services/email-composer.js';
import { registerEmailTools } from './tools/email-tools.js';
import { registerAttachmentTools } from './tools/attachment-tools.js';
import { registerIndexTools } from './tools/index-tools.js';
import { getEmlPaths } from './constants/paths.js';
import { saveConfig } from './tui/services/config-store.js';
import type { Services } from './types/service.types.js';
import type { EmailFolder } from './types/email.types.js';

function parseArgs(): {
  inboxDirectory: string;
  outboxDirectory: string;
  draftsDirectory: string;
  indexDbPath: string;
  draftFrom: string;
} {
  const args = process.argv.slice(2);
  const emailDirectory = args.find(arg => !arg.startsWith('--'));

  if (!emailDirectory) {
    process.stderr.write('Usage: eml-mcp <email-directory> [options]\n');
    process.stderr.write('  email-directory    Root directory; inbox/, outbox/, and drafts/ sub-directories are used\n');
    process.stderr.write('  --data-path=<path> Data directory (default: ~/.eml)\n');
    process.stderr.write('  --from=<address>   From address for composed drafts (default: draft@eml-mcp)\n');
    process.exit(1);
  }

  const resolvedRoot = path.resolve(emailDirectory);
  const inboxDirectory = path.join(resolvedRoot, 'inbox');
  const outboxDirectory = path.join(resolvedRoot, 'outbox');
  const draftsDirectory = path.join(resolvedRoot, 'drafts');

  for (const dir of [inboxDirectory, outboxDirectory, draftsDirectory]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const dataPathArg = args.find(arg => arg.startsWith('--data-path='));
  const dataPath = dataPathArg ? dataPathArg.slice('--data-path='.length) : undefined;
  const emlPaths = getEmlPaths(dataPath);

  saveConfig({ emailDirectory: resolvedRoot }, emlPaths.configPath);

  const fromArg = args.find(arg => arg.startsWith('--from='));
  const draftFrom = fromArg ? fromArg.slice('--from='.length) : 'draft@eml-mcp';

  return { inboxDirectory, outboxDirectory, draftsDirectory, indexDbPath: emlPaths.indexDbPath, draftFrom };
}

async function main(): Promise<void> {
  const { inboxDirectory, outboxDirectory, draftsDirectory, indexDbPath, draftFrom } = parseArgs();

  const filesystem = new FilesystemService();
  const parser = new EmailParser(filesystem);
  const index = new IndexService(indexDbPath);
  const attachment = new AttachmentService(parser, filesystem);
  const composer = new EmailComposer(filesystem, draftsDirectory, draftFrom);

  const services: Services = {
    config: { inboxDirectory, outboxDirectory, draftsDirectory },
    filesystem,
    parser,
    index,
    attachment,
    composer,
  };

  await index.initialize();

  const server = new McpServer({
    name: 'eml-mcp',
    version: '1.0.0',
  });

  registerEmailTools(server, services);
  registerAttachmentTools(server, services);
  registerIndexTools(server, services);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  setImmediate(async () => {
    try {
      const folders: Array<{ directory: string; folder: EmailFolder }> = [
        { directory: inboxDirectory, folder: 'inbox' },
        { directory: outboxDirectory, folder: 'outbox' },
        { directory: draftsDirectory, folder: 'drafts' },
      ];

      const existing = new Set(index.getAll().map(entry => entry.filePath));
      let count = 0;

      for (const { directory, folder } of folders) {
        const files = filesystem.walkDirectory(directory);
        for (const file of files) {
          if (existing.has(file.filePath)) continue;
          try {
            const parsed = await parser.parse(file.filePath);
            index.upsert({
              messageId: parsed.header.messageId,
              filePath: parsed.header.filePath,
              fromAddress: parsed.header.from,
              toAddresses: parsed.header.to.join(', '),
              ccAddresses: parsed.header.cc.join(', '),
              subject: parsed.header.subject,
              date: parsed.header.date.toISOString(),
              textBody: parsed.textBody ?? '',
              attachmentNames: parsed.attachments.map(a => a.filename).join(' '),
              hasAttachments: parsed.attachments.length > 0 ? 1 : 0,
              fileSize: file.size,
              indexedAt: new Date().toISOString(),
              folder,
            });
            count++;
          } catch {
            // skip unparseable files
          }
        }
      }
      process.stderr.write(`[eml-mcp] Auto-index complete: ${count} new emails indexed\n`);
    } catch (error) {
      process.stderr.write(`[eml-mcp] Auto-index failed: ${error}\n`);
    }
  });
}

main().catch(error => {
  process.stderr.write(`[eml-mcp] Fatal error: ${error}\n`);
  process.exit(1);
});
