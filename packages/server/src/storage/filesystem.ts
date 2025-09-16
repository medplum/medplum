// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Binary } from '@medplum/fhirtypes';
import { createReadStream, createWriteStream, readFileSync } from 'fs';
import { access, copyFile, mkdir } from 'fs/promises';
import { resolve, sep } from 'path';
import { pipeline, Readable } from 'stream';
import { getLogger } from '../logger';
import { BaseBinaryStorage } from './base';
import { generatePresignedUrl } from './presign';
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
    await this.ensureDirForFileExists(fullPath);

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
    try {
      await access(filePath);
      return createReadStream(filePath);
    } catch (err: any) {
      getLogger().debug('File not found', err);
      throw new Error('File not found');
    }
  }

  readFileByUrlForTests(url: URL): string {
    const [_empty, _storage, binaryId, versionId] = url.pathname.split('/');
    const binary: Binary = {
      resourceType: 'Binary',
      id: binaryId,
      meta: { versionId: versionId },
      contentType: 'test',
    };
    return readFileSync(this.getPath(this.getKey(binary)), 'utf8');
  }

  async copyFile(sourceKey: string, destinationKey: string): Promise<void> {
    const sourcePath = this.getPath(sourceKey);
    const destinationPath = this.getPath(destinationKey);
    await this.ensureDirForFileExists(destinationPath);
    await copyFile(sourcePath, destinationPath);
  }

  async getPresignedUrl(binary: Binary): Promise<string> {
    return generatePresignedUrl(binary);
  }

  private async ensureDirForFileExists(filePath: string): Promise<void> {
    const dir = filePath.substring(0, filePath.lastIndexOf(sep));
    await this.ensureDirExists(dir);
  }

  private async ensureDirExists(dirPath: string): Promise<void> {
    await mkdir(dirPath, { recursive: true });
  }

  private getPath(key: string): string {
    return resolve(this.baseDir, key.replace('binary/', ''));
  }
}
