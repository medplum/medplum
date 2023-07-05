import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { sdkStreamMixin } from '@aws-sdk/util-stream';
import { Binary } from '@medplum/fhirtypes';
import { Request } from 'express';
import { mockClient, AwsClientStub } from 'aws-sdk-client-mock';
import internal, { Readable } from 'stream';
import 'aws-sdk-client-mock-jest';
import fs from 'fs';

import { loadTestConfig } from '../config';
import { getBinaryStorage, initBinaryStorage } from './storage';

describe('Storage', () => {
  let mockS3Client: AwsClientStub<S3Client>;

  beforeAll(async () => {
    await loadTestConfig();
  });

  beforeEach(() => {
    mockS3Client = mockClient(S3Client);
  });

  afterEach(() => {
    mockS3Client.restore();
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
    const binary: Binary = {
      resourceType: 'Binary',
      id: '123',
      meta: {
        versionId: '456',
      },
    };

    // Create a request
    const req = new Readable();
    req.push('foo');
    req.push(null);
    (req as any).headers = {};
    await storage.writeBinary(binary, 'test.txt', 'text/plain', req as Request);

    // Request the binary
    const stream = await storage.readBinary(binary);
    expect(stream).toBeDefined();

    // Verify that the file matches the expected contents
    const content = await streamToString(stream);
    expect(content).toEqual('foo');

    // Make sure we didn't touch S3 at all
    expect(mockS3Client.send.callCount).toBe(0);
    expect(mockS3Client).not.toHaveReceivedCommand(PutObjectCommand);
    expect(mockS3Client).not.toHaveReceivedCommand(GetObjectCommand);
  });

  test('S3 storage', async () => {
    initBinaryStorage('s3:foo');

    const storage = getBinaryStorage();
    expect(storage).toBeDefined();

    // Write a file
    const binary: Binary = {
      resourceType: 'Binary',
      id: '123',
      meta: {
        versionId: '456',
      },
    };
    const req = new Readable();
    req.push('foo');
    req.push(null);
    (req as any).headers = {};

    const sdkStream = sdkStreamMixin(req);
    mockS3Client.on(GetObjectCommand).resolves({ Body: sdkStream });

    await storage.writeBinary(binary, 'test.txt', 'text/plain', req as Request);

    expect(mockS3Client.send.callCount).toBe(1);
    expect(mockS3Client).toReceiveCommandWith(PutObjectCommand, {
      Bucket: 'foo',
      Key: 'binary/123/456',
      ContentType: 'text/plain',
    });

    // Read a file
    const stream = await storage.readBinary(binary);
    expect(stream).toBeDefined();
    expect(mockS3Client).toHaveReceivedCommand(GetObjectCommand);
  });

  test('Missing metadata', async () => {
    initBinaryStorage('s3:foo');

    const storage = getBinaryStorage();
    expect(storage).toBeDefined();

    // Write a file
    const binary: Binary = {
      resourceType: 'Binary',
      id: '123',
      meta: {
        versionId: '456',
      },
    };
    const req = new Readable();
    req.push('foo');
    req.push(null);
    (req as any).headers = {};

    const sdkStream = sdkStreamMixin(req);
    mockS3Client.on(GetObjectCommand).resolves({ Body: sdkStream });

    await storage.writeBinary(binary, '', '', req as Request);
    expect(mockS3Client.send.callCount).toBe(1);
    expect(mockS3Client).toReceiveCommandWith(PutObjectCommand, {
      Bucket: 'foo',
      Key: 'binary/123/456',
      ContentType: 'application/octet-stream',
    });

    // Read a file
    const stream = await storage.readBinary(binary);
    expect(stream).toBeDefined();
    expect(mockS3Client).toHaveReceivedCommand(GetObjectCommand);
  });

  test('Invalid file extension', async () => {
    initBinaryStorage('s3:foo');

    const storage = getBinaryStorage();
    expect(storage).toBeDefined();

    const binary = null as unknown as Binary;
    const stream = null as unknown as internal.Readable;
    try {
      await storage.writeBinary(binary, 'test.exe', 'text/plain', stream);
      fail('Expected error');
    } catch (err) {
      expect((err as Error).message).toEqual('Invalid file extension');
    }
    expect(mockS3Client).not.toHaveReceivedCommand(PutObjectCommand);
  });

  test('Invalid content type', async () => {
    initBinaryStorage('s3:foo');

    const storage = getBinaryStorage();
    expect(storage).toBeDefined();

    const binary = null as unknown as Binary;
    const stream = null as unknown as internal.Readable;
    try {
      await storage.writeBinary(binary, 'test.sh', 'application/x-sh', stream);
      fail('Expected error');
    } catch (err) {
      expect((err as Error).message).toEqual('Invalid content type');
    }
    expect(mockS3Client).not.toHaveReceivedCommand(PutObjectCommand);
  });

  test('Should throw an error when file is not found in readBinary()', async () => {
    initBinaryStorage('file:binary');

    const storage = getBinaryStorage();
    expect(storage).toBeDefined();

    // Write a file
    const binary: Binary = {
      resourceType: 'Binary',
      id: '123',
      meta: {
        versionId: '456',
      },
    };

    jest.spyOn(fs, 'existsSync').mockReturnValue(false);

    try {
      const stream = await storage.readBinary(binary);
      expect(stream).not.toBeDefined();
    } catch (err) {
      expect((err as Error).message).toEqual('File not found');
    }
  });
});

/**
 * Reads a stream into a string.
 * See: https://stackoverflow.com/a/49428486/2051724
 * @param stream The readable stream.
 * @returns The string contents.
 */
function streamToString(stream: internal.Readable): Promise<string> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on('error', (err) => reject(err));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}
