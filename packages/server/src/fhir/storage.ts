import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Binary, stringify } from '@medplum/core';
import { Request, Response } from 'express';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { IncomingMessage } from 'http';
import path from 'path';

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
    writeFileSync(this.getPath(binary), req.body, { encoding: 'binary' });
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

  async writeBinary(binary: Binary, req: Request): Promise<void> {
    let body: Buffer | string | undefined;
    if (req.body instanceof Buffer) {
      body = req.body;
    } else if (req.is('application/json') || req.is('application/fhir+json')) {
      body = stringify(req.body);
    } else if (req.body) {
      body = req.body.toString();
    }

    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: this.getKey(binary),
      ContentType: binary.contentType,
      Body: body
    }));
  }

  async readBinary(binary: Binary, res: Response): Promise<void> {
    const output = await this.client.send(new GetObjectCommand({
      Bucket: this.bucket,
      Key: this.getKey(binary)
    }));
    (output.Body as IncomingMessage).pipe(res);
  }

  private getKey(binary: Binary): string {
    return 'binary/' + binary.id + '/' + binary.meta?.versionId;
  }
}
