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
}

export interface EmailProcessResult {
  messageId: string;
  filePath: string;
  subject: string;
  from: string;
  matches: WorkflowMatch[];
}

export function buildPreamble(filename: string, keywords: string[], preambleExtra?: string): string {
  const kw = keywords.join(', ');
  const base = `## Email to process\n\n**File:** \`${filename}\`\n**Keywords:** ${kw}\n\nFetch this email: call \`search_emails\` with \`folder: "inbox"\` and \`filePath: "${filename}"\` to locate the record, then \`get_email\` with the returned path for the full content. To find related emails for context, use \`search_emails\` with the keywords above.`;
  return preambleExtra ? `${base}\n\n${preambleExtra}\n\n` : `${base}\n\n`;
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? '');
}

function emailMatchesWorkflow(
  subject: string,
  body: string,
  workflow: LoadedWorkflowConfig,
): boolean {
  const lower = { subject: subject.toLowerCase(), body: body.toLowerCase() };
  return workflow.conditions.keywords.some(keyword => {
    const kw = keyword.toLowerCase();
    return workflow.conditions.fields.some(field => lower[field]?.includes(kw));
  });
}

export async function processEmail(
  filePath: string,
  workflows: LoadedWorkflowConfig[],
  parser: EmailParser,
  tracker: ProcessedTracker,
  promptsDirectory: string,
): Promise<EmailProcessResult | null> {
  const parsed = await parser.parse(filePath);
  const messageId = parsed.header.messageId;

  if (tracker.isProcessed(messageId)) return null;

  const subject = parsed.header.subject ?? '';
  const from = parsed.header.from ?? '';
  const body = parsed.textBody ?? '';
  const date = parsed.header.date.toLocaleString();

  const matches: WorkflowMatch[] = [];

  for (const workflow of workflows) {
    if (!emailMatchesWorkflow(subject, body, workflow)) continue;

    const promptFilePath = path.join(promptsDirectory, `${workflow.sourceFile}.md`);
    const promptTemplate = fs.readFileSync(promptFilePath, 'utf-8');
    const vars = { subject, from, body, date, file: filePath };
    const renderedPrompt = renderTemplate(promptTemplate, vars);

    const filename = path.basename(filePath);
    const preamble = buildPreamble(filename, workflow.conditions.keywords, workflow.preambleExtra);
    const fullPrompt = preamble + renderedPrompt;

    const promptFile = path.join(os.tmpdir(), `eml-mcp-${messageId.replace(/[^a-zA-Z0-9]/g, '_')}.md`);
    fs.writeFileSync(promptFile, fullPrompt, 'utf-8');

    const command = renderTemplate(workflow.command, { prompt_file: promptFile });
    const effectiveCwd = workflow.workingDirectory ?? os.homedir();
    const proc = spawn('wt.exe', ['pwsh.exe', '-NoExit', '-Command', command], {
      detached: true,
      stdio: 'ignore',
      cwd: effectiveCwd,
      windowsHide: false,
    });
    proc.on('error', () => { /* wt.exe not found or failed to launch — swallow to prevent crash */ });
    proc.unref();

    matches.push({ workflowName: workflow.name });
  }

  tracker.markProcessed(messageId);
  return { messageId, filePath, subject, from, matches };
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
  const proc = spawn('wt.exe', ['pwsh.exe', '-NoExit', '-Command', command], {
    detached: true,
    stdio: 'ignore',
    cwd: effectiveCwd,
    windowsHide: false,
  });
  proc.on('error', () => { /* wt.exe not found or failed to launch — swallow to prevent crash */ });
  proc.unref();
}

export function openWorkflowPromptFile(workflow: LoadedWorkflowConfig, promptsDirectory: string): void {
  const filePath = path.join(promptsDirectory, `${workflow.sourceFile}.md`);
  const proc = spawn('cmd.exe', ['/c', 'start', '', filePath], {
    detached: true,
    stdio: 'ignore',
  });
  proc.unref();
}
