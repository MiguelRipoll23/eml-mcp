import initSqlJs from 'sql.js';
import * as fs from 'fs';
import * as path from 'path';
import type { IndexEntry, IndexStats, SearchResult } from '../types/index.types.js';
import type { SearchFilters } from '../types/email.types.js';

const CREATE_META = `
  CREATE TABLE IF NOT EXISTS emails_meta (
    messageId      TEXT PRIMARY KEY,
    filePath       TEXT NOT NULL,
    fromAddress    TEXT,
    toAddresses    TEXT,
    ccAddresses    TEXT,
    subject        TEXT,
    date           TEXT,
    hasAttachments INTEGER,
    fileSize       INTEGER,
    indexedAt      TEXT,
    folder         TEXT
  )
`;

const CREATE_FTS = `
  CREATE VIRTUAL TABLE IF NOT EXISTS emails_fts USING fts4(
    messageId,
    subject,
    fromAddress,
    toAddresses,
    ccAddresses,
    body,
    attachmentNames,
    folder
  )
`;

type SqlValue = string | number | null | Uint8Array;

export class IndexService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private sqlDb: any = null;

  constructor(private readonly dbPath: string) {}

  private assertInitialized(): void {
    if (this.sqlDb === null) {
      throw new Error('IndexService.initialize() must be awaited before use');
    }
  }

  async initialize(): Promise<void> {
    if (this.sqlDb !== null) return;
    const SQL = await initSqlJs();

    if (this.dbPath !== ':memory:' && fs.existsSync(this.dbPath)) {
      const buf = fs.readFileSync(this.dbPath);
      this.sqlDb = new SQL.Database(buf);
    } else {
      this.sqlDb = new SQL.Database();
    }

    this.sqlDb.run(CREATE_META);
    this.sqlDb.run(CREATE_FTS);
  }

  private persist(): void {
    if (this.dbPath === ':memory:') return;
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    const data: Uint8Array = this.sqlDb.export();
    fs.writeFileSync(this.dbPath, Buffer.from(data));
  }

  private query(sql: string, params: SqlValue[] = []): Record<string, SqlValue>[] {
    const stmt = this.sqlDb.prepare(sql);
    try {
      if (params.length > 0) stmt.bind(params);
      const rows: Record<string, SqlValue>[] = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject() as Record<string, SqlValue>);
      }
      return rows;
    } finally {
      stmt.free();
    }
  }

  upsert(entry: IndexEntry): void {
    this.assertInitialized();
    this.sqlDb.run('BEGIN');
    try {
      this.sqlDb.run(
        `INSERT OR REPLACE INTO emails_meta
          (messageId, filePath, fromAddress, toAddresses, ccAddresses, subject, date, hasAttachments, fileSize, indexedAt, folder)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [entry.messageId, entry.filePath, entry.fromAddress, entry.toAddresses,
         entry.ccAddresses, entry.subject, entry.date, entry.hasAttachments,
         entry.fileSize, entry.indexedAt, entry.folder],
      );
      this.sqlDb.run(`DELETE FROM emails_fts WHERE messageId = ?`, [entry.messageId]);
      this.sqlDb.run(
        `INSERT INTO emails_fts (messageId, subject, fromAddress, toAddresses, ccAddresses, body, attachmentNames, folder)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [entry.messageId, entry.subject, entry.fromAddress, entry.toAddresses,
         entry.ccAddresses, entry.textBody, entry.attachmentNames, entry.folder],
      );
      this.sqlDb.run('COMMIT');
    } catch (err) {
      this.sqlDb.run('ROLLBACK');
      throw err;
    }
    this.persist();
  }

  remove(messageId: string): void {
    this.assertInitialized();
    this.sqlDb.run('BEGIN');
    try {
      this.sqlDb.run(`DELETE FROM emails_meta WHERE messageId = ?`, [messageId]);
      this.sqlDb.run(`DELETE FROM emails_fts WHERE messageId = ?`, [messageId]);
      this.sqlDb.run('COMMIT');
    } catch (err) {
      this.sqlDb.run('ROLLBACK');
      throw err;
    }
    this.persist();
  }

  private buildConditions(filters: SearchFilters): { conditions: string[]; params: SqlValue[] } {
    const conditions: string[] = [];
    const params: SqlValue[] = [];
    if (filters.from) { conditions.push('m.fromAddress LIKE ?'); params.push(`%${filters.from}%`); }
    if (filters.to) { conditions.push('m.toAddresses LIKE ?'); params.push(`%${filters.to}%`); }
    if (filters.subject) { conditions.push('m.subject LIKE ?'); params.push(`%${filters.subject}%`); }
    if (filters.dateFrom) { conditions.push('m.date >= ?'); params.push(filters.dateFrom); }
    if (filters.dateTo) { conditions.push('m.date <= ?'); params.push(filters.dateTo); }
    if (filters.hasAttachments !== undefined) {
      conditions.push('m.hasAttachments = ?');
      params.push(filters.hasAttachments ? 1 : 0);
    }
    if (filters.folder) { conditions.push('m.folder = ?'); params.push(filters.folder); }
    return { conditions, params };
  }

  count(filters: SearchFilters): number {
    this.assertInitialized();
    let activeFilters = { ...filters };
    if (activeFilters.keyword !== undefined && activeFilters.keyword.trim() === '') {
      activeFilters = { ...activeFilters, keyword: undefined };
    }
    const { conditions, params } = this.buildConditions(activeFilters);

    let sql: string;
    let allParams: SqlValue[];

    if (activeFilters.keyword) {
      sql = `
        SELECT COUNT(*) as total
        FROM emails_fts f
        JOIN emails_meta m ON f.messageId = m.messageId
        WHERE emails_fts MATCH ?
          ${conditions.length ? 'AND ' + conditions.join(' AND ') : ''}
      `;
      allParams = [activeFilters.keyword, ...params];
    } else {
      sql = `
        SELECT COUNT(*) as total
        FROM emails_meta m
        ${conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''}
      `;
      allParams = [...params];
    }

    const rows = this.query(sql, allParams);
    return (rows[0]?.['total'] as number) ?? 0;
  }

  search(filters: SearchFilters, limit: number): SearchResult[] {
    this.assertInitialized();
    let activeFilters = { ...filters };

    // Guard against empty keyword — FTS MATCH '' throws
    if (activeFilters.keyword !== undefined && activeFilters.keyword.trim() === '') {
      activeFilters = { ...activeFilters, keyword: undefined };
    }

    const { conditions, params } = this.buildConditions(activeFilters);

    let sql: string;
    let allParams: SqlValue[];

    if (activeFilters.keyword) {
      sql = `
        SELECT m.messageId, m.filePath, m.fromAddress, m.toAddresses, m.ccAddresses,
               m.subject, m.date, m.hasAttachments, m.fileSize, m.indexedAt, m.folder
        FROM emails_fts f
        JOIN emails_meta m ON f.messageId = m.messageId
        WHERE emails_fts MATCH ?
          ${conditions.length ? 'AND ' + conditions.join(' AND ') : ''}
        ORDER BY m.date DESC
        LIMIT ?
      `;
      allParams = [activeFilters.keyword, ...params, limit];
    } else {
      sql = `
        SELECT messageId, filePath, fromAddress, toAddresses, ccAddresses,
               subject, date, hasAttachments, fileSize, indexedAt, folder
        FROM emails_meta m
        ${conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''}
        ORDER BY date DESC
        LIMIT ?
      `;
      allParams = [...params, limit];
    }

    const rows = this.query(sql, allParams);
    return rows.map(row => this.rowToSearchResult(row));
  }

  getStats(): IndexStats {
    this.assertInitialized();
    const metaRows = this.query(
      `SELECT COUNT(*) as totalEmails, SUM(fileSize) as totalSizeBytes, MAX(indexedAt) as lastIndexedAt FROM emails_meta`,
    );
    const meta = metaRows[0] ?? { totalEmails: 0, totalSizeBytes: null, lastIndexedAt: null };

    const attRows = this.query(`SELECT COUNT(*) as total FROM emails_meta WHERE hasAttachments = 1`);
    const total = attRows[0]?.['total'] ?? 0;

    const folderRows = this.query(
      `SELECT folder, COUNT(*) as cnt FROM emails_meta GROUP BY folder`,
    );
    const folderCounts: Record<string, number> = {};
    for (const row of folderRows) {
      folderCounts[row['folder'] as string] = (row['cnt'] as number) || 0;
    }

    return {
      totalEmails: (meta['totalEmails'] as number) || 0,
      totalAttachments: (total as number) || 0,
      totalSizeBytes: (meta['totalSizeBytes'] as number) ?? 0,
      lastIndexedAt: meta['lastIndexedAt'] as string | null,
      byFolder: {
        inbox: folderCounts['inbox'] ?? 0,
        outbox: folderCounts['outbox'] ?? 0,
        drafts: folderCounts['drafts'] ?? 0,
      },
    };
  }

  getAll(): { messageId: string; filePath: string; indexedAt: string }[] {
    this.assertInitialized();
    const rows = this.query(`SELECT messageId, filePath, indexedAt FROM emails_meta`);
    return rows as unknown as { messageId: string; filePath: string; indexedAt: string }[];
  }

  private rowToSearchResult(row: Record<string, SqlValue>): SearchResult {
    return {
      messageId: row['messageId'] as string,
      filePath: row['filePath'] as string,
      fromAddress: (row['fromAddress'] as string | null) ?? null,
      toAddresses: (row['toAddresses'] as string | null) ?? null,
      ccAddresses: (row['ccAddresses'] as string | null) ?? null,
      subject: (row['subject'] as string | null) ?? null,
      date: (row['date'] as string | null) ?? null,
      hasAttachments: (row['hasAttachments'] as number) ?? 0,
      fileSize: (row['fileSize'] as number) ?? 0,
      indexedAt: (row['indexedAt'] as string | null) ?? null,
      folder: (row['folder'] as string) ?? 'drafts',
    };
  }
}
