#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import * as path from 'path';
import * as fs from 'fs';
import { FilesystemService } from '../services/filesystem-service.js';
import { EmailParser } from '../services/email-parser.js';
import { IndexService } from '../services/index-service.js';
import { AttachmentService } from '../services/attachment-service.js';
import { EmailComposer } from '../services/email-composer.js';
import { getEmlPaths } from '../constants/paths.js';
import type { Services } from '../types/service.types.js';
import { WorkflowConfigSchema } from './types/workflow.types.js';
import type { LoadedWorkflowConfig } from './types/workflow.types.js';
import { Dashboard } from './components/Dashboard.js';
import { loadConfig, saveConfig } from './services/config-store.js';

function parseArgs(): {
  inboxDirectory: string;
  outboxDirectory: string;
  draftsDirectory: string;
  indexDbPath: string;
  workflowsDirectory: string;
  promptsDirectory: string;
} {
  const args = process.argv.slice(2);
  const emailDirectoryArg = args.find(arg => !arg.startsWith('--'));

  const dataPathArg = args.find(a => a.startsWith('--data-path='));
  const dataPath = dataPathArg ? dataPathArg.slice('--data-path='.length) : undefined;
  const emlPaths = getEmlPaths(dataPath);

  let emailDirectory = emailDirectoryArg;

  if (!emailDirectory) {
    const config = loadConfig(emlPaths.configPath);
    if (config) {
      emailDirectory = config.emailDirectory;
    } else {
      process.stderr.write('Error: no email directory specified and no saved config found.\n');
      process.stderr.write('Run the MCP server first (eml-mcp <email-directory>) or pass the directory explicitly:\n');
      process.stderr.write('  eml <email-directory> [--data-path=<path>]\n');
      process.stderr.write('\nOptions:\n');
      process.stderr.write('  --data-path=<path>  Data directory (default: ~/.eml)\n');
      process.exit(1);
    }
  }

  const resolvedRoot = path.resolve(emailDirectory);

  if (emailDirectoryArg) {
    saveConfig({ emailDirectory: resolvedRoot }, emlPaths.configPath);
  }

  const inboxDirectory = path.join(resolvedRoot, 'inbox');
  const outboxDirectory = path.join(resolvedRoot, 'outbox');
  const draftsDirectory = path.join(resolvedRoot, 'drafts');

  for (const dir of [inboxDirectory, outboxDirectory, draftsDirectory]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.mkdirSync(emlPaths.workflowsDir, { recursive: true });
  fs.mkdirSync(emlPaths.promptsDir, { recursive: true });

  return {
    inboxDirectory,
    outboxDirectory,
    draftsDirectory,
    indexDbPath: emlPaths.indexDbPath,
    workflowsDirectory: emlPaths.workflowsDir,
    promptsDirectory: emlPaths.promptsDir,
  };
}

function loadWorkflows(workflowsDirectory: string): { workflows: LoadedWorkflowConfig[]; errors: string[] } {
  const workflows: LoadedWorkflowConfig[] = [];
  const errors: string[] = [];

  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(workflowsDirectory, { withFileTypes: true });
  } catch {
    errors.push(`Cannot read workflows directory: ${workflowsDirectory}`);
    return { workflows, errors };
  }

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const filePath = path.join(workflowsDirectory, entry.name);
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = WorkflowConfigSchema.parse(JSON.parse(raw));
      const sourceFile = path.basename(entry.name, '.json');
      workflows.push({ ...parsed, sourceFile });
    } catch (error) {
      errors.push(`${entry.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { workflows, errors };
}

async function main(): Promise<void> {
  const { inboxDirectory, outboxDirectory, draftsDirectory, indexDbPath, workflowsDirectory, promptsDirectory } = parseArgs();

  const filesystem = new FilesystemService();
  const parser = new EmailParser(filesystem);
  const index = new IndexService(indexDbPath);
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

  const { workflows, errors } = loadWorkflows(workflowsDirectory);

  const { waitUntilExit, unmount } = render(
    <Dashboard
      services={services}
      workflows={workflows}
      workflowErrors={errors}
      promptsDirectory={promptsDirectory}
    />,
    { alternateScreen: true },
  );

  process.stdout.write('\x1b[2J\x1b[H'); // clear alternate screen + cursor home

  const cleanup = () => unmount();
  process.once('SIGTERM', cleanup);
  process.once('SIGINT', cleanup);
  await waitUntilExit();
}

main().catch(error => {
  process.stderr.write(`Error: ${error}\n`);
  process.exit(1);
});
