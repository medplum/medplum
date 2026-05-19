// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { AgentStats, AgentStatsRequest, AgentStatsResponse, WithId } from '@medplum/core';
import { ContentType } from '@medplum/core';
import type { Agent, Bundle, BundleEntry, Parameters, ParametersParameter } from '@medplum/fhirtypes';
import express from 'express';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Response } from 'supertest';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { initTestAuth } from '../../test.setup';
import type { MockAgentResponseHandle } from './utils/agenttestutils';
import { cleanupMockAgents, configMockAgents, mockAgentResponse } from './utils/agenttestutils';

const NUM_DEFAULT_AGENTS = 2;

function makeStats(): AgentStats {
  return {
    hl7ConnectionsOpen: 1,
    ping: 5,
    webSocketQueueDepth: 0,
    hl7QueueDepth: 0,
    hl7ClientCount: 0,
    live: true,
    outstandingHeartbeats: 0,
    channelStats: {},
    clientStats: {},
    durableQueue: {
      received: 0,
      sent: 0,
      timedOut: 0,
      error: 0,
      commitAcked: 0,
      appAcked: 0,
      responseQueued: 0,
      responseSent: 0,
      responseTimedOut: 0,
      responseError: 0,
    },
  };
}

describe('Agent/$stats', () => {
  const app = express();
  const agents = [] as WithId<Agent>[];
  let server: Server;
  let port: number;
  let accessToken: string;

  beforeAll(async () => {
    const config = await loadTestConfig();
    server = await initApp(app, config);
    accessToken = await initTestAuth({ membership: { admin: true } });

    await new Promise<void>((resolve) => {
      server.listen(0, 'localhost', 8514, () => {
        port = (server.address() as AddressInfo).port;
        resolve();
      });
    });

    const promises: Promise<Response>[] = Array.from({ length: NUM_DEFAULT_AGENTS });
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

  test('Fetch stats for all agents', async () => {
    const stats = makeStats();
    const handlePromises = [] as Promise<MockAgentResponseHandle>[];
    for (let i = 0; i < agents.length; i++) {
      handlePromises[i] = mockAgentResponse<AgentStatsRequest, AgentStatsResponse>(
        agents[i],
        accessToken,
        'agent:stats:request',
        { type: 'agent:stats:response', statusCode: 200, stats }
      );
    }
    const handles = await Promise.all(handlePromises);

    const res = await request(app)
      .get('/fhir/R4/Agent/$stats')
      .set('Authorization', 'Bearer ' + accessToken);

    expect(res.status).toBe(200);
    const bundle = res.body as Bundle<Parameters>;

    for (const agent of agents) {
      expectBundleToContainStatsEntry(bundle, agent, stats);
    }

    for (const handle of handles) {
      handle.cleanup();
    }
  });

  test('Fetch stats for Agent by ID', async () => {
    const stats = makeStats();
    const { cleanup } = await mockAgentResponse<AgentStatsRequest, AgentStatsResponse>(
      agents[0],
      accessToken,
      'agent:stats:request',
      { type: 'agent:stats:response', statusCode: 200, stats }
    );

    const res = await request(app)
      .get(`/fhir/R4/Agent/${agents[0].id}/$stats`)
      .set('Authorization', 'Bearer ' + accessToken);

    expect(res.status).toBe(200);
    const params = res.body as Parameters;

    expect(params).toMatchObject<Parameters>({
      resourceType: 'Parameters',
      parameter: expect.arrayContaining<ParametersParameter>([
        expect.objectContaining<ParametersParameter>({
          name: 'stats',
          valueString: JSON.stringify(stats),
        }),
      ]),
    });

    cleanup();
  });
});

function expectBundleToContainStatsEntry(bundle: Bundle<Parameters>, agent: Agent, stats: AgentStats): void {
  const entries = bundle.entry as BundleEntry<Parameters>[];
  expect(entries).toContainEqual({
    resource: expect.objectContaining<Parameters>({
      resourceType: 'Parameters',
      parameter: expect.arrayContaining<ParametersParameter>([
        expect.objectContaining<ParametersParameter>({
          name: 'agent',
          resource: expect.objectContaining(agent),
        }),
        expect.objectContaining<ParametersParameter>({
          name: 'result',
          resource: expect.objectContaining<Parameters>({
            resourceType: 'Parameters',
            parameter: expect.arrayContaining<ParametersParameter>([
              expect.objectContaining<ParametersParameter>({
                name: 'stats',
                valueString: JSON.stringify(stats),
              }),
            ]),
          }),
        }),
      ]),
    }),
  });
}
