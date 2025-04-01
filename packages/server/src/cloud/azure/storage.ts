import { DefaultAzureCredential } from '@azure/identity';
import { BlobSASPermissions, BlobServiceClient } from '@azure/storage-blob';
import { splitN } from '@medplum/core';
import { Binary } from '@medplum/fhirtypes';
import { IncomingMessage } from 'http';
import { Readable } from 'stream';
import { BaseBinaryStorage } from '../../storage/base';
import { BinarySource } from '../../storage/types';

/**
 * The AzureBlobStorage class stores binary data in an Azure Blob Storage container
 * Files are stored in bucket/binary/binary.id/binary.meta.versionId.
 */
export class AzureBlobStorage extends BaseBinaryStorage {
  private readonly client: BlobServiceClient;
  private readonly containerClient;

  constructor(azureStorage: string) {
    super();
    const credentials = new DefaultAzureCredential();
    const [storageAccountName, containerName] = splitN(azureStorage, ':', 2);
    this.client = new BlobServiceClient(`https://${storageAccountName}.blob.core.windows.net`, credentials);
    this.containerClient = this.client.getContainerClient(containerName);
  }

  async writeFile(key: string, contentType: string | undefined, stream: BinarySource): Promise<void> {
    const blockBlobClient = this.containerClient.getBlockBlobClient(key);

    await blockBlobClient.uploadStream(stream as IncomingMessage, undefined, undefined, {
      blobHTTPHeaders: {
        blobContentType: contentType ?? 'application/octet-stream',
        blobCacheControl: 'max-age=3600, s-maxage=86400',
      },
    });
  }

  async readFile(key: string): Promise<Readable> {
    const blobClient = this.containerClient.getBlobClient(key);
    const downloadBlockBlobResponse = await blobClient.download();

    return downloadBlockBlobResponse.readableStreamBody as Readable;
  }

  async copyFile(sourceKey: string, destinationKey: string): Promise<void> {
    const sourceBlobClient = this.containerClient.getBlobClient(sourceKey);
    const destinationBlobClient = this.containerClient.getBlobClient(destinationKey);

    await destinationBlobClient.beginCopyFromURL(sourceBlobClient.url);
  }

  async getPresignedUrl(binary: Binary): Promise<string> {
    const blobClient = this.containerClient.getBlobClient(this.getKey(binary));

    // we need to get this key to generate the SAS URL with the medplum managed identity
    const userDelegationKey = await this.client.getUserDelegationKey(
      new Date(),
      new Date(new Date().valueOf() + 3600 * 1000) // 1 hour expiry
    );

    const now = new Date();
    const expiry = new Date(now);
    expiry.setHours(now.getHours() + 1); // URL valid for 1 hour

    const permissions = new BlobSASPermissions();
    permissions.read = true;

    const generateSasUrlOptions = {
      expiresOn: expiry,
      permissions: permissions,
    };

    return blobClient.generateUserDelegationSasUrl(generateSasUrlOptions, userDelegationKey);
  }
}
