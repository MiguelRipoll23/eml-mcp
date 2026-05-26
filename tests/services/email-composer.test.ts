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
        textBody: 'Line one\nLine two\nLine three',
      });

      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toContain('multipart/alternative');
      expect(content).toContain('text/html');
      expect(content).toContain('<br>');
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
  });
});
