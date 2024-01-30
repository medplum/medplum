import { AgentMessage, allOk, ContentType, LogLevel, sleep } from '@medplum/core';
import { Agent, Resource } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { Client, Server } from 'mock-socket';
import { App } from './app';

jest.mock('node-windows');

const medplum = new MockClient();

describe('Agent Net Utils', () => {
  beforeAll(async () => {
    console.log = jest.fn();

    medplum.router.router.add('POST', ':resourceType/:id/$execute', async () => {
      return [allOk, {} as Resource];
    });
  });

  test('Ping', async () => {
    const mockServer = new Server('wss://example.com/ws/agent');
    let mySocket: Client | undefined = undefined;

    let resolve: (value: AgentMessage) => void;
    let reject: (error: Error) => void;
    const deferredPromise = new Promise<AgentMessage>((_resolve, _reject) => {
      resolve = _resolve;
      reject = _reject;
    });

    mockServer.on('connection', (socket) => {
      mySocket = socket;
      socket.on('message', (data) => {
        const command = JSON.parse((data as Buffer).toString('utf8'));
        console.log(command);
        if (command.type === 'agent:connect:request') {
          socket.send(
            Buffer.from(
              JSON.stringify({
                type: 'agent:connect:response',
              })
            )
          );
        } else if (command.type === 'agent:transmit:response' && command.contentType === ContentType.PING) {
          resolve(command);
        }
      });
    });

    const agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
    } as Agent);

    // Start the app
    const app = new App(medplum, agent.id as string, LogLevel.INFO);
    await app.start();

    // Wait for the WebSocket to connect
    // eslint-disable-next-line no-unmodified-loop-condition
    while (!mySocket) {
      await sleep(100);
    }

    // At this point, we expect the websocket to be connected
    expect(mySocket).toBeDefined();

    // Send a push message
    const wsClient = mySocket as unknown as Client;
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

    try {
      const timer = setTimeout(() => {
        reject(new Error('Timeout'));
      }, 3500);
      await deferredPromise;
      clearTimeout(timer);
    } finally {
      app.stop();
      mockServer.stop();
    }
  });
});
