import {
  AgentMessage,
  AgentTransmitRequest,
  AgentTransmitResponse,
  allOk,
  ContentType,
  generateId,
  LogLevel,
  sleep,
} from '@medplum/core';
import { Agent, Resource } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { Client, Server } from 'mock-socket';
import child_process, { ChildProcess } from 'node:child_process';
import { App } from './app';

const medplum = new MockClient();

describe('Agent Net Utils', () => {
  let originalLog: typeof console.log;

  beforeAll(() => {
    originalLog = console.log;
    console.log = jest.fn();
  });

  afterAll(() => {
    console.log = originalLog;
  });

  describe('Ping -- Within One App Instance', () => {
    let mockServer: Server;
    let wsClient: Client;
    let app: App;
    let onMessage: (command: AgentMessage) => void;
    let timer: ReturnType<typeof setTimeout> | undefined;

    beforeAll(async () => {
      medplum.router.router.add('POST', ':resourceType/:id/$execute', async () => {
        return [allOk, {} as Resource];
      });

      mockServer = new Server('wss://example.com/ws/agent');

      mockServer.on('connection', (socket) => {
        wsClient = socket;
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
          } else {
            onMessage(command);
          }
        });
      });

      const agent = await medplum.createResource<Agent>({
        resourceType: 'Agent',
        name: 'Test Agent',
        status: 'active',
      });

      // Start the app
      app = new App(medplum, agent.id as string, LogLevel.INFO);
      await app.start();

      // Wait for the WebSocket to connect
      // eslint-disable-next-line no-unmodified-loop-condition
      while (!wsClient) {
        await sleep(100);
      }
    });

    afterAll(async () => {
      await app.stop();
      await new Promise<void>((resolve) => {
        mockServer.stop(resolve);
      });
      // @ts-expect-error We know by the time it's used again this will be redefined
      wsClient = undefined;
    });

    afterEach(() => {
      clearTimeout(timer);
    });

    test('Valid ping to IP', async () => {
      let resolve: (value: AgentMessage) => void;
      let reject: (error: Error) => void;

      const messageReceived = new Promise<AgentMessage>((_resolve, _reject) => {
        resolve = _resolve;
        reject = _reject;
      });

      onMessage = (command) => resolve(command);
      expect(wsClient).toBeDefined();

      const callback = generateId();
      wsClient.send(
        Buffer.from(
          JSON.stringify({
            type: 'agent:transmit:request',
            contentType: ContentType.PING,
            remote: '127.0.0.1',
            callback,
            body: 'PING',
          } satisfies AgentTransmitRequest)
        )
      );

      timer = setTimeout(() => {
        reject(new Error('Timeout'));
      }, 3500);

      await expect(messageReceived).resolves.toMatchObject<Partial<AgentTransmitResponse>>({
        type: 'agent:transmit:response',
        callback,
        statusCode: 200,
        body: expect.stringMatching(/ping statistics/i),
      });
    });

    test('Valid ping to domain name', async () => {
      let resolve: (value: AgentMessage) => void;
      let reject: (error: Error) => void;

      const messageReceived = new Promise<AgentMessage>((_resolve, _reject) => {
        resolve = _resolve;
        reject = _reject;
      });

      onMessage = (command) => resolve(command);
      expect(wsClient).toBeDefined();

      const callback = generateId();
      wsClient.send(
        Buffer.from(
          JSON.stringify({
            type: 'agent:transmit:request',
            contentType: ContentType.PING,
            remote: 'localhost',
            callback,
            body: 'PING',
          } satisfies AgentTransmitRequest)
        )
      );

      timer = setTimeout(() => {
        reject(new Error('Timeout'));
      }, 3500);

      await expect(messageReceived).resolves.toMatchObject<Partial<AgentTransmitResponse>>({
        type: 'agent:transmit:response',
        callback,
        statusCode: 200,
        body: expect.stringMatching(/ping statistics/i),
      });
    });

    test('Invalid remote', async () => {
      let resolve: (value: AgentMessage) => void;
      let reject: (error: Error) => void;

      const messageReceived = new Promise<AgentMessage>((_resolve, _reject) => {
        resolve = _resolve;
        reject = _reject;
      });

      onMessage = (command) => resolve(command);

      expect(wsClient).toBeDefined();

      const callback = generateId();
      wsClient.send(
        Buffer.from(
          JSON.stringify({
            type: 'agent:transmit:request',
            contentType: ContentType.PING,
            remote: 'https://localhost:3001',
            callback,
            body: 'PING 1',
          } satisfies AgentTransmitRequest)
        )
      );

      timer = setTimeout(() => {
        reject(new Error('Timeout'));
      }, 3500);

      await expect(messageReceived).resolves.toMatchObject<Partial<AgentTransmitResponse>>({
        type: 'agent:transmit:response',
        contentType: ContentType.TEXT,
        statusCode: 400,
        callback,
        body: expect.stringMatching(/invalid host/i),
      });
    });

    test('Invalid ping body -- Random message', async () => {
      let resolve: (value: AgentMessage) => void;
      let reject: (error: Error) => void;

      const messageReceived = new Promise<AgentMessage>((_resolve, _reject) => {
        resolve = _resolve;
        reject = _reject;
      });

      onMessage = (command) => resolve(command);

      expect(wsClient).toBeDefined();

      const callback = generateId();
      wsClient.send(
        Buffer.from(
          JSON.stringify({
            type: 'agent:transmit:request',
            contentType: ContentType.PING,
            remote: '127.0.0.1',
            callback,
            body: 'Hello, Medplum!',
          } satisfies AgentTransmitRequest)
        )
      );

      timer = setTimeout(() => {
        reject(new Error('Timeout'));
      }, 3500);

      await expect(messageReceived).resolves.toMatchObject<Partial<AgentTransmitResponse>>({
        type: 'agent:transmit:response',
        contentType: ContentType.PING,
        statusCode: 200,
        callback,
        body: expect.stringMatching(/ping statistics/i),
      });

      expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/message body present but unused/i));
    });

    test('Invalid ping body -- non-numeric first arg', async () => {
      let resolve: (value: AgentMessage) => void;
      let reject: (error: Error) => void;

      const messageReceived = new Promise<AgentMessage>((_resolve, _reject) => {
        resolve = _resolve;
        reject = _reject;
      });

      onMessage = (command) => resolve(command);

      expect(wsClient).toBeDefined();

      const callback = generateId();
      wsClient.send(
        Buffer.from(
          JSON.stringify({
            type: 'agent:transmit:request',
            contentType: ContentType.PING,
            remote: '127.0.0.1',
            callback,
            body: 'PING JOHN',
          } satisfies AgentTransmitRequest)
        )
      );

      timer = setTimeout(() => {
        reject(new Error('Timeout'));
      }, 3500);

      await expect(messageReceived).resolves.toMatchObject<Partial<AgentTransmitResponse>>({
        type: 'agent:transmit:response',
        contentType: ContentType.TEXT,
        statusCode: 400,
        callback,
        body: expect.stringMatching(/is not a number/i),
      });
    });
  });

  describe('Ping -- Edge Cases', () => {
    let mockServer: Server;
    let wsClient: Client;
    let app: App;
    let onMessage: (command: AgentMessage) => void;
    let timer: ReturnType<typeof setTimeout>;

    beforeEach(async () => {
      medplum.router.router.add('POST', ':resourceType/:id/$execute', async () => {
        return [allOk, {} as Resource];
      });

      mockServer = new Server('wss://example.com/ws/agent');

      mockServer.on('connection', (socket) => {
        wsClient = socket;
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
          } else {
            onMessage(command);
          }
        });
      });

      const agent = await medplum.createResource<Agent>({
        resourceType: 'Agent',
        name: 'Test Agent',
        status: 'active',
      });

      // Start the app
      app = new App(medplum, agent.id as string, LogLevel.INFO);
      await app.start();

      // Wait for the WebSocket to connect
      // eslint-disable-next-line no-unmodified-loop-condition
      while (!wsClient) {
        await sleep(100);
      }
    });

    afterEach(async () => {
      await app.stop();
      await new Promise<void>((resolve) => {
        mockServer.stop(resolve);
      });
      clearTimeout(timer);
      // @ts-expect-error We know that in each beforeEach this is redefined
      wsClient = undefined;
    });

    test('Ping times out', async () => {
      let resolve: (value: AgentMessage) => void;
      let reject: (error: Error) => void;

      let messageReceived = new Promise<AgentMessage>((_resolve, _reject) => {
        resolve = _resolve;
        reject = _reject;
      });

      onMessage = (command) => resolve(command);

      expect(wsClient).toBeDefined();

      let callback = generateId();
      wsClient.send(
        Buffer.from(
          JSON.stringify({
            type: 'agent:transmit:request',
            contentType: ContentType.PING,
            remote: '127.0.0.1',
            callback,
            body: 'PING 1',
          } satisfies AgentTransmitRequest)
        )
      );

      timer = setTimeout(() => {
        reject(new Error('Timeout'));
      }, 3500);

      // We can ping localhost, woohoo
      await expect(messageReceived).resolves.toMatchObject<Partial<AgentTransmitResponse>>({
        type: 'agent:transmit:response',
        body: expect.stringMatching(/ping statistics/i),
        contentType: ContentType.PING,
        callback,
        statusCode: 200,
      });

      // Setup for a ping that will timeout
      messageReceived = new Promise<AgentMessage>((_resolve, _reject) => {
        resolve = _resolve;
        reject = _reject;
      });

      clearTimeout(timer);
      timer = setTimeout(() => {
        reject(new Error('Timeout'));
      }, 3500);

      onMessage = (command) => resolve(command);

      // We are gonna make ping fail after a timeout
      jest.spyOn(child_process, 'exec').mockImplementationOnce((_command, _options, callback): ChildProcess => {
        setTimeout(() => {
          callback?.(new Error('Ping command timeout'), '', '');
        }, 50);
        return new ChildProcess();
      });

      callback = generateId();
      wsClient.send(
        Buffer.from(
          JSON.stringify({
            type: 'agent:transmit:request',
            contentType: ContentType.PING,
            remote: '127.0.0.1',
            callback,
            body: 'PING 1',
          } satisfies AgentTransmitRequest)
        )
      );

      // We should get a timeout error
      await expect(messageReceived).resolves.toMatchObject<Partial<AgentTransmitResponse>>({
        type: 'agent:transmit:response',
        contentType: ContentType.TEXT,
        callback,
        statusCode: 400,
        body: expect.stringMatching(/Ping command timeout/),
      });
    });

    test('No ping command available', async () => {
      // We are gonna make ping fail after a timeout
      jest.spyOn(child_process, 'exec').mockImplementationOnce((_command, _options, callback): ChildProcess => {
        setTimeout(() => {
          callback?.(new Error('Ping not found'), '', '');
        }, 50);
        return new ChildProcess();
      });

      let resolve: (value: AgentMessage) => void;
      let reject: (error: Error) => void;

      const messageReceived = new Promise<AgentMessage>((_resolve, _reject) => {
        resolve = _resolve;
        reject = _reject;
      });

      onMessage = (command) => resolve(command);
      expect(wsClient).toBeDefined();

      const callback = generateId();
      wsClient.send(
        Buffer.from(
          JSON.stringify({
            type: 'agent:transmit:request',
            contentType: ContentType.PING,
            remote: '127.0.0.1',
            callback,
            body: 'PING 1',
          } satisfies AgentTransmitRequest)
        )
      );

      timer = setTimeout(() => {
        reject(new Error('Timeout'));
      }, 3500);

      await expect(messageReceived).resolves.toMatchObject<Partial<AgentTransmitResponse>>({
        type: 'agent:transmit:response',
        contentType: ContentType.TEXT,
        statusCode: 400,
        callback,
        body: expect.stringMatching(/Ping not found/),
      });
    });
  });
});
