// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { PassThrough, Readable } from 'node:stream';
import { vi } from 'vitest';

const fileStore = new Map<string, Buffer>();

export function clearGcpStorageMock(): void {
  fileStore.clear();
}

function getStoreKey(bucketName: string, key: string): string {
  return `${bucketName}/${key}`;
}

function createMockFile(bucketName: string, key: string): {
  save: ReturnType<typeof vi.fn>;
  createWriteStream: ReturnType<typeof vi.fn>;
  createReadStream: ReturnType<typeof vi.fn>;
  copy: ReturnType<typeof vi.fn>;
  getSignedUrl: ReturnType<typeof vi.fn>;
} {
  const storeKey = getStoreKey(bucketName, key);

  return {
    save: vi.fn(async (data: string | Buffer) => {
      fileStore.set(storeKey, Buffer.isBuffer(data) ? data : Buffer.from(data));
    }),
    createWriteStream: vi.fn(() => {
      const chunks: Buffer[] = [];
      const stream = new PassThrough();
      stream.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      stream.on('end', () => fileStore.set(storeKey, Buffer.concat(chunks)));
      return stream;
    }),
    createReadStream: vi.fn(() => {
      const data = fileStore.get(storeKey);
      return Readable.from(data ?? []);
    }),
    copy: vi.fn(async (destinationFile: { name: string }) => {
      const data = fileStore.get(storeKey);
      if (data) {
        fileStore.set(destinationFile.name, data);
      }
    }),
    getSignedUrl: vi.fn(async () => [`https://storage.googleapis.com/${bucketName}/${key}?X-Goog-Signature=mock`]),
  };
}

export const Storage = vi.fn(function Storage(this: { bucket: ReturnType<typeof vi.fn> }) {
  this.bucket = vi.fn((bucketName: string) => ({
    file: vi.fn((key: string) => createMockFile(bucketName, key)),
  }));
});
