// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import duckdb from 'duckdb';

export interface ExportOptions {
  databaseUrl: string;
  s3Bucket: string;
  s3Region: string;
  startWindow: string;
  endWindow: string;
  awsS3TableArn?: string; // Optional AWS S3 Table ARN for managed Iceberg
  testLocalPath?: string; // Used for mocking S3 in tests
}

export function buildExportQueries(options: ExportOptions): string[] {
  const queries: string[] = [];

  // Load extensions
  if (options.awsS3TableArn) {
    queries.push(`INSTALL aws;`);
    queries.push(`LOAD aws;`);
  }
  queries.push(`INSTALL postgres;`);
  queries.push(`LOAD postgres;`);
  queries.push(`INSTALL httpfs;`);
  queries.push(`LOAD httpfs;`);

  if (options.awsS3TableArn) {
    queries.push(`INSTALL iceberg;`);
    queries.push(`LOAD iceberg;`);
  }

  // In tests, we skip S3 auth
  if (!options.testLocalPath) {
    queries.push(`CREATE SECRET ( TYPE S3, PROVIDER CREDENTIAL_CHAIN, REGION '${options.s3Region}' );`);
  }

  // Attach Postgres database
  queries.push(`ATTACH '${options.databaseUrl}' AS pg_db (TYPE postgres);`);

  if (options.awsS3TableArn) {
    // Attach AWS S3 Table natively
    queries.push(`ATTACH '${options.awsS3TableArn}' AS s3_tables_db ( TYPE iceberg, ENDPOINT_TYPE s3_tables );`);
    
    // Create namespace and table if they don't exist
    // The namespace needs to match the desired table location, assuming 'default'
    queries.push(`CREATE SCHEMA IF NOT EXISTS s3_tables_db.default;`);
    queries.push(`CREATE TABLE IF NOT EXISTS s3_tables_db.default.audit_events AS SELECT * FROM pg_db."AuditEvent" LIMIT 0;`);
    
    // Execute idempotent delete for the time window
    queries.push(`DELETE FROM s3_tables_db.default.audit_events WHERE lastUpdated >= '${options.startWindow}' AND lastUpdated < '${options.endWindow}';`);
    
    // Execute incremental insert
    queries.push(`INSERT INTO s3_tables_db.default.audit_events SELECT * FROM pg_db."AuditEvent" WHERE lastUpdated >= '${options.startWindow}' AND lastUpdated < '${options.endWindow}';`);
  } else {
    // Fallback: Write unmanaged partitioned Parquet files
    const s3Path = options.testLocalPath || `s3://${options.s3Bucket}`;
    const safeStart = options.startWindow.replace(/[:.T]/g, '-').replace('Z', '');
    const safeEnd = options.endWindow.replace(/[:.T]/g, '-').replace('Z', '');
    const parquetFile = `${s3Path}/audit_events/window_${safeStart}_${safeEnd}.parquet`;
    
    queries.push(`COPY (SELECT content, "lastUpdated" as last_updated, "projectId" as project_id FROM pg_db."AuditEvent" WHERE lastUpdated >= '${options.startWindow}' AND lastUpdated < '${options.endWindow}') TO '${parquetFile}' (FORMAT PARQUET);`);
  }

  return queries;
}

export async function exportData(options: ExportOptions): Promise<void> {
  const db = new duckdb.Database(':memory:');
  
  const execAsync = (query: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      db.exec(query, (err) => (err ? reject(err) : resolve()));
    });
  };

  try {
    const queries = buildExportQueries(options);
    
    for (const query of queries) {
      if (query.startsWith('DELETE') || query.startsWith('INSERT')) {
        console.log(`Executing: ${query}`);
      }
      await execAsync(query);
    }
  } finally {
    db.close();
  }
}
