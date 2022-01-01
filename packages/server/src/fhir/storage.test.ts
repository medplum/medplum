import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Binary } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { readFileSync } from 'fs';
import { Readable } from 'stream';
import zlib from 'zlib';
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

  test('Unrecognized content encoding', async () => {
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
    const req = {
      headers: {
        'content-encoding': 'fake',
      },
    } as unknown as Request;

    expect(storage.writeBinary(binary, req)).rejects.toThrow();
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
    await storage.writeBinary(binary, req as Request);

    // Request the binary
    const res: Response = {
      sendFile: jest.fn(),
    } as any as Response;
    await storage.readBinary(binary, res);
    expect(res.sendFile).toHaveBeenCalled();

    // Verify that the file matches the expected contents
    const filename = (res.sendFile as any).mock.calls[0][0];
    const content = readFileSync(filename, { encoding: 'utf8' });
    expect(content).toEqual('foo');

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

  test('Deflate encoding', async () => {
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

    // Create the input stream
    const stream = new Readable();
    stream.push('foo');
    stream.push(null);

    // Create a request
    const req = zlib.createDeflate();
    stream.pipe(req);
    (req as any).headers = {
      'content-encoding': 'deflate',
    };
    await storage.writeBinary(binary, req as unknown as Request);

    // Request the binary
    const res: Response = {
      sendFile: jest.fn(),
    } as any as Response;
    await storage.readBinary(binary, res);
    expect(res.sendFile).toHaveBeenCalled();

    // Verify that the file matches the expected contents
    const filename = (res.sendFile as any).mock.calls[0][0];
    const content = readFileSync(filename, { encoding: 'utf8' });
    expect(content).toEqual('foo');

    // Make sure we didn't touch S3 at all
    expect(S3Client).toHaveBeenCalledTimes(0);
    expect(Upload).toHaveBeenCalledTimes(0);
    expect(GetObjectCommand).toHaveBeenCalledTimes(0);
  });

  test('GZIP encoding', async () => {
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

    // Create the input stream
    const stream = new Readable();
    stream.push('foo');
    stream.push(null);

    // Create a request
    const req = zlib.createGzip();
    stream.pipe(req);
    (req as any).headers = {
      'content-encoding': 'gzip',
    };
    await storage.writeBinary(binary, req as unknown as Request);

    // Request the binary
    const res: Response = {
      sendFile: jest.fn(),
    } as any as Response;
    await storage.readBinary(binary, res);
    expect(res.sendFile).toHaveBeenCalled();

    // Verify that the file matches the expected contents
    const filename = (res.sendFile as any).mock.calls[0][0];
    const content = readFileSync(filename, { encoding: 'utf8' });
    expect(content).toEqual('foo');

    // Make sure we didn't touch S3 at all
    expect(S3Client).toHaveBeenCalledTimes(0);
    expect(Upload).toHaveBeenCalledTimes(0);
    expect(GetObjectCommand).toHaveBeenCalledTimes(0);
  });
});
