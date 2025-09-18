// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { AgentError, AgentLogsRequest, AgentLogsResponse, allOk, LogLevel, sleep } from '@medplum/core';
import { Agent, Resource } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { Client, Server } from 'mock-socket';
import { randomUUID } from 'node:crypto';
import { App } from './app';
import { MAX_LOG_LIMIT } from './constants';
import { createTestWinstonLogger, generateTestLogs } from './test-utils';

jest.mock('./constants', () => ({
  ...jest.requireActual('./constants'),
  RETRY_WAIT_DURATION_MS: 200,
}));

jest.mock('./pid', () => ({
  createPidFile: jest.fn(),
  getPidFilePath: jest.fn(() => 'pid/file/path'),
  waitForPidFile: jest.fn(async () => undefined),
  removePidFile: jest.fn(),
  isAppRunning: jest.fn(() => false),
  forceKillApp: jest.fn(),
}));

describe('Fetch Logs', () => {
  let medplum: MockClient;
  let originalNodeEnv: string | undefined;
  const cleanupFns = [] as (() => void)[];

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

    for (const cleanup of cleanupFns) {
      try {
        cleanup();
      } catch (_err) {
        /* We don't care if cleanup throws, it's best effort */
      }
    }
  });

  beforeEach(async () => {
    console.log = jest.fn();
    medplum = new MockClient();
    medplum.router.router.add('POST', ':resourceType/:id/$execute', async () => {
      return [allOk, {} as Resource];
    });
  });

  test('should send error when logger is not WinstonWrapperLogger', async () => {
    const state = {
      mySocket: undefined as Client | undefined,
      gotAgentError: false,
      errorMessage: undefined as string | undefined,
    };

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

          case 'agent:error':
            state.gotAgentError = true;
            state.errorMessage = command.body;
            break;

          default:
            // Ignore other message types
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

    // Wait for the WebSocket to connect
    while (!state.mySocket) {
      await sleep(100);
    }

    // Send a logs request
    state.mySocket.send(
      Buffer.from(
        JSON.stringify({
          type: 'agent:logs:request',
          callback: randomUUID(),
        } as AgentLogsRequest)
      )
    );

    // Wait for the error response
    let shouldThrow = false;
    const timeout = setTimeout(() => {
      shouldThrow = true;
    }, 2500);

    while (!state.gotAgentError) {
      if (shouldThrow) {
        throw new Error('Timeout waiting for error response');
      }
      await sleep(100);
    }
    clearTimeout(timeout);

    expect(state.gotAgentError).toBe(true);
    expect(state.errorMessage).toBe('Unable to fetch logs since current logger instance does not support fetching');

    await app.stop();
    await new Promise<void>((resolve) => {
      mockServer.stop(resolve);
    });
  });

  test('should successfully fetch logs when logger is WinstonWrapperLogger', async () => {
    const state = {
      mySocket: undefined as Client | undefined,
      gotLogsResponse: false,
      logsResponse: undefined as unknown as AgentLogsResponse,
    };

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

          case 'agent:logs:response':
            state.gotLogsResponse = true;
            state.logsResponse = command;
            break;

          case 'agent:error':
            // We don't expect errors in this test
            break;

          default:
            // Ignore other message types
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

    // Create a Winston logger with some test logs
    const [winstonLogger, cleanupLogFile] = createTestWinstonLogger();
    cleanupFns.push(cleanupLogFile);
    generateTestLogs(winstonLogger, 5);

    const app = new App(medplum, agent.id, LogLevel.INFO, {
      mainLogger: winstonLogger,
    });
    app.heartbeatPeriod = 100;
    await app.start();

    // Wait for the WebSocket to connect
    while (!state.mySocket) {
      await sleep(100);
    }

    // Send a logs request
    state.mySocket.send(
      Buffer.from(
        JSON.stringify({
          type: 'agent:logs:request',
          callback: randomUUID(),
        } as AgentLogsRequest)
      )
    );

    // Wait for the logs response
    let shouldThrow = false;
    const timeout = setTimeout(() => {
      shouldThrow = true;
    }, 2500);

    while (!state.gotLogsResponse) {
      if (shouldThrow) {
        throw new Error('Timeout waiting for logs response');
      }
      await sleep(100);
    }
    clearTimeout(timeout);

    expect(state.gotLogsResponse).toBe(true);
    expect(state.logsResponse.statusCode).toBe(200);
    expect(state.logsResponse.logs).toBeDefined();
    expect(Array.isArray(state.logsResponse.logs)).toBe(true);
    expect(state.logsResponse.logs.length).toBeGreaterThan(5);

    await app.stop();
    await new Promise<void>((resolve) => {
      mockServer.stop(resolve);
    });
  });

  test('should only fetch as many logs as specified when limit is defined', async () => {
    const state = {
      mySocket: undefined as Client | undefined,
      gotLogsResponse: false,
      logsResponse: undefined as unknown as AgentLogsResponse,
    };

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

          case 'agent:logs:response':
            state.gotLogsResponse = true;
            state.logsResponse = command;
            break;

          case 'agent:error':
            // We don't expect errors in this test
            break;

          default:
            // Ignore other message types
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

    // Create a Winston logger with some test logs
    const [winstonLogger, cleanupLogFile] = createTestWinstonLogger();
    cleanupFns.push(cleanupLogFile);
    generateTestLogs(winstonLogger, 15);

    const app = new App(medplum, agent.id, LogLevel.INFO, {
      mainLogger: winstonLogger,
    });
    app.heartbeatPeriod = 100;
    await app.start();

    // Wait for the WebSocket to connect
    while (!state.mySocket) {
      await sleep(100);
    }

    // Send a logs request
    state.mySocket.send(
      Buffer.from(
        JSON.stringify({
          type: 'agent:logs:request',
          limit: 10,
          callback: randomUUID(),
        } as AgentLogsRequest)
      )
    );

    // Wait for the logs response
    let shouldThrow = false;
    const timeout = setTimeout(() => {
      shouldThrow = true;
    }, 2500);

    while (!state.gotLogsResponse) {
      if (shouldThrow) {
        throw new Error('Timeout waiting for logs response');
      }
      await sleep(100);
    }
    clearTimeout(timeout);

    expect(state.gotLogsResponse).toBe(true);
    expect(state.logsResponse.statusCode).toBe(200);
    expect(state.logsResponse.logs).toBeDefined();
    expect(Array.isArray(state.logsResponse.logs)).toBe(true);
    expect(state.logsResponse.logs.length).toStrictEqual(10);

    await app.stop();
    await new Promise<void>((resolve) => {
      mockServer.stop(resolve);
    });
  });

  test.each(['invalid_limit', -1, 200000] as const)(
    'should return an error when sending an invalid limit',
    async (limit) => {
      const state = {
        mySocket: undefined as Client | undefined,
        gotAgentError: false,
        agentError: undefined as unknown as AgentError,
      };

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

            case 'agent:logs:response':
              // We don't a response in this test
              break;

            case 'agent:error':
              state.gotAgentError = true;
              state.agentError = command;
              break;

            default:
              // Ignore other message types
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

      // Create a Winston logger with some test logs
      const [winstonLogger, cleanupLogFile] = createTestWinstonLogger();
      cleanupFns.push(cleanupLogFile);
      generateTestLogs(winstonLogger, 1500);

      const app = new App(medplum, agent.id, LogLevel.INFO, {
        mainLogger: winstonLogger,
      });
      app.heartbeatPeriod = 100;
      await app.start();

      // Wait for the WebSocket to connect
      while (!state.mySocket) {
        await sleep(100);
      }

      // Send a logs request
      state.mySocket.send(
        Buffer.from(
          JSON.stringify({
            type: 'agent:logs:request',
            limit, // Invalid limits
            callback: randomUUID(),
          } as AgentLogsRequest)
        )
      );

      // Wait for the logs response
      let shouldThrow = false;
      const timeout = setTimeout(() => {
        shouldThrow = true;
      }, 2500);

      while (!state.gotAgentError) {
        if (shouldThrow) {
          throw new Error('Timeout waiting for logs response');
        }
        await sleep(100);
      }
      clearTimeout(timeout);

      expect(state.gotAgentError).toBe(true);
      expect(state.agentError).toBeDefined();
      expect(state.agentError?.body).toStrictEqual(
        `Invalid limit: ${limit} - must be a valid positive integer less than or equal to ${MAX_LOG_LIMIT}`
      );

      await app.stop();
      await new Promise<void>((resolve) => {
        mockServer.stop(resolve);
      });
    }
  );

  test('should return an error if an error is thrown from fetch logs', async () => {
    const state = {
      mySocket: undefined as Client | undefined,
      gotAgentError: false,
      logsResponse: undefined as unknown as AgentLogsResponse,
      errorMessage: undefined as string | undefined,
    };

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

          case 'agent:error':
            state.gotAgentError = true;
            state.errorMessage = command.body;
            break;

          case 'agent:logs:response':
            state.logsResponse = command;
            break;

          default:
            // Ignore other message types
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

    // Create a Winston logger with some test logs
    const [winstonLogger, cleanupLogFile] = createTestWinstonLogger();
    cleanupFns.push(cleanupLogFile);
    generateTestLogs(winstonLogger, 5);

    const fetchLogsSpy = jest.spyOn(winstonLogger, 'fetchLogs').mockImplementation(async () => {
      throw new Error('Something bad happened');
    });

    const app = new App(medplum, agent.id, LogLevel.INFO, {
      mainLogger: winstonLogger,
    });
    app.heartbeatPeriod = 100;
    await app.start();

    // Wait for the WebSocket to connect
    while (!state.mySocket) {
      await sleep(100);
    }

    // Send a logs request with invalid limit
    state.mySocket.send(
      Buffer.from(
        JSON.stringify({
          type: 'agent:logs:request',
          callback: randomUUID(),
        })
      )
    );

    // Wait for the error response
    let shouldThrow = false;
    const timeout = setTimeout(() => {
      shouldThrow = true;
    }, 2500);

    while (!state.gotAgentError) {
      if (state.logsResponse) {
        throw new Error('Unexpected logs response');
      }
      if (shouldThrow) {
        throw new Error('Timeout waiting for error response');
      }
      await sleep(100);
    }
    clearTimeout(timeout);

    expect(state.gotAgentError).toBe(true);
    expect(state.errorMessage).toBeDefined();
    expect(typeof state.errorMessage).toBe('string');

    fetchLogsSpy.mockRestore();
    await app.stop();
    await new Promise<void>((resolve) => {
      mockServer.stop(resolve);
    });
  });
});
