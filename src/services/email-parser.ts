import { simpleParser } from 'mailparser';
import type { FilesystemService } from './filesystem-service.js';
import type { ParsedEmail, EmailHeader, Attachment } from '../types/email.types.js';
import type { RecomposeAttachment } from './email-composer.js';
import { PARSER_CACHE_SIZE } from '../constants/paths.js';

export class EmailParser {
  private cache = new Map<string, ParsedEmail>();
  private maxSize: number;

  constructor(
    private readonly filesystem: FilesystemService,
    maxSize = PARSER_CACHE_SIZE,
  ) {
    this.maxSize = maxSize;
  }

  async parse(filePath: string): Promise<ParsedEmail> {
    const cached = this.cache.get(filePath);
    if (cached) {
      // Promote to most-recently-used position
      this.cache.delete(filePath);
      this.cache.set(filePath, cached);
      return cached;
    }

    const buffer = this.filesystem.readFile(filePath);
    const parsed = await simpleParser(buffer);

    const header: EmailHeader = {
      messageId: parsed.messageId ?? `<unknown-${Buffer.from(filePath).toString('base64url')}@eml-mcp>`,
      from: this.formatAddressText(parsed.from?.value?.[0]),
      to: (parsed.to ? (Array.isArray(parsed.to) ? parsed.to : [parsed.to]) : [])
        .flatMap(a => a.value.map(v => v.address ?? v.name ?? '')),
      cc: (parsed.cc ? (Array.isArray(parsed.cc) ? parsed.cc : [parsed.cc]) : [])
        .flatMap(a => a.value.map(v => v.address ?? v.name ?? '')),
      bcc: (parsed.bcc ? (Array.isArray(parsed.bcc) ? parsed.bcc : [parsed.bcc]) : [])
        .flatMap(a => a.value.map(v => v.address ?? v.name ?? '')),
      subject: parsed.subject ?? '',
      date: parsed.date ?? new Date(0),
      filePath,
    };

    const attachments: Attachment[] = (parsed.attachments ?? [])
      .filter(a => a.contentDisposition === 'attachment' || a.filename)
      .map(a => ({
        filename: a.filename ?? 'unnamed',
        contentType: a.contentType ?? 'application/octet-stream',
        size: a.size ?? (a.content?.length ?? 0),
        contentId: a.contentId,
      }));

    const email: ParsedEmail = {
      header,
      textBody: parsed.text ?? undefined,
      htmlBody: parsed.html ? parsed.html : undefined,
      attachments,
    };

    this.evictIfFull();
    this.cache.set(filePath, email);
    return email;
  }

  invalidate(filePath: string): void {
    this.cache.delete(filePath);
  }

  /** Fresh parse (uncached) that includes attachment content buffers for recomposition. */
  async parseForRecompose(filePath: string): Promise<{
    header: EmailHeader;
    textBody?: string;
    htmlBody?: string;
    attachments: RecomposeAttachment[];
  }> {
    const buffer = this.filesystem.readFile(filePath);
    const parsed = await simpleParser(buffer);

    const header: EmailHeader = {
      messageId: parsed.messageId ?? `<unknown-${Buffer.from(filePath).toString('base64url')}@eml-mcp>`,
      from: this.formatAddressText(parsed.from?.value?.[0]),
      to: (parsed.to ? (Array.isArray(parsed.to) ? parsed.to : [parsed.to]) : [])
        .flatMap(a => a.value.map(v => v.address ?? v.name ?? '')),
      cc: (parsed.cc ? (Array.isArray(parsed.cc) ? parsed.cc : [parsed.cc]) : [])
        .flatMap(a => a.value.map(v => v.address ?? v.name ?? '')),
      bcc: (parsed.bcc ? (Array.isArray(parsed.bcc) ? parsed.bcc : [parsed.bcc]) : [])
        .flatMap(a => a.value.map(v => v.address ?? v.name ?? '')),
      subject: parsed.subject ?? '',
      date: parsed.date ?? new Date(0),
      filePath,
    };

    const attachments: RecomposeAttachment[] = (parsed.attachments ?? [])
      .filter(a => a.content && (a.contentDisposition === 'attachment' || a.filename))
      .map(a => ({
        filename: a.filename ?? 'unnamed',
        contentType: a.contentType ?? 'application/octet-stream',
        content: a.content as Buffer,
        cid: a.contentId,
        contentDisposition: a.contentDisposition ?? 'attachment',
      }));

    return { header, textBody: parsed.text ?? undefined, htmlBody: parsed.html || undefined, attachments };
  }

  private formatAddressText(addr?: { name?: string; address?: string }): string {
    if (!addr) return '';
    const name = addr.name ?? '';
    const address = addr.address ?? '';
    if (name && address) return `${name} <${address}>`;
    return address || name;
  }

  private evictIfFull(): void {
    if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }
  }
}
