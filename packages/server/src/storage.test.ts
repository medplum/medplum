import { Binary } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express, { Request } from 'express';
import { mkdtempSync, rmSync, unlinkSync } from 'fs';
import { resolve, sep } from 'path';
import { Readable } from 'stream';
import request from 'supertest';
import { initApp, shutdownApp } from './app';
import { loadTestConfig } from './config';
import { systemRepo } from './fhir/repo';
import { getBinaryStorage } from './fhir/storage';

const app = express();
const binaryDir = mkdtempSync(__dirname + sep + 'binary-');
let binary: Binary;

describe('Storage Routes', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    config.binaryStorage = 'file:' + binaryDir;
    await initApp(app, config);

    binary = await systemRepo.createResource<Binary>({
      resourceType: 'Binary',
      contentType: 'text/plain',
    });

    const req = new Readable();
    req.push('hello world');
    req.push(null);
    (req as any).headers = {};
    await getBinaryStorage().writeBinary(binary, 'hello.txt', 'text/plain', req as Request);
  });

  afterAll(async () => {
    await shutdownApp();
    rmSync(binaryDir, { recursive: true, force: true });
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
    const resource = await systemRepo.createResource<Binary>({
      resourceType: 'Binary',
      contentType: 'text/plain',
    });

    const req = new Readable();
    req.push('hello world');
    req.push(null);
    (req as any).headers = {};
    await getBinaryStorage().writeBinary(resource, 'hello.txt', 'text/plain', req as Request);

    // Delete the file on disk
    unlinkSync(resolve(binaryDir, `${resource.id}/${resource.meta?.versionId}`));

    const res = await request(app).get(`/storage/${resource.id}?Signature=xyz&Expires=123`);
    expect(res.status).toBe(404);
  });
});
