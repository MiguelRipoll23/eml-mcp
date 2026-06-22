import * as fs from 'fs';
import { defineCommand } from 'citty';
import { FilesystemService } from '../services/filesystem-service.js';
import { EmailParser } from '../services/email-parser.js';
import { IndexService } from '../services/index-service.js';
import { AttachmentService } from '../services/attachment-service.js';
import { getEmlPaths } from '../constants/paths.js';
import { handleComposeEmail, handleUpdateEmail } from '../tools/email-tools.js';
import type { SearchFilters, EmailFolder } from '../types/email.types.js';
import { DATA_PATH_ARG, resolveEmailDirectory, buildServices } from './shared.js';

function splitCsv(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const parts = value.split(',').map(s => s.trim()).filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

function exitError(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const emailSearchCommand = defineCommand({
  meta: { name: 'email search', description: 'Search emails' },
  args: {
    keywords: { type: 'string', description: 'Full-text keywords (comma-separated for multiple)' },
    from: { type: 'string', description: 'Sender filter (partial)' },
    to: { type: 'string', description: 'Recipient filter (partial)' },
    subject: { type: 'string', description: 'Subject filter (partial)' },
    'date-from': { type: 'string', description: 'ISO 8601 start date' },
    'date-to': { type: 'string', description: 'ISO 8601 end date' },
    'has-attachments': { type: 'boolean', description: 'Only emails with attachments' },
    folder: { type: 'string', description: 'inbox | outbox | drafts' },
    'file-path': { type: 'string', description: 'File path filter (partial)' },
    limit: { type: 'string', description: 'Max results (default: 50)' },
    sort: { type: 'string', description: 'asc | desc (default: desc)' },
    ...DATA_PATH_ARG,
  },
  async run({ args }) {
    const emlPaths = getEmlPaths(args['data-path']);
    const index = new IndexService(emlPaths.indexDbPath);
    await index.initialize();

    const filters: SearchFilters = {
      keywords: splitCsv(args.keywords),
      from: args.from,
      to: args.to,
      subject: args.subject,
      dateFrom: args['date-from'],
      dateTo: args['date-to'],
      hasAttachments: args['has-attachments'],
      folder: args.folder as EmailFolder | undefined,
      filePath: args['file-path'],
    };
    const limit = args.limit ? parseInt(args.limit, 10) : 50;
    const sortOrder = (args.sort as 'asc' | 'desc' | undefined) ?? 'desc';

    const results = index.search(filters, limit, sortOrder);
    const count = index.count(filters);

    if (results.length === 0) {
      process.stdout.write('No emails found.\n');
      return;
    }

    process.stdout.write(`${count} match(es), showing ${results.length}:\n\n`);
    for (const r of results) {
      const date = r.date ? new Date(r.date).toLocaleDateString() : 'no date';
      const attach = r.hasAttachments ? ' [attach]' : '';
      process.stdout.write(`${date}  [${r.folder}]${attach}  ${r.subject ?? '(no subject)'}\n`);
      process.stdout.write(`  From: ${r.fromAddress ?? ''}  →  ${r.toAddresses ?? ''}\n`);
      process.stdout.write(`  ${r.filePath}\n\n`);
    }
  },
});

const emailGetCommand = defineCommand({
  meta: { name: 'email get', description: 'Parse and display a .eml file as JSON' },
  args: {
    filePath: { type: 'positional', description: 'Absolute path to .eml file', required: true },
    'text-only': { type: 'boolean', description: 'Omit htmlBody' },
    ...DATA_PATH_ARG,
  },
  async run({ args }) {
    const filesystem = new FilesystemService();
    const parser = new EmailParser(filesystem);
    try {
      const email = args['text-only']
        ? await parser.parse(args.filePath)
        : await parser.parseWithEmbeddedImages(args.filePath);
      if (args['text-only']) {
        const { htmlBody: _html, ...rest } = email as typeof email & { htmlBody?: unknown };
        process.stdout.write(JSON.stringify(rest, null, 2));
      } else {
        process.stdout.write(JSON.stringify(email, null, 2));
      }
      process.stdout.write('\n');
    } catch (error) {
      exitError(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
});

const emailOpenCommand = defineCommand({
  meta: { name: 'email open', description: 'Open a .eml file in the default mail client' },
  args: {
    filePath: { type: 'positional', description: 'Absolute path to .eml file', required: true },
    ...DATA_PATH_ARG,
  },
  async run({ args }) {
    if (!fs.existsSync(args.filePath)) exitError(`File not found: ${args.filePath}`);
    const filesystem = new FilesystemService();
    try {
      await filesystem.openWithDefaultApp(args.filePath);
      process.stdout.write(`Opened: ${args.filePath}\n`);
    } catch (error) {
      exitError(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
});

const emailDeleteCommand = defineCommand({
  meta: { name: 'email delete', description: 'Delete a .eml file and remove it from the index' },
  args: {
    filePath: { type: 'positional', description: 'Absolute path to .eml file', required: true },
    ...DATA_PATH_ARG,
  },
  async run({ args }) {
    if (!fs.existsSync(args.filePath)) exitError(`File not found: ${args.filePath}`);
    const emlPaths = getEmlPaths(args['data-path']);
    const filesystem = new FilesystemService();
    const parser = new EmailParser(filesystem);
    const index = new IndexService(emlPaths.indexDbPath);
    await index.initialize();

    const entry = index.getAll().find(e => e.filePath === args.filePath);
    if (entry) index.remove(entry.messageId);
    parser.invalidate(args.filePath);
    fs.unlinkSync(args.filePath);
    process.stdout.write(`Deleted: ${args.filePath}${entry ? ' (removed from index)' : ''}\n`);
  },
});

const emailComposeCommand = defineCommand({
  meta: { name: 'email compose', description: 'Create a new .eml draft and open it' },
  args: {
    directory: { type: 'positional', description: 'Email directory', required: false },
    to: { type: 'string', description: 'Recipients (comma-separated)', required: true },
    cc: { type: 'string', description: 'CC recipients (comma-separated)' },
    bcc: { type: 'string', description: 'BCC recipients (comma-separated)' },
    subject: { type: 'string', description: 'Email subject', required: true },
    body: { type: 'string', description: 'Plain text body' },
    html: { type: 'string', description: 'HTML body' },
    attach: { type: 'string', description: 'Attachment paths (comma-separated)' },
    'in-reply-to': { type: 'string', description: 'Message-ID being replied to' },
    references: { type: 'string', description: 'Thread reference Message-IDs (comma-separated)' },
    'reply-to-file': { type: 'string', description: 'Path to .eml being replied to (appends quoted thread)' },
    from: { type: 'string', description: 'From address (default: draft@eml-mcp)' },
    ...DATA_PATH_ARG,
  },
  async run({ args }) {
    const emailDirectory = resolveEmailDirectory(args.directory, args['data-path']);
    const { services } = buildServices(emailDirectory, args['data-path'], args.from ?? 'draft@eml-mcp');
    await services.index.initialize();

    const result = await handleComposeEmail({
      to: splitCsv(args.to) ?? [],
      cc: splitCsv(args.cc),
      bcc: splitCsv(args.bcc),
      subject: args.subject,
      textBody: args.body,
      htmlBody: args.html,
      attachmentPaths: splitCsv(args.attach),
      inReplyTo: args['in-reply-to'],
      references: splitCsv(args.references),
      replyToFilePath: args['reply-to-file'],
    }, services);

    if (result.isError) exitError(result.content[0].text);
    const { filePath } = result.structuredContent as { filePath: string };
    process.stdout.write(`Created: ${filePath}\n`);
  },
});

const emailUpdateCommand = defineCommand({
  meta: { name: 'email update', description: 'Update an existing .eml draft' },
  args: {
    filePath: { type: 'positional', description: 'Absolute path to .eml file', required: true },
    directory: { type: 'string', description: 'Email directory (uses saved config if omitted)' },
    to: { type: 'string', description: 'Recipients (comma-separated)' },
    cc: { type: 'string', description: 'CC recipients (comma-separated)' },
    bcc: { type: 'string', description: 'BCC recipients (comma-separated)' },
    subject: { type: 'string', description: 'Email subject' },
    body: { type: 'string', description: 'Plain text body' },
    html: { type: 'string', description: 'HTML body' },
    attach: { type: 'string', description: 'Attachment paths (comma-separated)' },
    from: { type: 'string', description: 'From address (default: draft@eml-mcp)' },
    ...DATA_PATH_ARG,
  },
  async run({ args }) {
    const emailDirectory = resolveEmailDirectory(args.directory, args['data-path']);
    const { services } = buildServices(emailDirectory, args['data-path'], args.from ?? 'draft@eml-mcp');
    await services.index.initialize();

    const result = await handleUpdateEmail({
      filePath: args.filePath,
      to: splitCsv(args.to),
      cc: splitCsv(args.cc),
      bcc: splitCsv(args.bcc),
      subject: args.subject,
      textBody: args.body,
      htmlBody: args.html,
      attachmentPaths: splitCsv(args.attach),
    }, services);

    if (result.isError) exitError(result.content[0].text);
    const { filePath } = result.structuredContent as { filePath: string };
    process.stdout.write(`Updated: ${filePath}\n`);
  },
});

export const emailCommand = defineCommand({
  meta: { name: 'email', description: 'Email operations (search, get, open, compose, update, delete)' },
  subCommands: {
    search: emailSearchCommand,
    get: emailGetCommand,
    open: emailOpenCommand,
    compose: emailComposeCommand,
    update: emailUpdateCommand,
    delete: emailDeleteCommand,
  },
});

const attachmentSearchCommand = defineCommand({
  meta: { name: 'attachment search', description: 'Find emails with matching attachments' },
  args: {
    filename: { type: 'string', description: 'Partial attachment filename' },
    'content-type': { type: 'string', description: 'MIME type (e.g. application/pdf)' },
    keywords: { type: 'string', description: 'Content or name keywords (comma-separated for multiple)' },
    ...DATA_PATH_ARG,
  },
  async run({ args }) {
    const emlPaths = getEmlPaths(args['data-path']);
    const index = new IndexService(emlPaths.indexDbPath);
    await index.initialize();

    const contentTypeKeyword = args['content-type']
      ? ((args['content-type'].split('/')[1] ?? args['content-type']).split('+')[0] ?? '')
      : undefined;
    const terms = [args.filename, contentTypeKeyword, ...(splitCsv(args.keywords) ?? [])].filter(Boolean) as string[];

    const filters: SearchFilters = { keywords: terms.length > 0 ? terms : undefined, hasAttachments: true };
    const results = index.search(filters, 50);
    const count = index.count(filters);

    if (results.length === 0) {
      process.stdout.write('No emails with attachments found.\n');
      return;
    }

    process.stdout.write(`${count} match(es), showing ${results.length}:\n\n`);
    for (const r of results) {
      const date = r.date ? new Date(r.date).toLocaleDateString() : 'no date';
      process.stdout.write(`${date}  [${r.folder}]  ${r.subject ?? '(no subject)'}\n`);
      process.stdout.write(`  From: ${r.fromAddress ?? ''}${r.hasAttachments ? '  [has attachments]' : ''}\n`);
      process.stdout.write(`  ${r.filePath}\n\n`);
    }
  },
});

const attachmentExtractCommand = defineCommand({
  meta: { name: 'attachment extract', description: 'Extract attachments from a .eml file' },
  args: {
    filePath: { type: 'positional', description: 'Absolute path to .eml file', required: true },
    outputDir: { type: 'positional', description: 'Output directory', required: true },
    filename: { type: 'string', description: 'Specific attachment filename (omit = extract all)' },
    ...DATA_PATH_ARG,
  },
  async run({ args }) {
    const filesystem = new FilesystemService();
    const parser = new EmailParser(filesystem);
    const attachment = new AttachmentService(parser, filesystem);

    try {
      const savedPaths = args.filename
        ? [await attachment.extract(args.filePath, args.filename, args.outputDir)]
        : await attachment.extractAll(args.filePath, args.outputDir);

      if (savedPaths.length === 0) {
        process.stdout.write('No attachments found.\n');
        return;
      }
      for (const p of savedPaths) process.stdout.write(`Extracted: ${p}\n`);
    } catch (error) {
      exitError(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
});

const attachmentOpenCommand = defineCommand({
  meta: { name: 'attachment open', description: 'Open an attachment with the default application' },
  args: {
    filePath: { type: 'positional', description: 'Absolute path to .eml file', required: true },
    filename: { type: 'positional', description: 'Exact attachment filename', required: true },
    ...DATA_PATH_ARG,
  },
  async run({ args }) {
    const filesystem = new FilesystemService();
    const parser = new EmailParser(filesystem);
    const attachment = new AttachmentService(parser, filesystem);

    try {
      const tempPath = await attachment.openAttachment(args.filePath, args.filename);
      process.stdout.write(`Opened: ${tempPath}\n`);
    } catch (error) {
      exitError(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
});

export const attachmentCommand = defineCommand({
  meta: { name: 'attachment', description: 'Attachment operations (search, extract, open)' },
  subCommands: {
    search: attachmentSearchCommand,
    extract: attachmentExtractCommand,
    open: attachmentOpenCommand,
  },
});
