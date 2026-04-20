// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import duckdb from 'duckdb';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { exportData } from './export.js';

describe('Data Warehouse Export', () => {
  let pgContainer: any;
  let databaseUrl: string;
  let tempDir: string;

  beforeAll(async () => {
    // Spin up Postgres
    pgContainer = await new PostgreSqlContainer('postgres:16-alpine').start();

    // Connect and create table + insert data
    databaseUrl = pgContainer.getConnectionUri();

    const db = new duckdb.Database(':memory:');
    const execAsync = (query: string): Promise<void> => {
      return new Promise((resolve, reject) => {
        db.exec(query, (err) => (err ? reject(err) : resolve()));
      });
    };

    await execAsync(`INSTALL postgres; LOAD postgres;`);
    await execAsync(`ATTACH '${databaseUrl}' AS pg_db (TYPE postgres);`);

    // Create AuditEvent table and insert sample data
    await execAsync(`
      CREATE TABLE pg_db."AuditEvent" (
        id UUID PRIMARY KEY,
        content TEXT NOT NULL,
        "lastUpdated" TIMESTAMP WITH TIME ZONE NOT NULL
      );
    `);

    await execAsync(`
      INSERT INTO pg_db."AuditEvent" VALUES
        ('00000000-0000-0000-0000-000000000001', '{"event": 1}', '2026-04-11 10:00:00+00'),
        ('00000000-0000-0000-0000-000000000002', '{"event": 2}', '2026-04-11 10:15:00+00'),
        ('00000000-0000-0000-0000-000000000003', '{"event": 3}', '2026-04-11 10:30:00+00');
    `);

    db.close();

    // Create temp dir for mock S3 Iceberg catalog
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iceberg-test-'));
    fs.mkdirSync(path.join(tempDir, 'audit_events'));
  }, 10000);

  afterAll(async () => {
    await pgContainer.stop();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }, 10000);

  it('should incrementally export data to parquet files', async () => {
    // 1. Initial export: 10:00 to 10:20 (Should export 2 rows)
    await exportData({
      databaseUrl,
      s3Bucket: 'test-bucket', // ignored because of testLocalPath
      s3Region: 'us-east-1',
      startWindow: '2026-04-11T10:00:00Z',
      endWindow: '2026-04-11T10:20:00Z',
      testLocalPath: tempDir,
    });

    // Verify
    const db = new duckdb.Database(':memory:');
    const allAsync = (query: string): Promise<any[]> => {
      return new Promise((resolve, reject) => {
        db.all(query, (err, res) => (err ? reject(err) : resolve(res)));
      });
    };

    const res1 = await allAsync(`
      SELECT * FROM read_parquet('${tempDir}/audit_events/*.parquet') ORDER BY "lastUpdated";
    `);

    expect(res1.length).toBe(2);
    expect(res1[0].id).toBe('00000000-0000-0000-0000-000000000001');

    // 2. Idempotent retry: 10:00 to 10:20 (Should still have 2 rows total)
    await exportData({
      databaseUrl,
      s3Bucket: 'test-bucket',
      s3Region: 'us-east-1',
      startWindow: '2026-04-11T10:00:00Z',
      endWindow: '2026-04-11T10:20:00Z',
      testLocalPath: tempDir,
    });

    const res2 = await allAsync(`
      SELECT * FROM read_parquet('${tempDir}/audit_events/*.parquet') ORDER BY "lastUpdated";
    `);
    expect(res2.length).toBe(2);

    // 3. Incremental next window: 10:20 to 10:40 (Should add 1 row)
    await exportData({
      databaseUrl,
      s3Bucket: 'test-bucket',
      s3Region: 'us-east-1',
      startWindow: '2026-04-11T10:20:00Z',
      endWindow: '2026-04-11T10:40:00Z',
      testLocalPath: tempDir,
    });

    const res3 = await allAsync(`
      SELECT * FROM read_parquet('${tempDir}/audit_events/*.parquet') ORDER BY "lastUpdated";
    `);
    expect(res3.length).toBe(3);

    db.close();
  }, 10000);
});
