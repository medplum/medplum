import { ContentType } from '@medplum/core';
import { Agent, Bundle, BundleEntry, Parameters, ParametersParameter } from '@medplum/fhirtypes';
import express from 'express';
import { randomUUID } from 'node:crypto';
import request, { Response } from 'supertest';
import { AgentConnectionState } from '../../agent/utils';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config';
import { getRedis } from '../../redis';
import { initTestAuth } from '../../test.setup';

const NUM_AGENTS = 4;

const app = express();
let accessToken: string;
let agents: Agent[];

describe('Agent/$bulk-status', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    accessToken = await initTestAuth();
    agents = [];

    const promises = Array.from({ length: NUM_AGENTS }) as Promise<Response>[];
    for (let i = 0; i < NUM_AGENTS; i++) {
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
    for (let i = 0; i < NUM_AGENTS; i++) {
      expect(responses[i].status).toBe(201);
      agents[i] = responses[i].body;
    }
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Get all agent statuses', async () => {
    const res1 = await request(app)
      .get('/fhir/R4/Agent/$bulk-status')
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res1.status).toBe(200);

    const bundle1 = res1.body as Bundle<Parameters>;
    expect(bundle1.resourceType).toBe('Bundle');
    expect(bundle1.entry).toHaveLength(4);

    for (const entry of bundle1.entry as BundleEntry<Parameters>[]) {
      const parameters = entry.resource as Parameters;
      expect(parameters).toBeDefined();
      expect(parameters.resourceType).toEqual('Parameters');
      expect([2, 3]).toContain(parameters.parameter?.length);
      expect(parameters.parameter?.find((param) => param.name === 'status')?.valueCode).toEqual(
        AgentConnectionState.UNKNOWN
      );
      expect(parameters.parameter?.find((param) => param.name === 'version')?.valueString).toEqual('unknown');
    }

    // Emulate a connection
    await getRedis().set(
      `medplum:agent:${agents[0].id}:info`,
      JSON.stringify({
        status: AgentConnectionState.CONNECTED,
        version: '3.1.4',
        lastUpdated: new Date().toISOString(),
      }),
      'EX',
      60
    );

    // Emulate a connection
    await getRedis().set(
      `medplum:agent:${agents[3].id}:info`,
      JSON.stringify({
        status: AgentConnectionState.DISCONNECTED,
        version: '3.1.2',
        lastUpdated: new Date().toISOString(),
      }),
      'EX',
      60
    );

    const res2 = await request(app)
      .get('/fhir/R4/Agent/$bulk-status')
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res2.status).toBe(200);

    const bundle2 = res2.body as Bundle<Parameters>;
    expect(bundle2.resourceType).toBe('Bundle');
    expect(bundle2.entry).toHaveLength(4);

    const bundle2Entries = bundle2.entry as BundleEntry<Parameters>[];
    for (let i = 0; i < NUM_AGENTS; i++) {
      const parameters = bundle2Entries[i].resource as Parameters;
      expect(parameters).toBeDefined();
      expect(parameters.resourceType).toEqual('Parameters');
      expect([2, 3]).toContain(parameters.parameter?.length);
    }

    expect(bundle2Entries).toContainEqual({
      resource: expect.objectContaining<Parameters>({
        resourceType: 'Parameters',
        parameter: expect.arrayContaining<ParametersParameter>([
          expect.objectContaining<ParametersParameter>({
            name: 'status',
            valueCode: AgentConnectionState.CONNECTED,
          }),
          expect.objectContaining<ParametersParameter>({
            name: 'version',
            valueString: '3.1.4',
          }),
          expect.objectContaining<ParametersParameter>({
            name: 'lastUpdated',
            valueInstant: expect.any(String),
          }),
        ]),
      }),
    });

    expect(bundle2Entries).toContainEqual({
      resource: expect.objectContaining<Parameters>({
        resourceType: 'Parameters',
        parameter: expect.arrayContaining<ParametersParameter>([
          expect.objectContaining<ParametersParameter>({
            name: 'status',
            valueCode: AgentConnectionState.DISCONNECTED,
          }),
          expect.objectContaining<ParametersParameter>({
            name: 'version',
            valueString: '3.1.2',
          }),
          expect.objectContaining<ParametersParameter>({
            name: 'lastUpdated',
            valueInstant: expect.any(String),
          }),
        ]),
      }),
    });

    expect(bundle2Entries).toContainEqual({
      resource: expect.objectContaining<Parameters>({
        resourceType: 'Parameters',
        parameter: expect.arrayContaining<ParametersParameter>([
          expect.objectContaining<ParametersParameter>({
            name: 'status',
            valueCode: AgentConnectionState.UNKNOWN,
          }),
          expect.objectContaining<ParametersParameter>({
            name: 'version',
            valueString: 'unknown',
          }),
        ]),
      }),
    });
  });
});
