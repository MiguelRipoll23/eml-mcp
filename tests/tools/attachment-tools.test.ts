import { describe, it, expect, vi } from 'vitest';
import {
  handleExtractAttachments,
  handleOpenAttachment,
  handleSearchAttachments,
} from '../../src/tools/attachment-tools.js';
import type { Services } from '../../src/types/service.types.js';
import type { Attachment, EmailHeader } from '../../src/types/email.types.js';

const mockAttachment: Attachment = {
  filename: 'report.pdf',
  contentType: 'application/pdf',
  size: 4096,
};

const mockHeader: EmailHeader = {
  messageId: '<abc@example.com>',
  from: 'alice@example.com',
  to: ['bob@example.com'],
  cc: [],
  bcc: [],
  subject: 'Report',
  date: new Date(),
  filePath: 'C:\\Outlook\\test.eml',
};

function makeServices(overrides: Partial<Services> = {}): Services {
  return {
    config: {
      inboxDirectory: 'C:\\Outlook\\inbox',
      outboxDirectory: 'C:\\Outlook\\outbox',
      draftsDirectory: 'C:\\Outlook\\drafts',
    },
    filesystem: {} as never,
    parser: {} as never,
    index: {
      search: vi.fn().mockReturnValue([mockHeader]),
      count: vi.fn().mockReturnValue(1),
    } as never,
    attachment: {
      list: vi.fn().mockResolvedValue([mockAttachment]),
      extract: vi.fn().mockResolvedValue('C:\\Output\\report.pdf'),
      extractAll: vi.fn().mockResolvedValue(['C:\\Output\\report.pdf']),
      openAttachment: vi.fn().mockResolvedValue('C:\\Temp\\report.pdf'),
    } as never,
    composer: {} as never,
    ...overrides,
  };
}

describe('handleExtractAttachments', () => {
  it('extracts a specific attachment when filename is provided, returns savedPaths array', async () => {
    const services = makeServices();
    const result = await handleExtractAttachments(
      { filePath: 'test.eml', filename: 'report.pdf', outputDir: 'C:\\Output' },
      services,
    );
    const data = JSON.parse(result.content[0].text);
    expect(data.savedPaths).toHaveLength(1);
    expect(data.savedPaths[0]).toBe('C:\\Output\\report.pdf');
  });

  it('extracts all attachments when filename is omitted, returns savedPaths array', async () => {
    const services = makeServices();
    const result = await handleExtractAttachments(
      { filePath: 'test.eml', outputDir: 'C:\\Output' },
      services,
    );
    const data = JSON.parse(result.content[0].text);
    expect(data.savedPaths).toHaveLength(1);
    expect(data.savedPaths[0]).toBe('C:\\Output\\report.pdf');
  });
});

describe('handleOpenAttachment', () => {
  it('opens attachment and returns temp path', async () => {
    const services = makeServices();
    const result = await handleOpenAttachment(
      { filePath: 'test.eml', filename: 'report.pdf' },
      services,
    );
    const data = JSON.parse(result.content[0].text);
    expect(data.tempPath).toBe('C:\\Temp\\report.pdf');
  });
});

describe('handleOpenAttachment — error handling', () => {
  it('returns ATTACHMENT_NOT_FOUND when attachment does not exist', async () => {
    const services = makeServices({
      attachment: {
        openAttachment: vi.fn().mockRejectedValue(new Error('ATTACHMENT_NOT_FOUND: report.pdf')),
      } as never,
    });
    const result = await handleOpenAttachment(
      { filePath: 'test.eml', filename: 'report.pdf' },
      services,
    );
    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toBe('ATTACHMENT_NOT_FOUND');
  });

  it('returns FILE_NOT_FOUND when .eml file does not exist', async () => {
    const services = makeServices({
      attachment: {
        openAttachment: vi.fn().mockRejectedValue(new Error('ENOENT: no such file')),
      } as never,
    });
    const result = await handleOpenAttachment(
      { filePath: 'missing.eml', filename: 'report.pdf' },
      services,
    );
    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toBe('FILE_NOT_FOUND');
  });
});

describe('handleExtractAttachments — error handling', () => {
  it('returns ATTACHMENT_NOT_FOUND when attachment does not exist', async () => {
    const services = makeServices({
      attachment: {
        extract: vi.fn().mockRejectedValue(new Error('ATTACHMENT_NOT_FOUND: missing.pdf')),
        extractAll: vi.fn(),
      } as never,
    });
    const result = await handleExtractAttachments(
      { filePath: 'test.eml', filename: 'missing.pdf', outputDir: 'C:\\Output' },
      services,
    );
    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toBe('ATTACHMENT_NOT_FOUND');
  });

  it('returns INVALID_PATH when outputDir has path traversal', async () => {
    const services = makeServices({
      attachment: {
        extract: vi.fn().mockRejectedValue(new Error('INVALID_PATH: path traversal detected')),
        extractAll: vi.fn(),
      } as never,
    });
    const result = await handleExtractAttachments(
      { filePath: 'test.eml', filename: 'report.pdf', outputDir: 'C:\\Output' },
      services,
    );
    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toBe('INVALID_PATH');
  });
});

describe('handleSearchAttachments', () => {
  it('returns emails matching attachment search criteria', async () => {
    const services = makeServices();
    const result = await handleSearchAttachments({ filename: 'report' }, services);
    const data = JSON.parse(result.content[0].text);
    expect(data.results).toHaveLength(1);
    expect(data.results[0].subject).toBe('Report');
  });
});

describe('handleSearchAttachments — error handling', () => {
  it('returns toMcpError when index.search throws', async () => {
    const services = makeServices({
      index: {
        search: vi.fn().mockImplementation(() => { throw new Error('FTS syntax error'); }),
        count: vi.fn().mockReturnValue(0),
        upsert: vi.fn(),
        getAll: vi.fn().mockReturnValue([]),
      } as never,
    });
    const result = await handleSearchAttachments({ keywords: ['bad(query'] }, services);
    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toBe('SEARCH_ERROR');
  });
});

describe('handleSearchAttachments — contentType to extension', () => {
  function makeAttSearchServices() {
    return makeServices({
      index: {
        search: vi.fn().mockReturnValue([]),
        count: vi.fn().mockReturnValue(0),
        upsert: vi.fn(),
        getAll: vi.fn().mockReturnValue([]),
      } as never,
    });
  }

  it('uses extension derived from MIME subtype as keyword', async () => {
    const services = makeAttSearchServices();
    await handleSearchAttachments({ contentType: 'application/pdf' }, services);
    const call = (services.index.search as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.keywords).toContain('pdf');
  });

  it('does not include the MIME type prefix in keyword', async () => {
    const services = makeAttSearchServices();
    await handleSearchAttachments({ contentType: 'application/pdf' }, services);
    const call = (services.index.search as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.keywords).not.toContain('application');
  });

  it('handles image MIME types', async () => {
    const services = makeAttSearchServices();
    await handleSearchAttachments({ contentType: 'image/jpeg' }, services);
    const call = (services.index.search as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.keywords).toContain('jpeg');
  });

  it('combines contentType extension with filename keyword', async () => {
    const services = makeAttSearchServices();
    await handleSearchAttachments({ contentType: 'application/pdf', filename: 'invoice' }, services);
    const call = (services.index.search as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.keywords).toContain('pdf');
    expect(call.keywords).toContain('invoice');
  });
});
