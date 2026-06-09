// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { ContentType, Operator } from '@medplum/core';
import type { Parameters } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { createTestProject } from '../../test.setup';
import { Repository } from '../repo';
import * as mod from './rebuild-base-definitions';

jest.mock('./rebuild-base-definitions', () => {
  const orig = jest.requireActual('./rebuild-base-definitions');
  return {
    ...orig,
    rebuildBaseDefinitions: jest.fn().mockResolvedValue(undefined),
  };
});

describe('$rebuild-base-definitions', () => {
  const app = express();

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Parses input parameters', async () => {
    const { accessToken, repo } = await createTestProject({
      project: { superAdmin: true },
      withAccessToken: true,
      withRepo: true,
    });

    const url = 'http://hl7.org/fhir/StructureDefinition/Patient';
    const patientDef = await repo.searchOne({
      resourceType: 'StructureDefinition',
      filters: [{ code: 'url', operator: Operator.EQUALS, value: url }],
    });
    expect(patientDef?.meta?.lastUpdated).toBeDefined();

    const res = await request(app)
      .post(`/fhir/R4/$rebuild-base-definitions`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'resourceType', valueCode: 'StructureDefinition' }],
      } satisfies Parameters);
    expect(res.status).toBe(200);

    const mock = jest.mocked(mod).rebuildBaseDefinitions;
    expect(mock).toHaveBeenCalledTimes(1);
    expect(mock).toHaveBeenCalledWith(expect.any(Repository), ['StructureDefinition']);
  });

  test('Operation only available to Super Admins', async () => {
    const { accessToken } = await createTestProject({
      withAccessToken: true,
    });

    const res = await request(app)
      .post(`/fhir/R4/$rebuild-base-definitions`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'resourceType', valueCode: 'StructureDefinition' }],
      } satisfies Parameters);
    expect(res.status).toBe(403);
    expect(jest.mocked(mod).rebuildBaseDefinitions).toHaveBeenCalledTimes(0);
  });
});
