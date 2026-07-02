// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import {
  CreateNamespaceCommand,
  CreateTableCommand,
  GetTableCommand,
  OpenTableFormat,
  S3TablesClient,
} from '@aws-sdk/client-s3tables';
import { buildMedplumWarehouseHistoryIcebergMetadata } from './warehouse-iceberg-metadata';

export function createS3TablesClient(region: string): S3TablesClient {
  return new S3TablesClient({ region });
}

export async function tableExists(
  s3TablesClient: S3TablesClient,
  tableBucketArn: string,
  namespace: string,
  tableName: string
): Promise<boolean> {
  try {
    await s3TablesClient.send(
      new GetTableCommand({
        tableBucketARN: tableBucketArn,
        namespace,
        name: tableName,
      })
    );
    return true;
  } catch (error: any) {
    if (typeof error?.name === 'string' && error.name === 'NotFoundException') {
      return false;
    } else {
      throw error;
    }
  }
}

export async function ensureNamespaceExists(
  s3TablesClient: S3TablesClient,
  tableBucketArn: string,
  namespace: string
): Promise<void> {
  try {
    await s3TablesClient.send(
      new CreateNamespaceCommand({
        tableBucketARN: tableBucketArn,
        namespace: [namespace],
      })
    );
  } catch (error: any) {
    if (typeof error?.name === 'string' && (error.name.includes('Conflict') || error.name.includes('AlreadyExists'))) {
      return;
    }
    throw error;
  }
}

export type EnsureWarehouseIcebergTableResult = 'created' | 'skipped';

/**
 * Ensures a single managed Iceberg table exists for Medplum `_History` warehouse sync (idempotent).
 *
 * @param s3TablesClient - AWS S3 Tables client for the table bucket region.
 * @param tableBucketArn - Table bucket ARN (`dataWarehouse.awsS3TableArn`).
 * @param namespace - Iceberg namespace in the table bucket.
 * @param icebergTableName - Lowercased Iceberg table name (e.g. `patient_history`).
 * @returns Whether a new table was created or an existing table was left in place.
 */
export async function ensureWarehouseHistoryIcebergTable(
  s3TablesClient: S3TablesClient,
  tableBucketArn: string,
  namespace: string,
  icebergTableName: string
): Promise<EnsureWarehouseIcebergTableResult> {
  if (await tableExists(s3TablesClient, tableBucketArn, namespace, icebergTableName)) {
    return 'skipped';
  }

  try {
    await s3TablesClient.send(
      new CreateTableCommand({
        tableBucketARN: tableBucketArn,
        namespace,
        name: icebergTableName,
        format: OpenTableFormat.ICEBERG,
        metadata: { iceberg: buildMedplumWarehouseHistoryIcebergMetadata() },
      })
    );
    return 'created';
  } catch (error: any) {
    const errorName = typeof error?.name === 'string' ? error.name : '';
    if (errorName.includes('Conflict') || errorName === 'ConflictException') {
      if (await tableExists(s3TablesClient, tableBucketArn, namespace, icebergTableName)) {
        return 'skipped';
      }
    }
    throw error;
  }
}
