import { assertOk, Binary } from '@medplum/core';
import express, { Request } from 'express';
import { mkdtempSync, rmSync } from 'fs';
import { sep } from 'path';
import request from 'supertest';
import { initApp } from './app';
import { loadTestConfig } from './config';
import { closeDatabase, initDatabase } from './database';
import { getBinaryStorage, initBinaryStorage, repo } from './fhir';

const app = express();
const binaryDir = mkdtempSync(__dirname + sep + 'binary-');
let binary: Binary | undefined = undefined;

describe('Storage Routes', () => {

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initDatabase(config.database);
    await initApp(app);
    await initBinaryStorage('file:' + binaryDir);

    const [outcome, resource] = await repo.createResource<Binary>({
      resourceType: 'Binary',
      contentType: 'text/plain'
    });
    assertOk(outcome);
    binary = resource;

    await getBinaryStorage().writeBinary(binary as Binary, { body: 'hello world' } as Request);
  });

  afterAll(async () => {
    await closeDatabase();
    rmSync(binaryDir, { recursive: true, force: true });
  });

  test('Missing signature', async () => {
    const res = await request(app)
      .get(`/storage/${binary?.id}`);
    expect(res.status).toBe(401);
  });

  test('Success', async () => {
    const res = await request(app)
      .get(`/storage/${binary?.id}?Signature=xyz&Expires=123`);
    expect(res.status).toBe(200);
  });

});
