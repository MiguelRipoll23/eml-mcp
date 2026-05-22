import nodemailer from 'nodemailer';
import * as path from 'path';
import * as fs from 'fs';
import type { FilesystemService } from './filesystem-service.js';

export interface RecomposeAttachment {
  filename: string;
  contentType?: string;
  content: Buffer;
  cid?: string;
  contentDisposition?: string;
}

export interface ComposeOptions {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  textBody?: string;
  htmlBody?: string;
  /** Paths to files on disk to attach */
  attachmentPaths?: string[];
  /** Already-loaded attachment buffers (from an existing .eml) */
  bufferedAttachments?: RecomposeAttachment[];
  /** Write to this exact path instead of auto-generating a filename */
  outputPath?: string;
}

export class EmailComposer {
  constructor(
    private readonly filesystem: FilesystemService,
    private readonly outputDir: string,
    private readonly draftFrom: string = 'draft@eml-mcp',
  ) {}

  async compose(options: ComposeOptions): Promise<string> {
    const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });

    const pathAttachments = options.attachmentPaths?.map(attachmentPath => ({
      filename: path.basename(attachmentPath),
      path: attachmentPath,
    })) ?? [];

    const bufferAttachments = options.bufferedAttachments?.map(a => ({
      filename: a.filename,
      contentType: a.contentType,
      content: a.content,
      cid: a.cid,
      contentDisposition: a.contentDisposition as 'attachment' | 'inline' | undefined,
    })) ?? [];

    const info = await transport.sendMail({
      from: this.draftFrom,
      to: options.to,
      cc: options.cc,
      bcc: options.bcc,
      subject: options.subject,
      text: options.textBody,
      html: options.htmlBody,
      attachments: [...bufferAttachments, ...pathAttachments],
    });

    const emailMessageBuffer = info.message as Buffer;
    const filePath = options.outputPath ?? path.join(this.outputDir, this.buildFilename(options.subject));

    if (options.outputPath) {
      // Atomic overwrite: write to a temp file then rename
      const tmpPath = `${filePath}.tmp`;
      fs.writeFileSync(tmpPath, emailMessageBuffer);
      fs.renameSync(tmpPath, filePath);
    } else {
      this.filesystem.writeFile(filePath, emailMessageBuffer);
    }

    return filePath;
  }

  async composeAndOpen(options: ComposeOptions): Promise<string> {
    const filePath = await this.compose(options);
    await this.filesystem.openWithDefaultApp(filePath);
    return filePath;
  }

  private buildFilename(subject: string): string {
    const timestamp = Date.now();
    const safe = subject.replace(/[^a-zA-Z0-9\-_\s]/g, '').replace(/\s+/g, '-').slice(0, 60);
    return `${timestamp}-${safe}.eml`;
  }
}
