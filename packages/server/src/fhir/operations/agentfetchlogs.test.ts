// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { AgentLogsRequest, AgentLogsResponse, ContentType, LogMessage, WithId } from '@medplum/core';
import { Agent, Bundle, BundleEntry, Parameters, ParametersParameter } from '@medplum/fhirtypes';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import request, { Response } from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { initTestAuth } from '../../test.setup';
import {
  MockAgentResponseHandle,
  cleanupMockAgents,
  configMockAgents,
  mockAgentResponse,
} from './utils/agenttestutils';

const NUM_DEFAULT_AGENTS = 2;

describe('Agent/$fetch-logs', () => {
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

  test('Fetch logs for all agents', async () => {
    const handlePromises = [] as Promise<MockAgentResponseHandle>[];
    const logs: LogMessage[] = [
      { level: 'INFO', timestamp: new Date().toISOString(), msg: 'Test 1' },
      { level: 'INFO', timestamp: new Date().toISOString(), msg: 'Test 2' },
      {
        level: 'ERROR',
        timestamp: new Date().toISOString(),
        msg: 'An error occurred',
        error: new Error('This is an error').toString(),
      },
    ];
    for (let i = 0; i < agents.length; i++) {
      handlePromises[i] = mockAgentResponse<AgentLogsRequest, AgentLogsResponse>(
        agents[i],
        accessToken,
        'agent:logs:request',
        {
          type: 'agent:logs:response',
          statusCode: 200,
          logs,
        }
      );
    }
    const handles = await Promise.all(handlePromises);

    const res = await request(app)
      .get('/fhir/R4/Agent/$fetch-logs')
      .set('Authorization', 'Bearer ' + accessToken);

    expect(res.status).toBe(200);
    const bundle = res.body as Bundle<Parameters>;

    for (const agent of agents) {
      expectBundleToContainLogsEntry(bundle, agent, logs);
    }

    for (const handle of handles) {
      handle.cleanup();
    }
  });
});

function expectBundleToContainLogsEntry(bundle: Bundle<Parameters>, agent: Agent, logs: LogMessage[]): void {
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
                name: 'logs',
                valueString: logs.map((msg) => JSON.stringify(msg)).join('\n'),
              }),
            ]),
          }),
        }),
      ]),
    }),
  });
}
