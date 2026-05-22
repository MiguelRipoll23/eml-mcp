import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { FilesystemService } from '../../src/services/filesystem-service.js';

describe('FilesystemService', () => {
  let tmpDir: string;
  let service: FilesystemService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eml-mcp-test-'));
    service = new FilesystemService();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('walkDirectory', () => {
    it('finds .eml files recursively and ignores other extensions', () => {
      const sub = path.join(tmpDir, 'sub');
      fs.mkdirSync(sub);
      fs.writeFileSync(path.join(tmpDir, 'a.eml'), 'eml1');
      fs.writeFileSync(path.join(sub, 'b.eml'), 'eml2');
      fs.writeFileSync(path.join(tmpDir, 'ignore.txt'), 'txt');

      const results = service.walkDirectory(tmpDir);

      expect(results).toHaveLength(2);
      expect(results.map(r => path.basename(r.filePath)).sort()).toEqual(['a.eml', 'b.eml']);
      expect(results[0]).toHaveProperty('mtime');
      expect(results[0]).toHaveProperty('size');
    });

    it('returns empty array for directory with no .eml files', () => {
      fs.writeFileSync(path.join(tmpDir, 'readme.txt'), 'hello');
      expect(service.walkDirectory(tmpDir)).toEqual([]);
    });
  });

  describe('safePath', () => {
    it('returns resolved absolute path for valid filename', () => {
      const result = service.safePath(tmpDir, 'output.txt');
      expect(result).toBe(path.resolve(tmpDir, 'output.txt'));
    });

    it('throws INVALID_PATH for directory traversal with ../', () => {
      expect(() => service.safePath(tmpDir, '../secret.txt')).toThrow('INVALID_PATH');
    });

    it('throws INVALID_PATH for absolute path as filename', () => {
      expect(() => service.safePath(tmpDir, 'C:\\Windows\\system32\\evil.exe')).toThrow('INVALID_PATH');
    });
  });

  describe('readFile / writeFile', () => {
    it('round-trips a Buffer', () => {
      const filePath = path.join(tmpDir, 'test.bin');
      const content = Buffer.from([1, 2, 3, 255]);
      service.writeFile(filePath, content);
      expect(service.readFile(filePath)).toEqual(content);
    });

    it('round-trips a string', () => {
      const filePath = path.join(tmpDir, 'test.txt');
      service.writeFile(filePath, 'hello world');
      expect(service.readFile(filePath).toString()).toBe('hello world');
    });

    it('creates intermediate directories when they do not exist', () => {
      const nested = path.join(tmpDir, 'a', 'b', 'c', 'test.txt');
      service.writeFile(nested, 'nested content');
      expect(fs.existsSync(nested)).toBe(true);
      expect(fs.readFileSync(nested, 'utf-8')).toBe('nested content');
    });
  });
});
