// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { AgentError, AgentStatsResponse } from '@medplum/core';
import { allOk, LogLevel, sleep } from '@medplum/core';
import type { Agent, Resource } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import type { Client } from 'mock-socket';
import { Server } from 'mock-socket';
import { randomUUID } from 'node:crypto';
import { App } from './app';
import type * as AgentConstants from './constants';

vi.mock('./constants', async (importOriginal) => {
  const actual = await importOriginal<typeof AgentConstants>();
  return {
    ...actual,
  RETRY_WAIT_DURATION_MS: 200,
  };
});

vi.mock('./pid', () => ({
  createPidFile: vi.fn(),
  getPidFilePath: vi.fn(() => 'pid/file/path'),
  waitForPidFile: vi.fn(async () => undefined),
  removePidFile: vi.fn(),
  isAppRunning: vi.fn(() => false),
  forceKillApp: vi.fn(),
}));

describe('Stats Request', () => {
  let medplum: MockClient;
  let originalNodeEnv: string | undefined;

  beforeAll(() => {
    originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'dev';
  });

  afterAll(() => {
    if (originalNodeEnv !== undefined) {
      process.env.NODE_ENV = originalNodeEnv;
    } else {
      delete process.env.NODE_ENV;
    }
  });

  beforeEach(async () => {
    console.log = vi.fn();
    medplum = new MockClient();
    medplum.router.router.add('POST', ':resourceType/:id/$execute', async () => {
      return [allOk, {} as Resource];
    });
  });

  test('should return stats in response to agent:stats:request', async () => {
    const state = {
      mySocket: undefined as Client | undefined,
      connected: false,
      gotStatsResponse: false,
      statsResponse: undefined as unknown as AgentStatsResponse,
    };

    const callback = randomUUID();

    function mockConnectionHandler(socket: Client): void {
      state.mySocket = socket;
      socket.on('message', (data) => {
        const command = JSON.parse((data as Buffer).toString('utf8'));
        switch (command.type) {
          case 'agent:connect:request':
            socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
            state.connected = true;
            break;

          case 'agent:heartbeat:request':
            socket.send(Buffer.from(JSON.stringify({ type: 'agent:heartbeat:response' })));
            break;

          case 'agent:stats:response':
            state.gotStatsResponse = true;
            state.statsResponse = command;
            break;

          default:
            break;
        }
      });
    }

    const mockServer = new Server('wss://example.com/ws/agent');
    mockServer.on('connection', mockConnectionHandler);

    const agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      name: 'Test Agent',
      status: 'active',
    });

    const app = new App(medplum, agent.id, LogLevel.INFO);
    app.heartbeatPeriod = 100;
    await app.start();

    while (!state.mySocket || !state.connected) {
      await sleep(100);
    }

    state.mySocket.send(
      Buffer.from(
        JSON.stringify({
          type: 'agent:stats:request',
          callback,
        })
      )
    );

    let shouldThrow = false;
    const timeout = setTimeout(() => {
      shouldThrow = true;
    }, 2500);

    while (!state.gotStatsResponse) {
      if (shouldThrow) {
        throw new Error('Timeout waiting for stats response');
      }
      await sleep(100);
    }
    clearTimeout(timeout);

    expect(state.gotStatsResponse).toBe(true);
    expect(state.statsResponse.statusCode).toBe(200);
    expect(state.statsResponse.callback).toStrictEqual(callback);
    expect(state.statsResponse.stats).toBeDefined();
    expect(state.statsResponse.stats.webSocketQueueDepth).toStrictEqual(0);
    expect(state.statsResponse.stats.hl7QueueDepth).toStrictEqual(0);
    expect(state.statsResponse.stats.hl7ClientCount).toStrictEqual(0);
    expect(state.statsResponse.stats.live).toBe(true);
    expect(typeof state.statsResponse.stats.outstandingHeartbeats).toBe('number');
    expect(state.statsResponse.stats.channelStats).toStrictEqual({});
    expect(state.statsResponse.stats.clientStats).toStrictEqual({});

    await app.stop();
    await new Promise<void>((resolve) => {
      mockServer.stop(resolve);
    });
  });

  test('should return an error if getStats throws', async () => {
    const state = {
      mySocket: undefined as Client | undefined,
      gotAgentError: false,
      agentError: undefined as unknown as AgentError,
      statsResponse: undefined as unknown as AgentStatsResponse,
    };

    const callback = randomUUID();

    function mockConnectionHandler(socket: Client): void {
      state.mySocket = socket;
      socket.on('message', (data) => {
        const command = JSON.parse((data as Buffer).toString('utf8'));
        switch (command.type) {
          case 'agent:connect:request':
            socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
            break;

          case 'agent:heartbeat:request':
            socket.send(Buffer.from(JSON.stringify({ type: 'agent:heartbeat:response' })));
            break;

          case 'agent:stats:response':
            state.statsResponse = command;
            break;

          case 'agent:error':
            state.gotAgentError = true;
            state.agentError = command;
            break;

          default:
            break;
        }
      });
    }

    const mockServer = new Server('wss://example.com/ws/agent');
    mockServer.on('connection', mockConnectionHandler);

    const agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      name: 'Test Agent',
      status: 'active',
    });

    const app = new App(medplum, agent.id, LogLevel.INFO);
    app.heartbeatPeriod = 100;
    await app.start();

    while (!state.mySocket) {
      await sleep(100);
    }

    const getStatsSpy = vi.spyOn(app, 'getStats').mockImplementation(() => {
      throw new Error('Something bad happened');
    });

    state.mySocket.send(
      Buffer.from(
        JSON.stringify({
          type: 'agent:stats:request',
          callback,
        })
      )
    );

    let shouldThrow = false;
    const timeout = setTimeout(() => {
      shouldThrow = true;
    }, 2500);

    while (!state.gotAgentError) {
      if (state.statsResponse) {
        throw new Error('Unexpected stats response');
      }
      if (shouldThrow) {
        throw new Error('Timeout waiting for error response');
      }
      await sleep(100);
    }
    clearTimeout(timeout);

    expect(state.gotAgentError).toBe(true);
    expect(state.agentError.body).toStrictEqual('Something bad happened');
    expect(state.agentError.callback).toStrictEqual(callback);

    getStatsSpy.mockRestore();
    await app.stop();
    await new Promise<void>((resolve) => {
      mockServer.stop(resolve);
    });
  });
});
