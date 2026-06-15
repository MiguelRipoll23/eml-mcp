import { describe, it, expect, afterEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import { getEmlPaths } from '../../src/constants/paths.js';

afterEach(() => {
  delete process.env.EML_HOME;
});

describe('getEmlPaths', () => {
  it('uses ~/.eml as default', () => {
    const p = getEmlPaths();
    const expected = path.join(os.homedir(), '.eml');
    expect(p.emlHome).toBe(expected);
    expect(p.indexDbPath).toBe(path.join(expected, 'index.db'));
    expect(p.configPath).toBe(path.join(expected, 'config.json'));
    expect(p.workflowsDir).toBe(path.join(expected, 'workflows'));
    expect(p.promptsDir).toBe(path.join(expected, 'prompts'));
  });

  it('resolves explicit base argument', () => {
    const base = path.resolve('custom/data');
    const p = getEmlPaths('custom/data');
    expect(p.emlHome).toBe(base);
    expect(p.indexDbPath).toBe(path.join(base, 'index.db'));
    expect(p.configPath).toBe(path.join(base, 'config.json'));
    expect(p.workflowsDir).toBe(path.join(base, 'workflows'));
    expect(p.promptsDir).toBe(path.join(base, 'prompts'));
  });

  it('uses EML_HOME env var when no argument given', () => {
    const envBase = path.resolve('env/data');
    process.env.EML_HOME = envBase;
    const p = getEmlPaths();
    expect(p.emlHome).toBe(envBase);
  });

  it('flag argument takes precedence over EML_HOME env var', () => {
    process.env.EML_HOME = path.resolve('env/data');
    const flagBase = path.resolve('flag/data');
    const p = getEmlPaths('flag/data');
    expect(p.emlHome).toBe(flagBase);
  });
});
