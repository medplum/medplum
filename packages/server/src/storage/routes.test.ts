import { ContentType } from '@medplum/core';
import { Binary } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express, { Request } from 'express';
import { Readable } from 'stream';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { MedplumServerConfig } from '../config/types';
import { getSystemRepo } from '../fhir/repo';
import { withTestContext } from '../test.setup';
import { getBinaryStorage } from './loader';

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
    const res = await request(app).get(`/storage/${binary.id}?Expires=123`);
    expect(res.status).toBe(401);
  });

  test('Missing expires', async () => {
    const res = await request(app).get(`/storage/${binary.id}?Signature=xyz`);
    expect(res.status).toBe(410);
  });

  test('Invalid signature', async () => {
    const dateLessThan = new Date();
    dateLessThan.setHours(dateLessThan.getHours() + 1);
    const res = await request(app).get(`/storage/${binary.id}?Signature=xyz&Expires=${dateLessThan.getTime()}`);
    expect(res.status).toBe(401);
  });

  test('Success', async () => {
    // For signature verification, we need to use the same URL as the client would use
    // So we need to start the request without executing it yet
    const req = request(app).get('/');

    // Get the base URL from the request (i.e., "http://127.0.0.1:57516/")
    const baseUrl = req.url;

    // Now we need to update our server config to use that as the storage base URL
    config.storageBaseUrl = baseUrl + 'storage/';

    // Now we can generate the presigned URL with a proper signature
    req.url = await getBinaryStorage().getPresignedUrl(binary);

    // And finally, we can execute the request
    const res = await req;
    expect(res.status).toBe(200);
  });

  test('Binary not found', async () => {
    const req = request(app).get('/');
    config.storageBaseUrl = req.url + 'storage/';
    req.url = await getBinaryStorage().getPresignedUrl({
      resourceType: 'Binary',
      id: randomUUID(),
      contentType: ContentType.TEXT,
    });
    const res = await req;
    expect(res.status).toBe(404);
  });

  test('File not found', async () => {
    // Create a Binary resource without writing a file to disk
    const resource = await withTestContext(async () => {
      const systemRepo = getSystemRepo();
      const result = await systemRepo.createResource<Binary>({
        resourceType: 'Binary',
        contentType: ContentType.TEXT,
      });
      return result;
    });

    const req = request(app).get('/');
    config.storageBaseUrl = req.url + 'storage/';
    req.url = await getBinaryStorage().getPresignedUrl(resource);
    const res = await req;
    expect(res.status).toBe(404);
  });
});
