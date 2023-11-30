import { allOk, createReference } from '@medplum/core';
import { Agent, Bot, Endpoint, Resource } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { Server } from 'mock-socket';
import { App } from './app';

jest.mock('node-windows');

const medplum = new MockClient();
let bot: Bot;
let endpoint: Endpoint;

describe('App', () => {
  beforeAll(async () => {
    console.log = jest.fn();

    medplum.router.router.add('POST', ':resourceType/:id/$execute', async () => {
      return [allOk, {} as Resource];
    });

    bot = await medplum.createResource<Bot>({ resourceType: 'Bot' });

    endpoint = await medplum.createResource<Endpoint>({
      resourceType: 'Endpoint',
      address: 'mllp://0.0.0.0:57000',
    });
  });

  test('Runs successfully', async () => {
    const mockServer = new Server('wss://example.com/ws/agent');

    mockServer.on('connection', (socket) => {
      socket.on('message', (data) => {
        const command = JSON.parse((data as Buffer).toString('utf8'));
        if (command.type === 'connect') {
          socket.send(
            Buffer.from(
              JSON.stringify({
                type: 'connected',
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
          endpoint: createReference(endpoint),
          targetReference: createReference(bot),
        },
      ],
    });

    const app = new App(medplum, agent.id as string);
    await app.start();
    app.stop();
    app.stop();
    mockServer.stop();
  });
});
