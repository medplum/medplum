import {
  AgentMessage,
  AgentReloadConfigRequest,
  AgentTransmitResponse,
  ContentType,
  Hl7Message,
  LogLevel,
  allOk,
  createReference,
  getReferenceString,
  sleep,
} from '@medplum/core';
import { Agent, Bot, Endpoint, Resource } from '@medplum/fhirtypes';
import { Hl7Client, Hl7Server } from '@medplum/hl7';
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

    await app.stop();
    await app.stop();
    await new Promise<void>((resolve) => {
      mockServer.stop(resolve);
    });

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Unknown message type: unknown'));
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

    await app.stop();
    await app.stop();
    mockServer2.stop();
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

    const app = new App(medplum, agent.id as string, LogLevel.INFO);
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

    const app = new App(medplum, agent.id as string, LogLevel.INFO);
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

    while (!state.gotAgentReloadResponse) {
      if (shouldThrow) {
        throw new Error('Timeout');
      }
      await sleep(100);
    }
    clearTimeout(timeout);

    // We should get back `agent:reloadconfig:response` message
    expect(state.gotAgentReloadResponse).toEqual(true);

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
    expect(state.gotAgentReloadResponse).toEqual(false);
    expect(state.gotAgentError).toEqual(true);

    // Check channels have been updated
    expect(app.channels.has('hl7-test')).toEqual(true);
    expect(app.channels.has('hl7-prod')).toEqual(true);
    expect(app.channels.has('dicom-test')).toEqual(true);
    expect(app.channels.has('dicom-prod')).toEqual(true);
    expect(app.channels.has('hl7-dev')).toEqual(true);
    expect(app.channels.size).toEqual(5);

    await app.stop();
    await new Promise<void>((resolve) => {
      mockServer.stop(resolve);
    });
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

    const app = new App(medplum, agent.id as string, LogLevel.INFO);
    await app.start();

    // There should be no channels
    expect(app.channels.size).toEqual(0);

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
    expect(isError).toEqual(true);

    hl7Client.close();

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
          body:
            'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
            'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-\r' +
            'NK1|1|JONES^BARBARA^K|SPO|||||20011105\r' +
            'PV1|1|I|2000^2012^01||||004777^LEBAUER^SIDNEY^J.|||SUR||-||1|A0-',
          remote: 'mllp://localhost:57099',
        })
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

    expect(state.gotAgentError).toEqual(true);

    state.mySocket.send(
      Buffer.from(
        JSON.stringify({
          type: 'agent:transmit:response',
          contentType: ContentType.HL7_V2,
          body:
            'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
            'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-\r' +
            'NK1|1|JONES^BARBARA^K|SPO|||||20011105\r' +
            'PV1|1|I|2000^2012^01||||004777^LEBAUER^SIDNEY^J.|||SUR||-||1|A0-',
          remote: 'mllp://localhost:57099',
        } satisfies AgentTransmitResponse)
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
    expect(app.channels.size).toEqual(1);
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

    hl7Client.close();

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

    const app = new App(medplum, agent.id as string, LogLevel.INFO);
    await app.start();

    // There should be only the prod channel
    expect(app.channels.size).toEqual(1);
    expect(app.channels.has('prod')).toEqual(true);

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
    expect(isError).toEqual(true);

    hl7Client.close();

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

    hl7Client.close();

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
    expect(app.channels.size).toEqual(2);
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

    hl7Client.close();

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

    hl7Client.close();

    await app.stop();
    await new Promise<void>((resolve) => {
      mockServer.stop(resolve);
    });

    console.log = originalConsoleLog;
  });
});
