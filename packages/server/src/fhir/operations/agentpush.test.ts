import {
  AgentTransmitRequest,
  AgentTransmitResponse,
  allOk,
  ContentType,
  getReferenceString,
  sleep,
} from '@medplum/core';
import {
  Agent,
  AsyncJob,
  Device,
  OperationOutcome,
  OperationOutcomeIssue,
  Parameters,
  ParametersParameter,
} from '@medplum/fhirtypes';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config';
import { getRedis } from '../../redis';
import { initTestAuth, waitForAsyncJob } from '../../test.setup';
import { AgentPushParameters } from './agentpush';
import { cleanupMockAgents, configMockAgents, mockAgentResponse } from './utils/agenttestutils';

describe('Agent Push', () => {
  const app = express();
  let accessToken: string;
  let agent: Agent;
  let device: Device;
  let server: Server;
  let port: number;

  beforeAll(async () => {
    const config = await loadTestConfig();
    server = await initApp(app, config);
    accessToken = await initTestAuth();

    await new Promise<void>((resolve) => {
      server.listen(0, 'localhost', 511, () => {
        port = (server.address() as AddressInfo).port;
        resolve();
      });
    });
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

    configMockAgents(port);
  });

  afterAll(async () => {
    cleanupMockAgents();
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

  test('Invalid wait timeout', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Agent/${agent.id}/$push`)
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        contentType: ContentType.TEXT,
        body: 'input',
        destination: getReferenceString(device),
        waitTimeout: 60 * 60 * 1000,
      });
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toEqual('Invalid wait timeout');
  });

  test('Ping -- Successful ping to IP', async () => {
    const redis = getRedis();
    const publishSpy = jest.spyOn(redis, 'publish');

    let resolve!: (value: request.Response) => void | PromiseLike<void>;
    let reject!: (err: Error) => void;

    const deferredResponse = new Promise<request.Response>((_resolve, _reject) => {
      resolve = _resolve;
      reject = _reject;
    });

    request(app)
      .post(`/fhir/R4/Agent/${agent.id}/$push`)
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        contentType: ContentType.PING,
        body: 'PING',
        destination: '8.8.8.8',
        waitForResponse: true,
      } satisfies AgentPushParameters)
      .then(resolve)
      .catch(reject);

    let shouldThrow = false;
    const timer = setTimeout(() => {
      shouldThrow = true;
    }, 3500);

    while (!publishSpy.mock.lastCall) {
      if (shouldThrow) {
        throw new Error('Timeout');
      }
      await sleep(50);
    }
    clearTimeout(timer);

    const transmitRequestStr = publishSpy.mock.lastCall?.[1]?.toString() as string;
    expect(transmitRequestStr).toBeDefined();
    const transmitRequest = JSON.parse(transmitRequestStr) as AgentTransmitRequest;

    await getRedis().publish(
      transmitRequest.callback as string,
      JSON.stringify({
        ...transmitRequest,
        type: 'agent:transmit:response',
        statusCode: 200,
        contentType: ContentType.TEXT,
        body: `
PING 8.8.8.8 (8.8.8.8): 56 data bytes
64 bytes from 8.8.8.8: icmp_seq=0 ttl=115 time=10.316 ms
        
--- 8.8.8.8 ping statistics ---
1 packets transmitted, 1 packets received, 0.0% packet loss
round-trip min/avg/max/stddev = 10.316/10.316/10.316/nan ms`,
      } satisfies AgentTransmitResponse)
    );

    const res = await deferredResponse;
    expect(res.status).toEqual(200);
    expect(res.text).toEqual(expect.stringMatching(/ping statistics/i));

    publishSpy.mockRestore();
  });

  test('Ping -- Successful ping to hostname', async () => {
    const redis = getRedis();
    const publishSpy = jest.spyOn(redis, 'publish');

    let resolve!: (value: request.Response) => void | PromiseLike<void>;
    let reject!: (err: Error) => void;

    const deferredResponse = new Promise<request.Response>((_resolve, _reject) => {
      resolve = _resolve;
      reject = _reject;
    });

    request(app)
      .post(`/fhir/R4/Agent/${agent.id}/$push`)
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        contentType: ContentType.PING,
        body: 'PING',
        destination: 'localhost',
        waitForResponse: true,
      } satisfies AgentPushParameters)
      .then(resolve)
      .catch(reject);

    let shouldThrow = false;
    const timer = setTimeout(() => {
      shouldThrow = true;
    }, 3500);

    while (!publishSpy.mock.lastCall) {
      if (shouldThrow) {
        throw new Error('Timeout');
      }
      await sleep(50);
    }
    clearTimeout(timer);

    const transmitRequestStr = publishSpy.mock.lastCall?.[1]?.toString() as string;
    expect(transmitRequestStr).toBeDefined();
    const transmitRequest = JSON.parse(transmitRequestStr) as AgentTransmitRequest;

    await getRedis().publish(
      transmitRequest.callback as string,
      JSON.stringify({
        ...transmitRequest,
        type: 'agent:transmit:response',
        statusCode: 200,
        contentType: ContentType.TEXT,
        body: `
PING localhost (127.0.0.1): 56 data bytes
64 bytes from 127.0.0.1: icmp_seq=0 ttl=64 time=0.081 ms
        
--- localhost ping statistics ---
1 packets transmitted, 1 packets received, 0.0% packet loss
round-trip min/avg/max/stddev = 0.081/0.081/0.081/nan ms`,
      } satisfies AgentTransmitResponse)
    );

    const res = await deferredResponse;
    expect(res.status).toEqual(200);
    expect(res.text).toEqual(expect.stringMatching(/ping statistics/i));

    publishSpy.mockRestore();
  });

  test('Ping -- Error', async () => {
    const redis = getRedis();
    const publishSpy = jest.spyOn(redis, 'publish');

    let resolve!: (value: request.Response) => void | PromiseLike<void>;
    let reject!: (err: Error) => void;

    const deferredResponse = new Promise<request.Response>((_resolve, _reject) => {
      resolve = _resolve;
      reject = _reject;
    });

    request(app)
      .post(`/fhir/R4/Agent/${agent.id}/$push`)
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        contentType: ContentType.PING,
        body: 'PING',
        destination: '8.8.8.8',
        waitForResponse: true,
      } satisfies AgentPushParameters)
      .then(resolve)
      .catch(reject);

    let shouldThrow = false;
    const timer = setTimeout(() => {
      shouldThrow = true;
    }, 3500);

    while (!publishSpy.mock.lastCall) {
      if (shouldThrow) {
        throw new Error('Timeout');
      }
      await sleep(50);
    }
    clearTimeout(timer);

    const transmitRequestStr = publishSpy.mock.lastCall?.[1]?.toString() as string;
    expect(transmitRequestStr).toBeDefined();
    const transmitRequest = JSON.parse(transmitRequestStr) as AgentTransmitRequest;

    await getRedis().publish(
      transmitRequest.callback as string,
      JSON.stringify({
        ...transmitRequest,
        type: 'agent:transmit:response',
        statusCode: 400,
        contentType: ContentType.TEXT,
        body: 'Error: Unable to ping "8.8.8.8"',
      } satisfies AgentTransmitResponse)
    );

    const res = await deferredResponse;
    expect(res.status).toEqual(400);

    const body = res.body as OperationOutcome;
    expect(body).toBeDefined();
    expect(body.issue[0].severity).toEqual('error');
    expect(body.issue[0]?.details?.text).toEqual(expect.stringContaining('Error: Unable to ping "8.8.8.8"'));

    publishSpy.mockRestore();
  });

  test('Prefer: respond-async', async () => {
    const redis = getRedis();
    const publishSpy = jest.spyOn(redis, 'publish');

    let resolve!: (value: request.Response) => void | PromiseLike<void>;
    let reject!: (err: Error) => void;

    const deferredResponse = new Promise<request.Response>((_resolve, _reject) => {
      resolve = _resolve;
      reject = _reject;
    });

    request(app)
      .post(`/fhir/R4/Agent/${agent.id}/$push`)
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Prefer', 'respond-async')
      .send({
        contentType: ContentType.PING,
        body: 'PING',
        destination: '8.8.8.8',
        waitForResponse: true,
      } satisfies AgentPushParameters)
      .then(resolve)
      .catch(reject);

    let shouldThrow = false;
    const timer = setTimeout(() => {
      shouldThrow = true;
    }, 3500);

    while (!publishSpy.mock.lastCall) {
      if (shouldThrow) {
        throw new Error('Timeout');
      }
      await sleep(50);
    }
    clearTimeout(timer);

    const transmitRequestStr = publishSpy.mock.lastCall?.[1]?.toString() as string;
    expect(transmitRequestStr).toBeDefined();
    const transmitRequest = JSON.parse(transmitRequestStr) as AgentTransmitRequest;

    await getRedis().publish(
      transmitRequest.callback as string,
      JSON.stringify({
        ...transmitRequest,
        type: 'agent:transmit:response',
        statusCode: 200,
        contentType: ContentType.TEXT,
        body: `
  PING 8.8.8.8 (8.8.8.8): 56 data bytes
  64 bytes from 8.8.8.8: icmp_seq=0 ttl=115 time=10.316 ms

  --- 8.8.8.8 ping statistics ---
  1 packets transmitted, 1 packets received, 0.0% packet loss
  round-trip min/avg/max/stddev = 10.316/10.316/10.316/nan ms`,
      } satisfies AgentTransmitResponse)
    );

    const res = await deferredResponse;

    expect(res.status).toEqual(202);
    expect(res.headers['content-location']).toBeDefined();
    const asyncJob = await waitForAsyncJob(res.headers['content-location'], app, accessToken);
    expect(asyncJob).toMatchObject<Partial<AsyncJob>>({
      resourceType: 'AsyncJob',
      status: 'completed',
      request: expect.stringContaining('$push'),
      output: expect.objectContaining<Parameters>({
        resourceType: 'Parameters',
        parameter: expect.arrayContaining<ParametersParameter>([
          expect.objectContaining<ParametersParameter>({
            name: 'outcome',
            resource: expect.objectContaining(allOk),
          }),
          expect.objectContaining<ParametersParameter>({
            name: 'responseBody',
            valueString: expect.stringMatching(/ping statistics/i),
          }),
        ]),
      }),
    });

    publishSpy.mockRestore();
  });

  test('Agent/$push when Agent.status off -- should fail', async () => {
    // Create an agent with status = 'off'
    const res1 = await request(app)
      .post('/fhir/R4/Agent')
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Agent',
        identifier: [{ system: 'https://example.com/agent', value: randomUUID() }],
        name: 'Test Agent',
        status: 'off',
      } satisfies Agent);
    expect(res1.status).toBe(201);

    const agent = res1.body as Agent;

    const { cleanup } = await mockAgentResponse<AgentTransmitRequest, AgentTransmitResponse>(
      agent,
      accessToken,
      'agent:transmit:request',
      { type: 'agent:transmit:response', remote: '8.8.8.8', contentType: ContentType.PING, body: 'PING' }
    );

    const hl7Text =
      'MSH|^~\\&|Main_HIS|XYZ_HOSPITAL|iFW|ABC_Lab|20160915003015||ACK|9B38584D|P|2.6.1|\r' +
      'MSA|AA|9B38584D|Everything was okay dokay!|';

    const res = await request(app)
      .post(`/fhir/R4/Agent/${agent.id as string}/$push`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        contentType: ContentType.HL7_V2,
        body: hl7Text,
        destination: getReferenceString(device),
        waitForResponse: true,
      } satisfies AgentPushParameters);

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject<Partial<OperationOutcome>>({
      resourceType: 'OperationOutcome',
      issue: expect.arrayContaining([
        expect.objectContaining<OperationOutcomeIssue>({
          severity: 'error',
          code: 'invalid',
          details: {
            text: expect.stringContaining("Agent is currently disabled. Agent.status is 'off'"),
          },
        }),
      ]),
    });

    cleanup();
  });

  test('Ping from agent when Agent.status off -- should succeed', async () => {
    // Create an agent with status = 'off'
    const res1 = await request(app)
      .post('/fhir/R4/Agent')
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Agent',
        identifier: [{ system: 'https://example.com/agent', value: randomUUID() }],
        name: 'Test Agent',
        status: 'off',
      } satisfies Agent);
    expect(res1.status).toBe(201);

    const agent = res1.body as Agent;

    const { cleanup } = await mockAgentResponse<AgentTransmitRequest, AgentTransmitResponse>(
      agent,
      accessToken,
      'agent:transmit:request',
      {
        type: 'agent:transmit:response',
        remote: '8.8.8.8',
        contentType: ContentType.TEXT,
        body: 'insert ping statistics here',
      }
    );

    const res = await request(app)
      .post(`/fhir/R4/Agent/${agent.id as string}/$push`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        contentType: ContentType.PING,
        body: 'PING',
        destination: '8.8.8.8',
        waitForResponse: true,
      } satisfies AgentPushParameters);

    expect(res.status).toEqual(200);
    expect(res.text).toEqual(expect.stringMatching(/ping statistics/i));

    cleanup();
  });
});
