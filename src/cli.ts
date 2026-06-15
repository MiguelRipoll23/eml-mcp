#!/usr/bin/env node
import * as path from 'path';
import * as fs from 'fs';
import { IndexService } from './services/index-service.js';
import { FilesystemService } from './services/filesystem-service.js';
import { EmailParser } from './services/email-parser.js';
import { AttachmentService } from './services/attachment-service.js';
import { EmailComposer } from './services/email-composer.js';
import { getEmlPaths } from './constants/paths.js';
import { loadConfig } from './tui/services/config-store.js';
import { handleRefreshIndex } from './tools/index-tools.js';
import type { Services } from './types/service.types.js';

function parseDataPath(args: string[]): string | undefined {
  const arg = args.find(a => a.startsWith('--data-path='));
  return arg ? arg.slice('--data-path='.length) : undefined;
}

async function commandRefresh(args: string[]): Promise<void> {
  const emlPaths = getEmlPaths(parseDataPath(args));
  const emailDirectoryArg = args.find(arg => !arg.startsWith('--'));

  let emailDirectory = emailDirectoryArg;
  if (!emailDirectory) {
    const config = loadConfig(emlPaths.configPath);
    if (config) {
      emailDirectory = config.emailDirectory;
    } else {
      process.stderr.write('Error: no email directory specified and no saved config found.\n');
      process.stderr.write('Run the MCP server first (eml-mcp <email-directory>) or pass the directory explicitly:\n');
      process.stderr.write('  eml-cli refresh_index <email-directory> [--data-path=<path>]\n');
      process.exit(1);
    }
  }

  const resolvedRoot = path.resolve(emailDirectory);
  const inboxDirectory = path.join(resolvedRoot, 'inbox');
  const outboxDirectory = path.join(resolvedRoot, 'outbox');
  const draftsDirectory = path.join(resolvedRoot, 'drafts');

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
}

async function commandStats(args: string[]): Promise<void> {
  const emlPaths = getEmlPaths(parseDataPath(args));
  const emailDirectoryArg = args.find(arg => !arg.startsWith('--'));

  let emailDirectory = emailDirectoryArg;
  if (!emailDirectory) {
    const config = loadConfig(emlPaths.configPath);
    if (config) {
      emailDirectory = config.emailDirectory;
    } else {
      process.stderr.write('Error: no email directory specified and no saved config found.\n');
      process.stderr.write('Run the MCP server first (eml-mcp <email-directory>) or pass the directory explicitly:\n');
      process.stderr.write('  eml-cli stats <email-directory> [--data-path=<path>]\n');
      process.exit(1);
    }
  }

  const resolvedRoot = path.resolve(emailDirectory);
  const filesystem = new FilesystemService();
  const index = new IndexService(emlPaths.indexDbPath);
  await index.initialize();

  const folders = ['inbox', 'outbox', 'drafts'] as const;
  const indexedByFolder = index.getStats().byFolder;

  const col = (s: string, w: number): string => s.padEnd(w);
  const colR = (s: string, w: number): string => s.padStart(w);

  process.stdout.write(`${col('Folder', 10)}  ${colR('On disk', 9)}  ${colR('Indexed', 9)}  Status\n`);
  process.stdout.write(`${'-'.repeat(10)}  ${'-'.repeat(9)}  ${'-'.repeat(9)}  ------\n`);

  let totalDisk = 0;
  let totalIndexed = 0;
  let anyWarn = false;

  for (const folder of folders) {
    const dir = path.join(resolvedRoot, folder);
    const onDisk = fs.existsSync(dir) ? filesystem.walkDirectory(dir).length : 0;
    const indexed = indexedByFolder[folder] ?? 0;
    totalDisk += onDisk;
    totalIndexed += indexed;
    const warn = indexed > onDisk;
    if (warn) anyWarn = true;
    const status = warn ? 'WARN: indexed > disk' : 'ok';
    process.stdout.write(`${col(folder, 10)}  ${colR(String(onDisk), 9)}  ${colR(String(indexed), 9)}  ${status}\n`);
  }

  process.stdout.write(`${'-'.repeat(10)}  ${'-'.repeat(9)}  ${'-'.repeat(9)}  ------\n`);
  const totalStatus = anyWarn ? 'WARN: possible duplicates in index' : 'ok';
  process.stdout.write(`${col('total', 10)}  ${colR(String(totalDisk), 9)}  ${colR(String(totalIndexed), 9)}  ${totalStatus}\n`);
}

async function commandLastIndexed(args: string[]): Promise<void> {
  const emlPaths = getEmlPaths(parseDataPath(args));
  const index = new IndexService(emlPaths.indexDbPath);
  await index.initialize();
  const stats = index.getStats();

  if (stats.lastIndexedAt === null) {
    process.stdout.write('No emails indexed yet\n');
  } else {
    const date = new Date(stats.lastIndexedAt);
    process.stdout.write(`Last indexed: ${date.toLocaleString()}\n`);
  }
}

function printUsage(): void {
  process.stdout.write('Usage:\n');
  process.stdout.write('  eml-cli refresh_index [<email-directory>] [--data-path=<path>]\n');
  process.stdout.write('  eml-cli stats [<email-directory>] [--data-path=<path>]\n');
  process.stdout.write('  eml-cli last-indexed [--data-path=<path>]\n');
  process.stdout.write('\nOptions:\n');
  process.stdout.write('  --data-path=<path>  Data directory (default: ~/.eml)\n');
  process.stdout.write('\nEmail directory is optional if the MCP server has run at least once.\n');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  const commandArgs = args.slice(1);

  switch (command) {
    case 'refresh_index':
      await commandRefresh(commandArgs);
      break;
    case 'stats':
      await commandStats(commandArgs);
      break;
    case 'last-indexed':
      await commandLastIndexed(commandArgs);
      break;
    default:
      printUsage();
      process.exit(command ? 1 : 0);
  }
}

main().catch(error => {
  process.stderr.write(`Error: ${error}\n`);
  process.exit(1);
});
