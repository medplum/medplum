// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  AgentError,
  AgentMessage,
  AgentReloadConfigRequest,
  AgentTransmitRequest,
  AgentUpgradeRequest,
  AgentUpgradeResponse,
  ContentType,
  Hl7Message,
  LogLevel,
  MEDPLUM_VERSION,
  ReconnectingWebSocket,
  allOk,
  createReference,
  getReferenceString,
  sleep,
} from '@medplum/core';
import { Agent, Bot, Endpoint, Resource } from '@medplum/fhirtypes';
import { Hl7Client, Hl7Server } from '@medplum/hl7';
import { MockClient } from '@medplum/mock';
import { Client, Server } from 'mock-socket';
import child_process, { ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs, { existsSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { resolve } from 'node:path';
import { EventEmitter, Readable, Writable } from 'node:stream';
import { App } from './app';
import { AgentHl7Channel, AgentHl7ChannelConnection } from './hl7';
import * as pidModule from './pid';
import { mockFetchForUpgrader } from './upgrader-test-utils';

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

jest.mock('node:process', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return new (class MockProcess extends require('node:events') {
    send = jest.fn().mockImplementation((msg) => {
      this.emit('childSend', msg);
    });
    exit = jest.fn(() => {
      throw new Error('process.exit');
    });
  })();
});

describe('App', () => {
  let medplum: MockClient;

  beforeEach(async () => {
    console.log = jest.fn();
    medplum = new MockClient();
    medplum.router.router.add('POST', ':resourceType/:id/$execute', async () => {
      return [allOk, {} as Resource];
    });
  });

  test('Runs successfully', async () => {
    const originalConsoleLog = console.log;
    console.log = jest.fn();
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
    const wsClient = state.mySocket as unknown as Client;
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
    console.log = jest.fn();
    const state = {
      maxReconnectAttempts: 2,
      shouldConnect: false,
    };

    const originalDispatchEvent = ReconnectingWebSocket.prototype.dispatchEvent;
    const reconnectSpy = jest.spyOn(ReconnectingWebSocket.prototype, 'reconnect');
    const mockDispatchEvent = jest.spyOn(ReconnectingWebSocket.prototype, 'dispatchEvent').mockImplementation(function (
      this: ReconnectingWebSocket,
      event: Event
    ) {
      state.shouldConnect = reconnectSpy.mock.calls.length >= state.maxReconnectAttempts;
      // Only allow open events through when we should connect
      if (event.type === 'open' && !state.shouldConnect) {
        return;
      }
      // eslint-disable-next-line no-invalid-this
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
    const originalConsoleError = console.error;
    console.log = jest.fn();
    console.error = jest.fn();

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
    console.error = originalConsoleError;
  });

  test('Reload config', async () => {
    // Create agent with an HL7 channel
    const state = {
      mySocket: undefined as Client | undefined,
      gotAgentReloadResponse: false,
      gotAgentError: false,
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

    // We will create 6 endpoints in total, 3 for each channel type (HL7v2 and DICOM)
    // 2 of the 3 for each will be for one named channel which changes ports, one channel will be the same both times

    // Create the initial endpoints for all channels
    const hl7TestEndpoint1 = await medplum.createResource<Endpoint>({
      resourceType: 'Endpoint',
      status: 'active',
      address: 'mllp://0.0.0.0:9001',
      connectionType: { code: ContentType.HL7_V2 },
      payloadType: [{ coding: [{ code: ContentType.HL7_V2 }] }],
    });
    const hl7ProdEndpoint = await medplum.createResource<Endpoint>({
      resourceType: 'Endpoint',
      status: 'active',
      address: 'mllp://0.0.0.0:9002',
      connectionType: { code: ContentType.HL7_V2 },
      payloadType: [{ coding: [{ code: ContentType.HL7_V2 }] }],
    });

    const dicomTestEndpoint1 = await medplum.createResource<Endpoint>({
      resourceType: 'Endpoint',
      status: 'active',
      address: 'dicom://0.0.0.0:10001',
      connectionType: { code: ContentType.DICOM },
      payloadType: [{ coding: [{ code: ContentType.DICOM }] }],
    });
    const dicomProdEndpoint = await medplum.createResource<Endpoint>({
      resourceType: 'Endpoint',
      status: 'active',
      address: 'dicom://0.0.0.0:10002',
      connectionType: { code: ContentType.DICOM },
      payloadType: [{ coding: [{ code: ContentType.DICOM }] }],
    });

    const hl7StagingEndpoint = await medplum.createResource<Endpoint>({
      resourceType: 'Endpoint',
      status: 'active',
      address: 'mllp://0.0.0.0:9004',
      connectionType: { code: ContentType.HL7_V2 },
      payloadType: [{ coding: [{ code: ContentType.HL7_V2 }] }],
    });

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
    expect(app.channels.size).toStrictEqual(5);

    const prodChannel = app.channels.get('hl7-prod') as AgentHl7Channel;
    expect(prodChannel).toBeDefined();

    expect(prodChannel.connections.size).toStrictEqual(0);

    // Create a connection to the prod channel
    const hl7Client = new Hl7Client({
      host: 'localhost',
      port: 9002,
    });

    await hl7Client.connect();
    // Sleep to let connect event get emitted agent-side
    await sleep(0);

    expect(prodChannel.connections.size).toStrictEqual(1);
    const hl7ProdConnection = prodChannel.connections.values().next().value as AgentHl7ChannelConnection;
    expect(hl7ProdConnection).toBeDefined();
    expect(hl7ProdConnection.hl7Connection.enhancedMode).toStrictEqual(false);

    // Check that the socket is not closed
    const hl7ProdConnectionSocket = hl7ProdConnection.hl7Connection.socket;
    expect(hl7ProdConnectionSocket.closed).toStrictEqual(false);

    const stagingChannel = app.channels.get('hl7-staging') as AgentHl7Channel;

    // Create a new endpoint for both hl7-test and dicom-test
    const hl7TestEndpoint2 = await medplum.createResource<Endpoint>({
      resourceType: 'Endpoint',
      status: 'active',
      address: 'mllp://0.0.0.0:9003',
      connectionType: { code: ContentType.HL7_V2 },
      payloadType: [{ coding: [{ code: ContentType.HL7_V2 }] }],
    });
    const dicomTestEndpoint2 = await medplum.createResource<Endpoint>({
      resourceType: 'Endpoint',
      status: 'active',
      connectionType: { code: ContentType.DICOM },
      address: 'dicom://0.0.0.0:10003',
      payloadType: [{ coding: [{ code: ContentType.DICOM }] }],
    });

    // Update endpoint to have enhanced mode on, which should trigger a reload without making a new socket
    const enhancedProdAddress = new URL(hl7ProdEndpoint.address);
    enhancedProdAddress.searchParams.set('enhanced', 'true');

    // Update the new address
    await medplum.updateResource<Endpoint>({
      ...hl7ProdEndpoint,
      address: enhancedProdAddress.toString(),
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
    expect(app.channels.size).toStrictEqual(5);

    // Check that our prod connection for the prod channel is the same connection as before
    expect(prodChannel.connections.size).toStrictEqual(1);
    const hl7ProdConnectionAfter = prodChannel.connections.values().next().value as AgentHl7ChannelConnection;

    expect(hl7ProdConnectionAfter).toBeDefined();

    // Check that the socket is not closed and is the same socket
    const hl7ProdConnectionSocketAfter = hl7ProdConnection.hl7Connection.socket;
    expect(hl7ProdConnectionSocketAfter.closed).toStrictEqual(false);
    expect(hl7ProdConnectionSocketAfter).toStrictEqual(hl7ProdConnectionSocket);

    // But enhanced mode should be active on the existing connection
    expect(hl7ProdConnectionAfter.hl7Connection.enhancedMode).toStrictEqual(true);

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

    // Now we should test accidentally adding endpoints with conflicting ports

    // Endpoints with conflicting ports
    const hl7ConflictingEndpoint = await medplum.createResource<Endpoint>({
      resourceType: 'Endpoint',
      status: 'active',
      address: 'mllp://0.0.0.0:9002',
      connectionType: { code: ContentType.HL7_V2 },
      payloadType: [{ coding: [{ code: ContentType.HL7_V2 }] }],
    });
    const dicomConflictingEndpoint = await medplum.createResource<Endpoint>({
      resourceType: 'Endpoint',
      status: 'active',
      address: 'dicom://0.0.0.0:10002',
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
          endpoint: createReference(hl7TestEndpoint2),
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
    expect(app.channels.size).toStrictEqual(5);

    await hl7Client.close();
    await app.stop();
    await new Promise<void>((resolve) => {
      mockServer.stop(resolve);
    });
  });

  test('Enable stats logging', async () => {
    const originalConsoleLog = console.log;
    console.log = jest.fn();

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
    const hl7ProdEndpoint = await medplum.createResource<Endpoint>({
      resourceType: 'Endpoint',
      status: 'active',
      address: 'mllp://0.0.0.0:9001',
      connectionType: { code: ContentType.HL7_V2 },
      payloadType: [{ coding: [{ code: ContentType.HL7_V2 }] }],
    });

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
    console.log = jest.fn();

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

    const endpoint = await medplum.createResource<Endpoint>({
      resourceType: 'Endpoint',
      status: 'active',
      address: 'mllp://0.0.0.0:9010',
      connectionType: { code: ContentType.HL7_V2 },
      payloadType: [{ coding: [{ code: ContentType.HL7_V2 }] }],
    });

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
      port: 9010,
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

    // Try to send agent:transmit:request -- should return error
    // Start an HL7 listener
    let hl7Messages = [];
    let hl7Server = new Hl7Server((conn) => {
      conn.addEventListener('message', ({ message }) => {
        hl7Messages.push(message);
        conn.send(message.buildAck());
      });
    });
    hl7Server.start(57099);

    // Wait for server to start listening
    while (!hl7Server.server?.listening) {
      await sleep(100);
    }

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
          remote: 'mllp://localhost:57099',
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
          remote: 'mllp://localhost:57099',
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

    await hl7Server.stop();

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
      port: 9010,
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
    hl7Server.start(57099);

    // Wait for server to start listening
    while (!hl7Server.server?.listening) {
      await sleep(100);
    }

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
          remote: 'mllp://localhost:57099',
          callback: getReferenceString(agent) + '-' + randomUUID(),
        })
      )
    );

    // Wait for the HL7 message to be received
    while (hl7Messages.length < 1) {
      await sleep(100);
    }
    expect(hl7Messages.length).toBe(1);

    await hl7Server.stop();
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
    console.log = jest.fn();

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

    const testEndpoint = await medplum.createResource<Endpoint>({
      resourceType: 'Endpoint',
      status: 'off',
      address: 'mllp://0.0.0.0:9010',
      connectionType: { code: ContentType.HL7_V2 },
      payloadType: [{ coding: [{ code: ContentType.HL7_V2 }] }],
    });

    const prodEndpoint = await medplum.createResource<Endpoint>({
      resourceType: 'Endpoint',
      status: 'active',
      address: 'mllp://0.0.0.0:9011',
      connectionType: { code: ContentType.HL7_V2 },
      payloadType: [{ coding: [{ code: ContentType.HL7_V2 }] }],
    });

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
      port: 9010,
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
      port: 9011,
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
      port: 9010,
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
      port: 9011,
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

    const endpoint = await medplum.createResource<Endpoint>({
      resourceType: 'Endpoint',
      status: 'active',
      address: 'mllp://0.0.0.0:9020',
      connectionType: { code: ContentType.HL7_V2 },
      payloadType: [{ coding: [{ code: ContentType.HL7_V2 }] }],
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

    // Spy on the app.log.warn method
    const warnSpy = jest.spyOn(app.log, 'warn');

    while (!state.mySocket) {
      await sleep(100);
    }

    expect(app.channels.size).toBe(1);
    expect(app.channels.has('test')).toBe(true);

    const hl7Client = new Hl7Client({
      host: 'localhost',
      port: 9020,
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

  describe('Upgrade', () => {
    beforeEach(() => {
      const upgradeFilePath = resolve(__dirname, 'upgrade.json');
      if (existsSync(upgradeFilePath)) {
        rmSync(upgradeFilePath);
      }
    });

    test('Upgrade -- Not on Windows', async () => {
      const platformSpy = jest.spyOn(os, 'platform').mockImplementation(jest.fn(() => 'linux'));

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

      platformSpy.mockRestore();
    });

    test('Upgrade -- No version specified', async () => {
      const originalConsoleLog = console.log;
      console.log = jest.fn();

      let child!: MockChildProcess;

      const state = {
        mySocket: undefined as Client | undefined,
        gotAgentUpgradeResponse: false,
        agentError: undefined as AgentError | undefined,
        disconnectCalled: false,
      };

      const platformSpy = jest.spyOn(os, 'platform').mockImplementation(jest.fn(() => 'win32'));
      const fetchSpy = mockFetchForUpgrader();
      const openSyncSpy = jest.spyOn(fs, 'openSync').mockImplementation(jest.fn(() => 42));
      const writeFileSyncSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation(jest.fn());
      const spawnSpy = jest.spyOn(child_process, 'spawn').mockImplementation(
        jest.fn(() => {
          child = new MockChildProcess();
          child.onDisconnect = () => {
            state.disconnectCalled = true;
          };
          return child;
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
      console.log = jest.fn();

      let child!: MockChildProcess;

      const state = {
        mySocket: undefined as Client | undefined,
        agentUpgradeResponse: undefined as AgentUpgradeResponse | undefined,
        agentError: undefined as AgentError | undefined,
        disconnectCalled: false,
      };

      const platformSpy = jest.spyOn(os, 'platform').mockImplementation(jest.fn(() => 'win32'));
      const fetchSpy = mockFetchForUpgrader();
      const openSyncSpy = jest.spyOn(fs, 'openSync').mockImplementation(jest.fn(() => 42));
      const writeFileSyncSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation(jest.fn());
      const rmSyncSpy = jest.spyOn(fs, 'rmSync').mockImplementation(jest.fn());
      const spawnSpy = jest.spyOn(child_process, 'spawn').mockImplementation(
        jest.fn(() => {
          child = new MockChildProcess();
          child.onDisconnect = () => {
            state.disconnectCalled = true;
          };
          return child;
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
      console.log = jest.fn();

      const state = {
        mySocket: undefined as Client | undefined,
        gotAgentUpgradeResponse: false,
        agentError: undefined as AgentError | undefined,
      };

      const platformSpy = jest.spyOn(os, 'platform').mockImplementation(jest.fn(() => 'win32'));
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

      platformSpy.mockRestore();
      fetchSpy.mockRestore();
      console.log = originalConsoleLog;
    });

    test('Upgrade -- Already on specified version', async () => {
      const originalConsoleLog = console.log;
      console.log = jest.fn();

      const state = {
        mySocket: undefined as Client | undefined,
        gotAgentUpgradeResponse: false,
        agentError: undefined as AgentError | undefined,
      };

      const platformSpy = jest.spyOn(os, 'platform').mockImplementation(jest.fn(() => 'win32'));
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

      platformSpy.mockRestore();
      fetchSpy.mockRestore();
      console.log = originalConsoleLog;
    });

    test('Upgrade -- Already on specified version (force upgrade)', async () => {
      const originalConsoleLog = console.log;
      console.log = jest.fn();

      const state = {
        mySocket: undefined as Client | undefined,
        gotAgentUpgradeResponse: false,
        disconnectCalled: false,
        agentError: undefined as AgentError | undefined,
      };

      let child!: MockChildProcess;

      const platformSpy = jest.spyOn(os, 'platform').mockImplementation(jest.fn(() => 'win32'));
      const fetchSpy = mockFetchForUpgrader();
      const openSyncSpy = jest.spyOn(fs, 'openSync').mockImplementation(jest.fn(() => 42));
      const writeFileSyncSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation(jest.fn());
      const rmSyncSpy = jest.spyOn(fs, 'rmSync').mockImplementation(jest.fn());
      const spawnSpy = jest.spyOn(child_process, 'spawn').mockImplementation(
        jest.fn(() => {
          child = new MockChildProcess();
          child.onDisconnect = () => {
            state.disconnectCalled = true;
          };
          return child;
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
      console.log = jest.fn();

      const state = {
        mySocket: undefined as Client | undefined,
        gotAgentUpgradeResponse: false,
        agentError: undefined as AgentError | undefined,
      };

      const platformSpy = jest.spyOn(os, 'platform').mockImplementation(jest.fn(() => 'win32'));
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

      platformSpy.mockRestore();
      fetchSpy.mockRestore();
      console.log = originalConsoleLog;
    });

    test('Upgrade -- Pre-4.2.4, force = true', async () => {
      const originalConsoleLog = console.log;
      console.log = jest.fn();

      let child!: MockChildProcess;

      const state = {
        mySocket: undefined as Client | undefined,
        agentUpgradeResponse: undefined as AgentUpgradeResponse | undefined,
        agentError: undefined as AgentError | undefined,
        disconnectCalled: false,
      };

      const platformSpy = jest.spyOn(os, 'platform').mockImplementation(jest.fn(() => 'win32'));
      const fetchSpy = mockFetchForUpgrader();
      const openSyncSpy = jest.spyOn(fs, 'openSync').mockImplementation(jest.fn(() => 42));
      const writeFileSyncSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation(jest.fn());
      const rmSyncSpy = jest.spyOn(fs, 'rmSync').mockImplementation(jest.fn());
      const spawnSpy = jest.spyOn(child_process, 'spawn').mockImplementation(
        jest.fn(() => {
          child = new MockChildProcess();
          child.onDisconnect = () => {
            state.disconnectCalled = true;
          };
          return child;
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
      console.log = jest.fn();

      const state = {
        mySocket: undefined as Client | undefined,
        gotAgentUpgradeResponse: false,
        agentError: undefined as AgentError | undefined,
      };

      const platformSpy = jest.spyOn(os, 'platform').mockImplementation(jest.fn(() => 'win32'));
      const fetchSpy = mockFetchForUpgrader();
      const openSyncSpy = jest.spyOn(fs, 'openSync').mockImplementation(
        jest.fn(() => {
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

      platformSpy.mockRestore();
      fetchSpy.mockRestore();
      openSyncSpy.mockRestore();
      console.log = originalConsoleLog;
    });

    test('Upgrading -- Manifest present on startup, version is wrong (Error)', async () => {
      const unlinkSyncSpy = jest.spyOn(fs, 'unlinkSync');
      const originalConsoleLog = console.log;
      const createPidFileSpy = jest.spyOn(pidModule, 'createPidFile');
      console.log = jest.fn();

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

      unlinkSyncSpy.mockRestore();
      createPidFileSpy.mockRestore();
      console.log = originalConsoleLog;
    });

    test('Upgrading -- Manifest present on startup, version is correct (Success)', async () => {
      const unlinkSyncSpy = jest.spyOn(fs, 'unlinkSync');
      const originalConsoleLog = console.log;
      console.log = jest.fn();

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

      unlinkSyncSpy.mockRestore();
      console.log = originalConsoleLog;
    });

    test('Upgrading -- Manifest present on startup, failed to create agent PID', async () => {
      const unlinkSyncSpy = jest.spyOn(fs, 'unlinkSync');
      const originalConsoleLog = console.log;
      console.log = jest.fn();
      const createPidFileSpy = jest.spyOn(pidModule, 'createPidFile').mockImplementation(() => {
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
      const infoSpy = jest.spyOn(app.log, 'info');
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

      unlinkSyncSpy.mockRestore();
      infoSpy.mockRestore();
      createPidFileSpy.mockRestore();
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

    const unlinkSyncSpy = jest.spyOn(fs, 'unlinkSync');
    const originalConsoleLog = console.log;
    const createPidFileSpy = jest.spyOn(pidModule, 'createPidFile');
    const platformSpy = jest.spyOn(os, 'platform').mockImplementation(jest.fn(() => 'win32'));
    const fetchSpy = mockFetchForUpgrader();
    const writeFileSyncSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation(jest.fn());
    const spawnSpy = jest.spyOn(child_process, 'spawn').mockImplementation(
      jest.fn(() => {
        child = new MockChildProcess();
        child.onDisconnect = () => {
          state.disconnectCalled = true;
        };
        return child;
      })
    );
    const isAppRunningSpy = jest
      .spyOn(pidModule, 'isAppRunning')
      .mockImplementation((appName: string) => appName === 'medplum-upgrading-agent');
    console.log = jest.fn();

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

    const unlinkSyncSpy = jest.spyOn(fs, 'unlinkSync').mockImplementation();
    const originalConsoleLog = console.log;
    const createPidFileSpy = jest.spyOn(pidModule, 'createPidFile');
    const openSyncSpy = jest.spyOn(fs, 'openSync').mockImplementation(jest.fn(() => 42));
    const platformSpy = jest.spyOn(os, 'platform').mockImplementation(jest.fn(() => 'win32'));
    const fetchSpy = mockFetchForUpgrader();
    const writeFileSyncSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation(jest.fn());
    const spawnSpy = jest.spyOn(child_process, 'spawn').mockImplementation(
      jest.fn(() => {
        child = new MockChildProcess();
        child.onDisconnect = () => {
          state.disconnectCalled = true;
        };
        return child;
      })
    );
    const isAppRunningSpy = jest
      .spyOn(pidModule, 'isAppRunning')
      .mockImplementation(
        (appName: string) => appName === 'medplum-upgrading-agent' || appName === 'medplum-agent-upgrader'
      );
    console.log = jest.fn();

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
});

class MockChildProcess extends EventEmitter implements ChildProcess {
  send = jest.fn();
  unref = jest.fn();
  ref = jest.fn();
  disconnect = jest.fn(() => {
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
