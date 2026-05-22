import { describe, it, expect, vi } from 'vitest';
import {
  handleRefreshIndex,
} from '../../src/tools/index-tools.js';
import type { Services } from '../../src/types/service.types.js';

function makeServices(overrides: Partial<Services> = {}): Services {
  return {
    config: {
      inboxDirectory: 'C:\\TestOutlook\\inbox',
      outboxDirectory: 'C:\\TestOutlook\\outbox',
      draftsDirectory: 'C:\\TestOutlook\\drafts',
    },
    filesystem: {
      walkDirectory: vi.fn().mockReturnValue([]),
    } as never,
    parser: {
      parse: vi.fn(),
    } as never,
    index: {
      upsert: vi.fn(),
      remove: vi.fn(),
      getAll: vi.fn().mockReturnValue([]),
    } as never,
    attachment: {} as never,
    composer: {} as never,
    ...overrides,
  };
}

describe('handleRefreshIndex', () => {
  it('returns added, removed, updated counts', async () => {
    const services = makeServices();
    const result = await handleRefreshIndex(services);
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveProperty('added');
    expect(data).toHaveProperty('removed');
    expect(data).toHaveProperty('updated');
  });

  it('removes index entry when file is no longer on disk', async () => {
    const services = makeServices({
      index: {
        upsert: vi.fn(),
        remove: vi.fn(),
        getAll: vi.fn().mockReturnValue([
          { messageId: '<deleted@test.com>', filePath: 'C:\\TestOutlook\\inbox\\deleted.eml', indexedAt: '2020-01-01T00:00:00.000Z' },
        ]),
      } as never,
    });
    const result = await handleRefreshIndex(services);
    const data = JSON.parse(result.content[0].text);
    expect(data.removed).toBe(1);
    expect(services.index.remove).toHaveBeenCalledWith('<deleted@test.com>');
  });

  it('indexes a new file that is not yet in the index', async () => {
    const parsedEmail = {
      header: {
        messageId: '<new@test.com>',
        filePath: 'C:\\TestOutlook\\inbox\\new.eml',
        from: 'sender@test.com',
        to: ['recipient@test.com'],
        cc: [],
        subject: 'New Email',
        date: new Date('2026-01-01'),
      },
      textBody: 'Body',
      attachments: [],
    };
    const services = makeServices({
      filesystem: {
        walkDirectory: vi.fn().mockImplementation((dir: string) => {
          if (dir.includes('inbox')) {
            return [{ filePath: 'C:\\TestOutlook\\inbox\\new.eml', mtime: new Date('2026-01-01'), size: 512 }];
          }
          return [];
        }),
      } as never,
      parser: {
        parse: vi.fn().mockResolvedValue(parsedEmail),
      } as never,
    });
    const result = await handleRefreshIndex(services);
    const data = JSON.parse(result.content[0].text);
    expect(data.added).toBe(1);
    expect(services.index.upsert).toHaveBeenCalledOnce();
  });

  it('re-indexes a stale file whose mtime is newer than indexedAt', async () => {
    const filePath = 'C:\\TestOutlook\\inbox\\stale.eml';
    const parsedEmail = {
      header: {
        messageId: '<stale@test.com>',
        filePath,
        from: 'sender@test.com',
        to: ['recipient@test.com'],
        cc: [],
        subject: 'Stale Email',
        date: new Date('2020-01-01'),
      },
      textBody: 'Body',
      attachments: [],
    };
    const services = makeServices({
      filesystem: {
        walkDirectory: vi.fn().mockImplementation((dir: string) => {
          if (dir.includes('inbox')) {
            return [{ filePath, mtime: new Date('2026-01-01'), size: 512 }];
          }
          return [];
        }),
      } as never,
      parser: {
        parse: vi.fn().mockResolvedValue(parsedEmail),
      } as never,
      index: {
        upsert: vi.fn(),
        remove: vi.fn(),
        getAll: vi.fn().mockReturnValue([
          { messageId: '<stale@test.com>', filePath, indexedAt: '2020-01-01T00:00:00.000Z' },
        ]),
      } as never,
    });
    const result = await handleRefreshIndex(services);
    const data = JSON.parse(result.content[0].text);
    expect(data.updated).toBe(1);
    expect(services.index.upsert).toHaveBeenCalledOnce();
  });
});
