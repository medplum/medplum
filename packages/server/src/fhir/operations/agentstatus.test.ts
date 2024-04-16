import { ContentType } from '@medplum/core';
import { Agent, Parameters } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { AgentConnectionState } from '../../agent/utils';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config';
import { getRedis } from '../../redis';
import { initTestAuth } from '../../test.setup';

const app = express();
let accessToken: string;
let agent: Agent;

describe('Agent Status', () => {
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
      });
    expect(res1.status).toBe(201);
    agent = res1.body as Agent;
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Get agent status', async () => {
    const res1 = await request(app)
      .get(`/fhir/R4/Agent/${agent.id}/$status`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res1.status).toBe(200);

    const parameters1 = res1.body as Parameters;
    expect(parameters1.resourceType).toBe('Parameters');
    expect(parameters1.parameter).toHaveLength(2);
    expect(parameters1.parameter?.find((p) => p.name === 'status')?.valueCode).toBe(AgentConnectionState.UNKNOWN);
    expect(parameters1.parameter?.find((p) => p.name === 'version')?.valueString).toBe('unknown');

    // Emulate a connection
    await getRedis().set(
      `medplum:agent:${agent.id}:info`,
      JSON.stringify({
        status: AgentConnectionState.CONNECTED,
        version: '3.1.4',
        lastUpdated: new Date().toISOString(),
      }),
      'EX',
      60
    );

    const res2 = await request(app)
      .get(`/fhir/R4/Agent/${agent.id}/$status`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res2.status).toBe(200);

    const parameters2 = res2.body as Parameters;
    expect(parameters2.resourceType).toBe('Parameters');
    expect(parameters2.parameter).toHaveLength(3);
    expect(parameters2.parameter?.find((p) => p.name === 'status')?.valueCode).toBe(AgentConnectionState.CONNECTED);
    expect(parameters2.parameter?.find((p) => p.name === 'version')?.valueString).toBe('3.1.4');
    expect(parameters2.parameter?.find((p) => p.name === 'lastUpdated')?.valueInstant).toBeTruthy();
  });
});
