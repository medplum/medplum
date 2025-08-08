// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType } from '@medplum/core';
import { ClientApplication, Parameters } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { createTestProject } from '../../test.setup';

describe('ClientApplication $rotate-secret', () => {
  const app = express();

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Secret can be changed directly', async () => {
    const { client, accessToken } = await createTestProject({
      withAccessToken: true,
      withClient: true,
      membership: { admin: true },
    });

    const res = await request(app)
      .put(`/fhir/R4/ClientApplication/${client.id}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({ ...client, secret: 'foo' } satisfies ClientApplication);
    expect(res.status).toBe(200);
    const updated = res.body as ClientApplication;
    expect(updated.secret).toEqual('foo');
  });

  test('Secret is changed to new value', async () => {
    const { client, accessToken } = await createTestProject({
      withAccessToken: true,
      withClient: true,
      membership: { admin: true },
    });

    const res = await request(app)
      .post(`/fhir/R4/ClientApplication/${client.id}/$rotate-secret`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'secret', valueString: client.secret }],
      } satisfies Parameters);
    expect(res.status).toBe(200);
    const updated = res.body as ClientApplication;
    expect(updated.secret).toBeDefined();
    expect(updated.secret).not.toStrictEqual(client.secret);
    expect(updated.retiringSecret).toStrictEqual(client.secret);
  });

  test('Secret parameter must match existing', async () => {
    const { client, accessToken } = await createTestProject({
      withAccessToken: true,
      withClient: true,
      membership: { admin: true },
    });

    const res = await request(app)
      .post(`/fhir/R4/ClientApplication/${client.id}/$rotate-secret`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'secret', valueString: 'incorrect' }],
      } satisfies Parameters);
    expect(res.status).toBe(400);
    expect(res.body.issue?.[0]?.code).toStrictEqual('invalid');
  });

  test('Remove retired secret', async () => {
    const { client, accessToken } = await createTestProject({
      withAccessToken: true,
      withClient: true,
      membership: { admin: true },
    });

    const res = await request(app)
      .post(`/fhir/R4/ClientApplication/${client.id}/$rotate-secret`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'secret', valueString: client.secret }],
      } satisfies Parameters);
    expect(res.status).toBe(200);
    const updated = res.body as ClientApplication;
    expect(updated.secret).toBeDefined();
    expect(updated.secret).not.toStrictEqual(client.secret);
    expect(updated.retiringSecret).toStrictEqual(client.secret);

    const res2 = await request(app)
      .post(`/fhir/R4/ClientApplication/${client.id}/$rotate-secret`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'retiringSecret', valueString: updated.retiringSecret }],
      } satisfies Parameters);
    expect(res2.status).toBe(200);
    const retired = res2.body as ClientApplication;
    expect(retired.secret).toStrictEqual(updated.secret);
    expect(retired.retiringSecret).toBeUndefined();
  });

  test('Access denied for non-admin user', async () => {
    const { client, accessToken } = await createTestProject({
      withAccessToken: true,
      withClient: true,
    });

    const res = await request(app)
      .post(`/fhir/R4/ClientApplication/${client.id}/$rotate-secret`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'secret', valueString: client.secret }],
      } satisfies Parameters);
    expect(res.status).toBe(403);
    expect(res.body.issue?.[0]?.code).toStrictEqual('forbidden');
  });

  test('Secret must be provided', async () => {
    const { client, accessToken } = await createTestProject({
      withAccessToken: true,
      withClient: true,
      membership: { admin: true },
    });

    const res = await request(app)
      .post(`/fhir/R4/ClientApplication/${client.id}/$rotate-secret`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({
        resourceType: 'Parameters',
        parameter: [],
      } satisfies Parameters);
    expect(res.status).toBe(400);
    expect(res.body.issue?.[0]?.code).toStrictEqual('invalid');
  });

  test('Only one secret can be provided', async () => {
    const { client, accessToken } = await createTestProject({
      withAccessToken: true,
      withClient: true,
      membership: { admin: true },
    });

    const res = await request(app)
      .post(`/fhir/R4/ClientApplication/${client.id}/$rotate-secret`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'secret', valueString: client.secret },
          { name: 'retiringSecret', valueString: client.secret },
        ],
      } satisfies Parameters);
    expect(res.status).toBe(400);
    expect(res.body.issue?.[0]?.code).toStrictEqual('invalid');
  });
});
