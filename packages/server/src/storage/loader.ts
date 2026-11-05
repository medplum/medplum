// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { normalizeErrorString } from '@medplum/core';
import type { Binary } from '@medplum/fhirtypes';
import { S3Storage } from '../cloud/aws/storage';
import { AzureBlobStorage } from '../cloud/azure/storage';
import { GoogleCloudStorage } from '../cloud/gcp/storage';
import { getConfig } from '../config/loader';
import { getLogger } from '../logger';
import type { PresignedUrlOptions } from './base';
import { FileSystemStorage } from './filesystem';
import { generatePresignedUrl } from './presign';
import type { BinaryStorage } from './types';

let binaryStorage: BinaryStorage | undefined = undefined;

export function initBinaryStorage(type?: string): void {
  if (type?.startsWith('s3:')) {
    binaryStorage = new S3Storage(type.replace('s3:', ''));
  } else if (type?.startsWith('azure:')) {
    binaryStorage = new AzureBlobStorage(type.replace('azure:', ''));
  } else if (type?.startsWith('file:')) {
    binaryStorage = new FileSystemStorage(type.replace('file:', ''));
  } else if (type?.startsWith('gs:')) {
    binaryStorage = new GoogleCloudStorage(type.replace('gs:', ''));
  } else {
    binaryStorage = undefined;
  }
}

export function getBinaryStorage(): BinaryStorage {
  if (!binaryStorage) {
    throw new Error('Binary storage not initialized');
  }
  return binaryStorage;
}

/**
 * Deletes stored objects for expunged Binary resources.
 *
 * No-op on deployments where binary storage is not configured. Best effort: a storage failure must
 * not fail the expunge, because the database rows are already gone by the time this runs. Failures
 * are logged with the key so the object can be reclaimed.
 * @param storageKeys - The storage keys to delete.
 */
export async function deleteBinaryStorageObjects(storageKeys: string[]): Promise<void> {
  if (!binaryStorage) {
    return;
  }
  for (const key of storageKeys) {
    try {
      await binaryStorage.deleteFile(key);
    } catch (err) {
      getLogger().warn('Failed to delete binary storage object during expunge', {
        key,
        error: normalizeErrorString(err),
      });
    }
  }
}

export async function getPresignedUrl(binary: Binary, opts?: PresignedUrlOptions): Promise<string> {
  const config = getConfig();

  if (config.storageBaseUrl.startsWith(config.baseUrl)) {
    // If the storage base URL is the same as the FHIR base URL, generate a presigned URL
    // This URL will be handled by the built-in storage handler
    // See packages/server/src/storage/routes.ts
    return generatePresignedUrl(binary, opts);
  } else {
    // Otherwise, return the presigned URL from the storage backend
    // This URL will be handled by the storage backend (e.g., S3, Azure Blob Storage, etc.)
    return getBinaryStorage().getPresignedUrl(binary, opts);
  }
}
