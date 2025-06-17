import { Binary } from '@medplum/fhirtypes';
import { S3Storage } from '../cloud/aws/storage';
import { AzureBlobStorage } from '../cloud/azure/storage';
import { GoogleCloudStorage } from '../cloud/gcp/storage';
import { getConfig } from '../config/loader';
import { FileSystemStorage } from './filesystem';
import { generatePresignedUrl } from './presign';
import { BinaryStorage } from './types';

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

export async function getPresignedUrl(binary: Binary): Promise<string> {
  const config = getConfig();

  if (config.storageBaseUrl.startsWith(config.baseUrl)) {
    // If the storage base URL is the same as the FHIR base URL, generate a presigned URL
    // This URL will be handled by the built-in storage handler
    // See packages/server/src/storage/routes.ts
    return generatePresignedUrl(binary);
  } else {
    // Otherwise, return the presigned URL from the storage backend
    // This URL will be handled by the storage backend (e.g., S3, Azure Blob Storage, etc.)
    return getBinaryStorage().getPresignedUrl(binary);
  }
}
