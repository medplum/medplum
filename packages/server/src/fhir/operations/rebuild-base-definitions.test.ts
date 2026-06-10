// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { ContentType, Operator } from '@medplum/core';
import * as defs from '@medplum/definitions';
import type { Parameters, SearchParameter } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { r4ProjectId } from '../../constants';
import { createTestProject } from '../../test.setup';

jest.mock('@medplum/definitions', () => {
  const orig = jest.requireActual('@medplum/definitions');
  return {
    ...orig,
    readJsonAsync: jest.fn().mockResolvedValue(orig.readJsonAsync),
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

    const url = 'http://hl7.org/fhir/SearchParameter/Patient-deceased';
    const originalParam = await repo.searchOne({
      resourceType: 'SearchParameter',
      filters: [{ code: 'url', operator: Operator.EQUALS, value: url }],
    });
    expect(originalParam?.meta?.lastUpdated).toBeDefined();
    const originalTimestamp = new Date(originalParam?.meta?.lastUpdated as string).getTime();
    expect(originalParam?.meta?.project).toStrictEqual(r4ProjectId);

    jest.mocked(defs).readJsonAsync.mockResolvedValueOnce({
      resourceType: 'Bundle',
      type: 'collection',
      entry: [
        {
          resource: {
            resourceType: 'SearchParameter',
            url,
            name: 'Patient-deceased',
            status: 'active',
            code: 'deceased',
            base: ['Patient'],
            type: 'token',
            description: 'Are they dead?',
          } satisfies SearchParameter,
        },
      ],
    });

    const res = await request(app)
      .post(`/fhir/R4/$rebuild-base-definitions`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'resourceType', valueCode: 'SearchParameter' }],
      } satisfies Parameters);
    expect(res.status).toBe(200);

    const updatedParam = await repo.searchOne({
      resourceType: 'SearchParameter',
      filters: [{ code: 'url', operator: Operator.EQUALS, value: url }],
    });
    expect(updatedParam?.meta?.lastUpdated).toBeDefined();
    expect(updatedParam?.meta?.project).toStrictEqual(r4ProjectId);

    const updatedTimestamp = new Date(updatedParam?.meta?.lastUpdated as string).getTime();
    expect(updatedTimestamp).toBeGreaterThan(originalTimestamp);
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
    expect(jest.mocked(defs).readJsonAsync).toHaveBeenCalledTimes(0);
  });
});
