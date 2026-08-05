// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType } from '@medplum/core';
import type { Binary } from '@medplum/fhirtypes';
import { Readable } from 'stream';
import { loadTestConfig } from '../config/loader';
import { streamToString } from '../test.setup';
import { getBinaryStorage, initBinaryStorage } from './loader';

describe('FileSystemStorage', () => {
  beforeAll(async () => {
    await loadTestConfig();
  });

  test('Undefined binary storage', () => {
    initBinaryStorage('binary');
    expect(() => getBinaryStorage()).toThrow();
  });

  test('File system storage', async () => {
    initBinaryStorage('file:binary');

    const storage = getBinaryStorage();
    expect(storage).toBeDefined();

    // Write a file
    const binary = {
      resourceType: 'Binary',
      id: '123',
      meta: {
        versionId: '456',
      },
    } as Binary;

    // Create a request
    const req = new Readable();
    req.push('foo');
    req.push(null);
    (req as any).headers = {};
    await storage.writeBinary(binary, 'test.txt', ContentType.TEXT, req);

    // Request the binary
    const stream = await storage.readBinary(binary);
    expect(stream).toBeDefined();

    // Verify that the file matches the expected contents
    const content = await streamToString(stream);
    expect(content).toStrictEqual('foo');
  });

  test('deleteFile removes a file and is idempotent', async () => {
    initBinaryStorage('file:binary');
    const storage = getBinaryStorage();

    const key = 'system/async-batch/delete-test/state.json';
    await storage.writeFile(key, ContentType.JSON, '{"hello":"world"}');

    // The file can be read back before deletion.
    const stream = await storage.readFile(key);
    expect(await streamToString(stream)).toStrictEqual('{"hello":"world"}');

    // After deletion, reading throws.
    await storage.deleteFile(key);
    await expect(storage.readFile(key)).rejects.toThrow('File not found');

    // Deleting a missing key is a no-op (idempotent).
    await expect(storage.deleteFile(key)).resolves.toBeUndefined();
  });

  test('Should throw an error when file is not found in readBinary()', async () => {
    initBinaryStorage('file:binary');

    const storage = getBinaryStorage();
    expect(storage).toBeDefined();

    // Create a binary resource that does not exist on the filesystem
    const binary = {
      resourceType: 'Binary',
      id: 'does-not-exist',
      meta: {
        versionId: 'does-not-exist',
      },
    } as Binary;

    await expect(storage.readBinary(binary)).rejects.toThrow('File not found');
  });
});
