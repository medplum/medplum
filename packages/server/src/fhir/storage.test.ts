import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Binary } from '@medplum/fhirtypes';
import { Request } from 'express';
import internal, { Readable } from 'stream';
import { getBinaryStorage, initBinaryStorage } from './storage';

jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/lib-storage');

describe('Storage', () => {
  beforeEach(() => {
    (S3Client as unknown as jest.Mock).mockClear();
    (Upload as unknown as jest.Mock).mockClear();
    (GetObjectCommand as unknown as jest.Mock).mockClear();
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
    await storage.writeBinary(binary, req as Request);

    // Request the binary
    const stream = await storage.readBinary(binary);
    expect(stream).toBeDefined();

    // Verify that the file matches the expected contents
    const content = await streamToString(stream);
    expect(content).toEqual('foo');

    // Make sure we didn't touch S3 at all
    expect(S3Client).toHaveBeenCalledTimes(0);
    expect(Upload).toHaveBeenCalledTimes(0);
    expect(GetObjectCommand).toHaveBeenCalledTimes(0);
  });

  test('S3 storage', async () => {
    initBinaryStorage('s3:foo');
    expect(S3Client).toHaveBeenCalled();

    const client = (S3Client as unknown as jest.Mock).mock.instances[0];
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
    const stream = await storage.readBinary(binary);
    expect(stream).toBeDefined();
    expect(GetObjectCommand).toHaveBeenCalled();
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
