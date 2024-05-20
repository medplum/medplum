import { allOk, ContentType, createReference, Hl7Message, LogLevel, sleep } from '@medplum/core';
import { Agent, Bot, Endpoint, Resource } from '@medplum/fhirtypes';
import { Hl7Client, Hl7Server } from '@medplum/hl7';
import { MockClient } from '@medplum/mock';
import { Client, Server } from 'mock-socket';
import { App } from './app';

jest.mock('node-windows');

const medplum = new MockClient();
let bot: Bot;
let endpoint: Endpoint;

describe('HL7', () => {
  beforeAll(async () => {
    console.log = jest.fn();

    medplum.router.router.add('POST', ':resourceType/:id/$execute', async () => {
      return [allOk, {} as Resource];
    });

    bot = await medplum.createResource<Bot>({ resourceType: 'Bot' });

    endpoint = await medplum.createResource<Endpoint>({
      resourceType: 'Endpoint',
      status: 'active',
      address: 'mllp://0.0.0.0:57000',
      connectionType: { code: ContentType.HL7_V2 },
      payloadType: [{ coding: [{ code: ContentType.HL7_V2 }] }],
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
          const hl7Message = Hl7Message.parse(command.body);
          const ackMessage = hl7Message.buildAck();
          socket.send(
            Buffer.from(
              JSON.stringify({
                type: 'agent:transmit:response',
                channel: command.channel,
                remote: command.remote,
                body: ackMessage.toString(),
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

    const app = new App(medplum, agent.id as string, LogLevel.INFO);
    await app.start();

    const client = new Hl7Client({
      host: 'localhost',
      port: 57000,
    });

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
    await app.stop();
    mockServer.stop();
  });

  test('Push', async () => {
    const mockServer = new Server('wss://example.com/ws/agent');
    let mySocket: Client | undefined = undefined;

    mockServer.on('connection', (socket) => {
      mySocket = socket;
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

    // Start an HL7 listener
    const hl7Messages = [];
    const hl7Server = new Hl7Server((conn) => {
      conn.addEventListener('message', ({ message }) => {
        hl7Messages.push(message);
        conn.send(message.buildAck());
      });
    });
    hl7Server.start(57001);

    // Wait for server to start listening
    while (!hl7Server.server?.listening) {
      await sleep(100);
    }

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
          body:
            'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
            'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-\r' +
            'NK1|1|JONES^BARBARA^K|SPO|||||20011105\r' +
            'PV1|1|I|2000^2012^01||||004777^LEBAUER^SIDNEY^J.|||SUR||-||1|A0-',
          remote: 'mllp://localhost:57001',
        })
      )
    );

    // Wait for the HL7 message to be received
    while (hl7Messages.length < 1) {
      await sleep(100);
    }
    expect(hl7Messages.length).toBe(1);

    // Shutdown everything
    await hl7Server.stop();
    await app.stop();
    mockServer.stop();
  });
});
