import { AgentMessage, allOk, ContentType, LogLevel, sleep } from '@medplum/core';
import { Agent, Resource } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { Client, Server } from 'mock-socket';
import { App } from './app';

jest.mock('node-windows');

const medplum = new MockClient();

describe('Agent Net Utils', () => {
  let mockServer: Server;
  let mySocket: Client | undefined = undefined;
  let wsClient: Client;
  let app: App;
  let onMessage: (command: AgentMessage) => void;

  beforeAll(async () => {
    console.log = jest.fn();

    medplum.router.router.add('POST', ':resourceType/:id/$execute', async () => {
      return [allOk, {} as Resource];
    });

    mockServer = new Server('wss://example.com/ws/agent');

    mockServer.on('connection', (socket) => {
      mySocket = socket;
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
    while (!mySocket) {
      await sleep(100);
    }

    wsClient = mySocket as unknown as Client;
  });

  afterAll(() => {
    app.stop();
    mockServer.stop();
  });

  test('Ping -- valid', async () => {
    let resolve: (value: AgentMessage) => void;
    let reject: (error: Error) => void;

    const messageReceived = new Promise<AgentMessage>((_resolve, _reject) => {
      resolve = _resolve;
      reject = _reject;
    });

    onMessage = (command) => resolve(command);

    expect(wsClient).toBeDefined();
    wsClient.send(
      Buffer.from(
        JSON.stringify({
          type: 'agent:transmit:request',
          contentType: ContentType.PING,
          remote: '127.0.0.1',
          body: 'PING',
        })
      )
    );

    const timer = setTimeout(() => {
      reject(new Error('Timeout'));
    }, 3500);

    await expect(messageReceived).resolves.toMatchObject({ type: 'agent:transmit:response', body: expect.any(String) });
    clearTimeout(timer);
  });

  test('Ping -- non-IP remote', async () => {
    let resolve: (value: AgentMessage) => void;
    let reject: (error: Error) => void;

    const messageReceived = new Promise<AgentMessage>((_resolve, _reject) => {
      resolve = _resolve;
      reject = _reject;
    });

    onMessage = (command) => resolve(command);

    expect(wsClient).toBeDefined();
    wsClient.send(
      Buffer.from(
        JSON.stringify({
          type: 'agent:transmit:request',
          contentType: ContentType.PING,
          remote: 'https://localhost:3001',
          body: 'PING',
        })
      )
    );

    const timer = setTimeout(() => {
      reject(new Error('Timeout'));
    }, 3500);

    await expect(messageReceived).resolves.toMatchObject({ type: 'agent:error', body: expect.any(String) });
    clearTimeout(timer);
  });
});
