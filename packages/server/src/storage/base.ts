// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Binary } from '@medplum/fhirtypes';
import { Readable } from 'stream';
import { BinarySource, BinaryStorage } from './types';
import { checkFileMetadata } from './utils';

export abstract class BaseBinaryStorage implements BinaryStorage {
  abstract writeFile(key: string, contentType: string | undefined, stream: BinarySource): Promise<void>;

  abstract readFile(key: string): Promise<Readable>;

  abstract copyFile(sourceKey: string, destinationKey: string): Promise<void>;

  abstract getPresignedUrl(binary: Binary): Promise<string>;

  readBinary(binary: Binary): Promise<Readable> {
    return this.readFile(this.getKey(binary));
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

  copyBinary(sourceBinary: Binary, destinationBinary: Binary): Promise<void> {
    return this.copyFile(this.getKey(sourceBinary), this.getKey(destinationBinary));
  }

  getKey(binary: Binary): string {
    return 'binary/' + binary.id + '/' + binary.meta?.versionId;
  }
}
