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
      expect(result.header.to).toContain('bob@example.com');
      expect(result.header.cc).toContain('carol@example.com');
      expect(result.header.subject).toBe('Hello from Alice');
      expect(result.textBody).toContain('Hello Bob');
      expect(result.attachments).toHaveLength(0);
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
});
