// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { DefaultAzureCredential } from '@azure/identity';
import { BlobSASPermissions, BlobServiceClient } from '@azure/storage-blob';
import { isString, splitN } from '@medplum/core';
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

  /**
   * Writes a file to Azure Blob Storage.
   * This method now correctly handles both Readable streams and strings as input.
   * @param key - The key (path) for the file in the container.
   * @param contentType - The MIME type of the content.
   * @param data - The content to write, either as a Readable stream or a string.
   */
  async writeFile(key: string, contentType: string | undefined, data: BinarySource): Promise<void> {
    const blockBlobClient = this.containerClient.getBlockBlobClient(key);
    const blobHTTPHeaders = {
      blobContentType: contentType ?? 'application/octet-stream',
      blobCacheControl: 'max-age=3600, s-maxage=86400',
    };

    if (isString(data)) {
      // For strings, we can directly upload the string content as a blob.
      await blockBlobClient.upload(data, data.length, {
        blobHTTPHeaders,
      });
    } else {
      // For streams, we pipe the data to a write stream provided by the client library.
      await blockBlobClient.uploadStream(data as IncomingMessage, undefined, undefined, {
        blobHTTPHeaders,
      });
    }
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
