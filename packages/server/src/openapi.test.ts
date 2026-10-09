// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from './app';
import { loadTestConfig } from './config/loader';

const app = express();

describe('OpenAPI', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Get /openapi.json', async () => {
    const res = await request(app).get('/openapi.json');
    expect(res).toHaveStatus(200);
    expect(res.body.openapi).toBeDefined();
    expect(res.body.info).toBeDefined();

    const patient = res.body.components.schemas.Patient;
    expect(patient).toBeDefined();
    expect(patient.properties.id).toBeDefined();
    expect(patient.properties.language).toBeDefined();
    expect(patient.properties._language).toBeUndefined();
  });

  test('Conditional create and update', async () => {
    const res = await request(app).get('/openapi.json');
    expect(res).toHaveStatus(200);

    const create = res.body.paths['/fhir/R4/{resourceType}'].post;
    expect(create.parameters).toContainEqual(expect.objectContaining({ name: 'If-None-Exist', in: 'header' }));
    expect(Object.keys(create.responses)).toEqual(expect.arrayContaining(['200', '201', '412']));

    const conditionalUpdate = res.body.paths['/fhir/R4/{resourceType}'].put;
    expect(conditionalUpdate.operationId).toBe('conditionalUpdate');
    expect(Object.keys(conditionalUpdate.responses)).toEqual(expect.arrayContaining(['200', '201', '412']));

    expect(res.body.paths['/fhir/R4'].post.operationId).toBe('batch');
    expect(res.body.paths['/fhir/R4/{resourceType}/$validate'].post.operationId).toBe('validateResource');

    const resourceTypeParam = res.body.components.parameters.resourceType;
    expect(resourceTypeParam.schema.enum).toContain('Patient');
    expect(resourceTypeParam.schema.enum).not.toContain('HumanName');
  });

  test('Security schemes', async () => {
    const res = await request(app).get('/openapi.json');
    expect(res).toHaveStatus(200);

    const oauth2 = res.body.components.securitySchemes.OAuth2;
    expect(oauth2.type).toBe('oauth2');
    expect(oauth2.flows.authorizationCode.authorizationUrl).toMatch(/\/oauth2\/authorize$/);
    expect(oauth2.flows.clientCredentials.tokenUrl).toMatch(/\/oauth2\/token$/);
    expect(oauth2.flows.authorizationCode.scopes['patient/*.rs']).toBeDefined();

    // Each scheme is a separate alternative
    expect(res.body.security).toContainEqual({ BearerAuth: [] });
    expect(res.body.security).toContainEqual({ OAuth2: [] });
  });
});
