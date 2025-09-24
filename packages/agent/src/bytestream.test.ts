// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { AgentTransmitResponse, allOk, ContentType, createReference, LogLevel, sleep } from '@medplum/core';
import { Agent, Bot, Endpoint, Resource } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { Server } from 'mock-socket';
import net from 'node:net';
import { App } from './app';

const medplum = new MockClient();
let bot: Bot;
let endpoint: Endpoint;

describe('Byte Stream', () => {
  beforeAll(async () => {
    console.log = jest.fn();

    medplum.router.router.add('POST', ':resourceType/:id/$execute', async () => {
      return [allOk, {} as Resource];
    });

    bot = await medplum.createResource<Bot>({ resourceType: 'Bot' });

    endpoint = await medplum.createResource<Endpoint>({
      resourceType: 'Endpoint',
      status: 'active',
      address: 'tcp://0.0.0.0:58000?startChar=%02&endChar=%03',
      connectionType: { code: ContentType.OCTET_STREAM },
      payloadType: [{ coding: [{ code: ContentType.OCTET_STREAM }] }],
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
          // Echo back the received data
          socket.send(
            Buffer.from(
              JSON.stringify({
                type: 'agent:transmit:response',
                channel: command.channel,
                callback: command.callback,
                remote: command.remote,
                body: command.body,
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

    // Create a TCP client to send data
    let client!: net.Socket;
    const testData = Buffer.from([0x02, 0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x03]); // STX + "Hello" + ETX

    await new Promise<void>((resolve, reject) => {
      client = net.createConnection({ port: 58000 }, () => {
        client.write(testData);
      });

      client.on('data', (data) => {
        expect(data).toEqual(testData);
        client.end();
        resolve();
      });

      client.on('error', reject);
    });

    client.destroy();
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

    const client = new net.Socket();
    const testData = Buffer.from([0x02, 0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x03]);

    await new Promise<void>((resolve, reject) => {
      client.connect(58000, 'localhost', () => {
        client.write(testData);
        resolve();
      });

      client.on('error', reject);
    });

    await sleep(150);
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Error during handling transmit request: Something bad happened')
    );

    client.destroy();
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
          socket.send(
            Buffer.from(
              JSON.stringify({
                type: 'agent:transmit:response',
                channel: command.channel,
                remote: command.remote,
                contentType: ContentType.OCTET_STREAM,
                statusCode: 200,
                body: command.body,
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

    const client = new net.Socket();
    const testData = Buffer.from([0x02, 0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x03]);

    await new Promise<void>((resolve, reject) => {
      client.connect(58000, 'localhost', () => {
        client.write(testData);
        resolve();
      });

      client.on('error', reject);
    });

    await sleep(150);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Transmit response missing callback'));

    client.destroy();
    await app.stop();
    mockServer.stop();
    console.log = originalConsoleLog;
  });

  test('Multiple messages in single data chunk', async () => {
    const mockServer = new Server('wss://example.com/ws/agent');
    const receivedMessages: string[] = [];

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
          receivedMessages.push(command.body);
          socket.send(
            Buffer.from(
              JSON.stringify({
                type: 'agent:transmit:response',
                channel: command.channel,
                callback: command.callback,
                remote: command.remote,
                body: command.body,
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

    const client = new net.Socket();
    // Send multiple messages in one chunk
    const testData = Buffer.concat([
      Buffer.from([0x02, 0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x03]), // "Hello"
      Buffer.from([0x02, 0x57, 0x6f, 0x72, 0x6c, 0x64, 0x03]), // "World"
    ]);

    await new Promise<void>((resolve, reject) => {
      client.connect(58000, 'localhost', () => {
        client.write(testData);
        resolve();
      });

      client.on('error', reject);
    });

    await sleep(150);
    expect(receivedMessages).toHaveLength(2);
    expect(receivedMessages[0]).toBe('0248656c6c6f03'); // "Hello" in hex
    expect(receivedMessages[1]).toBe('02576f726c6403'); // "World" in hex

    client.destroy();
    await app.stop();
    mockServer.stop();
  });

  test('Partial message handling', async () => {
    const mockServer = new Server('wss://example.com/ws/agent');
    const receivedMessages: string[] = [];

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
          receivedMessages.push(command.body);
          socket.send(
            Buffer.from(
              JSON.stringify({
                type: 'agent:transmit:response',
                channel: command.channel,
                callback: command.callback,
                remote: command.remote,
                body: command.body,
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

    const client = new net.Socket();

    // Send partial message first
    const partialData = Buffer.from([0x02, 0x48, 0x65]); // STX + "He"
    client.connect(58000, 'localhost', () => {
      client.write(partialData);
    });

    let error: Error | undefined;
    client.on('error', (err) => {
      error = err;
    });

    await sleep(50);

    // Complete the message
    const completeData = Buffer.from([0x6c, 0x6c, 0x6f, 0x03]); // "llo" + ETX
    client.write(completeData);

    await sleep(150);

    if (error) {
      throw error;
    }

    expect(receivedMessages).toHaveLength(1);
    expect(receivedMessages[0]).toBe('0248656c6c6f03'); // "Hello" in hex

    client.destroy();
    await app.stop();
    mockServer.stop();
  });

  test('Invalid startChar/endChar parameters', async () => {
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

    // Create endpoint with missing startChar parameter
    const invalidEndpoint = await medplum.createResource<Endpoint>({
      resourceType: 'Endpoint',
      status: 'active',
      address: 'tcp://0.0.0.0:58020?startChar=%02', // Missing endChar
      connectionType: { code: ContentType.JSON },
      payloadType: [{ coding: [{ code: ContentType.JSON }] }],
    });

    const agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      name: 'Test Agent',
      status: 'active',
      channel: [
        {
          name: 'test',
          endpoint: createReference(invalidEndpoint),
          targetReference: createReference(bot),
        },
      ],
    });

    const app = new App(medplum, agent.id, LogLevel.INFO);

    // This should throw an error during startup
    await expect(app.start()).rejects.toThrow('Failed to parse startChar and/or endChar query param(s)');

    mockServer.stop();
    await app.stop();
    console.log = originalConsoleLog;
  });
});
