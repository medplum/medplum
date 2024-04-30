import { AgentReloadConfigRequest, AgentSuccess, ContentType, allOk } from '@medplum/core';
import { Agent, Bundle, Parameters } from '@medplum/fhirtypes';
import express from 'express';
import { randomUUID } from 'node:crypto';
import request, { Response } from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config';
import { initTestAuth } from '../../test.setup';
import { MockAgentResponseHandle, expectBundleToContainOutcome, mockAgentResponse } from './utils/agenttestutils';

const NUM_DEFAULT_AGENTS = 2;

describe('Agent/$reload-config', () => {
  const app = express();
  const agents = [] as Agent[];
  let accessToken: string;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    accessToken = await initTestAuth();

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
  });

  afterAll(async () => {
    await shutdownApp();
  });

  // We maybe want to disallow calling $reload-config with no criteria?
  // This could unintentionally cause service degradation for busy agents that are not meant to be reloaded
  test('Reload configs for all agents', async () => {
    const handlePromises = [] as Promise<MockAgentResponseHandle>[];
    for (let i = 0; i < agents.length; i++) {
      handlePromises[i] = mockAgentResponse<AgentReloadConfigRequest, AgentSuccess>(
        agents[i],
        'agent:reloadconfig:request',
        { type: 'agent:success' }
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
    const { cleanup } = await mockAgentResponse<AgentReloadConfigRequest, AgentSuccess>(
      agents[0],
      'agent:reloadconfig:request',
      { type: 'agent:success' }
    );

    const res = await request(app)
      .get(`/fhir/R4/Agent/${agents[0].id as string}/$reload-config`)
      .set('Authorization', 'Bearer ' + accessToken);

    expect(res.status).toBe(200);
    const bundle = res.body as Bundle<Parameters>;

    expectBundleToContainOutcome(bundle, agents[0], allOk);
    cleanup();
  });
});
