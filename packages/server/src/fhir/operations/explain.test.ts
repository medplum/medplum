// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType, createReference, getReferenceString } from '@medplum/core';
import { Parameters, ParametersParameter } from '@medplum/fhirtypes';
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

  test('Success', async () => {
    const accessToken = await initTestAuth({ project: { superAdmin: true } });

    const res1 = await request(app)
      .post('/fhir/R4/$explain')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'query', valueString: 'Patient?active=true' }],
      } satisfies Parameters);
    expect(res1.status).toBe(200);

    const output = res1.body.parameter as ParametersParameter[];
    expect(output).toStrictEqual(
      expect.arrayContaining<ParametersParameter>([
        { name: 'explain', valueString: expect.stringContaining(`"Plan":`) },
      ])
    );
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
