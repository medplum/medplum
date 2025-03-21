import { Storage } from '@google-cloud/storage';
import { Readable } from 'stream';
import { BinarySource, BinaryStorage, checkFileMetadata } from '../../fhir/storage';
import { Binary } from '@medplum/fhirtypes';
import { splitN } from '@medplum/core';

export class GCPBlobStorage implements BinaryStorage {
  private readonly storage: Storage;
  private readonly bucket;

  constructor(bucketName: string) {
    this.storage = new Storage();
    this.bucket = this.storage.bucket(bucketName);
  }

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
    const file = this.bucket.file(key);
    return new Promise((resolve, reject) => {
      const writeStream = file.createWriteStream({
        metadata: { contentType: contentType ?? 'application/octet-stream' },
        resumable: false
      });
      stream.pipe(writeStream)
        .on('finish', () => resolve())
        .on('error', (err: any) => reject(err));
    });
  }

  async readBinary(binary: Binary): Promise<Readable> {
    const file = this.bucket.file(this.getKey(binary));
    return file.createReadStream();
  }

  async copyBinary(sourceBinary: Binary, destinationBinary: Binary): Promise<void> {
    await this.copyFile(this.getKey(sourceBinary), this.getKey(destinationBinary));
  }

  async copyFile(sourceKey: string, destinationKey: string): Promise<void> {
    const sourceFile = this.bucket.file(sourceKey);
    const destinationFile = this.bucket.file(destinationKey);
    await sourceFile.copy(destinationFile);
  }

  async getPresignedUrl(binary: Binary): Promise<string> {
    const file = this.bucket.file(this.getKey(binary));
    const options = {
      action: 'read' as const,
      expires: Date.now() + 3600 * 1000,
    };
    const [url] = await file.getSignedUrl(options);
    return url;
  }

  getKey(binary: Binary): string {
    return `binary/${binary.id}/${binary.meta?.versionId}`;
  }
}