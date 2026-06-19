#!/usr/bin/env node
import * as path from 'path';
import * as fs from 'fs';
import { defineCommand, runMain } from 'citty';
import { IndexService } from './services/index-service.js';
import { FilesystemService } from './services/filesystem-service.js';
import { EmailParser } from './services/email-parser.js';
import { AttachmentService } from './services/attachment-service.js';
import { EmailComposer } from './services/email-composer.js';
import { getEmlPaths } from './constants/paths.js';
import { loadConfig } from './tui/services/config-store.js';
import { loadDisallowedWords, saveDisallowedWords } from './tui/services/disallowed-words-store.js';
import { handleRefreshIndex } from './tools/index-tools.js';
import { WorkflowConfigSchema } from './tui/types/workflow.types.js';
import type { Services } from './types/service.types.js';

const DATA_PATH_ARG = {
  'data-path': {
    type: 'string' as const,
    description: 'Data directory (default: ~/.eml)',
  },
};

function resolveEmailDirectory(directory: string | undefined, dataPath: string | undefined): string {
  if (directory) return path.resolve(directory);
  const emlPaths = getEmlPaths(dataPath);
  const config = loadConfig(emlPaths.configPath);
  if (config) return config.emailDirectory;
  throw new Error(
    'No email directory specified and no saved config found.\n' +
    'Run the MCP server first (eml-mcp <email-directory>) or pass the directory explicitly.',
  );
}

function writePromptFile(promptsDir: string, slug: string, content: string): void {
  fs.mkdirSync(promptsDir, { recursive: true });
  const promptPath = path.join(promptsDir, `${slug}.md`);
  fs.writeFileSync(promptPath, content, 'utf-8');
  process.stdout.write(`Prompt:  ${promptPath}\n`);
}

const indexRefreshCommand = defineCommand({
  meta: { name: 'index refresh', description: 'Refresh the email index' },
  args: {
    directory: { type: 'positional', description: 'Email directory', required: false },
    ...DATA_PATH_ARG,
  },
  async run({ args }) {
    const dataPath = args['data-path'];
    const emlPaths = getEmlPaths(dataPath);
    const emailDirectory = resolveEmailDirectory(args.directory, dataPath);

    const inboxDirectory = path.join(emailDirectory, 'inbox');
    const outboxDirectory = path.join(emailDirectory, 'outbox');
    const draftsDirectory = path.join(emailDirectory, 'drafts');

    for (const dir of [inboxDirectory, outboxDirectory, draftsDirectory]) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const filesystem = new FilesystemService();
    const parser = new EmailParser(filesystem);
    const index = new IndexService(emlPaths.indexDbPath);
    const attachment = new AttachmentService(parser, filesystem);
    const composer = new EmailComposer(filesystem, draftsDirectory, 'draft@eml-mcp');

    const services: Services = {
      config: { inboxDirectory, outboxDirectory, draftsDirectory },
      filesystem,
      parser,
      index,
      attachment,
      composer,
    };

    await index.initialize();
    const result = await handleRefreshIndex(services);
    const { added, removed, updated } = result.structuredContent as { added: number; removed: number; updated: number };
    process.stdout.write(`Refresh complete: ${added} added, ${updated} updated, ${removed} removed\n`);
  },
});

const indexStatusCommand = defineCommand({
  meta: { name: 'index status', description: 'Show index statistics and last refresh time' },
  args: {
    directory: { type: 'positional', description: 'Email directory', required: false },
    ...DATA_PATH_ARG,
  },
  async run({ args }) {
    const dataPath = args['data-path'];
    const emlPaths = getEmlPaths(dataPath);
    const emailDirectory = resolveEmailDirectory(args.directory, dataPath);

    const filesystem = new FilesystemService();
    const index = new IndexService(emlPaths.indexDbPath);
    await index.initialize();

    const { byFolder, lastIndexedAt } = index.getStats();
    const folders = ['inbox', 'outbox', 'drafts'] as const;

    const col = (s: string, w: number): string => s.padEnd(w);
    const colR = (s: string, w: number): string => s.padStart(w);

    process.stdout.write(`${col('Folder', 10)}  ${colR('On disk', 9)}  ${colR('Indexed', 9)}  Status\n`);
    process.stdout.write(`${'-'.repeat(10)}  ${'-'.repeat(9)}  ${'-'.repeat(9)}  ------\n`);

    let totalDisk = 0;
    let totalIndexed = 0;
    let anyWarn = false;

    for (const folder of folders) {
      const dir = path.join(emailDirectory, folder);
      const onDisk = fs.existsSync(dir) ? filesystem.walkDirectory(dir).length : 0;
      const indexed = byFolder[folder] ?? 0;
      totalDisk += onDisk;
      totalIndexed += indexed;
      const warn = indexed > onDisk;
      if (warn) anyWarn = true;
      process.stdout.write(`${col(folder, 10)}  ${colR(String(onDisk), 9)}  ${colR(String(indexed), 9)}  ${warn ? 'WARN: indexed > disk' : 'ok'}\n`);
    }

    process.stdout.write(`${'-'.repeat(10)}  ${'-'.repeat(9)}  ${'-'.repeat(9)}  ------\n`);
    process.stdout.write(`${col('total', 10)}  ${colR(String(totalDisk), 9)}  ${colR(String(totalIndexed), 9)}  ${anyWarn ? 'WARN: possible duplicates in index' : 'ok'}\n`);

    const lastRefreshed = lastIndexedAt === null ? 'never' : new Date(lastIndexedAt).toLocaleString();
    process.stdout.write(`\nLast refreshed: ${lastRefreshed}\n`);
  },
});

const indexCommand = defineCommand({
  meta: { name: 'index', description: 'Manage the email index' },
  subCommands: {
    refresh: indexRefreshCommand,
    status: indexStatusCommand,
  },
});

const disallowedWordsListCommand = defineCommand({
  meta: { name: 'disallowed-words list', description: 'List global disallowed words' },
  args: { ...DATA_PATH_ARG },
  run({ args }) {
    const emlPaths = getEmlPaths(args['data-path']);
    const words = loadDisallowedWords(emlPaths.disallowedWordsPath);
    if (words.length === 0) {
      process.stdout.write('No global disallowed words configured.\n');
      return;
    }
    for (const word of words) {
      process.stdout.write(`${word}\n`);
    }
  },
});

const disallowedWordsAddCommand = defineCommand({
  meta: { name: 'disallowed-words add', description: 'Add a global disallowed word' },
  args: {
    word: { type: 'positional', description: 'Word to add', required: true },
    ...DATA_PATH_ARG,
  },
  run({ args }) {
    const emlPaths = getEmlPaths(args['data-path']);
    const words = loadDisallowedWords(emlPaths.disallowedWordsPath);
    if (words.includes(args.word)) {
      process.stdout.write(`Already present: ${args.word}\n`);
      return;
    }
    saveDisallowedWords([...words, args.word], emlPaths.disallowedWordsPath);
    process.stdout.write(`Added: ${args.word}\n`);
  },
});

const disallowedWordsRemoveCommand = defineCommand({
  meta: { name: 'disallowed-words remove', description: 'Remove a global disallowed word' },
  args: {
    word: { type: 'positional', description: 'Word to remove', required: true },
    ...DATA_PATH_ARG,
  },
  run({ args }) {
    const emlPaths = getEmlPaths(args['data-path']);
    const words = loadDisallowedWords(emlPaths.disallowedWordsPath);
    const filtered = words.filter(w => w !== args.word);
    if (filtered.length === words.length) {
      process.stdout.write(`Not found: ${args.word}\n`);
      return;
    }
    saveDisallowedWords(filtered, emlPaths.disallowedWordsPath);
    process.stdout.write(`Removed: ${args.word}\n`);
  },
});

const disallowedWordsClearCommand = defineCommand({
  meta: { name: 'disallowed-words clear', description: 'Remove all global disallowed words' },
  args: { ...DATA_PATH_ARG },
  run({ args }) {
    const emlPaths = getEmlPaths(args['data-path']);
    saveDisallowedWords([], emlPaths.disallowedWordsPath);
    process.stdout.write('All global disallowed words removed.\n');
  },
});

const disallowedWordsCommand = defineCommand({
  meta: { name: 'disallowed-words', description: 'Manage global disallowed words' },
  subCommands: {
    list: disallowedWordsListCommand,
    add: disallowedWordsAddCommand,
    remove: disallowedWordsRemoveCommand,
    clear: disallowedWordsClearCommand,
  },
});

const workflowListCommand = defineCommand({
  meta: { name: 'workflow list', description: 'List all workflows' },
  args: { ...DATA_PATH_ARG },
  run({ args }) {
    const emlPaths = getEmlPaths(args['data-path']);
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(emlPaths.workflowsDir, { withFileTypes: true });
    } catch {
      process.stdout.write('No workflows found.\n');
      return;
    }
    const files = entries.filter(e => e.isFile() && e.name.endsWith('.json'));
    if (files.length === 0) {
      process.stdout.write('No workflows found.\n');
      return;
    }
    for (const file of files) {
      const filePath = path.join(emlPaths.workflowsDir, file.name);
      try {
        const parsed = WorkflowConfigSchema.parse(JSON.parse(fs.readFileSync(filePath, 'utf-8')));
        process.stdout.write(`${file.name}  ${parsed.name}  [${parsed.conditions.keywords.join(', ')}]\n`);
      } catch {
        process.stdout.write(`${file.name}  (invalid)\n`);
      }
    }
  },
});

const workflowGetCommand = defineCommand({
  meta: { name: 'workflow get', description: 'Print a workflow JSON' },
  args: {
    name: { type: 'positional', description: 'Workflow filename (with or without .json)', required: true },
    ...DATA_PATH_ARG,
  },
  run({ args }) {
    const emlPaths = getEmlPaths(args['data-path']);
    const fileName = args.name.endsWith('.json') ? args.name : `${args.name}.json`;
    const filePath = path.join(emlPaths.workflowsDir, fileName);
    if (!fs.existsSync(filePath)) {
      process.stderr.write(`Workflow not found: ${filePath}\n`);
      process.exit(1);
    }
    process.stdout.write(fs.readFileSync(filePath, 'utf-8'));
    process.stdout.write('\n');
  },
});

const workflowCreateCommand = defineCommand({
  meta: { name: 'workflow create', description: 'Create a new workflow' },
  args: {
    json: { type: 'positional', description: 'Workflow JSON', required: true },
    prompt: { type: 'string', description: 'Prompt template content written to ~/.eml/prompts/<slug>.md' },
    ...DATA_PATH_ARG,
  },
  run({ args }) {
    const emlPaths = getEmlPaths(args['data-path']);
    let parsed;
    try {
      parsed = WorkflowConfigSchema.parse(JSON.parse(args.json));
    } catch (error) {
      process.stderr.write(`Invalid workflow JSON: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exit(1);
    }
    const slug = parsed.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const filePath = path.join(emlPaths.workflowsDir, `${slug}.json`);
    if (fs.existsSync(filePath)) {
      process.stderr.write(`File already exists: ${filePath}\nUse "workflow update" to modify it.\n`);
      process.exit(1);
    }
    fs.mkdirSync(emlPaths.workflowsDir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2) + '\n', 'utf-8');
    process.stdout.write(`Created: ${filePath}\n`);
    if (args.prompt !== undefined) writePromptFile(emlPaths.promptsDir, slug, args.prompt);
  },
});

const workflowUpdateCommand = defineCommand({
  meta: { name: 'workflow update', description: 'Update an existing workflow' },
  args: {
    name: { type: 'positional', description: 'Workflow filename (with or without .json)', required: true },
    json: { type: 'string', description: 'Updated workflow JSON' },
    prompt: { type: 'string', description: 'Prompt template content written to ~/.eml/prompts/<slug>.md' },
    ...DATA_PATH_ARG,
  },
  run({ args }) {
    const emlPaths = getEmlPaths(args['data-path']);
    const fileName = args.name.endsWith('.json') ? args.name : `${args.name}.json`;
    const filePath = path.join(emlPaths.workflowsDir, fileName);
    if (!fs.existsSync(filePath)) {
      process.stderr.write(`Workflow not found: ${filePath}\n`);
      process.exit(1);
    }
    if (args.json) {
      let parsed;
      try {
        parsed = WorkflowConfigSchema.parse(JSON.parse(args.json));
      } catch (error) {
        process.stderr.write(`Invalid workflow JSON: ${error instanceof Error ? error.message : String(error)}\n`);
        process.exit(1);
      }
      fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2) + '\n', 'utf-8');
      process.stdout.write(`Updated: ${filePath}\n`);
    }
    if (args.prompt !== undefined) writePromptFile(emlPaths.promptsDir, path.basename(fileName, '.json'), args.prompt);
  },
});

const workflowDeleteCommand = defineCommand({
  meta: { name: 'workflow delete', description: 'Delete a workflow' },
  args: {
    name: { type: 'positional', description: 'Workflow filename (with or without .json)', required: true },
    ...DATA_PATH_ARG,
  },
  run({ args }) {
    const emlPaths = getEmlPaths(args['data-path']);
    const fileName = args.name.endsWith('.json') ? args.name : `${args.name}.json`;
    const filePath = path.join(emlPaths.workflowsDir, fileName);
    if (!fs.existsSync(filePath)) {
      process.stderr.write(`Workflow not found: ${filePath}\n`);
      process.exit(1);
    }
    fs.unlinkSync(filePath);
    process.stdout.write(`Deleted: ${filePath}\n`);
  },
});

const workflowHelpCommand = defineCommand({
  meta: { name: 'workflow help', description: 'Show the workflow JSON schema' },
  run() {
    const example = {
      name: 'My Workflow',
      conditions: { operator: 'OR', fields: ['subject', 'body'], keywords: ['keyword1', 'keyword2'] },
      command: "claude --dangerously-skip-permissions '@{prompt_file}'",
      workingDirectory: '/optional/path',
      preambleExtra: 'Optional extra context appended to the generated preamble.',
    };
    process.stdout.write('Workflow JSON schema:\n\n');
    process.stdout.write(JSON.stringify(
      {
        name: 'string — display name of the workflow',
        conditions: {
          operator: '"OR" — only OR is supported',
          fields: 'array of "subject" | "body" — fields to match keywords against (default: both)',
          keywords: 'array of strings (min 1) — triggers workflow when any keyword matches',
        },
        command: 'string — shell command; use {prompt_file} as the temp prompt file placeholder',
        workingDirectory: 'string (optional) — working directory for the command',
        preambleExtra: 'string (optional) — extra text appended to the generated preamble',
      },
      null,
      2,
    ));
    process.stdout.write('\n\nExample:\n\n');
    process.stdout.write(JSON.stringify(example, null, 2));
    process.stdout.write('\n');
  },
});

const workflowCommand = defineCommand({
  meta: { name: 'workflow', description: 'Manage workflows' },
  subCommands: {
    list: workflowListCommand,
    get: workflowGetCommand,
    create: workflowCreateCommand,
    update: workflowUpdateCommand,
    delete: workflowDeleteCommand,
    help: workflowHelpCommand,
  },
});

const main = defineCommand({
  meta: {
    name: 'eml-cli',
    description: 'Email CLI utility',
  },
  subCommands: {
    index: indexCommand,
    workflow: workflowCommand,
    'disallowed-words': disallowedWordsCommand,
  },
});

runMain(main);
