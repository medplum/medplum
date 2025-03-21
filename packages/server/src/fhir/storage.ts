import { badRequest, concatUrls, OperationOutcomeError } from '@medplum/core';
import { Binary } from '@medplum/fhirtypes';
import { createSign } from 'crypto';
import { copyFileSync, createReadStream, createWriteStream, existsSync, mkdirSync } from 'fs';
import { resolve, sep } from 'path';
import { Readable, pipeline } from 'stream';
import { S3Storage } from '../cloud/aws/storage';
import { AzureBlobStorage } from '../cloud/azure/storage';
import { GCPBlobStorage } from '../cloud/gcp/storage';
import { getConfig } from '../config/loader';

export type BinarySource = Readable | string;

let binaryStorage: BinaryStorage | undefined = undefined;

export function initBinaryStorage(type?: string): void {
  if (type?.startsWith('s3:')) {
    binaryStorage = new S3Storage(type.replace('s3:', ''));
  } else if (type?.startsWith('azure:')) {
    binaryStorage = new AzureBlobStorage(type.replace('azure:', ''));
  } else if (type?.startsWith('file:')) {
    binaryStorage = new FileSystemStorage(type.replace('file:', ''));
  } else if (type?.startsWith('gs:')) {
    binaryStorage = new GCPBlobStorage(type.replace('gcp:', ''));
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

export interface BinaryStorage {
  writeBinary(
    binary: Binary,
    filename: string | undefined,
    contentType: string | undefined,
    stream: BinarySource
  ): Promise<void>;

  writeFile(key: string, contentType: string | undefined, stream: BinarySource): Promise<void>;

  readBinary(binary: Binary): Promise<Readable>;

  copyBinary(sourceBinary: Binary, destinationBinary: Binary): Promise<void>;

  copyFile(sourceKey: string, destinationKey: string): Promise<void>;

  getPresignedUrl(binary: Binary): Promise<string>;
}

class FileSystemStorage implements BinaryStorage {
  private readonly baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
    if (!existsSync(resolve(baseDir))) {
      mkdirSync(resolve(baseDir));
    }
  }

  writeBinary(
    binary: Binary,
    filename: string | undefined,
    contentType: string | undefined,
    stream: BinarySource
  ): Promise<void> {
    checkFileMetadata(filename, contentType);
    return this.writeFile(this.getKey(binary), contentType, stream);
  }

  async writeFile(key: string, _contentType: string | undefined, input: BinarySource): Promise<void> {
    const fullPath = resolve(this.baseDir, key);
    const dir = fullPath.substring(0, fullPath.lastIndexOf(sep));
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const writeStream = createWriteStream(fullPath, { flags: 'w' });
    return new Promise((resolve, reject) => {
      pipeline(input, writeStream, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async readBinary(binary: Binary): Promise<Readable> {
    const filePath = this.getPath(binary);
    if (!existsSync(filePath)) {
      throw new Error('File not found');
    }
    return createReadStream(filePath);
  }

  async copyBinary(sourceBinary: Binary, destinationBinary: Binary): Promise<void> {
    await this.copyFile(this.getKey(sourceBinary), this.getKey(destinationBinary));
  }

  async copyFile(sourceKey: string, destinationKey: string): Promise<void> {
    const fullDestinationPath = resolve(this.baseDir, destinationKey);
    const destDir = fullDestinationPath.substring(0, fullDestinationPath.lastIndexOf(sep));
    if (!existsSync(destDir)) {
      mkdirSync(destDir, { recursive: true });
    }
    copyFileSync(resolve(this.baseDir, sourceKey), resolve(this.baseDir, destinationKey));
  }

  async getPresignedUrl(binary: Binary): Promise<string> {
    const config = getConfig();
    const storageBaseUrl = config.storageBaseUrl;
    const result = new URL(concatUrls(storageBaseUrl, `${binary.id}/${binary.meta?.versionId}`));

    const dateLessThan = new Date();
    dateLessThan.setHours(dateLessThan.getHours() + 1);
    result.searchParams.set('Expires', dateLessThan.getTime().toString());

    if (config.signingKey) {
      const privateKey = { key: config.signingKey, passphrase: config.signingKeyPassphrase };
      const signature = createSign('sha256').update(result.toString()).sign(privateKey, 'base64');
      result.searchParams.set('Signature', signature);
    }

    return result.toString();
  }

  private getKey(binary: Binary): string {
    return binary.id + sep + binary.meta?.versionId;
  }

  private getPath(binary: Binary): string {
    return resolve(this.baseDir, this.getKey(binary));
  }
}

const BLOCKED_FILE_EXTENSIONS = [
  '.ade',
  '.adp',
  '.apk',
  '.appx',
  '.appxbundle',
  '.bat',
  '.cab',
  '.chm',
  '.cmd',
  '.com',
  '.cpl',
  '.dll',
  '.dmg',
  '.ex',
  '.ex_',
  '.exe',
  '.hta',
  '.ins',
  '.isp',
  '.iso',
  '.jar',
  '.jse',
  '.lib',
  '.lnk',
  '.mde',
  '.msc',
  '.msi',
  '.msix',
  '.msixbundle',
  '.msp',
  '.mst',
  '.nsh',
  '.php',
  '.pif',
  '.ps1',
  '.scr',
  '.sct',
  '.shb',
  '.sys',
  '.vb',
  '.vbe',
  '.vbs',
  '.vxd',
  '.wsc',
  '.wsf',
  '.wsh',
];

const BLOCKED_CONTENT_TYPES = [
  'application/java-archive',
  'application/x-msdownload',
  'application/x-sh',
  'application/vnd.apple.installer+xml',
  'application/vnd.microsoft.portable-executable',
];

export function checkFileMetadata(filename: string | undefined, contentType: string | undefined): void {
  if (checkFileExtension(filename)) {
    throw new OperationOutcomeError(badRequest('Invalid file extension'));
  }
  if (checkContentType(contentType)) {
    throw new OperationOutcomeError(badRequest('Invalid content type'));
  }
}

function checkFileExtension(filename: string | undefined): boolean {
  if (filename) {
    const lower = filename.toLowerCase();
    for (const ext of BLOCKED_FILE_EXTENSIONS) {
      if (lower.endsWith(ext)) {
        return true;
      }
    }
  }

  return false;
}

function checkContentType(contentType: string | undefined): boolean {
  if (contentType) {
    return BLOCKED_CONTENT_TYPES.includes(contentType.toLowerCase());
  }

  return false;
}
