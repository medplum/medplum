// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType, createReference, MEDPLUM_VERSION } from '@medplum/core';
import type { AsyncJob, Binary, ClientApplication, Patient, Resource, User } from '@medplum/fhirtypes';
import type { Job } from 'bullmq';
import express from 'express';
import request from 'supertest';
import { vi } from 'vitest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { getBinaryStorage } from '../../storage/loader';
import { createTestProject, streamToString, waitForAsyncJob } from '../../test.setup';
import { execBulkExportJob } from '../../workers/bulk-export';
import { queueRegistry } from '../../workers/utils';
import { getTestProjectSystemRepo } from '../repository/test-utils';
import { DeleteQuery } from '../sql';

describe('Project $archive and $restore', () => {
  const app = express();
  const systemRepo = getTestProjectSystemRepo();

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    vi.mocked(queueRegistry.get('BulkExportQueue')?.add)?.mockImplementation(async (name, data) => {
      const job = { name, data, queueName: 'BulkExportQueue' } as Job;
      await execBulkExportJob(job);
      return job;
    });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  function post(path: string, accessToken: string, body: object = {}): request.Test {
    return request(app)
      .post('/fhir/R4/' + path)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(body);
  }

  async function runJob(path: string, accessToken: string, body?: object): Promise<AsyncJob> {
    const res = await post(path, accessToken, body);
    expect(res).toHaveStatus(202);
    const job = await waitForAsyncJob(res.headers['content-location'], app, accessToken);
    expect(job.status).toBe('completed');
    return job;
  }

  async function readOutput<T extends Resource>(job: AsyncJob, resourceType: T['resourceType']): Promise<T[]> {
    const url = job.output?.parameter
      ?.find((p) => p.name === 'output' && p.part?.[0].valueCode === resourceType)
      ?.part?.find((part) => part.name === 'url')?.valueUri;
    if (!url) {
      return [];
    }
    const binary = await systemRepo.readReference<Binary>({ reference: url });
    const content = await streamToString(await getBinaryStorage().readBinary(binary));
    return content
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
  }

  test('Authorization', async () => {
    const noFeature = await createTestProject({ withAccessToken: true, membership: { admin: true } });
    expect(await post(`Project/${noFeature.project.id}/$archive`, noFeature.accessToken)).toHaveStatus(403);

    const notAdmin = await createTestProject({ withAccessToken: true, project: { features: ['archive'] } });
    expect(await post(`Project/${notAdmin.project.id}/$archive`, notAdmin.accessToken)).toHaveStatus(403);
    expect(await post(`Project/${noFeature.project.id}/$archive`, notAdmin.accessToken)).toHaveStatus(403);

    const restricted = await createTestProject({
      withAccessToken: true,
      project: { features: ['archive'] },
      membership: { admin: true },
      accessPolicy: { resource: [{ resourceType: 'Patient', criteria: 'Patient?name=Alice' }] },
    });
    expect(await post(`Project/${restricted.project.id}/$archive`, restricted.accessToken)).toHaveStatus(403);

    expect(await post('$restore', notAdmin.accessToken)).toHaveStatus(403);
  });

  test('Round trip', async () => {
    const { project, accessToken, repo, client } = await createTestProject({
      withClient: true,
      withAccessToken: true,
      withRepo: true,
      project: { features: ['archive'] },
      membership: { admin: true },
    });
    const superAdmin = await createTestProject({ superAdmin: true, withAccessToken: true });

    const patient = await repo.createResource<Patient>({ resourceType: 'Patient', name: [{ family: 'Before' }] });
    const updated = await repo.updateResource<Patient>({ ...patient, name: [{ family: 'After' }] });
    const deleted = await repo.createResource<Patient>({ resourceType: 'Patient' });
    await repo.deleteResource('Patient', deleted.id);
    const user = await systemRepo.createResource<User>({
      resourceType: 'User',
      firstName: 'Project',
      lastName: 'User',
      email: `archive-${project.id}@example.com`,
      passwordHash: 'hash-1',
      meta: { project: project.id },
    });
    await systemRepo.updateResource<User>({ ...user, passwordHash: 'hash-2', mfaSecret: 'secret' });
    const serverUser = await systemRepo.createResource<User>({
      resourceType: 'User',
      firstName: 'Server',
      lastName: 'User',
      email: `server-${project.id}@example.com`,
    });

    // Archive twice so the second run sees the first run's output Binaries
    await runJob(`Project/${project.id}/$archive`, accessToken);
    const job = await runJob(`Project/${project.id}/$archive`, accessToken);
    expect(job.output?.parameter).toEqual(
      expect.arrayContaining([
        { name: 'project', valueReference: createReference(project) },
        { name: 'medplumVersion', valueString: MEDPLUM_VERSION },
      ])
    );

    const patients = await readOutput<Patient>(job, 'Patient');
    const versions = patients.filter((p) => p.id === patient.id);
    expect(versions.map((p) => p.name?.[0]?.family)).toStrictEqual(['Before', 'After']);
    expect(versions[1].meta).toMatchObject({ ...updated.meta, project: project.id, author: updated.meta?.author });
    expect(patients.find((p) => p.id === deleted.id && p.meta?.deleted)).toBeDefined();

    const clients = await readOutput<ClientApplication>(job, 'ClientApplication');
    expect(clients.find((c) => c.id === client.id)?.secret).toBe(client.secret);

    const users = await readOutput<User>(job, 'User');
    expect(users.filter((u) => u.id === user.id)).toHaveLength(2);
    expect(users.some((u) => u.id === serverUser.id || u.passwordHash || u.mfaSecret)).toBe(false);
    expect((await readOutput(job, 'Project'))[0]).not.toHaveProperty('superAdmin');
    expect(await readOutput(job, 'Binary')).toHaveLength(0);
    expect(await readOutput(job, 'AsyncJob')).toHaveLength(0);

    // Simulate an empty target server
    const ids = [patient.id, deleted.id];
    await systemRepo.sqlWrite(new DeleteQuery('Patient').where('id', 'IN', ids), 'Patient');
    await systemRepo.sqlWrite(new DeleteQuery('Patient_History').where('id', 'IN', ids), 'Patient');

    expect(await post('$restore', superAdmin.accessToken)).toHaveStatus(400);

    // Restore twice for idempotence; the skewed manifest exercises the warnings
    const skewed = {
      resourceType: 'Parameters',
      parameter: [
        ...(job.output?.parameter?.filter((p) => p.name !== 'medplumVersion') ?? []),
        { name: 'medplumVersion', valueString: '1.0.0' },
        { name: 'output', part: [{ name: 'type', valueCode: 'FutureResource' }] },
      ],
    };
    for (const manifest of [job.output, skewed]) {
      const restoreJob = await runJob('$restore', superAdmin.accessToken, manifest);
      expect(restoreJob.output?.parameter?.length ?? 0).toBe(manifest === skewed ? 2 : 0);

      expect(await repo.readResource<Patient>('Patient', patient.id)).toMatchObject({ meta: updated.meta });
      expect((await repo.readHistory('Patient', patient.id)).entry).toHaveLength(2);
      const bundle = await repo.search<Patient>({
        resourceType: 'Patient',
        filters: [{ code: 'family', operator: 'eq', value: 'After' }],
      });
      expect(bundle.entry?.map((e) => e.resource?.id)).toStrictEqual([patient.id]);
      await expect(repo.readResource('Patient', deleted.id)).rejects.toThrow('Gone');
    }
  });

  test('Restore rejects resources from other projects', async () => {
    const a = await createTestProject({ withRepo: true });
    const b = await createTestProject();
    const patient = await a.repo.createResource<Patient>({ resourceType: 'Patient' });

    await expect(systemRepo.restoreResourceVersions('Patient', b.project.id, [patient])).rejects.toThrow(
      `Patient/${patient.id} does not belong to Project/${b.project.id}`
    );
    const moved = { ...patient, meta: { ...patient.meta, project: b.project.id, versionId: crypto.randomUUID() } };
    await expect(systemRepo.restoreResourceVersions('Patient', b.project.id, [moved])).rejects.toThrow(
      `Patient/${patient.id} belongs to another project`
    );
  });
});
