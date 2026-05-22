import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Services } from '../types/service.types.js';
import type { SearchFilters } from '../types/email.types.js';
import { toMcpSuccess, toMcpError } from '../types/error.types.js';

export async function handleExtractAttachments(
  args: { filePath: string; filename?: string; outputDir: string },
  services: Services,
) {
  try {
    if (args.filename) {
      const savedPath = await services.attachment.extract(
        args.filePath,
        args.filename,
        args.outputDir,
      );
      return toMcpSuccess({ savedPaths: [savedPath] });
    }
    const savedPaths = await services.attachment.extractAll(args.filePath, args.outputDir);
    return toMcpSuccess({ savedPaths });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('ATTACHMENT_NOT_FOUND')) {
      return toMcpError('ATTACHMENT_NOT_FOUND', message);
    }
    if (message.includes('INVALID_PATH')) {
      return toMcpError('INVALID_PATH', message);
    }
    return toMcpError('FILE_NOT_FOUND', message);
  }
}

export async function handleOpenAttachment(
  args: { filePath: string; filename: string },
  services: Services,
) {
  try {
    const tempPath = await services.attachment.openAttachment(args.filePath, args.filename);
    return toMcpSuccess({ tempPath });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('ATTACHMENT_NOT_FOUND')) {
      return toMcpError('ATTACHMENT_NOT_FOUND', message);
    }
    return toMcpError('FILE_NOT_FOUND', message);
  }
}

function mimeTypeToExtension(mimeType: string): string {
  const subtype = mimeType.split('/')[1] ?? mimeType;
  return subtype.split('+')[0] ?? subtype;
}

export async function handleSearchAttachments(
  args: { filename?: string; contentType?: string; keyword?: string },
  services: Services,
) {
  const contentTypeKeyword = args.contentType ? mimeTypeToExtension(args.contentType) : undefined;
  const terms = [args.filename, contentTypeKeyword, args.keyword].filter(Boolean);
  const keyword = terms.length > 0 ? terms.join(' ') : undefined;
  try {
    const searchFilters: SearchFilters = { keyword, hasAttachments: true };
    const results = services.index.search(searchFilters, 50);
    const count = services.index.count(searchFilters);
    return toMcpSuccess({ results, count });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toMcpError('SEARCH_ERROR', message);
  }
}

export function registerAttachmentTools(server: McpServer, services: Services): void {
  server.tool(
    'extract_attachments',
    'Save attachments from an email to a directory. Provide filename to extract one; omit to extract all.',
    {
      filePath: z.string().describe('Absolute path to the .eml file'),
      filename: z.string().optional().describe('Exact attachment filename — omit to extract all'),
      outputDir: z.string().describe('Absolute path to the output directory'),
    },
    (args) => handleExtractAttachments(args, services),
  );

  server.tool(
    'open_attachment',
    'Open an attachment with the system default application',
    {
      filePath: z.string().describe('Absolute path to the .eml file'),
      filename: z.string().describe('Exact attachment filename'),
    },
    (args) => handleOpenAttachment(args, services),
  );

  server.tool(
    'search_attachments',
    'Find emails containing attachments matching filename, type, or content hints',
    {
      filename: z.string().optional().describe('Partial attachment filename'),
      contentType: z
        .string()
        .optional()
        .describe('MIME type (e.g. application/pdf) — searches by file extension derived from the subtype'),
      keyword: z.string().optional().describe('Content or name keyword'),
    },
    (args) => handleSearchAttachments(args, services),
  );
}
