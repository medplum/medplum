// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildExportQueries } from './export.js';

describe('Data Warehouse Export - Unit Tests', () => {
  it('should build correct SQL queries for production environment (Parquet fallback)', () => {
    const queries = buildExportQueries({
      databaseUrl: 'postgresql://user:pass@localhost/db',
      s3Bucket: 'my-bucket',
      s3Region: 'us-west-2',
      startWindow: '2026-01-01T00:00:00Z',
      endWindow: '2026-01-02T00:00:00Z',
    });

    expect(queries).toContain('INSTALL postgres;');
    expect(queries).toContain('LOAD postgres;');
    expect(queries).toContain('INSTALL httpfs;');
    expect(queries).toContain('LOAD httpfs;');

    // S3 secret should be created
    expect(queries.find((q: string) => q.includes('CREATE SECRET') && q.includes("REGION 'us-west-2'"))).toBeDefined();

    // Postgres attach
    expect(queries).toContain("ATTACH 'postgresql://user:pass@localhost/db' AS pg_db (TYPE postgres);");

    // Parquet output
    expect(queries).toContain(
      'COPY (SELECT id, content, "lastUpdated" AS last_updated, "projectId" AS project_id FROM pg_db."AuditEvent" WHERE lastUpdated >= \'2026-01-01T00:00:00Z\' AND lastUpdated < \'2026-01-02T00:00:00Z\') TO \'s3://my-bucket/audit_events/window_2026-01-01-00-00-00_2026-01-02-00-00-00.parquet\' (FORMAT PARQUET);'
    );
  });

  it('should build correct SQL queries for AWS S3 Tables managed Iceberg', () => {
    const queries = buildExportQueries({
      databaseUrl: 'postgresql://user:pass@localhost/db',
      s3Bucket: '', // omitted
      s3Region: 'us-west-2',
      startWindow: '2026-01-01T00:00:00Z',
      endWindow: '2026-01-02T00:00:00Z',
      awsS3TableArn: 'arn:aws:s3tables:us-west-2:123456789012:bucket/my-s3-tables-bucket',
    });

    expect(queries).toContain('INSTALL aws;');
    expect(queries).toContain('LOAD aws;');
    expect(queries).toContain('INSTALL postgres;');
    expect(queries).toContain('LOAD postgres;');
    expect(queries).toContain('INSTALL httpfs;');
    expect(queries).toContain('LOAD httpfs;');
    expect(queries).toContain('INSTALL iceberg;');
    expect(queries).toContain('LOAD iceberg;');

    // S3 secret should be created
    expect(queries.find((q: string) => q.includes('CREATE SECRET') && q.includes("REGION 'us-west-2'"))).toBeDefined();

    // Postgres attach
    expect(queries).toContain("ATTACH 'postgresql://user:pass@localhost/db' AS pg_db (TYPE postgres);");

    // S3 Tables attach
    expect(queries).toContain(
      "ATTACH 'arn:aws:s3tables:us-west-2:123456789012:bucket/my-s3-tables-bucket' AS s3_tables_db ( TYPE iceberg, ENDPOINT_TYPE s3_tables );"
    );

    // Schema creation
    expect(queries).toContain('CREATE SCHEMA IF NOT EXISTS s3_tables_db.default;');

    // Table creation
    expect(queries).toContain(
      'CREATE TABLE IF NOT EXISTS s3_tables_db.default.audit_events AS SELECT * FROM pg_db."AuditEvent" LIMIT 0;'
    );

    // Idempotent Delete
    expect(queries).toContain(
      "DELETE FROM s3_tables_db.default.audit_events WHERE lastUpdated >= '2026-01-01T00:00:00Z' AND lastUpdated < '2026-01-02T00:00:00Z';"
    );

    // Incremental Insert
    expect(queries).toContain(
      "INSERT INTO s3_tables_db.default.audit_events SELECT * FROM pg_db.\"AuditEvent\" WHERE lastUpdated >= '2026-01-01T00:00:00Z' AND lastUpdated < '2026-01-02T00:00:00Z';"
    );
  });

  it('should build correct SQL queries for test environment (mocking S3)', () => {
    const queries = buildExportQueries({
      databaseUrl: 'postgresql://user:pass@localhost/db',
      s3Bucket: 'my-bucket',
      s3Region: 'us-west-2',
      startWindow: '2026-01-01T00:00:00Z',
      endWindow: '2026-01-02T00:00:00Z',
      testLocalPath: '/tmp/mock-s3-path',
    });

    // S3 secret should NOT be created
    expect(queries.find((q: string) => q.includes('CREATE SECRET'))).toBeUndefined();

    // Parquet output using local path
    expect(queries).toContain(
      'COPY (SELECT id, content, "lastUpdated" AS last_updated, "projectId" AS project_id FROM pg_db."AuditEvent" WHERE lastUpdated >= \'2026-01-01T00:00:00Z\' AND lastUpdated < \'2026-01-02T00:00:00Z\') TO \'/tmp/mock-s3-path/audit_events/window_2026-01-01-00-00-00_2026-01-02-00-00-00.parquet\' (FORMAT PARQUET);'
    );
  });
});
