import { LogLevel, allOk, createReference } from '@medplum/core';
import { Agent, Bot, Endpoint, Resource } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import * as dimse from 'dcmjs-dimse';
import { Server } from 'mock-socket';
import path from 'node:path';
import { App } from './app';

const medplum = new MockClient();
let bot: Bot;
let endpoint: Endpoint;

describe('DICOM', () => {
  beforeAll(async () => {
    console.log = jest.fn();
    dimse.log.transports.forEach((t) => (t.silent = true));

    medplum.router.router.add('POST', ':resourceType/:id/$execute', async () => {
      return [allOk, {} as Resource];
    });

    bot = await medplum.createResource<Bot>({ resourceType: 'Bot' });

    endpoint = await medplum.createResource<Endpoint>({
      resourceType: 'Endpoint',
      address: 'dicom://0.0.0.0:8104',
    } as Endpoint);
  });

  test('C-ECHO and C-STORE', async () => {
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
          name: 'test',
          endpoint: createReference(endpoint),
          targetReference: createReference(bot),
        },
      ],
    } as Agent);

    const app = new App(medplum, agent.id as string, LogLevel.INFO);
    await app.start();

    const client = new dimse.Client();

    //
    // C-ECHO
    //
    const echoResponse = (await new Promise((resolve, reject) => {
      const request = new dimse.requests.CEchoRequest();
      request.on('response', resolve);
      client.on('networkError', reject);
      client.addRequest(request);
      client.send('localhost', 8104, 'SCU', 'ANY-SCP');
    })) as dimse.responses.CEchoResponse;

    expect(echoResponse).toBeDefined();

    const echoCommandDataset = echoResponse.getCommandDataset();
    expect(echoCommandDataset).toBeDefined();
    expect(echoCommandDataset?.getTransferSyntaxUid()).toBe('1.2.840.10008.1.2');
    expect(echoCommandDataset?.getElement('Status')).toEqual(0);

    //
    // C-STORE
    //

    const storeResponse = (await new Promise((resolve, reject) => {
      const request = new dimse.requests.CStoreRequest(path.resolve(__dirname, '../testdata/sample-sr.dcm'));
      request.on('response', resolve);
      client.on('networkError', reject);
      client.addRequest(request);
      client.send('localhost', 8104, 'SCU', 'ANY-SCP');
    })) as dimse.responses.CStoreResponse;

    expect(storeResponse).toBeDefined();

    const storeCommandDataset = storeResponse.getCommandDataset();
    expect(storeCommandDataset).toBeDefined();
    expect(storeCommandDataset?.getTransferSyntaxUid()).toBe('1.2.840.10008.1.2');
    expect(storeCommandDataset?.getElement('Status')).toEqual(0);

    client.clearRequests();
    await app.stop();
    mockServer.stop();
  }, 10000);
});
