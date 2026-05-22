import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as url from 'url';
import { AttachmentService } from '../../src/services/attachment-service.js';
import { EmailParser } from '../../src/services/email-parser.js';
import { FilesystemService } from '../../src/services/filesystem-service.js';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, '..', 'fixtures');
const ATTACHMENT_EML = path.join(FIXTURES, 'sample-with-attachment.eml');

describe('AttachmentService', () => {
  let tmpDir: string;
  let filesystemService: FilesystemService;
  let parser: EmailParser;
  let service: AttachmentService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eml-mcp-att-'));
    filesystemService = new FilesystemService();
    parser = new EmailParser(filesystemService);
    service = new AttachmentService(parser, filesystemService);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('list', () => {
    it('returns attachment metadata for an email with attachments', async () => {
      const attachments = await service.list(ATTACHMENT_EML);
      expect(attachments).toHaveLength(1);
      expect(attachments[0].filename).toBe('report.txt');
      expect(attachments[0].size).toBeGreaterThan(0);
    });

    it('returns empty array for email with no attachments', async () => {
      const attachments = await service.list(path.join(FIXTURES, 'sample.eml'));
      expect(attachments).toHaveLength(0);
    });
  });

  describe('extract', () => {
    it('saves a named attachment to the output directory', async () => {
      const savedPath = await service.extract(ATTACHMENT_EML, 'report.txt', tmpDir);
      expect(fs.existsSync(savedPath)).toBe(true);
      expect(path.basename(savedPath)).toBe('report.txt');
    });

    it('throws ATTACHMENT_NOT_FOUND for unknown filename', async () => {
      await expect(service.extract(ATTACHMENT_EML, 'ghost.pdf', tmpDir))
        .rejects.toThrow('ATTACHMENT_NOT_FOUND');
    });
  });

  describe('extractAll', () => {
    it('saves all attachments and returns their paths', async () => {
      const paths = await service.extractAll(ATTACHMENT_EML, tmpDir);
      expect(paths).toHaveLength(1);
      expect(fs.existsSync(paths[0])).toBe(true);
    });
  });

  describe('openAttachment', () => {
    it('extracts attachment to temp dir and calls openWithDefaultApp', async () => {
      const openSpy = vi.spyOn(filesystemService, 'openWithDefaultApp').mockResolvedValue(undefined);
      const tempPath = await service.openAttachment(ATTACHMENT_EML, 'report.txt');
      expect(fs.existsSync(tempPath)).toBe(true);
      expect(path.basename(tempPath)).toBe('report.txt');
      expect(openSpy).toHaveBeenCalledWith(tempPath);
    });
  });
});
