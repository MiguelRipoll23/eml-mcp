import type { FilesystemService } from '../services/filesystem-service.js';
import type { EmailParser } from '../services/email-parser.js';
import type { IndexService } from '../services/index-service.js';
import type { AttachmentService } from '../services/attachment-service.js';
import type { EmailComposer } from '../services/email-composer.js';

export interface ServerConfig {
  inboxDirectory: string;
  outboxDirectory: string;
  draftsDirectory: string;
}

export interface Services {
  config: ServerConfig;
  filesystem: FilesystemService;
  parser: EmailParser;
  index: IndexService;
  attachment: AttachmentService;
  composer: EmailComposer;
}
