import { Storage } from '@google-cloud/storage';
import { isString } from '@medplum/core';
import { Binary } from '@medplum/fhirtypes';
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

  /**
   * Writes a file to Google Cloud Storage.
   * This method now correctly handles both Readable streams and strings as input.
   * @param key - The key (path) for the file in the bucket.
   * @param contentType - The MIME type of the content.
   * @param data - The content to write, either as a Readable stream or a string.
   */
  async writeFile(key: string, contentType: string | undefined, data: BinarySource): Promise<void> {
    const file = this.bucket.file(key);
    const options = {
      metadata: { contentType: contentType ?? 'application/octet-stream' },
      // Resumable uploads are generally recommended for robustness, especially for streams.
      // You can set this to false if you are certain you will only upload small files.
      resumable: true,
    };

    if (isString(data)) {
      // For strings, the file.save() method is the most direct and simplest way.
      // It handles encoding and buffering automatically.
      await file.save(data, options);
    } else {
      // For streams, we pipe the data to a write stream provided by the client library.
      // We wrap this callback-based stream logic in a Promise to work seamlessly with async/await.
      await new Promise<void>((resolve, reject) => {
        const writeStream = file.createWriteStream(options);
        data
          .pipe(writeStream)
          .on('finish', () => resolve())
          .on('error', (err) => reject(err));
      });
    }
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
