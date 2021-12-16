import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Binary } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import fs from 'fs';
import { getBinaryStorage, initBinaryStorage } from './storage';

jest.mock('@aws-sdk/client-s3');
jest.mock('fs');

describe('Storage', () => {

  beforeEach(() => {
    (fs.existsSync as any).mockClear();
    (fs.mkdirSync as any).mockClear();
    (fs.writeFileSync as any).mockClear();
    (S3Client as any).mockClear();
    (PutObjectCommand as any).mockClear();
    (GetObjectCommand as any).mockClear();
  });

  test('Undefined binary storage', () => {
    initBinaryStorage('foo');
    expect(() => getBinaryStorage()).toThrow();
  });

  test('File system storage', async () => {
    initBinaryStorage('file:foo');
    expect(fs.existsSync).toHaveBeenCalled();
    expect(fs.mkdirSync).toHaveBeenCalled();

    const storage = getBinaryStorage();
    expect(storage).toBeDefined();

    // Write a file
    const binary: Binary = {
      resourceType: 'Binary',
      id: '123',
      meta: {
        versionId: '456'
      }
    };
    const req = {
      body: 'foo'
    } as Request;
    await storage.writeBinary(binary, req);
    expect(fs.writeFileSync).toHaveBeenCalled();

    // Read a file
    const res: Response = {
      sendFile: jest.fn()
    } as any as Response;
    await storage.readBinary(binary, res);
    expect(res.sendFile).toHaveBeenCalled();

    // Make sure we didn't touch S3 at all
    expect(S3Client).toHaveBeenCalledTimes(0);
    expect(PutObjectCommand).toHaveBeenCalledTimes(0);
    expect(GetObjectCommand).toHaveBeenCalledTimes(0);
  });

  test('S3 storage', async () => {
    initBinaryStorage('s3:foo');
    expect(S3Client).toHaveBeenCalled();

    const client = (S3Client as any).mock.instances[0];
    client.send = async () => ({
      Body: {
        pipe: jest.fn()
      }
    });

    const storage = getBinaryStorage();
    expect(storage).toBeDefined();

    // Write a file
    const binary: Binary = {
      resourceType: 'Binary',
      id: '123',
      meta: {
        versionId: '456'
      }
    };
    const req = {
      body: 'foo',
      is: jest.fn()
    } as any as Request;
    await storage.writeBinary(binary, req);
    expect(PutObjectCommand).toHaveBeenCalled();

    // Read a file
    const res = {} as Response;
    await storage.readBinary(binary, res);
    expect(GetObjectCommand).toHaveBeenCalled();

    // Make sure we didn't touch the file system at all
    expect(fs.existsSync).toHaveBeenCalledTimes(0);
    expect(fs.mkdirSync).toHaveBeenCalledTimes(0);
    expect(fs.writeFileSync).toHaveBeenCalledTimes(0);
  });

});
