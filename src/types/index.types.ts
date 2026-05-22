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

export interface IndexStats {
  totalEmails: number;
  totalAttachments: number;
  totalSizeBytes: number;
  lastIndexedAt: string | null;
  byFolder: { inbox: number; outbox: number; drafts: number };
}
