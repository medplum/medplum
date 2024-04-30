import {
  AgentReloadConfigRequest,
  ContentType,
  LogLevel,
  allOk,
  createReference,
  getReferenceString,
  sleep,
} from '@medplum/core';
import { Agent, Bot, Endpoint, Resource } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { Client, Server } from 'mock-socket';
import { randomUUID } from 'node:crypto';
import { App } from './app';
import { AgentHl7Channel } from './hl7';

jest.mock('node-windows');

const medplum = new MockClient();

describe('App', () => {
  beforeAll(async () => {
    console.log = jest.fn();
    console.error = jest.fn();

    medplum.router.router.add('POST', ':resourceType/:id/$execute', async () => {
      return [allOk, {} as Resource];
    });
  });

  test('Runs successfully', async () => {
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

    const app = new App(medplum, agent.id as string, LogLevel.INFO);
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

    app.stop();
    app.stop();
    mockServer.stop();

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Unknown message type: unknown'));
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

    const app = new App(medplum, agent.id as string, LogLevel.INFO);
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

    // Sleep for a bit to allow healthchecks while disconnected
    await sleep(1000);

    // Start a new server
    const mockServer2 = new Server('wss://example.com/ws/agent');
    mockServer2.on('connection', mockConnectionHandler);

    // Wait for the WebSocket to reconnect
    while (!state.mySocket) {
      await sleep(100);
    }

    app.stop();
    app.stop();
    mockServer2.stop();
  });

  test('Empty endpoint URL', async () => {
    console.log = jest.fn();
    console.warn = jest.fn();

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

    const app = new App(medplum, agent.id as string, LogLevel.INFO);
    await app.start();
    app.stop();
    mockServer.stop();

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Ignoring empty endpoint address: test'));
  });

  test('Unknown endpoint protocol', async () => {
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

    const app = new App(medplum, agent.id as string, LogLevel.INFO);
    await app.start();
    app.stop();
    mockServer.stop();

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Unsupported endpoint type: foo:'));
  });

  test('Reload config', async () => {
    // Create agent with an HL7 channel
    const state = {
      mySocket: undefined as Client | undefined,
      gotAgentSuccess: false,
    };

    function mockConnectionHandler(socket: Client): void {
      state.mySocket = socket;
      socket.on('message', (data) => {
        const command = JSON.parse((data as Buffer).toString('utf8'));
        if (command.type === 'agent:connect:request') {
          socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
        } else if (command.type === 'agent:success') {
          state.gotAgentSuccess = true;
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
      address: 'mllp://0.0.0.0:9002',
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

    const app = new App(medplum, agent.id as string, LogLevel.INFO);
    app.heartbeatPeriod = 100;
    await app.start();

    // Wait for the WebSocket to connect
    while (!state.mySocket) {
      await sleep(100);
    }

    // Test HL7 endpoint is there
    expect(app.channels.has('hl7-test')).toEqual(true);
    expect(app.channels.has('hl7-prod')).toEqual(true);
    expect(app.channels.has('dicom-test')).toEqual(true);
    expect(app.channels.has('dicom-prod')).toEqual(true);
    expect(app.channels.has('hl7-staging')).toEqual(true);
    expect(app.channels.size).toEqual(5);

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

    while (!state.gotAgentSuccess) {
      if (shouldThrow) {
        throw new Error('Timeout');
      }
      await sleep(100);
    }
    clearTimeout(timeout);

    // We should get back `agent:success` message
    expect(state.gotAgentSuccess).toEqual(true);

    // Check channels have been updated
    expect(app.channels.has('hl7-test')).toEqual(true);
    expect(app.channels.has('hl7-prod')).toEqual(true);
    expect(app.channels.has('dicom-test')).toEqual(true);
    expect(app.channels.has('dicom-prod')).toEqual(true);
    expect(app.channels.has('hl7-dev')).toEqual(true);
    expect(app.channels.size).toEqual(5);

    // Make sure old channel is closed
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

    app.stop();
    mockServer.stop();
  });
});
