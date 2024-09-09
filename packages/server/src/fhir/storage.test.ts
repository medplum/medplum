import { ContentType } from '@medplum/core';
import { Binary } from '@medplum/fhirtypes';
import { Request } from 'express';
import fs from 'fs';
import { Readable } from 'stream';
import { loadTestConfig } from '../config';
import { streamToString } from '../test.setup';
import { getBinaryStorage, initBinaryStorage } from './storage';

describe('Storage', () => {
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
    await storage.writeBinary(binary, 'test.txt', ContentType.TEXT, req as Request);

    // Request the binary
    const stream = await storage.readBinary(binary);
    expect(stream).toBeDefined();

    // Verify that the file matches the expected contents
    const content = await streamToString(stream);
    expect(content).toEqual('foo');
  });

  test('Should throw an error when file is not found in readBinary()', async () => {
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

    jest.spyOn(fs, 'existsSync').mockReturnValue(false);

    try {
      const stream = await storage.readBinary(binary);
      expect(stream).not.toBeDefined();
    } catch (err) {
      expect((err as Error).message).toEqual('File not found');
    }
  });
});
