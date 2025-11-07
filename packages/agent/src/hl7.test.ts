// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type {
  AgentReloadConfigRequest,
  AgentReloadConfigResponse,
  AgentTransmitRequest,
  AgentTransmitResponse,
} from '@medplum/core';
import { allOk, ContentType, createReference, Hl7Message, LogLevel, sleep } from '@medplum/core';
import type { Agent, Bot, Endpoint, Resource } from '@medplum/fhirtypes';
import { Hl7Client, Hl7Server, ReturnAckCategory } from '@medplum/hl7';
import { MockClient } from '@medplum/mock';
import { randomUUID } from 'crypto';
import type { Client } from 'mock-socket';
import { Server } from 'mock-socket';
import { App } from './app';
import type { AgentHl7Channel } from './hl7';

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

  test('Send and receive', async () => {
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
    mockServer.stop();
  });

  test('Send and receive -- error', async () => {
    const originalConsoleLog = console.log;
    console.log = jest.fn();

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
    mockServer.stop();
    console.log = originalConsoleLog;
  });

  test('Send and receive -- no callback in response', async () => {
    const originalConsoleLog = console.log;
    console.log = jest.fn();

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
    mockServer.stop();
    console.log = originalConsoleLog;
  });

  test('Send and receive -- enhanced mode', async () => {
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
      });
    });

    const enhancedEndpoint = await medplum.createResource<Endpoint>({
      ...endpoint,
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
    mockServer.stop();
  });

  test('Send and receive -- enhanced mode + messagesPerMin', async () => {
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
      });
    });

    const enhancedEndpoint = await medplum.createResource<Endpoint>({
      ...endpoint,
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
    mockServer.stop();
  });

  test('Invalid messagesPerMin logs warning', async () => {
    const originalConsoleLog = console.log;
    console.log = jest.fn();
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

    const enhancedEndpoint = await medplum.createResource<Endpoint>({
      ...endpoint,
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
    mockServer.stop();
    console.log = originalConsoleLog;
  });

  test('Push', async () => {
    const mockServer = new Server('wss://example.com/ws/agent');
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
    mockServer.stop();
  });

  test('Push -- keepAlive Enabled', async () => {
    const state = {
      reloadConfigResponse: null as AgentReloadConfigResponse | null,
    };

    const mockServer = new Server('wss://example.com/ws/agent');
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

    // Make sure we are not keeping clients around yet
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
    while (hl7Messages.length < 2) {
      await sleep(20);
    }

    expect(hl7Messages.length).toBe(2);
    expect(app.hl7Clients.size).toStrictEqual(0);

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
    expect(app.hl7Clients.size).toStrictEqual(1);

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
    expect(app.hl7Clients.size).toStrictEqual(1);

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
    while (hl7Messages.length < 6) {
      await sleep(20);
    }

    expect(hl7Messages.length).toBe(6);
    expect(app.hl7Clients.size).toStrictEqual(0);

    // Shutdown everything
    await hl7Server.stop();
    await app.stop();
    mockServer.stop();

    // Make sure all clients are closed after stopping app
    expect(app.hl7Clients.size).toStrictEqual(0);
  });

  test('keepAlive: Remote closes connection', async () => {
    const originalConsoleLog = console.log;
    console.log = jest.fn();

    const state = {
      reloadConfigResponse: null as AgentReloadConfigResponse | null,
    };

    const mockServer = new Server('wss://example.com/ws/agent');
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
    expect(app.hl7Clients.size).toStrictEqual(1);

    // After stopping the server (and therefore closing the connection),
    // We should no longer have an open client to the given server
    await hl7Server.stop();
    while (app.hl7Clients.size !== 0) {
      await sleep(20);
    }
    expect(app.hl7Clients.size).toStrictEqual(0);

    await app.stop();
    mockServer.stop();

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

    const mockServer = new Server('wss://example.com/ws/agent');
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
    expect(app.hl7Clients.size).toStrictEqual(1);

    // An error happened
    const hl7Client = app.hl7Clients.get('mllp://localhost:57001');
    expect(hl7Client).toBeDefined();
    expect(hl7Client?.connection).toBeDefined();
    expect(hl7Client?.connection?.socket).toBeDefined();

    hl7Client?.connection?.socket.emit('error', new Error('Something bad happened'));

    // We should no longer have an open client to the given server
    // Since an error has occurred
    while (app.hl7Clients.size !== 0) {
      await sleep(20);
    }
    expect(app.hl7Clients.size).toStrictEqual(0);

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
    expect(app.hl7Clients.size).toStrictEqual(1);

    await hl7Server.stop();
    await app.stop();
    mockServer.stop();

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining(
        `Persistent connection to remote 'mllp://localhost:57001' encountered error: 'Something bad happened' - Closing connection...`
      )
    );

    console.log = originalConsoleLog;
  });

  describe('Channel stats tracking', () => {
    test('When logStatsFreqSecs is set, channel should track stats', async () => {
      const mockServer = new Server('wss://example.com/ws/agent');
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
      mockServer.stop();
    });

    test('When logStatsFreqSecs is not set, channel should not track stats', async () => {
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
      mockServer.stop();
    });

    test('When logStatsFreqSecs is set via reload, channel should start tracking', async () => {
      const mockServer = new Server('wss://example.com/ws/agent');
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
      mockServer.stop();
    });

    test('When logStatsFreqSecs is removed via reload, channel should stop tracking', async () => {
      const mockServer = new Server('wss://example.com/ws/agent');
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
      mockServer.stop();
    });
  });
});
