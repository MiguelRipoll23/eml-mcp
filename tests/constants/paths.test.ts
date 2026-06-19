import { describe, it, expect } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import { getEmlPaths } from '../../src/constants/paths.js';

describe('getEmlPaths', () => {
  it('uses ~/.eml as default', () => {
    const p = getEmlPaths();
    const expected = path.join(os.homedir(), '.eml');
    expect(p.emlHome).toBe(expected);
    expect(p.indexDbPath).toBe(path.join(expected, 'index.db'));
    expect(p.configPath).toBe(path.join(expected, 'config.json'));
    expect(p.workflowsDir).toBe(path.join(expected, 'workflows'));
    expect(p.promptsDir).toBe(path.join(expected, 'prompts'));
    expect(p.disallowedWordsPath).toBe(path.join(expected, 'disallowed-words.json'));
  });

  it('resolves explicit base argument', () => {
    const base = path.resolve('custom/data');
    const p = getEmlPaths('custom/data');
    expect(p.emlHome).toBe(base);
    expect(p.indexDbPath).toBe(path.join(base, 'index.db'));
    expect(p.configPath).toBe(path.join(base, 'config.json'));
    expect(p.workflowsDir).toBe(path.join(base, 'workflows'));
    expect(p.promptsDir).toBe(path.join(base, 'prompts'));
    expect(p.disallowedWordsPath).toBe(path.join(base, 'disallowed-words.json'));
  });

  it('includes disallowedWordsPath under emlHome', () => {
    const base = path.resolve('tmp/test-eml');
    const p = getEmlPaths('tmp/test-eml');
    expect(p.disallowedWordsPath).toBe(path.join(base, 'disallowed-words.json'));
  });
});
