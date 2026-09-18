// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType, createReference, getReferenceString } from '@medplum/core';
import type { Parameters, ParametersParameter } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { DatabaseMode, getDatabasePool } from '../../database';
import { createTestProject, getSuperAdminAccessToken } from '../../test.setup';

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
    const res1 = await request(app)
      .post('/fhir/R4/$explain')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'query', valueString: 'Patient?active=true' },
          { name: 'analyze', valueBoolean: true },
          { name: 'format', valueString: format },
        ],
      } satisfies Parameters);
    expect(res1).toHaveStatus(200);

    const output = res1.body.parameter as ParametersParameter[];
    expect(output).toContainExactly([
      { name: 'query', valueString: expect.stringContaining('SELECT "Patient"') },
      { name: 'parameters', valueString: expect.stringContaining('$1 = ') },
      { name: 'explain', valueString: expect.stringContaining(format === 'json' ? '{"Plan":' : '(cost=') },
    ]);
  });

  test.each(['json', 'text'])('Unicode characters in explain output escaped', async (format) => {
    const res = await request(app)
      .post('/fhir/R4/$explain')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        query: 'Observation?code:text=hemoglobin',
        analyze: true,
        count: false,
        format,
      });
    expect(res).toHaveStatus(200);

    const output = res.body.parameter as ParametersParameter[];
    expect(output).toContainEqual({ name: 'parameters', valueString: expect.stringContaining('\\x03') });
  });

  test('Returns count when count parameter is true', async () => {
    const res = await request(app)
      .post('/fhir/R4/$explain')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'query', valueString: 'Patient?active=true' },
          { name: 'count', valueBoolean: true },
        ],
      } satisfies Parameters);

    expect(res).toHaveStatus(200);
    const output = res.body.parameter as ParametersParameter[];
    expect(output).toContainEqual(expect.objectContaining({ name: 'countEstimate', valueInteger: expect.any(Number) }));
    expect(output).toContainEqual(expect.objectContaining({ name: 'countAccurate', valueInteger: expect.any(Number) }));
  });

  test('Does not return count when count parameter is omitted', async () => {
    const res = await request(app)
      .post('/fhir/R4/$explain')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'query', valueString: 'Patient?active=true' }],
      } satisfies Parameters);

    expect(res).toHaveStatus(200);
    const output = res.body.parameter as ParametersParameter[];
    expect(output.find((p) => p.name === 'countEstimate')).toBeUndefined();
    expect(output.find((p) => p.name === 'countAccurate')).toBeUndefined();
  });

  test('Respects On-Behalf-Of', async () => {
    const { project: linkedProject } = await createTestProject({ withClient: true });
    const { membership, project } = await createTestProject({
      withClient: true,
      project: { link: [{ project: createReference(linkedProject) }] },
    });
    const res1 = await request(app)
      .post('/fhir/R4/$explain')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('X-Medplum-On-Behalf-Of', getReferenceString(membership))
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'query', valueString: 'Patient?active=true' }],
      } satisfies Parameters);
    expect(res1).toHaveStatus(200);

    const output = res1.body.parameter as ParametersParameter[];
    const plan = output.find((p) => p.name === 'explain')?.valueString;
    expect(plan).toContain(project.id);
    expect(plan).toContain(linkedProject.id);
  });

  test('Rejects hypotheticalIndex that is not CREATE INDEX', async () => {
    const res = await request(app)
      .post('/fhir/R4/$explain')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'query', valueString: 'Patient?active=true' },
          { name: 'hypotheticalIndex', valueString: 'DROP INDEX "Patient_id_idx"' },
        ],
      } satisfies Parameters);
    expect(res).toHaveStatus(400);
  });

  test('Rejects CONCURRENTLY hypothetical indexes', async () => {
    const res = await request(app)
      .post('/fhir/R4/$explain')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        query: 'Patient?active=true',
        hypotheticalIndex: 'CREATE INDEX CONCURRENTLY ON "Patient" ("active")',
      });
    expect(res).toHaveStatus(400);
  });

  test('Uses HypoPG hypothetical indexes when the extension is available', async () => {
    const available = await isHypoPgAvailable();
    if (!available) {
      return;
    }

    const res = await request(app)
      .post('/fhir/R4/$explain')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'query', valueString: 'Patient?active=true' },
          { name: 'analyze', valueBoolean: true },
          { name: 'hypotheticalIndex', valueString: 'CREATE INDEX ON "Patient" ("active")' },
        ],
      } satisfies Parameters);
    expect(res).toHaveStatus(200);

    const output = res.body.parameter as ParametersParameter[];
    expect(output).toContainEqual(
      expect.objectContaining({
        name: 'hypotheticalIndex',
        valueString: expect.stringContaining('CREATE INDEX ON "Patient" ("active")'),
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

  test('Uses HypoPG bloom indexes when bloom and hypopg are available', async () => {
    if (!(await isExtensionAvailable('hypopg')) || !(await isExtensionAvailable('bloom'))) {
      return;
    }

    const res = await request(app)
      .post('/fhir/R4/$explain')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        query: 'Patient?active=true',
        hypotheticalIndex: 'CREATE INDEX ON "Patient" USING bloom ("_source")',
      });
    expect(res).toHaveStatus(200);

    const output = res.body.parameter as ParametersParameter[];
    expect(output).toContainEqual(
      expect.objectContaining({
        name: 'hypotheticalIndex',
        valueString: expect.stringMatching(/bloom.*CREATE INDEX ON "Patient" USING bloom \("_source"\)/i),
      })
    );
  });
});

async function isHypoPgAvailable(): Promise<boolean> {
  return isExtensionAvailable('hypopg');
}

async function isExtensionAvailable(name: string): Promise<boolean> {
  const result = await getDatabasePool(DatabaseMode.WRITER).query(
    `SELECT 1 FROM pg_available_extensions WHERE name = $1`,
    [name]
  );
  return (result.rowCount ?? 0) > 0;
}
