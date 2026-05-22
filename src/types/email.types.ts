export type EmailFolder = 'inbox' | 'outbox' | 'drafts';

export interface EmailHeader {
  messageId: string;
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  date: Date;
  filePath: string;
  folder?: EmailFolder;
}

export interface Attachment {
  filename: string;
  contentType: string;
  size: number;
  contentId?: string;
}

export interface ParsedEmail {
  header: EmailHeader;
  textBody?: string;
  htmlBody?: string;
  attachments: Attachment[];
}

export interface SearchFilters {
  from?: string;
  to?: string;
  subject?: string;
  keyword?: string;
  dateFrom?: string;
  dateTo?: string;
  hasAttachments?: boolean;
  folder?: EmailFolder;
}
