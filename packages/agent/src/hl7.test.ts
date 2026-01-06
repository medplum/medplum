// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type {
  AckCode,
  AgentHeartbeatResponse,
  AgentReloadConfigRequest,
  AgentReloadConfigResponse,
  AgentTransmitRequest,
  AgentTransmitResponse,
} from '@medplum/core';
import { allOk, ContentType, createReference, Hl7Message, LogLevel, MEDPLUM_VERSION, sleep } from '@medplum/core';
import type { Agent, AgentChannel, Bot, Endpoint, Resource } from '@medplum/fhirtypes';
import { Hl7Client, Hl7Server, ReturnAckCategory } from '@medplum/hl7';
import { MockClient } from '@medplum/mock';
import { randomUUID } from 'crypto';
import type { Client } from 'mock-socket';
import { Server } from 'mock-socket';
import { App } from './app';
import type { AgentHl7ChannelConnection, AppLevelAckMode } from './hl7';
import {
  AgentHl7Channel,
  APP_LEVEL_ACK_CODES,
  APP_LEVEL_ACK_MODES,
  parseAppLevelAckMode,
  parseEnhancedMode,
  shouldSendAppLevelAck,
} from './hl7';
import { createMockLogger } from './test-utils';

jest.mock('./constants', () => ({
  ...jest.requireActual('./constants'),
  // We don't care about how fast the clients release in these tests
  CLIENT_RELEASE_COUNTDOWN_MS: 0,
}));

const medplum = new MockClient();
let bot: Bot;
let endpoint: Endpoint;

describe('HL7', () => {
  beforeAll(async () => {
    console.log = jest.fn();

    medplum.router.router.add('POST', ':resourceType/:id/$execute', async () => {
      return [allOk, {} as Resource];
    });

    bot = await medplum.createResource<Bot>({ resourceType: 'Bot' });

    endpoint = await medplum.createResource<Endpoint>({
      resourceType: 'Endpoint',
      status: 'active',
      address: 'mllp://0.0.0.0:57000',
      connectionType: { code: ContentType.HL7_V2 },
      payloadType: [{ coding: [{ code: ContentType.HL7_V2 }] }],
    });
  });

  let mockServer: Server;
  beforeEach(() => {
    mockServer = new Server('wss://example.com/ws/agent');
  });
  afterEach(() => {
    mockServer.stop();
  });

  test('Send and receive', async () => {
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

        if (command.type === 'agent:transmit:request') {
          const hl7Message = Hl7Message.parse(command.body);
          const ackMessage = hl7Message.buildAck();
          socket.send(
            Buffer.from(
              JSON.stringify({
                type: 'agent:transmit:response',
                channel: command.channel,
                callback: command.callback,
                remote: command.remote,
                body: ackMessage.toString(),
              })
            )
          );
        }

        if (command.type === 'agent:heartbeat:request') {
          socket.send(
            Buffer.from(
              JSON.stringify({
                type: 'agent:heartbeat:response',
                version: MEDPLUM_VERSION,
              } satisfies AgentHeartbeatResponse)
            )
          );
        }
      });
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
    await app.start();

    const client = new Hl7Client({
      host: 'localhost',
      port: 57000,
    });

    const response = await client.sendAndWait(
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

    await client.close();
    await app.stop();
  });

  test('Send and receive -- error', async () => {
    const originalConsoleLog = console.log;
    console.log = jest.fn();

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

        if (command.type === 'agent:transmit:request') {
          socket.send(
            Buffer.from(
              JSON.stringify({
                type: 'agent:transmit:response',
                channel: command.channel,
                remote: command.remote,
                contentType: ContentType.JSON,
                statusCode: 400,
                callback: command.callback,
                body: 'Something bad happened',
              } satisfies AgentTransmitResponse)
            )
          );
        }

        if (command.type === 'agent:heartbeat:request') {
          socket.send(
            Buffer.from(
              JSON.stringify({
                type: 'agent:heartbeat:response',
                version: MEDPLUM_VERSION,
              } satisfies AgentHeartbeatResponse)
            )
          );
        }
      });
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
    await app.start();

    const client = new Hl7Client({
      host: 'localhost',
      port: 57000,
    });

    await client.send(
      Hl7Message.parse(
        'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
          'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-\r' +
          'NK1|1|JONES^BARBARA^K|SPO|||||20011105\r' +
          'PV1|1|I|2000^2012^01||||004777^LEBAUER^SIDNEY^J.|||SUR||-||1|A0-'
      )
    );

    await sleep(150);
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Error during handling transmit request: Something bad happened')
    );

    await client.close();
    await app.stop();
    console.log = originalConsoleLog;
  });

  test('Send and receive -- no callback in response', async () => {
    const originalConsoleLog = console.log;
    console.log = jest.fn();

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

        if (command.type === 'agent:transmit:request') {
          const hl7Message = Hl7Message.parse(command.body);
          const ackMessage = hl7Message.buildAck();
          socket.send(
            Buffer.from(
              JSON.stringify({
                type: 'agent:transmit:response',
                channel: command.channel,
                remote: command.remote,
                contentType: ContentType.HL7_V2,
                statusCode: 200,
                body: ackMessage.toString(),
              } satisfies AgentTransmitResponse)
            )
          );
        }

        if (command.type === 'agent:heartbeat:request') {
          socket.send(
            Buffer.from(
              JSON.stringify({
                type: 'agent:heartbeat:response',
                version: MEDPLUM_VERSION,
              } satisfies AgentHeartbeatResponse)
            )
          );
        }
      });
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
    await app.start();

    const client = new Hl7Client({
      host: 'localhost',
      port: 57000,
    });

    await client.send(
      Hl7Message.parse(
        'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
          'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-\r' +
          'NK1|1|JONES^BARBARA^K|SPO|||||20011105\r' +
          'PV1|1|I|2000^2012^01||||004777^LEBAUER^SIDNEY^J.|||SUR||-||1|A0-'
      )
    );

    await sleep(150);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Transmit response missing callback'));

    await client.close();
    await app.stop();
    console.log = originalConsoleLog;
  });

  test('Send and receive -- enhanced mode', async () => {
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

        if (command.type === 'agent:transmit:request') {
          const hl7Message = Hl7Message.parse(command.body);
          const ackMessage = hl7Message.buildAck();
          socket.send(
            Buffer.from(
              JSON.stringify({
                type: 'agent:transmit:response',
                channel: command.channel,
                callback: command.callback,
                remote: command.remote,
                body: ackMessage.toString(),
              })
            )
          );
        }

        if (command.type === 'agent:heartbeat:request') {
          socket.send(
            Buffer.from(
              JSON.stringify({
                type: 'agent:heartbeat:response',
                version: MEDPLUM_VERSION,
              } satisfies AgentHeartbeatResponse)
            )
          );
        }
      });
    });

    const enhancedEndpoint = await medplum.createResource<Endpoint>({
      ...endpoint,
      id: undefined,
      address: endpoint.address + '?enhanced=true',
    });

    const agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      name: 'Test Agent',
      status: 'active',
      channel: [
        {
          name: 'test',
          endpoint: createReference(enhancedEndpoint),
          targetReference: createReference(bot),
        },
      ],
    });

    const app = new App(medplum, agent.id, LogLevel.INFO);
    await app.start();

    const client = new Hl7Client({
      host: 'localhost',
      port: 57000,
    });

    const response = await client.sendAndWait(
      Hl7Message.parse(
        'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.5\r' +
          'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-\r' +
          'NK1|1|JONES^BARBARA^K|SPO|||||20011105\r' +
          'PV1|1|I|2000^2012^01||||004777^LEBAUER^SIDNEY^J.|||SUR||-||1|A0-'
      ),
      { returnAck: ReturnAckCategory.FIRST }
    );
    expect(response).toBeDefined();
    expect(response.header.getComponent(9, 1)).toBe('ACK');
    // Should get a commit ACK
    expect(response.getSegment('MSA')?.getComponent(1, 1)).toStrictEqual('CA');
    // Should see info severity level
    expect(response.segments).toHaveLength(2);
    expect(response.segments[1].name).toBe('MSA');

    await client.close();
    await app.stop();
  });

  test('Send and receive -- enhanced mode + messagesPerMin', async () => {
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

        if (command.type === 'agent:transmit:request') {
          const hl7Message = Hl7Message.parse(command.body);
          const ackMessage = hl7Message.buildAck();
          socket.send(
            Buffer.from(
              JSON.stringify({
                type: 'agent:transmit:response',
                channel: command.channel,
                callback: command.callback,
                remote: command.remote,
                body: ackMessage.toString(),
              })
            )
          );
        }

        if (command.type === 'agent:heartbeat:request') {
          socket.send(
            Buffer.from(
              JSON.stringify({
                type: 'agent:heartbeat:response',
                version: MEDPLUM_VERSION,
              } satisfies AgentHeartbeatResponse)
            )
          );
        }
      });
    });

    const enhancedEndpoint = await medplum.createResource<Endpoint>({
      ...endpoint,
      id: undefined,
      address: 'mllp://0.0.0.0:57010?enhanced=true&messagesPerMin=60',
    });

    const agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      name: 'Test Agent',
      status: 'active',
      channel: [
        {
          name: 'test',
          endpoint: createReference(enhancedEndpoint),
          targetReference: createReference(bot),
        },
      ],
    });

    const app = new App(medplum, agent.id, LogLevel.INFO);
    await app.start();

    const client = new Hl7Client({
      host: 'localhost',
      port: 57010,
    });

    const startTime = Date.now();
    const response1 = await client.sendAndWait(
      Hl7Message.parse(
        'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.5\r' +
          'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-\r' +
          'NK1|1|JONES^BARBARA^K|SPO|||||20011105\r' +
          'PV1|1|I|2000^2012^01||||004777^LEBAUER^SIDNEY^J.|||SUR||-||1|A0-'
      ),
      { returnAck: ReturnAckCategory.FIRST }
    );
    await client.sendAndWait(
      Hl7Message.parse(
        'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00002|P|2.5\r' +
          'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-\r' +
          'NK1|1|JONES^BARBARA^K|SPO|||||20011105\r' +
          'PV1|1|I|2000^2012^01||||004777^LEBAUER^SIDNEY^J.|||SUR||-||1|A0-'
      ),
      { returnAck: ReturnAckCategory.FIRST }
    );

    const endTime = Date.now();
    expect(endTime - startTime).toBeGreaterThan(800);

    expect(response1).toBeDefined();
    expect(response1.header.getComponent(9, 1)).toBe('ACK');
    // Should get a commit ACK
    expect(response1.getSegment('MSA')?.getComponent(1, 1)).toStrictEqual('CA');
    // Should see info severity level
    expect(response1.segments).toHaveLength(2);
    expect(response1.segments[1].name).toBe('MSA');

    await client.close();
    await app.stop();
  });

  test('Invalid messagesPerMin logs warning', async () => {
    const originalConsoleLog = console.log;
    console.log = jest.fn();

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

    const enhancedEndpoint = await medplum.createResource<Endpoint>({
      ...endpoint,
      id: undefined,
      address: 'mllp://0.0.0.0:57010?enhanced=true&messagesPerMin=twenty',
    });

    const agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      name: 'Test Agent',
      status: 'active',
      channel: [
        {
          name: 'test',
          endpoint: createReference(enhancedEndpoint),
          targetReference: createReference(bot),
        },
      ],
    });

    const app = new App(medplum, agent.id, LogLevel.INFO);
    await app.start();

    // Wait for logging to occur just in case
    await sleep(200);

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Invalid messagesPerMin: 'twenty'; must be a valid integer.")
    );

    await app.stop();
    console.log = originalConsoleLog;
  });

  test('Push', async () => {
    let mySocket: Client | undefined = undefined;

    mockServer.on('connection', (socket) => {
      mySocket = socket;
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

    // Start an HL7 listener
    const hl7Messages = [];
    const hl7Server = new Hl7Server((conn) => {
      conn.addEventListener('message', ({ message }) => {
        hl7Messages.push(message);
        conn.send(message.buildAck());
      });
    });
    await hl7Server.start(57001);

    // Start the app
    const app = new App(medplum, agent.id, LogLevel.INFO);
    await app.start();

    // Wait for the WebSocket to connect
    // eslint-disable-next-line no-unmodified-loop-condition
    while (!mySocket) {
      await sleep(20);
    }

    // At this point, we expect the websocket to be connected
    expect(mySocket).toBeDefined();

    // Send a push message
    const wsClient = mySocket as unknown as Client;
    wsClient.send(
      Buffer.from(
        JSON.stringify({
          type: 'agent:transmit:request',
          body:
            'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
            'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-\r' +
            'NK1|1|JONES^BARBARA^K|SPO|||||20011105\r' +
            'PV1|1|I|2000^2012^01||||004777^LEBAUER^SIDNEY^J.|||SUR||-||1|A0-',
          remote: 'mllp://localhost:57001',
        })
      )
    );

    // Wait for the HL7 message to be received
    while (hl7Messages.length < 1) {
      await sleep(20);
    }
    expect(hl7Messages.length).toBe(1);

    // Shutdown everything
    await hl7Server.stop();
    await app.stop();
  });

  test('Push -- keepAlive Enabled', async () => {
    const state = {
      reloadConfigResponse: null as AgentReloadConfigResponse | null,
    };

    let mySocket: Client | undefined = undefined;

    mockServer.on('connection', (socket) => {
      mySocket = socket;
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
        } else if (command.type === 'agent:reloadconfig:response') {
          state.reloadConfigResponse = command;
        }
      });
    });

    // Start with keepAlive = false
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
      setting: [{ name: 'keepAlive', valueBoolean: false }],
    });

    // Start an HL7 listener
    const hl7Messages = [];
    const hl7Server = new Hl7Server((conn) => {
      conn.addEventListener('message', ({ message }) => {
        hl7Messages.push(message);
        conn.send(message.buildAck());
      });
    });
    await hl7Server.start(57001);

    // Start the app
    const app = new App(medplum, agent.id, LogLevel.INFO);
    await app.start();

    // Wait for the WebSocket to connect
    // eslint-disable-next-line no-unmodified-loop-condition
    while (!mySocket) {
      await sleep(20);
    }

    // At this point, we expect the websocket to be connected
    expect(mySocket).toBeDefined();

    // Send a push message
    const wsClient = mySocket as unknown as Client;
    wsClient.send(
      Buffer.from(
        JSON.stringify({
          type: 'agent:transmit:request',
          body:
            'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
            'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-\r' +
            'NK1|1|JONES^BARBARA^K|SPO|||||20011105\r' +
            'PV1|1|I|2000^2012^01||||004777^LEBAUER^SIDNEY^J.|||SUR||-||1|A0-',
          remote: 'mllp://localhost:57001',
          contentType: ContentType.HL7_V2,
        } satisfies AgentTransmitRequest)
      )
    );

    // Wait for the HL7 message to be received
    while (hl7Messages.length < 1) {
      await sleep(20);
    }
    expect(hl7Messages.length).toBe(1);

    // Run GC manually
    app.hl7Clients.get('mllp://localhost:57001')?.runClientGc();

    // Make sure we are not keeping clients around yet
    expect(app.hl7Clients.get('mllp://localhost:57001')?.size()).toStrictEqual(0);

    wsClient.send(
      Buffer.from(
        JSON.stringify({
          type: 'agent:transmit:request',
          body:
            'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
            'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-\r' +
            'NK1|1|JONES^BARBARA^K|SPO|||||20011105\r' +
            'PV1|1|I|2000^2012^01||||004777^LEBAUER^SIDNEY^J.|||SUR||-||1|A0-',
          remote: 'mllp://localhost:57001',
          contentType: ContentType.HL7_V2,
        } satisfies AgentTransmitRequest)
      )
    );

    // Wait for the HL7 message to be received
    while (hl7Messages.length < 2) {
      await sleep(20);
    }

    expect(hl7Messages.length).toBe(2);

    // Run GC manually
    app.hl7Clients.get('mllp://localhost:57001')?.runClientGc();

    expect(app.hl7Clients.get('mllp://localhost:57001')?.size()).toStrictEqual(0);

    // Update config and make agent reload config
    const updatedAgent1 = await medplum.updateResource({
      ...agent,
      setting: [{ name: 'keepAlive', valueBoolean: true }],
    });
    expect(updatedAgent1).toBeDefined();

    wsClient.send(
      Buffer.from(
        JSON.stringify({
          type: 'agent:reloadconfig:request',
          callback: randomUUID(),
        } satisfies AgentReloadConfigRequest)
      )
    );

    while (!state.reloadConfigResponse) {
      await sleep(20);
    }

    // Size is zero again since we cleared out the pools
    expect(app.hl7Clients.size).toStrictEqual(0);

    wsClient.send(
      Buffer.from(
        JSON.stringify({
          type: 'agent:transmit:request',
          body:
            'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
            'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-\r' +
            'NK1|1|JONES^BARBARA^K|SPO|||||20011105\r' +
            'PV1|1|I|2000^2012^01||||004777^LEBAUER^SIDNEY^J.|||SUR||-||1|A0-',
          remote: 'mllp://localhost:57001',
          contentType: ContentType.HL7_V2,
        } satisfies AgentTransmitRequest)
      )
    );

    // Wait for the HL7 message to be received
    while (hl7Messages.length < 3) {
      await sleep(20);
    }

    expect(hl7Messages.length).toBe(3);
    expect(app.hl7Clients.get('mllp://localhost:57001')?.size()).toStrictEqual(1);

    // Capture the socket from the kept-alive client
    const pool = app.hl7Clients.get('mllp://localhost:57001');
    expect(pool).toBeDefined();
    const clientsBeforeReload = pool?.getClients();
    expect(clientsBeforeReload).toBeDefined();
    expect(clientsBeforeReload?.length).toBe(1);
    const clientBeforeReload = clientsBeforeReload?.[0];
    expect(clientBeforeReload?.connection).toBeDefined();
    expect(clientBeforeReload?.connection?.socket).toBeDefined();
    const socketBeforeReload = clientBeforeReload?.connection?.socket;
    expect(socketBeforeReload?.closed).toBe(false);

    wsClient.send(
      Buffer.from(
        JSON.stringify({
          type: 'agent:transmit:request',
          body:
            'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
            'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-\r' +
            'NK1|1|JONES^BARBARA^K|SPO|||||20011105\r' +
            'PV1|1|I|2000^2012^01||||004777^LEBAUER^SIDNEY^J.|||SUR||-||1|A0-',
          remote: 'mllp://localhost:57001',
          contentType: ContentType.HL7_V2,
        } satisfies AgentTransmitRequest)
      )
    );

    // Wait for the HL7 message to be received
    while (hl7Messages.length < 4) {
      await sleep(20);
    }

    expect(hl7Messages.length).toBe(4);
    expect(app.hl7Clients.get('mllp://localhost:57001')?.size()).toStrictEqual(1);

    // Set the config back to keepAlive !== true
    const updatedAgent2 = await medplum.updateResource({
      ...updatedAgent1,
      setting: [],
    });
    expect(updatedAgent2).toBeDefined();

    wsClient.send(
      Buffer.from(
        JSON.stringify({
          type: 'agent:reloadconfig:request',
          callback: randomUUID(),
        } satisfies AgentReloadConfigRequest)
      )
    );

    state.reloadConfigResponse = null;
    while (!state.reloadConfigResponse) {
      await sleep(20);
    }

    // After reloading with keepAlive changed from true to false, all pools should be cleared
    expect(app.hl7Clients.size).toStrictEqual(0);
    // Verify the socket from before the reload is now closed
    expect(socketBeforeReload?.closed).toBe(true);

    wsClient.send(
      Buffer.from(
        JSON.stringify({
          type: 'agent:transmit:request',
          body:
            'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
            'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-\r' +
            'NK1|1|JONES^BARBARA^K|SPO|||||20011105\r' +
            'PV1|1|I|2000^2012^01||||004777^LEBAUER^SIDNEY^J.|||SUR||-||1|A0-',
          remote: 'mllp://localhost:57001',
          contentType: ContentType.HL7_V2,
        } satisfies AgentTransmitRequest)
      )
    );

    // Wait for the HL7 message to be received
    while (hl7Messages.length < 5) {
      await sleep(20);
    }

    expect(hl7Messages.length).toBe(5);

    // Run GC manually
    app.hl7Clients.get('mllp://localhost:57001')?.runClientGc();

    expect(app.hl7Clients.get('mllp://localhost:57001')?.size()).toStrictEqual(0);

    wsClient.send(
      Buffer.from(
        JSON.stringify({
          type: 'agent:transmit:request',
          body:
            'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
            'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-\r' +
            'NK1|1|JONES^BARBARA^K|SPO|||||20011105\r' +
            'PV1|1|I|2000^2012^01||||004777^LEBAUER^SIDNEY^J.|||SUR||-||1|A0-',
          remote: 'mllp://localhost:57001',
          contentType: ContentType.HL7_V2,
        } satisfies AgentTransmitRequest)
      )
    );

    // Wait for the HL7 message to be received
    while (hl7Messages.length < 6) {
      await sleep(20);
    }

    expect(hl7Messages.length).toBe(6);

    // Run GC manually
    app.hl7Clients.get('mllp://localhost:57001')?.runClientGc();

    expect(app.hl7Clients.get('mllp://localhost:57001')?.size()).toStrictEqual(0);

    // Shutdown everything
    await hl7Server.stop();
    await app.stop();

    // Make sure all clients are closed after stopping app
    expect(app.hl7Clients.size).toStrictEqual(0);
  });

  test('keepAlive: Remote closes connection', async () => {
    const originalConsoleLog = console.log;
    console.log = jest.fn();

    const state = {
      reloadConfigResponse: null as AgentReloadConfigResponse | null,
    };

    let mySocket: Client | undefined = undefined;

    mockServer.on('connection', (socket) => {
      mySocket = socket;
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
        } else if (command.type === 'agent:reloadconfig:response') {
          state.reloadConfigResponse = command;
        }
      });
    });

    // Start with keepAlive = false
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
      setting: [{ name: 'keepAlive', valueBoolean: true }],
    });

    // Start an HL7 listener
    const hl7Messages = [];
    const hl7Server = new Hl7Server((conn) => {
      conn.addEventListener('message', ({ message }) => {
        hl7Messages.push(message);
        conn.send(message.buildAck());
      });
      // Set timeout so keep-alive won't keep server open when connection is inactive
      conn.socket.setTimeout(500);
      conn.socket.on('timeout', () => {
        conn.socket.end();
        conn.socket.destroy();
      });
    });
    await hl7Server.start(57001);

    // Start the app
    const app = new App(medplum, agent.id, LogLevel.INFO);
    await app.start();

    // Wait for the WebSocket to connect
    // eslint-disable-next-line no-unmodified-loop-condition
    while (!mySocket) {
      await sleep(20);
    }

    // At this point, we expect the websocket to be connected
    expect(mySocket).toBeDefined();

    // Send a push message
    const wsClient = mySocket as unknown as Client;
    wsClient.send(
      Buffer.from(
        JSON.stringify({
          type: 'agent:transmit:request',
          body:
            'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
            'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-\r' +
            'NK1|1|JONES^BARBARA^K|SPO|||||20011105\r' +
            'PV1|1|I|2000^2012^01||||004777^LEBAUER^SIDNEY^J.|||SUR||-||1|A0-',
          remote: 'mllp://localhost:57001',
          contentType: ContentType.HL7_V2,
        } satisfies AgentTransmitRequest)
      )
    );

    // Wait for the HL7 message to be received
    while (hl7Messages.length < 1) {
      await sleep(20);
    }
    expect(hl7Messages.length).toBe(1);
    expect(app.hl7Clients.get('mllp://localhost:57001')?.size()).toStrictEqual(1);

    // After stopping the server (and therefore closing the connection),
    // We should no longer have an open client to the given server
    await hl7Server.stop();
    while (app.hl7Clients.get('mllp://localhost:57001')?.size() !== 0) {
      await sleep(20);
    }
    expect(app.hl7Clients.get('mllp://localhost:57001')?.size()).toStrictEqual(0);

    await app.stop();

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Persistent connection to remote 'mllp://localhost:57001' closed")
    );

    console.log = originalConsoleLog;
  });

  test('keepAlive: Error occurs', async () => {
    const originalConsoleLog = console.log;
    console.log = jest.fn();

    const state = {
      reloadConfigResponse: null as AgentReloadConfigResponse | null,
    };

    let mySocket: Client | undefined = undefined;

    mockServer.on('connection', (socket) => {
      mySocket = socket;
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
        } else if (command.type === 'agent:reloadconfig:response') {
          state.reloadConfigResponse = command;
        }
      });
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
      setting: [{ name: 'keepAlive', valueBoolean: true }],
    });

    // Start an HL7 listener
    const hl7Messages = [];

    // This is the mode for the HL7 server when a new connection is created
    // We start with no timeout so we can test the error functionality
    // But on the second connection we want it to timeout
    let mode = 'NO_TIMEOUT' as 'TIMEOUT' | 'NO_TIMEOUT';

    const hl7Server = new Hl7Server((conn) => {
      conn.addEventListener('message', ({ message }) => {
        hl7Messages.push(message);
        conn.send(message.buildAck());
      });

      if (mode === 'TIMEOUT') {
        const socket = conn.socket;
        socket.setTimeout(500);
        socket.on('timeout', () => {
          socket.end();
          socket.destroy();
        });
      }
    });
    await hl7Server.start(57001);

    // Start the app
    const app = new App(medplum, agent.id, LogLevel.INFO);
    await app.start();

    // Wait for the WebSocket to connect
    // eslint-disable-next-line no-unmodified-loop-condition
    while (!mySocket) {
      await sleep(20);
    }

    // At this point, we expect the websocket to be connected
    expect(mySocket).toBeDefined();

    // Send a push message
    const wsClient = mySocket as unknown as Client;
    wsClient.send(
      Buffer.from(
        JSON.stringify({
          type: 'agent:transmit:request',
          body:
            'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
            'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-\r' +
            'NK1|1|JONES^BARBARA^K|SPO|||||20011105\r' +
            'PV1|1|I|2000^2012^01||||004777^LEBAUER^SIDNEY^J.|||SUR||-||1|A0-',
          remote: 'mllp://localhost:57001',
        })
      )
    );

    // Wait for the HL7 message to be received
    while (hl7Messages.length < 1) {
      await sleep(20);
    }
    expect(hl7Messages.length).toBe(1);
    expect(app.hl7Clients.get('mllp://localhost:57001')?.size()).toStrictEqual(1);

    // An error happened
    const hl7ClientPool = app.hl7Clients.get('mllp://localhost:57001');
    expect(hl7ClientPool).toBeDefined();
    const clients = hl7ClientPool?.getClients();
    expect(clients).toBeDefined();
    expect(clients?.length).toBeGreaterThan(0);
    const hl7Client = clients?.[0];
    expect(hl7Client?.connection).toBeDefined();
    expect(hl7Client?.connection?.socket).toBeDefined();

    hl7Client?.connection?.socket.emit('error', new Error('Something bad happened'));

    // We should no longer have an open client to the given server
    // Since an error has occurred
    while (app.hl7Clients.get('mllp://localhost:57001')?.size() !== 0) {
      await sleep(20);
    }
    expect(app.hl7Clients.get('mllp://localhost:57001')?.size()).toStrictEqual(0);

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining(
        `Persistent connection to remote 'mllp://localhost:57001' encountered error: 'Something bad happened' - Closing connection...`
      )
    );

    // Set the socket to timeout on inactivity since we are not going to manually close the connection
    mode = 'TIMEOUT';

    // Next request to server should make a new client
    wsClient.send(
      Buffer.from(
        JSON.stringify({
          type: 'agent:transmit:request',
          body:
            'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00002|P|2.2\r' +
            'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-\r' +
            'NK1|1|JONES^BARBARA^K|SPO|||||20011105\r' +
            'PV1|1|I|2000^2012^01||||004777^LEBAUER^SIDNEY^J.|||SUR||-||1|A0-',
          remote: 'mllp://localhost:57001',
        })
      )
    );

    expect(hl7Messages.length).toBe(1);

    // Wait for the HL7 message to be received
    while (hl7Messages.length < 2) {
      await sleep(20);
    }

    expect(hl7Messages.length).toBe(2);
    expect(app.hl7Clients.get('mllp://localhost:57001')?.size()).toStrictEqual(1);

    await hl7Server.stop();
    await app.stop();

    console.log = originalConsoleLog;
  });

  test('Default maxClientsPerRemote of 5 in non-keepAlive mode', async () => {
    let mySocket: Client | undefined = undefined;

    mockServer.on('connection', (socket) => {
      mySocket = socket;
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

    // Start an HL7 listener that doesn't respond immediately
    const releaseMessages: (() => void)[] = [];
    const hl7Server = new Hl7Server((conn) => {
      conn.addEventListener('message', ({ message }) => {
        releaseMessages.push(() => {
          conn.send(message.buildAck());
        });
      });
    });
    await hl7Server.start(57002);

    const app = new App(medplum, agent.id, LogLevel.INFO);
    await app.start();

    // eslint-disable-next-line no-unmodified-loop-condition
    while (!mySocket) {
      await sleep(20);
    }

    const wsClient = mySocket as unknown as Client;

    // Send 10 concurrent messages - should all get clients
    const promises: Promise<void>[] = [];
    for (let i = 0; i < 10; i++) {
      promises.push(
        new Promise<void>((resolve) => {
          wsClient.send(
            Buffer.from(
              JSON.stringify({
                type: 'agent:transmit:request',
                body:
                  `MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG${i.toString().padStart(5, '0')}|P|2.2\r` +
                  'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-',
                remote: 'mllp://localhost:57002',
                contentType: ContentType.HL7_V2,
              } satisfies AgentTransmitRequest)
            )
          );
          resolve();
        })
      );
    }
    await Promise.all(promises);

    // Wait for all messages to be received
    while (releaseMessages.length < 5) {
      await sleep(20);
    }

    // Pool should have exactly 5 clients
    expect(app.hl7Clients.get('mllp://localhost:57002')?.size()).toStrictEqual(5);

    // Send one more message - should wait since we're at limit
    wsClient.send(
      Buffer.from(
        JSON.stringify({
          type: 'agent:transmit:request',
          body:
            'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00010|P|2.2\r' +
            'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-',
          remote: 'mllp://localhost:57002',
          contentType: ContentType.HL7_V2,
        } satisfies AgentTransmitRequest)
      )
    );

    // Give it a moment to process
    await sleep(50);

    // Should still be at 5 clients, not 6
    expect(app.hl7Clients.get('mllp://localhost:57002')?.size()).toStrictEqual(5);

    // Release one message
    releaseMessages[0]();
    await sleep(50);

    // In non-keepAlive mode, releasing should allow the 11th message through
    while (releaseMessages.length < 6) {
      await sleep(20);
    }

    // Still should have at most 5 clients at any time
    expect(app.hl7Clients.get('mllp://localhost:57002')?.size()).toBeLessThanOrEqual(5);

    // Release remaining messages
    for (let i = 1; i < releaseMessages.length; i++) {
      releaseMessages[i]();
    }

    // Run GC manually
    // This test sends a few messages very quickly and so its likely these clients are clearing out messages for a few ms
    while (app.hl7Clients.get('mllp://localhost:57002')?.size()) {
      await sleep(20);
      app.hl7Clients.get('mllp://localhost:57002')?.runClientGc();
    }

    // Should have no clients left in pool after all messages released
    expect(app.hl7Clients.get('mllp://localhost:57002')?.size()).toStrictEqual(0);

    await hl7Server.stop();
    await app.stop();
  });

  test('Default maxClientsPerRemote of 1 in keepAlive mode', async () => {
    let mySocket: Client | undefined = undefined;

    mockServer.on('connection', (socket) => {
      mySocket = socket;
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
      name: 'Test Agent',
      status: 'active',
      channel: [
        {
          name: 'test',
          endpoint: createReference(endpoint),
          targetReference: createReference(bot),
        },
      ],
      setting: [{ name: 'keepAlive', valueBoolean: true }],
    });

    const releaseMessages: (() => void)[] = [];
    const hl7Server = new Hl7Server((conn) => {
      conn.addEventListener('message', ({ message }) => {
        releaseMessages.push(() => {
          conn.send(message.buildAck());
        });
      });
    });
    await hl7Server.start(57003);

    const app = new App(medplum, agent.id, LogLevel.INFO);
    await app.start();

    // eslint-disable-next-line no-unmodified-loop-condition
    while (!mySocket) {
      await sleep(20);
    }

    const wsClient = mySocket as unknown as Client;

    // Send 3 concurrent messages - only 1 should get a client immediately
    for (let i = 0; i < 3; i++) {
      wsClient.send(
        Buffer.from(
          JSON.stringify({
            type: 'agent:transmit:request',
            body:
              `MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG${i.toString().padStart(5, '0')}|P|2.2\r` +
              'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-',
            remote: 'mllp://localhost:57003',
            contentType: ContentType.HL7_V2,
          } satisfies AgentTransmitRequest)
        )
      );
    }

    // Wait for first message to be received
    while (releaseMessages.length < 1) {
      await sleep(20);
    }

    // Pool should have exactly 1 client (default for keepAlive)
    expect(app.hl7Clients.get('mllp://localhost:57003')?.size()).toStrictEqual(1);

    // Second and third messages should be waiting
    expect(releaseMessages.length).toStrictEqual(3);

    // Release first message
    releaseMessages[0]();

    // Wait for second message
    while (releaseMessages.length < 2) {
      await sleep(20);
    }

    // Should still be 1 client (reused in keepAlive mode)
    expect(app.hl7Clients.get('mllp://localhost:57003')?.size()).toStrictEqual(1);

    // Release second message
    releaseMessages[1]();

    // Wait for third message
    while (releaseMessages.length < 3) {
      await sleep(20);
    }

    // Should still be 1 client
    expect(app.hl7Clients.get('mllp://localhost:57003')?.size()).toStrictEqual(1);

    // Release third message
    releaseMessages[2]();

    await sleep(50);

    // Should still be 1 client
    expect(app.hl7Clients.get('mllp://localhost:57003')?.size()).toStrictEqual(1);

    await app.stop();
    await hl7Server.stop({ forceDrainTimeoutMs: 100 });
  });

  test('Setting maxClientsPerRemote in non-keepAlive mode', async () => {
    let mySocket: Client | undefined = undefined;

    mockServer.on('connection', (socket) => {
      mySocket = socket;
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
      name: 'Test Agent',
      status: 'active',
      channel: [
        {
          name: 'test',
          endpoint: createReference(endpoint),
          targetReference: createReference(bot),
        },
      ],
      setting: [
        { name: 'keepAlive', valueBoolean: false },
        { name: 'maxClientsPerRemote', valueInteger: 3 },
      ],
    });

    const releaseMessages: (() => void)[] = [];
    const hl7Server = new Hl7Server((conn) => {
      conn.addEventListener('message', ({ message }) => {
        releaseMessages.push(() => {
          conn.send(message.buildAck());
        });
      });
    });
    await hl7Server.start(57004);

    const app = new App(medplum, agent.id, LogLevel.INFO);
    await app.start();

    // eslint-disable-next-line no-unmodified-loop-condition
    while (!mySocket) {
      await sleep(20);
    }

    const wsClient = mySocket as unknown as Client;

    // Send 5 concurrent messages - only 3 should get clients immediately
    for (let i = 0; i < 5; i++) {
      wsClient.send(
        Buffer.from(
          JSON.stringify({
            type: 'agent:transmit:request',
            body:
              `MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG${i.toString().padStart(5, '0')}|P|2.2\r` +
              'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-',
            remote: 'mllp://localhost:57004',
            contentType: ContentType.HL7_V2,
          } satisfies AgentTransmitRequest)
        )
      );
    }

    // Wait for first 3 messages to be received
    while (releaseMessages.length < 3) {
      await sleep(20);
    }

    // Pool should have exactly 3 clients (our custom limit)
    expect(app.hl7Clients.get('mllp://localhost:57004')?.size()).toStrictEqual(3);

    await sleep(50);
    expect(releaseMessages.length).toStrictEqual(5);

    // Release first message
    releaseMessages[0]();
    await sleep(50);

    // Should now receive 4th message
    while (releaseMessages.length < 4) {
      await sleep(20);
    }

    // Release remaining messages
    for (let i = 1; i < releaseMessages.length; i++) {
      releaseMessages[i]();
      await sleep(30);
    }

    // All 5 messages should eventually be processed
    expect(releaseMessages.length).toStrictEqual(5);

    // Run GC manually
    // We do it in a loop until all clients are idle and get cleaned up
    while (app.hl7Clients.get('mllp://localhost:57004')?.size()) {
      await sleep(20);
      app.hl7Clients.get('mllp://localhost:57004')?.runClientGc();
    }

    // Pool should have exactly 0 clients after all messages complete
    expect(app.hl7Clients.get('mllp://localhost:57004')?.size()).toStrictEqual(0);

    await app.stop();
    await hl7Server.stop({ forceDrainTimeoutMs: 100 });
  });

  test('Setting maxClientsPerRemote in keepAlive mode', async () => {
    let mySocket: Client | undefined = undefined;

    mockServer.on('connection', (socket) => {
      mySocket = socket;
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
      name: 'Test Agent',
      status: 'active',
      channel: [
        {
          name: 'test',
          endpoint: createReference(endpoint),
          targetReference: createReference(bot),
        },
      ],
      setting: [
        { name: 'keepAlive', valueBoolean: true },
        { name: 'maxClientsPerRemote', valueInteger: 6 },
      ],
    });

    const releaseMessages: (() => void)[] = [];
    const hl7Messages: Hl7Message[] = [];
    const hl7Server = new Hl7Server((conn) => {
      conn.addEventListener('message', ({ message }) => {
        hl7Messages.push(message);
        releaseMessages.push(() => {
          conn.send(message.buildAck());
        });
      });
    });
    await hl7Server.start(57005);

    const app = new App(medplum, agent.id, LogLevel.INFO);
    await app.start();

    // eslint-disable-next-line no-unmodified-loop-condition
    while (!mySocket) {
      await sleep(20);
    }

    const wsClient = mySocket as unknown as Client;

    // Send 8 concurrent messages - only 5 should get clients immediately
    for (let i = 0; i < 9; i++) {
      wsClient.send(
        Buffer.from(
          JSON.stringify({
            type: 'agent:transmit:request',
            body:
              `MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG${i.toString().padStart(5, '0')}|P|2.2\r` +
              'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-',
            remote: 'mllp://localhost:57005',
            contentType: ContentType.HL7_V2,
          } satisfies AgentTransmitRequest)
        )
      );
    }

    // Wait for first 5 messages to be received
    while (releaseMessages.length < 6) {
      await sleep(20);
    }

    // Pool should have exactly 5 clients (our custom limit for keepAlive)
    expect(app.hl7Clients.get('mllp://localhost:57005')?.size()).toStrictEqual(6);

    // Should not have received more than 5 messages yet
    await sleep(50);
    expect(releaseMessages.length).toBeGreaterThanOrEqual(5);

    // Release 3 messages to make clients available
    for (let i = 0; i < 3; i++) {
      releaseMessages[i]();
      await sleep(30);
    }

    // Wait for next 3 messages (6, 7, 8) to be received
    while (releaseMessages.length < 8) {
      await sleep(20);
    }

    // Should still have 5 clients max (reused in keepAlive)
    expect(app.hl7Clients.get('mllp://localhost:57005')?.size()).toStrictEqual(6);

    // All 8 messages should now be processed
    expect(releaseMessages.length).toStrictEqual(9);

    // Release remaining messages
    for (let i = 6; i < releaseMessages.length; i++) {
      releaseMessages[i]();
    }

    await sleep(50);

    // Should still have 5 clients max
    expect(app.hl7Clients.get('mllp://localhost:57005')?.size()).toStrictEqual(6);

    await app.stop();
    await hl7Server.stop({ forceDrainTimeoutMs: 100 });
  });

  test('Updating maxClientsPerRemote without changing keepAlive updates pool limit', async () => {
    const state = {
      reloadConfigResponse: null as AgentReloadConfigResponse | null,
    };

    let mySocket: Client | undefined = undefined;

    mockServer.on('connection', (socket) => {
      mySocket = socket;
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
        } else if (command.type === 'agent:reloadconfig:response') {
          state.reloadConfigResponse = command;
        }
      });
    });

    // Start with keepAlive = true and maxClientsPerRemote = 2
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
      setting: [
        { name: 'keepAlive', valueBoolean: true },
        { name: 'maxClientsPerRemote', valueInteger: 2 },
      ],
    });

    const hl7Messages: Hl7Message[] = [];
    const hl7Server = new Hl7Server((conn) => {
      conn.addEventListener('message', ({ message }) => {
        hl7Messages.push(message);
        conn.send(message.buildAck());
      });
    });
    await hl7Server.start(57006);

    const app = new App(medplum, agent.id, LogLevel.INFO);
    await app.start();

    // eslint-disable-next-line no-unmodified-loop-condition
    while (!mySocket) {
      await sleep(20);
    }

    const wsClient = mySocket as unknown as Client;

    // Send a message to create the pool
    wsClient.send(
      Buffer.from(
        JSON.stringify({
          type: 'agent:transmit:request',
          body:
            'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
            'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-',
          remote: 'mllp://localhost:57006',
          contentType: ContentType.HL7_V2,
        } satisfies AgentTransmitRequest)
      )
    );

    // Wait for message to be received
    while (hl7Messages.length < 1) {
      await sleep(20);
    }

    // Pool should exist with maxClients = 2
    const pool = app.hl7Clients.get('mllp://localhost:57006');
    expect(pool).toBeDefined();
    expect(pool?.getMaxClients()).toStrictEqual(2);

    // Now update config: keepAlive stays true, but increase maxClientsPerRemote to 5
    await medplum.updateResource({
      ...agent,
      setting: [
        { name: 'keepAlive', valueBoolean: true },
        { name: 'maxClientsPerRemote', valueInteger: 5 },
      ],
    });

    wsClient.send(
      Buffer.from(
        JSON.stringify({
          type: 'agent:reloadconfig:request',
          callback: randomUUID(),
        } satisfies AgentReloadConfigRequest)
      )
    );

    while (!state.reloadConfigResponse) {
      await sleep(20);
    }

    // Pool should still exist since keepAlive didn't change
    const poolAfterReload = app.hl7Clients.get('mllp://localhost:57006');
    expect(poolAfterReload).toBeDefined();
    // Verify maxClients was updated to 5
    expect(poolAfterReload?.getMaxClients()).toStrictEqual(5);

    // Now change to maxClientsPerRemote = 3 (keepAlive still true)
    await medplum.updateResource({
      ...agent,
      setting: [
        { name: 'keepAlive', valueBoolean: true },
        { name: 'maxClientsPerRemote', valueInteger: 3 },
      ],
    });

    state.reloadConfigResponse = null;
    wsClient.send(
      Buffer.from(
        JSON.stringify({
          type: 'agent:reloadconfig:request',
          callback: randomUUID(),
        } satisfies AgentReloadConfigRequest)
      )
    );

    while (!state.reloadConfigResponse) {
      await sleep(20);
    }

    // Verify maxClients was updated to 3
    expect(poolAfterReload?.getMaxClients()).toStrictEqual(3);

    await app.stop();
    await hl7Server.stop({ forceDrainTimeoutMs: 100 });
  });

  describe('assignSeqNo functionality', () => {
    test('Messages sent on websocket should have sequence numbers in order', async () => {
      const state = {
        transmitRequests: [] as AgentTransmitRequest[],
      };

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

          if (command.type === 'agent:transmit:request') {
            state.transmitRequests.push(command);
            const hl7Message = Hl7Message.parse(command.body);
            const ackMessage = hl7Message.buildAck();
            socket.send(
              Buffer.from(
                JSON.stringify({
                  type: 'agent:transmit:response',
                  channel: command.channel,
                  callback: command.callback,
                  remote: command.remote,
                  body: ackMessage.toString(),
                })
              )
            );
          }

          if (command.type === 'agent:heartbeat:request') {
            socket.send(
              Buffer.from(
                JSON.stringify({
                  type: 'agent:heartbeat:response',
                  version: MEDPLUM_VERSION,
                } satisfies AgentHeartbeatResponse)
              )
            );
          }
        });
      });

      const endpoint = await medplum.createResource<Endpoint>({
        resourceType: 'Endpoint',
        status: 'active',
        address: 'mllp://0.0.0.0:57100?assignSeqNo=true',
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
      await app.start();

      const client = new Hl7Client({
        host: 'localhost',
        port: 57100,
      });

      // Send multiple messages in sequence
      for (let i = 0; i < 5; i++) {
        await client.sendAndWait(
          Hl7Message.parse(
            `MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG${i.toString().padStart(5, '0')}|P|2.2\r` +
              'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-'
          )
        );
      }

      // Wait for all messages to be processed
      while (state.transmitRequests.length < 5) {
        await sleep(20);
      }

      // Verify sequence numbers are in order (0, 1, 2, 3, 4)
      expect(state.transmitRequests.length).toBe(5);
      for (let i = 0; i < 5; i++) {
        const hl7Message = Hl7Message.parse(state.transmitRequests[i].body);
        const sequenceNo = hl7Message.getSegment('MSH')?.getField(13)?.toString();
        expect(sequenceNo).toBe(i.toString());
      }

      await client.close();
      await app.stop();
    });

    test('When channel is reloaded but name does not change, sequence number remains the same', async () => {
      const state = {
        transmitRequests: [] as AgentTransmitRequest[],
        reloadConfigResponse: null as AgentReloadConfigResponse | null,
        mySocket: undefined as Client | undefined,
      };

      mockServer.on('connection', (socket) => {
        state.mySocket = socket;
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

          if (command.type === 'agent:transmit:request') {
            state.transmitRequests.push(command);
            const hl7Message = Hl7Message.parse(command.body);
            const ackMessage = hl7Message.buildAck();
            socket.send(
              Buffer.from(
                JSON.stringify({
                  type: 'agent:transmit:response',
                  channel: command.channel,
                  callback: command.callback,
                  remote: command.remote,
                  body: ackMessage.toString(),
                })
              )
            );
          }

          if (command.type === 'agent:reloadconfig:response') {
            state.reloadConfigResponse = command;
          }

          if (command.type === 'agent:heartbeat:request') {
            socket.send(
              Buffer.from(
                JSON.stringify({
                  type: 'agent:heartbeat:response',
                  version: MEDPLUM_VERSION,
                } satisfies AgentHeartbeatResponse)
              )
            );
          }
        });
      });

      const endpoint = await medplum.createResource<Endpoint>({
        resourceType: 'Endpoint',
        status: 'active',
        address: 'mllp://0.0.0.0:57101?assignSeqNo=true',
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
      await app.start();

      // Wait for WebSocket to connect
      while (!state.mySocket) {
        await sleep(20);
      }

      const client = new Hl7Client({
        host: 'localhost',
        port: 57101,
      });

      // Send 3 messages before reload
      for (let i = 0; i < 3; i++) {
        await client.sendAndWait(
          Hl7Message.parse(
            `MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG${i.toString().padStart(5, '0')}|P|2.2\r` +
              'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-'
          )
        );
      }

      // Wait for messages to be processed
      while (state.transmitRequests.length < 3) {
        await sleep(20);
      }

      // Verify sequence numbers are 0, 1, 2
      expect(state.transmitRequests.length).toBe(3);
      for (let i = 0; i < 3; i++) {
        const hl7Message = Hl7Message.parse(state.transmitRequests[i].body);
        const sequenceNo = hl7Message.getSegment('MSH')?.getField(13)?.toString();
        expect(sequenceNo).toBe(i.toString());
      }

      // Reload config without changing channel name
      const wsClient = state.mySocket as unknown as Client;
      wsClient.send(
        Buffer.from(
          JSON.stringify({
            type: 'agent:reloadconfig:request',
            callback: randomUUID(),
          } satisfies AgentReloadConfigRequest)
        )
      );

      // Wait for reload to complete
      while (!state.reloadConfigResponse) {
        await sleep(20);
      }

      // Send 2 more messages after reload
      for (let i = 3; i < 5; i++) {
        await client.sendAndWait(
          Hl7Message.parse(
            `MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG${i.toString().padStart(5, '0')}|P|2.2\r` +
              'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-'
          )
        );
      }

      // Wait for all messages to be processed
      while (state.transmitRequests.length < 5) {
        await sleep(20);
      }

      // Verify sequence numbers continue from where they left off (3, 4)
      expect(state.transmitRequests.length).toBe(5);
      for (let i = 0; i < 5; i++) {
        const hl7Message = Hl7Message.parse(state.transmitRequests[i].body);
        const sequenceNo = hl7Message.getSegment('MSH')?.getField(13)?.toString();
        expect(sequenceNo).toBe(i.toString());
      }

      await client.close();
      await app.stop();
    });

    test('When channel name changes, sequence number resets', async () => {
      const state = {
        transmitRequests: [] as AgentTransmitRequest[],
        reloadConfigResponse: null as AgentReloadConfigResponse | null,
        mySocket: undefined as Client | undefined,
      };

      mockServer.on('connection', (socket) => {
        state.mySocket = socket;
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

          if (command.type === 'agent:transmit:request') {
            state.transmitRequests.push(command);
            const hl7Message = Hl7Message.parse(command.body);
            const ackMessage = hl7Message.buildAck();
            socket.send(
              Buffer.from(
                JSON.stringify({
                  type: 'agent:transmit:response',
                  channel: command.channel,
                  callback: command.callback,
                  remote: command.remote,
                  body: ackMessage.toString(),
                })
              )
            );
          }

          if (command.type === 'agent:reloadconfig:response') {
            state.reloadConfigResponse = command;
          }

          if (command.type === 'agent:heartbeat:request') {
            socket.send(
              Buffer.from(
                JSON.stringify({
                  type: 'agent:heartbeat:response',
                  version: MEDPLUM_VERSION,
                } satisfies AgentHeartbeatResponse)
              )
            );
          }
        });
      });

      const endpoint = await medplum.createResource<Endpoint>({
        resourceType: 'Endpoint',
        status: 'active',
        address: 'mllp://0.0.0.0:57102?assignSeqNo=true',
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
      await app.start();

      // Wait for WebSocket to connect
      while (!state.mySocket) {
        await sleep(20);
      }

      const client = new Hl7Client({
        host: 'localhost',
        port: 57102,
      });

      // Send 3 messages before reload
      for (let i = 0; i < 3; i++) {
        await client.sendAndWait(
          Hl7Message.parse(
            `MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG${i.toString().padStart(5, '0')}|P|2.2\r` +
              'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-'
          )
        );
      }

      // Wait for messages to be processed
      while (state.transmitRequests.length < 3) {
        await sleep(20);
      }

      // Verify sequence numbers are 0, 1, 2
      expect(state.transmitRequests.length).toBe(3);
      for (let i = 0; i < 3; i++) {
        const hl7Message = Hl7Message.parse(state.transmitRequests[i].body);
        const sequenceNo = hl7Message.getSegment('MSH')?.getField(13)?.toString();
        expect(sequenceNo).toBe(i.toString());
      }

      // Update agent to change channel name
      await medplum.updateResource({
        ...agent,
        channel: [
          {
            name: 'test-renamed',
            endpoint: createReference(endpoint),
            targetReference: createReference(bot),
          },
        ],
      });

      // Reload config with new channel name
      const wsClient = state.mySocket as unknown as Client;
      wsClient.send(
        Buffer.from(
          JSON.stringify({
            type: 'agent:reloadconfig:request',
            callback: randomUUID(),
          } satisfies AgentReloadConfigRequest)
        )
      );

      // Wait for reload to complete
      while (!state.reloadConfigResponse) {
        await sleep(20);
      }

      // Clear previous requests to track only new ones
      state.transmitRequests = [];

      // Send 2 more messages after reload with new channel name
      for (let i = 0; i < 2; i++) {
        await client.sendAndWait(
          Hl7Message.parse(
            `MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG${i.toString().padStart(5, '0')}|P|2.2\r` +
              'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-'
          )
        );
      }

      // Wait for all messages to be processed
      while (state.transmitRequests.length < 2) {
        await sleep(20);
      }

      // Verify sequence numbers reset to 0, 1 (not 3, 4)
      expect(state.transmitRequests.length).toBe(2);
      for (let i = 0; i < 2; i++) {
        const hl7Message = Hl7Message.parse(state.transmitRequests[i].body);
        const sequenceNo = hl7Message.getSegment('MSH')?.getField(13)?.toString();
        expect(sequenceNo).toBe(i.toString());
      }

      await client.close();
      await app.stop();
    });
  });

  describe('Channel stats tracking', () => {
    test('When logStatsFreqSecs is set, channel should track stats', async () => {
      const state = {
        transmitRequests: [] as AgentTransmitRequest[],
        shouldSendAck: true,
      };

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

          if (command.type === 'agent:transmit:request') {
            state.transmitRequests.push(command);
            // Only send ACK if we're supposed to (for controlled testing)
            if (state.shouldSendAck) {
              const hl7Message = Hl7Message.parse(command.body);
              const ackMessage = hl7Message.buildAck();
              socket.send(
                Buffer.from(
                  JSON.stringify({
                    type: 'agent:transmit:response',
                    channel: command.channel,
                    callback: command.callback,
                    remote: command.remote,
                    contentType: ContentType.HL7_V2,
                    body: ackMessage.toString(),
                  } satisfies AgentTransmitResponse)
                )
              );
            }
          }

          if (command.type === 'agent:heartbeat:request') {
            socket.send(
              Buffer.from(
                JSON.stringify({
                  type: 'agent:heartbeat:response',
                  version: MEDPLUM_VERSION,
                } satisfies AgentHeartbeatResponse)
              )
            );
          }
        });
      });

      const endpoint = await medplum.createResource<Endpoint>({
        resourceType: 'Endpoint',
        status: 'active',
        address: 'mllp://localhost:57090',
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
        setting: [{ name: 'logStatsFreqSecs', valueInteger: 60 }],
      });

      const app = new App(medplum, agent.id, LogLevel.INFO);
      await app.start();

      // Get the channel
      const channel = app.channels.get('test') as AgentHl7Channel;
      expect(channel).toBeDefined();

      // Channel should have stats tracker
      expect(channel.stats).toBeDefined();

      // Initially, should have no pending messages and no samples
      expect(channel.stats?.getPendingCount()).toBe(0);
      expect(channel.stats?.getSampleCount()).toBe(0);

      const client = new Hl7Client({
        host: 'localhost',
        port: 57090,
      });

      // Disable ACKs temporarily so we can check pending state
      state.shouldSendAck = false;

      // Send first message (don't wait for response)
      const sendPromise1 = client.sendAndWait(
        Hl7Message.parse(
          'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
            'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-'
        )
      );

      // Wait for message to be received by channel (forwarded to bot)
      while (state.transmitRequests.length === 0) {
        await sleep(20);
      }

      // At this point: message received, pending bot response
      // pending = 1, samples = 0
      expect(channel.stats?.getPendingCount()).toBe(1);
      expect(channel.stats?.getSampleCount()).toBe(0);

      // Now send the ACK from the bot
      const firstRequest = state.transmitRequests[0];
      const hl7Message1 = Hl7Message.parse(firstRequest.body);
      const ackMessage1 = hl7Message1.buildAck();
      (mockServer as any).clients()[0].send(
        Buffer.from(
          JSON.stringify({
            type: 'agent:transmit:response',
            channel: firstRequest.channel,
            callback: firstRequest.callback,
            remote: firstRequest.remote,
            contentType: ContentType.HL7_V2,
            body: ackMessage1.toString(),
          } satisfies AgentTransmitResponse)
        )
      );

      // Wait for the ACK to be processed
      await sendPromise1;
      await sleep(50); // Give time for stats to update

      // After ACK received: pending = 0, samples = 1
      expect(channel.stats?.getPendingCount()).toBe(0);
      expect(channel.stats?.getSampleCount()).toBe(1);

      // Send second message without waiting for ACK
      const sendPromise2 = client.sendAndWait(
        Hl7Message.parse(
          'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00002|P|2.2\r' +
            'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-'
        )
      );

      // Wait for second message to be received
      while (state.transmitRequests.length < 2) {
        await sleep(20);
      }

      // After second message sent: pending = 1, samples = 1
      expect(channel.stats?.getPendingCount()).toBe(1);
      expect(channel.stats?.getSampleCount()).toBe(1);

      // Send ACK for second message
      const secondRequest = state.transmitRequests[1];
      const hl7Message2 = Hl7Message.parse(secondRequest.body);
      const ackMessage2 = hl7Message2.buildAck();
      (mockServer as any).clients()[0].send(
        Buffer.from(
          JSON.stringify({
            type: 'agent:transmit:response',
            channel: secondRequest.channel,
            callback: secondRequest.callback,
            remote: secondRequest.remote,
            contentType: ContentType.HL7_V2,
            body: ackMessage2.toString(),
          } satisfies AgentTransmitResponse)
        )
      );

      // Wait for second ACK to be processed
      await sendPromise2;
      await sleep(50); // Give time for stats to update

      // After both ACKs received: pending = 0, samples = 2
      expect(channel.stats?.getPendingCount()).toBe(0);
      expect(channel.stats?.getSampleCount()).toBe(2);

      // Verify the correct control IDs were tracked
      const firstMessage = Hl7Message.parse(state.transmitRequests[0].body);
      const secondMessage = Hl7Message.parse(state.transmitRequests[1].body);
      expect(firstMessage.getSegment('MSH')?.getField(10)?.toString()).toBe('MSG00001');
      expect(secondMessage.getSegment('MSH')?.getField(10)?.toString()).toBe('MSG00002');

      await client.close();
      await app.stop();
    });

    test('When logStatsFreqSecs is not set, channel should not track stats', async () => {
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

          if (command.type === 'agent:transmit:request') {
            const hl7Message = Hl7Message.parse(command.body);
            const ackMessage = hl7Message.buildAck();
            socket.send(
              Buffer.from(
                JSON.stringify({
                  type: 'agent:transmit:response',
                  channel: command.channel,
                  callback: command.callback,
                  remote: command.remote,
                  contentType: ContentType.HL7_V2,
                  body: ackMessage.toString(),
                } satisfies AgentTransmitResponse)
              )
            );
          }

          if (command.type === 'agent:heartbeat:request') {
            socket.send(
              Buffer.from(
                JSON.stringify({
                  type: 'agent:heartbeat:response',
                  version: MEDPLUM_VERSION,
                } satisfies AgentHeartbeatResponse)
              )
            );
          }
        });
      });

      const endpoint = await medplum.createResource<Endpoint>({
        resourceType: 'Endpoint',
        status: 'active',
        address: 'mllp://localhost:57091',
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
      await app.start();

      // Get the channel
      const channel = app.channels.get('test');
      expect(channel).toBeDefined();

      // Channel should NOT have stats tracker
      expect((channel as AgentHl7Channel).stats).toBeUndefined();

      await app.stop();
    });

    test('When logStatsFreqSecs is set via reload, channel should start tracking', async () => {
      const state = {
        mySocket: undefined as Client | undefined,
        reloadConfigResponse: null as AgentReloadConfigRequest | null,
      };

      mockServer.on('connection', (socket) => {
        state.mySocket = socket;
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

          if (command.type === 'agent:reloadconfig:response') {
            state.reloadConfigResponse = command;
          }
        });
      });

      const endpoint2 = await medplum.createResource<Endpoint>({
        resourceType: 'Endpoint',
        status: 'active',
        address: 'mllp://localhost:57092',
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
            endpoint: createReference(endpoint2),
            targetReference: createReference(bot),
          },
        ],
      });

      const app = new App(medplum, agent.id, LogLevel.INFO);
      await app.start();

      // Wait for WebSocket to connect
      while (!state.mySocket) {
        await sleep(100);
      }

      // Get the channel
      let channel = app.channels.get('test');
      expect(channel).toBeDefined();

      // Channel should NOT have stats tracker initially
      expect((channel as AgentHl7Channel).stats).toBeUndefined();

      // Update agent to enable logStatsFreqSecs
      await medplum.updateResource<Agent>({
        ...agent,
        setting: [{ name: 'logStatsFreqSecs', valueInteger: 60 }],
      });

      // Send reload config request
      const wsClient = state.mySocket as unknown as Client;
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

      // Get the channel again
      channel = app.channels.get('test');
      expect(channel).toBeDefined();

      // Channel should now have stats tracker
      expect((channel as AgentHl7Channel).stats).toBeDefined();

      await app.stop();
    });

    test('When logStatsFreqSecs is removed via reload, channel should stop tracking', async () => {
      const state = {
        mySocket: undefined as Client | undefined,
        reloadConfigResponse: null as AgentReloadConfigRequest | null,
      };

      mockServer.on('connection', (socket) => {
        state.mySocket = socket;
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

          if (command.type === 'agent:reloadconfig:response') {
            state.reloadConfigResponse = command;
          }
        });
      });

      const endpoint3 = await medplum.createResource<Endpoint>({
        resourceType: 'Endpoint',
        status: 'active',
        address: 'mllp://localhost:57093',
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
            endpoint: createReference(endpoint3),
            targetReference: createReference(bot),
          },
        ],
        setting: [{ name: 'logStatsFreqSecs', valueInteger: 60 }],
      });

      const app = new App(medplum, agent.id, LogLevel.INFO);
      await app.start();

      // Wait for WebSocket to connect
      while (!state.mySocket) {
        await sleep(100);
      }

      // Get the channel
      let channel = app.channels.get('test');
      expect(channel).toBeDefined();

      // Channel should have stats tracker initially
      expect((channel as AgentHl7Channel).stats).toBeDefined();

      // Update agent to disable logStatsFreqSecs
      await medplum.updateResource<Agent>({
        ...agent,
        setting: [],
      });

      // Send reload config request
      const wsClient = state.mySocket as unknown as Client;
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

      // Get the channel again
      channel = app.channels.get('test');
      expect(channel).toBeDefined();

      // Channel should NO LONGER have stats tracker
      expect((channel as AgentHl7Channel).stats).toBeUndefined();

      await app.stop();
    });
  });
});

describe('AgentHl7Channel application-level ACK gating', () => {
  const BASE_MESSAGE = Hl7Message.parse(
    'MSH|^~\\&|SND|FAC|RCV|FAC|202501011200||ADT^A01|MSG00001|P|2.5\rPID|1||123456||Doe^John\r'
  );
  const REMOTE_ID = 'test-remote';

  function createTestChannel(address: string): AgentHl7Channel {
    const mockApp = {
      log: createMockLogger(),
      channelLog: createMockLogger(),
      heartbeatEmitter: {
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      },
      getAgentConfig: jest.fn(),
    } as unknown as App;

    const definition = { name: 'test-channel' } as AgentChannel;
    const endpoint = {
      resourceType: 'Endpoint',
      status: 'active',
      address,
    } as Endpoint;

    const channel = new AgentHl7Channel(mockApp, definition, endpoint);
    (channel as unknown as { configureHl7ServerAndConnections(): void }).configureHl7ServerAndConnections();
    return channel;
  }

  function attachMockConnection(channel: AgentHl7Channel): jest.Mock {
    const sendMock = jest.fn();
    const hl7Connection = {
      setEncoding: jest.fn(),
      setEnhancedMode: jest.fn(),
      setMessagesPerMin: jest.fn(),
      send: sendMock,
    };
    const connection = {
      hl7Connection,
      remote: REMOTE_ID,
    } as unknown as AgentHl7ChannelConnection;
    channel.connections.set(REMOTE_ID, connection);
    return sendMock;
  }

  function createTransmitResponse(ackCode: AckCode): AgentTransmitResponse {
    return {
      type: 'agent:transmit:response',
      remote: REMOTE_ID,
      contentType: ContentType.HL7_V2,
      body: BASE_MESSAGE.buildAck({ ackCode }).toString(),
    };
  }

  test('NE with enhanced mode drops application ACKs', () => {
    const channel = createTestChannel('mllp://localhost:57100?enhanced=true&appLevelAck=NE');
    const sendMock = attachMockConnection(channel);

    channel.sendToRemote(createTransmitResponse('AA'));

    expect(sendMock).not.toHaveBeenCalled();
  });

  test('NE with original mode still forwards ACKs', () => {
    const channel = createTestChannel('mllp://localhost:57101?enhanced=false&appLevelAck=NE');
    const sendMock = attachMockConnection(channel);

    channel.sendToRemote(createTransmitResponse('AA'));

    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  test('aaMode drops all application ACKs (AA)', () => {
    const channel = createTestChannel('mllp://localhost:57104?enhanced=aa');
    const sendMock = attachMockConnection(channel);

    channel.sendToRemote(createTransmitResponse('AA'));
    expect(sendMock).not.toHaveBeenCalled();
  });

  test('aaMode drops all application ACKs (AE)', () => {
    const channel = createTestChannel('mllp://localhost:57105?enhanced=aa');
    const sendMock = attachMockConnection(channel);

    channel.sendToRemote(createTransmitResponse('AE'));
    expect(sendMock).not.toHaveBeenCalled();
  });

  test('aaMode drops all application ACKs (AR)', () => {
    const channel = createTestChannel('mllp://localhost:57106?enhanced=aa');
    const sendMock = attachMockConnection(channel);

    channel.sendToRemote(createTransmitResponse('AR'));
    expect(sendMock).not.toHaveBeenCalled();
  });

  test('ER with enhanced mode drops AA acknowledgements', () => {
    const channel = createTestChannel('mllp://localhost:57102?enhanced=true&appLevelAck=ER');
    const sendMock = attachMockConnection(channel);

    channel.sendToRemote(createTransmitResponse('AA'));

    expect(sendMock).not.toHaveBeenCalled();
  });

  test('ER with enhanced mode forwards AE and AR acknowledgements', () => {
    const channel = createTestChannel('mllp://localhost:57103?enhanced=true&appLevelAck=ER');
    const sendMock = attachMockConnection(channel);

    channel.sendToRemote(createTransmitResponse('AE'));
    channel.sendToRemote(createTransmitResponse('AR'));

    expect(sendMock).toHaveBeenCalledTimes(2);
  });
});

describe('parseAppLevelAckMode', () => {
  test.each(['AL', 'ER', 'SU', 'NE', 'aL', 'Er', 'ne', 'su'] as const)(
    'parses valid app-level ACK mode (MSH-16) values -- %s',
    (ackMode) => {
      const logger = createMockLogger();
      expect(APP_LEVEL_ACK_MODES).toContain(parseAppLevelAckMode(ackMode, logger));
      expect(logger.warn).not.toHaveBeenCalled();
    }
  );

  test('should return AL when an invalid value is passed in', () => {
    const logger = createMockLogger();
    expect(parseAppLevelAckMode('CA', logger)).toStrictEqual('AL');
    expect(logger.warn).toHaveBeenCalledWith(
      `Invalid appLevelAck value 'CA'; expected one of ${APP_LEVEL_ACK_MODES.join(', ')}. Using AL.`
    );
  });

  test('should return AL when undefined passed in', () => {
    const logger = createMockLogger();
    expect(parseAppLevelAckMode(undefined, logger)).toStrictEqual('AL');
    expect(logger.warn).not.toHaveBeenCalled();
  });
});

describe('parseEnhancedMode', () => {
  test('parses "true" to "standard"', () => {
    const logger = createMockLogger();
    expect(parseEnhancedMode('true', logger)).toBe('standard');
  });

  test('parses "TRUE" to "standard" (case insensitive)', () => {
    const logger = createMockLogger();
    expect(parseEnhancedMode('TRUE', logger)).toBe('standard');
  });

  test('parses "aa" to "aaMode"', () => {
    const logger = createMockLogger();
    expect(parseEnhancedMode('aa', logger)).toBe('aaMode');
  });

  test('parses "AA" to "aaMode" (case insensitive)', () => {
    const logger = createMockLogger();
    expect(parseEnhancedMode('AA', logger)).toBe('aaMode');
  });

  test('returns undefined when null is passed', () => {
    const logger = createMockLogger();
    expect(parseEnhancedMode(null, logger)).toBeUndefined();
  });

  test('returns undefined when undefined is passed', () => {
    const logger = createMockLogger();
    expect(parseEnhancedMode(undefined, logger)).toBeUndefined();
  });

  test('returns undefined and logs warning when invalid value is passed', () => {
    const logger = createMockLogger();
    expect(parseEnhancedMode('invalid', logger)).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      "Invalid enhanced value 'invalid'; expected 'true' or 'aa'. Using standard mode (enhanced mode disabled)."
    );
  });
});

describe('shouldSendAppLevelAck', () => {
  test.each(APP_LEVEL_ACK_CODES)('non enhanced mode always returns true', (ackCode) => {
    expect(
      shouldSendAppLevelAck({
        mode: 'NE',
        ackCode,
        enhancedMode: undefined,
      })
    ).toBe(true);
  });

  test.each(APP_LEVEL_ACK_CODES)('always mode forwards everything', (ackCode) => {
    expect(
      shouldSendAppLevelAck({
        mode: 'AL',
        ackCode,
        enhancedMode: 'standard',
      })
    ).toBe(true);
  });

  test.each(APP_LEVEL_ACK_CODES)('never mode blocks all ACKs', (ackCode) => {
    expect(
      shouldSendAppLevelAck({
        mode: 'NE',
        ackCode,
        enhancedMode: 'standard',
      })
    ).toBe(false);
  });

  test.each([
    { ackCode: 'AA', result: false },
    { ackCode: 'AE', result: true },
    { ackCode: 'AR', result: true },
  ] as const)('error mode only forwards AE/AR', ({ ackCode, result }) => {
    expect(
      shouldSendAppLevelAck({
        mode: 'ER',
        ackCode,
        enhancedMode: 'standard',
      })
    ).toBe(result);
  });

  test.each([
    { ackCode: 'AA', result: true },
    { ackCode: 'AE', result: false },
    { ackCode: 'AR', result: false },
  ] as const)('success mode only forwards AA', ({ ackCode, result }) => {
    expect(
      shouldSendAppLevelAck({
        mode: 'SU',
        ackCode,
        enhancedMode: 'standard',
      })
    ).toBe(result);
  });

  test('throws when invalid app-level ACK mode value is present', () => {
    expect(() =>
      shouldSendAppLevelAck({
        // This is an invalid mode
        mode: 'CA' as AppLevelAckMode,
        ackCode: 'AA',
        enhancedMode: 'standard',
      })
    ).toThrow('Invalid app-level ACK mode provided');
  });

  test.each(APP_LEVEL_ACK_CODES)('aaMode never forwards application-level ACKs', (ackCode) => {
    expect(
      shouldSendAppLevelAck({
        mode: 'AL',
        ackCode,
        enhancedMode: 'aaMode',
      })
    ).toBe(false);
  });
});
