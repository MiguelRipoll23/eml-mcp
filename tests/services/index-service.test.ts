import { describe, it, expect, beforeEach } from 'vitest';
import { IndexService } from '../../src/services/index-service.js';
import type { IndexEntry } from '../../src/types/index.types.js';

function makeEntry(overrides: Partial<IndexEntry> = {}): IndexEntry {
  return {
    messageId: '<test@example.com>',
    filePath: 'C:\\Outlook\\inbox\\test.eml',
    fromAddress: 'alice@example.com',
    toAddresses: 'bob@example.com',
    ccAddresses: '',
    subject: 'Test Subject',
    date: '2026-01-15T12:00:00.000Z',
    textBody: 'Hello this is the email body content',
    attachmentNames: '',
    hasAttachments: 0,
    fileSize: 1024,
    indexedAt: new Date().toISOString(),
    folder: 'inbox',
    ...overrides,
  };
}

describe('IndexService', () => {
  let service: IndexService;

  beforeEach(async () => {
    service = new IndexService(':memory:');
    await service.initialize();
  });

  describe('upsert and search by keyword', () => {
    it('finds an email by keyword in subject', () => {
      service.upsert(makeEntry({ subject: 'Quarterly Report' }));
      const results = service.search({ keywords: ['Quarterly'] }, 10);
      expect(results).toHaveLength(1);
      expect(results[0].subject).toBe('Quarterly Report');
    });

    it('finds an email by keyword in body', () => {
      service.upsert(makeEntry({ textBody: 'The budget is approved for next quarter' }));
      const results = service.search({ keywords: ['budget'] }, 10);
      expect(results).toHaveLength(1);
    });

    it('finds an email by keyword in attachment names', () => {
      service.upsert(makeEntry({ attachmentNames: 'invoice.pdf contract.docx' }));
      const results = service.search({ keywords: ['invoice'] }, 10);
      expect(results).toHaveLength(1);
    });
  });

  describe('search with structured filters', () => {
    it('filters by from address without keyword', () => {
      service.upsert(makeEntry({ messageId: '<a@x.com>', fromAddress: 'alice@example.com' }));
      service.upsert(makeEntry({ messageId: '<b@x.com>', fromAddress: 'bob@example.com' }));

      const results = service.search({ from: 'alice' }, 10);
      expect(results).toHaveLength(1);
      expect(results[0].fromAddress).toContain('alice');
    });

    it('filters by date range', () => {
      service.upsert(makeEntry({ messageId: '<old@x.com>', date: '2025-01-01T00:00:00.000Z' }));
      service.upsert(makeEntry({ messageId: '<new@x.com>', date: '2026-03-01T00:00:00.000Z' }));

      const results = service.search({ dateFrom: '2026-01-01T00:00:00.000Z' }, 10);
      expect(results).toHaveLength(1);
      expect(results[0].messageId).toBe('<new@x.com>');
    });

    it('filters by hasAttachments', () => {
      service.upsert(makeEntry({ messageId: '<no-att@x.com>', hasAttachments: 0 }));
      service.upsert(makeEntry({ messageId: '<has-att@x.com>', hasAttachments: 1 }));

      const results = service.search({ hasAttachments: true }, 10);
      expect(results).toHaveLength(1);
      expect(results[0].messageId).toBe('<has-att@x.com>');
    });

    it('filters by folder', () => {
      service.upsert(makeEntry({ messageId: '<inbox@x.com>', folder: 'inbox' }));
      service.upsert(makeEntry({ messageId: '<sent@x.com>', folder: 'outbox' }));
      service.upsert(makeEntry({ messageId: '<draft@x.com>', folder: 'drafts' }));

      const inboxResults = service.search({ folder: 'inbox' }, 10);
      expect(inboxResults).toHaveLength(1);
      expect(inboxResults[0].folder).toBe('inbox');

      const outboxResults = service.search({ folder: 'outbox' }, 10);
      expect(outboxResults).toHaveLength(1);
      expect(outboxResults[0].folder).toBe('outbox');
    });
  });

  describe('upsert (idempotent)', () => {
    it('updating an existing entry replaces it', () => {
      service.upsert(makeEntry({ subject: 'Original' }));
      service.upsert(makeEntry({ subject: 'Updated' }));

      const results = service.search({ keywords: ['Updated'] }, 10);
      expect(results).toHaveLength(1);

      const origResults = service.search({ keywords: ['Original'] }, 10);
      expect(origResults).toHaveLength(0);
    });
  });

  describe('remove', () => {
    it('removes entry from both tables', () => {
      service.upsert(makeEntry());
      service.remove('<test@example.com>');

      const results = service.search({ keywords: ['Test Subject'] }, 10);
      expect(results).toHaveLength(0);
    });
  });

  describe('getStats', () => {
    it('counts emails, sums file sizes, and breaks down by folder', () => {
      service.upsert(makeEntry({ messageId: '<a@x.com>', fileSize: 1000, hasAttachments: 0, folder: 'inbox' }));
      service.upsert(makeEntry({ messageId: '<b@x.com>', fileSize: 2000, hasAttachments: 1, attachmentNames: 'file.pdf', folder: 'outbox' }));
      service.upsert(makeEntry({ messageId: '<c@x.com>', fileSize: 500, hasAttachments: 0, folder: 'drafts' }));

      const stats = service.getStats();
      expect(stats.totalEmails).toBe(3);
      expect(stats.totalSizeBytes).toBe(3500);
      expect(stats.byFolder.inbox).toBe(1);
      expect(stats.byFolder.outbox).toBe(1);
      expect(stats.byFolder.drafts).toBe(1);
    });
  });
});

describe('search result shape', () => {
  let service: IndexService;

  beforeEach(async () => {
    service = new IndexService(':memory:');
    await service.initialize();
  });

  it('returns fromAddress (not from) in result objects', () => {
    service.upsert(makeEntry({ fromAddress: 'alice@example.com' }));
    const results = service.search({}, 10);
    expect(results[0].fromAddress).toBe('alice@example.com');
    expect((results[0] as Record<string, unknown>)['from']).toBeUndefined();
  });

  it('returns hasAttachments, fileSize, and indexedAt in search results', () => {
    const indexedAt = '2026-05-27T10:00:00.000Z';
    service.upsert(makeEntry({ hasAttachments: 1, fileSize: 4096, indexedAt }));
    const results = service.search({}, 10);
    expect(results[0].hasAttachments).toBe(1);
    expect(results[0].fileSize).toBe(4096);
    expect(results[0].indexedAt).toBe(indexedAt);
  });

  it('returns null fromAddress and toAddresses for drafts stored with no sender', () => {
    service.upsert(makeEntry({
      messageId: '<draft@example.com>',
      fromAddress: null as unknown as string,
      toAddresses: null as unknown as string,
      ccAddresses: null as unknown as string,
      folder: 'drafts',
    }));
    const results = service.search({ folder: 'drafts' }, 10);
    expect(results[0].fromAddress).toBeNull();
    expect(results[0].toAddresses).toBeNull();
    expect(results[0].ccAddresses).toBeNull();
  });

  it('keyword search also returns fromAddress and hasAttachments', () => {
    service.upsert(makeEntry({ fromAddress: 'alice@example.com', hasAttachments: 0, fileSize: 2048, subject: 'Budget Report' }));
    const results = service.search({ keywords: ['Budget'] }, 10);
    expect(results[0].fromAddress).toBe('alice@example.com');
    expect(results[0].hasAttachments).toBe(0);
    expect(results[0].fileSize).toBe(2048);
  });
});

describe('search sortOrder', () => {
  let service: IndexService;

  beforeEach(async () => {
    service = new IndexService(':memory:');
    await service.initialize();
    service.upsert(makeEntry({ messageId: '<oldest@x.com>', date: '2024-01-01T00:00:00.000Z' }));
    service.upsert(makeEntry({ messageId: '<middle@x.com>', date: '2025-06-15T00:00:00.000Z' }));
    service.upsert(makeEntry({ messageId: '<newest@x.com>', date: '2026-03-01T00:00:00.000Z' }));
  });

  it('defaults to newest-first (desc)', () => {
    const results = service.search({}, 10);
    expect(results[0].messageId).toBe('<newest@x.com>');
    expect(results[2].messageId).toBe('<oldest@x.com>');
  });

  it('orders ascending when sortOrder is asc', () => {
    const results = service.search({}, 10, 'asc');
    expect(results[0].messageId).toBe('<oldest@x.com>');
    expect(results[2].messageId).toBe('<newest@x.com>');
  });

  it('orders descending when sortOrder is desc', () => {
    const results = service.search({}, 10, 'desc');
    expect(results[0].messageId).toBe('<newest@x.com>');
    expect(results[2].messageId).toBe('<oldest@x.com>');
  });

  it('applies sortOrder together with keyword search', () => {
    service.upsert(makeEntry({ messageId: '<kw-old@x.com>', date: '2023-01-01T00:00:00.000Z', subject: 'sorttest' }));
    service.upsert(makeEntry({ messageId: '<kw-new@x.com>', date: '2027-01-01T00:00:00.000Z', subject: 'sorttest' }));
    const asc = service.search({ keywords: ['sorttest'] }, 10, 'asc');
    expect(asc[0].messageId).toBe('<kw-old@x.com>');
    expect(asc[1].messageId).toBe('<kw-new@x.com>');
  });
});

describe('IndexService.count', () => {
  let service: IndexService;

  beforeEach(async () => {
    service = new IndexService(':memory:');
    await service.initialize();
    service.upsert(makeEntry({ messageId: '<a@e.com>', subject: 'Invoice Q1', fromAddress: 'alice@example.com' }));
    service.upsert(makeEntry({ messageId: '<b@e.com>', subject: 'Invoice Q2', fromAddress: 'bob@example.com' }));
    service.upsert(makeEntry({ messageId: '<c@e.com>', subject: 'Meeting notes', fromAddress: 'carol@example.com' }));
  });

  it('returns total count with no filters', () => {
    expect(service.count({})).toBe(3);
  });

  it('returns count matching a keyword', () => {
    expect(service.count({ keywords: ['Invoice'] })).toBe(2);
  });

  it('returns count matching a from filter', () => {
    expect(service.count({ from: 'alice' })).toBe(1);
  });

  it('returns 0 for no matches', () => {
    expect(service.count({ from: 'nobody' })).toBe(0);
  });
});
