import { Storage } from '@google-cloud/storage';
import { Binary } from '@medplum/fhirtypes';
import { IncomingMessage } from 'http';
import { Readable } from 'stream';
import { BaseBinaryStorage } from '../../storage/base';
import { BinarySource } from '../../storage/types';

export class GoogleCloudStorage extends BaseBinaryStorage {
  private readonly storage: Storage;
  private readonly bucket;

  constructor(bucketName: string) {
    super();
    this.storage = new Storage();
    this.bucket = this.storage.bucket(bucketName);
  }

  async writeFile(key: string, contentType: string | undefined, stream: BinarySource): Promise<void> {
    const file = this.bucket.file(key);
    return new Promise((resolve, reject) => {
      const writeStream = file.createWriteStream({
        metadata: { contentType: contentType ?? 'application/octet-stream' },
        resumable: false,
      });
      (stream as IncomingMessage)
        .pipe(writeStream)
        .on('finish', () => resolve())
        .on('error', (err: any) => reject(err));
    });
  }

  async readFile(key: string): Promise<Readable> {
    const file = this.bucket.file(key);
    return file.createReadStream();
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
}
