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
import child_process from 'node:child_process';
import { App } from './app';

jest.mock('node-windows');

const medplum = new MockClient();

describe('Agent Net Utils', () => {
  describe('Ping -- Within One App Instance', () => {
    let mockServer: Server;
    let wsClient: Client | undefined = undefined;
    let app: App;
    let onMessage: (command: AgentMessage) => void;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let originalLog: typeof console.log;

    beforeAll(async () => {
      originalLog = console.log;
      console.log = jest.fn();

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
      } as Agent);

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
      app.stop();
      await new Promise<void>((resolve) => {
        mockServer.stop(resolve);
      });
      console.log = originalLog;
      wsClient = undefined;
    });

    afterEach(() => {
      clearTimeout(timer);
    });

    test('Valid ping', async () => {
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
        status: 'ok',
        body: expect.stringMatching(/ping statistics/),
      });
    });

    test('Non-IP remote', async () => {
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
            body: 'PING',
          } satisfies AgentTransmitRequest)
        )
      );

      timer = setTimeout(() => {
        reject(new Error('Timeout'));
      }, 3500);

      await expect(messageReceived).resolves.toMatchObject<Partial<AgentTransmitResponse>>({
        type: 'agent:transmit:response',
        contentType: ContentType.TEXT,
        status: 'error',
        callback,
        body: expect.any(String),
      });
    });
  });

  describe('Ping -- Edge Cases', () => {
    let mockServer: Server;
    let wsClient: Client | undefined = undefined;
    let app: App;
    let onMessage: (command: AgentMessage) => void;
    let timer: ReturnType<typeof setTimeout>;

    beforeEach(async () => {
      // console.log = jest.fn();

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
      } as Agent);

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
      app.stop();
      await new Promise<void>((resolve) => {
        mockServer.stop(resolve);
      });
      clearTimeout(timer);
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
            body: 'PING',
          } satisfies AgentTransmitRequest)
        )
      );

      timer = setTimeout(() => {
        reject(new Error('Timeout'));
      }, 3500);

      // We can ping localhost, woohoo
      await expect(messageReceived).resolves.toMatchObject<Partial<AgentTransmitResponse>>({
        type: 'agent:transmit:response',
        body: expect.any(String),
        contentType: ContentType.PING,
        callback,
        status: 'ok',
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
      jest.spyOn(child_process, 'exec').mockImplementationOnce((command, opts, cb) => {
        setTimeout(() => {
          cb(new Error('Ping command timeout'));
        }, 100);
      });

      callback = generateId();
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

      // We should get a timeout error
      await expect(messageReceived).resolves.toMatchObject<Partial<AgentTransmitResponse>>({
        type: 'agent:transmit:response',
        contentType: ContentType.TEXT,
        callback,
        status: 'error',
        body: expect.stringMatching(/Ping command timeout/i),
      });
    });

    test('No ping command available', async () => {
      jest.spyOn(child_process, 'exec').mockImplementationOnce((_cmd: string, _opts, cb: (err: Error) => void) => {
        cb(new Error('No ping command!'));
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
            body: 'PING',
          } satisfies AgentTransmitRequest)
        )
      );

      timer = setTimeout(() => {
        reject(new Error('Timeout'));
      }, 3500);

      await expect(messageReceived).resolves.toMatchObject<Partial<AgentTransmitResponse>>({
        type: 'agent:transmit:response',
        contentType: ContentType.TEXT,
        status: 'error',
        callback,
        body: expect.stringMatching(/Ping utility not available/),
      });
    });
  });
});
