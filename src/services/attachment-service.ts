import * as os from 'os';
import * as path from 'path';
import { simpleParser } from 'mailparser';
import type { EmailParser } from './email-parser.js';
import type { FilesystemService } from './filesystem-service.js';
import type { Attachment } from '../types/email.types.js';

export class AttachmentService {
  constructor(
    private readonly parser: EmailParser,
    private readonly filesystem: FilesystemService,
  ) {}

  async list(filePath: string): Promise<Attachment[]> {
    const email = await this.parser.parse(filePath);
    return email.attachments;
  }

  async extract(filePath: string, filename: string, outputDir: string): Promise<string> {
    const buffer = this.filesystem.readFile(filePath);
    const parsed = await simpleParser(buffer);
    const attachment = parsed.attachments.find(candidate => candidate.filename === filename);

    if (!attachment) {
      throw new Error(`ATTACHMENT_NOT_FOUND: "${filename}" not found in ${filePath}`);
    }

    const savedPath = this.filesystem.safePath(outputDir, filename);
    this.filesystem.writeFile(savedPath, attachment.content);
    return savedPath;
  }

  async extractAll(filePath: string, outputDir: string): Promise<string[]> {
    const buffer = this.filesystem.readFile(filePath);
    const parsed = await simpleParser(buffer);
    const saved: string[] = [];

    for (const attachment of parsed.attachments) {
      // Inline attachments (contentId only, no filename) are skipped
      if (!attachment.filename) continue;
      const savedPath = this.filesystem.safePath(outputDir, attachment.filename);
      this.filesystem.writeFile(savedPath, attachment.content);
      saved.push(savedPath);
    }

    return saved;
  }

  async openAttachment(filePath: string, filename: string): Promise<string> {
    const buffer = this.filesystem.readFile(filePath);
    const parsed = await simpleParser(buffer);
    const messageId = parsed.messageId ?? Buffer.from(filePath).toString('base64url');
    const tempDir = path.join(os.tmpdir(), 'eml-mcp', messageId.replace(/[<>@]/g, '_'));

    const attachment = parsed.attachments.find(candidate => candidate.filename === filename);
    if (!attachment) {
      throw new Error(`ATTACHMENT_NOT_FOUND: "${filename}" not found in ${filePath}`);
    }

    const tempPath = this.filesystem.safePath(tempDir, filename);
    this.filesystem.writeFile(tempPath, attachment.content);
    await this.filesystem.openWithDefaultApp(tempPath);
    return tempPath;
  }
}
