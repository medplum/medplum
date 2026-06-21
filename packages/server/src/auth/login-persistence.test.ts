// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { createReference } from '@medplum/core';
import type { ClientApplication, Login } from '@medplum/fhirtypes';
import { randomUUID } from 'node:crypto';
import { initAppServices, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { DatabaseMode, getDatabasePool } from '../database';
import { getGlobalSystemRepo } from '../fhir/repo';
import { deleteResourceCacheEntry } from '../fhir/repository/resource-cache';
import { withTestContext } from '../test.setup';

const systemRepo = getGlobalSystemRepo();

async function countLoginRows(id: string): Promise<number> {
  const pool = getDatabasePool(DatabaseMode.WRITER);
  const result = await pool.query('SELECT COUNT(*)::int AS count FROM "Login" WHERE "id" = $1', [id]);
  return result.rows[0].count;
}

function buildLogin(authMethod: Login['authMethod']): Login {
  const client: WithId<ClientApplication> = { resourceType: 'ClientApplication', id: randomUUID() };
  return {
    resourceType: 'Login',
    authMethod,
    user: createReference(client),
    client: createReference(client),
    authTime: new Date().toISOString(),
    scope: 'openid',
  };
}

describe('Auth Login persistence', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('client Login is persisted to Postgres', async () => {
    const login = await withTestContext(() => systemRepo.createResource<Login>(buildLogin('client')));
    await expect(countLoginRows(login.id)).resolves.toBe(1);
  });

  test('execute Login remains cache-only (no Postgres row)', async () => {
    const login = await withTestContext(() => systemRepo.createResource<Login>(buildLogin('execute')));
    await expect(countLoginRows(login.id)).resolves.toBe(0);
  });

  test('Reads back a persisted client Login even after the cache entry is gone', async () => {
    const login = await withTestContext(() => systemRepo.createResource<Login>(buildLogin('client')));
    await deleteResourceCacheEntry('Login', login.id);
    const reread = await withTestContext(() => systemRepo.readResource<Login>('Login', login.id));
    expect(reread.id).toStrictEqual(login.id);
    expect(reread.authMethod).toStrictEqual('client');
  });
});
