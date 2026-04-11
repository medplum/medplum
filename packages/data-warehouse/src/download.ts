// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { execFile } from 'child_process';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import duckdb from 'duckdb';
import { createWriteStream, promises as fs } from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { promisify } from 'util';

export interface DownloadParquetOptions {
  awsS3TableArn: string;
  s3Region: string;
  namespace: string;
  table: string;
  outputDir: string;
}

function parseS3Uri(uri: string): { bucket: string; key: string } {
  if (!uri.startsWith('s3://')) {
    throw new Error(`Unsupported file path: ${uri}`);
  }

  const withoutScheme = uri.slice('s3://'.length);
  const slashIndex = withoutScheme.indexOf('/');

  if (slashIndex === -1) {
    throw new Error(`Invalid S3 path: ${uri}`);
  }

  const bucket = withoutScheme.slice(0, slashIndex);
  const key = withoutScheme.slice(slashIndex + 1);

  if (!bucket || !key) {
    throw new Error(`Invalid S3 path: ${uri}`);
  }

  return { bucket, key };
}

const execFileAsync = promisify(execFile);

interface GetTableMetadataLocationResponse {
  metadataLocation: string;
}

async function getTableMetadataLocation(options: DownloadParquetOptions): Promise<string> {
  const { stdout } = await execFileAsync('aws', [
    's3tables',
    'get-table-metadata-location',
    '--table-bucket-arn',
    options.awsS3TableArn,
    '--namespace',
    options.namespace,
    '--name',
    options.table,
    '--region',
    options.s3Region,
    '--output',
    'json',
    '--no-cli-pager',
  ]);

  const response = JSON.parse(stdout) as GetTableMetadataLocationResponse;
  if (!response.metadataLocation) {
    throw new Error('Failed to resolve metadata location from AWS S3 Tables');
  }

  return response.metadataLocation;
}

async function downloadFileWithS3Client(
  s3Client: S3Client,
  bucket: string,
  key: string,
  destination: string
): Promise<void> {
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const response = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));

  if (!response.Body) {
    throw new Error(`Unexpected S3 response body for s3://${bucket}/${key}`);
  }

  if (response.Body instanceof Readable) {
    await pipeline(response.Body, createWriteStream(destination));
    return;
  }

  if (typeof response.Body === 'object' && 'transformToWebStream' in response.Body) {
    const webStream = await response.Body.transformToWebStream();
    await pipeline(Readable.fromWeb(webStream), createWriteStream(destination));
    return;
  }

  throw new Error(`Unsupported S3 response body for s3://${bucket}/${key}`);
}

export async function downloadParquetFiles(options: DownloadParquetOptions): Promise<number> {
  const db = new duckdb.Database(':memory:');
  const s3Client = new S3Client({ region: options.s3Region });

  const execAsync = (query: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      db.exec(query, (err) => (err ? reject(err) : resolve()));
    });
  };

  const allAsync = <T>(query: string): Promise<T[]> => {
    return new Promise((resolve, reject) => {
      db.all(query, (err, rows) => (err ? reject(err) : resolve(rows as T[])));
    });
  };

  try {
    const metadataLocation = await getTableMetadataLocation(options);

    await execAsync('INSTALL aws;');
    await execAsync('LOAD aws;');
    await execAsync('INSTALL httpfs;');
    await execAsync('LOAD httpfs;');
    await execAsync('INSTALL iceberg;');
    await execAsync('LOAD iceberg;');
    await execAsync(`CREATE SECRET ( TYPE S3, PROVIDER CREDENTIAL_CHAIN, REGION '${options.s3Region}' );`);
    const escapedMetadataLocation = metadataLocation.replace(/'/g, "''");
    const rows = await allAsync<{ file_path: string }>(
      `SELECT DISTINCT file_path FROM iceberg_metadata('${escapedMetadataLocation}') WHERE lower(file_format) = 'parquet' ORDER BY file_path;`
    );

    if (rows.length === 0) {
      return 0;
    }

    await fs.mkdir(options.outputDir, { recursive: true });

    for (const row of rows) {
      const { bucket, key } = parseS3Uri(row.file_path);
      const destination = path.join(options.outputDir, bucket, key);
      await downloadFileWithS3Client(s3Client, bucket, key, destination);
      console.log(`Downloaded ${row.file_path} -> ${destination}`);
    }

    return rows.length;
  } finally {
    db.close();
  }
}
