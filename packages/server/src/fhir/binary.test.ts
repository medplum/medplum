// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { ContentType, Logger, createReference } from '@medplum/core';
import type {
  AccessPolicyResource,
  Binary,
  Bundle,
  DocumentReference,
  OperationOutcomeIssue,
} from '@medplum/fhirtypes';
import express from 'express';
import type { Duplex } from 'stream';
import { Readable } from 'stream';
import request from 'supertest';
import { vi } from 'vitest';
import zlib from 'zlib';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { getBinaryStorage, getPresignedUrl } from '../storage/loader';
import { addTestUser, createTestProject, initTestAuth, streamToString, withTestContext } from '../test.setup';
import { getShardSystemRepo } from './repo';
import { PLACEHOLDER_SHARD_ID } from './sharding';

const app = express();
let accessToken: string;

describe('Binary', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    accessToken = await initTestAuth();
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Create and read binary', async () => {
    const res = await request(app)
      .post('/fhir/R4/Binary')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.TEXT)
      .send('Hello world');
    expect(res).toHaveStatus(201);

    const binary = res.body;
    const res2 = await request(app)
      .get('/fhir/R4/Binary/' + binary.id)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res2).toHaveStatus(200);
    expect(res2.text).toStrictEqual('Hello world');

    // Read as FHIR JSON
    const res3 = await request(app)
      .get('/fhir/R4/Binary/' + binary.id)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Accept', ContentType.FHIR_JSON);
    expect(res3).toHaveStatus(200);
    expect(res3.body.resourceType).toBe('Binary');
  });

  test('Read binary not found', async () => {
    const res = await request(app)
      .get('/fhir/R4/Binary/2e9dfab6-a3af-4e5b-9324-483b4c333737')
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res).toHaveStatus(404);
  });

  test('Read binary without stored content', async () => {
    const res = await request(app)
      .post('/fhir/R4/Binary')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ resourceType: 'Binary', contentType: ContentType.TEXT });
    expect(res).toHaveStatus(201);

    const binary = res.body as Binary;
    const loggerErrorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    try {
      const res2 = await request(app)
        .get('/fhir/R4/Binary/' + binary.id)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Accept', ContentType.JSON);
      expect(res2).toHaveStatus(404);
      expect(res2.headers['content-type']).toContain(ContentType.FHIR_JSON);
      expect(res2.headers.etag).toBeUndefined();
      expect(res2.headers['last-modified']).toBeUndefined();
      expect(res2.body.resourceType).toStrictEqual('OperationOutcome');
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Error reading Binary content',
        expect.objectContaining({
          binary: `Binary/${binary.id}`,
          err: expect.any(Error),
          versionId: binary.meta?.versionId,
        })
      );
    } finally {
      loggerErrorSpy.mockRestore();
    }
  });

  test('Hidden data field blocks reading content', async () => {
    const { project, accessToken: ownerToken } = await createTestProject({ withAccessToken: true });
    const res = await request(app)
      .post('/fhir/R4/Binary')
      .set('Authorization', 'Bearer ' + ownerToken)
      .set('Content-Type', ContentType.TEXT)
      .send('Hello world');
    expect(res).toHaveStatus(201);
    const binary = res.body as WithId<Binary>;

    for (const { fields, readStatus } of [
      { fields: { readonlyFields: ['data'] }, readStatus: 200 },
      { fields: { hiddenFields: ['data'] }, readStatus: 403 },
    ]) {
      const { accessToken } = await addTestUser(project, {
        accessPolicy: { resourceType: 'AccessPolicy', resource: [{ resourceType: 'Binary', ...fields }] },
      });

      for (const path of [
        `/fhir/R4/Binary/${binary.id}`,
        `/fhir/R4/Binary/${binary.id}/_history/${binary.meta?.versionId}`,
      ]) {
        const res2 = await request(app)
          .get(path)
          .set('Authorization', 'Bearer ' + accessToken);
        expect(res2).toHaveStatus(readStatus);
        expect(res2.text === 'Hello world').toBe(readStatus === 200);
      }

      // The resource itself is still readable
      const res3 = await request(app)
        .get(`/fhir/R4/Binary/${binary.id}`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Accept', ContentType.FHIR_JSON);
      expect(res3).toHaveStatus(200);
      expect(res3.body.id).toBe(binary.id);
    }
  });

  test('Update and read binary', async () => {
    const res = await request(app)
      .post('/fhir/R4/Binary')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.TEXT)
      .send('Hello world');
    expect(res).toHaveStatus(201);

    const binary = res.body;
    const res2 = await request(app)
      .put('/fhir/R4/Binary/' + binary.id)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.TEXT)
      .send('Hello world 2');
    expect(res2).toHaveStatus(200);

    const res3 = await request(app)
      .get('/fhir/R4/Binary/' + binary.id)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res3).toHaveStatus(200);
    expect(res3.text).toStrictEqual('Hello world 2');
  });

  test('Binary CORS', async () => {
    const res = await request(app)
      .post('/fhir/R4/Binary')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.TEXT)
      .set('Origin', 'http://localhost:3000')
      .send('Hello world');
    expect(res).toHaveStatus(201);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });

  test('Unsupported content encoding', async () => {
    const res = await request(app)
      .post('/fhir/R4/Binary')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.TEXT)
      .set('Content-Encoding', 'fake')
      .send('Hello world');
    expect(res).toHaveStatus(400);
  });

  test('Deflate', async () => {
    const res = await request(app)
      .post('/fhir/R4/Binary')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.TEXT)
      .set('Content-Encoding', 'deflate')
      .send(await createBufferForStream('Hello world', zlib.createDeflate()));
    expect(res).toHaveStatus(201);

    const binary = res.body;
    const res2 = await request(app)
      .get('/fhir/R4/Binary/' + binary.id)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res2).toHaveStatus(200);
    expect(res2.text).toStrictEqual('Hello world');
  });

  test('GZIP', async () => {
    const res = await request(app)
      .post('/fhir/R4/Binary')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.TEXT)
      .set('Content-Encoding', 'gzip')
      .send(await createBufferForStream('Hello world', zlib.createGzip()));
    expect(res).toHaveStatus(201);

    const binary = res.body;
    const res2 = await request(app)
      .get('/fhir/R4/Binary/' + binary.id)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res2).toHaveStatus(200);
    expect(res2.text).toStrictEqual('Hello world');
  });

  test('Update with GZIP', async () => {
    const res = await request(app)
      .post('/fhir/R4/Binary')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.TEXT)
      .send('Hello world');
    expect(res).toHaveStatus(201);

    const binary = res.body;
    const res2 = await request(app)
      .put('/fhir/R4/Binary/' + binary.id)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.TEXT)
      .set('Content-Encoding', 'gzip')
      .send(await createBufferForStream('Hello world 2', zlib.createGzip()));
    expect(res2).toHaveStatus(200);

    const res3 = await request(app)
      .get('/fhir/R4/Binary/' + binary.id)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res3).toHaveStatus(200);
    expect(res3.text).toStrictEqual('Hello world 2');
  });

  test('Upload binary in batch', async () => {
    const res = await request(app)
      .post(`/fhir/R4/`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Bundle',
        type: 'transaction',
        entry: [
          {
            fullUrl: 'urn:uuid:a0010b42-02ea-411c-a314-9ec144f6c2b8',
            request: { method: 'POST', url: 'Binary' },
            resource: { resourceType: 'Binary', contentType: 'text/plain', data: 'SGVsbG8gV29ybGQh' },
          },
          {
            request: { method: 'POST', url: 'DocumentReference' },
            resource: {
              resourceType: 'DocumentReference',
              status: 'current',
              content: [
                { attachment: { contentType: 'text/plain', url: 'urn:uuid:a0010b42-02ea-411c-a314-9ec144f6c2b8' } },
              ],
            },
          },
        ],
      });
    expect(res).toHaveStatus(200);

    const result = res.body as Bundle;
    expect(result).toBeDefined();
    expect(result.entry).toHaveLength(2);

    const binary = result.entry?.[0]?.resource as Binary;
    const docref = result.entry?.[1]?.resource as DocumentReference;
    expect(docref.content?.[0]?.attachment?.url).toContain(binary.id);

    // Request the binary
    const storage = getBinaryStorage();
    const stream = await storage.readBinary(binary);
    expect(stream).toBeDefined();

    // Verify that the file matches the expected contents
    const content = await streamToString(stream);
    expect(content).toStrictEqual('Hello World!');
  });

  test('Update JSON', async () => {
    const res = await request(app)
      .post('/fhir/R4/Binary')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.TEXT)
      .send('Hello world');
    expect(res).toHaveStatus(201);

    const binary = res.body;

    const res1 = await request(app)
      .post('/fhir/R4/Patient')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ resourceType: 'Patient' });
    expect(res1).toHaveStatus(201);

    const patient = res1.body;

    const res2 = await request(app)
      .put('/fhir/R4/Binary/' + binary.id)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ ...binary, securityContext: createReference(patient) });
    expect(res2).toHaveStatus(200);

    const res3 = await request(app)
      .get('/fhir/R4/Binary/' + binary.id)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Accept', ContentType.FHIR_JSON);
    expect(res3).toHaveStatus(200);
    expect(res3.body.securityContext.reference).toStrictEqual(`Patient/${patient.id}`);
  });

  test('Invalid Binary JSON', async () => {
    const res = await request(app)
      .post('/fhir/R4/Binary')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.TEXT)
      .send('Hello world');
    expect(res).toHaveStatus(201);

    const binary = res.body;
    const res2 = await request(app)
      .put('/fhir/R4/Binary/' + binary.id)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        ...binary,
        data: 'Hello, world!', // Invalid: not encoded as base64Binary
      });
    expect(res2).toHaveStatus(400);

    const res3 = await request(app)
      .get('/fhir/R4/Binary/' + binary.id)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Accept', ContentType.FHIR_JSON);
    expect(res3).toHaveStatus(200);
    expect(res3.body.data).toBeUndefined();
  });

  test('Handle non-binary JSON', async () => {
    const res = await request(app)
      .post('/fhir/R4/Binary')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.TEXT)
      .send('Hello world');
    expect(res).toHaveStatus(201);

    const binary = res.body;

    // Send a non-binary JSON object
    const res2 = await request(app)
      .put('/fhir/R4/Binary/' + binary.id)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ resourceType: 'Patient' });
    expect(res2).toHaveStatus(200);

    const res3 = await request(app)
      .get('/fhir/R4/Binary/' + binary.id)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res3).toHaveStatus(200);
    expect(res3.text).toStrictEqual('{"resourceType":"Patient"}');
  });

  test('Error for disallowed file type', async () => {
    const res = await request(app)
      .post('/fhir/R4/Binary')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/x-msdownload')
      .send('Hello world');
    expect(res).toHaveStatus(400);
    expect(res.body.issue[0]).toMatchObject<OperationOutcomeIssue>({ severity: 'error', code: 'invalid' });

    const res2 = await request(app)
      .post('/fhir/R4/Binary')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/octet-stream')
      .query({ _filename: 'foo.exe' })
      .send('Hello world');
    expect(res2).toHaveStatus(400);
    expect(res2.body.issue[0]).toMatchObject<OperationOutcomeIssue>({ severity: 'error', code: 'invalid' });
  });

  describe('Content access', () => {
    const systemRepo = getShardSystemRepo(PLACEHOLDER_SHARD_ID);

    async function readAll(
      fields: Pick<AccessPolicyResource, 'hiddenFields' | 'readonlyFields'>,
      asSystem = false
    ): Promise<Binary[]> {
      const { project, repo: projectRepo } = await createTestProject({
        withRepo: true,
        accessPolicy: { resource: [{ resourceType: 'Binary', ...fields }] },
      });
      const binary = await systemRepo.createResource<Binary>({
        resourceType: 'Binary',
        contentType: ContentType.TEXT,
        meta: { project: project.id },
      });
      await getBinaryStorage().writeBinary(binary, undefined, ContentType.TEXT, 'Hello world');

      const repo = asSystem ? systemRepo : projectRepo;
      return [
        await repo.readResource<Binary>('Binary', binary.id),
        await repo.readVersion<Binary>('Binary', binary.id, binary.meta?.versionId as string),
        await repo.readReference(createReference(binary)),
        ...((await repo.readReferences([createReference(binary)])) as Binary[]),
      ];
    }

    test('Hidden data field blocks reading and signing stored content', () =>
      withTestContext(async () => {
        for (const read of await readAll({ hiddenFields: ['data'] })) {
          await expect(getBinaryStorage().readBinary(read)).rejects.toThrow('Forbidden');
          await expect(getPresignedUrl(read)).rejects.toThrow('Forbidden');
          // Upload links do not expose content
          await expect(getPresignedUrl(read, { upload: true })).resolves.toBeDefined();
        }
      }));

    test('Content is readable without hidden data field', () =>
      withTestContext(async () => {
        for (const reads of [
          await readAll({ readonlyFields: ['data'] }),
          await readAll({ hiddenFields: ['data'] }, true),
        ]) {
          for (const read of reads) {
            expect(await streamToString(await getBinaryStorage().readBinary(read))).toBe('Hello world');
            await expect(getPresignedUrl(read)).resolves.toBeDefined();
          }
        }
      }));
  });
});

async function createBufferForStream(message: string, stream: Duplex): Promise<Buffer> {
  const input = new Readable();
  input.push(message);
  input.push(null);

  input.pipe(stream);

  return new Promise<Buffer>((resolve, reject) => {
    const _buf: any[] = [];
    stream.on('data', (chunk) => _buf.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(_buf)));
    stream.on('error', (err) => reject(new Error(`error converting stream - ${err}`)));
  });
}
