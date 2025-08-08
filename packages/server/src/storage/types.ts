// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Binary } from '@medplum/fhirtypes';
import { Readable } from 'stream';

/**
 * Binary input type.
 *
 * This represents a possible input to the writeBinary function.
 *
 * Node.js pipeline types:
 * type PipelineSource<T> = Iterable<T> | AsyncIterable<T> | NodeJS.ReadableStream | PipelineSourceFunction<T>;
 *
 * S3 input types:
 * export type NodeJsRuntimeStreamingBlobPayloadInputTypes = string | Uint8Array | Buffer | Readable;
 *
 * node-fetch body types:
 * Note that while the Fetch Standard requires the property to always be a WHATWG ReadableStream, in node-fetch it is a Node.js Readable stream.
 */
export type BinarySource = Readable | string;

/**
 * The BinaryStorage interface represents a method of reading and writing binary blobs.
 */
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
