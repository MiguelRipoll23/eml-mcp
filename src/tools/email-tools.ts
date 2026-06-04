import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Services, ServerConfig } from '../types/service.types.js';
import type { SearchFilters, EmailFolder, EmailHeader } from '../types/email.types.js';
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
  embedInlineImages: z.boolean().default(true).describe('Replace cid: image references in htmlBody with base64 data URIs'),
};

const composeSchema = {
  to: z.array(z.string()).describe('Recipients in "Name <email>" or plain "email" format'),
  cc: z.array(z.string()).optional().describe('CC recipients in "Name <email>" or plain "email" format'),
  bcc: z.array(z.string()).optional().describe('BCC recipients in "Name <email>" or plain "email" format'),
  subject: z.string().describe('Email subject'),
  textBody: z.string().optional().describe('Plain text body'),
  htmlBody: z.string().optional().describe('HTML body'),
  attachmentPaths: z.array(z.string()).optional().describe('Absolute paths to files to attach'),
  inReplyTo: z.string().optional().describe('Message-ID of the email being replied to, for threading (e.g. "<msg001@example.com>")'),
  references: z.array(z.string()).optional().describe('Ordered list of message-IDs forming the thread chain (copy from the original email\'s references plus its message-ID)'),
  replyToFilePath: z.string().optional().describe('Absolute path to the .eml being replied to — appends the original thread as a quoted HTML block with inline images'),
};

const updateSchema = {
  filePath: z.string().describe('Absolute path to the .eml file to update'),
  to: z.array(z.string()).optional().describe('Recipients in "Name <email>" or plain "email" format'),
  cc: z.array(z.string()).optional().describe('CC recipients in "Name <email>" or plain "email" format'),
  bcc: z.array(z.string()).optional().describe('BCC recipients in "Name <email>" or plain "email" format'),
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
    const { locale, timeZone } = Intl.DateTimeFormat().resolvedOptions();
    const results = services.index.search(filters, limit).map(entry => ({
      ...entry,
      dateLocal: entry.date
        ? new Date(entry.date).toLocaleString(locale, {
            timeZone,
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
        : null,
    }));
    const count = services.index.count(filters);
    return toMcpSuccess({ results, count });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toMcpError('SEARCH_ERROR', message);
  }
}

export async function handleGetEmail(
  args: { filePath: string; textOnly?: boolean; embedInlineImages?: boolean },
  services: Services,
) {
  try {
    if (!args.textOnly && args.embedInlineImages !== false) {
      const email = await services.parser.parseWithEmbeddedImages(args.filePath);
      return toMcpSuccess(email);
    }
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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildQuoteBlock(
  header: EmailHeader,
  htmlBody: string | undefined,
  textBody: string | undefined,
): string {
  const bodyHtml = htmlBody
    ?? (textBody
      ? `<pre style="font-family:inherit;white-space:pre-wrap">${escapeHtml(textBody)}</pre>`
      : '');
  const cc = header.cc?.length
    ? `<b>CC:</b> ${escapeHtml(header.cc.join('; '))}<br>\n  `
    : '';
  return `
<hr style="border:none;border-top:1px solid #e0e0e0;margin:12px 0">
<div style="font-size:11pt;font-family:Calibri,sans-serif">
  <b>De:</b> ${escapeHtml(header.from)}<br>
  <b>Enviado:</b> ${escapeHtml(header.dateLocal)}<br>
  <b>Para:</b> ${escapeHtml(header.to.join('; '))}<br>
  ${cc}<b>Asunto:</b> ${escapeHtml(header.subject)}
</div>
<blockquote style="margin:0 0 0 .8ex;border-left:2px solid #ccc;padding-left:1ex">
${bodyHtml}
</blockquote>`;
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
    inReplyTo?: string;
    references?: string[];
    replyToFilePath?: string;
  },
  services: Services,
) {
  try {
    let options: ComposeOptions = {
      to: args.to,
      cc: args.cc,
      bcc: args.bcc,
      subject: args.subject,
      textBody: args.textBody,
      htmlBody: args.htmlBody,
      attachmentPaths: args.attachmentPaths,
      inReplyTo: args.inReplyTo,
      references: args.references,
    };

    if (args.replyToFilePath) {
      const original = await services.parser.parseForRecompose(args.replyToFilePath);
      const quoteHtml = buildQuoteBlock(original.header, original.htmlBody, original.textBody);
      const newBodyHtml = args.htmlBody
        ?? `<div style="font-family:Calibri,sans-serif;font-size:11pt">${escapeHtml(args.textBody ?? '').replace(/\r?\n/g, '<br>')}</div>`;
      options = {
        ...options,
        htmlBody: newBodyHtml + quoteHtml,
        textBody: undefined,
        bufferedAttachments: original.attachments.filter(a => a.cid),
      };
    }

    const filePath = await services.composer.composeAndOpen(options);
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
      inReplyTo: existing.header.inReplyTo,
      references: existing.header.references,
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

export async function handleOpenEmail(
  args: { filePath: string },
  services: Services,
) {
  if (!fs.existsSync(args.filePath)) {
    return toMcpError('FILE_NOT_FOUND', `File not found: ${args.filePath}`);
  }
  try {
    await services.filesystem.openWithDefaultApp(args.filePath);
    return toMcpSuccess({ filePath: args.filePath });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toMcpError('FILE_NOT_FOUND', message);
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

const indexEntryOutputSchema = {
  messageId: z.string(),
  filePath: z.string(),
  fromAddress: z.string().nullable(),
  toAddresses: z.string().nullable(),
  ccAddresses: z.string().nullable(),
  subject: z.string().nullable(),
  date: z.string().nullable(),
  dateLocal: z.string().nullable(),
  hasAttachments: z.number(),
  fileSize: z.number(),
  indexedAt: z.string().nullable(),
  folder: z.string(),
};

export function registerEmailTools(server: McpServer, services: Services): void {
  server.registerTool(
    'search_emails',
    {
      description: 'Search emails by keyword, sender, date, and other filters',
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
      inputSchema: searchSchema,
      outputSchema: {
        results: z.array(z.object(indexEntryOutputSchema)),
        count: z.number(),
      },
    },
    (args) => handleSearchEmails(args, services),
  );

  server.registerTool(
    'get_email',
    {
      description: 'Parse and return a single .eml file with full content',
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
      inputSchema: getEmailSchema,
      outputSchema: {
        header: z.object({
          messageId: z.string(),
          from: z.string(),
          to: z.array(z.string()),
          cc: z.array(z.string()),
          bcc: z.array(z.string()),
          subject: z.string(),
          date: z.string(),
          dateLocal: z.string(),
          filePath: z.string(),
          folder: z.enum(['inbox', 'outbox', 'drafts']).optional(),
          inReplyTo: z.string().optional(),
          references: z.array(z.string()).optional(),
        }),
        textBody: z.string().optional(),
        htmlBody: z.string().optional(),
        attachments: z.array(z.object({
          filename: z.string(),
          contentType: z.string(),
          size: z.number(),
          contentId: z.string().optional(),
        })),
      },
    },
    (args) => handleGetEmail(args, services),
  );

  server.registerTool(
    'compose_email',
    {
      description: 'Create a new .eml draft and open it in the default mail client',
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: true },
      inputSchema: composeSchema,
      outputSchema: { filePath: z.string() },
    },
    (args) => handleComposeEmail(args, services),
  );

  server.registerTool(
    'update_email',
    {
      description: 'Modify an existing .eml draft and re-open it',
      annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: true },
      inputSchema: updateSchema,
      outputSchema: { filePath: z.string() },
    },
    (args) => handleUpdateEmail(args, services),
  );

  server.registerTool(
    'open_email',
    {
      description: 'Open an existing .eml file in the default mail client. Use search_emails to find the filePath first.',
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: true },
      inputSchema: {
        filePath: z.string().describe('Absolute path to the .eml file to open'),
      },
      outputSchema: { filePath: z.string() },
    },
    (args) => handleOpenEmail(args, services),
  );

  server.registerTool(
    'delete_email',
    {
      description: 'Permanently delete an .eml file from disk and remove it from the index',
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false },
      inputSchema: {
        filePath: z.string().describe('Absolute path to the .eml file to delete'),
      },
      outputSchema: {
        filePath: z.string(),
        removedFromIndex: z.boolean(),
      },
    },
    (args) => handleDeleteEmail(args, services),
  );
}
