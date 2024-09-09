import { ContentType } from '@medplum/core';
import {
  Agent,
  Bundle,
  BundleEntry,
  OperationOutcome,
  OperationOutcomeIssue,
  Parameters,
  ParametersParameter,
} from '@medplum/fhirtypes';
import express from 'express';
import { randomUUID } from 'node:crypto';
import request, { Response } from 'supertest';
import { AgentConnectionState, AgentInfo } from '../../agent/utils';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config';
import { getRedis } from '../../redis';
import { initTestAuth } from '../../test.setup';
import { expectBundleToContainOutcome } from './utils/agenttestutils';
import { MAX_AGENTS_PER_PAGE } from './utils/agentutils';

const NUM_DEFAULT_AGENTS = 2;

describe('Agent/$bulk-status', () => {
  const app = express();
  let accessToken: string;
  const agents: Agent[] = [];
  let connectedAgent: Agent;
  let disabledAgent: Agent;

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

    const agent1Res = await request(app)
      .post('/fhir/R4/Agent')
      .set('Authorization', 'Bearer ' + accessToken)
      .type('json')
      .send({
        identifier: [{ system: 'https://example.com/agent', value: randomUUID() }],
        resourceType: 'Agent',
        name: 'Medplum Agent',
        status: 'active',
      } satisfies Agent);
    expect(agent1Res.status).toEqual(201);

    const agent2Res = await request(app)
      .post('/fhir/R4/Agent')
      .set('Authorization', 'Bearer ' + accessToken)
      .type('json')
      .send({
        identifier: [{ system: 'https://example.com/agent', value: randomUUID() }],
        resourceType: 'Agent',
        name: 'Old Medplum Agent',
        status: 'off',
      } satisfies Agent);
    expect(agent2Res.status).toEqual(201);

    connectedAgent = agent1Res.body;
    disabledAgent = agent2Res.body;

    // Emulate a connection
    await getRedis().set(
      `medplum:agent:${connectedAgent.id}:info`,
      JSON.stringify({
        status: AgentConnectionState.CONNECTED,
        version: '3.1.4',
        lastUpdated: new Date().toISOString(),
      }),
      'EX',
      60
    );

    // Emulate a disconnected agent
    await getRedis().set(
      `medplum:agent:${disabledAgent.id}:info`,
      JSON.stringify({
        status: AgentConnectionState.DISCONNECTED,
        version: '3.1.2',
        lastUpdated: new Date().toISOString(),
      }),
      'EX',
      60
    );
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Get all agent statuses', async () => {
    const res = await request(app)
      .get('/fhir/R4/Agent/$bulk-status')
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);

    const bundle = res.body as Bundle<Parameters>;
    expect(bundle.resourceType).toBe('Bundle');
    expect(bundle.entry).toHaveLength(4);

    const bundleEntries = bundle.entry as BundleEntry<Parameters>[];
    for (const entry of bundleEntries) {
      const parameters = entry.resource as Parameters;
      expect(parameters).toBeDefined();
      expect(parameters.resourceType).toEqual('Parameters');
      expect(parameters.parameter?.length).toEqual(2);
    }

    expectBundleToContainStatusEntry(bundle, connectedAgent, {
      status: AgentConnectionState.CONNECTED,
      version: '3.1.4',
      lastUpdated: expect.any(String),
    });

    expectBundleToContainStatusEntry(bundle, disabledAgent, {
      status: AgentConnectionState.DISCONNECTED,
      version: '3.1.2',
      lastUpdated: expect.any(String),
    });

    expectBundleToContainStatusEntry(bundle, agents[0], {
      status: AgentConnectionState.UNKNOWN,
      version: 'unknown',
    });
  });

  test('Get agent statuses for agent with name containing Medplum', async () => {
    const res = await request(app)
      .get('/fhir/R4/Agent/$bulk-status')
      .query({ 'name:contains': 'Medplum' })
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);

    const bundle = res.body as Bundle<Parameters>;
    expect(bundle.resourceType).toBe('Bundle');
    expect(bundle.entry).toHaveLength(2);

    const bundleEntries = bundle.entry as BundleEntry<Parameters>[];
    for (let i = 0; i < 2; i++) {
      const parameters = bundleEntries[i].resource as Parameters;
      expect(parameters).toBeDefined();
      expect(parameters.resourceType).toEqual('Parameters');
      expect(parameters.parameter?.length).toEqual(2);
    }

    expectBundleToContainStatusEntry(bundle, connectedAgent, {
      status: AgentConnectionState.CONNECTED,
      version: '3.1.4',
      lastUpdated: expect.any(String),
    });

    expectBundleToContainStatusEntry(bundle, disabledAgent, {
      status: AgentConnectionState.DISCONNECTED,
      version: '3.1.2',
      lastUpdated: expect.any(String),
    });
  });

  test('Get agent statuses for ACTIVE agents with name containing Medplum', async () => {
    const res = await request(app)
      .get('/fhir/R4/Agent/$bulk-status')
      .query({ 'name:contains': 'Medplum', status: 'active' })
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);

    const bundle = res.body as Bundle<Parameters>;
    expect(bundle.resourceType).toBe('Bundle');
    expect(bundle.entry).toHaveLength(1);

    const bundleEntries = bundle.entry as BundleEntry<Parameters>[];
    for (let i = 0; i < 1; i++) {
      const parameters = bundleEntries[i].resource as Parameters;
      expect(parameters).toBeDefined();
      expect(parameters.resourceType).toEqual('Parameters');
      expect(parameters.parameter?.length).toEqual(2);
    }

    expectBundleToContainStatusEntry(bundle, connectedAgent, {
      status: AgentConnectionState.CONNECTED,
      version: '3.1.4',
      lastUpdated: expect.any(String),
    });
  });

  test('Get agent statuses -- no matching agents', async () => {
    const res = await request(app)
      .get('/fhir/R4/Agent/$bulk-status')
      .query({ name: 'INVALID_AGENT', status: 'active' })
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(400);

    expect(res.body).toMatchObject<OperationOutcome>({
      resourceType: 'OperationOutcome',
      issue: expect.arrayContaining<OperationOutcomeIssue>([
        expect.objectContaining<OperationOutcomeIssue>({ severity: 'error', code: 'invalid' }),
      ]),
    });
  });

  test('Get agent statuses -- invalid AgentInfo from Redis', async () => {
    await getRedis().set(
      `medplum:agent:${agents[1].id as string}:info`,
      JSON.stringify({
        version: '3.1.4',
        lastUpdated: new Date().toISOString(),
      }),
      'EX',
      60
    );

    const res = await request(app)
      .get('/fhir/R4/Agent/$bulk-status')
      .query({ name: 'Test Agent 2' })
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);

    const bundle = res.body as Bundle<Parameters>;
    expect(bundle.resourceType).toBe('Bundle');
    expect(bundle.entry).toHaveLength(1);

    expectBundleToContainOutcome(bundle, agents[1], {
      issue: [expect.objectContaining({ severity: 'error', code: 'exception' })],
    });

    await getRedis().set(
      `medplum:agent:${agents[1].id as string}:info`,
      JSON.stringify({
        status: AgentConnectionState.UNKNOWN,
        version: 'unknown',
        lastUpdated: new Date().toISOString(),
      } satisfies AgentInfo),
      'EX',
      60
    );
  });

  test('Get agent statuses -- `_count` exceeding max page size', async () => {
    const res = await request(app)
      .get('/fhir/R4/Agent/$bulk-status')
      .query({ 'name:contains': 'Medplum', _count: MAX_AGENTS_PER_PAGE + 1 })
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(400);

    expect(res.body).toMatchObject<OperationOutcome>({
      resourceType: 'OperationOutcome',
      issue: expect.arrayContaining<OperationOutcomeIssue>([
        expect.objectContaining<OperationOutcomeIssue>({ severity: 'error', code: 'invalid' }),
      ]),
    });
  });
});

function expectBundleToContainStatusEntry(bundle: Bundle<Parameters>, agent: Agent, info: AgentInfo): void {
  const entries = bundle.entry as BundleEntry<Parameters>[];
  expect(entries).toContainEqual({
    resource: expect.objectContaining<Parameters>({
      resourceType: 'Parameters',
      parameter: expect.arrayContaining<ParametersParameter>([
        expect.objectContaining<ParametersParameter>({
          name: 'agent',
          resource: expect.objectContaining<Agent>(agent),
        }),
        expect.objectContaining<ParametersParameter>({
          name: 'result',
          resource: expect.objectContaining<Parameters>({
            resourceType: 'Parameters',
            parameter: expect.arrayContaining<ParametersParameter>([
              expect.objectContaining<ParametersParameter>({
                name: 'status',
                valueCode: info.status,
              }),
              expect.objectContaining<ParametersParameter>({
                name: 'version',
                valueString: info.version,
              }),
              ...(info.lastUpdated !== undefined
                ? [
                    expect.objectContaining<ParametersParameter>({
                      name: 'lastUpdated',
                      valueInstant: info.lastUpdated,
                    }),
                  ]
                : []),
            ]),
          }),
        }),
      ]),
    }),
  });
}
