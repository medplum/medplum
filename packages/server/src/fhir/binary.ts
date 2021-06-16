import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Binary } from '@medplum/core';
import { Request, Response, Router } from 'express';
import { mkdirSync, writeFileSync } from 'fs';
import { IncomingMessage } from 'http';
import path from 'path';
import { asyncWrap } from '../async';
import { getStatus, isOk } from './outcomes';
import { repo } from './repo';

let binaryStorage: BinaryStorage | undefined = undefined;

export function initBinaryStorage(type: string): void {
  console.log('initBinaryStorage: "' + type + '" (' + type.length + ')');
  if (type.startsWith('s3:')) {
    binaryStorage = new S3Storage(type.replace('s3:', ''));
  } else if (type.startsWith('file:')) {
    binaryStorage = new FileSystemStorage(type.replace('file:', ''));
  }
}

export const binaryRouter = Router();

// Create a binary
binaryRouter.post('/', asyncWrap(async (req: Request, res: Response) => {
  const [outcome, resource] = await repo.createResource<Binary>({
    resourceType: 'Binary',
    contentType: req.get('Content-Type')
  });
  if (!isOk(outcome)) {
    return res.status(getStatus(outcome)).json(outcome);
  }
  await binaryStorage?.writeBinary(resource as Binary, req);
  res.status(201).json(resource);
}));

// Get binary content
binaryRouter.get('/:id', asyncWrap(async (req: Request, res: Response) => {
  const { id } = req.params;
  const [outcome, resource] = await repo.readResource('Binary', id);
  if (!isOk(outcome)) {
    return res.status(getStatus(outcome)).json(outcome);
  }

  const binary = resource as Binary;
  res.status(200).contentType(binary.contentType as string);
  await binaryStorage?.readBinary(binary, res);
}));

/**
 * The BinaryStorage interface represents a method of reading and writing binary blobs.
 */
interface BinaryStorage {

  writeBinary(binary: Binary, req: Request): Promise<void>;

  readBinary(binary: Binary, res: Response): Promise<void>;
}

/**
 * The FileSystemStorage class stores binary blobs on the file system.
 * Files are stored in path/binary.id/binary.meta.versionId.
 */
class FileSystemStorage implements BinaryStorage {
  private readonly path: string;

  constructor(path: string) {
    this.path = path;
  }

  async writeBinary(binary: Binary, req: Request): Promise<void> {
    console.log('writeBinary', this.getDir(binary));
    mkdirSync(this.getDir(binary));
    writeFileSync(this.getPath(binary), req.body, { encoding: 'binary' });
  }

  async readBinary(binary: Binary, res: Response): Promise<void> {
    res.sendFile(this.getPath(binary));
  }

  private getDir(binary: Binary): string {
    return path.resolve(__dirname, '../', this.path, `/${binary.id}/`);
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
      body = JSON.stringify(req.body);
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
