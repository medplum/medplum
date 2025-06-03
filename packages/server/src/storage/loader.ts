import { S3Storage } from '../cloud/aws/storage';
import { AzureBlobStorage } from '../cloud/azure/storage';
import { GoogleCloudStorage } from '../cloud/gcp/storage';
import { FileSystemStorage } from './filesystem';
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
