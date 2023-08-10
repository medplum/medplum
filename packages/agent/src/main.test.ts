import { allOk, createReference, Hl7Message } from '@medplum/core';
import { Agent, Bot, Endpoint, Resource } from '@medplum/fhirtypes';
import { Hl7Client } from '@medplum/hl7';
import { MockClient } from '@medplum/mock';
import { Server } from 'mock-socket';
import { App } from './main';

jest.mock('node-windows');

const medplum = new MockClient();
let bot: Bot;
let endpoint: Endpoint;

describe('Agent', () => {
  beforeAll(async () => {
    console.log = jest.fn();

    medplum.router.router.add('POST', ':resourceType/:id/$execute', async () => {
      return [allOk, {} as Resource];
    });

    bot = await medplum.createResource<Bot>({ resourceType: 'Bot' });

    endpoint = await medplum.createResource<Endpoint>({
      resourceType: 'Endpoint',
      address: 'mllp://0.0.0.0:56000',
    });
  });

  test('Runs successfully', async () => {
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
  });

  test('Send and receive', async () => {
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

        if (command.type === 'transmit') {
          const hl7Message = Hl7Message.parse(command.message);
          const ackMessage = hl7Message.buildAck();
          socket.send(
            Buffer.from(
              JSON.stringify({
                type: 'transmit',
                message: ackMessage.toString(),
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

    const client = new Hl7Client({
      host: 'localhost',
      port: 56000,
    });

    await client.connect();

    const response = await client.sendAndWait(
      Hl7Message.parse(
        'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
          'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-\r' +
          'NK1|1|JONES^BARBARA^K|SPO|||||20011105\r' +
          'PV1|1|I|2000^2012^01||||004777^LEBAUER^SIDNEY^J.|||SUR||-||1|A0-'
      )
    );
    expect(response).toBeDefined();
    expect(response.header.getComponent(9, 1)).toBe('ACK');
    expect(response.segments).toHaveLength(2);
    expect(response.segments[1].name).toBe('MSA');

    client.close();
    app.stop();
    mockServer.stop();
  });
});
