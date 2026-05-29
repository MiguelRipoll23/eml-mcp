import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import { handleSearchEmails, handleGetEmail, handleComposeEmail, handleUpdateEmail, handleDeleteEmail, handleOpenEmail } from '../../src/tools/email-tools.js';
import type { Services } from '../../src/types/service.types.js';
import type { EmailHeader, ParsedEmail } from '../../src/types/email.types.js';

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    statSync: vi.fn().mockReturnValue({ size: 1024 }),
    existsSync: vi.fn().mockReturnValue(true),
    unlinkSync: vi.fn(),
  };
});

const mockHeader: EmailHeader = {
  messageId: '<abc@example.com>',
  from: 'alice@example.com',
  to: ['bob@example.com'],
  cc: [],
  bcc: [],
  subject: 'Test',
  date: new Date('2026-01-01'),
  filePath: 'C:\\Outlook\\test.eml',
};

const mockSearchResult = {
  messageId: '<abc@example.com>',
  filePath: 'C:\\Outlook\\test.eml',
  fromAddress: 'alice@example.com',
  toAddresses: 'bob@example.com',
  ccAddresses: '',
  subject: 'Test',
  date: '2026-01-01T00:00:00.000Z',
  hasAttachments: 0,
  fileSize: 1024,
  indexedAt: '2026-01-01T00:00:00.000Z',
  folder: 'inbox',
};

const mockParsed: ParsedEmail = {
  header: mockHeader,
  textBody: 'Hello world',
  htmlBody: '<p>Hello world</p>',
  attachments: [],
};

function makeServices(overrides: Partial<Services> = {}): Services {
  return {
    config: {
      inboxDirectory: 'C:\\Outlook\\inbox',
      outboxDirectory: 'C:\\Outlook\\outbox',
      draftsDirectory: 'C:\\Outlook\\drafts',
    },
    filesystem: {} as never,
    parser: {
      parse: vi.fn().mockResolvedValue(mockParsed),
      parseForRecompose: vi.fn().mockResolvedValue({ header: mockHeader, textBody: 'Hello world', htmlBody: undefined, attachments: [] }),
      invalidate: vi.fn(),
    } as never,
    index: {
      search: vi.fn().mockReturnValue([mockSearchResult]),
      upsert: vi.fn(),
      count: vi.fn().mockReturnValue(1),
    } as never,
    attachment: {} as never,
    composer: {
      composeAndOpen: vi.fn().mockImplementation((opts: { outputPath?: string }) =>
        Promise.resolve(opts.outputPath ?? 'C:\\Outlook\\draft.eml'),
      ),
    } as never,
    ...overrides,
  };
}

describe('handleSearchEmails', () => {
  it('delegates to IndexService.search and returns results', async () => {
    const services = makeServices();
    const result = await handleSearchEmails({ keyword: 'test', limit: 10 }, services);
    const data = JSON.parse(result.content[0].text);
    expect(data.results).toHaveLength(1);
    expect(data.results[0].subject).toBe('Test');
  });

  it('returns fromAddress matching the outputSchema (not the EmailHeader from field)', async () => {
    const services = makeServices();
    const result = await handleSearchEmails({ keyword: 'test', limit: 10 }, services);
    const data = JSON.parse(result.content[0].text);
    expect(data.results[0].fromAddress).toBe('alice@example.com');
    expect(data.results[0].from).toBeUndefined();
  });

  it('returns hasAttachments, fileSize, and indexedAt in search results', async () => {
    const services = makeServices();
    const result = await handleSearchEmails({ keyword: 'test', limit: 10 }, services);
    const data = JSON.parse(result.content[0].text);
    expect(data.results[0].hasAttachments).toBe(0);
    expect(data.results[0].fileSize).toBe(1024);
    expect(typeof data.results[0].indexedAt).toBe('string');
  });

  it('returns null fromAddress and toAddresses for draft emails with no sender', async () => {
    const draftResult = {
      messageId: '<draft@example.com>',
      filePath: 'C:\\Outlook\\drafts\\draft.eml',
      fromAddress: null,
      toAddresses: null,
      ccAddresses: null,
      subject: 'Unsent draft',
      date: '2026-01-01T00:00:00.000Z',
      hasAttachments: 0,
      fileSize: 512,
      indexedAt: '2026-01-01T00:00:00.000Z',
      folder: 'drafts',
    };
    const services = makeServices({
      index: {
        search: vi.fn().mockReturnValue([draftResult]),
        count: vi.fn().mockReturnValue(1),
        upsert: vi.fn(),
      } as never,
    });
    const result = await handleSearchEmails({ folder: 'drafts', limit: 5 }, services);
    const data = JSON.parse(result.content[0].text);
    expect(data.results[0].fromAddress).toBeNull();
    expect(data.results[0].toAddresses).toBeNull();
  });
});

describe('handleSearchEmails — error handling', () => {
  it('returns toMcpError when index.search throws', async () => {
    const services = makeServices({
      index: {
        search: vi.fn().mockImplementation(() => { throw new Error('FTS syntax error'); }),
        count: vi.fn().mockReturnValue(0),
        upsert: vi.fn(),
      } as never,
    });
    const result = await handleSearchEmails({ keyword: 'bad(query' }, services);
    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toBe('SEARCH_ERROR');
  });
});

describe('handleGetEmail', () => {
  it('delegates to EmailParser.parse and returns parsed email', async () => {
    const services = makeServices();
    const result = await handleGetEmail({ filePath: 'C:\\Outlook\\test.eml' }, services);
    const data = JSON.parse(result.content[0].text);
    expect(data.header.subject).toBe('Test');
    expect(data.textBody).toBe('Hello world');
  });

  it('omits htmlBody when textOnly is true', async () => {
    const services = makeServices();
    const result = await handleGetEmail({ filePath: 'C:\\Outlook\\test.eml', textOnly: true }, services);
    const data = JSON.parse(result.content[0].text);
    expect(data.textBody).toBe('Hello world');
    expect(data.htmlBody).toBeUndefined();
  });

  it('returns error when file not found', async () => {
    const services = makeServices({
      parser: { parse: vi.fn().mockRejectedValue(new Error('ENOENT')), invalidate: vi.fn() } as never,
    });
    const result = await handleGetEmail({ filePath: 'missing.eml' }, services);
    expect(result.isError).toBe(true);
  });
});

describe('handleComposeEmail', () => {
  it('delegates to EmailComposer and returns file path', async () => {
    const services = makeServices();
    const result = await handleComposeEmail(
      { to: ['bob@example.com'], subject: 'Hi', textBody: 'Hello' },
      services,
    );
    const data = JSON.parse(result.content[0].text);
    expect(data.filePath).toBe('C:\\Outlook\\draft.eml');
  });
});

describe('handleComposeEmail — error handling', () => {
  it('returns COMPOSE_ERROR when composer throws', async () => {
    const services = makeServices({
      composer: {
        composeAndOpen: vi.fn().mockRejectedValue(new Error('disk full')),
      } as never,
    });
    const result = await handleComposeEmail(
      { to: ['bob@example.com'], subject: 'Hi', textBody: 'Hello' },
      services,
    );
    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toBe('COMPOSE_ERROR');
  });
});

describe('handleUpdateEmail', () => {
  it('reads existing email, merges fields, and returns updated file path', async () => {
    const services = makeServices();
    const result = await handleUpdateEmail(
      { filePath: 'C:\\Outlook\\test.eml', subject: 'Updated Subject' },
      services,
    );
    const data = JSON.parse(result.content[0].text);
    expect(data.filePath).toBe('C:\\Outlook\\test.eml');
    expect(services.parser.invalidate).toHaveBeenCalledWith('C:\\Outlook\\test.eml');
  });
});

describe('handleUpdateEmail — overwrite in place', () => {
  it('passes outputPath equal to the original filePath', async () => {
    const services = makeServices();
    await handleUpdateEmail(
      { filePath: 'C:\\Outlook\\inbox\\test.eml', subject: 'New Subject' },
      services,
    );
    const composeCall = (services.composer.composeAndOpen as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(composeCall.outputPath).toBe('C:\\Outlook\\inbox\\test.eml');
  });

  it('passes bufferedAttachments from existing email', async () => {
    const existingAttachment = {
      filename: 'report.pdf',
      contentType: 'application/pdf',
      content: Buffer.from('pdf'),
      contentDisposition: 'attachment',
    };
    const services = makeServices({
      parser: {
        parse: vi.fn().mockResolvedValue(mockParsed),
        parseForRecompose: vi.fn().mockResolvedValue({
          header: mockHeader,
          textBody: 'Hello world',
          htmlBody: undefined,
          attachments: [existingAttachment],
        }),
        invalidate: vi.fn(),
      } as never,
    });
    await handleUpdateEmail(
      { filePath: 'C:\\Outlook\\inbox\\test.eml', subject: 'New Subject' },
      services,
    );
    const composeCall = (services.composer.composeAndOpen as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(composeCall.bufferedAttachments).toEqual([existingAttachment]);
  });

  it('calls index.upsert after rewriting', async () => {
    const services = makeServices();
    await handleUpdateEmail(
      { filePath: 'C:\\Outlook\\inbox\\test.eml', subject: 'New Subject' },
      services,
    );
    expect(services.index.upsert).toHaveBeenCalled();
  });
});

describe('handleUpdateEmail — error handling', () => {
  it('returns COMPOSE_ERROR when parseForRecompose throws', async () => {
    const services = makeServices({
      parser: {
        parse: vi.fn(),
        parseForRecompose: vi.fn().mockRejectedValue(new Error('ENOENT')),
        invalidate: vi.fn(),
      } as never,
    });
    const result = await handleUpdateEmail(
      { filePath: 'C:\\Outlook\\missing.eml', subject: 'New' },
      services,
    );
    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toBe('COMPOSE_ERROR');
  });
});

describe('handleUpdateEmail — folder inference', () => {
  it('sets folder to inbox for files under inboxDirectory', async () => {
    const services = makeServices();
    await handleUpdateEmail(
      { filePath: 'C:\\Outlook\\inbox\\test.eml', subject: 'New' },
      services,
    );
    const upsertArg = (services.index.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(upsertArg.folder).toBe('inbox');
  });

  it('sets folder to outbox for files under outboxDirectory', async () => {
    const services = makeServices();
    await handleUpdateEmail(
      { filePath: 'C:\\Outlook\\outbox\\test.eml', subject: 'New' },
      services,
    );
    const upsertArg = (services.index.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(upsertArg.folder).toBe('outbox');
  });

  it('falls back to drafts for files outside inbox and outbox', async () => {
    const services = makeServices();
    await handleUpdateEmail(
      { filePath: 'C:\\Outlook\\drafts\\test.eml', subject: 'New' },
      services,
    );
    const upsertArg = (services.index.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(upsertArg.folder).toBe('drafts');
  });
});

describe('handleDeleteEmail', () => {
  beforeEach(() => {
    vi.mocked(fs.unlinkSync).mockClear();
    vi.mocked(fs.existsSync).mockClear();
  });

  it('deletes the file, removes from index, invalidates cache', async () => {
    vi.mocked(fs.existsSync).mockReturnValueOnce(true);
    const services = makeServices({
      index: {
        getAll: vi.fn().mockReturnValue([
          { messageId: '<abc@example.com>', filePath: 'C:\\Outlook\\test.eml', indexedAt: '' },
        ]),
        remove: vi.fn(),
        search: vi.fn().mockReturnValue([]),
        upsert: vi.fn(),
        count: vi.fn().mockReturnValue(0),
      } as never,
    });
    const result = await handleDeleteEmail({ filePath: 'C:\\Outlook\\test.eml' }, services);
    const data = JSON.parse(result.content[0].text);
    expect(data.filePath).toBe('C:\\Outlook\\test.eml');
    expect(data.removedFromIndex).toBe(true);
    expect(fs.unlinkSync).toHaveBeenCalledWith('C:\\Outlook\\test.eml');
    expect(services.index.remove).toHaveBeenCalledWith('<abc@example.com>');
    expect(services.parser.invalidate).toHaveBeenCalledWith('C:\\Outlook\\test.eml');
  });

  it('returns FILE_NOT_FOUND when file does not exist', async () => {
    vi.mocked(fs.existsSync).mockReturnValueOnce(false);
    const services = makeServices();
    const result = await handleDeleteEmail({ filePath: 'C:\\Outlook\\missing.eml' }, services);
    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toBe('FILE_NOT_FOUND');
    expect(fs.unlinkSync).not.toHaveBeenCalled();
  });

  it('deletes the file and returns removedFromIndex: false when not in index', async () => {
    vi.mocked(fs.existsSync).mockReturnValueOnce(true);
    const services = makeServices({
      index: {
        getAll: vi.fn().mockReturnValue([]),
        remove: vi.fn(),
        search: vi.fn().mockReturnValue([]),
        upsert: vi.fn(),
        count: vi.fn().mockReturnValue(0),
      } as never,
    });
    const result = await handleDeleteEmail({ filePath: 'C:\\Outlook\\unindexed.eml' }, services);
    const data = JSON.parse(result.content[0].text);
    expect(data.removedFromIndex).toBe(false);
    expect(fs.unlinkSync).toHaveBeenCalledWith('C:\\Outlook\\unindexed.eml');
    expect(services.index.remove).not.toHaveBeenCalled();
  });
});

describe('handleOpenEmail', () => {
  beforeEach(() => {
    vi.mocked(fs.existsSync).mockClear();
  });

  it('opens the file with the default app and returns filePath', async () => {
    vi.mocked(fs.existsSync).mockReturnValueOnce(true);
    const openWithDefaultApp = vi.fn().mockResolvedValue(undefined);
    const services = makeServices({
      filesystem: { openWithDefaultApp } as never,
    });
    const result = await handleOpenEmail({ filePath: 'C:\\Outlook\\inbox\\test.eml' }, services);
    const data = JSON.parse(result.content[0].text);
    expect(data.filePath).toBe('C:\\Outlook\\inbox\\test.eml');
    expect(openWithDefaultApp).toHaveBeenCalledWith('C:\\Outlook\\inbox\\test.eml');
  });

  it('returns FILE_NOT_FOUND when file does not exist', async () => {
    vi.mocked(fs.existsSync).mockReturnValueOnce(false);
    const services = makeServices({
      filesystem: { openWithDefaultApp: vi.fn() } as never,
    });
    const result = await handleOpenEmail({ filePath: 'C:\\Outlook\\missing.eml' }, services);
    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toBe('FILE_NOT_FOUND');
  });

  it('returns FILE_NOT_FOUND when openWithDefaultApp throws', async () => {
    vi.mocked(fs.existsSync).mockReturnValueOnce(true);
    const services = makeServices({
      filesystem: {
        openWithDefaultApp: vi.fn().mockRejectedValue(new Error('no handler')),
      } as never,
    });
    const result = await handleOpenEmail({ filePath: 'C:\\Outlook\\inbox\\test.eml' }, services);
    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toBe('FILE_NOT_FOUND');
  });
});
