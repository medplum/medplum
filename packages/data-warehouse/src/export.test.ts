// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { DuckDBInstance } from '@duckdb/node-api';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { exportData } from './export.js';

describe('Data Warehouse Export', () => {
  let pgContainer: any;
  let databaseUrl: string;
  /** Set only after successful setup; undefined if `beforeAll` throws (e.g. no Docker). */
  let tempDir: string | undefined;

  beforeAll(async () => {
    // Spin up Postgres
    pgContainer = await new PostgreSqlContainer('postgres:17').start();

    // Connect and create table + insert data
    databaseUrl = pgContainer.getConnectionUri();

    const instance = await DuckDBInstance.create(':memory:');
    const connection = await instance.connect();

    await connection.run(`INSTALL postgres; LOAD postgres;`);
    await connection.run(`ATTACH '${databaseUrl}' AS pg_db (TYPE postgres);`);

    // Create AuditEvent table and insert sample data
    await connection.run(`
      CREATE TABLE pg_db."AuditEvent" (
        id UUID PRIMARY KEY,
        content TEXT NOT NULL,
        "projectId" UUID NOT NULL,
        "lastUpdated" TIMESTAMP WITH TIME ZONE NOT NULL
      );
    `);

    await connection.run(`
      INSERT INTO pg_db."AuditEvent" VALUES
        ('00000000-0000-0000-0000-000000000001', '{"event": 1}', '123e4567-e89b-12d3-a456-426614174000', '2026-04-11 10:00:00+00'),
        ('00000000-0000-0000-0000-000000000002', '{"event": 2}', '123e4567-e89b-12d3-a456-426614174000', '2026-04-11 10:15:00+00'),
        ('00000000-0000-0000-0000-000000000003', '{"event": 3}', '123e4567-e89b-12d3-a456-426614174000', '2026-04-11 10:30:00+00');
    `);

    connection.closeSync();

    // Create temp dir for mock S3 Iceberg catalog
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iceberg-test-'));
    fs.mkdirSync(path.join(tempDir, 'audit_events'));
  }, 10000);

  afterAll(async () => {
    if (pgContainer) {
      await pgContainer.stop();
    }
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }, 10000);

  it('should incrementally export data to parquet files', async () => {
    // 1. Initial export: 10:00 to 10:20 (Should export 2 rows)
    await exportData({
      databaseUrl,
      s3Bucket: 'test-bucket', // ignored because of localPath
      s3Region: 'us-east-1',
      startWindow: '2026-04-11T10:00:00Z',
      endWindow: '2026-04-11T10:20:00Z',
      localPath: tempDir,
    });

    // Verify
    const instance = await DuckDBInstance.create(':memory:');
    const connection = await instance.connect();

    const res1 = (
      await connection.runAndReadAll(`
      SELECT * FROM read_parquet('${tempDir}/audit_events/*.parquet') ORDER BY last_updated;
    `)
    ).getRowObjectsJson() as { id: string }[];

    expect(res1.length).toBe(2);
    expect(res1[0].id).toBe('00000000-0000-0000-0000-000000000001');

    // 2. Idempotent retry: 10:00 to 10:20 (Should still have 2 rows total)
    await exportData({
      databaseUrl,
      s3Bucket: 'test-bucket',
      s3Region: 'us-east-1',
      startWindow: '2026-04-11T10:00:00Z',
      endWindow: '2026-04-11T10:20:00Z',
      localPath: tempDir,
    });

    const res2 = (
      await connection.runAndReadAll(`
      SELECT * FROM read_parquet('${tempDir}/audit_events/*.parquet') ORDER BY last_updated;
    `)
    ).getRowObjectsJson();
    expect(res2.length).toBe(2);

    // 3. Incremental next window: 10:20 to 10:40 (Should add 1 row)
    await exportData({
      databaseUrl,
      s3Bucket: 'test-bucket',
      s3Region: 'us-east-1',
      startWindow: '2026-04-11T10:20:00Z',
      endWindow: '2026-04-11T10:40:00Z',
      localPath: tempDir,
    });

    const res3 = (
      await connection.runAndReadAll(`
      SELECT * FROM read_parquet('${tempDir}/audit_events/*.parquet') ORDER BY last_updated;
    `)
    ).getRowObjectsJson();
    expect(res3.length).toBe(3);

    connection.closeSync();
  }, 10000);
});
