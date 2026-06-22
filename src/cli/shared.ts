import * as path from 'path';
import * as fs from 'fs';
import { FilesystemService } from '../services/filesystem-service.js';
import { EmailParser } from '../services/email-parser.js';
import { IndexService } from '../services/index-service.js';
import { AttachmentService } from '../services/attachment-service.js';
import { EmailComposer } from '../services/email-composer.js';
import { getEmlPaths } from '../constants/paths.js';
import { loadConfig } from '../tui/services/config-store.js';
import type { Services } from '../types/service.types.js';

export const DATA_PATH_ARG = {
  'data-path': {
    type: 'string' as const,
    description: 'Data directory (default: ~/.eml)',
  },
};

export function resolveEmailDirectory(directory: string | undefined, dataPath: string | undefined): string {
  if (directory) return path.resolve(directory);
  const emlPaths = getEmlPaths(dataPath);
  const config = loadConfig(emlPaths.configPath);
  if (config) return config.emailDirectory;
  throw new Error(
    'No email directory specified and no saved config found.\n' +
    'Run the MCP server first (eml-mcp <email-directory>) or pass the directory explicitly.',
  );
}

export function writePromptFile(promptsDir: string, slug: string, content: string): void {
  fs.mkdirSync(promptsDir, { recursive: true });
  const promptPath = path.join(promptsDir, `${slug}.md`);
  fs.writeFileSync(promptPath, content, 'utf-8');
  process.stdout.write(`Prompt:  ${promptPath}\n`);
}

export function buildServices(
  emailDirectory: string,
  dataPath: string | undefined,
  draftFrom = 'draft@eml-mcp',
): { services: Services; emlPaths: ReturnType<typeof getEmlPaths> } {
  const emlPaths = getEmlPaths(dataPath);
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
  const composer = new EmailComposer(filesystem, draftsDirectory, draftFrom);

  return {
    services: { config: { inboxDirectory, outboxDirectory, draftsDirectory }, filesystem, parser, index, attachment, composer },
    emlPaths,
  };
}
