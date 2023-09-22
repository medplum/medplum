import { allOk, ContentType } from '@medplum/core';
import { Agent } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config';
import { initTestAuth } from '../../test.setup';

const app = express();
let accessToken: string;
let agent: Agent;

describe('Agent Push', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    accessToken = await initTestAuth();

    // const cody: Agent = {
    //   resourceType: 'Agent',
    //   identifier: [{ system: 'https://example.com/agent', value: randomUUID() }],
    //   name: 'Test Agent',
    //   status: 'active',
    //   channel: [
    //     {
    //       endpoint: { reference: 'Endpoint/' + randomUUID() },
    //       targetReference: { reference: 'Bot/' + randomUUID() },
    //     },
    //   ],
    // };

    const res = await request(app)
      .post(`/fhir/R4/Agent`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Agent',
        identifier: [{ system: 'https://example.com/agent', value: randomUUID() }],
        name: 'Test Agent',
        status: 'active',
        channel: [
          {
            endpoint: { reference: 'Endpoint/' + randomUUID() },
            targetReference: { reference: 'Bot/' + randomUUID() },
          },
        ],
      });
    expect(res.status).toBe(201);
    agent = res.body as Agent;
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Submit plain text', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Agent/${agent.id}/$push`)
      .set('Content-Type', ContentType.TEXT)
      .set('Authorization', 'Bearer ' + accessToken)
      .send('input');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject(allOk);
  });

  test('Submit FHIR with content type', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Agent/${agent.id}/$push`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Patient',
        name: [{ given: ['John'], family: ['Doe'] }],
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/fhir+json; charset=utf-8');
  });

  test('Submit HL7', async () => {
    const text =
      'MSH|^~\\&|Main_HIS|XYZ_HOSPITAL|iFW|ABC_Lab|20160915003015||ACK|9B38584D|P|2.6.1|\r' +
      'MSA|AA|9B38584D|Everything was okay dokay!|';

    const res = await request(app)
      .post(`/fhir/R4/Agent/${agent.id}/$push`)
      .set('Content-Type', ContentType.HL7_V2)
      .set('Authorization', 'Bearer ' + accessToken)
      .send(text);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject(allOk);
  });

  test('Execute by identifier', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Agent/$push?identifier=${agent.identifier?.[0]?.system}|${agent.identifier?.[0]?.value}`)
      .set('Content-Type', ContentType.TEXT)
      .set('Authorization', 'Bearer ' + accessToken)
      .send('input');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject(allOk);
  });

  test('Missing parameters', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Agent/$push`)
      .set('Content-Type', ContentType.TEXT)
      .set('Authorization', 'Bearer ' + accessToken)
      .send('input');
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toEqual('Must specify agent ID or identifier.');
  });
});
