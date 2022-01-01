import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Binary } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { IncomingMessage } from 'http';
import path from 'path';
import internal from 'stream';
import zlib from 'zlib';

let binaryStorage: BinaryStorage | undefined = undefined;

export function initBinaryStorage(type: string): void {
  if (type.startsWith('s3:')) {
    binaryStorage = new S3Storage(type.replace('s3:', ''));
  } else if (type.startsWith('file:')) {
    binaryStorage = new FileSystemStorage(type.replace('file:', ''));
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
 * The BinaryStorage interface represents a method of reading and writing binary blobs.
 */
interface BinaryStorage {
  writeBinary(binary: Binary, req: Request): Promise<void>;

  readBinary(binary: Binary, res: Response): Promise<void>;
}

/**
 * The FileSystemStorage class stores binary blobs on the file system.
 * Files are stored in <baseDir>/binary.id/binary.meta.versionId.
 */
class FileSystemStorage implements BinaryStorage {
  private readonly baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
    if (!existsSync(path.resolve(baseDir))) {
      mkdirSync(path.resolve(baseDir));
    }
  }

  async writeBinary(binary: Binary, req: Request): Promise<void> {
    const dir = this.getDir(binary);
    if (!existsSync(dir)) {
      mkdirSync(dir);
    }
    const body = getContentStream(req);
    const writeStream = createWriteStream(this.getPath(binary), { flags: 'w' });
    body.pipe(writeStream);
    return new Promise((resolve, reject) => {
      writeStream.on('close', resolve);
      writeStream.on('error', reject);
    });
  }

  async readBinary(binary: Binary, res: Response): Promise<void> {
    res.sendFile(this.getPath(binary));
  }

  private getDir(binary: Binary): string {
    return path.resolve(this.baseDir, binary.id as string);
  }

  private getPath(binary: Binary): string {
    return path.resolve(this.getDir(binary), binary.meta?.versionId as string);
  }
}

/**
 * The S3Storage class stores binary data in an AWS S3 bucket.
 * Files are stored in bucket/binary/binary.id/binary.meta.versionId.
 */
class S3Storage implements BinaryStorage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(bucket: string) {
    this.client = new S3Client({ region: 'us-east-1' });
    this.bucket = bucket;
  }

  /**
   * Writes a binary blob to S3.
   *
   * Early implementations used the simple "PutObjectCommand" to write the blob to S3.
   * However, PutObjectCommand does not support streaming.
   *
   * We now use the @aws-sdk/lib-storage package.
   *
   * Learn more:
   * https://github.com/aws/aws-sdk-js-v3/blob/main/UPGRADING.md#s3-multipart-upload
   * https://github.com/aws/aws-sdk-js-v3/tree/main/lib/lib-storage
   *
   * @param binary The binary resource destination.
   * @param req The HTTP request with the binary content.
   */
  async writeBinary(binary: Binary, req: Request): Promise<void> {
    const body = getContentStream(req);

    const upload = new Upload({
      params: {
        Bucket: this.bucket,
        Key: this.getKey(binary),
        Body: body,
      },
      client: this.client,
      queueSize: 3,
    });

    await upload.done();
  }

  async readBinary(binary: Binary, res: Response): Promise<void> {
    const output = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: this.getKey(binary),
      })
    );
    (output.Body as IncomingMessage).pipe(res);
  }

  private getKey(binary: Binary): string {
    return 'binary/' + binary.id + '/' + binary.meta?.versionId;
  }
}

/**
 * Get the content stream of the request.
 *
 * Based on body-parser implementation:
 * https://github.com/expressjs/body-parser/blob/master/lib/read.js
 *
 * Unfortunately body-parser will always write the content to a temporary file on local disk.
 * That is not acceptable for multi gigabyte files, which could easily fill up the disk.
 *
 * @param req The HTTP request.
 * @returns The content stream.
 */

function getContentStream(req: Request): internal.Readable {
  const encoding = (req.headers['content-encoding'] || 'identity').toLowerCase();
  let stream;

  switch (encoding) {
    case 'deflate':
      stream = zlib.createInflate();
      req.pipe(stream);
      break;
    case 'gzip':
      stream = zlib.createGunzip();
      req.pipe(stream);
      break;
    case 'identity':
      stream = req;
      break;
    default:
      throw new Error('encoding.unsupoorted');
  }

  return stream;
}
