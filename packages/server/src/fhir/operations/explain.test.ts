// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType, createReference, getReferenceString } from '@medplum/core';
import type { Parameters, ParametersParameter } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { createTestProject, initTestAuth } from '../../test.setup';

describe('$explain', () => {
  const app = express();

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test.each(['json', 'text'])('Success with %s format', async (format) => {
    const accessToken = await initTestAuth({ project: { superAdmin: true } });

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
    expect(res1.status).toBe(200);

    const output = res1.body.parameter as ParametersParameter[];
    expect(output).toHaveLength(3);
    expect(output).toStrictEqual(
      expect.arrayContaining<ParametersParameter>([
        { name: 'query', valueString: expect.stringContaining('SELECT "Patient"') },
        { name: 'parameters', valueString: expect.stringContaining('$1 = ') },
        { name: 'explain', valueString: expect.stringContaining(format === 'json' ? '{"Plan":' : '(cost=') },
      ])
    );
  });

  test('Returns count when count parameter is true', async () => {
    const accessToken = await initTestAuth({ project: { superAdmin: true } });

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

    expect(res.status).toBe(200);
    const output = res.body.parameter as ParametersParameter[];
    expect(output).toContainEqual(expect.objectContaining({ name: 'countEstimate', valueInteger: expect.any(Number) }));
    expect(output).toContainEqual(expect.objectContaining({ name: 'countAccurate', valueInteger: expect.any(Number) }));
  });

  test('Does not return count when count parameter is omitted', async () => {
    const accessToken = await initTestAuth({ project: { superAdmin: true } });

    const res = await request(app)
      .post('/fhir/R4/$explain')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'query', valueString: 'Patient?active=true' }],
      } satisfies Parameters);

    expect(res.status).toBe(200);
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
    const accessToken = await initTestAuth({ project: { superAdmin: true } });

    const res1 = await request(app)
      .post('/fhir/R4/$explain')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('X-Medplum-On-Behalf-Of', getReferenceString(membership))
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'query', valueString: 'Patient?active=true' }],
      } satisfies Parameters);
    expect(res1.status).toBe(200);

    const output = res1.body.parameter as ParametersParameter[];
    const plan = output.find((p) => p.name === 'explain')?.valueString;
    expect(plan).toContain(project.id);
    expect(plan).toContain(linkedProject.id);
  });
});
