import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildPreamble, runWorkflowManually } from '../../../src/tui/services/workflow-runner.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { LoadedWorkflowConfig } from '../../../src/tui/types/workflow.types.js';

const mockUnref = vi.fn();
const mockOn = vi.fn().mockImplementation((event: string, cb: () => void) => {
  if (event === 'spawn') cb();
});
const mockSpawn = vi.fn().mockReturnValue({ on: mockOn, unref: mockUnref });

vi.mock('child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

describe('buildPreamble', () => {
  it('includes filename in header and search call', () => {
    const result = buildPreamble('alert-2026.eml', ['grr', 'gis']);
    expect(result).toContain('**File:** `alert-2026.eml`');
    expect(result).toContain('filePath: "alert-2026.eml"');
  });

  it('includes folder inbox in search call', () => {
    const result = buildPreamble('alert-2026.eml', ['grr', 'gis']);
    expect(result).toContain('folder: "inbox"');
  });

  it('lists workflow keywords', () => {
    const result = buildPreamble('alert-2026.eml', ['grr', 'gis', 'adms']);
    expect(result).toContain('**Keywords:** grr, gis, adms');
  });

  it('does not append extra content when preambleExtra is absent', () => {
    const result = buildPreamble('alert-2026.eml', ['grr']);
    const lines = result.trimEnd().split('\n');
    expect(lines[lines.length - 1].trim()).not.toBe('');
    expect(result).not.toContain('undefined');
    expect(result).not.toContain('null');
  });

  it('appends preambleExtra when provided', () => {
    const extra = 'Only process if addressed to me, Miguel.';
    const result = buildPreamble('alert-2026.eml', ['spot'], extra);
    expect(result).toContain(extra);
    const baseEnd = result.indexOf(extra);
    expect(result.substring(0, baseEnd).trimEnd().length).toBeGreaterThan(0);
  });
});

describe('runWorkflowManually', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eml-test-'));
    mockSpawn.mockClear();
    mockUnref.mockClear();
    mockOn.mockClear();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeWorkflow(overrides: Partial<LoadedWorkflowConfig> = {}): LoadedWorkflowConfig {
    return {
      name: 'Test Workflow',
      conditions: { operator: 'OR', fields: ['subject', 'body'], keywords: ['bug'] },
      command: 'claude --pt {prompt_file}',
      sourceFile: 'test-workflow',
      ...overrides,
    };
  }

  it('writes a temp file containing the custom preamble', async () => {
    const promptsDir = tmpDir;
    fs.writeFileSync(path.join(promptsDir, 'test-workflow.md'), 'Do the thing.');

    const workflow = makeWorkflow();
    await runWorkflowManually(workflow, 'User report: something broke', promptsDir);

    expect(mockSpawn).toHaveBeenCalledOnce();
    const [, args] = mockSpawn.mock.calls[0] as [string, string[]];
    const commandArg = args[args.length - 1]; // last arg is the command string
    const promptFileMatch = commandArg.match(/--pt\s+"?([^"\s]+)"?/);
    expect(promptFileMatch).not.toBeNull();
    const promptFilePath = promptFileMatch![1];
    const content = fs.readFileSync(promptFilePath, 'utf-8');
    expect(content).toContain('User report: something broke');
  });

  it('appends the rendered prompt template after the custom preamble', async () => {
    const promptsDir = tmpDir;
    fs.writeFileSync(path.join(promptsDir, 'test-workflow.md'), 'Create a GitHub issue.');

    const workflow = makeWorkflow();
    await runWorkflowManually(workflow, 'My context here', promptsDir);

    const [, args] = mockSpawn.mock.calls[0] as [string, string[]];
    const commandArg = args[args.length - 1];
    const promptFilePath = commandArg.match(/--pt\s+"?([^"\s]+)"?/)![1];
    const content = fs.readFileSync(promptFilePath, 'utf-8');
    expect(content).toContain('Create a GitHub issue.');
  });

  it('does NOT include email fetch instructions in the prompt', async () => {
    const promptsDir = tmpDir;
    fs.writeFileSync(path.join(promptsDir, 'test-workflow.md'), 'Instructions.');

    const workflow = makeWorkflow();
    await runWorkflowManually(workflow, 'Custom context', promptsDir);

    const [, args] = mockSpawn.mock.calls[0] as [string, string[]];
    const commandArg = args[args.length - 1];
    const promptFilePath = commandArg.match(/--pt\s+"?([^"\s]+)"?/)![1];
    const content = fs.readFileSync(promptFilePath, 'utf-8');
    expect(content).not.toContain('search_emails');
    expect(content).not.toContain('get_email');
  });

  it('spawns wt.exe with the workflow command', async () => {
    const promptsDir = tmpDir;
    fs.writeFileSync(path.join(promptsDir, 'test-workflow.md'), 'Do stuff.');

    const workflow = makeWorkflow({ command: 'claude --pt {prompt_file}' });
    await runWorkflowManually(workflow, 'context', promptsDir);

    expect(mockSpawn).toHaveBeenCalledWith(
      'wt.exe',
      expect.arrayContaining(['pwsh.exe', '-NoExit', '-Command', expect.stringContaining('claude --pt')]),
      expect.objectContaining({ detached: true }),
    );
  });

  it('uses workingDirectory when provided', async () => {
    const promptsDir = tmpDir;
    fs.writeFileSync(path.join(promptsDir, 'test-workflow.md'), 'Do stuff.');

    const workflow = makeWorkflow({ workingDirectory: '/custom/cwd' });
    await runWorkflowManually(workflow, 'context', promptsDir);

    expect(mockSpawn).toHaveBeenCalledWith(
      'wt.exe',
      expect.arrayContaining(['-d', '/custom/cwd']),
      expect.objectContaining({ detached: true }),
    );
  });

  it('renders template vars as empty strings for email-specific placeholders', async () => {
    const promptsDir = tmpDir;
    fs.writeFileSync(path.join(promptsDir, 'test-workflow.md'), 'Subject: {subject}, From: {from}');

    const workflow = makeWorkflow();
    await runWorkflowManually(workflow, 'context', promptsDir);

    const [, args] = mockSpawn.mock.calls[0] as [string, string[]];
    const commandArg = args[args.length - 1];
    const promptFilePath = commandArg.match(/--pt\s+"?([^"\s]+)"?/)![1];
    const content = fs.readFileSync(promptFilePath, 'utf-8');
    expect(content).toContain('Subject: , From: ');
  });

  it('places customPreamble before the prompt template, separated by a blank line', async () => {
    const promptsDir = tmpDir;
    fs.writeFileSync(path.join(promptsDir, 'test-workflow.md'), 'TEMPLATE_CONTENT');

    const workflow = makeWorkflow();
    await runWorkflowManually(workflow, 'MY_PREAMBLE', promptsDir);

    const [, args] = mockSpawn.mock.calls[0] as [string, string[]];
    const commandArg = args[args.length - 1];
    const promptFilePath = commandArg.match(/--pt\s+"?([^"\s]+)"?/)![1];
    const content = fs.readFileSync(promptFilePath, 'utf-8');
    expect(content).toBe('MY_PREAMBLE\n\nTEMPLATE_CONTENT');
  });
});
