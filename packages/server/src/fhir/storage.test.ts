import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Binary } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { Readable } from 'stream';
import { getBinaryStorage, initBinaryStorage } from './storage';

jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/lib-storage');

describe('Storage', () => {
  beforeEach(() => {
    (S3Client as any).mockClear();
    (Upload as any).mockClear();
    (GetObjectCommand as any).mockClear();
  });

  test('Undefined binary storage', () => {
    initBinaryStorage('binary');
    expect(() => getBinaryStorage()).toThrow();
  });

  test('File system storage', async () => {
    initBinaryStorage('file:foo');

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
    await storage.writeBinary(binary, req as Request);

    // Read a file
    const res: Response = {
      sendFile: jest.fn(),
    } as any as Response;
    await storage.readBinary(binary, res);
    expect(res.sendFile).toHaveBeenCalled();

    // Make sure we didn't touch S3 at all
    expect(S3Client).toHaveBeenCalledTimes(0);
    expect(Upload).toHaveBeenCalledTimes(0);
    expect(GetObjectCommand).toHaveBeenCalledTimes(0);
  });

  test('S3 storage', async () => {
    initBinaryStorage('s3:foo');
    expect(S3Client).toHaveBeenCalled();

    const client = (S3Client as any).mock.instances[0];
    client.send = async () => ({
      Body: {
        pipe: jest.fn(),
      },
    });

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
    await storage.writeBinary(binary, req as Request);
    expect(Upload).toHaveBeenCalled();

    // Read a file
    const res = {} as Response;
    await storage.readBinary(binary, res);
    expect(GetObjectCommand).toHaveBeenCalled();
  });
});
