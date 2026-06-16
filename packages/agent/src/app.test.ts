// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type {
  AgentError,
  AgentMessage,
  AgentReloadConfigRequest,
  AgentTransmitRequest,
  AgentTransmitResponse,
  AgentUpgradeRequest,
  AgentUpgradeResponse,
} from '@medplum/core';
import {
  ContentType,
  Hl7Message,
  LogLevel,
  MEDPLUM_VERSION,
  ReconnectingWebSocket,
  allOk,
  clearReleaseCache,
  createReference,
  getReferenceString,
  sleep,
} from '@medplum/core';
import type { Agent, Bot, Endpoint, Resource } from '@medplum/fhirtypes';
import { Hl7Client, Hl7Server } from '@medplum/hl7';
import { MockClient } from '@medplum/mock';
import type { Client } from 'mock-socket';
import { Server } from 'mock-socket';
import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type * as NodeFs from 'node:fs';
import { existsSync, openSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { platform } from 'node:os';
import { resolve } from 'node:path';
import { EventEmitter, Readable, Writable } from 'node:stream';
import { App } from './app';
import { AgentByteStreamChannel } from './bytestream';
import type * as AgentConstants from './constants';
import type { AgentHl7Channel, AgentHl7ChannelConnection } from './hl7';
import type { Hl7ClientPool } from './hl7-client-pool';
import * as pidModule from './pid';
import { createEndpointWithRandomPort, getFreePort } from './test-utils';
import { buildManifest, mockFetchForUpgrader } from './upgrader-test-utils';

vi.mock('./constants', async (importOriginal) => {
  const actual = await importOriginal<typeof AgentConstants>();
  return {
    ...actual,
    RETRY_WAIT_DURATION_MS: 200,
    // We don't care about how fast the clients release in these tests
    CLIENT_RELEASE_COUNTDOWN_MS: 0,
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

const HL7_ENDPOINT = {
  resourceType: 'Endpoint',
  status: 'active',
  address: 'mllp://0.0.0.0:9001',
  connectionType: { code: ContentType.HL7_V2 },
  payloadType: [{ coding: [{ code: ContentType.HL7_V2 }] }],
} satisfies Endpoint;
const DICOM_ENDPOINT = {
  resourceType: 'Endpoint',
  status: 'active',
  address: 'dicom://0.0.0.0:10001',
  connectionType: { code: ContentType.DICOM },
  payloadType: [{ coding: [{ code: ContentType.DICOM }] }],
} satisfies Endpoint;
const BYTESTREAM_ENDPOINT = {
  resourceType: 'Endpoint',
  status: 'active',
  address: 'tcp://0.0.0.0:9005?startChar=a&endChar=b',
  connectionType: { code: ContentType.OCTET_STREAM },
  payloadType: [{ coding: [{ code: ContentType.OCTET_STREAM }] }],
} satisfies Endpoint;

describe('App', () => {
  let medplum: MockClient;

  beforeEach(async () => {
    console.log = vi.fn();
    medplum = new MockClient();
    medplum.router.router.add('POST', ':resourceType/:id/$execute', async () => {
      return [allOk, {} as Resource];
    });
  });

  test('Runs successfully', async () => {
    const originalConsoleLog = console.log;
    console.log = vi.fn();
    const mockServer = new Server('wss://example.com/ws/agent');
    const state = {
      mySocket: undefined as Client | undefined,
      gotHeartbeatRequest: false,
      gotHeartbeatResponse: false,
    };

    mockServer.on('connection', (socket) => {
      state.mySocket = socket;
      socket.on('message', (data) => {
        const command = JSON.parse((data as Buffer).toString('utf8'));
        if (command.type === 'agent:connect:request') {
          socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
        }
        if (command.type === 'agent:heartbeat:request') {
          state.gotHeartbeatRequest = true;
          socket.send(Buffer.from(JSON.stringify({ type: 'agent:heartbeat:response' })));
        }
        if (command.type === 'agent:heartbeat:response') {
          state.gotHeartbeatResponse = true;
        }
      });
    });

    const agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      name: 'Test Agent',
      status: 'active',
    });

    const app = new App(medplum, agent.id, LogLevel.INFO);
    app.heartbeatPeriod = 1000;
    await app.start();

    // Wait for the WebSocket to connect
    while (!state.mySocket) {
      await sleep(100);
    }

    // Send a heartbeat request
    const wsClient = state.mySocket;
    wsClient.send(Buffer.from(JSON.stringify({ type: 'agent:heartbeat:request' })));

    // Wait for heartbeat response
    while (!state.gotHeartbeatRequest || !state.gotHeartbeatResponse) {
      await sleep(100);
    }

    // Send an error message
    wsClient.send(Buffer.from(JSON.stringify({ type: 'agent:error', body: 'details' })));

    // Send an unknown message type
    wsClient.send(Buffer.from(JSON.stringify({ type: 'unknown' })));

    // Simulate a token refresh
    medplum.dispatchEvent({ type: 'change' });

    await app.stop();
    await app.stop();
    await new Promise<void>((resolve) => {
      mockServer.stop(resolve);
    });

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Unknown message type: unknown'));
    console.log = originalConsoleLog;
  });

  test('Keeps trying to connect on startup', async () => {
    const originalConsoleLog = console.log;
    console.log = vi.fn();
    const state = {
      maxReconnectAttempts: 2,
      shouldConnect: false,
    };

    const originalDispatchEvent = ReconnectingWebSocket.prototype.dispatchEvent;
    const reconnectSpy = vi.spyOn(ReconnectingWebSocket.prototype, 'reconnect');
    const mockDispatchEvent = vi.spyOn(ReconnectingWebSocket.prototype, 'dispatchEvent').mockImplementation(function (
      this: ReconnectingWebSocket,
      event: Event
    ) {
      state.shouldConnect = reconnectSpy.mock.calls.length >= state.maxReconnectAttempts;
      // Only allow open events through when we should connect
      if (event.type === 'open' && !state.shouldConnect) {
        return;
      }
      originalDispatchEvent.call(this, event);
    });

    const mockServer = new Server('wss://example.com/ws/agent');
    mockServer.on('connection', (socket) => {
      socket.on('message', (data) => {
        const command = JSON.parse((data as Buffer).toString('utf8'));
        if (command.type === 'agent:connect:request') {
          socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
        }
      });
    });

    const agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      name: 'Test Agent',
      status: 'active',
    });

    const app = new App(medplum, agent.id, LogLevel.INFO);
    app.heartbeatPeriod = 5000;
    await app.start();

    while (reconnectSpy.mock.calls.length < state.maxReconnectAttempts) {
      await sleep(100);
    }

    // Verify the number of reconnect attempts
    expect(reconnectSpy).toHaveBeenCalledTimes(state.maxReconnectAttempts);

    await app.stop();
    await new Promise<void>((resolve) => {
      mockServer.stop(resolve);
    });

    // Restore the original ReconnectingWebSocket
    mockDispatchEvent.mockRestore();
    reconnectSpy.mockRestore();
    console.log = originalConsoleLog;
  });

  test('Reconnect after connection closed', async () => {
    const state = {
      mySocket: undefined as Client | undefined,
    };

    function mockConnectionHandler(socket: Client): void {
      state.mySocket = socket;
      socket.on('message', (data) => {
        const command = JSON.parse((data as Buffer).toString('utf8'));
        if (command.type === 'agent:connect:request') {
          socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
        }
      });
    }

    const mockServer1 = new Server('wss://example.com/ws/agent');
    mockServer1.on('connection', mockConnectionHandler);

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

    // Then forcefully close the connection
    state.mySocket.close();
    state.mySocket = undefined;
    mockServer1.stop();

    // Start a new server
    const mockServer2 = new Server('wss://example.com/ws/agent');
    mockServer2.on('connection', mockConnectionHandler);

    // Wait for the WebSocket to reconnect
    while (!state.mySocket) {
      await sleep(100);
    }

    await app.stop();
    await app.stop();
    mockServer2.stop();
  });

  test('Attempt to reconnect after missed heartbeats', async () => {
    const state = {
      mySocket: undefined as Client | undefined,
      heartbeatCount: 0,
      connectRequestCount: 0,
    };

    function mockConnectionHandler(socket: Client): void {
      state.mySocket = socket;
      socket.on('message', (data) => {
        const command = JSON.parse((data as Buffer).toString('utf8'));
        if (command.type === 'agent:connect:request') {
          state.connectRequestCount += 1;
          socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
        } else if (command.type === 'agent:heartbeat:request') {
          state.heartbeatCount += 1;
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

    app.heartbeatPeriod = 200;
    await app.start();

    // Wait for the WebSocket to connect
    while (!state.mySocket) {
      await sleep(100);
    }

    while (state.connectRequestCount < 1) {
      await sleep(100);
    }

    expect(state.connectRequestCount).toBe(1);

    // Wait for 2 heartbeats to pass (we should disconnect)
    while (state.heartbeatCount < 2) {
      await sleep(100);
    }

    expect(state.connectRequestCount).toBe(1);

    // Wait for another connect request (we reconnected)
    while (state.connectRequestCount < 2) {
      await sleep(100);
    }

    expect(state.connectRequestCount).toBe(2);

    await app.stop();
    await app.stop();
    mockServer.stop();
  });

  test('Attempt to reconnect when WebSocket is open but agent never becomes live', async () => {
    const state = {
      connectRequestCount: 0,
      respondToConnect: false,
    };

    const mockServer = new Server('wss://example.com/ws/agent');
    mockServer.on('connection', (socket) => {
      socket.on('message', (data) => {
        const command = JSON.parse((data as Buffer).toString('utf8'));
        if (command.type === 'agent:connect:request') {
          state.connectRequestCount += 1;
          // Simulate the server failing to process the connect request (e.g. a transient error
          // while validating the token or reading the Agent resource) -- the socket stays open
          // but no `agent:connect:response` is ever sent
          if (state.respondToConnect) {
            socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
          }
        }
        // Keep answering heartbeats so that, once we're live, the connection stays up and the
        // final liveness assertion isn't racing against the missed-heartbeat reconnect.
        if (command.type === 'agent:heartbeat:request') {
          socket.send(Buffer.from(JSON.stringify({ type: 'agent:heartbeat:response' })));
        }
      });
    });

    const agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      name: 'Test Agent',
      status: 'active',
    });

    const app = new App(medplum, agent.id, LogLevel.INFO);
    app.heartbeatPeriod = 100;
    await app.start();

    // Bail out of the polling loops after this long so a regression fails on the assertions below
    // (with a useful message) instead of hanging until the whole test times out.
    const WAIT_TIMEOUT_MS = 5000;

    // Wait for the first connect request, which goes unanswered -- the agent is stuck
    // open-but-not-live
    let deadline = Date.now() + WAIT_TIMEOUT_MS;
    while (state.connectRequestCount < 1 && Date.now() < deadline) {
      await sleep(50);
    }
    expect(state.connectRequestCount).toBeGreaterThanOrEqual(1);
    expect(app.getStats().live).toBe(false);

    // The agent should notice it never became live and force a reconnect, which re-sends the
    // connect request -- this time we answer it, so the agent should fully recover to live
    state.respondToConnect = true;
    deadline = Date.now() + WAIT_TIMEOUT_MS;
    while (!app.getStats().live && Date.now() < deadline) {
      await sleep(50);
    }

    expect(state.connectRequestCount).toBeGreaterThanOrEqual(2);
    expect(app.getStats().live).toBe(true);

    await app.stop();
    mockServer.stop();
  });

  test('WebSocket queue worker recovers after a failed send', async () => {
    const state = {
      mySocket: undefined as Client | undefined,
      live: false,
      transmitRequestCount: 0,
    };

    const mockServer = new Server('wss://example.com/ws/agent');
    mockServer.on('connection', (socket) => {
      state.mySocket = socket;
      socket.on('message', (data) => {
        const command = JSON.parse((data as Buffer).toString('utf8'));
        if (command.type === 'agent:connect:request') {
          socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
        }
        if (command.type === 'agent:transmit:request') {
          state.transmitRequestCount += 1;
        }
      });
    });

    const agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      name: 'Test Agent',
      status: 'active',
    });

    const app = new App(medplum, agent.id, LogLevel.INFO);
    // Long heartbeat period so the heartbeat retry doesn't interfere with this test --
    // recovery should be driven by the next enqueued message alone
    app.heartbeatPeriod = 30_000;
    await app.start();

    // Wait for the WebSocket to connect and the agent to become live
    while (!state.mySocket) {
      await sleep(50);
    }
    while (!app.getStats().live) {
      await sleep(50);
    }

    // Channel messages carry an accessToken, which makes the queue worker refresh the token
    // before sending. Make the next refresh fail, like when the token endpoint is unreachable
    const refreshSpy = vi.spyOn(medplum, 'refreshIfExpired').mockRejectedValueOnce(new Error('Network failure'));

    const transmitRequest = {
      type: 'agent:transmit:request',
      accessToken: 'placeholder',
      channel: 'test',
      remote: 'mllp://127.0.0.1:9001',
      contentType: ContentType.HL7_V2,
      body: 'MSH|^~\\&|A|B|C|D|20240101000000||ADT^A01|1|P|2.5\r',
    } satisfies AgentTransmitRequest;

    app.addToWebSocketQueue(transmitRequest);

    // Wait for the failed send attempt
    while (refreshSpy.mock.calls.length < 1) {
      await sleep(50);
    }
    await sleep(100);
    expect(state.transmitRequestCount).toStrictEqual(0);

    // Queueing the next message must restart the worker and drain BOTH messages
    // (the failed message was put back on the queue)
    app.addToWebSocketQueue({ ...transmitRequest, body: transmitRequest.body.replace('|1|', '|2|') });

    while (state.transmitRequestCount < 2) {
      await sleep(50);
    }
    expect(state.transmitRequestCount).toStrictEqual(2);

    refreshSpy.mockRestore();
    await app.stop();
    mockServer.stop();
  });

  test('Reconnects when sending the connect request throws (token refresh fails)', async () => {
    const state = {
      connectRequestCount: 0,
    };

    const mockServer = new Server('wss://example.com/ws/agent');
    mockServer.on('connection', (socket) => {
      socket.on('message', (data) => {
        const command = JSON.parse((data as Buffer).toString('utf8'));
        if (command.type === 'agent:connect:request') {
          state.connectRequestCount += 1;
          socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
        }
        if (command.type === 'agent:heartbeat:request') {
          socket.send(Buffer.from(JSON.stringify({ type: 'agent:heartbeat:response' })));
        }
      });
    });

    const agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      name: 'Test Agent',
      status: 'active',
    });

    // The connect request carries an accessToken, so `sendToWebSocket` refreshes the token before
    // sending. Make the first refresh fail -- like when the token endpoint is briefly unreachable
    // right after a network blip. The send throws inside the `open` handler; an uncaught error there
    // would crash the process. Instead it's logged, the agent stays not-live, and the heartbeat
    // forces a reconnect that re-sends the connect request (this time the refresh succeeds).
    const refreshSpy = vi.spyOn(medplum, 'refreshIfExpired').mockRejectedValueOnce(new Error('Network failure'));

    const app = new App(medplum, agent.id, LogLevel.INFO);
    app.heartbeatPeriod = 100;
    await app.start();

    // The first connect attempt fails before reaching the server, so no connect request is recorded
    // until the reconnect re-sends it with a working token.
    while (!app.getStats().live) {
      await sleep(50);
    }

    expect(refreshSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(state.connectRequestCount).toBeGreaterThanOrEqual(1);
    expect(app.getStats().live).toBe(true);

    refreshSpy.mockRestore();
    await app.stop();
    mockServer.stop();
  });

  test('WebSocket queue worker is restarted by the heartbeat after a failed send', async () => {
    const state = {
      mySocket: undefined as Client | undefined,
      transmitRequestCount: 0,
    };

    const mockServer = new Server('wss://example.com/ws/agent');
    mockServer.on('connection', (socket) => {
      state.mySocket = socket;
      socket.on('message', (data) => {
        const command = JSON.parse((data as Buffer).toString('utf8'));
        if (command.type === 'agent:connect:request') {
          socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
        }
        // Keep responding to heartbeats so the connection stays live and the queue recovery is
        // driven purely by the heartbeat retry -- not by a reconnect re-draining the queue.
        if (command.type === 'agent:heartbeat:request') {
          socket.send(Buffer.from(JSON.stringify({ type: 'agent:heartbeat:response' })));
        }
        if (command.type === 'agent:transmit:request') {
          state.transmitRequestCount += 1;
        }
      });
    });

    const agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      name: 'Test Agent',
      status: 'active',
    });

    const app = new App(medplum, agent.id, LogLevel.INFO);
    // Short heartbeat period so the heartbeat retry kicks in quickly. Recovery here must come from
    // the heartbeat alone -- no second message is enqueued to restart the worker.
    app.heartbeatPeriod = 100;
    await app.start();

    while (!state.mySocket) {
      await sleep(50);
    }
    while (!app.getStats().live) {
      await sleep(50);
    }

    // Channel messages carry an accessToken, which makes the queue worker refresh the token
    // before sending. Make the next refresh fail, like when the token endpoint is unreachable.
    const refreshSpy = vi.spyOn(medplum, 'refreshIfExpired').mockRejectedValueOnce(new Error('Network failure'));

    const transmitRequest = {
      type: 'agent:transmit:request',
      accessToken: 'placeholder',
      channel: 'test',
      remote: 'mllp://127.0.0.1:9001',
      contentType: ContentType.HL7_V2,
      body: 'MSH|^~\\&|A|B|C|D|20240101000000||ADT^A01|1|P|2.5\r',
    } satisfies AgentTransmitRequest;

    app.addToWebSocketQueue(transmitRequest);

    // Nothing else is enqueued, so the only thing that can restart the worker (which cleared itself
    // after the failed send put the message back on the queue) is the heartbeat's queue check.
    while (state.transmitRequestCount < 1) {
      await sleep(50);
    }
    expect(state.transmitRequestCount).toStrictEqual(1);

    // The first send failed on the token refresh and requeued the message; the heartbeat retry
    // refreshed again and re-sent it -- so the token was refreshed at least twice for this message.
    expect(refreshSpy.mock.calls.length).toBeGreaterThanOrEqual(2);

    refreshSpy.mockRestore();
    await app.stop();
    mockServer.stop();
  });

  test('Empty endpoint URL', async () => {
    medplum.router.router.add('POST', ':resourceType/:id/$execute', async () => {
      return [allOk, {} as Resource];
    });

    const bot = await medplum.createResource<Bot>({ resourceType: 'Bot' });

    const endpoint = await medplum.createResource<Endpoint>({
      resourceType: 'Endpoint',
      status: 'active',
      address: '', // invalid empty address
      connectionType: { code: ContentType.HL7_V2 },
      payloadType: [{ coding: [{ code: ContentType.HL7_V2 }] }],
    });

    const mockServer = new Server('wss://example.com/ws/agent');

    mockServer.on('connection', (socket) => {
      socket.on('message', (data) => {
        const command = JSON.parse((data as Buffer).toString('utf8'));
        if (command.type === 'agent:connect:request') {
          socket.send(
            Buffer.from(
              JSON.stringify({
                type: 'agent:connect:response',
              })
            )
          );
        }
      });
    });

    const agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      status: 'active',
      name: 'Test Agent',
      channel: [
        {
          name: 'test',
          endpoint: createReference(endpoint),
          targetReference: createReference(bot),
        },
      ],
    });

    const app = new App(medplum, agent.id, LogLevel.INFO);
    await expect(app.start()).rejects.toThrow(new Error("Invalid empty endpoint address for channel 'test'"));

    await app.stop();
    await new Promise<void>((resolve) => {
      mockServer.stop(resolve);
    });
  });

  test('Unknown endpoint protocol', async () => {
    const originalConsoleLog = console.log;
    console.log = vi.fn();

    medplum.router.router.add('POST', ':resourceType/:id/$execute', async () => {
      return [allOk, {} as Resource];
    });

    const bot = await medplum.createResource<Bot>({ resourceType: 'Bot' });

    const endpoint = await medplum.createResource<Endpoint>({
      resourceType: 'Endpoint',
      status: 'active',
      address: 'foo:', // unsupported protocol
      connectionType: { code: ContentType.HL7_V2 },
      payloadType: [{ coding: [{ code: ContentType.HL7_V2 }] }],
    });

    const mockServer = new Server('wss://example.com/ws/agent');

    mockServer.on('connection', (socket) => {
      socket.on('message', (data) => {
        const command = JSON.parse((data as Buffer).toString('utf8'));
        if (command.type === 'agent:connect:request') {
          socket.send(
            Buffer.from(
              JSON.stringify({
                type: 'agent:connect:response',
              })
            )
          );
        }
      });
    });

    const agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      status: 'active',
      name: 'Test Agent',
      channel: [
        {
          name: 'test',
          endpoint: createReference(endpoint),
          targetReference: createReference(bot),
        },
      ],
    });

    const app = new App(medplum, agent.id, LogLevel.INFO);
    await app.start();
    await app.stop();
    await new Promise<void>((resolve) => {
      mockServer.stop(resolve);
    });

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Unsupported endpoint type: foo:'));
    console.log = originalConsoleLog;
  });

  test('Reload config', async () => {
    // Create agent with an HL7 channel
    const state = {
      mySocket: undefined as Client | undefined,
      gotAgentReloadResponse: false,
      gotAgentError: false,
      agentError: undefined as AgentError | undefined,
    };

    function mockConnectionHandler(socket: Client): void {
      state.mySocket = socket;
      socket.on('message', (data) => {
        const command = JSON.parse((data as Buffer).toString('utf8')) as AgentMessage;
        switch (command.type) {
          case 'agent:connect:request':
            socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
            break;

          case 'agent:heartbeat:request':
            socket.send(Buffer.from(JSON.stringify({ type: 'agent:heartbeat:response' })));
            break;

          case 'agent:reloadconfig:response':
            if (command.statusCode !== 200) {
              throw new Error('Invalid status code. Expected 200');
            }
            state.gotAgentReloadResponse = true;
            break;

          case 'agent:error':
            state.gotAgentError = true;
            state.agentError = command;
            break;

          default:
            throw new Error('Unhandled message type');
        }
      });
    }

    const mockServer = new Server('wss://example.com/ws/agent');
    mockServer.on('connection', mockConnectionHandler);

    // We will create 6 endpoints in total, 3 for each channel type (HL7v2 and DICOM)
    // 2 of the 3 for each will be for one named channel which changes ports, one channel will be the same both times

    // Create the initial endpoints for all channels
    const [hl7TestEndpoint1] = await createEndpointWithRandomPort(medplum, HL7_ENDPOINT);
    const [hl7ProdEndpoint, hl7ProdPort] = await createEndpointWithRandomPort(medplum, HL7_ENDPOINT);
    const [dicomTestEndpoint1] = await createEndpointWithRandomPort(medplum, DICOM_ENDPOINT);
    const [dicomProdEndpoint] = await createEndpointWithRandomPort(medplum, DICOM_ENDPOINT);
    const [hl7StagingEndpoint] = await createEndpointWithRandomPort(medplum, HL7_ENDPOINT);
    let [bytestreamProdEndpoint] = await createEndpointWithRandomPort(medplum, BYTESTREAM_ENDPOINT);

    const bot = await medplum.createResource<Bot>({ resourceType: 'Bot' });

    const agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      name: 'Test Agent',
      status: 'active',
      channel: [
        {
          name: 'hl7-test',
          endpoint: createReference(hl7TestEndpoint1),
          targetReference: createReference(bot),
        },
        {
          name: 'hl7-prod',
          endpoint: createReference(hl7ProdEndpoint),
          targetReference: createReference(bot),
        },
        {
          name: 'dicom-test',
          endpoint: createReference(dicomTestEndpoint1),
          targetReference: createReference(bot),
        },
        {
          name: 'dicom-prod',
          endpoint: createReference(dicomProdEndpoint),
          targetReference: createReference(bot),
        },
        {
          name: 'hl7-staging',
          endpoint: createReference(hl7StagingEndpoint),
          targetReference: createReference(bot),
        },
        {
          name: 'bytestream-prod',
          endpoint: createReference(bytestreamProdEndpoint),
          targetReference: createReference(bot),
        },
      ],
    });

    const app = new App(medplum, agent.id, LogLevel.INFO);
    app.heartbeatPeriod = 100;
    await app.start();

    // Wait for the WebSocket to connect
    while (!state.mySocket) {
      await sleep(100);
    }

    // Test HL7 endpoint is there
    expect(app.channels.has('hl7-test')).toStrictEqual(true);
    expect(app.channels.has('hl7-prod')).toStrictEqual(true);
    expect(app.channels.has('dicom-test')).toStrictEqual(true);
    expect(app.channels.has('dicom-prod')).toStrictEqual(true);
    expect(app.channels.has('hl7-staging')).toStrictEqual(true);
    expect(app.channels.has('bytestream-prod')).toStrictEqual(true);
    expect(app.channels.size).toStrictEqual(6);

    const prodChannel = app.channels.get('hl7-prod') as AgentHl7Channel;
    expect(prodChannel).toBeDefined();

    expect(prodChannel.connections.size).toStrictEqual(0);

    // Create a connection to the prod channel
    const hl7Client = new Hl7Client({
      host: 'localhost',
      port: hl7ProdPort,
    });

    await hl7Client.connect();
    // Sleep to let connect event get emitted agent-side
    await sleep(0);

    expect(prodChannel.connections.size).toStrictEqual(1);
    const hl7ProdConnection = prodChannel.connections.values().next().value as AgentHl7ChannelConnection;
    expect(hl7ProdConnection).toBeDefined();
    expect(hl7ProdConnection.hl7Connection.enhancedMode).toBeUndefined();

    // Check that the socket is not closed
    const hl7ProdConnectionSocket = hl7ProdConnection.hl7Connection.socket;
    expect(hl7ProdConnectionSocket.closed).toStrictEqual(false);

    const stagingChannel = app.channels.get('hl7-staging') as AgentHl7Channel;

    // Create a new endpoint for both hl7-test and dicom-test
    const [hl7TestEndpoint2] = await createEndpointWithRandomPort(medplum, HL7_ENDPOINT);
    const [dicomTestEndpoint2] = await createEndpointWithRandomPort(medplum, DICOM_ENDPOINT);

    // Update endpoint to have enhanced mode on, which should trigger a reload without making a new socket
    const enhancedProdAddress = new URL(hl7ProdEndpoint.address);
    enhancedProdAddress.searchParams.set('enhanced', 'true');

    // Update the new address
    await medplum.updateResource<Endpoint>({
      ...hl7ProdEndpoint,
      address: enhancedProdAddress.toString(),
    });

    // Test rebinding to port for byte stream channel
    const oldPortBytestreamAddress = bytestreamProdEndpoint.address;
    const changedPortEndpointAddress = new URL(bytestreamProdEndpoint.address);
    changedPortEndpointAddress.port = (await getFreePort()).toString();

    // Update the new address
    bytestreamProdEndpoint = await medplum.updateResource<Endpoint>({
      ...bytestreamProdEndpoint,
      address: changedPortEndpointAddress.toString(),
    });

    // Update endpoint name
    await medplum.updateResource({
      ...agent,
      channel: [
        // Change endpoint
        {
          name: 'hl7-test',
          endpoint: createReference(hl7TestEndpoint2),
          targetReference: createReference(bot),
        },
        // No changes
        {
          name: 'hl7-prod',
          endpoint: createReference(hl7ProdEndpoint),
          targetReference: createReference(bot),
        },
        // Change endpoint
        {
          name: 'dicom-test',
          endpoint: createReference(dicomTestEndpoint2),
          targetReference: createReference(bot),
        },
        // No changes
        {
          name: 'dicom-prod',
          endpoint: createReference(dicomProdEndpoint),
          targetReference: createReference(bot),
        },
        // Rename hl7-staging to hl7-dev
        {
          name: 'hl7-dev',
          endpoint: createReference(hl7StagingEndpoint),
          targetReference: createReference(bot),
        },
        // No changes
        {
          name: 'bytestream-prod',
          endpoint: createReference(bytestreamProdEndpoint),
          targetReference: createReference(bot),
        },
      ],
    });

    // Send reloadconfig message
    state.mySocket.send(
      JSON.stringify({
        type: 'agent:reloadconfig:request',
        callback: getReferenceString(agent) + '-' + randomUUID(),
      } satisfies AgentReloadConfigRequest)
    );

    let shouldThrow = false;
    let timeout = setTimeout(() => {
      shouldThrow = true;
    }, 3000);

    while (!state.gotAgentReloadResponse) {
      if (shouldThrow) {
        throw new Error('Timeout');
      }
      await sleep(100);
    }
    clearTimeout(timeout);

    // We should get back `agent:reloadconfig:response` message
    expect(state.gotAgentReloadResponse).toStrictEqual(true);

    // Check channels have been updated
    expect(app.channels.has('hl7-test')).toStrictEqual(true);
    expect(app.channels.has('hl7-prod')).toStrictEqual(true);
    expect(app.channels.has('dicom-test')).toStrictEqual(true);
    expect(app.channels.has('dicom-prod')).toStrictEqual(true);
    expect(app.channels.has('hl7-dev')).toStrictEqual(true);
    expect(app.channels.has('bytestream-prod')).toStrictEqual(true);
    expect(app.channels.size).toStrictEqual(6);

    // Check that our prod connection for the prod channel is the same connection as before
    expect(prodChannel.connections.size).toStrictEqual(1);
    const hl7ProdConnectionAfter = prodChannel.connections.values().next().value as AgentHl7ChannelConnection;

    expect(hl7ProdConnectionAfter).toBeDefined();

    // Check that the socket is not closed and is the same socket
    const hl7ProdConnectionSocketAfter = hl7ProdConnection.hl7Connection.socket;
    expect(hl7ProdConnectionSocketAfter.closed).toStrictEqual(false);
    expect(hl7ProdConnectionSocketAfter).toStrictEqual(hl7ProdConnectionSocket);

    // But enhanced mode should be active on the existing connection
    expect(hl7ProdConnectionAfter.hl7Connection.enhancedMode).toStrictEqual('standard');

    // Check that the byte stream channel was rebound
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining(`Address changed: ${oldPortBytestreamAddress} => ${bytestreamProdEndpoint.address}`)
    );

    // Make sure old staging channel is closed
    shouldThrow = false;
    timeout = setTimeout(() => {
      shouldThrow = true;
    }, 2000);

    // Check that our removed channel was closed
    while (stagingChannel.server.server) {
      if (shouldThrow) {
        throw new Error('Timeout');
      }
    }
    clearTimeout(timeout);
    expect(stagingChannel.server.server).not.toBeDefined();

    // Verify protocol changes replace the channel instance instead of no-op reloading it.

    const hl7TestChannelBefore = app.channels.get('hl7-test') as AgentHl7Channel;
    expect(hl7TestChannelBefore).toBeDefined();

    const protocolSwapAddress = new URL(hl7TestEndpoint2.address);
    protocolSwapAddress.protocol = 'tcp:';
    protocolSwapAddress.searchParams.set('startChar', 'a');
    protocolSwapAddress.searchParams.set('endChar', 'b');

    const hl7TestEndpoint3 = await medplum.updateResource<Endpoint>({
      ...hl7TestEndpoint2,
      address: protocolSwapAddress.toString(),
      connectionType: { code: ContentType.OCTET_STREAM },
      payloadType: [{ coding: [{ code: ContentType.OCTET_STREAM }] }],
    });

    await medplum.updateResource({
      ...agent,
      channel: [
        {
          name: 'hl7-test',
          endpoint: createReference(hl7TestEndpoint3),
          targetReference: createReference(bot),
        },
        {
          name: 'hl7-prod',
          endpoint: createReference(hl7ProdEndpoint),
          targetReference: createReference(bot),
        },
        {
          name: 'dicom-test',
          endpoint: createReference(dicomTestEndpoint2),
          targetReference: createReference(bot),
        },
        {
          name: 'dicom-prod',
          endpoint: createReference(dicomProdEndpoint),
          targetReference: createReference(bot),
        },
        {
          name: 'hl7-dev',
          endpoint: createReference(hl7StagingEndpoint),
          targetReference: createReference(bot),
        },
        {
          name: 'bytestream-prod',
          endpoint: createReference(bytestreamProdEndpoint),
          targetReference: createReference(bot),
        },
      ],
    });

    state.gotAgentReloadResponse = false;
    state.gotAgentError = false;
    state.agentError = undefined;

    state.mySocket.send(
      JSON.stringify({
        type: 'agent:reloadconfig:request',
        callback: getReferenceString(agent) + '-' + randomUUID(),
      } satisfies AgentReloadConfigRequest)
    );

    shouldThrow = false;
    timeout = setTimeout(() => {
      shouldThrow = true;
    }, 3000);

    while (!state.gotAgentReloadResponse && !state.gotAgentError) {
      if (shouldThrow) {
        throw new Error('Timeout');
      }
      await sleep(100);
    }
    clearTimeout(timeout);

    expect(state.gotAgentReloadResponse).toStrictEqual(true);
    expect(state.gotAgentError).toStrictEqual(false);

    const hl7TestChannelAfter = app.channels.get('hl7-test');
    expect(hl7TestChannelAfter).toBeInstanceOf(AgentByteStreamChannel);
    expect(hl7TestChannelAfter).not.toBe(hl7TestChannelBefore);

    shouldThrow = false;
    timeout = setTimeout(() => {
      shouldThrow = true;
    }, 2000);

    while (hl7TestChannelBefore.server.server) {
      if (shouldThrow) {
        throw new Error('Timeout');
      }
      await sleep(100);
    }
    clearTimeout(timeout);

    expect(hl7TestChannelBefore.server.server).not.toBeDefined();

    // Now we should test accidentally adding endpoints with conflicting ports

    // Endpoints with conflicting ports
    const hl7ConflictingEndpoint = await medplum.createResource<Endpoint>({
      resourceType: 'Endpoint',
      status: 'active',
      address: hl7ProdEndpoint.address,
      connectionType: { code: ContentType.HL7_V2 },
      payloadType: [{ coding: [{ code: ContentType.HL7_V2 }] }],
    });
    const dicomConflictingEndpoint = await medplum.createResource<Endpoint>({
      resourceType: 'Endpoint',
      status: 'active',
      address: dicomProdEndpoint.address,
      connectionType: { code: ContentType.DICOM },
      payloadType: [{ coding: [{ code: ContentType.DICOM }] }],
    });

    // Update endpoint name
    await medplum.updateResource({
      ...agent,
      channel: [
        // No changes
        {
          name: 'hl7-test',
          endpoint: createReference(hl7TestEndpoint3),
          targetReference: createReference(bot),
        },
        // No changes
        {
          name: 'hl7-prod',
          endpoint: createReference(hl7ProdEndpoint),
          targetReference: createReference(bot),
        },
        // No changes
        {
          name: 'dicom-test',
          endpoint: createReference(dicomTestEndpoint2),
          targetReference: createReference(bot),
        },
        // No changes
        {
          name: 'dicom-prod',
          endpoint: createReference(dicomProdEndpoint),
          targetReference: createReference(bot),
        },
        // No changes
        {
          name: 'hl7-dev',
          endpoint: createReference(hl7StagingEndpoint),
          targetReference: createReference(bot),
        },
        // No changes
        {
          name: 'bytestream-prod',
          endpoint: createReference(bytestreamProdEndpoint),
          targetReference: createReference(bot),
        },
        {
          name: 'hl7-conflicting',
          endpoint: createReference(hl7ConflictingEndpoint),
          targetReference: createReference(bot),
        },
        {
          name: 'dicom-conflicting',
          endpoint: createReference(dicomConflictingEndpoint),
          targetReference: createReference(bot),
        },
      ],
    });

    // Send reloadconfig message
    state.mySocket.send(
      JSON.stringify({
        type: 'agent:reloadconfig:request',
        callback: getReferenceString(agent) + '-' + randomUUID(),
      } satisfies AgentReloadConfigRequest)
    );

    state.gotAgentReloadResponse = false;
    shouldThrow = false;
    timeout = setTimeout(() => {
      shouldThrow = true;
    }, 3000);

    while (!state.gotAgentError) {
      if (shouldThrow) {
        throw new Error('Timeout');
      }
      await sleep(100);
    }
    clearTimeout(timeout);

    // We should get back `agent:error` message
    expect(state.gotAgentReloadResponse).toStrictEqual(false);
    expect(state.gotAgentError).toStrictEqual(true);

    // Check channels have been updated
    expect(app.channels.has('hl7-test')).toStrictEqual(true);
    expect(app.channels.has('hl7-prod')).toStrictEqual(true);
    expect(app.channels.has('dicom-test')).toStrictEqual(true);
    expect(app.channels.has('dicom-prod')).toStrictEqual(true);
    expect(app.channels.has('hl7-dev')).toStrictEqual(true);
    expect(app.channels.has('bytestream-prod')).toStrictEqual(true);
    expect(app.channels.size).toStrictEqual(6);

    // Fix bad conflicting ports
    const fixedHl7ConflictingUrl = new URL(hl7ConflictingEndpoint.address);
    fixedHl7ConflictingUrl.port = (await getFreePort()).toString();
    await medplum.updateResource<Endpoint>({ ...hl7ConflictingEndpoint, address: fixedHl7ConflictingUrl.toString() });

    const fixedDicomConflictingUrl = new URL(dicomConflictingEndpoint.address);
    fixedDicomConflictingUrl.port = (await getFreePort()).toString();
    await medplum.updateResource<Endpoint>({
      ...dicomConflictingEndpoint,
      address: fixedDicomConflictingUrl.toString(),
    });

    // Make sure config works again

    // Send reloadconfig message
    state.mySocket.send(
      JSON.stringify({
        type: 'agent:reloadconfig:request',
        callback: getReferenceString(agent) + '-' + randomUUID(),
      } satisfies AgentReloadConfigRequest)
    );

    state.gotAgentReloadResponse = false;
    state.gotAgentError = false;
    state.agentError = undefined;
    shouldThrow = false;
    timeout = setTimeout(() => {
      shouldThrow = true;
    }, 3000);

    while (!state.gotAgentReloadResponse) {
      if (shouldThrow) {
        throw new Error('Timeout');
      }
      await sleep(100);
    }
    clearTimeout(timeout);

    // We should get back `agent:error` message
    expect(state.gotAgentReloadResponse).toStrictEqual(true);
    expect(state.gotAgentError).toStrictEqual(false);

    // Check channels have been updated
    expect(app.channels.has('hl7-test')).toStrictEqual(true);
    expect(app.channels.has('hl7-prod')).toStrictEqual(true);
    expect(app.channels.has('dicom-test')).toStrictEqual(true);
    expect(app.channels.has('dicom-prod')).toStrictEqual(true);
    expect(app.channels.has('hl7-dev')).toStrictEqual(true);
    expect(app.channels.has('hl7-conflicting')).toStrictEqual(true);
    expect(app.channels.has('dicom-conflicting')).toStrictEqual(true);
    expect(app.channels.has('bytestream-prod')).toStrictEqual(true);
    expect(app.channels.size).toStrictEqual(8);

    // Try removing endChar from bytestream-prod
    const invalidBytestreamAddress = new URL(bytestreamProdEndpoint.address);
    invalidBytestreamAddress.searchParams.delete('endChar');

    await medplum.updateResource<Endpoint>({ ...bytestreamProdEndpoint, address: invalidBytestreamAddress.toString() });

    // Send reloadconfig message
    state.mySocket.send(
      JSON.stringify({
        type: 'agent:reloadconfig:request',
        callback: getReferenceString(agent) + '-' + randomUUID(),
      } satisfies AgentReloadConfigRequest)
    );

    state.gotAgentReloadResponse = false;
    state.gotAgentError = false;
    state.agentError = undefined;
    shouldThrow = false;
    timeout = setTimeout(() => {
      shouldThrow = true;
    }, 3000);

    while (!state.gotAgentError) {
      if (shouldThrow) {
        throw new Error('Timeout');
      }
      await sleep(100);
    }
    clearTimeout(timeout);

    // We should get back `agent:error` message
    expect(state.gotAgentReloadResponse).toStrictEqual(false);
    expect(state.gotAgentError).toStrictEqual(true);
    expect(state.agentError).toMatchObject<AgentError>({
      type: 'agent:error',
      body: expect.stringContaining('Failed to parse startChar and/or endChar query param(s) from'),
    });

    // Check channels are the same
    expect(app.channels.has('hl7-test')).toStrictEqual(true);
    expect(app.channels.has('hl7-prod')).toStrictEqual(true);
    expect(app.channels.has('dicom-test')).toStrictEqual(true);
    expect(app.channels.has('dicom-prod')).toStrictEqual(true);
    expect(app.channels.has('hl7-dev')).toStrictEqual(true);
    expect(app.channels.has('hl7-conflicting')).toStrictEqual(true);
    expect(app.channels.has('dicom-conflicting')).toStrictEqual(true);
    expect(app.channels.has('bytestream-prod')).toStrictEqual(true);
    expect(app.channels.size).toStrictEqual(8);

    await hl7Client.close();
    await app.stop();
    await new Promise<void>((resolve) => {
      mockServer.stop(resolve);
    });
  });

  test('Enable stats logging', async () => {
    const originalConsoleLog = console.log;
    console.log = vi.fn();

    // Create agent with an HL7 channel
    const state = {
      mySocket: undefined as Client | undefined,
      gotAgentReloadResponse: false,
      gotAgentError: false,
      lastMessageReceived: undefined as Hl7Message | undefined,
    };

    function mockConnectionHandler(socket: Client): void {
      state.mySocket = socket;
      socket.on('message', (data) => {
        const command = JSON.parse((data as Buffer).toString('utf8')) as AgentMessage;
        switch (command.type) {
          case 'agent:connect:request':
            socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
            break;

          case 'agent:heartbeat:request':
            socket.send(Buffer.from(JSON.stringify({ type: 'agent:heartbeat:response' })));
            break;

          case 'agent:reloadconfig:response':
            if (command.statusCode !== 200) {
              throw new Error('Invalid status code. Expected 200');
            }
            state.gotAgentReloadResponse = true;
            break;

          case 'agent:error':
            state.gotAgentError = true;
            break;

          default:
            throw new Error('Unhandled message type');
        }
      });
    }

    const mockServer = new Server('wss://example.com/ws/agent');
    mockServer.on('connection', mockConnectionHandler);

    // Create the initial endpoints for all channels
    const [hl7ProdEndpoint] = await createEndpointWithRandomPort(medplum, HL7_ENDPOINT);

    const bot = await medplum.createResource<Bot>({ resourceType: 'Bot' });

    const agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      name: 'Test Agent',
      status: 'active',
      channel: [
        {
          name: 'hl7-prod',
          endpoint: createReference(hl7ProdEndpoint),
          targetReference: createReference(bot),
        },
      ],
      setting: [
        {
          name: 'logStatsFreqSecs',
          valueInteger: 1,
        },
      ],
    });

    const app = new App(medplum, agent.id, LogLevel.INFO);
    app.heartbeatPeriod = 100;
    await app.start();

    // Wait for the WebSocket to connect
    while (!state.mySocket) {
      await sleep(100);
    }

    // Test HL7 endpoint is there
    expect(app.channels.has('hl7-prod')).toStrictEqual(true);
    expect(app.channels.size).toStrictEqual(1);

    let shouldTimeout = false;
    const timeout = setTimeout(() => {
      shouldTimeout = true;
    }, 5000);

    let logged = false;
    while (!logged) {
      try {
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Agent stats'));
        logged = true;
        clearTimeout(timeout);
      } catch (err) {
        if (shouldTimeout) {
          throw err;
        }
        await sleep(500);
      }
    }

    await app.stop();
    await new Promise<void>((resolve) => {
      mockServer.stop(resolve);
    });
    console.log = originalConsoleLog;
  });

  test("Setting Agent.status to 'off'", async () => {
    const state = {
      mySocket: undefined as Client | undefined,
      gotAgentReloadResponse: false,
      gotAgentError: false,
    };

    const originalConsoleLog = console.log;
    console.log = vi.fn();

    medplum.router.router.add('POST', ':resourceType/:id/$execute', async () => {
      return [allOk, {} as Resource];
    });

    const bot = await medplum.createResource<Bot>({ resourceType: 'Bot' });

    const mockServer = new Server('wss://example.com/ws/agent');

    mockServer.on('connection', (socket) => {
      state.mySocket = socket;
      socket.on('message', (data) => {
        const command = JSON.parse((data as Buffer).toString('utf8')) as AgentMessage;
        if (command.type === 'agent:connect:request') {
          socket.send(
            Buffer.from(
              JSON.stringify({
                type: 'agent:connect:response',
              })
            )
          );
        } else if (command.type === 'agent:transmit:request') {
          const hl7Message = Hl7Message.parse(command.body);
          const ackMessage = hl7Message.buildAck();
          socket.send(
            Buffer.from(
              JSON.stringify({
                type: 'agent:transmit:response',
                channel: command.channel,
                remote: command.remote,
                body: ackMessage.toString(),
                callback: command.callback,
              })
            )
          );
        } else if (command.type === 'agent:error') {
          state.gotAgentError = true;
        } else if (command.type === 'agent:reloadconfig:response' && command.statusCode === 200) {
          state.gotAgentReloadResponse = true;
        }
      });
    });

    const [endpoint, port] = await createEndpointWithRandomPort(medplum, HL7_ENDPOINT);

    const agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      status: 'off',
      name: 'Test Agent',
      channel: [
        {
          name: 'test',
          endpoint: createReference(endpoint),
          targetReference: createReference(bot),
        },
      ],
    });

    const app = new App(medplum, agent.id, LogLevel.INFO);
    await app.start();

    // There should be no channels
    expect(app.channels.size).toStrictEqual(0);

    // Try to send HL7 message -- should fail
    let hl7Client = new Hl7Client({
      host: 'localhost',
      port,
    });

    let error: Error | AggregateError | undefined = undefined;
    try {
      await hl7Client.sendAndWait(
        Hl7Message.parse(
          'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
            'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-\r' +
            'NK1|1|JONES^BARBARA^K|SPO|||||20011105\r' +
            'PV1|1|I|2000^2012^01||||004777^LEBAUER^SIDNEY^J.|||SUR||-||1|A0-'
        )
      );
    } catch (err) {
      error = err as Error | AggregateError;
    }

    let isError = false;
    // err should be Error or AggregateError, and SHOULD be instanceof Error...
    // However on Mac it appears like it's not for some reason?
    // This check only exists because Mac seems to always return an AggregateError
    // While on Linux we are getting just an Error
    if (error?.constructor.name === 'Error' || error?.constructor.name === 'AggregateError') {
      isError = true;
    }
    expect(isError).toStrictEqual(true);

    await hl7Client.close();

    // Wait for socket
    let shouldThrow = false;
    let timeout = setTimeout(() => {
      shouldThrow = true;
    }, 2500);

    while (!state.mySocket) {
      if (shouldThrow) {
        throw new Error('Timeout');
      }
      await sleep(100);
    }
    clearTimeout(timeout);

    const listenerPort = await getFreePort();

    // Try to send agent:transmit:request -- should return error
    // Start an HL7 listener
    let hl7Messages = [];
    let hl7Server = new Hl7Server((conn) => {
      conn.addEventListener('message', ({ message }) => {
        hl7Messages.push(message);
        conn.send(message.buildAck());
      });
    });
    await hl7Server.start(listenerPort);

    // At this point, we expect the websocket to be connected
    expect(state.mySocket).toBeDefined();

    // Reset last transmit response
    state.gotAgentError = false;
    // Send a push message
    state.mySocket.send(
      Buffer.from(
        JSON.stringify({
          type: 'agent:transmit:request',
          contentType: ContentType.HL7_V2,
          body:
            'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
            'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-\r' +
            'NK1|1|JONES^BARBARA^K|SPO|||||20011105\r' +
            'PV1|1|I|2000^2012^01||||004777^LEBAUER^SIDNEY^J.|||SUR||-||1|A0-',
          remote: `mllp://localhost:${listenerPort}`,
        } satisfies AgentTransmitRequest)
      )
    );

    timeout = setTimeout(() => {
      shouldThrow = true;
    }, 2500);
    while (!state.gotAgentError) {
      if (shouldThrow) {
        throw new Error('Timeout');
      }
      await sleep(100);
    }
    clearTimeout(timeout);

    expect(state.gotAgentError).toStrictEqual(true);

    state.mySocket.send(
      Buffer.from(
        JSON.stringify({
          type: 'agent:transmit:request',
          contentType: ContentType.HL7_V2,
          body:
            'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
            'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-\r' +
            'NK1|1|JONES^BARBARA^K|SPO|||||20011105\r' +
            'PV1|1|I|2000^2012^01||||004777^LEBAUER^SIDNEY^J.|||SUR||-||1|A0-',
          remote: `mllp://localhost:${listenerPort}`,
        } satisfies AgentTransmitRequest)
      )
    );

    // Wait for both any hl7 message we might have gotten
    // As well as for the response error to have been logged
    await sleep(500);

    // Check that we logged an error
    expect(console.log).toHaveBeenLastCalledWith(expect.stringContaining('Agent.status is currently set to off'));

    // Should be empty
    expect(hl7Messages.length).toBe(0);

    await hl7Server.stop({ forceDrainTimeoutMs: 100 });

    // Set agent status back to 'active'
    await medplum.updateResource<Agent>({
      ...agent,
      status: 'active',
    });

    // Reload config
    state.mySocket.send(
      JSON.stringify({
        type: 'agent:reloadconfig:request',
        callback: getReferenceString(agent) + '-' + randomUUID(),
      } satisfies AgentReloadConfigRequest)
    );

    shouldThrow = false;
    timeout = setTimeout(() => {
      shouldThrow = true;
    }, 2500);

    while (!state.gotAgentReloadResponse) {
      if (shouldThrow) {
        throw new Error('Timeout');
      }
      await sleep(100);
    }
    clearTimeout(timeout);

    // There should be 1 channel
    expect(app.channels.size).toStrictEqual(1);
    expect(app.channels.get('test')).toBeDefined();

    // Try to send HL7 message -- should succeed
    hl7Client = new Hl7Client({
      host: 'localhost',
      port,
    });

    const response = await hl7Client.sendAndWait(
      Hl7Message.parse(
        'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
          'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-\r' +
          'NK1|1|JONES^BARBARA^K|SPO|||||20011105\r' +
          'PV1|1|I|2000^2012^01||||004777^LEBAUER^SIDNEY^J.|||SUR||-||1|A0-'
      )
    );

    expect(response).toBeDefined();
    expect(response.header.getComponent(9, 1)).toBe('ACK');
    expect(response.segments).toHaveLength(2);
    expect(response.segments[1].name).toBe('MSA');

    await hl7Client.close();

    // Try to send agent:transmit:request -- should return valid response
    // Start an HL7 listener
    hl7Messages = [];
    hl7Server = new Hl7Server((conn) => {
      conn.addEventListener('message', ({ message }) => {
        hl7Messages.push(message);
        conn.send(message.buildAck());
      });
    });
    await hl7Server.start(listenerPort);

    // At this point, we expect the websocket to be connected
    expect(state.mySocket).toBeDefined();

    // Send a push message
    state.mySocket.send(
      Buffer.from(
        JSON.stringify({
          type: 'agent:transmit:request',
          body:
            'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
            'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-\r' +
            'NK1|1|JONES^BARBARA^K|SPO|||||20011105\r' +
            'PV1|1|I|2000^2012^01||||004777^LEBAUER^SIDNEY^J.|||SUR||-||1|A0-',
          remote: `mllp://localhost:${listenerPort}`,
          callback: getReferenceString(agent) + '-' + randomUUID(),
        })
      )
    );

    // Wait for the HL7 message to be received
    while (hl7Messages.length < 1) {
      await sleep(100);
    }
    expect(hl7Messages.length).toBe(1);

    await hl7Server.stop({ forceDrainTimeoutMs: 100 });
    await app.stop();
    await new Promise<void>((resolve) => {
      mockServer.stop(resolve);
    });

    console.log = originalConsoleLog;
  });

  test("Setting a channel.endpoint.status to 'off'", async () => {
    const state = {
      mySocket: undefined as Client | undefined,
      gotAgentReloadResponse: false,
      gotAgentError: false,
    };

    const originalConsoleLog = console.log;
    console.log = vi.fn();

    medplum.router.router.add('POST', ':resourceType/:id/$execute', async () => {
      return [allOk, {} as Resource];
    });

    const bot = await medplum.createResource<Bot>({ resourceType: 'Bot' });

    const mockServer = new Server('wss://example.com/ws/agent');

    mockServer.on('connection', (socket) => {
      state.mySocket = socket;
      socket.on('message', (data) => {
        const command = JSON.parse((data as Buffer).toString('utf8')) as AgentMessage;
        if (command.type === 'agent:connect:request') {
          socket.send(
            Buffer.from(
              JSON.stringify({
                type: 'agent:connect:response',
              })
            )
          );
        } else if (command.type === 'agent:transmit:request') {
          const hl7Message = Hl7Message.parse(command.body);
          const ackMessage = hl7Message.buildAck();
          socket.send(
            Buffer.from(
              JSON.stringify({
                type: 'agent:transmit:response',
                channel: command.channel,
                remote: command.remote,
                body: ackMessage.toString(),
                callback: command.callback,
              })
            )
          );
        } else if (command.type === 'agent:error') {
          state.gotAgentError = true;
        } else if (command.type === 'agent:reloadconfig:response' && command.statusCode === 200) {
          state.gotAgentReloadResponse = true;
        }
      });
    });

    const [testEndpoint, testPort] = await createEndpointWithRandomPort(medplum, { ...HL7_ENDPOINT, status: 'off' });
    const [prodEndpoint, prodPort] = await createEndpointWithRandomPort(medplum, HL7_ENDPOINT);

    const agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      status: 'active',
      name: 'Test Agent',
      channel: [
        {
          name: 'test',
          endpoint: createReference(testEndpoint),
          targetReference: createReference(bot),
        },
        {
          name: 'prod',
          endpoint: createReference(prodEndpoint),
          targetReference: createReference(bot),
        },
      ],
    });

    const app = new App(medplum, agent.id, LogLevel.INFO);
    await app.start();

    // There should be only the prod channel
    expect(app.channels.size).toStrictEqual(1);
    expect(app.channels.has('prod')).toStrictEqual(true);

    // Try to send HL7 message -- should fail
    let hl7Client = new Hl7Client({
      host: 'localhost',
      port: testPort,
    });

    let error: AggregateError | undefined = undefined;
    try {
      await hl7Client.sendAndWait(
        Hl7Message.parse(
          'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
            'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-\r' +
            'NK1|1|JONES^BARBARA^K|SPO|||||20011105\r' +
            'PV1|1|I|2000^2012^01||||004777^LEBAUER^SIDNEY^J.|||SUR||-||1|A0-'
        )
      );
    } catch (err) {
      error = err as AggregateError;
    }

    let isError = false;
    // err should be Error or AggregateError, and SHOULD be instanceof Error...
    // However on Mac it appears like it's not for some reason?
    // This check only exists because Mac seems to always return an AggregateError
    // While on Linux we are getting just an Error
    if (error?.constructor.name === 'Error' || error?.constructor.name === 'AggregateError') {
      isError = true;
    }
    expect(isError).toStrictEqual(true);

    await hl7Client.close();

    // This one should succeed
    hl7Client = new Hl7Client({
      host: 'localhost',
      port: prodPort,
    });

    let response = await hl7Client.sendAndWait(
      Hl7Message.parse(
        'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
          'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-\r' +
          'NK1|1|JONES^BARBARA^K|SPO|||||20011105\r' +
          'PV1|1|I|2000^2012^01||||004777^LEBAUER^SIDNEY^J.|||SUR||-||1|A0-'
      )
    );

    expect(response).toBeDefined();
    expect(response.header.getComponent(9, 1)).toBe('ACK');
    expect(response.segments).toHaveLength(2);
    expect(response.segments[1].name).toBe('MSA');

    await hl7Client.close();

    // Set agent status back to 'active'
    await medplum.updateResource<Endpoint>({
      ...testEndpoint,
      status: 'active',
    });

    // Wait for socket
    let shouldThrow = false;
    let timeout = setTimeout(() => {
      shouldThrow = true;
    }, 2500);

    while (!state.mySocket) {
      if (shouldThrow) {
        throw new Error('Timeout');
      }
      await sleep(100);
    }
    clearTimeout(timeout);

    // At this point, we expect the websocket to be connected
    expect(state.mySocket).toBeDefined();

    // Reload config
    state.mySocket.send(
      JSON.stringify({
        type: 'agent:reloadconfig:request',
        callback: getReferenceString(agent) + '-' + randomUUID(),
      } satisfies AgentReloadConfigRequest)
    );

    shouldThrow = false;
    timeout = setTimeout(() => {
      shouldThrow = true;
    }, 2500);

    while (!state.gotAgentReloadResponse) {
      if (shouldThrow) {
        throw new Error('Timeout');
      }
      await sleep(100);
    }
    clearTimeout(timeout);

    // There should be 2 channels
    expect(app.channels.size).toStrictEqual(2);
    expect(app.channels.get('test')).toBeDefined();
    expect(app.channels.get('prod')).toBeDefined();

    // Try to send HL7 message -- should succeed
    hl7Client = new Hl7Client({
      host: 'localhost',
      port: testPort,
    });

    response = await hl7Client.sendAndWait(
      Hl7Message.parse(
        'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
          'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-\r' +
          'NK1|1|JONES^BARBARA^K|SPO|||||20011105\r' +
          'PV1|1|I|2000^2012^01||||004777^LEBAUER^SIDNEY^J.|||SUR||-||1|A0-'
      )
    );

    expect(response).toBeDefined();
    expect(response.header.getComponent(9, 1)).toBe('ACK');
    expect(response.segments).toHaveLength(2);
    expect(response.segments[1].name).toBe('MSA');

    await hl7Client.close();

    // This one should succeed
    hl7Client = new Hl7Client({
      host: 'localhost',
      port: prodPort,
    });

    response = await hl7Client.sendAndWait(
      Hl7Message.parse(
        'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
          'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-\r' +
          'NK1|1|JONES^BARBARA^K|SPO|||||20011105\r' +
          'PV1|1|I|2000^2012^01||||004777^LEBAUER^SIDNEY^J.|||SUR||-||1|A0-'
      )
    );

    expect(response).toBeDefined();
    expect(response.header.getComponent(9, 1)).toBe('ACK');
    expect(response.segments).toHaveLength(2);
    expect(response.segments[1].name).toBe('MSA');

    await hl7Client.close();

    await app.stop();
    await new Promise<void>((resolve) => {
      mockServer.stop(resolve);
    });

    console.log = originalConsoleLog;
  });

  test('Agent transmit response without callback still gets processed', async () => {
    const state = {
      mySocket: undefined as Client | undefined,
      hl7MessageReceived: false,
    };

    medplum.router.router.add('POST', ':resourceType/:id/$execute', async () => {
      return [allOk, {} as Resource];
    });

    const bot = await medplum.createResource<Bot>({ resourceType: 'Bot' });

    const mockServer = new Server('wss://example.com/ws/agent');

    mockServer.on('connection', (socket) => {
      state.mySocket = socket;
      socket.on('message', (data) => {
        const command = JSON.parse((data as Buffer).toString('utf8')) as AgentMessage;

        if (command.type === 'agent:connect:request') {
          socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
        } else if (command.type === 'agent:transmit:request') {
          const hl7Message = Hl7Message.parse(command.body);
          const ackMessage = hl7Message.buildAck();
          expect(command.callback).toBeDefined();
          expect(command.channel).toBe('test');
          expect(command.remote).toBeDefined();

          socket.send(
            Buffer.from(
              JSON.stringify({
                type: 'agent:transmit:response',
                channel: command.channel,
                remote: command.remote,
                body: ackMessage.toString(),
              })
            )
          );
        }
      });
    });

    const [endpoint, port] = await createEndpointWithRandomPort(medplum, HL7_ENDPOINT);

    const agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      status: 'active',
      name: 'Test Agent',
      channel: [
        {
          name: 'test',
          endpoint: createReference(endpoint),
          targetReference: createReference(bot),
        },
      ],
    });

    const app = new App(medplum, agent.id, LogLevel.INFO);
    await app.start();

    // Spy on the app.log.warn method
    const warnSpy = vi.spyOn(app.log, 'warn');

    while (!state.mySocket) {
      await sleep(100);
    }

    expect(app.channels.size).toBe(1);
    expect(app.channels.has('test')).toBe(true);

    const hl7Client = new Hl7Client({
      host: 'localhost',
      port,
    });

    await hl7Client.sendAndWait(
      Hl7Message.parse(
        'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
          'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-\r' +
          'NK1|1|JONES^BARBARA^K|SPO|||||20011105\r' +
          'PV1|1|I|2000^2012^01||||004777^LEBAUER^SIDNEY^J.|||SUR||-||1|A0-'
      )
    );

    const testChannel = app.channels.get('test') as AgentHl7Channel;
    expect(testChannel.connections.size).toBe(1);

    await hl7Client.close();

    await app.stop();

    await new Promise<void>((resolve) => {
      mockServer.stop(resolve);
    });

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Transmit response missing callback'));
  }, 5000);

  test('Agent transmit response while status is off returns disabled error', async () => {
    const state = {
      mySocket: undefined as Client | undefined,
      agentError: undefined as AgentError | undefined,
    };

    const mockServer = new Server('wss://example.com/ws/agent');

    mockServer.on('connection', (socket) => {
      state.mySocket = socket;
      socket.on('message', (data) => {
        const command = JSON.parse((data as Buffer).toString('utf8')) as AgentMessage;
        if (command.type === 'agent:connect:request') {
          socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
        } else if (command.type === 'agent:error') {
          state.agentError = command;
        }
      });
    });

    const agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      status: 'off',
      name: 'Test Agent',
    });

    const app = new App(medplum, agent.id, LogLevel.INFO);
    await app.start();

    while (!state.mySocket) {
      await sleep(100);
    }

    // The agent is primary (no upgrade in progress) but disabled, so an inbound transmit response
    // should be rejected with a disabled error rather than handed off to a channel.
    const callback = getReferenceString(agent) + '-' + randomUUID();
    state.mySocket.send(
      Buffer.from(
        JSON.stringify({
          type: 'agent:transmit:response',
          channel: 'test',
          remote: 'mllp://localhost:9999',
          contentType: ContentType.HL7_V2,
          body: 'ACK',
          callback,
        } satisfies AgentTransmitResponse)
      )
    );

    let shouldThrow = false;
    const timeout = setTimeout(() => {
      shouldThrow = true;
    }, 2500);
    while (!state.agentError) {
      if (shouldThrow) {
        throw new Error('Timeout');
      }
      await sleep(100);
    }
    clearTimeout(timeout);

    expect(state.agentError.callback).toStrictEqual(callback);
    expect(state.agentError.body).toContain('Agent.status is currently set to off');

    await app.stop();
    await new Promise<void>((resolve) => {
      mockServer.stop(resolve);
    });
  }, 5000);

  describe('Upgrade', () => {
    beforeEach(() => {
      const upgradeFilePath = resolve(__dirname, 'upgrade.json');
      if (existsSync(upgradeFilePath)) {
        rmSync(upgradeFilePath);
      }
    });

    test('Upgrade -- Not on Windows', async () => {
      vi.mocked(platform).mockReturnValue('linux');

      const state = {
        mySocket: undefined as Client | undefined,
        gotAgentUpgradeResponse: false,
        agentError: undefined as AgentError | undefined,
      };

      function mockConnectionHandler(socket: Client): void {
        state.mySocket = socket;
        socket.on('message', (data) => {
          const command = JSON.parse((data as Buffer).toString('utf8')) as AgentMessage;
          switch (command.type) {
            case 'agent:connect:request':
              socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
              break;

            case 'agent:heartbeat:request':
              socket.send(Buffer.from(JSON.stringify({ type: 'agent:heartbeat:response' })));
              break;

            case 'agent:upgrade:response':
              if (command.statusCode !== 200) {
                throw new Error('Invalid status code. Expected 200');
              }
              state.gotAgentUpgradeResponse = true;
              break;

            case 'agent:error':
              state.agentError = command;
              break;

            default:
              throw new Error('Unhandled message type');
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
      await app.start();

      // Wait for the WebSocket to reconnect
      while (!state.mySocket) {
        await sleep(100);
      }

      state.mySocket.send(
        JSON.stringify({
          type: 'agent:upgrade:request',
          callback: getReferenceString(agent) + '-' + randomUUID(),
        } satisfies AgentUpgradeRequest)
      );

      let shouldThrow = false;
      const timeout = setTimeout(() => {
        shouldThrow = true;
      }, 2500);

      while (!state.agentError) {
        if (shouldThrow) {
          throw new Error('Timeout');
        }
        await sleep(100);
      }
      clearTimeout(timeout);

      expect(state.agentError.body).toStrictEqual('Auto-upgrading is currently only supported on Windows');

      await app.stop();
      await new Promise<void>((resolve) => {
        mockServer.stop(resolve);
      });
    });

    test('Upgrade -- No version specified', async () => {
      const originalConsoleLog = console.log;
      console.log = vi.fn();

      let child!: MockChildProcess;

      const state = {
        mySocket: undefined as Client | undefined,
        gotAgentUpgradeResponse: false,
        agentError: undefined as AgentError | undefined,
        disconnectCalled: false,
      };

      const platformSpy = vi.mocked(platform).mockReturnValue('win32');
      const fetchSpy = mockFetchForUpgrader();
      const openSyncSpy = vi.mocked(openSync).mockImplementation(vi.fn(() => 42));
      const writeFileSyncSpy = vi.mocked(writeFileSync).mockImplementation(vi.fn());
      const spawnSpy = vi.mocked(spawn).mockImplementation(function () {
        child = new MockChildProcess();
        child.onDisconnect = () => {
          state.disconnectCalled = true;
        };
        return child;
      });

      function mockConnectionHandler(socket: Client): void {
        state.mySocket = socket;
        socket.on('message', (data) => {
          const command = JSON.parse((data as Buffer).toString('utf8')) as AgentMessage;
          switch (command.type) {
            case 'agent:connect:request':
              socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
              break;

            case 'agent:heartbeat:request':
              socket.send(Buffer.from(JSON.stringify({ type: 'agent:heartbeat:response' })));
              break;

            case 'agent:upgrade:response':
              if (command.statusCode !== 200) {
                throw new Error('Invalid status code. Expected 200');
              }
              state.gotAgentUpgradeResponse = true;
              break;

            case 'agent:error':
              state.agentError = command;
              break;

            default:
              throw new Error('Unhandled message type');
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
      await app.start();

      // Wait for the WebSocket to reconnect
      while (!state.mySocket) {
        await sleep(100);
      }

      const callback = getReferenceString(agent) + '-' + randomUUID();

      state.mySocket.send(
        JSON.stringify({
          type: 'agent:upgrade:request',
          callback,
        } satisfies AgentUpgradeRequest)
      );

      let shouldThrow = false;
      const timeout = setTimeout(() => {
        shouldThrow = true;
      }, 2500);

      // eslint-disable-next-line no-unmodified-loop-condition
      while (!child) {
        if (shouldThrow) {
          throw new Error('Timeout while waiting for child to spawn');
        }
        await sleep(100);
      }

      await sleep(100);
      child.emit('message', { type: 'STARTED' });
      while (!state.disconnectCalled) {
        if (shouldThrow) {
          throw new Error('Timeout while waiting for disconnect');
        }
        await sleep(100);
      }
      clearTimeout(timeout);

      expect(spawnSpy).toHaveBeenLastCalledWith(resolve(__dirname, 'app.ts'), ['--upgrade'], {
        detached: true,
        stdio: ['ignore', 42, 42, 'ipc'],
      });
      expect(openSyncSpy).toHaveBeenCalled();
      expect(child.unref).toHaveBeenCalled();
      expect(child.disconnect).toHaveBeenCalled();

      expect(writeFileSyncSpy).toHaveBeenLastCalledWith(
        resolve(__dirname, 'upgrade.json'),
        JSON.stringify({
          previousVersion: MEDPLUM_VERSION,
          targetVersion: '4.2.4',
          callback,
        }),
        { encoding: 'utf8', flag: 'w+' }
      );
      expect(console.log).toHaveBeenLastCalledWith(expect.stringContaining('Closing IPC...'));

      await app.stop();
      await new Promise<void>((resolve) => {
        mockServer.stop(resolve);
      });

      for (const spy of [platformSpy, fetchSpy, openSyncSpy, writeFileSyncSpy, spawnSpy]) {
        spy.mockRestore();
      }
      console.log = originalConsoleLog;
    });

    test('Upgrade -- Version specified', async () => {
      const originalConsoleLog = console.log;
      console.log = vi.fn();

      let child!: MockChildProcess;

      const state = {
        mySocket: undefined as Client | undefined,
        agentUpgradeResponse: undefined as AgentUpgradeResponse | undefined,
        agentError: undefined as AgentError | undefined,
        disconnectCalled: false,
      };

      const platformSpy = vi.mocked(platform).mockReturnValue('win32');
      const fetchSpy = mockFetchForUpgrader();
      const openSyncSpy = vi.mocked(openSync).mockImplementation(vi.fn(() => 42));
      const writeFileSyncSpy = vi.mocked(writeFileSync).mockImplementation(vi.fn());
      const rmSyncSpy = vi.mocked(rmSync).mockImplementation(vi.fn());
      const spawnSpy = vi.mocked(spawn).mockImplementation(function () {
        child = new MockChildProcess();
        child.onDisconnect = () => {
          state.disconnectCalled = true;
        };
        return child;
      });

      function mockConnectionHandler(socket: Client): void {
        state.mySocket = socket;
        socket.on('message', (data) => {
          const command = JSON.parse((data as Buffer).toString('utf8')) as AgentMessage;
          switch (command.type) {
            case 'agent:connect:request':
              socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
              break;

            case 'agent:heartbeat:request':
              socket.send(Buffer.from(JSON.stringify({ type: 'agent:heartbeat:response' })));
              break;

            case 'agent:upgrade:response':
              if (command.statusCode !== 200) {
                throw new Error('Invalid status code. Expected 200');
              }
              state.agentUpgradeResponse = command;
              break;

            case 'agent:error':
              state.agentError = command;
              break;

            default:
              throw new Error('Unhandled message type');
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
      await app.start();

      // Wait for the WebSocket to reconnect
      while (!state.mySocket) {
        await sleep(100);
      }

      const callback = getReferenceString(agent) + '-' + randomUUID();

      state.mySocket.send(
        JSON.stringify({
          type: 'agent:upgrade:request',
          callback,
          version: '4.2.4',
        } satisfies AgentUpgradeRequest)
      );

      let shouldThrow = false;
      const timeout = setTimeout(() => {
        shouldThrow = true;
      }, 2500);

      // eslint-disable-next-line no-unmodified-loop-condition
      while (!child) {
        if (shouldThrow) {
          throw new Error('Timeout while waiting for child to spawn');
        }
        await sleep(100);
      }

      child.emit('message', { type: 'STARTED' });
      while (!state.disconnectCalled) {
        if (shouldThrow) {
          throw new Error('Timeout while waiting for disconnect');
        }
        await sleep(100);
      }
      clearTimeout(timeout);

      expect(spawnSpy).toHaveBeenLastCalledWith(resolve(__dirname, 'app.ts'), ['--upgrade', '4.2.4'], {
        detached: true,
        stdio: ['ignore', 42, 42, 'ipc'],
      });
      expect(openSyncSpy).toHaveBeenCalled();
      expect(child.unref).toHaveBeenCalled();
      expect(child.disconnect).toHaveBeenCalled();

      expect(writeFileSyncSpy).toHaveBeenLastCalledWith(
        resolve(__dirname, 'upgrade.json'),
        JSON.stringify({
          previousVersion: MEDPLUM_VERSION,
          targetVersion: '4.2.4',
          callback,
        }),
        { encoding: 'utf8', flag: 'w+' }
      );
      expect(console.log).toHaveBeenLastCalledWith(expect.stringContaining('Closing IPC...'));

      expect(state.agentError).toBeUndefined();

      await app.stop();
      await new Promise<void>((resolve) => {
        mockServer.stop(resolve);
      });

      for (const spy of [platformSpy, fetchSpy, openSyncSpy, writeFileSyncSpy, rmSyncSpy, spawnSpy]) {
        spy.mockRestore();
      }
      console.log = originalConsoleLog;
    });

    test('Upgrade -- Invalid version', async () => {
      const originalConsoleLog = console.log;
      console.log = vi.fn();

      const state = {
        mySocket: undefined as Client | undefined,
        gotAgentUpgradeResponse: false,
        agentError: undefined as AgentError | undefined,
      };

      vi.mocked(platform).mockReturnValue('win32');
      const fetchSpy = mockFetchForUpgrader();

      function mockConnectionHandler(socket: Client): void {
        state.mySocket = socket;
        socket.on('message', (data) => {
          const command = JSON.parse((data as Buffer).toString('utf8')) as AgentMessage;
          switch (command.type) {
            case 'agent:connect:request':
              socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
              break;

            case 'agent:heartbeat:request':
              socket.send(Buffer.from(JSON.stringify({ type: 'agent:heartbeat:response' })));
              break;

            case 'agent:upgrade:response':
              if (command.statusCode !== 200) {
                throw new Error('Invalid status code. Expected 200');
              }
              state.gotAgentUpgradeResponse = true;
              break;

            case 'agent:error':
              state.agentError = command;
              break;

            default:
              throw new Error('Unhandled message type');
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
      await app.start();

      // Wait for the WebSocket to reconnect
      while (!state.mySocket) {
        await sleep(100);
      }

      state.mySocket.send(
        JSON.stringify({
          type: 'agent:upgrade:request',
          callback: getReferenceString(agent) + '-' + randomUUID(),
          version: 'medplum',
        } satisfies AgentUpgradeRequest)
      );

      let shouldThrow = false;
      const timeout = setTimeout(() => {
        shouldThrow = true;
      }, 2500);

      while (!state.agentError) {
        if (shouldThrow) {
          throw new Error('Timeout while waiting for error');
        }
        await sleep(100);
      }
      clearTimeout(timeout);

      expect(state.agentError.body).toMatch(/'medplum' is not a valid version/);
      expect(state.gotAgentUpgradeResponse).toStrictEqual(false);

      await app.stop();
      await new Promise<void>((resolve) => {
        mockServer.stop(resolve);
      });

      fetchSpy.mockRestore();
      console.log = originalConsoleLog;
    });

    test('Upgrade -- Already on specified version', async () => {
      const originalConsoleLog = console.log;
      console.log = vi.fn();

      const state = {
        mySocket: undefined as Client | undefined,
        gotAgentUpgradeResponse: false,
        agentError: undefined as AgentError | undefined,
      };

      vi.mocked(platform).mockReturnValue('win32');
      const fetchSpy = mockFetchForUpgrader();

      function mockConnectionHandler(socket: Client): void {
        state.mySocket = socket;
        socket.on('message', (data) => {
          const command = JSON.parse((data as Buffer).toString('utf8')) as AgentMessage;
          switch (command.type) {
            case 'agent:connect:request':
              socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
              break;

            case 'agent:heartbeat:request':
              socket.send(Buffer.from(JSON.stringify({ type: 'agent:heartbeat:response' })));
              break;

            case 'agent:upgrade:response':
              if (command.statusCode !== 200) {
                throw new Error('Invalid status code. Expected 200');
              }
              state.gotAgentUpgradeResponse = true;
              break;

            case 'agent:error':
              state.agentError = command;
              break;

            default:
              throw new Error('Unhandled message type');
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
      await app.start();

      // Wait for the WebSocket to reconnect
      while (!state.mySocket) {
        await sleep(100);
      }

      const targetVersion = MEDPLUM_VERSION.split('-')[0];

      state.mySocket.send(
        JSON.stringify({
          type: 'agent:upgrade:request',
          callback: getReferenceString(agent) + '-' + randomUUID(),
          version: targetVersion,
        } satisfies AgentUpgradeRequest)
      );

      let shouldThrow = false;
      const timeout = setTimeout(() => {
        shouldThrow = true;
      }, 2500);

      while (!state.gotAgentUpgradeResponse) {
        if (shouldThrow) {
          throw new Error('Timeout while waiting for error');
        }
        await sleep(100);
      }
      clearTimeout(timeout);

      expect(state.gotAgentUpgradeResponse).toStrictEqual(true);
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining(
          `Attempted to upgrade to version ${targetVersion}, but agent is already on that version`
        )
      );

      await app.stop();
      await new Promise<void>((resolve) => {
        mockServer.stop(resolve);
      });

      fetchSpy.mockRestore();
      console.log = originalConsoleLog;
    });

    test('Upgrade -- Picks up a newer `latest` after upstream manifest changes', async () => {
      // Regression test: `latest` must never be cached. The agent first issues an upgrade while
      // already on the latest version (a no-op), then upstream publishes a new release that changes
      // `latest.json`. A subsequent upgrade must re-fetch `latest`, observe the new version, and
      // actually upgrade -- if `latest` were cached, the second request would still see the old
      // version and incorrectly no-op until the process restarted.
      clearReleaseCache();

      const originalConsoleLog = console.log;
      console.log = vi.fn();

      let child: MockChildProcess | undefined;

      const state = {
        mySocket: undefined as Client | undefined,
        upgradeResponseCount: 0,
        agentError: undefined as AgentError | undefined,
        disconnectCalled: false,
      };

      // The semver portion of the agent's current version -- `latest` initially resolves to this.
      const currentVersion = MEDPLUM_VERSION.split('-')[0];
      // The newer version that upstream will publish partway through the test.
      const newVersion = '100.0.0';
      // Mutable -- flipped to `newVersion` to simulate upstream publishing a new release.
      let latestVersion = currentVersion;

      vi.mocked(platform).mockReturnValue('win32');
      // `latest.json` resolves to whatever `latestVersion` currently points at; concrete version
      // URLs (e.g. the pre-spawn artifact check) return that same version's manifest.
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
        vi.fn(async (input: string | URL | Request) => {
          if (!(typeof input === 'string' || input instanceof URL)) {
            throw new Error('input must be string or URL object');
          }
          const url = input.toString();
          const version = url.includes('/latest.json') ? latestVersion : newVersion;
          return new Response(JSON.stringify(buildManifest(version)), {
            headers: { 'content-type': 'application/json' },
            status: 200,
          });
        })
      );
      vi.mocked(openSync).mockImplementation(vi.fn(() => 42));
      const writeFileSyncSpy = vi.mocked(writeFileSync).mockImplementation(vi.fn());
      const spawnSpy = vi.mocked(spawn).mockImplementation(function () {
        child = new MockChildProcess();
        child.onDisconnect = () => {
          state.disconnectCalled = true;
        };
        return child;
      });

      function mockConnectionHandler(socket: Client): void {
        state.mySocket = socket;
        socket.on('message', (data) => {
          const command = JSON.parse((data as Buffer).toString('utf8')) as AgentMessage;
          switch (command.type) {
            case 'agent:connect:request':
              socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
              break;

            case 'agent:heartbeat:request':
              socket.send(Buffer.from(JSON.stringify({ type: 'agent:heartbeat:response' })));
              break;

            case 'agent:upgrade:response':
              if (command.statusCode !== 200) {
                throw new Error('Invalid status code. Expected 200');
              }
              state.upgradeResponseCount++;
              break;

            case 'agent:error':
              state.agentError = command;
              break;

            default:
              throw new Error('Unhandled message type');
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
      await app.start();

      // Wait for the WebSocket to reconnect
      while (!state.mySocket) {
        await sleep(100);
      }

      // Each phase gets its own deadline; surfaces any agent error to aid debugging.
      async function waitFor(predicate: () => boolean, description: string): Promise<void> {
        for (let i = 0; i < 25; i++) {
          if (predicate()) {
            return;
          }
          if (state.agentError) {
            throw new Error(`Unexpected agent error while waiting for ${description}: ${state.agentError.body}`);
          }
          await sleep(100);
        }
        throw new Error(`Timeout while waiting for ${description}`);
      }

      // Phase 1: agent is already on the latest version, so this upgrade is a no-op.
      state.mySocket.send(
        JSON.stringify({
          type: 'agent:upgrade:request',
          callback: getReferenceString(agent) + '-' + randomUUID(),
        } satisfies AgentUpgradeRequest)
      );

      await waitFor(() => state.upgradeResponseCount >= 1, 'no-op upgrade response');

      // No upgrade should have been spawned for the no-op
      expect(spawnSpy).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining(
          `Attempted to upgrade to version ${currentVersion}, but agent is already on that version`
        )
      );

      // Phase 2: upstream publishes a new release, changing what `latest.json` returns.
      latestVersion = newVersion;

      const callback = getReferenceString(agent) + '-' + randomUUID();
      state.mySocket.send(
        JSON.stringify({
          type: 'agent:upgrade:request',
          callback,
        } satisfies AgentUpgradeRequest)
      );

      await waitFor(() => Boolean(child), 'child to spawn');

      await sleep(100);
      (child as MockChildProcess).emit('message', { type: 'STARTED' });
      await waitFor(() => state.disconnectCalled, 'disconnect');

      // The second request must re-fetch `latest`, see the new version, and actually upgrade
      expect(spawnSpy).toHaveBeenLastCalledWith(resolve(__dirname, 'app.ts'), ['--upgrade'], {
        detached: true,
        stdio: ['ignore', 42, 42, 'ipc'],
      });
      expect(writeFileSyncSpy).toHaveBeenLastCalledWith(
        resolve(__dirname, 'upgrade.json'),
        JSON.stringify({
          previousVersion: MEDPLUM_VERSION,
          targetVersion: newVersion,
          callback,
        }),
        { encoding: 'utf8', flag: 'w+' }
      );
      // Only the phase 1 no-op produced an upgrade response; phase 2 finalizes after restart
      expect(state.upgradeResponseCount).toStrictEqual(1);
      expect(state.agentError).toBeUndefined();

      await app.stop();
      await new Promise<void>((resolve) => {
        mockServer.stop(resolve);
      });

      fetchSpy.mockRestore();
      console.log = originalConsoleLog;
    });

    test('Upgrade -- Already on specified version (force upgrade)', async () => {
      const originalConsoleLog = console.log;
      console.log = vi.fn();

      const state = {
        mySocket: undefined as Client | undefined,
        gotAgentUpgradeResponse: false,
        disconnectCalled: false,
        agentError: undefined as AgentError | undefined,
      };

      let child!: MockChildProcess;

      const platformSpy = vi.mocked(platform).mockReturnValue('win32');
      const fetchSpy = mockFetchForUpgrader();
      const openSyncSpy = vi.mocked(openSync).mockImplementation(vi.fn(() => 42));
      const writeFileSyncSpy = vi.mocked(writeFileSync).mockImplementation(vi.fn());
      const rmSyncSpy = vi.mocked(rmSync).mockImplementation(vi.fn());
      const spawnSpy = vi.mocked(spawn).mockImplementation(function () {
        child = new MockChildProcess();
        child.onDisconnect = () => {
          state.disconnectCalled = true;
        };
        return child;
      });

      function mockConnectionHandler(socket: Client): void {
        state.mySocket = socket;
        socket.on('message', (data) => {
          const command = JSON.parse((data as Buffer).toString('utf8')) as AgentMessage;
          switch (command.type) {
            case 'agent:connect:request':
              socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
              break;

            case 'agent:heartbeat:request':
              socket.send(Buffer.from(JSON.stringify({ type: 'agent:heartbeat:response' })));
              break;

            case 'agent:upgrade:response':
              if (command.statusCode !== 200) {
                throw new Error('Invalid status code. Expected 200');
              }
              state.gotAgentUpgradeResponse = true;
              break;

            case 'agent:error':
              state.agentError = command;
              break;

            default:
              throw new Error('Unhandled message type');
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
      await app.start();

      // Wait for the WebSocket to reconnect
      while (!state.mySocket) {
        await sleep(100);
      }

      const targetVersion = MEDPLUM_VERSION.split('-')[0];
      const callback = getReferenceString(agent) + '-' + randomUUID();

      state.mySocket.send(
        JSON.stringify({
          type: 'agent:upgrade:request',
          callback,
          version: targetVersion,
          force: true,
        } satisfies AgentUpgradeRequest)
      );

      let shouldThrow = false;
      const timeout = setTimeout(() => {
        shouldThrow = true;
      }, 2500);

      // eslint-disable-next-line no-unmodified-loop-condition
      while (!child) {
        if (shouldThrow) {
          throw new Error('Timeout while waiting for child to spawn');
        }
        await sleep(100);
      }

      child.emit('message', { type: 'STARTED' });
      while (!state.disconnectCalled) {
        if (shouldThrow) {
          throw new Error('Timeout while waiting for disconnect');
        }
        await sleep(100);
      }
      clearTimeout(timeout);

      expect(spawnSpy).toHaveBeenLastCalledWith(
        resolve(__dirname, 'app.ts'),
        ['--upgrade', MEDPLUM_VERSION.split('-')[0]],
        {
          detached: true,
          stdio: ['ignore', 42, 42, 'ipc'],
        }
      );
      expect(openSyncSpy).toHaveBeenCalled();
      expect(child.unref).toHaveBeenCalled();
      expect(child.disconnect).toHaveBeenCalled();

      expect(writeFileSyncSpy).toHaveBeenLastCalledWith(
        resolve(__dirname, 'upgrade.json'),
        JSON.stringify({
          previousVersion: MEDPLUM_VERSION,
          targetVersion,
          callback,
        }),
        { encoding: 'utf8', flag: 'w+' }
      );
      expect(console.log).toHaveBeenLastCalledWith(expect.stringContaining('Closing IPC...'));

      expect(state.agentError).toBeUndefined();

      await app.stop();
      await new Promise<void>((resolve) => {
        mockServer.stop(resolve);
      });

      for (const spy of [platformSpy, fetchSpy, openSyncSpy, writeFileSyncSpy, rmSyncSpy, spawnSpy]) {
        spy.mockRestore();
      }
      console.log = originalConsoleLog;
    });

    test('Upgrade -- Pre-4.2.4', async () => {
      const originalConsoleLog = console.log;
      console.log = vi.fn();

      const state = {
        mySocket: undefined as Client | undefined,
        gotAgentUpgradeResponse: false,
        agentError: undefined as AgentError | undefined,
      };

      vi.mocked(platform).mockReturnValue('win32');
      const fetchSpy = mockFetchForUpgrader();

      function mockConnectionHandler(socket: Client): void {
        state.mySocket = socket;
        socket.on('message', (data) => {
          const command = JSON.parse((data as Buffer).toString('utf8')) as AgentMessage;
          switch (command.type) {
            case 'agent:connect:request':
              socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
              break;

            case 'agent:heartbeat:request':
              socket.send(Buffer.from(JSON.stringify({ type: 'agent:heartbeat:response' })));
              break;

            case 'agent:upgrade:response':
              if (command.statusCode !== 200) {
                throw new Error('Invalid status code. Expected 200');
              }
              state.gotAgentUpgradeResponse = true;
              break;

            case 'agent:error':
              state.agentError = command;
              break;

            default:
              throw new Error('Unhandled message type');
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
      await app.start();

      // Wait for the WebSocket to reconnect
      while (!state.mySocket) {
        await sleep(100);
      }

      const targetVersion = '3.1.6'; // Known pre-4.2.4 version

      state.mySocket.send(
        JSON.stringify({
          type: 'agent:upgrade:request',
          callback: getReferenceString(agent) + '-' + randomUUID(),
          version: targetVersion,
        } satisfies AgentUpgradeRequest)
      );

      let shouldThrow = false;
      const timeout = setTimeout(() => {
        shouldThrow = true;
      }, 2500);

      while (!state.agentError) {
        if (shouldThrow) {
          throw new Error('Timeout while waiting for error');
        }
        await sleep(100);
      }
      clearTimeout(timeout);

      expect(state.agentError?.body).toStrictEqual(
        `WARNING: ${targetVersion} predates the zero-downtime upgrade feature. Downgrading to this version will 1) incur downtime during the downgrade process, as the current agent must stop itself before installing the older agent, and 2) incur downtime on any subsequent upgrade to a later version. We recommend against downgrading to this version, but if you must, reissue the command with force set to true to downgrade.`
      );

      await app.stop();
      await new Promise<void>((resolve) => {
        mockServer.stop(resolve);
      });

      fetchSpy.mockRestore();
      console.log = originalConsoleLog;
    });

    test('Upgrade -- Pre-4.2.4, force = true', async () => {
      const originalConsoleLog = console.log;
      console.log = vi.fn();

      let child!: MockChildProcess;

      const state = {
        mySocket: undefined as Client | undefined,
        agentUpgradeResponse: undefined as AgentUpgradeResponse | undefined,
        agentError: undefined as AgentError | undefined,
        disconnectCalled: false,
      };

      const platformSpy = vi.mocked(platform).mockReturnValue('win32');
      const fetchSpy = mockFetchForUpgrader();
      const openSyncSpy = vi.mocked(openSync).mockImplementation(vi.fn(() => 42));
      const writeFileSyncSpy = vi.mocked(writeFileSync).mockImplementation(vi.fn());
      const rmSyncSpy = vi.mocked(rmSync).mockImplementation(vi.fn());
      const spawnSpy = vi.mocked(spawn).mockImplementation(function () {
        child = new MockChildProcess();
        child.onDisconnect = () => {
          state.disconnectCalled = true;
        };
        return child;
      });

      function mockConnectionHandler(socket: Client): void {
        state.mySocket = socket;
        socket.on('message', (data) => {
          const command = JSON.parse((data as Buffer).toString('utf8')) as AgentMessage;
          switch (command.type) {
            case 'agent:connect:request':
              socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
              break;

            case 'agent:heartbeat:request':
              socket.send(Buffer.from(JSON.stringify({ type: 'agent:heartbeat:response' })));
              break;

            case 'agent:upgrade:response':
              if (command.statusCode !== 200) {
                throw new Error('Invalid status code. Expected 200');
              }
              state.agentUpgradeResponse = command;
              break;

            case 'agent:error':
              state.agentError = command;
              break;

            default:
              throw new Error('Unhandled message type');
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
      await app.start();

      // Wait for the WebSocket to reconnect
      while (!state.mySocket) {
        await sleep(100);
      }

      const callback = getReferenceString(agent) + '-' + randomUUID();

      const targetVersion = '3.1.6';

      state.mySocket.send(
        JSON.stringify({
          type: 'agent:upgrade:request',
          callback,
          version: targetVersion,
          force: true,
        } satisfies AgentUpgradeRequest)
      );

      let shouldThrow = false;
      const timeout = setTimeout(() => {
        shouldThrow = true;
      }, 2500);

      // eslint-disable-next-line no-unmodified-loop-condition
      while (!child) {
        if (shouldThrow) {
          throw new Error('Timeout while waiting for child to spawn');
        }
        await sleep(100);
      }

      child.emit('message', { type: 'STARTED' });
      while (!state.disconnectCalled) {
        if (shouldThrow) {
          throw new Error('Timeout while waiting for disconnect');
        }
        await sleep(100);
      }
      clearTimeout(timeout);

      expect(spawnSpy).toHaveBeenLastCalledWith(resolve(__dirname, 'app.ts'), ['--upgrade', targetVersion], {
        detached: true,
        stdio: ['ignore', 42, 42, 'ipc'],
      });
      expect(openSyncSpy).toHaveBeenCalled();
      expect(child.unref).toHaveBeenCalled();
      expect(child.disconnect).toHaveBeenCalled();

      expect(writeFileSyncSpy).toHaveBeenLastCalledWith(
        resolve(__dirname, 'upgrade.json'),
        JSON.stringify({
          previousVersion: MEDPLUM_VERSION,
          targetVersion,
          callback,
        }),
        { encoding: 'utf8', flag: 'w+' }
      );
      expect(console.log).toHaveBeenLastCalledWith(expect.stringContaining('Closing IPC...'));

      expect(state.agentError).toBeUndefined();

      await app.stop();
      await new Promise<void>((resolve) => {
        mockServer.stop(resolve);
      });

      for (const spy of [platformSpy, fetchSpy, openSyncSpy, writeFileSyncSpy, rmSyncSpy, spawnSpy]) {
        spy.mockRestore();
      }
      console.log = originalConsoleLog;
    });

    test('Upgrade -- Error while starting upgrader', async () => {
      const originalConsoleLog = console.log;
      console.log = vi.fn();

      const state = {
        mySocket: undefined as Client | undefined,
        gotAgentUpgradeResponse: false,
        agentError: undefined as AgentError | undefined,
      };

      vi.mocked(platform).mockReturnValue('win32');
      const fetchSpy = mockFetchForUpgrader();
      const openSyncSpy = vi.mocked(openSync).mockImplementation(
        vi.fn(() => {
          throw new Error('Unable to open file');
        })
      );

      function mockConnectionHandler(socket: Client): void {
        state.mySocket = socket;
        socket.on('message', (data) => {
          const command = JSON.parse((data as Buffer).toString('utf8')) as AgentMessage;
          switch (command.type) {
            case 'agent:connect:request':
              socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
              break;

            case 'agent:heartbeat:request':
              socket.send(Buffer.from(JSON.stringify({ type: 'agent:heartbeat:response' })));
              break;

            case 'agent:upgrade:response':
              if (command.statusCode !== 200) {
                throw new Error('Invalid status code. Expected 200');
              }
              state.gotAgentUpgradeResponse = true;
              break;

            case 'agent:error':
              state.agentError = command;
              break;

            default:
              throw new Error('Unhandled message type');
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
      await app.start();

      // Wait for the WebSocket to reconnect
      while (!state.mySocket) {
        await sleep(100);
      }

      state.mySocket.send(
        JSON.stringify({
          type: 'agent:upgrade:request',
          callback: getReferenceString(agent) + '-' + randomUUID(),
          version: '4.2.4',
        } satisfies AgentUpgradeRequest)
      );

      let shouldThrow = false;
      const timeout = setTimeout(() => {
        shouldThrow = true;
      }, 2500);

      while (!state.agentError) {
        if (shouldThrow) {
          throw new Error('Timeout while waiting for error');
        }
        await sleep(100);
      }
      clearTimeout(timeout);
      expect(state.agentError.body).toStrictEqual("Error during upgrading to version 'v4.2.4': Unable to open file");

      await app.stop();
      await new Promise<void>((resolve) => {
        mockServer.stop(resolve);
      });

      fetchSpy.mockRestore();
      openSyncSpy.mockRestore();
      console.log = originalConsoleLog;
    });

    test('Upgrading -- Manifest present on startup, version is wrong (Error)', async () => {
      const unlinkSyncSpy = vi.mocked(unlinkSync);
      const originalConsoleLog = console.log;
      console.log = vi.fn();
      const createPidFileSpy = vi.spyOn(pidModule, 'createPidFile');

      const state = {
        mySocket: undefined as Client | undefined,
        gotAgentUpgradeResponse: false,
        agentError: undefined as AgentError | undefined,
      };

      writeFileSync(
        resolve(__dirname, 'upgrade.json'),
        JSON.stringify({
          previousVersion: MEDPLUM_VERSION,
          targetVersion: getNextMinorVersion(MEDPLUM_VERSION),
          callback: randomUUID(),
        }),
        { flag: 'w+', encoding: 'utf-8' }
      );

      function mockConnectionHandler(socket: Client): void {
        state.mySocket = socket;
        socket.on('message', (data) => {
          const command = JSON.parse((data as Buffer).toString('utf8')) as AgentMessage;
          switch (command.type) {
            case 'agent:connect:request':
              socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
              break;

            case 'agent:heartbeat:request':
              socket.send(Buffer.from(JSON.stringify({ type: 'agent:heartbeat:response' })));
              break;

            case 'agent:upgrade:response':
              if (command.statusCode !== 200) {
                throw new Error('Invalid status code. Expected 200');
              }
              state.gotAgentUpgradeResponse = true;
              break;

            case 'agent:error':
              state.agentError = command;
              break;

            default:
              throw new Error('Unhandled message type');
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
      await app.start();

      // Wait for the WebSocket to reconnect
      while (!state.mySocket) {
        await sleep(100);
      }

      let shouldThrow = false;
      const timeout = setTimeout(() => {
        shouldThrow = true;
      }, 2500);

      while (!state.agentError) {
        if (shouldThrow) {
          throw new Error('Timeout while waiting for error');
        }
        await sleep(100);
      }
      clearTimeout(timeout);

      expect(state.agentError.body).toMatch(/Failed to upgrade to version*/);
      expect(unlinkSyncSpy).toHaveBeenCalledWith(resolve(__dirname, 'upgrade.json'));
      expect(createPidFileSpy).toHaveBeenCalledWith('medplum-agent');

      await app.stop();
      await new Promise<void>((resolve) => {
        mockServer.stop(resolve);
      });

      createPidFileSpy.mockRestore();
      console.log = originalConsoleLog;
    });

    test('Upgrading -- Manifest present on startup, version is correct (Success)', async () => {
      const unlinkSyncSpy = vi.mocked(unlinkSync);
      const originalConsoleLog = console.log;
      console.log = vi.fn();

      const state = {
        mySocket: undefined as Client | undefined,
        gotAgentUpgradeResponse: false,
        agentError: undefined as AgentError | undefined,
      };

      writeFileSync(
        resolve(__dirname, 'upgrade.json'),
        JSON.stringify({
          previousVersion: getNextMinorVersion('3.0.0'),
          targetVersion: MEDPLUM_VERSION.split('-')[0],
          callback: randomUUID(),
        }),
        { flag: 'w+' }
      );

      function mockConnectionHandler(socket: Client): void {
        state.mySocket = socket;
        socket.on('message', (data) => {
          const command = JSON.parse((data as Buffer).toString('utf8')) as AgentMessage;
          switch (command.type) {
            case 'agent:connect:request':
              socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
              break;

            case 'agent:heartbeat:request':
              socket.send(Buffer.from(JSON.stringify({ type: 'agent:heartbeat:response' })));
              break;

            case 'agent:upgrade:response':
              if (command.statusCode !== 200) {
                throw new Error('Invalid status code. Expected 200');
              }
              state.gotAgentUpgradeResponse = true;
              break;

            case 'agent:error':
              state.agentError = command;
              break;

            default:
              throw new Error('Unhandled message type');
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
      await app.start();

      // Wait for the WebSocket to reconnect
      while (!state.mySocket) {
        await sleep(100);
      }

      let shouldThrow = false;
      const timeout = setTimeout(() => {
        shouldThrow = true;
      }, 2500);

      while (!state.gotAgentUpgradeResponse) {
        if (shouldThrow) {
          throw new Error('Timeout while waiting for error');
        }
        await sleep(100);
      }
      clearTimeout(timeout);

      expect(unlinkSyncSpy).toHaveBeenCalledWith(resolve(__dirname, 'upgrade.json'));

      await app.stop();
      await new Promise<void>((resolve) => {
        mockServer.stop(resolve);
      });

      console.log = originalConsoleLog;
    });

    test('Upgrading -- Manifest present on startup, failed to create agent PID', async () => {
      const unlinkSyncSpy = vi.mocked(unlinkSync);
      const originalConsoleLog = console.log;
      console.log = vi.fn();
      const createPidFileSpy = vi.spyOn(pidModule, 'createPidFile').mockImplementation(() => {
        throw new Error('Unable to create PID');
      });

      const state = {
        mySocket: undefined as Client | undefined,
        gotAgentUpgradeResponse: false,
        agentError: undefined as AgentError | undefined,
        infoLogged: false,
      };

      writeFileSync(
        resolve(__dirname, 'upgrade.json'),
        JSON.stringify({
          previousVersion: getNextMinorVersion('3.0.0'),
          targetVersion: MEDPLUM_VERSION.split('-')[0],
          callback: randomUUID(),
        }),
        { flag: 'w+' }
      );

      function mockConnectionHandler(socket: Client): void {
        state.mySocket = socket;
        socket.on('message', (data) => {
          const command = JSON.parse((data as Buffer).toString('utf8')) as AgentMessage;
          switch (command.type) {
            case 'agent:connect:request':
              socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
              break;

            case 'agent:heartbeat:request':
              socket.send(Buffer.from(JSON.stringify({ type: 'agent:heartbeat:response' })));
              break;

            case 'agent:upgrade:response':
              if (command.statusCode !== 200) {
                throw new Error('Invalid status code. Expected 200');
              }
              state.gotAgentUpgradeResponse = true;
              break;

            case 'agent:error':
              state.agentError = command;
              break;

            default:
              throw new Error('Unhandled message type');
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
      const infoSpy = vi.spyOn(app.log, 'info');
      const appStartPromise = app.start();
      appStartPromise.catch(console.error);

      // Wait for the WebSocket to reconnect
      while (!state.mySocket) {
        await sleep(100);
      }

      let shouldThrow = false;
      let timeout = setTimeout(() => {
        shouldThrow = true;
      }, 2500);

      while (!state.infoLogged) {
        if (shouldThrow) {
          throw new Error('Timeout while waiting for logger.info to be called');
        }
        await sleep(100);
        try {
          expect(infoSpy).toHaveBeenCalledWith('Unable to create agent PID file, trying again...');
          state.infoLogged = true;
        } catch (_err) {
          state.infoLogged = false;
        }
      }
      clearTimeout(timeout);

      timeout = setTimeout(() => {
        shouldThrow = true;
      }, 2500);

      while (!state.gotAgentUpgradeResponse) {
        if (shouldThrow) {
          throw new Error('Timeout while waiting for error');
        }
        await sleep(100);
      }
      clearTimeout(timeout);

      expect(unlinkSyncSpy).toHaveBeenCalledWith(resolve(__dirname, 'upgrade.json'));

      await app.stop();
      await new Promise<void>((resolve) => {
        mockServer.stop(resolve);
      });

      infoSpy.mockRestore();
      createPidFileSpy.mockRestore();
      console.log = originalConsoleLog;
    });

    test('Upgrading -- Ignores transmit requests until it becomes primary', async () => {
      const originalConsoleLog = console.log;
      console.log = vi.fn();

      // Keep the upgrading agent non-primary by failing to acquire the `medplum-agent` PID until
      // we flip this flag, simulating the outgoing agent still owning the PID during the overlap.
      let allowPrimary = false;
      const createPidFileSpy = vi.spyOn(pidModule, 'createPidFile').mockImplementation((appName: string) => {
        if (appName === 'medplum-agent' && !allowPrimary) {
          throw new Error('Unable to create PID');
        }
        return '/tmp/test.pid';
      });

      const state = {
        mySocket: undefined as Client | undefined,
        transmitResponses: [] as AgentTransmitResponse[],
      };

      writeFileSync(
        resolve(__dirname, 'upgrade.json'),
        JSON.stringify({
          previousVersion: getNextMinorVersion('3.0.0'),
          targetVersion: MEDPLUM_VERSION.split('-')[0],
          callback: randomUUID(),
        }),
        { flag: 'w+' }
      );

      function mockConnectionHandler(socket: Client): void {
        state.mySocket = socket;
        socket.on('message', (data) => {
          const command = JSON.parse((data as Buffer).toString('utf8')) as AgentMessage;
          switch (command.type) {
            case 'agent:connect:request':
              socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
              break;
            case 'agent:heartbeat:request':
              socket.send(Buffer.from(JSON.stringify({ type: 'agent:heartbeat:response' })));
              break;
            case 'agent:transmit:response':
              state.transmitResponses.push(command);
              break;
            default:
              break;
          }
        });
      }

      const mockServer = new Server('wss://example.com/ws/agent');
      mockServer.on('connection', mockConnectionHandler);

      const listenerPort = await getFreePort();
      const hl7Messages: Hl7Message[] = [];
      const hl7Server = new Hl7Server((conn) => {
        conn.addEventListener('message', ({ message }) => {
          hl7Messages.push(message);
          conn.send(message.buildAck());
        });
      });
      await hl7Server.start(listenerPort);

      const agent = await medplum.createResource<Agent>({
        resourceType: 'Agent',
        name: 'Test Agent',
        status: 'active',
      });

      const app = new App(medplum, agent.id, LogLevel.INFO);
      const appStartPromise = app.start();
      appStartPromise.catch(console.error);

      // Wait for the WebSocket to connect
      while (!state.mySocket) {
        await sleep(100);
      }

      const transmitRequest = {
        type: 'agent:transmit:request',
        contentType: ContentType.HL7_V2,
        body:
          'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
          'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-\r',
        remote: `mllp://localhost:${listenerPort}`,
        callback: getReferenceString(agent) + '-' + randomUUID(),
      } satisfies AgentTransmitRequest;

      // While non-primary, the transmit request should be dropped: the remote receives nothing and
      // no response comes back. (The outgoing agent is still primary and handles it during overlap.)
      state.mySocket.send(Buffer.from(JSON.stringify(transmitRequest)));
      await sleep(500);
      expect(hl7Messages).toHaveLength(0);
      expect(state.transmitResponses).toHaveLength(0);

      // Now let the agent win the PID and become primary. Wait until the PID is actually acquired
      // (which sets isPrimary) before sending again, since dropped requests are not queued/replayed.
      allowPrimary = true;
      let shouldThrow = false;
      let timeout = setTimeout(() => {
        shouldThrow = true;
      }, 2500);
      while (!createPidFileSpy.mock.results.some((result) => result.type === 'return')) {
        if (shouldThrow) {
          throw new Error('Timeout while waiting for agent to become primary');
        }
        await sleep(50);
      }
      clearTimeout(timeout);

      // The same request should now be forwarded to the remote and acknowledged.
      state.mySocket.send(Buffer.from(JSON.stringify(transmitRequest)));

      shouldThrow = false;
      timeout = setTimeout(() => {
        shouldThrow = true;
      }, 2500);
      while (hl7Messages.length === 0 || state.transmitResponses.length === 0) {
        if (shouldThrow) {
          throw new Error('Timeout while waiting for transmit to be forwarded after becoming primary');
        }
        await sleep(100);
      }
      clearTimeout(timeout);

      expect(hl7Messages).toHaveLength(1);
      expect(state.transmitResponses).toHaveLength(1);

      await hl7Server.stop({ forceDrainTimeoutMs: 100 });
      await app.stop();
      await new Promise<void>((resolve) => {
        mockServer.stop(resolve);
      });

      createPidFileSpy.mockRestore();
      console.log = originalConsoleLog;
    });

    test('Upgrading -- Ignores transmit responses until it becomes primary', async () => {
      const originalConsoleLog = console.log;
      console.log = vi.fn();

      // Keep the upgrading agent non-primary by failing to acquire the `medplum-agent` PID, simulating
      // the outgoing agent still owning the PID during the overlap.
      const createPidFileSpy = vi.spyOn(pidModule, 'createPidFile').mockImplementation((appName: string) => {
        if (appName === 'medplum-agent') {
          throw new Error('Unable to create PID');
        }
        return '/tmp/test.pid';
      });

      const state = {
        mySocket: undefined as Client | undefined,
        agentError: undefined as AgentError | undefined,
      };

      writeFileSync(
        resolve(__dirname, 'upgrade.json'),
        JSON.stringify({
          previousVersion: getNextMinorVersion('3.0.0'),
          targetVersion: MEDPLUM_VERSION.split('-')[0],
          callback: randomUUID(),
        }),
        { flag: 'w+' }
      );

      function mockConnectionHandler(socket: Client): void {
        state.mySocket = socket;
        socket.on('message', (data) => {
          const command = JSON.parse((data as Buffer).toString('utf8')) as AgentMessage;
          switch (command.type) {
            case 'agent:connect:request':
              socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
              break;
            case 'agent:heartbeat:request':
              socket.send(Buffer.from(JSON.stringify({ type: 'agent:heartbeat:response' })));
              break;
            case 'agent:error':
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

      const app = new App(medplum, agent.id, LogLevel.DEBUG);
      const appStartPromise = app.start();
      appStartPromise.catch(console.error);

      // Wait for the WebSocket to connect
      while (!state.mySocket) {
        await sleep(100);
      }

      const debugSpy = vi.spyOn(app.log, 'debug');
      const addToHl7QueueSpy = vi.spyOn(app, 'addToHl7Queue');

      // While non-primary, an inbound transmit response should be dropped before any handling: it is
      // not queued for a channel and produces no disabled/error response back to the server.
      state.mySocket.send(
        Buffer.from(
          JSON.stringify({
            type: 'agent:transmit:response',
            channel: 'test',
            remote: 'mllp://localhost:9999',
            contentType: ContentType.HL7_V2,
            body: 'ACK',
            callback: getReferenceString(agent) + '-' + randomUUID(),
          } satisfies AgentTransmitResponse)
        )
      );

      // Wait for the debug log indicating the response was ignored
      let shouldThrow = false;
      const timeout = setTimeout(() => {
        shouldThrow = true;
      }, 2500);
      while (
        !debugSpy.mock.calls.some((call) => String(call[0]).includes('Ignoring transmit response while not primary'))
      ) {
        if (shouldThrow) {
          throw new Error('Timeout while waiting for transmit response to be ignored');
        }
        await sleep(100);
      }
      clearTimeout(timeout);

      expect(addToHl7QueueSpy).not.toHaveBeenCalled();
      expect(state.agentError).toBeUndefined();

      await app.stop();
      await new Promise<void>((resolve) => {
        mockServer.stop(resolve);
      });

      debugSpy.mockRestore();
      addToHl7QueueSpy.mockRestore();
      createPidFileSpy.mockRestore();
      console.log = originalConsoleLog;
    });

    test('Upgrade -- Missing artifact for platform', async () => {
      vi.mocked(platform).mockReturnValue('win32');

      // Manifest only has a Linux asset, no Windows asset
      const manifest = {
        tag_name: 'v4.2.5',
        assets: [
          {
            name: 'medplum-agent-4.2.5-linux',
            browser_download_url: 'https://example.com/linux',
          },
        ],
      };

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
        vi.fn(async () => {
          return new Response(JSON.stringify(manifest), {
            headers: { 'content-type': 'application/json' },
            status: 200,
          });
        })
      );

      const state = {
        mySocket: undefined as Client | undefined,
        agentError: undefined as AgentError | undefined,
      };

      function mockConnectionHandler(socket: Client): void {
        state.mySocket = socket;
        socket.on('message', (data) => {
          const command = JSON.parse((data as Buffer).toString('utf8')) as AgentMessage;
          switch (command.type) {
            case 'agent:connect:request':
              socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
              break;
            case 'agent:heartbeat:request':
              socket.send(Buffer.from(JSON.stringify({ type: 'agent:heartbeat:response' })));
              break;
            case 'agent:error':
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
      await app.start();

      while (!state.mySocket) {
        await sleep(100);
      }

      state.mySocket.send(
        JSON.stringify({
          type: 'agent:upgrade:request',
          version: '4.2.5',
          callback: getReferenceString(agent) + '-' + randomUUID(),
        } satisfies AgentUpgradeRequest)
      );

      let shouldThrow = false;
      const timeout = setTimeout(() => {
        shouldThrow = true;
      }, 2500);

      while (!state.agentError) {
        if (shouldThrow) {
          throw new Error('Timeout');
        }
        await sleep(100);
      }
      clearTimeout(timeout);

      expect(state.agentError.body).toContain("No download URL found for release 'v4.2.5' for win32");

      await app.stop();
      await new Promise<void>((resolve) => {
        mockServer.stop(resolve);
      });

      fetchSpy.mockRestore();
    });

    test('Upgrading -- deletes manifest before channel listeners finish binding (zero-downtime, no deadlock)', async () => {
      // Regression test for the zero-downtime upgrade deadlock.
      //
      // During a real upgrade, the previous agent keeps listening on the channel ports until the
      // installer stops it -- and the installer only stops it once this (new) agent deletes
      // upgrade.json. So the new agent MUST delete the manifest while its listeners are still
      // trying to bind; if it waited for the binds to finish first, it would deadlock: the ports
      // never free, the manifest is never deleted, and both services run forever.
      //
      // We simulate that here: a blocker server holds the channel's port (standing in for the old
      // agent still listening), and we only release it when upgrade.json is deleted (standing in for
      // the installer stopping the old agent). If start() deferred manifest deletion until after the
      // listeners bound, this test would deadlock and trip the timeout below.
      const originalConsoleLog = console.log;
      console.log = vi.fn();

      const manifestPath = resolve(__dirname, 'upgrade.json');

      // Occupy the channel's port to mimic the previous agent still listening on it.
      const port = await getFreePort();
      const blocker = net.createServer();
      await new Promise<void>((res) => {
        blocker.listen(port, res);
      });

      const state = {
        mySocket: undefined as Client | undefined,
        gotAgentUpgradeResponse: false,
        agentError: undefined as AgentError | undefined,
      };
      // How many channels had bound (and thus registered themselves in `app.channels`) at the moment
      // the manifest was deleted. The fix guarantees this is 0 -- the bind is deferred past deletion.
      let channelsBoundAtManifestDeletion = -1;

      writeFileSync(
        manifestPath,
        JSON.stringify({
          previousVersion: getNextMinorVersion('3.0.0'),
          targetVersion: MEDPLUM_VERSION.split('-')[0],
          callback: randomUUID(),
        }),
        { flag: 'w+' }
      );

      function mockConnectionHandler(socket: Client): void {
        state.mySocket = socket;
        socket.on('message', (data) => {
          const command = JSON.parse((data as Buffer).toString('utf8')) as AgentMessage;
          switch (command.type) {
            case 'agent:connect:request':
              socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
              break;
            case 'agent:heartbeat:request':
              socket.send(Buffer.from(JSON.stringify({ type: 'agent:heartbeat:response' })));
              break;
            case 'agent:upgrade:response':
              if (command.statusCode !== 200) {
                throw new Error('Invalid status code. Expected 200');
              }
              state.gotAgentUpgradeResponse = true;
              break;
            case 'agent:error':
              state.agentError = command;
              break;
            default:
              throw new Error('Unhandled message type');
          }
        });
      }

      const mockServer = new Server('wss://example.com/ws/agent');
      mockServer.on('connection', mockConnectionHandler);

      const bot = await medplum.createResource<Bot>({ resourceType: 'Bot' });
      const endpoint = await medplum.createResource<Endpoint>({
        resourceType: 'Endpoint',
        status: 'active',
        address: `mllp://0.0.0.0:${port}`,
        connectionType: { code: ContentType.HL7_V2 },
        payloadType: [{ coding: [{ code: ContentType.HL7_V2 }] }],
      });

      const agent = await medplum.createResource<Agent>({
        resourceType: 'Agent',
        name: 'Test Agent',
        status: 'active',
        channel: [
          {
            name: 'test',
            endpoint: createReference(endpoint),
            targetReference: createReference(bot),
          },
        ],
      });

      const app = new App(medplum, agent.id, LogLevel.INFO);

      const { unlinkSync: realUnlinkSync } = await vi.importActual<typeof NodeFs>('node:fs');
      const unlinkSyncSpy = vi.mocked(unlinkSync).mockImplementation((path) => {
        if (path === manifestPath) {
          // A channel only registers in `app.channels` once it has successfully bound, so this
          // proves the manifest is deleted while the listener is still (re)trying to bind.
          channelsBoundAtManifestDeletion = app.channels.size;
          // Release the port, mimicking the installer stopping the old agent -- this is what finally
          // lets the new agent's listener win the bind.
          blocker.close();
        }
        realUnlinkSync(path);
      });

      // If the manifest-deletion / bind ordering regresses, start() never resolves; fail with a
      // clear message instead of hanging until the vitest timeout.
      let timeoutHandle: NodeJS.Timeout | undefined;
      const deadlockTimeout = new Promise<never>((_resolve, reject) => {
        timeoutHandle = setTimeout(
          () => reject(new Error('app.start() deadlocked: manifest not deleted before listeners bound')),
          5000
        );
      });
      try {
        await expect(Promise.race([app.start(), deadlockTimeout])).resolves.toBeUndefined();
      } finally {
        clearTimeout(timeoutHandle);
      }

      // The manifest was deleted while the listener was still unbound (deferred bind worked)...
      expect(channelsBoundAtManifestDeletion).toBe(0);
      expect(unlinkSyncSpy).toHaveBeenCalledWith(manifestPath);
      // ...and once the port freed, the listener bound...
      expect(app.channels.size).toBe(1);

      // ...and the upgrade was finalized successfully (the response is delivered asynchronously
      // over the mock WebSocket, so poll for it).
      let waited = 0;
      while (!state.gotAgentUpgradeResponse && waited < 3000) {
        await sleep(50);
        waited += 50;
      }
      expect(state.gotAgentUpgradeResponse).toBe(true);
      expect(state.agentError).toBeUndefined();

      await app.stop();
      await new Promise<void>((res) => {
        mockServer.stop(res);
      });
      if (blocker.listening) {
        await new Promise<void>((res) => {
          blocker.close(() => res());
        });
      }
      console.log = originalConsoleLog;
    });
  });

  test('Upgrading -- Upgrade in progress, should error', async () => {
    const state = {
      mySocket: undefined as Client | undefined,
      gotAgentUpgradeResponse: false,
      agentError: undefined as AgentError | undefined,
      disconnectCalled: false,
    };

    let child!: MockChildProcess;

    const unlinkSyncSpy = vi.mocked(unlinkSync);
    const originalConsoleLog = console.log;
    console.log = vi.fn();
    const createPidFileSpy = vi.spyOn(pidModule, 'createPidFile');
    const platformSpy = vi.mocked(platform).mockReturnValue('win32');
    const fetchSpy = mockFetchForUpgrader();
    const writeFileSyncSpy = vi.mocked(writeFileSync).mockImplementation(vi.fn());
    const spawnSpy = vi.mocked(spawn).mockImplementation(function () {
      child = new MockChildProcess();
      child.onDisconnect = () => {
        state.disconnectCalled = true;
      };
      return child;
    });
    const isAppRunningSpy = vi
      .spyOn(pidModule, 'isAppRunning')
      .mockImplementation((appName: string) => appName === 'medplum-upgrading-agent');

    function mockConnectionHandler(socket: Client): void {
      state.mySocket = socket;
      socket.on('message', (data) => {
        const command = JSON.parse((data as Buffer).toString('utf8')) as AgentMessage;
        switch (command.type) {
          case 'agent:connect:request':
            socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
            break;

          case 'agent:heartbeat:request':
            socket.send(Buffer.from(JSON.stringify({ type: 'agent:heartbeat:response' })));
            break;

          case 'agent:upgrade:response':
            if (command.statusCode !== 200) {
              throw new Error('Invalid status code. Expected 200');
            }
            state.gotAgentUpgradeResponse = true;
            break;

          case 'agent:error':
            state.agentError = command;
            break;

          default:
            throw new Error('Unhandled message type');
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
    await app.start();

    const callback = getReferenceString(agent) + '-' + randomUUID();

    while (!state.mySocket) {
      await sleep(100);
    }

    state.mySocket.send(
      JSON.stringify({
        type: 'agent:upgrade:request',
        callback,
      } satisfies AgentUpgradeRequest)
    );

    let shouldThrow = false;
    const timeout = setTimeout(() => {
      shouldThrow = true;
    }, 2500);

    while (!state.agentError) {
      if (shouldThrow) {
        throw new Error('Timeout while waiting for agent error');
      }
      await sleep(100);
    }
    clearTimeout(timeout);

    expect(state.gotAgentUpgradeResponse).toStrictEqual(false);
    expect(state.agentError.body).toStrictEqual('Pending upgrade is already in progress');
    expect(spawnSpy).not.toHaveBeenCalled();

    await app.stop();
    await new Promise<void>((resolve) => {
      mockServer.stop(resolve);
    });

    for (const spy of [unlinkSyncSpy, createPidFileSpy, platformSpy, fetchSpy, writeFileSyncSpy, isAppRunningSpy]) {
      spy.mockReset();
    }
    console.log = originalConsoleLog;
  });

  test('Upgrading -- Upgrade in progress (force), should start upgrade', async () => {
    const state = {
      mySocket: undefined as Client | undefined,
      gotAgentUpgradeResponse: false,
      agentError: undefined as AgentError | undefined,
      disconnectCalled: false,
    };

    let child!: MockChildProcess;

    const unlinkSyncSpy = vi.mocked(unlinkSync).mockImplementation(vi.fn());
    const originalConsoleLog = console.log;
    console.log = vi.fn();
    const createPidFileSpy = vi.spyOn(pidModule, 'createPidFile');
    const openSyncSpy = vi.mocked(openSync).mockImplementation(vi.fn(() => 42));
    const platformSpy = vi.mocked(platform).mockReturnValue('win32');
    const fetchSpy = mockFetchForUpgrader();
    const writeFileSyncSpy = vi.mocked(writeFileSync).mockImplementation(vi.fn());
    const spawnSpy = vi.mocked(spawn).mockImplementation(function () {
      child = new MockChildProcess();
      child.onDisconnect = () => {
        state.disconnectCalled = true;
      };
      return child;
    });
    const isAppRunningSpy = vi
      .spyOn(pidModule, 'isAppRunning')
      .mockImplementation(
        (appName: string) => appName === 'medplum-upgrading-agent' || appName === 'medplum-agent-upgrader'
      );

    function mockConnectionHandler(socket: Client): void {
      state.mySocket = socket;
      socket.on('message', (data) => {
        const command = JSON.parse((data as Buffer).toString('utf8')) as AgentMessage;
        switch (command.type) {
          case 'agent:connect:request':
            socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
            break;

          case 'agent:heartbeat:request':
            socket.send(Buffer.from(JSON.stringify({ type: 'agent:heartbeat:response' })));
            break;

          case 'agent:upgrade:response':
            if (command.statusCode !== 200) {
              throw new Error('Invalid status code. Expected 200');
            }
            state.gotAgentUpgradeResponse = true;
            break;

          case 'agent:error':
            state.agentError = command;
            break;

          default:
            throw new Error('Unhandled message type');
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
    await app.start();

    // Wait for the WebSocket to reconnect
    while (!state.mySocket) {
      await sleep(100);
    }

    const callback = getReferenceString(agent) + '-' + randomUUID();

    state.mySocket.send(
      JSON.stringify({
        type: 'agent:upgrade:request',
        callback,
        force: true, // Set force to true in order to force the upgrade despite `isAppRunning` returning true for `medplum-upgrading-agent`
      } satisfies AgentUpgradeRequest)
    );

    let shouldThrow = false;
    const timeout = setTimeout(() => {
      shouldThrow = true;
    }, 2500);

    // eslint-disable-next-line no-unmodified-loop-condition
    while (!child) {
      if (shouldThrow) {
        throw new Error('Timeout while waiting for child to spawn');
      }
      await sleep(100);
    }

    await sleep(100);
    child.emit('message', { type: 'STARTED' });
    while (!state.disconnectCalled) {
      if (shouldThrow) {
        throw new Error('Timeout while waiting for disconnect');
      }
      await sleep(100);
    }
    clearTimeout(timeout);

    expect(spawnSpy).toHaveBeenLastCalledWith(resolve(__dirname, 'app.ts'), ['--upgrade'], {
      detached: true,
      stdio: ['ignore', 42, 42, 'ipc'],
    });
    expect(openSyncSpy).toHaveBeenCalled();
    expect(child.unref).toHaveBeenCalled();
    expect(child.disconnect).toHaveBeenCalled();

    expect(writeFileSyncSpy).toHaveBeenLastCalledWith(
      resolve(__dirname, 'upgrade.json'),
      JSON.stringify({
        previousVersion: MEDPLUM_VERSION,
        targetVersion: '4.2.4',
        callback,
      }),
      { encoding: 'utf8', flag: 'w+' }
    );
    expect(console.log).toHaveBeenLastCalledWith(expect.stringContaining('Closing IPC...'));
    expect(state.agentError).toBeUndefined();
    expect(spawnSpy).toHaveBeenCalled();

    await app.stop();
    await new Promise<void>((resolve) => {
      mockServer.stop(resolve);
    });

    for (const spy of [unlinkSyncSpy, createPidFileSpy, platformSpy, fetchSpy, writeFileSyncSpy, isAppRunningSpy]) {
      spy.mockReset();
    }
    console.log = originalConsoleLog;
  });

  test('Upgrading -- Upgrade in progress (force) with no manifest file, should not throw', async () => {
    const state = {
      mySocket: undefined as Client | undefined,
      gotAgentUpgradeResponse: false,
      agentError: undefined as AgentError | undefined,
      disconnectCalled: false,
    };

    let child!: MockChildProcess;

    const manifestPath = resolve(__dirname, 'upgrade.json');
    const { existsSync: realExistsSync } = await vi.importActual<typeof NodeFs>('node:fs');
    // Manifest does not exist on disk; the upgrade is only "in progress" because an upgrader process is running
    const existsSyncSpy = vi
      .mocked(existsSync)
      .mockImplementation((path) => (path === manifestPath ? false : realExistsSync(path)));
    // Mimic the real fs behavior: unlinking a non-existent file throws ENOENT.
    // The fix must guard with existsSync so this is never reached for the missing manifest.
    const unlinkSyncSpy = vi.mocked(unlinkSync).mockImplementation((path) => {
      throw Object.assign(new Error(`ENOENT: no such file or directory, unlink '${String(path)}'`), {
        code: 'ENOENT',
      });
    });
    const originalConsoleLog = console.log;
    console.log = vi.fn();
    const createPidFileSpy = vi.spyOn(pidModule, 'createPidFile');
    const openSyncSpy = vi.mocked(openSync).mockImplementation(vi.fn(() => 42));
    const platformSpy = vi.mocked(platform).mockReturnValue('win32');
    const fetchSpy = mockFetchForUpgrader();
    const writeFileSyncSpy = vi.mocked(writeFileSync).mockImplementation(vi.fn());
    const spawnSpy = vi.mocked(spawn).mockImplementation(function () {
      child = new MockChildProcess();
      child.onDisconnect = () => {
        state.disconnectCalled = true;
      };
      return child;
    });
    // Report the upgrader process as running so the agent considers an upgrade "in progress",
    // even though the manifest file does not exist (existsSync mocked to false above)
    const isAppRunningSpy = vi
      .spyOn(pidModule, 'isAppRunning')
      .mockImplementation(
        (appName: string) => appName === 'medplum-upgrading-agent' || appName === 'medplum-agent-upgrader'
      );

    function mockConnectionHandler(socket: Client): void {
      state.mySocket = socket;
      socket.on('message', (data) => {
        const command = JSON.parse((data as Buffer).toString('utf8')) as AgentMessage;
        switch (command.type) {
          case 'agent:connect:request':
            socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
            break;

          case 'agent:heartbeat:request':
            socket.send(Buffer.from(JSON.stringify({ type: 'agent:heartbeat:response' })));
            break;

          case 'agent:upgrade:response':
            if (command.statusCode !== 200) {
              throw new Error('Invalid status code. Expected 200');
            }
            state.gotAgentUpgradeResponse = true;
            break;

          case 'agent:error':
            state.agentError = command;
            break;

          default:
            throw new Error('Unhandled message type');
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
    await app.start();

    // Wait for the WebSocket to reconnect
    while (!state.mySocket) {
      await sleep(100);
    }

    const callback = getReferenceString(agent) + '-' + randomUUID();

    state.mySocket.send(
      JSON.stringify({
        type: 'agent:upgrade:request',
        callback,
        force: true,
      } satisfies AgentUpgradeRequest)
    );

    let shouldThrow = false;
    const timeout = setTimeout(() => {
      shouldThrow = true;
    }, 2500);

    // eslint-disable-next-line no-unmodified-loop-condition
    while (!child) {
      if (shouldThrow) {
        throw new Error('Timeout while waiting for child to spawn');
      }
      await sleep(100);
    }

    await sleep(100);
    child.emit('message', { type: 'STARTED' });
    while (!state.disconnectCalled) {
      if (shouldThrow) {
        throw new Error('Timeout while waiting for disconnect');
      }
      await sleep(100);
    }
    clearTimeout(timeout);

    // The upgrade should proceed without ever attempting to unlink the (non-existent) manifest
    expect(unlinkSyncSpy).not.toHaveBeenCalledWith(manifestPath);
    expect(state.agentError).toBeUndefined();
    expect(spawnSpy).toHaveBeenCalled();
    expect(child.disconnect).toHaveBeenCalled();

    await app.stop();
    await new Promise<void>((resolve) => {
      mockServer.stop(resolve);
    });

    for (const spy of [
      existsSyncSpy,
      unlinkSyncSpy,
      createPidFileSpy,
      openSyncSpy,
      platformSpy,
      fetchSpy,
      writeFileSyncSpy,
      isAppRunningSpy,
    ]) {
      spy.mockReset();
    }
    console.log = originalConsoleLog;
  });

  test('App#stop should close all persistent HL7 clients', async () => {
    const originalConsoleLog = console.log;
    console.log = vi.fn();

    const state = {
      mySocket: undefined as Client | undefined,
      transmitResponses: [] as AgentTransmitRequest[],
    };

    const mockServer = new Server('wss://example.com/ws/agent');
    mockServer.on('connection', (socket) => {
      state.mySocket = socket;
      socket.on('message', (data) => {
        const command = JSON.parse((data as Buffer).toString('utf8')) as AgentMessage;
        if (command.type === 'agent:connect:request') {
          socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
        } else if (command.type === 'agent:transmit:request') {
          state.transmitResponses.push(command);
        }
      });
    });

    // Create an agent with keepAlive enabled
    const agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      name: 'Test Agent',
      status: 'active',
      setting: [{ name: 'keepAlive', valueBoolean: true }],
    });

    const app = new App(medplum, agent.id, LogLevel.INFO);
    await app.start();

    // Wait for WebSocket to connect
    while (!state.mySocket) {
      await sleep(100);
    }

    const port1 = await getFreePort();
    const port2 = await getFreePort();

    // Start multiple HL7 servers to create multiple persistent clients
    const hl7Server1 = new Hl7Server((conn) => {
      conn.addEventListener('message', ({ message }) => {
        conn.send(message.buildAck());
      });
    });
    await hl7Server1.start(port1);

    const hl7Server2 = new Hl7Server((conn) => {
      conn.addEventListener('message', ({ message }) => {
        conn.send(message.buildAck());
      });
    });
    await hl7Server2.start(port2);

    // Wait for servers to start listening
    while (!hl7Server1.server?.listening || !hl7Server2.server?.listening) {
      await sleep(100);
    }

    // Send messages to create persistent clients
    const hl7MessageBody =
      'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
      'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-\r' +
      'NK1|1|JONES^BARBARA^K|SPO|||||20011105\r' +
      'PV1|1|I|2000^2012^01||||004777^LEBAUER^SIDNEY^J.|||SUR||-||1|A0-';

    state.mySocket.send(
      Buffer.from(
        JSON.stringify({
          type: 'agent:transmit:request',
          contentType: ContentType.HL7_V2,
          body: hl7MessageBody,
          remote: `mllp://localhost:${port1}`,
          callback: getReferenceString(agent) + '-' + randomUUID(),
        } satisfies AgentTransmitRequest)
      )
    );

    state.mySocket.send(
      Buffer.from(
        JSON.stringify({
          type: 'agent:transmit:request',
          contentType: ContentType.HL7_V2,
          body: hl7MessageBody,
          remote: `mllp://localhost:${port2}`,
          callback: getReferenceString(agent) + '-' + randomUUID(),
        } satisfies AgentTransmitRequest)
      )
    );

    while (app.hl7Clients.size !== 2) {
      await sleep(100);
    }

    // Verify that persistent clients were created
    expect(app.hl7Clients.size).toStrictEqual(2);

    // Spy on pool.closeAll() to verify it's called
    const closeAllSpies = Array.from(app.hl7Clients.values()).map((pool) => vi.spyOn(pool, 'closeAll'));

    // Stop the app
    await app.stop();

    expect(app.hl7Clients.size).toStrictEqual(0);

    // Verify that close was called on all clients
    for (const closeSpy of closeAllSpies) {
      expect(closeSpy).toHaveBeenCalled();
    }

    // Clean up
    await hl7Server1.stop({ forceDrainTimeoutMs: 100 });
    await hl7Server2.stop({ forceDrainTimeoutMs: 100 });
    await new Promise<void>((resolve) => {
      mockServer.stop(resolve);
    });

    console.log = originalConsoleLog;
  });

  test('Pool persists in hl7Clients after client error — only cleared on keepAlive change', async () => {
    const originalConsoleLog = console.log;
    console.log = vi.fn();

    const state = {
      mySocket: undefined as Client | undefined,
      transmitResponses: [] as AgentTransmitResponse[],
    };

    const mockServer = new Server('wss://example.com/ws/agent');
    mockServer.on('connection', (socket) => {
      state.mySocket = socket;
      socket.on('message', (data) => {
        const command = JSON.parse((data as Buffer).toString('utf8')) as AgentMessage;
        if (command.type === 'agent:connect:request') {
          socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
        } else if (command.type === 'agent:transmit:response') {
          state.transmitResponses.push(command);
        }
      });
    });

    // Create agent with keepAlive enabled
    const agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      name: 'Test Agent',
      status: 'active',
      setting: [{ name: 'keepAlive', valueBoolean: true }],
    });

    const app = new App(medplum, agent.id, LogLevel.INFO);
    await app.start();

    while (!state.mySocket) {
      await sleep(100);
    }

    // Start an HL7 server that ACKs messages
    const hl7Server = new Hl7Server((conn) => {
      conn.addEventListener('message', ({ message }) => {
        conn.send(message.buildAck());
      });
    });
    await hl7Server.start(57110);

    const hl7MessageBody =
      'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
      'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-';

    // Send a transmit request to create a pool
    state.mySocket.send(
      Buffer.from(
        JSON.stringify({
          type: 'agent:transmit:request',
          contentType: ContentType.HL7_V2,
          body: hl7MessageBody,
          remote: 'mllp://localhost:57110',
          callback: getReferenceString(agent) + '-' + randomUUID(),
        } satisfies AgentTransmitRequest)
      )
    );

    // Wait for the response
    while (state.transmitResponses.length < 1) {
      await sleep(100);
    }

    // Pool should exist
    expect(app.hl7Clients.size).toBe(1);
    expect(app.hl7Clients.has('mllp://localhost:57110')).toBe(true);

    // Stop the HL7 server — this closes connections from the server side
    await hl7Server.stop();

    // Wait for the close to propagate (client removed from pool, but pool stays)
    await sleep(200);

    // Pool should STILL be in hl7Clients — it is never removed by client errors
    expect(app.hl7Clients.size).toBe(1);
    expect(app.hl7Clients.has('mllp://localhost:57110')).toBe(true);

    // The pool should have no clients (they were removed when the connection closed)
    const pool = app.hl7Clients.get('mllp://localhost:57110') as Hl7ClientPool;
    expect(pool.size()).toBe(0);

    // Restart the HL7 server
    const hl7Server2 = new Hl7Server((conn) => {
      conn.addEventListener('message', ({ message }) => {
        conn.send(message.buildAck());
      });
    });
    await hl7Server2.start(57110);

    // Send another transmit request — should succeed using the same pool
    state.transmitResponses = [];
    state.mySocket.send(
      Buffer.from(
        JSON.stringify({
          type: 'agent:transmit:request',
          contentType: ContentType.HL7_V2,
          body: hl7MessageBody.replace('MSG00001', 'MSG00002'),
          remote: 'mllp://localhost:57110',
          callback: getReferenceString(agent) + '-' + randomUUID(),
        } satisfies AgentTransmitRequest)
      )
    );

    while (state.transmitResponses.length < 1) {
      await sleep(100);
    }

    // Pool should still be the same one — not recreated
    expect(app.hl7Clients.size).toBe(1);
    expect(app.hl7Clients.get('mllp://localhost:57110')).toBe(pool);

    // The second transmit should have succeeded
    expect(state.transmitResponses[0].statusCode).toBe(200);

    await app.stop();
    await hl7Server2.stop();
    await new Promise<void>((resolve) => {
      mockServer.stop(resolve);
    });

    console.log = originalConsoleLog;
  }, 15_000);

  describe('Stats tracking for HL7 clients', () => {
    test('When keepAlive is off, clients should not track stats', async () => {
      const originalConsoleLog = console.log;
      console.log = vi.fn();

      const state = {
        mySocket: undefined as Client | undefined,
        transmitResponses: [] as AgentTransmitResponse[],
      };

      const mockServer = new Server('wss://example.com/ws/agent');
      mockServer.on('connection', (socket) => {
        state.mySocket = socket;
        socket.on('message', (data) => {
          const command = JSON.parse((data as Buffer).toString('utf8')) as AgentMessage;
          if (command.type === 'agent:connect:request') {
            socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
          } else if (command.type === 'agent:transmit:response') {
            state.transmitResponses.push(command);
          }
        });
      });

      // Create agent with keepAlive = false and logStatsFreqSecs > 0
      const agent = await medplum.createResource<Agent>({
        resourceType: 'Agent',
        name: 'Test Agent',
        status: 'active',
        setting: [
          { name: 'keepAlive', valueBoolean: false },
          { name: 'logStatsFreqSecs', valueInteger: 60 },
        ],
      });

      const app = new App(medplum, agent.id, LogLevel.INFO);
      await app.start();

      // Wait for WebSocket to connect
      while (!state.mySocket) {
        await sleep(100);
      }

      const port = await getFreePort();

      // Start HL7 server
      const hl7Server = new Hl7Server((conn) => {
        conn.addEventListener('message', ({ message }) => {
          conn.send(message.buildAck());
        });
      });
      await hl7Server.start(port);

      // Send a message
      const hl7MessageBody =
        'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
        'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-';

      const wsClient = state.mySocket;
      wsClient.send(
        Buffer.from(
          JSON.stringify({
            type: 'agent:transmit:request',
            remote: `mllp://localhost:${port}`,
            contentType: ContentType.HL7_V2,
            body: hl7MessageBody,
            callback: 'my-callback-id',
          } satisfies AgentTransmitRequest)
        )
      );

      // Wait for response
      while (state.transmitResponses.length === 0) {
        await sleep(100);
      }

      const pool = app.hl7Clients.get(`mllp://localhost:${port}`) as Hl7ClientPool;

      // Run client GC manually
      pool.runClientGc();

      // Client should not be in the hl7Clients map (because keepAlive is false)
      expect(pool.size()).toStrictEqual(0);

      await app.stop();
      await hl7Server.stop({ forceDrainTimeoutMs: 100 });
      await new Promise<void>((resolve) => {
        mockServer.stop(resolve);
      });

      console.log = originalConsoleLog;
    });

    test('When keepAlive is on, clients should track stats as messages are sent', async () => {
      const originalConsoleLog = console.log;
      console.log = vi.fn();

      const state = {
        mySocket: undefined as Client | undefined,
        transmitResponses: [] as AgentMessage[],
      };

      const mockServer = new Server('wss://example.com/ws/agent');
      mockServer.on('connection', (socket) => {
        state.mySocket = socket;
        socket.on('message', (data) => {
          const command = JSON.parse((data as Buffer).toString('utf8')) as AgentMessage;
          if (command.type === 'agent:connect:request') {
            socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
          } else if (command.type === 'agent:transmit:response') {
            state.transmitResponses.push(command);
          }
        });
      });

      // Create agent with keepAlive = true and logStatsFreqSecs > 0
      const agent = await medplum.createResource<Agent>({
        resourceType: 'Agent',
        name: 'Test Agent',
        status: 'active',
        setting: [
          { name: 'keepAlive', valueBoolean: true },
          { name: 'logStatsFreqSecs', valueInteger: 1 },
        ],
      });

      const app = new App(medplum, agent.id, LogLevel.INFO);
      await app.start();

      // Wait for WebSocket to connect
      while (!state.mySocket) {
        await sleep(100);
      }

      const port = await getFreePort();

      // Start HL7 server
      const hl7Server = new Hl7Server((conn) => {
        conn.addEventListener('message', ({ message }) => {
          conn.send(message.buildAck());
        });
      });
      await hl7Server.start(port);

      // Send a message
      const hl7MessageBody =
        'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
        'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-';

      const wsClient = state.mySocket;
      wsClient.send(
        Buffer.from(
          JSON.stringify({
            type: 'agent:transmit:request',
            remote: `mllp://localhost:${port}`,
            contentType: ContentType.HL7_V2,
            body: hl7MessageBody,
            callback: 'my-callback-id',
          } satisfies AgentTransmitRequest)
        )
      );

      // Wait for response
      while (state.transmitResponses.length === 0) {
        await sleep(100);
      }

      // Pool should be in the hl7Clients map and should have stats tracking
      expect(app.hl7Clients.size).toBe(1);
      const pool = app.hl7Clients.get(`mllp://localhost:${port}`);
      expect(pool).toBeDefined();
      const client = pool?.getClients()[0];
      expect(client?.stats).toBeDefined();
      expect(client?.stats?.getSampleCount()).toBe(1);

      // Wait at least 1000 ms since we are logging stats every 1 sec
      await sleep(1000);

      await app.stop();
      await hl7Server.stop({ forceDrainTimeoutMs: 100 });
      await new Promise<void>((resolve) => {
        mockServer.stop(resolve);
      });

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Agent stats'));
      console.log = originalConsoleLog;
    });

    test('When keepAlive goes from on to off, cleanup stats for all open clients', async () => {
      const originalConsoleLog = console.log;
      console.log = vi.fn();

      const state = {
        mySocket: undefined as Client | undefined,
        transmitResponses: [] as AgentMessage[],
        reloadConfigResponse: null as any,
      };

      const mockServer = new Server('wss://example.com/ws/agent');
      mockServer.on('connection', (socket) => {
        state.mySocket = socket;
        socket.on('message', (data) => {
          const command = JSON.parse((data as Buffer).toString('utf8')) as AgentMessage;
          if (command.type === 'agent:connect:request') {
            socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
          } else if (command.type === 'agent:transmit:response') {
            state.transmitResponses.push(command);
          } else if (command.type === 'agent:reloadconfig:response') {
            state.reloadConfigResponse = command;
          }
        });
      });

      // Create agent with keepAlive = true and logStatsFreqSecs > 0
      const agent = await medplum.createResource<Agent>({
        resourceType: 'Agent',
        name: 'Test Agent',
        status: 'active',
        setting: [
          { name: 'keepAlive', valueBoolean: true },
          { name: 'logStatsFreqSecs', valueInteger: 60 },
        ],
      });

      const app = new App(medplum, agent.id, LogLevel.INFO);
      await app.start();

      // Wait for WebSocket to connect
      while (!state.mySocket) {
        await sleep(100);
      }

      const port1 = await getFreePort();
      const port2 = await getFreePort();

      // Start HL7 servers
      const hl7Server1 = new Hl7Server((conn) => {
        conn.addEventListener('message', ({ message }) => {
          conn.send(message.buildAck());
        });
      });
      await hl7Server1.start(port1);

      const hl7Server2 = new Hl7Server((conn) => {
        conn.addEventListener('message', ({ message }) => {
          conn.send(message.buildAck());
        });
      });
      await hl7Server2.start(port2);

      // Wait for servers to start listening
      while (!hl7Server1.server?.listening || !hl7Server2.server?.listening) {
        await sleep(100);
      }

      // Send messages to create clients
      const hl7MessageBody =
        'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
        'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-';

      const wsClient = state.mySocket;
      wsClient.send(
        Buffer.from(
          JSON.stringify({
            type: 'agent:transmit:request',
            remote: `mllp://localhost:${port1}`,
            contentType: ContentType.HL7_V2,
            body: hl7MessageBody,
            callback: 'callback-1',
          } satisfies AgentTransmitRequest)
        )
      );

      wsClient.send(
        Buffer.from(
          JSON.stringify({
            type: 'agent:transmit:request',
            remote: `mllp://localhost:${port2}`,
            contentType: ContentType.HL7_V2,
            body: hl7MessageBody,
            callback: 'callback-2',
          } satisfies AgentTransmitRequest)
        )
      );

      // Wait for responses
      while (state.transmitResponses.length < 2) {
        await sleep(100);
      }

      // Should have 2 pools
      expect(app.hl7Clients.size).toBe(2);

      // Update agent to disable keepAlive
      await medplum.updateResource<Agent>({
        ...agent,
        setting: [
          { name: 'keepAlive', valueBoolean: false },
          { name: 'logStatsFreqSecs', valueInteger: 60 },
        ],
      });

      // Trigger reload
      wsClient.send(
        Buffer.from(
          JSON.stringify({
            type: 'agent:reloadconfig:request',
          } satisfies AgentReloadConfigRequest)
        )
      );

      // Wait for reload to complete
      while (!state.reloadConfigResponse) {
        await sleep(100);
      }

      // All clients should be closed and removed
      expect(app.hl7Clients.size).toBe(0);

      await app.stop();
      await hl7Server1.stop({ forceDrainTimeoutMs: 100 });
      await hl7Server2.stop({ forceDrainTimeoutMs: 100 });
      await new Promise<void>((resolve) => {
        mockServer.stop(resolve);
      });

      console.log = originalConsoleLog;
    });

    test('When logStatsFreqSecs goes from on to off, pool keeps tracking stats (default-on)', async () => {
      const originalConsoleLog = console.log;
      console.log = vi.fn();

      const state = {
        mySocket: undefined as Client | undefined,
        transmitResponses: [] as AgentMessage[],
        reloadConfigResponse: null as any,
      };

      const mockServer = new Server('wss://example.com/ws/agent');
      mockServer.on('connection', (socket) => {
        state.mySocket = socket;
        socket.on('message', (data) => {
          const command = JSON.parse((data as Buffer).toString('utf8')) as AgentMessage;
          if (command.type === 'agent:connect:request') {
            socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
          } else if (command.type === 'agent:transmit:response') {
            state.transmitResponses.push(command);
          } else if (command.type === 'agent:reloadconfig:response') {
            state.reloadConfigResponse = command;
          }
        });
      });

      // Create agent with keepAlive = true and logStatsFreqSecs > 0
      const agent = await medplum.createResource<Agent>({
        resourceType: 'Agent',
        name: 'Test Agent',
        status: 'active',
        setting: [
          { name: 'keepAlive', valueBoolean: true },
          { name: 'logStatsFreqSecs', valueInteger: 60 },
        ],
      });

      const app = new App(medplum, agent.id, LogLevel.INFO);
      await app.start();

      // Wait for WebSocket to connect
      while (!state.mySocket) {
        await sleep(100);
      }

      const port = await getFreePort();

      // Start HL7 server
      const hl7Server = new Hl7Server((conn) => {
        conn.addEventListener('message', ({ message }) => {
          conn.send(message.buildAck());
        });
      });
      await hl7Server.start(port);

      // Send a message
      const hl7MessageBody =
        'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
        'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-';

      const wsClient = state.mySocket;
      wsClient.send(
        Buffer.from(
          JSON.stringify({
            type: 'agent:transmit:request',
            remote: `mllp://localhost:${port}`,
            contentType: ContentType.HL7_V2,
            body: hl7MessageBody,
            callback: 'my-callback-id',
          } satisfies AgentTransmitRequest)
        )
      );

      // Wait for response
      while (state.transmitResponses.length === 0) {
        await sleep(100);
      }

      // Pool should exist
      expect(app.hl7Clients.size).toBe(1);

      // Update agent to disable logStatsFreqSecs
      await medplum.updateResource<Agent>({
        ...agent,
        setting: [{ name: 'keepAlive', valueBoolean: true }],
      });

      // Trigger reload
      wsClient.send(
        Buffer.from(
          JSON.stringify({
            type: 'agent:reloadconfig:request',
          } satisfies AgentReloadConfigRequest)
        )
      );

      // Wait for reload to complete
      while (!state.reloadConfigResponse) {
        await sleep(100);
      }

      // Pool should still exist (stats are collected by default)
      expect(app.hl7Clients.size).toBe(1);

      await app.stop();
      await hl7Server.stop({ forceDrainTimeoutMs: 100 });
      await new Promise<void>((resolve) => {
        mockServer.stop(resolve);
      });

      console.log = originalConsoleLog;
    });

    test('Pool tracks stats by default when keepAlive is on, regardless of logStatsFreqSecs', async () => {
      const originalConsoleLog = console.log;
      console.log = vi.fn();

      const state = {
        mySocket: undefined as Client | undefined,
        transmitResponses: [] as AgentMessage[],
        reloadConfigResponse: null as any,
      };

      const mockServer = new Server('wss://example.com/ws/agent');
      mockServer.on('connection', (socket) => {
        state.mySocket = socket;
        socket.on('message', (data) => {
          const command = JSON.parse((data as Buffer).toString('utf8')) as AgentMessage;
          if (command.type === 'agent:connect:request') {
            socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
          } else if (command.type === 'agent:transmit:response') {
            state.transmitResponses.push(command);
          } else if (command.type === 'agent:reloadconfig:response') {
            state.reloadConfigResponse = command;
          }
        });
      });

      // Create agent with keepAlive = true
      const agent = await medplum.createResource<Agent>({
        resourceType: 'Agent',
        name: 'Test Agent',
        status: 'active',
        setting: [{ name: 'keepAlive', valueBoolean: true }],
      });

      const app = new App(medplum, agent.id, LogLevel.INFO);
      await app.start();

      // Wait for WebSocket to connect
      while (!state.mySocket) {
        await sleep(100);
      }

      const port = await getFreePort();

      // Start HL7 server
      const hl7Server = new Hl7Server((conn) => {
        conn.addEventListener('message', ({ message }) => {
          conn.send(message.buildAck());
        });
      });
      await hl7Server.start(port);

      // Send a message
      const hl7MessageBody =
        'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
        'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-';

      const wsClient = state.mySocket;
      wsClient.send(
        Buffer.from(
          JSON.stringify({
            type: 'agent:transmit:request',
            remote: `mllp://localhost:${port}`,
            contentType: ContentType.HL7_V2,
            body: hl7MessageBody,
            callback: 'my-callback-id',
          } satisfies AgentTransmitRequest)
        )
      );

      // Wait for response
      while (state.transmitResponses.length === 0) {
        await sleep(100);
      }

      // Pool should exist and have stats tracking enabled by default
      expect(app.hl7Clients.size).toBe(1);
      let pool = app.hl7Clients.get(`mllp://localhost:${port}`);

      // Update agent to enable logStatsFreqSecs
      await medplum.updateResource<Agent>({
        ...agent,
        setting: [
          { name: 'keepAlive', valueBoolean: true },
          { name: 'logStatsFreqSecs', valueInteger: 60 },
        ],
      });

      // Trigger reload
      wsClient.send(
        Buffer.from(
          JSON.stringify({
            type: 'agent:reloadconfig:request',
          } satisfies AgentReloadConfigRequest)
        )
      );

      // Wait for reload to complete
      while (!state.reloadConfigResponse) {
        await sleep(100);
      }

      // Pool should now have stats tracking enabled
      expect(app.hl7Clients.size).toBe(1);
      pool = app.hl7Clients.get(`mllp://localhost:${port}`);

      // Send another message to verify stats tracking works
      state.transmitResponses = [];
      const hl7MessageBody2 =
        'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00002|P|2.2\r' +
        'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-';

      wsClient.send(
        Buffer.from(
          JSON.stringify({
            type: 'agent:transmit:request',
            remote: `mllp://localhost:${port}`,
            contentType: ContentType.HL7_V2,
            body: hl7MessageBody2,
            callback: 'my-callback-id-2',
          } satisfies AgentTransmitRequest)
        )
      );

      // Wait for response
      while (state.transmitResponses.length === 0) {
        await sleep(100);
      }

      // Stats should have recorded both messages (tracking is on from the start)
      const client = pool?.getClients()[0];
      expect(client?.stats?.getSampleCount()).toBe(2);

      await app.stop();
      await hl7Server.stop({ forceDrainTimeoutMs: 100 });
      await new Promise<void>((resolve) => {
        mockServer.stop(resolve);
      });

      console.log = originalConsoleLog;
    });
  });

  describe('returnAck handling in pushMessage', () => {
    test('Uses default of FIRST when no returnAck options are specified', async () => {
      const originalConsoleLog = console.log;
      console.log = vi.fn();

      const state = {
        mySocket: undefined as Client | undefined,
        transmitResponses: [] as AgentTransmitResponse[],
      };

      const mockServer = new Server('wss://example.com/ws/agent');
      mockServer.on('connection', (socket) => {
        state.mySocket = socket;
        socket.on('message', (data) => {
          const command = JSON.parse((data as Buffer).toString('utf8')) as AgentMessage;
          if (command.type === 'agent:connect:request') {
            socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
          } else if (command.type === 'agent:transmit:response') {
            state.transmitResponses.push(command);
          }
        });
      });

      const agent = await medplum.createResource<Agent>({
        resourceType: 'Agent',
        name: 'Test Agent',
        status: 'active',
      });

      const app = new App(medplum, agent.id, LogLevel.INFO);
      await app.start();

      while (!state.mySocket) {
        await sleep(100);
      }

      const port = await getFreePort();

      // Start HL7 server that sends CA (commit ack) first, then AA (application ack)
      const hl7Server = new Hl7Server((conn) => {
        conn.addEventListener('message', ({ message }) => {
          // First send a CA (commit ack), then AA (application ack)
          const caAck = message.buildAck({ ackCode: 'CA' });
          conn.send(caAck);
          // Delay slightly before sending the AA
          setTimeout(() => {
            const aaAck = message.buildAck({ ackCode: 'AA' });
            conn.send(aaAck);
          }, 50);
        });
      });
      await hl7Server.start(port);

      const hl7MessageBody =
        'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
        'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-';

      const wsClient = state.mySocket;
      wsClient.send(
        Buffer.from(
          JSON.stringify({
            type: 'agent:transmit:request',
            remote: `mllp://localhost:${port}`,
            contentType: ContentType.HL7_V2,
            body: hl7MessageBody,
            callback: 'test-callback',
          } satisfies AgentTransmitRequest)
        )
      );

      // Wait for response
      while (state.transmitResponses.length === 0) {
        await sleep(50);
      }

      // With FIRST (default), should return the CA immediately
      expect(state.transmitResponses.length).toBe(1);
      const response = Hl7Message.parse(state.transmitResponses[0].body);
      const ackCode = response.getSegment('MSA')?.getField(1)?.toString();
      expect(ackCode).toBe('CA');

      await app.stop();
      await hl7Server.stop({ forceDrainTimeoutMs: 100 });
      await new Promise<void>((resolve) => {
        mockServer.stop(resolve);
      });

      console.log = originalConsoleLog;
    });

    test('Uses per-message returnAck when specified', async () => {
      const originalConsoleLog = console.log;
      console.log = vi.fn();

      const state = {
        mySocket: undefined as Client | undefined,
        transmitResponses: [] as AgentTransmitResponse[],
      };

      const mockServer = new Server('wss://example.com/ws/agent');
      mockServer.on('connection', (socket) => {
        state.mySocket = socket;
        socket.on('message', (data) => {
          const command = JSON.parse((data as Buffer).toString('utf8')) as AgentMessage;
          if (command.type === 'agent:connect:request') {
            socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
          } else if (command.type === 'agent:transmit:response') {
            state.transmitResponses.push(command);
          }
        });
      });

      const agent = await medplum.createResource<Agent>({
        resourceType: 'Agent',
        name: 'Test Agent',
        status: 'active',
      });

      const app = new App(medplum, agent.id, LogLevel.INFO);
      await app.start();

      while (!state.mySocket) {
        await sleep(100);
      }

      const port = await getFreePort();

      // Start HL7 server that sends CA first, then AA
      const hl7Server = new Hl7Server((conn) => {
        conn.addEventListener('message', ({ message }) => {
          // First send a CA (commit ack), then AA (application ack)
          const caAck = message.buildAck({ ackCode: 'CA' });
          conn.send(caAck);
          // Delay before sending the AA
          setTimeout(() => {
            const aaAck = message.buildAck({ ackCode: 'AA' });
            conn.send(aaAck);
          }, 50);
        });
      });
      await hl7Server.start(port);

      const hl7MessageBody =
        'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
        'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-';

      const wsClient = state.mySocket;
      wsClient.send(
        Buffer.from(
          JSON.stringify({
            type: 'agent:transmit:request',
            remote: `mllp://localhost:${port}`,
            contentType: ContentType.HL7_V2,
            body: hl7MessageBody,
            callback: 'test-callback',
            returnAck: 'application', // Explicitly request application-level ACK
          } satisfies AgentTransmitRequest)
        )
      );

      // Wait for response - should wait for AA, not return on CA
      while (state.transmitResponses.length === 0) {
        await sleep(50);
      }

      // With APPLICATION, should skip CA and return the AA
      expect(state.transmitResponses.length).toBe(1);
      const response = Hl7Message.parse(state.transmitResponses[0].body);
      const ackCode = response.getSegment('MSA')?.getField(1)?.toString();
      expect(ackCode).toBe('AA');

      await app.stop();
      await hl7Server.stop({ forceDrainTimeoutMs: 100 });
      await new Promise<void>((resolve) => {
        mockServer.stop(resolve);
      });

      console.log = originalConsoleLog;
    });

    test('Uses defaultReturnAck from Device URL when per-message returnAck is not specified', async () => {
      const originalConsoleLog = console.log;
      console.log = vi.fn();

      const state = {
        mySocket: undefined as Client | undefined,
        transmitResponses: [] as AgentTransmitResponse[],
      };

      const mockServer = new Server('wss://example.com/ws/agent');
      mockServer.on('connection', (socket) => {
        state.mySocket = socket;
        socket.on('message', (data) => {
          const command = JSON.parse((data as Buffer).toString('utf8')) as AgentMessage;
          if (command.type === 'agent:connect:request') {
            socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
          } else if (command.type === 'agent:transmit:response') {
            state.transmitResponses.push(command);
          }
        });
      });

      const agent = await medplum.createResource<Agent>({
        resourceType: 'Agent',
        name: 'Test Agent',
        status: 'active',
      });

      const app = new App(medplum, agent.id, LogLevel.INFO);
      await app.start();

      while (!state.mySocket) {
        await sleep(100);
      }

      const port = await getFreePort();

      // Start HL7 server that sends CA first, then AA
      const hl7Server = new Hl7Server((conn) => {
        conn.addEventListener('message', ({ message }) => {
          const caAck = message.buildAck({ ackCode: 'CA' });
          conn.send(caAck);
          setTimeout(() => {
            const aaAck = message.buildAck({ ackCode: 'AA' });
            conn.send(aaAck);
          }, 50);
        });
      });
      await hl7Server.start(port);

      const hl7MessageBody =
        'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
        'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-';

      const wsClient = state.mySocket;
      // Include defaultReturnAck=application in the Device URL
      wsClient.send(
        Buffer.from(
          JSON.stringify({
            type: 'agent:transmit:request',
            remote: `mllp://localhost:${port}?defaultReturnAck=application`,
            contentType: ContentType.HL7_V2,
            body: hl7MessageBody,
            callback: 'test-callback',
            // No returnAck specified - should use defaultReturnAck from URL
          } satisfies AgentTransmitRequest)
        )
      );

      // Wait for response
      while (state.transmitResponses.length === 0) {
        await sleep(50);
      }

      // With defaultReturnAck=application, should skip CA and return the AA
      expect(state.transmitResponses.length).toBe(1);
      const response = Hl7Message.parse(state.transmitResponses[0].body);
      const ackCode = response.getSegment('MSA')?.getField(1)?.toString();
      expect(ackCode).toBe('AA');

      await app.stop();
      await hl7Server.stop({ forceDrainTimeoutMs: 100 });
      await new Promise<void>((resolve) => {
        mockServer.stop(resolve);
      });

      console.log = originalConsoleLog;
    });

    test('Per-message returnAck takes priority over defaultReturnAck from Device URL', async () => {
      const originalConsoleLog = console.log;
      console.log = vi.fn();

      const state = {
        mySocket: undefined as Client | undefined,
        transmitResponses: [] as AgentTransmitResponse[],
      };

      const mockServer = new Server('wss://example.com/ws/agent');
      mockServer.on('connection', (socket) => {
        state.mySocket = socket;
        socket.on('message', (data) => {
          const command = JSON.parse((data as Buffer).toString('utf8')) as AgentMessage;
          if (command.type === 'agent:connect:request') {
            socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
          } else if (command.type === 'agent:transmit:response') {
            state.transmitResponses.push(command);
          }
        });
      });

      const agent = await medplum.createResource<Agent>({
        resourceType: 'Agent',
        name: 'Test Agent',
        status: 'active',
      });

      const app = new App(medplum, agent.id, LogLevel.INFO);
      await app.start();

      while (!state.mySocket) {
        await sleep(100);
      }

      const port = await getFreePort();

      // Start HL7 server that sends CA first, then AA
      const hl7Server = new Hl7Server((conn) => {
        conn.addEventListener('message', ({ message }) => {
          const caAck = message.buildAck({ ackCode: 'CA' });
          conn.send(caAck);
          setTimeout(() => {
            const aaAck = message.buildAck({ ackCode: 'AA' });
            conn.send(aaAck);
          }, 50);
        });
      });
      await hl7Server.start(port);

      const hl7MessageBody =
        'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
        'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-';

      const wsClient = state.mySocket;
      // Device URL has defaultReturnAck=application, but message specifies returnAck=first
      wsClient.send(
        Buffer.from(
          JSON.stringify({
            type: 'agent:transmit:request',
            remote: `mllp://localhost:${port}?defaultReturnAck=application`,
            contentType: ContentType.HL7_V2,
            body: hl7MessageBody,
            callback: 'test-callback',
            returnAck: 'first', // Per-message returnAck should override Device URL default
          } satisfies AgentTransmitRequest)
        )
      );

      // Wait for response
      while (state.transmitResponses.length === 0) {
        await sleep(50);
      }

      // Per-message returnAck=first should take priority, so should return CA
      expect(state.transmitResponses.length).toBe(1);
      const response = Hl7Message.parse(state.transmitResponses[0].body);
      const ackCode = response.getSegment('MSA')?.getField(1)?.toString();
      expect(ackCode).toBe('CA');

      await app.stop();
      await hl7Server.stop({ forceDrainTimeoutMs: 100 });
      await new Promise<void>((resolve) => {
        mockServer.stop(resolve);
      });

      console.log = originalConsoleLog;
    });

    test('Invalid defaultReturnAck in Device URL logs warning and falls back to FIRST', async () => {
      const originalConsoleLog = console.log;
      console.log = vi.fn();

      const state = {
        mySocket: undefined as Client | undefined,
        transmitResponses: [] as AgentTransmitResponse[],
      };

      const mockServer = new Server('wss://example.com/ws/agent');
      mockServer.on('connection', (socket) => {
        state.mySocket = socket;
        socket.on('message', (data) => {
          const command = JSON.parse((data as Buffer).toString('utf8')) as AgentMessage;
          if (command.type === 'agent:connect:request') {
            socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
          } else if (command.type === 'agent:transmit:response') {
            state.transmitResponses.push(command);
          }
        });
      });

      const agent = await medplum.createResource<Agent>({
        resourceType: 'Agent',
        name: 'Test Agent',
        status: 'active',
      });

      const app = new App(medplum, agent.id, LogLevel.INFO);
      await app.start();

      while (!state.mySocket) {
        await sleep(100);
      }

      const port = await getFreePort();

      // Start HL7 server that sends CA first, then AA
      const hl7Server = new Hl7Server((conn) => {
        conn.addEventListener('message', ({ message }) => {
          const caAck = message.buildAck({ ackCode: 'CA' });
          conn.send(caAck);
          setTimeout(() => {
            const aaAck = message.buildAck({ ackCode: 'AA' });
            conn.send(aaAck);
          }, 50);
        });
      });
      await hl7Server.start(port);

      const hl7MessageBody =
        'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
        'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-';

      const wsClient = state.mySocket;
      // Device URL has an invalid defaultReturnAck value
      wsClient.send(
        Buffer.from(
          JSON.stringify({
            type: 'agent:transmit:request',
            remote: `mllp://localhost:${port}?defaultReturnAck=invalid_value`,
            contentType: ContentType.HL7_V2,
            body: hl7MessageBody,
            callback: 'test-callback',
          } satisfies AgentTransmitRequest)
        )
      );

      // Wait for response
      while (state.transmitResponses.length === 0) {
        await sleep(50);
      }

      // Invalid defaultReturnAck should fall back to FIRST, so should return CA
      expect(state.transmitResponses.length).toBe(1);
      const response = Hl7Message.parse(state.transmitResponses[0].body);
      const ackCode = response.getSegment('MSA')?.getField(1)?.toString();
      expect(ackCode).toBe('CA');

      // Should have logged a warning about the invalid value with fallback message
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining(
          "Invalid value for returnAck; expected: 'first' or 'application', received: invalid_value"
        )
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("falling back to default return ACK behavior of 'first'")
      );

      await app.stop();
      await hl7Server.stop({ forceDrainTimeoutMs: 100 });
      await new Promise<void>((resolve) => {
        mockServer.stop(resolve);
      });

      console.log = originalConsoleLog;
    });

    test('Invalid per-message returnAck returns 400 error', async () => {
      const originalConsoleLog = console.log;
      console.log = vi.fn();

      const state = {
        mySocket: undefined as Client | undefined,
        transmitResponses: [] as AgentTransmitResponse[],
      };

      const mockServer = new Server('wss://example.com/ws/agent');
      mockServer.on('connection', (socket) => {
        state.mySocket = socket;
        socket.on('message', (data) => {
          const command = JSON.parse((data as Buffer).toString('utf8')) as AgentMessage;
          if (command.type === 'agent:connect:request') {
            socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
          } else if (command.type === 'agent:transmit:response') {
            state.transmitResponses.push(command);
          }
        });
      });

      const agent = await medplum.createResource<Agent>({
        resourceType: 'Agent',
        name: 'Test Agent',
        status: 'active',
      });

      const app = new App(medplum, agent.id, LogLevel.INFO);
      await app.start();

      while (!state.mySocket) {
        await sleep(100);
      }

      const port = await getFreePort();

      // Start HL7 server - should NOT receive any messages for this test
      let messageReceived = false;
      const hl7Server = new Hl7Server((conn) => {
        conn.addEventListener('message', () => {
          messageReceived = true;
        });
      });
      await hl7Server.start(port);

      const hl7MessageBody =
        'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
        'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-';

      const wsClient = state.mySocket;
      // Per-message returnAck has an invalid value
      wsClient.send(
        Buffer.from(
          JSON.stringify({
            type: 'agent:transmit:request',
            remote: `mllp://localhost:${port}`,
            contentType: ContentType.HL7_V2,
            body: hl7MessageBody,
            callback: 'test-callback',
            returnAck: 'invalid_value' as 'first', // Invalid per-message returnAck
          } satisfies AgentTransmitRequest)
        )
      );

      // Wait for response
      while (state.transmitResponses.length === 0) {
        await sleep(50);
      }

      // Should return a 400 error response
      expect(state.transmitResponses.length).toBe(1);
      const response = state.transmitResponses[0];
      expect(response.statusCode).toBe(400);
      expect(response.contentType).toBe(ContentType.TEXT);
      expect(response.body).toContain(
        "Invalid value for returnAck; expected: 'first' or 'application', received: invalid_value"
      );

      // The HL7 message should NOT have been sent to the server
      expect(messageReceived).toBe(false);

      await app.stop();
      await hl7Server.stop({ forceDrainTimeoutMs: 100 });
      await new Promise<void>((resolve) => {
        mockServer.stop(resolve);
      });

      console.log = originalConsoleLog;
    });

    test('parseReturnAck is case-insensitive for APPLICATION', async () => {
      const originalConsoleLog = console.log;
      console.log = vi.fn();

      const state = {
        mySocket: undefined as Client | undefined,
        transmitResponses: [] as AgentTransmitResponse[],
      };

      const mockServer = new Server('wss://example.com/ws/agent');
      mockServer.on('connection', (socket) => {
        state.mySocket = socket;
        socket.on('message', (data) => {
          const command = JSON.parse((data as Buffer).toString('utf8')) as AgentMessage;
          if (command.type === 'agent:connect:request') {
            socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
          } else if (command.type === 'agent:transmit:response') {
            state.transmitResponses.push(command);
          }
        });
      });

      const agent = await medplum.createResource<Agent>({
        resourceType: 'Agent',
        name: 'Test Agent',
        status: 'active',
      });

      const app = new App(medplum, agent.id, LogLevel.INFO);
      await app.start();

      while (!state.mySocket) {
        await sleep(100);
      }

      const port = await getFreePort();

      // Start HL7 server that sends CA first, then AA
      const hl7Server = new Hl7Server((conn) => {
        conn.addEventListener('message', ({ message }) => {
          const caAck = message.buildAck({ ackCode: 'CA' });
          conn.send(caAck);
          setTimeout(() => {
            const aaAck = message.buildAck({ ackCode: 'AA' });
            conn.send(aaAck);
          }, 50);
        });
      });
      await hl7Server.start(port);

      const hl7MessageBody =
        'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
        'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-';

      const wsClient = state.mySocket;
      // Use uppercase APPLICATION in the URL
      wsClient.send(
        Buffer.from(
          JSON.stringify({
            type: 'agent:transmit:request',
            remote: `mllp://localhost:${port}?defaultReturnAck=APPLICATION`,
            contentType: ContentType.HL7_V2,
            body: hl7MessageBody,
            callback: 'test-callback',
          } satisfies AgentTransmitRequest)
        )
      );

      // Wait for response
      while (state.transmitResponses.length === 0) {
        await sleep(50);
      }

      // Should recognize APPLICATION (case-insensitive) and return AA
      expect(state.transmitResponses.length).toBe(1);
      const response = Hl7Message.parse(state.transmitResponses[0].body);
      const ackCode = response.getSegment('MSA')?.getField(1)?.toString();
      expect(ackCode).toBe('AA');

      await app.stop();
      await hl7Server.stop({ forceDrainTimeoutMs: 100 });
      await new Promise<void>((resolve) => {
        mockServer.stop(resolve);
      });

      console.log = originalConsoleLog;
    });

    test('parseReturnAck is case-insensitive for FIRST', async () => {
      const originalConsoleLog = console.log;
      console.log = vi.fn();

      const state = {
        mySocket: undefined as Client | undefined,
        transmitResponses: [] as AgentTransmitResponse[],
      };

      const mockServer = new Server('wss://example.com/ws/agent');
      mockServer.on('connection', (socket) => {
        state.mySocket = socket;
        socket.on('message', (data) => {
          const command = JSON.parse((data as Buffer).toString('utf8')) as AgentMessage;
          if (command.type === 'agent:connect:request') {
            socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
          } else if (command.type === 'agent:transmit:response') {
            state.transmitResponses.push(command);
          }
        });
      });

      const agent = await medplum.createResource<Agent>({
        resourceType: 'Agent',
        name: 'Test Agent',
        status: 'active',
      });

      const app = new App(medplum, agent.id, LogLevel.INFO);
      await app.start();

      while (!state.mySocket) {
        await sleep(100);
      }

      const port = await getFreePort();

      // Start HL7 server that sends CA first, then AA
      const hl7Server = new Hl7Server((conn) => {
        conn.addEventListener('message', ({ message }) => {
          const caAck = message.buildAck({ ackCode: 'CA' });
          conn.send(caAck);
          setTimeout(() => {
            const aaAck = message.buildAck({ ackCode: 'AA' });
            conn.send(aaAck);
          }, 50);
        });
      });
      await hl7Server.start(port);

      const hl7MessageBody =
        'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
        'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-';

      const wsClient = state.mySocket;
      // Use uppercase FIRST in the URL - should return CA (first ACK received)
      wsClient.send(
        Buffer.from(
          JSON.stringify({
            type: 'agent:transmit:request',
            remote: `mllp://localhost:${port}?defaultReturnAck=FIRST`,
            contentType: ContentType.HL7_V2,
            body: hl7MessageBody,
            callback: 'test-callback',
          } satisfies AgentTransmitRequest)
        )
      );

      // Wait for response
      while (state.transmitResponses.length === 0) {
        await sleep(50);
      }

      // Should recognize FIRST (case-insensitive) and return CA (the first ACK)
      expect(state.transmitResponses.length).toBe(1);
      const response = Hl7Message.parse(state.transmitResponses[0].body);
      const ackCode = response.getSegment('MSA')?.getField(1)?.toString();
      expect(ackCode).toBe('CA');

      await app.stop();
      await hl7Server.stop({ forceDrainTimeoutMs: 100 });
      await new Promise<void>((resolve) => {
        mockServer.stop(resolve);
      });

      console.log = originalConsoleLog;
    });
  });

  describe('Error responses for unhandled or silently-failing messages', () => {
    test('Unknown message type returns agent:error to server', async () => {
      const state = {
        mySocket: undefined as Client | undefined,
        agentError: undefined as AgentError | undefined,
      };

      const mockServer = new Server('wss://example.com/ws/agent');
      mockServer.on('connection', (socket) => {
        state.mySocket = socket;
        socket.on('message', (data) => {
          const command = JSON.parse((data as Buffer).toString('utf8')) as AgentMessage;
          if (command.type === 'agent:connect:request') {
            socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
          } else if (command.type === 'agent:error') {
            state.agentError = command;
          }
        });
      });

      const agent = await medplum.createResource<Agent>({
        resourceType: 'Agent',
        name: 'Test Agent',
        status: 'active',
      });

      const app = new App(medplum, agent.id, LogLevel.INFO);
      await app.start();

      while (!state.mySocket) {
        await sleep(100);
      }

      const callback = getReferenceString(agent) + '-' + randomUUID();
      state.mySocket.send(Buffer.from(JSON.stringify({ type: 'totally:unknown:type', callback })));

      while (!state.agentError) {
        await sleep(50);
      }

      expect(state.agentError).toMatchObject<AgentError>({
        type: 'agent:error',
        body: expect.stringContaining('Unknown message type: totally:unknown:type'),
        callback,
      });

      await app.stop();
      await new Promise<void>((resolve) => {
        mockServer.stop(resolve);
      });
    });

    test('Invalid JSON payload returns agent:error to server', async () => {
      const state = {
        mySocket: undefined as Client | undefined,
        agentError: undefined as AgentError | undefined,
      };

      const mockServer = new Server('wss://example.com/ws/agent');
      mockServer.on('connection', (socket) => {
        state.mySocket = socket;
        socket.on('message', (data) => {
          const str = (data as Buffer).toString('utf8');
          let command: AgentMessage;
          try {
            command = JSON.parse(str) as AgentMessage;
          } catch {
            return;
          }
          if (command.type === 'agent:connect:request') {
            socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
          } else if (command.type === 'agent:error') {
            state.agentError = command;
          }
        });
      });

      const agent = await medplum.createResource<Agent>({
        resourceType: 'Agent',
        name: 'Test Agent',
        status: 'active',
      });

      const app = new App(medplum, agent.id, LogLevel.INFO);
      await app.start();

      while (!state.mySocket) {
        await sleep(100);
      }

      // Send malformed JSON
      state.mySocket.send(Buffer.from('this is not valid json {'));

      while (!state.agentError) {
        await sleep(50);
      }

      expect(state.agentError).toMatchObject<AgentError>({
        type: 'agent:error',
        body: expect.stringContaining('WebSocket error on incoming message'),
      });
      // No callback could be parsed from malformed JSON
      expect(state.agentError?.callback).toBeUndefined();

      await app.stop();
      await new Promise<void>((resolve) => {
        mockServer.stop(resolve);
      });
    });

    test('Transmit request with missing remote returns agent:error', async () => {
      const state = {
        mySocket: undefined as Client | undefined,
        agentError: undefined as AgentError | undefined,
      };

      const mockServer = new Server('wss://example.com/ws/agent');
      mockServer.on('connection', (socket) => {
        state.mySocket = socket;
        socket.on('message', (data) => {
          const command = JSON.parse((data as Buffer).toString('utf8')) as AgentMessage;
          if (command.type === 'agent:connect:request') {
            socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
          } else if (command.type === 'agent:error') {
            state.agentError = command;
          }
        });
      });

      const agent = await medplum.createResource<Agent>({
        resourceType: 'Agent',
        name: 'Test Agent',
        status: 'active',
      });

      const app = new App(medplum, agent.id, LogLevel.INFO);
      await app.start();

      while (!state.mySocket) {
        await sleep(100);
      }

      const callback = getReferenceString(agent) + '-' + randomUUID();
      state.mySocket.send(
        Buffer.from(
          JSON.stringify({
            type: 'agent:transmit:request',
            // remote intentionally missing
            remote: '',
            contentType: ContentType.HL7_V2,
            body: 'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2',
            callback,
          } satisfies AgentTransmitRequest)
        )
      );

      while (!state.agentError) {
        await sleep(50);
      }

      expect(state.agentError).toMatchObject<AgentError>({
        type: 'agent:error',
        body: 'Missing remote address',
        callback,
      });

      await app.stop();
      await new Promise<void>((resolve) => {
        mockServer.stop(resolve);
      });
    });

    test('Transmit request with HL7 body missing MSH.10 returns 400 transmit response', async () => {
      const state = {
        mySocket: undefined as Client | undefined,
        transmitResponse: undefined as AgentTransmitResponse | undefined,
      };

      const mockServer = new Server('wss://example.com/ws/agent');
      mockServer.on('connection', (socket) => {
        state.mySocket = socket;
        socket.on('message', (data) => {
          const command = JSON.parse((data as Buffer).toString('utf8')) as AgentMessage;
          if (command.type === 'agent:connect:request') {
            socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
          } else if (command.type === 'agent:transmit:response') {
            state.transmitResponse = command;
          }
        });
      });

      const agent = await medplum.createResource<Agent>({
        resourceType: 'Agent',
        name: 'Test Agent',
        status: 'active',
      });

      const app = new App(medplum, agent.id, LogLevel.INFO);
      await app.start();

      while (!state.mySocket) {
        await sleep(100);
      }

      const port = await getFreePort();
      const callback = getReferenceString(agent) + '-' + randomUUID();
      // MSH segment without field 10 (only 9 fields after MSH)
      const hl7BodyMissingMsh10 = 'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01';

      state.mySocket.send(
        Buffer.from(
          JSON.stringify({
            type: 'agent:transmit:request',
            remote: `mllp://localhost:${port}`,
            contentType: ContentType.HL7_V2,
            body: hl7BodyMissingMsh10,
            callback,
          } satisfies AgentTransmitRequest)
        )
      );

      while (!state.transmitResponse) {
        await sleep(50);
      }

      expect(state.transmitResponse).toMatchObject<AgentTransmitResponse>({
        type: 'agent:transmit:response',
        remote: `mllp://localhost:${port}`,
        contentType: ContentType.TEXT,
        statusCode: 400,
        body: 'MSH.10 is missing but required',
        callback,
      });

      await app.stop();
      await new Promise<void>((resolve) => {
        mockServer.stop(resolve);
      });
    });
  });
});

class MockChildProcess extends EventEmitter implements ChildProcess {
  send = vi.fn();
  unref = vi.fn();
  ref = vi.fn();
  disconnect = vi.fn(() => {
    this.onDisconnect?.();
  });
  stdin = new Writable();
  stdout = new Readable();
  stderr = new Readable();
  // This is not quite right but not super important
  stdio = [new Writable(), new Readable(), new Readable(), new Writable(), new Readable()] as ChildProcess['stdio'];
  killed = false;
  connected = true;
  exitCode = 1;
  // This is not quite right but not super important
  signalCode = null;
  // This is not quite right but not super important
  spawnargs = ['node', 'main.ts', '--upgrade'];
  // This is not quite right but not super important
  spawnfile = 'node';
  kill = (() => false) as ChildProcess['kill'];
  [Symbol.dispose](): void {}
  onDisconnect?: () => void;
}

function getNextMinorVersion(version: string): string {
  const majorMinorPatch = version.split('-')[0];
  const [major, minor] = majorMinorPatch.split('.');
  return [major, Number.parseInt(minor, 10) + 1, 0].join('.');
}
