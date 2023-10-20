import { allOk, ContentType, getReferenceString } from '@medplum/core';
import { Agent, Device } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config';
import { initTestAuth } from '../../test.setup';

const app = express();
let accessToken: string;
let agent: Agent;
let device: Device;

describe('Agent Push', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    accessToken = await initTestAuth();

    const res1 = await request(app)
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
            name: 'test',
            endpoint: { reference: 'Endpoint/' + randomUUID() },
            targetReference: { reference: 'Bot/' + randomUUID() },
          },
        ],
      });
    expect(res1.status).toBe(201);
    agent = res1.body as Agent;

    const res2 = await request(app)
      .post(`/fhir/R4/Device`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Device',
        modelNumber: randomUUID(),
        url: 'mllp://192.168.50.10:56001',
      });
    expect(res2.status).toBe(201);
    device = res2.body as Device;
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Submit plain text', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Agent/${agent.id}/$push`)
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        contentType: ContentType.TEXT,
        body: 'input',
        destination: getReferenceString(device),
      });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject(allOk);
  });

  test('Submit FHIR with content type', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Agent/${agent.id}/$push`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        contentType: ContentType.TEXT,
        body: {
          resourceType: 'Patient',
          name: [{ given: ['John'], family: ['Doe'] }],
        },
        destination: getReferenceString(device),
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
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        contentType: ContentType.HL7_V2,
        body: text,
        destination: getReferenceString(device),
      });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject(allOk);
  });

  test('Push by identifier', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Agent/$push?identifier=${agent.identifier?.[0]?.system}|${agent.identifier?.[0]?.value}`)
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        contentType: ContentType.TEXT,
        body: 'input',
        destination: getReferenceString(device),
      });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject(allOk);
  });

  test('Destination by device search', async () => {
    const text =
      'MSH|^~\\&|Main_HIS|XYZ_HOSPITAL|iFW|ABC_Lab|20160915003015||ACK|9B38584D|P|2.6.1|\r' +
      'MSA|AA|9B38584D|Everything was okay dokay!|';

    const res = await request(app)
      .post(`/fhir/R4/Agent/${agent.id}/$push`)
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        contentType: ContentType.HL7_V2,
        body: text,
        destination: 'Device?model=' + device.modelNumber,
      });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject(allOk);
  });

  test('Missing parameters', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Agent/$push`)
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        contentType: ContentType.TEXT,
        body: 'input',
        destination: getReferenceString(device),
      });
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toEqual('Must specify agent ID or identifier');
  });

  test('Missing content type', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Agent/${agent.id}/$push`)
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        body: 'input',
        destination: getReferenceString(device),
      });
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toEqual('Missing contentType parameter');
  });

  test('Missing body', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Agent/${agent.id}/$push`)
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        contentType: ContentType.TEXT,
        destination: getReferenceString(device),
      });
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toEqual('Missing body parameter');
  });

  test('Missing destination', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Agent/${agent.id}/$push`)
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        contentType: ContentType.TEXT,
        body: 'input',
      });
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toEqual('Missing destination parameter');
  });

  test('Unrecognized device string', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Agent/${agent.id}/$push`)
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        contentType: ContentType.TEXT,
        body: 'input',
        destination: 'foo',
      });
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toEqual('Destination device not found');
  });

  test('Destination device not found', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Agent/${agent.id}/$push`)
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        contentType: ContentType.TEXT,
        body: 'input',
        destination: 'Device/' + randomUUID(),
      });
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toEqual('Destination device not found');
  });

  test('Destination device missing URL', async () => {
    // Create a device without a URL
    const res1 = await request(app)
      .post(`/fhir/R4/Device`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ resourceType: 'Device' });
    expect(res1.status).toBe(201);

    const device2 = res1.body as Device;

    const res2 = await request(app)
      .post(`/fhir/R4/Agent/${agent.id}/$push`)
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        contentType: ContentType.TEXT,
        body: 'input',
        destination: getReferenceString(device2),
      });
    expect(res2.status).toBe(400);
    expect(res2.body.issue[0].details.text).toEqual('Destination device missing url');
  });
});
