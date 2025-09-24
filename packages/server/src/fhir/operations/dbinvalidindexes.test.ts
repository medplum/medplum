// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Parameters } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { DatabaseMode, getDatabasePool } from '../../database';
import { initTestAuth } from '../../test.setup';

describe('$db-invalid-indexes', () => {
  const app = express();

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  afterEach(async () => {
    const client = getDatabasePool(DatabaseMode.WRITER);
    await client.query(`REINDEX INDEX CONCURRENTLY "CarePlan_replaces_idx"`);
  });

  test('Success', async () => {
    const client = getDatabasePool(DatabaseMode.WRITER);
    await client.query(
      `UPDATE pg_index SET indislive = false 
      FROM pg_class WHERE pg_class.oid = pg_index.indexrelid 
      AND pg_class.relname = $1`,
      ['CarePlan_replaces_idx']
    );

    const accessToken = await initTestAuth({ project: { superAdmin: true } });

    const res = await request(app)
      .post('/fhir/R4/$db-invalid-indexes')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({});
    expect(res.status).toBe(200);
    const params = res.body as Parameters;
    const invalidIndex = params.parameter?.filter((p) => p.name === 'invalidIndex');
    expect(invalidIndex).toBeDefined();
    expect(invalidIndex?.length).toBe(1);
    expect(invalidIndex?.[0].valueString).toContain('CarePlan_replaces_idx');
  });
});
