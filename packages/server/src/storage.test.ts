import { ContentType } from '@medplum/core';
import { Binary } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express, { Request } from 'express';
import { unlinkSync } from 'fs';
import { resolve } from 'path';
import { Readable } from 'stream';
import request from 'supertest';
import { initApp, shutdownApp } from './app';
import { MedplumServerConfig, loadTestConfig } from './config';
import { getSystemRepo } from './fhir/repo';
import { getBinaryStorage } from './fhir/storage';
import { withTestContext } from './test.setup';

const app = express();
let config: MedplumServerConfig;
let binary: Binary;

describe('Storage Routes', () => {
  beforeAll(async () => {
    config = await loadTestConfig();
    await initApp(app, config);

    binary = await withTestContext(async () => {
      const systemRepo = getSystemRepo();
      const result = await systemRepo.createResource<Binary>({
        resourceType: 'Binary',
        contentType: ContentType.TEXT,
      });
      return result;
    });

    const req = new Readable();
    req.push('hello world');
    req.push(null);
    (req as any).headers = {};
    await getBinaryStorage().writeBinary(binary, 'hello.txt', ContentType.TEXT, req as Request);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Missing signature', async () => {
    const res = await request(app).get(`/storage/${binary.id}`);
    expect(res.status).toBe(401);
  });

  test('Success', async () => {
    const res = await request(app).get(`/storage/${binary.id}?Signature=xyz&Expires=123`);
    expect(res.status).toBe(200);
  });

  test('Binary not found', async () => {
    const res = await request(app).get(`/storage/${randomUUID()}?Signature=xyz&Expires=123`);
    expect(res.status).toBe(404);
  });

  test('File not found', async () => {
    const resource = await withTestContext(async () => {
      const systemRepo = getSystemRepo();
      const result = await systemRepo.createResource<Binary>({
        resourceType: 'Binary',
        contentType: ContentType.TEXT,
      });
      return result;
    });

    const req = new Readable();
    req.push('hello world');
    req.push(null);
    (req as any).headers = {};
    await getBinaryStorage().writeBinary(resource, 'hello.txt', ContentType.TEXT, req as Request);

    // Delete the file on disk
    const binaryDir = (config.binaryStorage as string).replaceAll('file:', '');
    unlinkSync(resolve(binaryDir, `${resource.id}/${resource.meta?.versionId}`));

    const res = await request(app).get(`/storage/${resource.id}?Signature=xyz&Expires=123`);
    expect(res.status).toBe(404);
  });
});
