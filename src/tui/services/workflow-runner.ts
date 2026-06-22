import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import type { EmailParser } from '../../services/email-parser.js';
import type { LoadedWorkflowConfig } from '../types/workflow.types.js';

interface ProcessedTracker {
  isProcessed(messageId: string): boolean;
  markProcessed(messageId: string): void;
}

export interface WorkflowMatch {
  workflowName: string;
  matchedKeywords: string[];
}

export interface WorkflowSkip {
  workflowName: string;
  disallowedWordsFound: string[];
}

export interface EmailProcessResult {
  messageId: string;
  filePath: string;
  subject: string;
  from: string;
  globalSkip?: { disallowedWordsFound: string[] };
  matches: WorkflowMatch[];
  skips: WorkflowSkip[];
}

export function buildPreamble(filePath: string, keywords: string[], preambleExtra?: string): string {
  const kw = keywords.join(', ');
  const base = `## Email to process\n\n**File:** \`${filePath}\`\n**Keywords:** ${kw}\n\nRead this email: run \`eml-cli email get "${filePath}"\` for the full content. To find related emails for context, run \`eml-cli email search --keyword "keyword"\` (replace \`keyword\` with relevant terms from the list above).`;
  return preambleExtra ? `${base}\n\n${preambleExtra}\n\n` : `${base}\n\n`;
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? '');
}

function spawnTerminal(command: string, cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('wt.exe', ['new-tab', '-d', cwd, 'pwsh.exe', '-NoExit', '-Command', command], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });
    proc.on('error', reject);
    proc.on('spawn', resolve);
    proc.unref();
  });
}

function containsWord(text: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![a-zA-Z0-9])${escaped}(?![a-zA-Z0-9])`).test(text);
}

function getMatchedKeywords(
  subject: string,
  body: string,
  workflow: LoadedWorkflowConfig,
): string[] {
  const lower = { subject: subject.toLowerCase(), body: body.toLowerCase() };
  return workflow.conditions.keywords.filter(keyword => {
    const kw = keyword.toLowerCase();
    return workflow.conditions.fields.some(field => lower[field] !== undefined && containsWord(lower[field], kw));
  });
}

function getDisallowedWordsFound(
  subject: string,
  body: string,
  workflow: LoadedWorkflowConfig,
): string[] {
  if (!workflow.disallowedWords?.length) return [];
  const lower = { subject: subject.toLowerCase(), body: body.toLowerCase() };
  return workflow.disallowedWords.filter(word => {
    const w = word.toLowerCase();
    return workflow.conditions.fields.some(field => lower[field] !== undefined && containsWord(lower[field], w));
  });
}

export function findGlobalDisallowedWords(
  subject: string,
  body: string,
  globalWords: string[],
): string[] {
  if (!globalWords.length) return [];
  const lowerSubject = subject.toLowerCase();
  const lowerBody = body.toLowerCase();
  return globalWords.filter(word => {
    const w = word.toLowerCase();
    return containsWord(lowerSubject, w) || containsWord(lowerBody, w);
  });
}

export async function processEmail(
  filePath: string,
  workflows: LoadedWorkflowConfig[],
  parser: EmailParser,
  tracker: ProcessedTracker,
  promptsDirectory: string,
  globalDisallowedWords: string[] = [],
): Promise<EmailProcessResult | null> {
  const parsed = await parser.parse(filePath);
  const messageId = parsed.header.messageId;

  if (tracker.isProcessed(messageId)) return null;

  const subject = parsed.header.subject ?? '';
  const from = parsed.header.from ?? '';
  const body = parsed.textBody ?? '';
  const date = parsed.header.date.toLocaleString();

  const globalDisallowed = findGlobalDisallowedWords(subject, body, globalDisallowedWords);
  if (globalDisallowed.length > 0) {
    tracker.markProcessed(messageId);
    return { messageId, filePath, subject, from, globalSkip: { disallowedWordsFound: globalDisallowed }, matches: [], skips: [] };
  }

  const matches: WorkflowMatch[] = [];
  const skips: WorkflowSkip[] = [];

  const scored = workflows
    .map(workflow => ({ workflow, matchedKeywords: getMatchedKeywords(subject, body, workflow) }))
    .filter(({ matchedKeywords }) => matchedKeywords.length > 0);

  const maxCount = scored.reduce((max, { matchedKeywords }) => Math.max(max, matchedKeywords.length), 0);
  const bestMatches = scored.filter(({ matchedKeywords }) => matchedKeywords.length === maxCount);

  for (const { workflow, matchedKeywords } of bestMatches) {
    const disallowedWordsFound = getDisallowedWordsFound(subject, body, workflow);
    if (disallowedWordsFound.length > 0) {
      skips.push({ workflowName: workflow.name, disallowedWordsFound });
      continue;
    }

    const promptFilePath = path.join(promptsDirectory, `${workflow.sourceFile}.md`);
    const promptTemplate = fs.readFileSync(promptFilePath, 'utf-8');
    const vars = { subject, from, body, date, file: filePath };
    const renderedPrompt = renderTemplate(promptTemplate, vars);

    const preamble = buildPreamble(filePath, workflow.conditions.keywords, workflow.preambleExtra);
    const fullPrompt = preamble + renderedPrompt;

    const promptFile = path.join(os.tmpdir(), `eml-mcp-${messageId.replace(/[^a-zA-Z0-9]/g, '_')}.md`);
    fs.writeFileSync(promptFile, fullPrompt, 'utf-8');

    const command = renderTemplate(workflow.command, { prompt_file: promptFile });
    const effectiveCwd = workflow.workingDirectory ?? os.homedir();
    await spawnTerminal(command, effectiveCwd);

    matches.push({ workflowName: workflow.name, matchedKeywords });
  }

  tracker.markProcessed(messageId);
  return { messageId, filePath, subject, from, matches, skips };
}

export async function runWorkflowManually(
  workflow: LoadedWorkflowConfig,
  customPreamble: string,
  promptsDirectory: string,
): Promise<void> {
  const promptFilePath = path.join(promptsDirectory, `${workflow.sourceFile}.md`);
  const promptTemplate = fs.readFileSync(promptFilePath, 'utf-8');
  const renderedPrompt = renderTemplate(promptTemplate, {});
  const fullPrompt = `${customPreamble}\n\n${renderedPrompt}`;

  const tmpFile = path.join(
    os.tmpdir(),
    `eml-mcp-manual-${Date.now()}.md`,
  );
  fs.writeFileSync(tmpFile, fullPrompt, 'utf-8');

  const command = renderTemplate(workflow.command, { prompt_file: tmpFile });
  const effectiveCwd = workflow.workingDirectory ?? os.homedir();
  await spawnTerminal(command, effectiveCwd);
}

export function openWorkflowPromptFile(workflow: LoadedWorkflowConfig, promptsDirectory: string): void {
  const filePath = path.join(promptsDirectory, `${workflow.sourceFile}.md`);
  const proc = spawn('cmd.exe', ['/c', 'start', '', filePath], {
    detached: true,
    stdio: 'ignore',
  });
  proc.unref();
}
