// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType, createReference, MEDPLUM_VERSION } from '@medplum/core';
import type { AsyncJob, Binary, Patient, Resource, User } from '@medplum/fhirtypes';
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

describe('Project $archive', () => {
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

  async function archive(projectId: string, accessToken: string, body: object = {}): Promise<request.Response> {
    return request(app)
      .post(`/fhir/R4/Project/${projectId}/$archive`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(body);
  }

  async function runArchive(projectId: string, accessToken: string, body?: object): Promise<AsyncJob> {
    const res = await archive(projectId, accessToken, body);
    expect(res).toHaveStatus(202);
    const job = await waitForAsyncJob(res.headers['content-location'], app, accessToken);
    expect(job.status).toBe('completed');
    return job;
  }

  async function readOutput(job: AsyncJob, resourceType: string): Promise<Resource[]> {
    const url = job.output?.parameter
      ?.find((p) => p.name === 'output' && p.part?.find((part) => part.valueCode === resourceType))
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

  test('Requires the archive feature', async () => {
    const { project, accessToken } = await createTestProject({ withAccessToken: true, membership: { admin: true } });
    expect(await archive(project.id, accessToken)).toHaveStatus(403);
  });

  test('Requires project admin', async () => {
    const { project, accessToken } = await createTestProject({
      withAccessToken: true,
      project: { features: ['archive'] },
    });
    expect(await archive(project.id, accessToken)).toHaveStatus(403);
  });

  test('Requires the current project', async () => {
    const { accessToken } = await createTestProject({
      withAccessToken: true,
      withRepo: true,
      project: { features: ['archive'] },
      membership: { admin: true },
    });
    const other = await createTestProject({ project: { features: ['archive'] } });
    expect(await archive(other.project.id, accessToken)).toHaveStatus(403);
  });

  test('Rejects restrictive access policies', async () => {
    const { project, accessToken } = await createTestProject({
      withAccessToken: true,
      project: { features: ['archive'] },
      membership: { admin: true },
      accessPolicy: { resource: [{ resourceType: 'Patient', criteria: 'Patient?name=Alice' }] },
    });
    expect(await archive(project.id, accessToken)).toHaveStatus(403);
  });

  test('Exports every version with meta', async () => {
    const { project, accessToken, repo, client } = await createTestProject({
      withClient: true,
      withAccessToken: true,
      withRepo: true,
      project: { features: ['archive'] },
      membership: { admin: true },
    });

    const patient = await repo.createResource<Patient>({ resourceType: 'Patient', name: [{ family: 'Before' }] });
    const updated = await repo.updateResource<Patient>({ ...patient, name: [{ family: 'After' }] });
    const deleted = await repo.createResource<Patient>({ resourceType: 'Patient' });
    await repo.deleteResource('Patient', deleted.id);

    const job = await runArchive(project.id, accessToken);
    expect(job.output?.parameter).toEqual(
      expect.arrayContaining([
        { name: 'project', valueReference: createReference(project) },
        { name: 'medplumVersion', valueString: MEDPLUM_VERSION },
      ])
    );

    const patients = (await readOutput(job, 'Patient')) as Patient[];
    const versions = patients.filter((p) => p.id === patient.id);
    expect(versions.map((p) => p.meta?.versionId)).toStrictEqual([patient.meta?.versionId, updated.meta?.versionId]);
    expect(versions.map((p) => p.name?.[0]?.family)).toStrictEqual(['Before', 'After']);
    expect(versions[1].meta).toMatchObject({
      lastUpdated: updated.meta?.lastUpdated,
      project: project.id,
      author: updated.meta?.author,
    });
    expect(versions[1].meta?.compartment).toBeDefined();

    const tombstone = patients.filter((p) => p.id === deleted.id).at(-1);
    expect(tombstone).toMatchObject({ resourceType: 'Patient', id: deleted.id, meta: { deleted: true } });

    // Project admins can read client secrets, so existing clients keep working after restore
    const clients = await readOutput(job, 'ClientApplication');
    expect(clients).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: client.id, secret: client.secret })])
    );

    expect(await readOutput(job, 'AsyncJob')).toHaveLength(0);
    expect(await readOutput(job, 'AuditEvent')).toHaveLength(0);
  });

  test('Removes hidden fields from every version', async () => {
    const { project, accessToken } = await createTestProject({
      withAccessToken: true,
      withRepo: true,
      project: { features: ['archive'] },
      membership: { admin: true },
    });
    const user = await systemRepo.createResource<User>({
      resourceType: 'User',
      firstName: 'Test',
      lastName: 'User',
      email: `archive-${project.id}@example.com`,
      passwordHash: 'hash-1',
      meta: { project: project.id },
    });
    await systemRepo.updateResource<User>({ ...user, passwordHash: 'hash-2', mfaSecret: 'secret' });

    const job = await runArchive(project.id, accessToken);
    const users = (await readOutput(job, 'User')) as User[];
    expect(users.filter((u) => u.id === user.id)).toHaveLength(2);
    for (const u of users) {
      expect(u.passwordHash).toBeUndefined();
      expect(u.mfaSecret).toBeUndefined();
    }

    const projects = await readOutput(job, 'Project');
    expect(projects.length).toBeGreaterThan(0);
    for (const p of projects) {
      expect(p).not.toHaveProperty('superAdmin');
      expect(p).not.toHaveProperty('strictMode');
    }
  });

  test('Excludes server-scoped users and previous archive output', async () => {
    const { project, accessToken } = await createTestProject({
      withAccessToken: true,
      withRepo: true,
      project: { features: ['archive'] },
      membership: { admin: true },
    });
    const serverUser = await systemRepo.createResource<User>({
      resourceType: 'User',
      firstName: 'Test',
      lastName: 'User',
      email: `server-${project.id}@example.com`,
    });

    await runArchive(project.id, accessToken);
    const job = await runArchive(project.id, accessToken);

    const users = await readOutput(job, 'User');
    expect(users.find((u) => u.id === serverUser.id)).toBeUndefined();
    expect(await readOutput(job, 'Binary')).toHaveLength(0);
  });
});
