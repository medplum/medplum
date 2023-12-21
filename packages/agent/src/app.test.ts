import { allOk, sleep } from '@medplum/core';
import { Agent, Resource } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { Client, Server } from 'mock-socket';
import { App } from './app';

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
    const mockServer = new Server('wss://example.com/ws/agent');
    const state = {
      mySocket: undefined as Client | undefined,
      gotPing: false,
    };

    mockServer.on('connection', (socket) => {
      state.mySocket = socket;
      socket.on('message', (data) => {
        const command = JSON.parse((data as Buffer).toString('utf8'));
        if (command.type === 'agent:connect:request') {
          socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
        }
        if (command.type === 'agent:ping:response') {
          state.gotPing = true;
        }
      });
    });

    const agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
    });

    const app = new App(medplum, agent.id as string);
    await app.start();

    // Wait for the WebSocket to connect
    while (!state.mySocket) {
      await sleep(100);
    }

    // Send a ping
    const wsClient = state.mySocket as unknown as Client;
    wsClient.send(Buffer.from(JSON.stringify({ type: 'agent:ping:request' })));

    // Wait for ping response
    while (!state.gotPing) {
      await sleep(100);
    }

    app.stop();
    app.stop();
    mockServer.stop();
  });
});
