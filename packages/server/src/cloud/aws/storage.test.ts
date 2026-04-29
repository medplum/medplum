// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { ContentType } from '@medplum/core';
import type { Binary } from '@medplum/fhirtypes';
import { sdkStreamMixin } from '@smithy/util-stream';
import type { AwsClientStub } from 'aws-sdk-client-mock';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import type { Request } from 'express';
import { createHash } from 'node:crypto';
import type internal from 'stream';
import { Readable } from 'stream';
import { getConfig, loadTestConfig } from '../../config/loader';
import { getBinaryStorage, initBinaryStorage } from '../../storage/loader';

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

  test('Multipart upload with Express Request stream succeeds', async () => {
    initBinaryStorage('s3:foo');
    const storage = getBinaryStorage();

    const binary = {
      resourceType: 'Binary',
      id: '123',
      meta: {
        versionId: '456',
      },
    } as Binary;

    const req = new Readable() as Request;
    const fiveMbAndABit = 5 * 1024 * 1024 + 10;
    const oneKb = 'a'.repeat(1024);
    for (let i = 0; i < fiveMbAndABit; i += 1024) {
      req.push(Buffer.from(oneKb));
    }
    req.push(null);
    (req as any).path = '/';
    (req as any).headers = {};

    mockS3Client.on(CreateMultipartUploadCommand).resolves({ UploadId: 'mock-upload-id' });
    mockS3Client.on(UploadPartCommand).resolves({ ETag: 'mock-etag' });

    await expect(storage.writeBinary(binary, 'test.txt', ContentType.TEXT, req)).resolves.toBeUndefined();
  });

  test('S3 storage', async () => {
    initBinaryStorage('s3:foo');

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
    const req = new Readable();
    req.push('foo');
    req.push(null);
    (req as any).headers = {};

    const sdkStream = sdkStreamMixin(req);
    mockS3Client.on(GetObjectCommand).resolves({ Body: sdkStream });

    await storage.writeBinary(binary, 'test.txt', ContentType.TEXT, req);

    expect(mockS3Client.send.callCount).toBe(1);
    expect(mockS3Client).toReceiveCommandWith(PutObjectCommand, {
      Bucket: 'foo',
      Key: 'binary/123/456',
      ContentType: ContentType.TEXT,
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
    const binary = {
      resourceType: 'Binary',
      id: '123',
      meta: {
        versionId: '456',
      },
    } as Binary;
    const req = new Readable();
    req.push('foo');
    req.push(null);
    (req as any).headers = {};

    const sdkStream = sdkStreamMixin(req);
    mockS3Client.on(GetObjectCommand).resolves({ Body: sdkStream });

    await storage.writeBinary(binary, undefined, undefined, req);
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
      await storage.writeBinary(binary, 'test.exe', ContentType.TEXT, stream);
      fail('Expected error');
    } catch (err) {
      expect((err as Error).message).toStrictEqual('Invalid file extension');
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
      expect((err as Error).message).toStrictEqual('Invalid content type');
    }
    expect(mockS3Client).not.toHaveReceivedCommand(PutObjectCommand);
  });

  test('Copy S3 object', async () => {
    initBinaryStorage('s3:foo');

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
    const req = new Readable();
    req.push('foo');
    req.push(null);
    (req as any).headers = {};

    const sdkStream = sdkStreamMixin(req);
    mockS3Client.on(GetObjectCommand).resolves({ Body: sdkStream });

    await storage.writeBinary(binary, 'test.txt', ContentType.TEXT, req);

    expect(mockS3Client.send.callCount).toBe(1);
    expect(mockS3Client).toReceiveCommandWith(PutObjectCommand, {
      Bucket: 'foo',
      Key: 'binary/123/456',
      ContentType: ContentType.TEXT,
    });
    mockS3Client.reset();

    // Copy the object
    const destinationBinary = {
      resourceType: 'Binary',
      id: '789',
      meta: {
        versionId: '012',
      },
    } as Binary;
    await storage.copyBinary(binary, destinationBinary);

    expect(mockS3Client.send.callCount).toBe(1);
    expect(mockS3Client).toReceiveCommandWith(CopyObjectCommand, {
      CopySource: 'foo/binary/123/456',
      Bucket: 'foo',
      Key: 'binary/789/012',
    });
  });

  describe('SSE-C encryption', () => {
    const testKey = 'MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE='; // base64 of 32-byte key
    const expectedMD5 = createHash('md5').update(Buffer.from(testKey, 'base64')).digest('base64');

    beforeEach(() => {
      getConfig().sseCustomerKey = testKey;
    });

    afterEach(() => {
      getConfig().sseCustomerKey = undefined;
    });

    test('Write file includes SSE-C params', async () => {
      initBinaryStorage('s3:foo');
      const storage = getBinaryStorage();

      const binary = { resourceType: 'Binary', id: '123', meta: { versionId: '456' } } as Binary;
      const req = new Readable();
      req.push('foo');
      req.push(null);
      (req as any).headers = {};

      await storage.writeBinary(binary, 'test.txt', ContentType.TEXT, req);

      expect(mockS3Client).toReceiveCommandWith(PutObjectCommand, {
        Bucket: 'foo',
        Key: 'binary/123/456',
        SSECustomerAlgorithm: 'AES256',
        SSECustomerKey: testKey,
        SSECustomerKeyMD5: expectedMD5,
      });
    });

    test('Read file includes SSE-C params', async () => {
      initBinaryStorage('s3:foo');
      const storage = getBinaryStorage();

      const binary = { resourceType: 'Binary', id: '123', meta: { versionId: '456' } } as Binary;
      const sdkStream = sdkStreamMixin(Readable.from('foo'));
      mockS3Client.on(GetObjectCommand).resolves({ Body: sdkStream });

      await storage.readBinary(binary);

      expect(mockS3Client).toReceiveCommandWith(GetObjectCommand, {
        Bucket: 'foo',
        Key: 'binary/123/456',
        SSECustomerAlgorithm: 'AES256',
        SSECustomerKey: testKey,
        SSECustomerKeyMD5: expectedMD5,
      });
    });

    test('Copy file includes SSE-C params for source and destination', async () => {
      initBinaryStorage('s3:foo');
      const storage = getBinaryStorage();

      const sourceBinary = { resourceType: 'Binary', id: '123', meta: { versionId: '456' } } as Binary;
      const destBinary = { resourceType: 'Binary', id: '789', meta: { versionId: '012' } } as Binary;

      await storage.copyBinary(sourceBinary, destBinary);

      expect(mockS3Client).toReceiveCommandWith(CopyObjectCommand, {
        CopySource: 'foo/binary/123/456',
        Bucket: 'foo',
        Key: 'binary/789/012',
        SSECustomerAlgorithm: 'AES256',
        SSECustomerKey: testKey,
        SSECustomerKeyMD5: expectedMD5,
        CopySourceSSECustomerAlgorithm: 'AES256',
        CopySourceSSECustomerKey: testKey,
        CopySourceSSECustomerKeyMD5: expectedMD5,
      });
    });
  });
});
