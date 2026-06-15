import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import type { EmailParser } from '../../services/email-parser.js';
import type { LoadedWorkflowConfig } from '../types/workflow.types.js';
import type { ProcessedStore } from './processed-store.js';

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
  store: ProcessedStore,
  promptsDirectory: string,
): Promise<EmailProcessResult | null> {
  const parsed = await parser.parse(filePath);
  const messageId = parsed.header.messageId;

  if (store.has(messageId)) return null;

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

    const promptFile = path.join(os.tmpdir(), `eml-mcp-${messageId.replace(/[^a-zA-Z0-9]/g, '_')}.md`);
    fs.writeFileSync(promptFile, renderedPrompt, 'utf-8');

    const command = renderTemplate(workflow.command, { prompt_file: promptFile });
    const effectiveCwd = workflow.workingDirectory ?? os.homedir();
    const proc = spawn('wt.exe', ['pwsh.exe', '-NoExit', '-Command', command], {
      detached: true,
      stdio: 'ignore',
      cwd: effectiveCwd,
      windowsHide: false,
    });
    proc.unref();

    matches.push({ workflowName: workflow.name });
  }

  store.mark(messageId);
  return { messageId, filePath, subject, from, matches };
}
