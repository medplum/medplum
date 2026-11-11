// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType, createReference, MEDPLUM_VERSION } from '@medplum/core';
import type {
  AsyncJob,
  Binary,
  ClientApplication,
  JsonWebKey,
  Patient,
  Project,
  ProjectMembership,
  Resource,
  ResourceType,
  User,
} from '@medplum/fhirtypes';
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
    const { project, accessToken, repo, client, membership } = await createTestProject({
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
      project: createReference(project),
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

    // Simulate an empty target server, including the project and the client used to log in
    const removed: [ResourceType, string[]][] = [
      ['Patient', [patient.id, deleted.id]],
      ['Project', [project.id]],
      ['ProjectMembership', [membership.id]],
      ['User', [user.id]],
      ['ClientApplication', [client.id]],
    ];
    for (const [resourceType, ids] of removed) {
      await systemRepo.sqlWrite(new DeleteQuery(resourceType).where('id', 'IN', ids), resourceType);
      await systemRepo.sqlWrite(new DeleteQuery(resourceType + '_History').where('id', 'IN', ids), resourceType);
    }

    expect(await post('$restore', superAdmin.accessToken)).toHaveStatus(400);

    // An archive cannot claim an existing project it did not come from
    const hijack = {
      ...job.output,
      parameter: [
        ...(job.output?.parameter?.filter((p) => p.name !== 'project') ?? []),
        { name: 'project', valueReference: createReference(superAdmin.project) },
      ],
    };
    expect(await post('$restore', superAdmin.accessToken, hijack)).toHaveStatus(400);

    // Restore twice for idempotence; the skewed manifest exercises the warnings
    const skewed = {
      resourceType: 'Parameters',
      parameter: [
        ...(job.output?.parameter?.filter((p) => p.name !== 'medplumVersion') ?? []),
        { name: 'medplumVersion', valueString: '1.0.0' },
        {
          name: 'output',
          part: [
            { name: 'type', valueCode: 'FutureResource' },
            { name: 'url', valueUri: 'Binary/' + crypto.randomUUID() },
          ],
        },
      ],
    };
    for (const manifest of [job.output, skewed]) {
      const restoreJob = await runJob('$restore', superAdmin.accessToken, manifest);
      const warnings = restoreJob.output?.parameter?.map((p) => p.valueString);
      expect(warnings).toContain('Project features not enabled on this server: archive');
      expect(warnings).toHaveLength(manifest === skewed ? 3 : 1);

      expect(await repo.readResource<Patient>('Patient', patient.id)).toMatchObject({ meta: updated.meta });
      expect((await repo.readHistory('Patient', patient.id)).entry).toHaveLength(2);
      const bundle = await repo.search<Patient>({
        resourceType: 'Patient',
        filters: [{ code: 'family', operator: 'eq', value: 'After' }],
      });
      expect(bundle.entry?.map((e) => e.resource?.id)).toStrictEqual([patient.id]);
      await expect(repo.readResource('Patient', deleted.id)).rejects.toThrow('Gone');
    }

    // Existing clients keep working with their original credentials
    const tokenRes = await request(app)
      .post('/oauth2/token')
      .type('form')
      .send({ grant_type: 'client_credentials', client_id: client.id, client_secret: client.secret });
    expect(tokenRes).toHaveStatus(200);
    const readRes = await request(app)
      .get(`/fhir/R4/Patient/${patient.id}`)
      .set('Authorization', 'Bearer ' + tokenRes.body.access_token);
    expect(readRes).toHaveStatus(200);
  });

  test('Restore rejects resources outside the project', async () => {
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

    const meta = { project: b.project.id, versionId: crypto.randomUUID(), lastUpdated: new Date().toISOString() };
    const membership: ProjectMembership = {
      resourceType: 'ProjectMembership',
      id: crypto.randomUUID(),
      meta,
      project: createReference(a.project),
      user: { reference: 'User/' + crypto.randomUUID() },
      profile: { reference: 'Practitioner/' + crypto.randomUUID() },
      admin: true,
    };
    await expect(systemRepo.restoreResourceVersions('ProjectMembership', b.project.id, [membership])).rejects.toThrow(
      'does not belong to'
    );
    const jwk: JsonWebKey = { resourceType: 'JsonWebKey', id: crypto.randomUUID(), meta, active: true, alg: 'RS256' };
    await expect(systemRepo.restoreResourceVersions('JsonWebKey', b.project.id, [jwk])).rejects.toThrow('Forbidden');

    // Super admin fields come from the existing target Project, not the archive
    await systemRepo.restoreResourceVersions('Project', b.project.id, [
      { ...b.project, meta, superAdmin: true, features: ['ai'] },
    ]);
    const restored = await systemRepo.readResource<Project>('Project', b.project.id);
    expect(restored).not.toHaveProperty('superAdmin');
    expect(restored.features).toStrictEqual(b.project.features);
  });
});
