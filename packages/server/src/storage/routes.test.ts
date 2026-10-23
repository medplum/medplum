// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType } from '@medplum/core';
import type { Binary } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { Readable } from 'stream';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import type { ServerConfig } from '../config/utils';
import { getTestProjectSystemRepo } from '../fhir/repository/test-utils';
import { createTestProject, streamToString, withTestContext } from '../test.setup';
import { getBinaryStorage } from './loader';

const app = express();
let config: ServerConfig;
let server: Server;
let binary: Binary;

// Signature verification covers the full URL including host, so requests must go to the
// address that storageBaseUrl points at. Strip the origin and let supertest supply it.
function toPath(url: string): string {
  const parsed = new URL(url);
  return parsed.pathname + parsed.search;
}

describe('Storage Routes', () => {
  const systemRepo = getTestProjectSystemRepo();
  beforeAll(async () => {
    config = await loadTestConfig();
    server = await initApp(app, config);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    config.storageBaseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/storage/`;

    binary = await withTestContext(async () => {
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
    await getBinaryStorage().writeBinary(binary, 'hello.txt', ContentType.TEXT, req);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Missing signature', async () => {
    const res = await request(app).get(`/storage/${binary.id}?Expires=123`);
    expect(res).toHaveStatus(401);
  });

  test('Missing expires', async () => {
    const res = await request(app).get(`/storage/${binary.id}?Signature=xyz`);
    expect(res).toHaveStatus(410);
  });

  test('Invalid signature', async () => {
    const dateLessThan = new Date();
    dateLessThan.setHours(dateLessThan.getHours() + 1);
    const res = await request(app).get(`/storage/${binary.id}?Signature=xyz&Expires=${dateLessThan.getTime()}`);
    expect(res).toHaveStatus(401);
  });

  test('Success', async () => {
    const url = await getBinaryStorage().getPresignedUrl(binary);
    const res = await request(server).get(toPath(url));
    expect(res).toHaveStatus(200);
  });

  test('Binary not found', async () => {
    const url = await getBinaryStorage().getPresignedUrl({
      resourceType: 'Binary',
      id: randomUUID(),
      contentType: ContentType.TEXT,
    });
    const res = await request(server).get(toPath(url));
    expect(res).toHaveStatus(404);
  });

  test('File not found', async () => {
    // Create a Binary resource without writing a file to disk
    const resource = await withTestContext(async () => {
      const result = await systemRepo.createResource<Binary>({
        resourceType: 'Binary',
        contentType: ContentType.TEXT,
      });
      return result;
    });

    const url = await getBinaryStorage().getPresignedUrl(resource);
    const res = await request(server).get(toPath(url));
    expect(res).toHaveStatus(404);
  });

  test('Write success', async () => {
    const url = await getBinaryStorage().getPresignedUrl(binary, { upload: true });
    const res = await request(server).put(toPath(url)).set('Content-Type', 'text/plain').send('foo bar baz quux');
    expect(res).toHaveStatus(200);
    // text/plain is also handled by a global body parser, which must not consume the upload
    expect(await streamToString(await getBinaryStorage().readBinary(binary))).toBe('foo bar baz quux');
  });

  test('Write mismatched content type', async () => {
    const url = await getBinaryStorage().getPresignedUrl(binary, { upload: true });
    const res = await request(server)
      .put(toPath(url))
      .set('Content-Type', 'text/plain')
      .set('content-type', 'application/json')
      .send('{}');
    expect(res).toHaveStatus(400);
  });

  test('Write missing signature', async () => {
    const res = await request(app).put(`/storage/${binary.id}?Expires=123`);
    expect(res).toHaveStatus(401);
  });

  test('Write missing expires', async () => {
    const res = await request(app).put(`/storage/${binary.id}?Signature=xyz`);
    expect(res).toHaveStatus(410);
  });

  test('Write invalid signature', async () => {
    const dateLessThan = new Date();
    dateLessThan.setHours(dateLessThan.getHours() + 1);
    const res = await request(app).put(`/storage/${binary.id}?Signature=xyz&Expires=${dateLessThan.getTime()}`);
    expect(res).toHaveStatus(401);
  });

  describe('Project query param', () => {
    let projectId: string;
    let projectBinary: Binary;

    beforeAll(async () => {
      const { project, repo } = await createTestProject({ withRepo: true });
      projectId = project.id;
      projectBinary = await withTestContext(async () => {
        return repo.createResource<Binary>({
          resourceType: 'Binary',
          contentType: ContentType.TEXT,
          meta: { project: projectId },
        });
      });

      const req = new Readable();
      req.push('project hello');
      req.push(null);
      (req as any).headers = {};
      await getBinaryStorage().writeBinary(projectBinary, 'hello.txt', ContentType.TEXT, req);
    });

    test('Presigned URL includes Project before Signature', async () => {
      const url = await getBinaryStorage().getPresignedUrl(projectBinary);
      const parsed = new URL(url);
      expect(parsed.searchParams.get('Project')).toBe(projectId);
      const projectIdx = parsed.search.indexOf('Project=');
      const signatureIdx = parsed.search.indexOf('Signature=');
      expect(projectIdx).toBeGreaterThanOrEqual(0);
      expect(signatureIdx).toBeGreaterThanOrEqual(0);
      expect(projectIdx).toBeLessThan(signatureIdx);
    });

    test('Presigned URL omits Project when binary has no project', async () => {
      const url = await getBinaryStorage().getPresignedUrl(binary);
      const parsed = new URL(url);
      expect(parsed.searchParams.get('Project')).toBeNull();
    });

    test('GET success with Project param', async () => {
      const url = await getBinaryStorage().getPresignedUrl(projectBinary);
      const res = await request(server).get(toPath(url));
      expect(res).toHaveStatus(200);
    });

    test('GET tampered Project fails signature', async () => {
      const url = await getBinaryStorage().getPresignedUrl(projectBinary);
      const res = await request(server).get(toPath(url.replace(`Project=${projectId}`, `Project=${randomUUID()}`)));
      expect(res).toHaveStatus(401);
    });

    test('PUT success with Project param', async () => {
      const url = await getBinaryStorage().getPresignedUrl(projectBinary, { upload: true });
      const res = await request(server)
        .put(toPath(url))
        .set('Content-Type', 'text/plain')
        .send('project upload content');
      expect(res).toHaveStatus(200);
    });

    test('PUT tampered Project fails signature', async () => {
      const url = await getBinaryStorage().getPresignedUrl(projectBinary, { upload: true });
      const res = await request(server)
        .put(toPath(url.replace(`Project=${projectId}`, `Project=${randomUUID()}`)))
        .set('Content-Type', 'text/plain')
        .send('tampered');
      expect(res).toHaveStatus(401);
    });
  });
});
