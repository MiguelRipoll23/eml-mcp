export interface IndexEntry {
  messageId: string;
  filePath: string;
  fromAddress: string;
  toAddresses: string;
  ccAddresses: string;
  subject: string;
  date: string;
  textBody: string;
  attachmentNames: string;
  hasAttachments: number;
  fileSize: number;
  indexedAt: string;
  folder: string;
}

export interface SearchResult {
  messageId: string;
  filePath: string;
  fromAddress: string | null;
  toAddresses: string | null;
  ccAddresses: string | null;
  subject: string | null;
  date: string | null;
  hasAttachments: number;
  fileSize: number;
  indexedAt: string | null;
  folder: string;
}

export interface IndexStats {
  totalEmails: number;
  totalAttachments: number;
  totalSizeBytes: number;
  lastIndexedAt: string | null;
  byFolder: { inbox: number; outbox: number; drafts: number };
}
