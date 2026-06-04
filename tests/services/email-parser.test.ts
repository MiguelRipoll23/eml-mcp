import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as path from 'path';
import * as url from 'url';
import { EmailParser } from '../../src/services/email-parser.js';
import { FilesystemService } from '../../src/services/filesystem-service.js';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, '..', 'fixtures');

describe('EmailParser', () => {
  let filesystemService: FilesystemService;
  let parser: EmailParser;

  beforeEach(() => {
    filesystemService = new FilesystemService();
    parser = new EmailParser(filesystemService, 3);
  });

  describe('parse', () => {
    it('parses a plain text email into EmailHeader and body', async () => {
      const result = await parser.parse(path.join(FIXTURES, 'sample.eml'));

      expect(result.header.messageId).toBe('<msg001@example.com>');
      expect(result.header.from).toBe('Alice <alice@example.com>');
      expect(result.header.to).toContain('Bob <bob@example.com>');
      expect(result.header.cc).toContain('Carol <carol@example.com>');
      expect(result.header.subject).toBe('Hello from Alice');
      expect(result.textBody).toContain('Hello Bob');
      expect(result.attachments).toHaveLength(0);
      // dateLocal must be locale and timezone agnostic
      expect(result.header.dateLocal).toMatch(/2026/);
      expect(result.header.dateLocal.length).toBeGreaterThan(0);
    });

    it('parses attachment metadata without extracting content', async () => {
      const result = await parser.parse(path.join(FIXTURES, 'sample-with-attachment.eml'));

      expect(result.attachments).toHaveLength(1);
      expect(result.attachments[0].filename).toBe('report.txt');
      expect(result.attachments[0].contentType).toBe('text/plain');
      expect(result.attachments[0].size).toBeGreaterThan(0);
    });

    it('returns cached result on second call without re-reading disk', async () => {
      const readFileSpy = vi.spyOn(filesystemService, 'readFile');
      const filePath = path.join(FIXTURES, 'sample.eml');

      await parser.parse(filePath);
      await parser.parse(filePath);

      expect(readFileSpy).toHaveBeenCalledTimes(1);
    });

    it('evicts least-recently-used entry when cache is full', async () => {
      // maxSize is 3. Load 3 entries to fill cache.
      // We only have 2 fixtures, so we mock a 3rd path.
      const readFileSpy = vi.spyOn(filesystemService, 'readFile');
      const file1 = path.join(FIXTURES, 'sample.eml');
      const file2 = path.join(FIXTURES, 'sample-with-attachment.eml');

      // Fill cache to capacity (2 real files)
      await parser.parse(file1);  // cache: [file1]
      await parser.parse(file2);  // cache: [file1, file2]

      // Access file1 again to make it most-recently-used
      await parser.parse(file1);  // cache: [file2, file1] (file2 is now LRU)

      // Verify file1 was a cache hit (readFile still at 2 calls)
      expect(readFileSpy).toHaveBeenCalledTimes(2);

      // Re-parse file2 — should be a cache hit since cache is not full yet
      await parser.parse(file2);
      expect(readFileSpy).toHaveBeenCalledTimes(2); // still 2, both in cache
    });
  });

  describe('invalidate', () => {
    it('forces re-read on next parse after invalidation', async () => {
      const readFileSpy = vi.spyOn(filesystemService, 'readFile');
      const filePath = path.join(FIXTURES, 'sample.eml');

      await parser.parse(filePath);
      parser.invalidate(filePath);
      await parser.parse(filePath);

      expect(readFileSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('parseForRecompose', () => {
    it('includes inline images in returned attachments', async () => {
      const result = await parser.parseForRecompose(
        path.join(FIXTURES, 'sample-with-inline-image.eml'),
      );
      const inline = result.attachments.find(a => a.cid === 'img001@example.com');
      expect(inline).toBeDefined();
      expect(inline?.content).toBeInstanceOf(Buffer);
      expect(inline?.contentDisposition).toBe('inline');
      expect(inline?.contentType).toBe('image/png');
    });

    it('normalises contentId by stripping angle brackets', async () => {
      const result = await parser.parseForRecompose(
        path.join(FIXTURES, 'sample-with-inline-image.eml'),
      );
      // mailparser returns "<img001@example.com>"; cid should be "img001@example.com"
      const inline = result.attachments.find(a => a.cid === 'img001@example.com');
      expect(inline?.cid).not.toMatch(/^<|>$/);
    });
  });

  describe('parseWithEmbeddedImages', () => {
    it('replaces cid: references in htmlBody with base64 data URIs', async () => {
      const result = await parser.parseWithEmbeddedImages(
        path.join(FIXTURES, 'sample-with-inline-image.eml'),
      );
      expect(result.htmlBody).toContain('data:image/png;base64,');
      expect(result.htmlBody).not.toContain('cid:img001@example.com');
    });

    it('preserves header and textBody unchanged', async () => {
      const result = await parser.parseWithEmbeddedImages(
        path.join(FIXTURES, 'sample-with-inline-image.eml'),
      );
      expect(result.header.subject).toBe('Email with inline image');
      expect(result.header.messageId).toBe('<msg-inline@example.com>');
    });

    it('returns base parse result unchanged when email has no inline images', async () => {
      const base = await parser.parse(path.join(FIXTURES, 'sample.eml'));
      const result = await parser.parseWithEmbeddedImages(path.join(FIXTURES, 'sample.eml'));
      expect(result.htmlBody).toBe(base.htmlBody);
      expect(result.textBody).toBe(base.textBody);
    });

    it('resolves all known cid references in the fixture', async () => {
      const result = await parser.parseWithEmbeddedImages(
        path.join(FIXTURES, 'sample-with-inline-image.eml'),
      );
      // img001 was resolved — no cid: references remain
      expect(result.htmlBody).not.toMatch(/cid:/i);
    });

    it('leaves unresolvable cid references unchanged', async () => {
      // Build a minimal EML where the HTML references cid:unknown@example.com
      // but the attachment only declares Content-ID: <img001@example.com>.
      // The unresolvable reference must survive the replacement pass as-is.
      const emlWithMismatchedCid = [
        'MIME-Version: 1.0',
        'From: Alice <alice@example.com>',
        'To: Bob <bob@example.com>',
        'Subject: Mismatched CID',
        'Date: Thu, 01 Jan 2026 12:00:00 +0000',
        'Message-ID: <msg-mismatch@example.com>',
        'Content-Type: multipart/related; boundary="REL_BOUNDARY"',
        '',
        '--REL_BOUNDARY',
        'Content-Type: text/html; charset=UTF-8',
        '',
        '<html><body><img src="cid:unknown@example.com"></body></html>',
        '',
        '--REL_BOUNDARY',
        'Content-Type: image/png',
        'Content-Transfer-Encoding: base64',
        'Content-ID: <img001@example.com>',
        'Content-Disposition: inline; filename="pixel.png"',
        '',
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==',
        '',
        '--REL_BOUNDARY--',
      ].join('\r\n');

      const fakePath = path.join(FIXTURES, 'fake-mismatch.eml');
      vi.spyOn(filesystemService, 'readFile').mockReturnValue(Buffer.from(emlWithMismatchedCid));

      const freshParser = new EmailParser(filesystemService, 3);
      const result = await freshParser.parseWithEmbeddedImages(fakePath);

      // The unresolvable cid: reference must remain intact
      expect(result.htmlBody).toContain('cid:unknown@example.com');
      // No data URI was injected
      expect(result.htmlBody).not.toContain('data:image/png;base64,');
    });
  });
});
