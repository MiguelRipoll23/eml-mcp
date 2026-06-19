import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadDisallowedWords, saveDisallowedWords } from '../../../src/tui/services/disallowed-words-store.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eml-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('loadDisallowedWords', () => {
  it('returns empty array when file does not exist', () => {
    const filePath = path.join(tmpDir, 'disallowed-words.json');
    expect(loadDisallowedWords(filePath)).toEqual([]);
  });

  it('returns saved words when file exists', () => {
    const filePath = path.join(tmpDir, 'disallowed-words.json');
    fs.writeFileSync(filePath, JSON.stringify({ words: ['[JIRA]', 'ServiceNow'] }), 'utf-8');
    expect(loadDisallowedWords(filePath)).toEqual(['[JIRA]', 'ServiceNow']);
  });

  it('returns empty array when file is malformed JSON', () => {
    const filePath = path.join(tmpDir, 'disallowed-words.json');
    fs.writeFileSync(filePath, 'not valid json', 'utf-8');
    expect(loadDisallowedWords(filePath)).toEqual([]);
  });
});

describe('saveDisallowedWords', () => {
  it('writes words to the file', () => {
    const filePath = path.join(tmpDir, 'disallowed-words.json');
    saveDisallowedWords(['[JIRA]', 'ServiceNow'], filePath);
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(raw).toEqual({ words: ['[JIRA]', 'ServiceNow'] });
  });

  it('creates parent directory if it does not exist', () => {
    const filePath = path.join(tmpDir, 'nested', 'dir', 'disallowed-words.json');
    saveDisallowedWords(['word'], filePath);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('overwrites existing words', () => {
    const filePath = path.join(tmpDir, 'disallowed-words.json');
    saveDisallowedWords(['old'], filePath);
    saveDisallowedWords(['new1', 'new2'], filePath);
    expect(loadDisallowedWords(filePath)).toEqual(['new1', 'new2']);
  });
});
