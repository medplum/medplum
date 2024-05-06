import {
  AgentError,
  AgentReloadConfigRequest,
  AgentReloadConfigResponse,
  AgentTransmitResponse,
  ContentType,
  allOk,
  serverError,
} from '@medplum/core';
import { Agent, Bundle, Parameters } from '@medplum/fhirtypes';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import request, { Response } from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config';
import { initTestAuth } from '../../test.setup';
import {
  MockAgentResponseHandle,
  cleanupMockAgents,
  configMockAgents,
  expectBundleToContainOutcome,
  mockAgentResponse,
} from './utils/agenttestutils';

const NUM_DEFAULT_AGENTS = 2;

describe('Agent/$reload-config', () => {
  const app = express();
  const agents = [] as Agent[];
  let server: Server;
  let port: number;
  let accessToken: string;

  beforeAll(async () => {
    const config = await loadTestConfig();
    server = await initApp(app, config);
    accessToken = await initTestAuth({ membership: { admin: true } });

    await new Promise<void>((resolve) => {
      server.listen(0, 'localhost', 511, () => {
        port = (server.address() as AddressInfo).port;
        resolve();
      });
    });

    const promises = Array.from({ length: NUM_DEFAULT_AGENTS }) as Promise<Response>[];
    for (let i = 0; i < NUM_DEFAULT_AGENTS; i++) {
      promises[i] = request(app)
        .post('/fhir/R4/Agent')
        .set('Content-Type', ContentType.FHIR_JSON)
        .set('Authorization', 'Bearer ' + accessToken)
        .send({
          resourceType: 'Agent',
          identifier: [{ system: 'https://example.com/agent', value: randomUUID() }],
          name: `Test Agent ${i + 1}`,
          status: 'active',
        });
    }

    const responses = await Promise.all(promises);
    for (let i = 0; i < NUM_DEFAULT_AGENTS; i++) {
      expect(responses[i].status).toBe(201);
      agents[i] = responses[i].body;
    }

    configMockAgents(port);
  });

  afterAll(async () => {
    cleanupMockAgents();
    await shutdownApp();
  });

  // We maybe want to disallow calling $reload-config with no criteria?
  // This could unintentionally cause service degradation for busy agents that are not meant to be reloaded
  test('Reload configs for all agents', async () => {
    const handlePromises = [] as Promise<MockAgentResponseHandle>[];
    for (let i = 0; i < agents.length; i++) {
      handlePromises[i] = mockAgentResponse<AgentReloadConfigRequest, AgentReloadConfigResponse>(
        agents[i],
        accessToken,
        'agent:reloadconfig:request',
        { type: 'agent:reloadconfig:response', statusCode: 200 }
      );
    }
    const handles = await Promise.all(handlePromises);

    const res = await request(app)
      .get('/fhir/R4/Agent/$reload-config')
      .set('Authorization', 'Bearer ' + accessToken);

    expect(res.status).toBe(200);
    const bundle = res.body as Bundle<Parameters>;

    for (const agent of agents) {
      expectBundleToContainOutcome(bundle, agent, allOk);
    }

    for (const handle of handles) {
      handle.cleanup();
    }
  });

  test('Reload config for Agent by ID', async () => {
    const { cleanup } = await mockAgentResponse<AgentReloadConfigRequest, AgentReloadConfigResponse>(
      agents[0],
      accessToken,
      'agent:reloadconfig:request',
      { type: 'agent:reloadconfig:response', statusCode: 200 }
    );

    const res = await request(app)
      .get(`/fhir/R4/Agent/${agents[0].id as string}/$reload-config`)
      .set('Authorization', 'Bearer ' + accessToken);

    expect(res.status).toBe(200);
    const bundle = res.body as Bundle<Parameters>;

    expectBundleToContainOutcome(bundle, agents[0], allOk);
    cleanup();
  });

  test('Agent error during reload', async () => {
    const { cleanup } = await mockAgentResponse<AgentReloadConfigRequest, AgentError>(
      agents[0],
      accessToken,
      'agent:reloadconfig:request',
      { type: 'agent:error', body: 'Something is broken' }
    );

    const res = await request(app)
      .get(`/fhir/R4/Agent/${agents[0].id as string}/$reload-config`)
      .set('Authorization', 'Bearer ' + accessToken);

    expect(res.status).toBe(500);
    const bundle = res.body as Bundle<Parameters>;

    expectBundleToContainOutcome(bundle, agents[0], serverError(new Error('Something is broken')));
    cleanup();
  });

  test('Invalid response from agent during reload', async () => {
    const { cleanup } = await mockAgentResponse<AgentReloadConfigRequest, AgentTransmitResponse>(
      agents[0],
      accessToken,
      'agent:reloadconfig:request',
      { type: 'agent:transmit:response', remote: '8.8.8.8', contentType: ContentType.PING, body: 'PING' }
    );

    const res = await request(app)
      .get(`/fhir/R4/Agent/${agents[0].id as string}/$reload-config`)
      .set('Authorization', 'Bearer ' + accessToken);

    expect(res.status).toBe(500);
    const bundle = res.body as Bundle<Parameters>;

    expectBundleToContainOutcome(bundle, agents[0], serverError(new Error('Invalid response received from agent')));
    cleanup();
  });
});
