import type { DatabaseSync } from 'node:sqlite';
import { SqlDialect } from './dialect.js';

/**
 * Minimal database connection interface for executing parameterized SQL.
 */
export interface SqlConnection {
  readonly dialect: SqlDialect;
  query(sql: string, values?: any[]): Promise<{ rowCount: number; rows: any[] }>;
}

export class SqliteConnection implements SqlConnection {
  readonly dialect = SqlDialect.SQLITE;
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  async query(sql: string, values?: any[]): Promise<{ rowCount: number; rows: any[] }> {
    const stmt = this.db.prepare(sql);
    const rows = values?.length ? stmt.all(...values) : stmt.all();
    return { rowCount: rows.length, rows };
  }
}
