import { allOk, createReference, sleep } from '@medplum/core';
import { Agent, Bot, Endpoint, Resource } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { Client, Server } from 'mock-socket';
import { App } from './app';

jest.mock('node-windows');

const medplum = new MockClient();

describe('App', () => {
  beforeAll(async () => {
    console.log = jest.fn();
    console.error = jest.fn();

    medplum.router.router.add('POST', ':resourceType/:id/$execute', async () => {
      return [allOk, {} as Resource];
    });
  });

  test('Runs successfully', async () => {
    const mockServer = new Server('wss://example.com/ws/agent');
    const state = {
      mySocket: undefined as Client | undefined,
      gotHeartbeatRequest: false,
      gotHeartbeatResponse: false,
    };

    mockServer.on('connection', (socket) => {
      state.mySocket = socket;
      socket.on('message', (data) => {
        const command = JSON.parse((data as Buffer).toString('utf8'));
        if (command.type === 'agent:connect:request') {
          socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
        }
        if (command.type === 'agent:heartbeat:request') {
          state.gotHeartbeatRequest = true;
          socket.send(Buffer.from(JSON.stringify({ type: 'agent:heartbeat:response' })));
        }
        if (command.type === 'agent:heartbeat:response') {
          state.gotHeartbeatResponse = true;
        }
      });
    });

    const agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
    });

    const app = new App(medplum, agent.id as string);
    app.healthcheckPeriod = 1000;
    await app.start();

    // Wait for the WebSocket to connect
    while (!state.mySocket) {
      await sleep(100);
    }

    // Send a heartbeat request
    const wsClient = state.mySocket as unknown as Client;
    wsClient.send(Buffer.from(JSON.stringify({ type: 'agent:heartbeat:request' })));

    // Wait for heartbeat response
    while (!state.gotHeartbeatRequest || !state.gotHeartbeatResponse) {
      await sleep(100);
    }

    // Send an error message
    wsClient.send(Buffer.from(JSON.stringify({ type: 'agent:error', body: 'details' })));

    // Send an unknown message type
    wsClient.send(Buffer.from(JSON.stringify({ type: 'unknown' })));

    // Simulate a token refresh
    medplum.dispatchEvent({ type: 'change' });

    app.stop();
    app.stop();
    mockServer.stop();

    expect(console.error).toHaveBeenCalledWith('Unknown message type: unknown');
  });

  test('Reconnect after connection closed', async () => {
    const state = {
      mySocket: undefined as Client | undefined,
    };

    function mockConnectionHandler(socket: Client): void {
      state.mySocket = socket;
      socket.on('message', (data) => {
        const command = JSON.parse((data as Buffer).toString('utf8'));
        if (command.type === 'agent:connect:request') {
          socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
        }
      });
    }

    const mockServer1 = new Server('wss://example.com/ws/agent');
    mockServer1.on('connection', mockConnectionHandler);

    const agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
    });

    const app = new App(medplum, agent.id as string);
    app.healthcheckPeriod = 100;
    await app.start();

    // Wait for the WebSocket to connect
    while (!state.mySocket) {
      await sleep(100);
    }

    // Then forcefully close the connection
    state.mySocket.close();
    state.mySocket = undefined;
    mockServer1.stop();

    // Sleep for a bit to allow healthchecks while disconnected
    await sleep(1000);

    // Start a new server
    const mockServer2 = new Server('wss://example.com/ws/agent');
    mockServer2.on('connection', mockConnectionHandler);

    // Wait for the WebSocket to reconnect
    while (!state.mySocket) {
      await sleep(100);
    }

    app.stop();
    app.stop();
    mockServer2.stop();
  });

  test('Empty endpoint URL', async () => {
    console.log = jest.fn();
    console.warn = jest.fn();

    medplum.router.router.add('POST', ':resourceType/:id/$execute', async () => {
      return [allOk, {} as Resource];
    });

    const bot = await medplum.createResource<Bot>({ resourceType: 'Bot' });

    const endpoint = await medplum.createResource<Endpoint>({
      resourceType: 'Endpoint',
      address: '', // invalid empty address
    });

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

    const agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      channel: [
        {
          name: 'test',
          endpoint: createReference(endpoint),
          targetReference: createReference(bot),
        },
      ],
    });

    const app = new App(medplum, agent.id as string);
    await app.start();
    app.stop();
    mockServer.stop();

    expect(console.warn).toHaveBeenCalledWith('Ignoring empty endpoint address: test');
  });

  test('Unknown endpoint protocol', async () => {
    console.log = jest.fn();
    console.error = jest.fn();

    medplum.router.router.add('POST', ':resourceType/:id/$execute', async () => {
      return [allOk, {} as Resource];
    });

    const bot = await medplum.createResource<Bot>({ resourceType: 'Bot' });

    const endpoint = await medplum.createResource<Endpoint>({
      resourceType: 'Endpoint',
      address: 'foo:', // unsupported protocol
    });

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

    const agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      channel: [
        {
          name: 'test',
          endpoint: createReference(endpoint),
          targetReference: createReference(bot),
        },
      ],
    });

    const app = new App(medplum, agent.id as string);
    await app.start();
    app.stop();
    mockServer.stop();

    expect(console.error).toHaveBeenCalledWith('Unsupported endpoint type: foo:');
  });
});
