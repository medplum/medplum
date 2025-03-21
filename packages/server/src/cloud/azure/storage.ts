import { DefaultAzureCredential } from '@azure/identity';
import { BlobServiceClient, BlobSASPermissions } from '@azure/storage-blob';
import { Readable } from 'stream';
import { IncomingMessage } from 'http';
import { BinarySource, BinaryStorage, checkFileMetadata } from '../../fhir/storage';
import { Binary } from '@medplum/fhirtypes';
import { splitN } from '@medplum/core';

/**
 * The AzureBlobStorage class stores binary data in an Azure Blob Storage container
 * Files are stored in bucket/binary/binary.id/binary.meta.versionId.
 */
export class AzureBlobStorage implements BinaryStorage {
  private readonly client: BlobServiceClient;
  private readonly containerClient;

  constructor(azureStorage: string) {
    // const config = getConfig();
    const credentials = new DefaultAzureCredential();
    const [storageAccountName, containerName] = splitN(azureStorage, ':', 2);
    this.client = new BlobServiceClient(`https://${storageAccountName}.blob.core.windows.net`, credentials);
    this.containerClient = this.client.getContainerClient(containerName);
  }

  /**
   * Writes a binary blob to Blob Storage.
   * @param binary - The binary resource destination.
   * @param filename - Optional binary filename.
   * @param contentType - Optional binary content type.
   * @param stream - The Node.js stream of readable content.
   * @returns Promise that resolves when the write is complete.
   */
  async writeBinary(
    binary: Binary,
    filename: string | undefined,
    contentType: string | undefined,
    stream: BinarySource
  ): Promise<void> {
    checkFileMetadata(filename, contentType);
    await this.writeFile(this.getKey(binary), contentType, stream);
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

  async readBinary(binary: Binary): Promise<Readable> {
    const blobClient = this.containerClient.getBlobClient(this.getKey(binary));
    const downloadBlockBlobResponse = await blobClient.download();

    return downloadBlockBlobResponse.readableStreamBody as Readable;
  }

  async copyBinary(sourceBinary: Binary, destinationBinary: Binary): Promise<void> {
    await this.copyFile(this.getKey(sourceBinary), this.getKey(destinationBinary));
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

  getKey(binary: Binary): string {
    return `binary/${binary.id}/${binary.meta?.versionId}`;
  }
}
