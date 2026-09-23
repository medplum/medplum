// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType } from '@medplum/core';
import type { Parameters, ParametersParameter } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { DatabaseMode, getDatabasePool } from '../../database';
import { getSuperAdminAccessToken } from '../../test.setup';

describe('$explain', () => {
  const app = express();
  let accessToken: string;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    accessToken = await getSuperAdminAccessToken();
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test.each(['json', 'text'])('Success with %s format', async (format) => {
    const body = {
      resourceType: 'Parameters',
      parameter: [
        { name: 'query', valueString: 'Patient?active=true' },
        { name: 'analyze', valueBoolean: true },
        { name: 'format', valueString: format },
      ],
    } satisfies Parameters;

    const res1 = await request(app)
      .post('/fhir/R4/$explain')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(body);

    expect(res1).toHaveStatus(200);
    const output = res1.body.parameter as ParametersParameter[];
    expect(output).toContainExactly([
      { name: 'query', valueString: expect.stringContaining('SELECT "Patient"') },
      { name: 'parameters', valueString: expect.stringContaining('$1 = ') },
      { name: 'explain', valueString: expect.stringContaining(format === 'json' ? '{"Plan":' : '(cost=') },
    ]);
  });

  test('Explains a raw SQL SELECT', async () => {
    const body = {
      sql: 'SELECT * FROM "Patient" WHERE "active" = true',
      format: 'text',
    };

    const res = await request(app)
      .post('/fhir/R4/$explain')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(body);

    expect(res).toHaveStatus(200);
    const output = res.body.parameter as ParametersParameter[];
    expect(output).toContainEqual({
      name: 'query',
      valueString: 'SELECT * FROM "Patient" WHERE "active" = true',
    });
    expect(output.find((p) => p.name === 'explain')?.valueString).toEqual(expect.stringContaining('(cost='));
  });

  test('Rejects query and sql together', async () => {
    const body = {
      query: 'Patient?active=true',
      sql: 'SELECT 1',
    };

    const res = await request(app)
      .post('/fhir/R4/$explain')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(body);

    expect(res).toHaveStatus(400);
  });

  test('Rejects EXPLAIN ANALYZE of a data-modifying CTE', async () => {
    const body = {
      sql: `WITH d AS (DELETE FROM "Patient" WHERE id = '00000000-0000-0000-0000-000000000000' RETURNING *) SELECT * FROM d`,
      analyze: true,
    };

    const res = await request(app)
      .post('/fhir/R4/$explain')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(body);

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(res.body)).toEqual(expect.stringMatching(/read-only transaction/i));
  });

  test('Rejects non-SELECT sql', async () => {
    const body = {
      sql: 'DELETE FROM "Patient"',
    };

    const res = await request(app)
      .post('/fhir/R4/$explain')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(body);

    expect(res).toHaveStatus(400);
  });

  test('Rejects hypotheticalIndex that is not CREATE INDEX', async () => {
    const body = {
      resourceType: 'Parameters',
      parameter: [
        { name: 'query', valueString: 'Patient?active=true' },
        { name: 'hypotheticalIndex', valueString: 'DROP INDEX "Patient_id_idx"' },
      ],
    } satisfies Parameters;

    const res = await request(app)
      .post('/fhir/R4/$explain')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(body);

    expect(res).toHaveStatus(400);
  });

  test('Rejects CONCURRENTLY hypothetical indexes', async () => {
    const body = {
      query: 'Patient?active=true',
      hypotheticalIndex: 'CREATE INDEX CONCURRENTLY ON "Patient" ("active")',
    };

    const res = await request(app)
      .post('/fhir/R4/$explain')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(body);

    expect(res).toHaveStatus(400);
  });

  test('Uses HypoPG hypothetical indexes when the extension is available', async () => {
    const available = await isHypoPgAvailable();
    if (!available) {
      return;
    }
    const body = {
      resourceType: 'Parameters',
      parameter: [
        { name: 'query', valueString: 'Patient?active=true' },
        { name: 'analyze', valueBoolean: true },
        { name: 'hypotheticalIndex', valueString: 'CREATE INDEX ON "Patient" ("active")' },
      ],
    } satisfies Parameters;

    const res = await request(app)
      .post('/fhir/R4/$explain')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(body);

    expect(res).toHaveStatus(200);
    const output = res.body.parameter as ParametersParameter[];
    expect(output).toContainEqual(
      expect.objectContaining({
        name: 'hypotheticalIndex',
        part: expect.arrayContaining([
          expect.objectContaining({
            name: 'definition',
            valueString: expect.stringContaining('CREATE INDEX'),
          }),
          expect.objectContaining({ name: 'indexrelid' }),
          expect.objectContaining({ name: 'indexName' }),
        ]),
      })
    );
    expect(output).toContainEqual(
      expect.objectContaining({
        name: 'warning',
        valueString: expect.stringContaining('EXPLAIN ANALYZE is skipped'),
      })
    );
    const plan = output.find((p) => p.name === 'explain')?.valueString;
    expect(plan).toEqual(expect.stringContaining('(cost='));
  });

  test('Registers HypoPG hypothetical index for SQL EXPLAIN on the same connection', async () => {
    if (!(await isHypoPgInstalled())) {
      return;
    }
    const body = {
      sql: `SELECT * FROM "Patient" WHERE "lastUpdated" > '2026-01-01'`,
      hypotheticalIndex: 'CREATE INDEX ON "Patient" ("lastUpdated")',
      format: 'text',
    };

    const res = await request(app)
      .post('/fhir/R4/$explain')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(body);

    expect(res).toHaveStatus(200);
    const output = res.body.parameter as ParametersParameter[];
    const hypo = output.find((p) => p.name === 'hypotheticalIndex');
    expect(hypo?.part).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'indexrelid', valueString: expect.stringMatching(/^\d+$/) }),
        expect.objectContaining({ name: 'indexName', valueString: expect.stringMatching(/btree_Patient_lastUpdated/) }),
        expect.objectContaining({ name: 'tableName', valueString: 'Patient' }),
        expect.objectContaining({
          name: 'definition',
          valueString: expect.stringMatching(/CREATE INDEX.*"lastUpdated"/i),
        }),
      ])
    );

    const plan = output.find((p) => p.name === 'explain')?.valueString ?? '';
    expect(plan).toEqual(expect.stringContaining('(cost='));
  });
});

async function isHypoPgAvailable(): Promise<boolean> {
  return isExtensionAvailable('hypopg');
}

async function isHypoPgInstalled(): Promise<boolean> {
  const result = await getDatabasePool(DatabaseMode.WRITER).query(
    `SELECT 1 FROM pg_extension WHERE extname = 'hypopg'`
  );
  return (result.rowCount ?? 0) > 0;
}

async function isExtensionAvailable(name: string): Promise<boolean> {
  const result = await getDatabasePool(DatabaseMode.WRITER).query(
    `SELECT 1 FROM pg_available_extensions WHERE name = $1`,
    [name]
  );
  return (result.rowCount ?? 0) > 0;
}
