import {
  AgentReloadConfigResponse,
  AgentTransmitResponse,
  allOk,
  ContentType,
  createReference,
  Hl7Message,
  LogLevel,
  sleep,
} from '@medplum/core';
import { Agent, Bot, Endpoint, Resource } from '@medplum/fhirtypes';
import { Hl7Client, Hl7Server } from '@medplum/hl7';
import { MockClient } from '@medplum/mock';
import { Client, Server } from 'mock-socket';
import { App } from './app';

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

    const app = new App(medplum, agent.id as string, LogLevel.INFO);
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

    client.close();
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

    const app = new App(medplum, agent.id as string, LogLevel.INFO);
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

    client.close();
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

    const app = new App(medplum, agent.id as string, LogLevel.INFO);
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

    client.close();
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
    hl7Server.start(57001);

    // Wait for server to start listening
    while (!hl7Server.server?.listening) {
      await sleep(20);
    }

    // Start the app
    const app = new App(medplum, agent.id as string, LogLevel.INFO);
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
    hl7Server.start(57001);

    // Wait for server to start listening
    while (!hl7Server.server?.listening) {
      await sleep(20);
    }

    // Start the app
    const app = new App(medplum, agent.id as string, LogLevel.INFO);
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

    // Make sure we are not keeping clients around yet
    expect(app.hl7Clients.size).toEqual(0);

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
    while (hl7Messages.length < 2) {
      await sleep(20);
    }

    expect(hl7Messages.length).toBe(2);
    expect(app.hl7Clients.size).toEqual(0);

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
          body:
            'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
            'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-\r' +
            'NK1|1|JONES^BARBARA^K|SPO|||||20011105\r' +
            'PV1|1|I|2000^2012^01||||004777^LEBAUER^SIDNEY^J.|||SUR||-||1|A0-',
          remote: 'mllp://localhost:57001',
        })
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
        })
      )
    );

    // Wait for the HL7 message to be received
    while (hl7Messages.length < 3) {
      await sleep(20);
    }

    expect(hl7Messages.length).toBe(3);
    expect(app.hl7Clients.size).toEqual(1);

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
    while (hl7Messages.length < 4) {
      await sleep(20);
    }

    expect(hl7Messages.length).toBe(4);
    expect(app.hl7Clients.size).toEqual(1);

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
          body:
            'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
            'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-\r' +
            'NK1|1|JONES^BARBARA^K|SPO|||||20011105\r' +
            'PV1|1|I|2000^2012^01||||004777^LEBAUER^SIDNEY^J.|||SUR||-||1|A0-',
          remote: 'mllp://localhost:57001',
        })
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
        })
      )
    );

    // Wait for the HL7 message to be received
    while (hl7Messages.length < 5) {
      await sleep(20);
    }

    expect(hl7Messages.length).toBe(5);
    expect(app.hl7Clients.size).toEqual(0);

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
    while (hl7Messages.length < 6) {
      await sleep(20);
    }

    expect(hl7Messages.length).toBe(6);
    expect(app.hl7Clients.size).toEqual(0);

    // Shutdown everything
    await hl7Server.stop();
    await app.stop();
    mockServer.stop();

    // Make sure all clients are closed after stopping app
    expect(app.hl7Clients.size).toEqual(0);
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
    hl7Server.start(57001);

    // Wait for server to start listening
    while (!hl7Server.server?.listening) {
      await sleep(20);
    }

    // Start the app
    const app = new App(medplum, agent.id as string, LogLevel.INFO);
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
    expect(app.hl7Clients.size).toEqual(1);

    // After stopping the server (and therefore closing the connection),
    // We should no longer have an open client to the given server
    await hl7Server.stop();
    while (app.hl7Clients.size !== 0) {
      await sleep(20);
    }
    expect(app.hl7Clients.size).toEqual(0);

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
    hl7Server.start(57001);

    // Wait for server to start listening
    while (!hl7Server.server?.listening) {
      await sleep(20);
    }

    // Start the app
    const app = new App(medplum, agent.id as string, LogLevel.INFO);
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
    expect(app.hl7Clients.size).toEqual(1);

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
    expect(app.hl7Clients.size).toEqual(0);

    // Set the socket to timeout on inactivity since we are not going to manually close the connection
    mode = 'TIMEOUT';

    // Next request to server should make a new client
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
    while (hl7Messages.length < 2) {
      await sleep(20);
    }

    expect(hl7Messages.length).toBe(2);
    expect(app.hl7Clients.size).toEqual(1);

    await hl7Server.stop();
    await app.stop();
    mockServer.stop();

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining(
        `Persistent connection to remote 'mllp://localhost:57001' encountered an error... Closing connection...`
      )
    );

    console.log = originalConsoleLog;
  });
});
