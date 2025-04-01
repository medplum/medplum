import { concatUrls } from '@medplum/core';
import { Binary } from '@medplum/fhirtypes';
import { createSign } from 'crypto';
import { copyFileSync, createReadStream, createWriteStream, existsSync, mkdirSync } from 'fs';
import { resolve, sep } from 'path';
import { pipeline, Readable } from 'stream';
import { getConfig } from '../config/loader';
import { BaseBinaryStorage } from './base';
import { BinarySource } from './types';
import { checkFileMetadata } from './utils';

/**
 * The FileSystemStorage class stores binary blobs on the file system.
 * Files are stored in <baseDir>/binary.id/binary.meta.versionId.
 */
export class FileSystemStorage extends BaseBinaryStorage {
  private readonly baseDir: string;

  constructor(baseDir: string) {
    super();
    this.baseDir = baseDir;
    this.ensureDirExists(resolve(baseDir));
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
    const fullPath = this.getPath(key);
    this.ensureDirForFileExists(fullPath);

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

  async readFile(key: string): Promise<Readable> {
    const filePath = this.getPath(key);
    if (!existsSync(filePath)) {
      throw new Error('File not found');
    }
    return createReadStream(filePath);
  }

  async copyFile(sourceKey: string, destinationKey: string): Promise<void> {
    const sourcePath = this.getPath(sourceKey);
    const destinationPath = this.getPath(destinationKey);
    this.ensureDirForFileExists(destinationPath);
    copyFileSync(sourcePath, destinationPath);
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

  private ensureDirForFileExists(filePath: string): void {
    const dir = filePath.substring(0, filePath.lastIndexOf(sep));
    this.ensureDirExists(dir);
  }

  private ensureDirExists(dirPath: string): void {
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true });
    }
  }

  private getPath(key: string): string {
    return resolve(this.baseDir, key.replace('binary/', ''));
  }
}
