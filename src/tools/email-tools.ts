import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Services, ServerConfig } from '../types/service.types.js';
import type { SearchFilters, EmailFolder } from '../types/email.types.js';
import type { ComposeOptions } from '../services/email-composer.js';
import { toMcpSuccess, toMcpError } from '../types/error.types.js';

const searchSchema = {
  keyword: z.string().optional().describe('Full-text search across body, subject, attachments'),
  from: z.string().optional().describe('Filter by sender (partial match)'),
  to: z.string().optional().describe('Filter by recipient (partial match)'),
  subject: z.string().optional().describe('Filter by subject (partial match)'),
  dateFrom: z.string().optional().describe('ISO 8601 start date'),
  dateTo: z.string().optional().describe('ISO 8601 end date'),
  hasAttachments: z.boolean().optional().describe('Only emails with attachments'),
  folder: z.enum(['inbox', 'outbox', 'drafts']).optional().describe('Filter by folder: inbox (received), outbox (sent), or drafts'),
  limit: z.number().int().min(1).max(200).optional().default(50),
};

const getEmailSchema = {
  filePath: z.string().describe('Absolute path to the .eml file'),
  textOnly: z.boolean().optional().describe('Return only textBody, omitting htmlBody (reduces response size)'),
};

const composeSchema = {
  to: z.array(z.string()).describe('Recipient email addresses'),
  cc: z.array(z.string()).optional().describe('CC recipients'),
  bcc: z.array(z.string()).optional().describe('BCC recipients'),
  subject: z.string().describe('Email subject'),
  textBody: z.string().optional().describe('Plain text body'),
  htmlBody: z.string().optional().describe('HTML body'),
  attachmentPaths: z.array(z.string()).optional().describe('Absolute paths to files to attach'),
};

const updateSchema = {
  filePath: z.string().describe('Absolute path to the .eml file to update'),
  to: z.array(z.string()).optional(),
  cc: z.array(z.string()).optional(),
  bcc: z.array(z.string()).optional(),
  subject: z.string().optional(),
  textBody: z.string().optional(),
  htmlBody: z.string().optional(),
  attachmentPaths: z.array(z.string()).optional(),
};

function inferFolder(filePath: string, config: ServerConfig): EmailFolder {
  const normalized = path.resolve(filePath);
  if (normalized.startsWith(path.resolve(config.inboxDirectory) + path.sep)) return 'inbox';
  if (normalized.startsWith(path.resolve(config.outboxDirectory) + path.sep)) return 'outbox';
  return 'drafts';
}

export async function handleSearchEmails(
  args: {
    keyword?: string;
    from?: string;
    to?: string;
    subject?: string;
    dateFrom?: string;
    dateTo?: string;
    hasAttachments?: boolean;
    folder?: 'inbox' | 'outbox' | 'drafts';
    limit?: number;
  },
  services: Services,
) {
  try {
    const filters: SearchFilters = {
      keyword: args.keyword,
      from: args.from,
      to: args.to,
      subject: args.subject,
      dateFrom: args.dateFrom,
      dateTo: args.dateTo,
      hasAttachments: args.hasAttachments,
      folder: args.folder,
    };
    const limit = args.limit ?? 50;
    const results = services.index.search(filters, limit);
    const count = services.index.count(filters);
    return toMcpSuccess({ results, count });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toMcpError('SEARCH_ERROR', message);
  }
}

export async function handleGetEmail(
  args: { filePath: string; textOnly?: boolean },
  services: Services,
) {
  try {
    const email = await services.parser.parse(args.filePath);
    if (args.textOnly) {
      const { htmlBody: _html, ...withoutHtml } = email;
      return toMcpSuccess(withoutHtml);
    }
    return toMcpSuccess(email);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toMcpError('FILE_NOT_FOUND', message);
  }
}

export async function handleComposeEmail(
  args: {
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    textBody?: string;
    htmlBody?: string;
    attachmentPaths?: string[];
  },
  services: Services,
) {
  try {
    const filePath = await services.composer.composeAndOpen(args);
    return toMcpSuccess({ filePath });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toMcpError('COMPOSE_ERROR', message);
  }
}

export async function handleUpdateEmail(
  args: {
    filePath: string;
    to?: string[];
    cc?: string[];
    bcc?: string[];
    subject?: string;
    textBody?: string;
    htmlBody?: string;
    attachmentPaths?: string[];
  },
  services: Services,
) {
  try {
    const existing = await services.parser.parseForRecompose(args.filePath);
    const options: ComposeOptions = {
      to: args.to ?? existing.header.to,
      cc: args.cc ?? existing.header.cc,
      bcc: args.bcc ?? existing.header.bcc,
      subject: args.subject ?? existing.header.subject,
      textBody: args.textBody ?? existing.textBody,
      htmlBody: args.htmlBody ?? existing.htmlBody,
      bufferedAttachments: existing.attachments,
      attachmentPaths: args.attachmentPaths,
      outputPath: args.filePath,
    };
    const filePath = await services.composer.composeAndOpen(options);
    services.parser.invalidate(filePath);
    const reparsed = await services.parser.parse(filePath);
    const stat = fs.statSync(filePath);
    services.index.upsert({
      messageId: reparsed.header.messageId,
      filePath: reparsed.header.filePath,
      fromAddress: reparsed.header.from,
      toAddresses: reparsed.header.to.join(', '),
      ccAddresses: reparsed.header.cc.join(', '),
      subject: reparsed.header.subject,
      date: reparsed.header.date.toISOString(),
      textBody: reparsed.textBody ?? '',
      attachmentNames: reparsed.attachments.map(a => a.filename).join(' '),
      hasAttachments: reparsed.attachments.length > 0 ? 1 : 0,
      fileSize: stat.size,
      indexedAt: new Date().toISOString(),
      folder: inferFolder(filePath, services.config),
    });
    return toMcpSuccess({ filePath });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toMcpError('COMPOSE_ERROR', message);
  }
}

export async function handleDeleteEmail(
  args: { filePath: string },
  services: Services,
) {
  if (!fs.existsSync(args.filePath)) {
    return toMcpError('FILE_NOT_FOUND', `File not found: ${args.filePath}`);
  }
  try {
    const entry = services.index.getAll().find(e => e.filePath === args.filePath);
    if (entry) {
      services.index.remove(entry.messageId);
    }
    services.parser.invalidate(args.filePath);
    fs.unlinkSync(args.filePath);
    return toMcpSuccess({ filePath: args.filePath, removedFromIndex: entry !== undefined });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toMcpError('FILE_NOT_FOUND', message);
  }
}

export function registerEmailTools(server: McpServer, services: Services): void {
  server.tool(
    'search_emails',
    'Search emails by keyword, sender, date, and other filters',
    searchSchema,
    (args) => handleSearchEmails(args, services),
  );

  server.tool(
    'get_email',
    'Parse and return a single .eml file with full content',
    getEmailSchema,
    (args) => handleGetEmail(args, services),
  );

  server.tool(
    'compose_email',
    'Create a new .eml draft and open it in the default mail client',
    composeSchema,
    (args) => handleComposeEmail(args, services),
  );

  server.tool(
    'update_email',
    'Modify an existing .eml draft and re-open it',
    updateSchema,
    (args) => handleUpdateEmail(args, services),
  );

  server.tool(
    'delete_email',
    'Permanently delete an .eml file from disk and remove it from the index',
    {
      filePath: z.string().describe('Absolute path to the .eml file to delete'),
    },
    (args) => handleDeleteEmail(args, services),
  );
}
