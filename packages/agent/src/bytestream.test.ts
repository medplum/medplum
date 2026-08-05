// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { AgentTransmitResponse } from '@medplum/core';
import { allOk, ContentType, createReference, LogLevel, sleep } from '@medplum/core';
import type { Agent, Bot, Endpoint, Resource } from '@medplum/fhirtypes';
import { getFreePort } from '@medplum/hl7';
import { MockClient } from '@medplum/mock';
import { Server } from 'mock-socket';
import net from 'node:net';
import { App } from './app';
import {
  ByteSequenceMatcher,
  filterMessageBytes,
  parseAutoRespondRules,
  parseBodyEncoding,
  parseByteSequences,
  parseKeepControlChars,
} from './bytestream';
import { createEndpointWithRandomPort, createMockLogger, waitFor } from './test-utils';

const medplum = new MockClient();
let bot: Bot;
let endpoint: Endpoint;
let port: number;

// ASTM E1394 low-level control bytes.
const STX = 0x02;
const ETX = 0x03;
const EOT = 0x04;
const ENQ = 0x05;
const ACK = 0x06;
const CR = 0x0d;
const LF = 0x0a;
const ETB = 0x17;

describe('Byte Stream', () => {
  beforeAll(async () => {
    console.log = vi.fn();

    medplum.router.router.add('POST', ':resourceType/:id/$execute', async () => {
      return [allOk, {} as Resource];
    });

    bot = await medplum.createResource<Bot>({ resourceType: 'Bot' });

    port = await getFreePort();
    endpoint = await medplum.createResource<Endpoint>({
      resourceType: 'Endpoint',
      status: 'active',
      address: `tcp://0.0.0.0:${port}?startChar=%02&endChar=%03`,
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
      client = net.createConnection({ port }, () => {
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
    console.log = vi.fn();

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
      client.connect(port, 'localhost', () => {
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
    console.log = vi.fn();

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
      client.connect(port, 'localhost', () => {
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
      client.connect(port, 'localhost', () => {
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
    client.connect(port, 'localhost', () => {
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
    console.log = vi.fn();

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
    const invalidPort = await getFreePort();
    const invalidEndpoint = await medplum.createResource<Endpoint>({
      resourceType: 'Endpoint',
      status: 'active',
      address: `tcp://0.0.0.0:${invalidPort}?startChar=%02`, // Missing endChar
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

  describe('Byte sequences', () => {
    test('autoRespond replies as soon as its pattern completes', async () => {
      const bodies: string[] = [];
      const mockServer = startMockAgentServer(bodies);
      const [agentId, agentPort] = await createByteStreamAgent('&autoRespond=%05:%06');

      const app = new App(medplum, agentId, LogLevel.INFO);
      await app.start();

      const [client, received] = await connectCollecting(agentPort);
      client.write(Buffer.from([0x05]));

      await waitFor(() => received.length > 0, 1000, 'auto-response');
      expect(Buffer.concat(received)).toEqual(Buffer.from([0x06]));

      // The handshake is a side channel: a framed message still arrives intact after it.
      client.write(Buffer.from([0x02, 0x48, 0x69, 0x03]));
      await waitFor(() => bodies.length > 0, 1000, 'transmit request');
      expect(bodies[0]).toBe('02486903');

      client.destroy();
      await app.stop();
      mockServer.stop();
    });

    test('Multi-byte pattern completes across separate chunks', async () => {
      const bodies: string[] = [];
      const mockServer = startMockAgentServer(bodies);
      const [agentId, agentPort] = await createByteStreamAgent('&autoRespond=%05%15:%06');

      const app = new App(medplum, agentId, LogLevel.INFO);
      await app.start();

      const [client, received] = await connectCollecting(agentPort);
      client.write(Buffer.from([0x05]));
      await sleep(50);
      expect(received).toHaveLength(0);

      client.write(Buffer.from([0x15]));
      await waitFor(() => received.length > 0, 1000, 'auto-response');
      expect(Buffer.concat(received)).toEqual(Buffer.from([0x06]));

      client.destroy();
      await app.stop();
      mockServer.stop();
    });

    test('Comma-separated rules all take effect', async () => {
      const bodies: string[] = [];
      const mockServer = startMockAgentServer(bodies);
      const [agentId, agentPort] = await createByteStreamAgent('&autoRespond=%05:%06,%15:%04');

      const app = new App(medplum, agentId, LogLevel.INFO);
      await app.start();

      const [client, received] = await connectCollecting(agentPort);
      client.write(Buffer.from([0x05]));
      await waitFor(() => received.length > 0, 1000, 'first auto-response');

      client.write(Buffer.from([0x15]));
      await waitFor(() => received.length > 1, 1000, 'second auto-response');
      expect(Buffer.concat(received)).toEqual(Buffer.from([0x06, 0x04]));

      client.destroy();
      await app.stop();
      mockServer.stop();
    });

    test('Concurrent connections match independently', async () => {
      const bodies: string[] = [];
      const mockServer = startMockAgentServer(bodies);
      const [agentId, agentPort] = await createByteStreamAgent('&autoRespond=%05%15:%06');

      const app = new App(medplum, agentId, LogLevel.INFO);
      await app.start();

      const [clientA, receivedA] = await connectCollecting(agentPort);
      const [clientB, receivedB] = await connectCollecting(agentPort);

      // Split the pattern across the two sockets. A shared match window would splice these
      // into %05%15 and wrongly answer B.
      clientA.write(Buffer.from([0x05]));
      await sleep(50);
      clientB.write(Buffer.from([0x15]));
      await sleep(100);

      expect(receivedA).toHaveLength(0);
      expect(receivedB).toHaveLength(0);

      // A's own window still holds its %05, so A completing the pattern answers A alone.
      clientA.write(Buffer.from([0x15]));
      await waitFor(() => receivedA.length > 0, 1000, "connection A's auto-response");
      expect(Buffer.concat(receivedA)).toEqual(Buffer.from([0x06]));
      expect(receivedB).toHaveLength(0);

      clientA.destroy();
      clientB.destroy();
      await app.stop();
      mockServer.stop();
    });

    test('stripSequence and stripControlChars clean the transmitted body', async () => {
      const bodies: string[] = [];
      const mockServer = startMockAgentServer(bodies);
      const [agentId, agentPort] = await createByteStreamAgent(
        '&autoRespond=%05:%06&stripSequence=%15&stripControlChars=true&bodyEncoding=utf-8'
      );

      const app = new App(medplum, agentId, LogLevel.INFO);
      await app.start();

      const [client, received] = await connectCollecting(agentPort);
      // ENQ, then STX H e l NAK l o ETX
      client.write(Buffer.from([0x05, 0x02, 0x48, 0x65, 0x6c, 0x15, 0x6c, 0x6f, 0x03]));

      await waitFor(() => received.length > 0, 1000, 'auto-response');
      expect(Buffer.concat(received)).toEqual(Buffer.from([0x06]));

      await waitFor(() => bodies.length > 0, 1000, 'transmit request');
      expect(bodies[0]).toBe('Hello');

      client.destroy();
      await app.stop();
      mockServer.stop();
    });

    test('ASTM E1394 session: every ACK is returned and only framing is stripped', async () => {
      const bodies: string[] = [];
      const mockServer = startMockAgentServer(bodies);

      // The BioRad ASTM channel, expressed in address params. ENQ frames the session start and
      // EOT its end; ENQ/ETX/EOT/LF each earn an ACK; CR and LF survive the control-char sweep
      // because they terminate ASTM records and frames.
      const [agentId, agentPort] = await createByteStreamAgent(
        '&autoRespond=%05:%06,%03:%06,%04:%06,%0A:%06&stripControlChars=true&keepControlChars=%0D%0A&bodyEncoding=utf-8',
        { startChar: '%05', endChar: '%04' }
      );

      const app = new App(medplum, agentId, LogLevel.INFO);
      await app.start();

      const [client, received] = await connectCollecting(agentPort);
      const ackCount = (): number => Buffer.concat(received).length;

      // A real analyzer waits for each ACK before sending the next frame, so drive it that way.
      client.write(Buffer.from([ENQ]));
      await waitFor(() => ackCount() === 1, 1000, 'ACK for ENQ');

      // Intermediate frame, terminated by ETB: only its trailing LF is mapped, so one ACK.
      client.write(astmFrame('1', 'H|\\^&|||BioRad^1.0|||||||P|1|20251217223735', ETB, 'C5'));
      await waitFor(() => ackCount() === 2, 1000, 'ACK for the intermediate frame');

      // Final frame, terminated by ETX: both ETX and the trailing LF are mapped, so two ACKs.
      client.write(astmFrame('2', 'P|1||||Doe^John||19700101|M', ETX, '4F'));
      await waitFor(() => ackCount() === 4, 1000, 'ACKs for the final frame');

      client.write(Buffer.from([EOT]));
      await waitFor(() => ackCount() === 5, 1000, 'ACK for EOT');

      // Five ACKs, and nothing but ACKs.
      expect(Buffer.concat(received)).toEqual(Buffer.from([ACK, ACK, ACK, ACK, ACK]));

      await waitFor(() => bodies.length > 0, 1000, 'transmit request');
      // ENQ, STX, ETB, ETX and EOT are gone; CR and LF remain, as do the frame numbers and
      // checksums, which are printable and so were never candidates for stripping.
      expect(bodies[0]).toBe(
        '1H|\\^&|||BioRad^1.0|||||||P|1|20251217223735\rC5\r\n2P|1||||Doe^John||19700101|M\r4F\r\n'
      );

      client.destroy();
      await app.stop();
      mockServer.stop();
    });

    test('Default hex encoding preserves bytes above 0x7f', async () => {
      const bodies: string[] = [];
      const mockServer = startMockAgentServer(bodies);
      const [agentId, agentPort] = await createByteStreamAgent('');

      const app = new App(medplum, agentId, LogLevel.INFO);
      await app.start();

      const [client] = await connectCollecting(agentPort);
      client.write(Buffer.from([0x02, 0xe9, 0xff, 0x80, 0x03]));

      await waitFor(() => bodies.length > 0, 1000, 'transmit request');
      expect(bodies[0]).toBe('02e9ff8003');

      client.destroy();
      await app.stop();
      mockServer.stop();
    });

    test('utf-8 encoding decodes multi-byte characters', async () => {
      const bodies: string[] = [];
      const mockServer = startMockAgentServer(bodies);
      const [agentId, agentPort] = await createByteStreamAgent('&stripControlChars=true&bodyEncoding=utf-8');

      const app = new App(medplum, agentId, LogLevel.INFO);
      await app.start();

      const [client] = await connectCollecting(agentPort);
      client.write(Buffer.concat([Buffer.from([0x02]), Buffer.from('café', 'utf-8'), Buffer.from([0x03])]));

      await waitFor(() => bodies.length > 0, 1000, 'transmit request');
      expect(bodies[0]).toBe('café');

      client.destroy();
      await app.stop();
      mockServer.stop();
    });
  });
});

describe('parseAutoRespondRules', () => {
  test('Single-byte pattern and response', () => {
    const log = createMockLogger();
    const rules = parseAutoRespondRules(['\x05:\x06'], log);

    expect(rules).toHaveLength(1);
    expect(rules[0].pattern).toEqual(Buffer.from([0x05]));
    expect(rules[0].response).toEqual(Buffer.from([0x06]));
    expect(log.warn).not.toHaveBeenCalled();
  });

  test('Multi-byte pattern and response', () => {
    const rules = parseAutoRespondRules(['\x05\x15:\x06\x04'], createMockLogger());

    expect(rules).toHaveLength(1);
    expect(rules[0].pattern).toEqual(Buffer.from([0x05, 0x15]));
    expect(rules[0].response).toEqual(Buffer.from([0x06, 0x04]));
  });

  test('Repeated params accumulate in order', () => {
    const rules = parseAutoRespondRules(['\x05:\x06', '\x15:\x04'], createMockLogger());

    expect(rules.map((rule) => [...rule.pattern])).toEqual([[0x05], [0x15]]);
    expect(rules.map((rule) => [...rule.response])).toEqual([[0x06], [0x04]]);
  });

  test('One comma-separated param accumulates in order', () => {
    const log = createMockLogger();
    const rules = parseAutoRespondRules(['\x05:\x06,\x15:\x04'], log);

    expect(rules.map((rule) => [...rule.pattern])).toEqual([[0x05], [0x15]]);
    expect(rules.map((rule) => [...rule.response])).toEqual([[0x06], [0x04]]);
    expect(log.warn).not.toHaveBeenCalled();
  });

  test('Repetition and commas mix', () => {
    const rules = parseAutoRespondRules(['\x05:\x06,\x15:\x04', '\x04\x05:\x06'], createMockLogger());

    expect(rules.map((rule) => [...rule.pattern])).toEqual([[0x05], [0x15], [0x04, 0x05]]);
  });

  test('Warns on an empty comma-separated entry', () => {
    const log = createMockLogger();
    const rules = parseAutoRespondRules(['\x05:\x06,'], log);

    expect(rules).toHaveLength(1);
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('autoRespond'));
  });

  test('Bytes above 0x7f written as their UTF-8 encoding', () => {
    // %C3%A9 percent-decodes to U+00E9, a single byte once mapped back.
    const rules = parseAutoRespondRules(['é:\x06'], createMockLogger());

    expect(rules).toHaveLength(1);
    expect(rules[0].pattern).toEqual(Buffer.from([0xe9]));
  });

  test.each([
    ['missing separator', '\x05\x06'],
    ['empty pattern', ':\x06'],
    ['empty response', '\x05:'],
    ['pattern outside byte range', '❤:\x06'],
    ['response outside byte range', '\x05:❤'],
  ])('Skips and warns on %s', (_label, rawValue) => {
    const log = createMockLogger();

    expect(parseAutoRespondRules([rawValue], log)).toEqual([]);
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('autoRespond'));
  });

  test('Keeps the first of a duplicated pattern', () => {
    const log = createMockLogger();
    const rules = parseAutoRespondRules(['\x05:\x06', '\x05:\x04'], log);

    expect(rules).toHaveLength(1);
    expect(rules[0].response).toEqual(Buffer.from([0x06]));
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('Duplicate autoRespond pattern %05'));
  });

  test('No params yields no rules', () => {
    const log = createMockLogger();

    expect(parseAutoRespondRules([], log)).toEqual([]);
    expect(log.warn).not.toHaveBeenCalled();
  });
});

describe('parseByteSequences', () => {
  test('Parses and deduplicates', () => {
    const log = createMockLogger();
    const sequences = parseByteSequences(['\x05', '\x15\x04', '\x05'], 'stripSequence', log);

    expect(sequences).toEqual([Buffer.from([0x05]), Buffer.from([0x15, 0x04])]);
    expect(log.warn).not.toHaveBeenCalled();
  });

  test('Splits a comma-separated param', () => {
    const log = createMockLogger();
    const sequences = parseByteSequences(['\x05,\x15\x04'], 'stripSequence', log);

    expect(sequences).toEqual([Buffer.from([0x05]), Buffer.from([0x15, 0x04])]);
    expect(log.warn).not.toHaveBeenCalled();
  });

  test('Deduplicates across repetition and commas alike', () => {
    const sequences = parseByteSequences(['\x05,\x15', '\x05'], 'stripSequence', createMockLogger());

    expect(sequences).toEqual([Buffer.from([0x05]), Buffer.from([0x15])]);
  });

  test('Skips and warns on values outside byte range', () => {
    const log = createMockLogger();

    expect(parseByteSequences(['❤', '\x05'], 'stripSequence', log)).toEqual([Buffer.from([0x05])]);
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('stripSequence'));
  });
});

describe('parseKeepControlChars', () => {
  test('Collects every byte, however the entries are grouped', () => {
    const log = createMockLogger();

    // Grouping is meaningless for a byte set, so all three spellings agree.
    expect(parseKeepControlChars(['\r\n'], log)).toEqual([0x0d, 0x0a]);
    expect(parseKeepControlChars(['\r,\n'], log)).toEqual([0x0d, 0x0a]);
    expect(parseKeepControlChars(['\r', '\n'], log)).toEqual([0x0d, 0x0a]);
    expect(log.warn).not.toHaveBeenCalled();
  });

  test('Deduplicates', () => {
    expect(parseKeepControlChars(['\r\n,\r'], createMockLogger())).toEqual([0x0d, 0x0a]);
  });

  test('No params yields no exemptions', () => {
    expect(parseKeepControlChars([], createMockLogger())).toEqual([]);
  });

  test('Skips and warns on values outside byte range', () => {
    const log = createMockLogger();

    expect(parseKeepControlChars(['❤', '\r'], log)).toEqual([0x0d]);
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('keepControlChars'));
  });
});

describe('parseBodyEncoding', () => {
  test.each([
    [undefined, 'hex'],
    [null, 'hex'],
    ['', 'hex'],
    ['hex', 'hex'],
    ['HEX', 'hex'],
    ['utf-8', 'utf-8'],
    ['utf8', 'utf-8'],
    ['UTF-8', 'utf-8'],
  ])('Parses %s as %s', (rawValue, expected) => {
    const log = createMockLogger();

    expect(parseBodyEncoding(rawValue, log)).toBe(expected);
    expect(log.warn).not.toHaveBeenCalled();
  });

  test.each(['ascii', 'latin1', 'base64'])('Falls back to hex and warns on %s', (rawValue) => {
    const log = createMockLogger();

    expect(parseBodyEncoding(rawValue, log)).toBe('hex');
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining(`Invalid bodyEncoding '${rawValue}'`));
  });
});

describe('ByteSequenceMatcher', () => {
  test('Matches a single-byte pattern', () => {
    const matcher = new ByteSequenceMatcher([{ pattern: Buffer.from([0x05]), response: Buffer.from([0x06]) }]);

    expect(matcher.match(0x01)).toEqual([]);
    expect(matcher.match(0x05)).toEqual([Buffer.from([0x06])]);
  });

  test('Matches a multi-byte pattern one byte at a time', () => {
    const matcher = new ByteSequenceMatcher([{ pattern: Buffer.from([0x05, 0x15]), response: Buffer.from([0x06]) }]);

    expect(matcher.match(0x05)).toEqual([]);
    expect(matcher.match(0x15)).toEqual([Buffer.from([0x06])]);
  });

  test('Matches a pattern preceded by unrelated bytes', () => {
    const matcher = new ByteSequenceMatcher([{ pattern: Buffer.from([0x05, 0x15]), response: Buffer.from([0x06]) }]);

    for (const byte of [0x41, 0x42, 0x05]) {
      expect(matcher.match(byte)).toEqual([]);
    }
    expect(matcher.match(0x15)).toEqual([Buffer.from([0x06])]);
  });

  test('Returns every overlapping rule that completes, in rule order', () => {
    const matcher = new ByteSequenceMatcher([
      { pattern: Buffer.from([0x15]), response: Buffer.from([0x06]) },
      { pattern: Buffer.from([0x05, 0x15]), response: Buffer.from([0x04]) },
    ]);

    expect(matcher.match(0x05)).toEqual([]);
    expect(matcher.match(0x15)).toEqual([Buffer.from([0x06]), Buffer.from([0x04])]);
  });

  test('reset discards partial progress', () => {
    const matcher = new ByteSequenceMatcher([{ pattern: Buffer.from([0x05, 0x15]), response: Buffer.from([0x06]) }]);

    expect(matcher.match(0x05)).toEqual([]);
    matcher.reset();
    expect(matcher.match(0x15)).toEqual([]);
  });

  test('No rules never matches', () => {
    const matcher = new ByteSequenceMatcher([]);

    expect(matcher.match(0x05)).toEqual([]);
  });
});

describe('filterMessageBytes', () => {
  test('Returns the input untouched when nothing is configured', () => {
    const buffer = Buffer.from([0x02, 0x48, 0x03]);

    expect(filterMessageBytes(buffer, [], false)).toBe(buffer);
  });

  test('Removes a multi-byte sequence whole', () => {
    const filtered = filterMessageBytes(Buffer.from('xABy'), [Buffer.from('AB')], false);

    expect(filtered.toString()).toBe('xy');
  });

  test('Removes every occurrence', () => {
    const filtered = filterMessageBytes(Buffer.from('ABxAByAB'), [Buffer.from('AB')], false);

    expect(filtered.toString()).toBe('xy');
  });

  test('Prefers the longest sequence at a given offset', () => {
    const filtered = filterMessageBytes(Buffer.from('ABCD'), [Buffer.from('AB'), Buffer.from('ABC')], false);

    expect(filtered.toString()).toBe('D');
  });

  test('Resumes scanning past a match rather than inside it', () => {
    const filtered = filterMessageBytes(Buffer.from([0x05, 0x15, 0x05]), [Buffer.from([0x05, 0x15])], false);

    expect(filtered).toEqual(Buffer.from([0x05]));
  });

  test('Leaves a truncated sequence at the tail alone', () => {
    const filtered = filterMessageBytes(Buffer.from('xA'), [Buffer.from('AB')], false);

    expect(filtered.toString()).toBe('xA');
  });

  test('stripControlChars removes control bytes including framing', () => {
    const filtered = filterMessageBytes(Buffer.from([0x02, 0x48, 0x0d, 0x0a, 0x69, 0x03]), [], true);

    expect(filtered.toString()).toBe('Hi');
  });

  test('keepControlChars exempts the listed bytes from the sweep', () => {
    const filtered = filterMessageBytes(Buffer.from([0x02, 0x48, 0x0d, 0x0a, 0x69, 0x03]), [], true, [0x0d, 0x0a]);

    expect(filtered).toEqual(Buffer.from([0x48, 0x0d, 0x0a, 0x69]));
  });

  test('stripSequence still removes a byte that keepControlChars exempts', () => {
    // The two are independent: the exemption governs only the control-char sweep.
    const filtered = filterMessageBytes(Buffer.from([0x48, 0x0d, 0x69]), [Buffer.from([0x0d])], true, [0x0d]);

    expect(filtered).toEqual(Buffer.from([0x48, 0x69]));
  });

  test('a keepControlChars byte above the C0 range exempts nothing', () => {
    // 0x41 is outside the sweep, so it can only be a no-op. The exemption is a 32-bit mask and
    // `1 << 0x41` wraps to `1 << 1`, so building it without a range check would spare SOH here.
    const filtered = filterMessageBytes(Buffer.from([0x01, 0x41, 0x42]), [], true, [0x41]);

    expect(filtered).toEqual(Buffer.from([0x41, 0x42]));
  });

  test('keepControlChars is inert when stripControlChars is off', () => {
    const buffer = Buffer.from([0x02, 0x48, 0x03]);

    expect(filterMessageBytes(buffer, [], false, [0x0d])).toBe(buffer);
  });

  test('stripControlChars preserves bytes at or above 0x20', () => {
    const filtered = filterMessageBytes(Buffer.from([0x20, 0x7f, 0xe9]), [], true);

    expect(filtered).toEqual(Buffer.from([0x20, 0x7f, 0xe9]));
  });

  test('Sequences are removed even when they are not control bytes', () => {
    const filtered = filterMessageBytes(Buffer.from([0x02, 0x41, 0x42, 0x43, 0x03]), [Buffer.from('B')], true);

    expect(filtered.toString()).toBe('AC');
  });
});

/**
 * Boots the agent-facing mock WebSocket server.
 *
 * @param bodies - Collects the `body` of every `agent:transmit:request` the agent sends.
 * @returns The running server, for the caller to stop.
 */
function startMockAgentServer(bodies: string[]): Server {
  const mockServer = new Server('wss://example.com/ws/agent');

  mockServer.on('connection', (socket) => {
    socket.on('message', (data) => {
      const command = JSON.parse((data as Buffer).toString('utf8'));
      if (command.type === 'agent:connect:request') {
        socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
      }
      if (command.type === 'agent:transmit:request') {
        bodies.push(command.body);
      }
    });
  });

  return mockServer;
}

/**
 * Builds one ASTM E1394 frame: `STX <seq> <record> CR <terminator> <checksum> CR LF`.
 *
 * The checksum is passed in rather than computed — the channel treats it as opaque payload.
 *
 * @param seq - The single-digit frame sequence number.
 * @param record - The ASTM record text.
 * @param terminator - `ETB` for an intermediate frame, `ETX` for the final one.
 * @param checksum - The two-character frame checksum.
 * @returns The framed bytes.
 */
function astmFrame(seq: string, record: string, terminator: number, checksum: string): Buffer {
  return Buffer.concat([
    Buffer.from([STX]),
    Buffer.from(`${seq}${record}`, 'utf-8'),
    Buffer.from([CR, terminator]),
    Buffer.from(checksum, 'utf-8'),
    Buffer.from([CR, LF]),
  ]);
}

/**
 * Creates a byte-stream Agent and Endpoint on a free port.
 *
 * @param extraParams - Query params appended after `startChar`/`endChar`, e.g. '&autoRespond=%05:%06'.
 * @param framing - Overrides the default STX/ETX framing chars, in `%XX` form.
 * @param framing.startChar - The message start char.
 * @param framing.endChar - The message end char.
 * @returns The agent id and the port its channel listens on.
 */
async function createByteStreamAgent(
  extraParams: string,
  framing: { startChar: string; endChar: string } = { startChar: '%02', endChar: '%03' }
): Promise<[string, number]> {
  const [created, agentPort] = await createEndpointWithRandomPort(medplum, {
    resourceType: 'Endpoint',
    status: 'active',
    address: `tcp://0.0.0.0:9999?startChar=${framing.startChar}&endChar=${framing.endChar}${extraParams}`,
    connectionType: { code: ContentType.OCTET_STREAM },
    payloadType: [{ coding: [{ code: ContentType.OCTET_STREAM }] }],
  });

  const agent = await medplum.createResource<Agent>({
    resourceType: 'Agent',
    name: 'Test Agent',
    status: 'active',
    channel: [{ name: 'test', endpoint: createReference(created), targetReference: createReference(bot) }],
  });

  return [agent.id, agentPort];
}

/**
 * Opens a client socket to the channel and collects everything written back to it.
 *
 * @param port - The channel's listening port.
 * @returns The connected socket and its accumulating received chunks.
 */
async function connectCollecting(port: number): Promise<[net.Socket, Buffer[]]> {
  const client = new net.Socket();
  const received: Buffer[] = [];

  client.on('data', (data: Buffer) => received.push(data));
  await new Promise<void>((resolve, reject) => {
    client.once('error', reject);
    client.connect(port, 'localhost', resolve);
  });

  return [client, received];
}
