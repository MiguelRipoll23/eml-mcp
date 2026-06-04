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
        .flatMap(a => a.value.map(v => this.formatAddressText(v))),
      cc: (parsed.cc ? (Array.isArray(parsed.cc) ? parsed.cc : [parsed.cc]) : [])
        .flatMap(a => a.value.map(v => this.formatAddressText(v))),
      bcc: (parsed.bcc ? (Array.isArray(parsed.bcc) ? parsed.bcc : [parsed.bcc]) : [])
        .flatMap(a => a.value.map(v => this.formatAddressText(v))),
      subject: parsed.subject ?? '',
      date: parsed.date ?? new Date(0),
      dateLocal: this.formatDateLocal(parsed.date ?? new Date(0)),
      filePath,
      inReplyTo: parsed.inReplyTo ?? undefined,
      references: this.normalizeReferences(parsed.references),
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

  async parseWithEmbeddedImages(filePath: string): Promise<ParsedEmail> {
    const base = await this.parse(filePath);
    if (!base.htmlBody) return base;

    // Second parse is needed: parse() discards attachment content buffers before caching.
    const buffer = this.filesystem.readFile(filePath);
    const parsed = await simpleParser(buffer);

    const inlineMap = new Map<string, { contentType: string; data: string }>();
    for (const att of parsed.attachments ?? []) {
      if (att.contentId && att.content) {
        const cid = att.contentId.replace(/^<|>$/g, '');
        inlineMap.set(cid, {
          contentType: att.contentType ?? 'image/png',
          data: (att.content as Buffer).toString('base64'),
        });
      }
    }

    if (inlineMap.size === 0) return base;

    const resolvedHtml = base.htmlBody.replace(
      /cid:([^\s"'>]+)/gi,
      (_, cid: string) => {
        const img = inlineMap.get(cid);
        return img ? `data:${img.contentType};base64,${img.data}` : `cid:${cid}`;
      },
    );

    return { ...base, htmlBody: resolvedHtml };
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
        .flatMap(a => a.value.map(v => this.formatAddressText(v))),
      cc: (parsed.cc ? (Array.isArray(parsed.cc) ? parsed.cc : [parsed.cc]) : [])
        .flatMap(a => a.value.map(v => this.formatAddressText(v))),
      bcc: (parsed.bcc ? (Array.isArray(parsed.bcc) ? parsed.bcc : [parsed.bcc]) : [])
        .flatMap(a => a.value.map(v => this.formatAddressText(v))),
      subject: parsed.subject ?? '',
      date: parsed.date ?? new Date(0),
      dateLocal: this.formatDateLocal(parsed.date ?? new Date(0)),
      filePath,
      inReplyTo: parsed.inReplyTo ?? undefined,
      references: this.normalizeReferences(parsed.references),
    };

    const attachments: RecomposeAttachment[] = (parsed.attachments ?? [])
      .filter(a => a.content && (
        a.contentDisposition === 'attachment' ||
        a.filename ||
        a.contentId
      ))
      .map(a => ({
        filename: a.filename ?? 'unnamed',
        contentType: a.contentType ?? 'application/octet-stream',
        content: a.content as Buffer,
        cid: a.contentId ? a.contentId.replace(/^<|>$/g, '') : undefined,
        contentDisposition: a.contentDisposition ?? 'inline',
      }));

    return { header, textBody: parsed.text ?? undefined, htmlBody: parsed.html || undefined, attachments };
  }

  private formatDateLocal(date: Date): string {
    const { locale, timeZone } = Intl.DateTimeFormat().resolvedOptions();
    return date.toLocaleString(locale, {
      timeZone,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private formatAddressText(addr?: { name?: string; address?: string }): string {
    if (!addr) return '';
    const name = addr.name ?? '';
    const address = addr.address ?? '';
    if (name && address) return `${name} <${address}>`;
    return address || name;
  }

  private normalizeReferences(refs: string | string[] | undefined): string[] | undefined {
    if (!refs) return undefined;
    const arr = Array.isArray(refs) ? refs : [refs];
    return arr.length ? arr : undefined;
  }

  private evictIfFull(): void {
    if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }
  }
}
