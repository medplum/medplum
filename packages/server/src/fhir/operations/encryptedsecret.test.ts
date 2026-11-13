// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { AccessPolicyResource, EncryptedSecret, Parameters, Project, ProjectMembership } from '@medplum/fhirtypes';
import express from 'express';
import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { createTestProject } from '../../test.setup';
import { seal } from '../../util/secret-encryption';
import type { SystemRepository } from '../repo';
import { getProjectSystemRepo } from '../repo';

const app = express();

const fullAccess: AccessPolicyResource[] = [
  { resourceType: 'EncryptedSecret', interaction: ['create', 'read', 'update'], operation: ['get-value'] },
];

describe('EncryptedSecret $set-value and $get-value', () => {
  let systemRepo: SystemRepository;

  beforeAll(async () => {
    const config = await loadTestConfig();
    config.encryptedSecretKeys = [{ kid: 'test', key: randomBytes(32).toString('base64'), status: 'active' }];
    await initApp(app, config);
    systemRepo = await getProjectSystemRepo('');
  });

  afterAll(async () => {
    await shutdownApp();
  });

  async function setup(
    resource: AccessPolicyResource[],
    secret?: Partial<EncryptedSecret>
  ): Promise<{
    accessToken: string;
    project: WithId<Project>;
    membership: WithId<ProjectMembership>;
    secret: WithId<EncryptedSecret>;
  }> {
    const { accessToken, project, membership } = await createTestProject({
      withAccessToken: true,
      accessPolicy: { resource },
    });
    if (!membership) {
      throw new Error('Test project has no membership');
    }
    const created = await systemRepo.createResource<EncryptedSecret>({
      resourceType: 'EncryptedSecret',
      meta: { project: project.id },
      status: 'active',
      code: 'test-token',
      ...secret,
    });
    return { accessToken, project, membership, secret: created };
  }

  function setValue(accessToken: string, id: string, value: string): request.Test {
    return request(app)
      .post(`/fhir/R4/EncryptedSecret/${id}/$set-value`)
      .auth(accessToken, { type: 'bearer' })
      .send({ resourceType: 'Parameters', parameter: [{ name: 'value', valueString: value }] } satisfies Parameters);
  }

  function getValue(accessToken: string, id: string): request.Test {
    return request(app)
      .post(`/fhir/R4/EncryptedSecret/${id}/$get-value`)
      .auth(accessToken, { type: 'bearer' })
      .send({});
  }

  test('Set and get value', async () => {
    const { accessToken, membership, secret } = await setup(fullAccess);

    const setRes = await setValue(accessToken, secret.id, 'hunter2');
    expect(setRes.status).toBe(200);
    expect(setRes.body.encryptedValue).toBeDefined();
    expect(JSON.stringify(setRes.body)).not.toContain('hunter2');
    const stored = await systemRepo.readResource<EncryptedSecret>('EncryptedSecret', secret.id);
    expect(stored.meta?.author?.reference).toBe(membership.profile.reference);

    const getRes = await getValue(accessToken, secret.id);
    expect(getRes.status).toBe(200);
    expect(getRes.body.parameter).toStrictEqual([{ name: 'value', valueString: 'hunter2' }]);
  });

  test('Read without get-value grant is 403; without read, existence is not revealed', async () => {
    const readOnly = await setup([{ resourceType: 'EncryptedSecret', interaction: ['read'] }]);
    expect((await getValue(readOnly.accessToken, readOnly.secret.id)).status).toBe(403);

    const noAccess = await setup([{ resourceType: 'Patient' }]);
    const existing = await getValue(noAccess.accessToken, noAccess.secret.id);
    const missing = await getValue(noAccess.accessToken, randomUUID());
    expect(existing.status).not.toBe(200);
    expect(existing.status).toBe(missing.status);
  });

  test('get-value grant alone returns the value but not the resource', async () => {
    const { accessToken, project, secret } = await setup([
      { resourceType: 'EncryptedSecret', operation: ['get-value'] },
    ]);
    const context = {
      projectId: project.id,
      resourceType: 'EncryptedSecret',
      id: secret.id,
      owner: '',
      code: 'test-token',
    };
    await systemRepo.updateResource<EncryptedSecret>({
      ...secret,
      encryptedValue: seal(context, 'hunter2'),
    });

    const readRes = await request(app)
      .get(`/fhir/R4/EncryptedSecret/${secret.id}`)
      .auth(accessToken, { type: 'bearer' });
    expect(readRes.status).toBe(403);
    expect((await getValue(accessToken, secret.id)).body.parameter).toStrictEqual([
      { name: 'value', valueString: 'hunter2' },
    ]);
  });

  test('Value does not decrypt on another secret', async () => {
    const { accessToken, secret } = await setup(fullAccess);
    const setRes = await setValue(accessToken, secret.id, 'hunter2');
    const other = await systemRepo.createResource<EncryptedSecret>({
      ...secret,
      id: undefined,
      encryptedValue: setRes.body.encryptedValue,
    });

    const getRes = await getValue(accessToken, other.id);
    expect(getRes.status).toBe(500);
    expect(JSON.stringify(getRes.body)).not.toContain('hunter2');
  });

  test.each<[string, Partial<EncryptedSecret>]>([
    ['inactive', { status: 'inactive' }],
    ['expired', { expires: '2000-01-01T00:00:00Z' }],
  ])('get-value on %s secret is 422', async (_name, overrides) => {
    const { accessToken, secret } = await setup(fullAccess);
    await setValue(accessToken, secret.id, 'hunter2');
    await systemRepo.updateResource<EncryptedSecret>({
      ...(await systemRepo.readResource<EncryptedSecret>('EncryptedSecret', secret.id)),
      ...overrides,
    });
    expect((await getValue(accessToken, secret.id)).status).toBe(422);
  });

  test('set-value on revoked secret is 422', async () => {
    const { accessToken, secret } = await setup(fullAccess, { status: 'revoked' });
    expect((await setValue(accessToken, secret.id, 'hunter2')).status).toBe(422);
  });

  test('set-value honors If-Match', async () => {
    const { accessToken, secret } = await setup(fullAccess);
    const res = await setValue(accessToken, secret.id, 'hunter2').set('If-Match', 'W/"wrong-version"');
    expect(res.status).toBe(412);
  });
});
