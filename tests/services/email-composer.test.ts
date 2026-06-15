import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EmailComposer } from '../../src/services/email-composer.js';
import { FilesystemService } from '../../src/services/filesystem-service.js';

describe('EmailComposer', () => {
  let tmpDir: string;
  let filesystemService: FilesystemService;
  let composer: EmailComposer;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eml-mcp-comp-'));
    filesystemService = new FilesystemService();
    composer = new EmailComposer(filesystemService, tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('compose', () => {
    it('writes a .eml file and returns its path', async () => {
      const filePath = await composer.compose({
        to: ['bob@example.com'],
        subject: 'Hello Bob',
        textBody: 'This is the message body.',
      });

      expect(fs.existsSync(filePath)).toBe(true);
      expect(filePath.endsWith('.eml')).toBe(true);
    });

    it('written .eml contains subject and body', async () => {
      const filePath = await composer.compose({
        to: ['carol@example.com'],
        subject: 'Meeting Tomorrow',
        textBody: 'Please confirm your attendance.',
      });

      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toContain('Meeting Tomorrow');
      expect(content).toContain('Please confirm your attendance');
    });

    it('includes CC and BCC fields when provided', async () => {
      const filePath = await composer.compose({
        to: ['bob@example.com'],
        cc: ['alice@example.com'],
        subject: 'CC test',
        textBody: 'body',
      });

      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toContain('alice@example.com');
    });

    it('generates multipart/alternative with HTML part when only textBody is provided', async () => {
      const filePath = await composer.compose({
        to: ['bob@example.com'],
        subject: 'Line break test',
        textBody: 'Paragraph one.\n\nParagraph two.',
      });

      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toContain('multipart/alternative');
      expect(content).toContain('text/html');
      expect(content).toContain('<p>');
    });

    it('reflows single newlines (RFC 2822 hard-wrap) and splits on blank lines', async () => {
      const filePath = await composer.compose({
        to: ['bob@example.com'],
        subject: 'Reflow test',
        textBody: 'This long sentence wraps\nat 76 chars artificially.\n\nNew paragraph here.',
      });

      const content = fs.readFileSync(filePath, 'utf-8');
      // Single newline should be reflowed (no visible break between the two parts)
      expect(content).toContain('This long sentence wraps at 76 chars artificially.');
      // Blank line should produce a paragraph break
      expect(content).toContain('<p>New paragraph here.</p>');
    });

    it('uses CRLF line endings throughout the .eml', async () => {
      const filePath = await composer.compose({
        to: ['bob@example.com'],
        subject: 'CRLF test',
        textBody: 'Line one\nLine two',
      });

      const bytes = fs.readFileSync(filePath);
      let crlf = 0;
      let lfOnly = 0;
      for (let i = 0; i < bytes.length; i++) {
        if (bytes[i] === 0x0d && bytes[i + 1] === 0x0a) crlf++;
        else if (bytes[i] === 0x0a && (i === 0 || bytes[i - 1] !== 0x0d)) lfOnly++;
      }
      expect(crlf).toBeGreaterThan(0);
      expect(lfOnly).toBe(0);
    });
    it('includes X-Unsent: 1 header in every composed draft', async () => {
      const filePath = await composer.compose({
        to: ['bob@example.com'],
        subject: 'Draft test',
        textBody: 'body',
      });

      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toMatch(/^X-Unsent:\s*1/im);
    });

  });
});
