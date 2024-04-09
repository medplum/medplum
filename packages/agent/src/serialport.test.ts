import { allOk, ContentType, createReference, LogLevel, sleep } from '@medplum/core';
import { Agent, Bot, Endpoint, Resource } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { Client, Server } from 'mock-socket';
import { SerialPort } from 'serialport';
import { App } from './app';
import {
  ASCII_END_OF_TEXT,
  ASCII_END_OF_TRANSMISSION,
  ASCII_ENQUIRY,
  ASCII_START_OF_HEADING,
  ASCII_START_OF_TEXT,
} from './serialport';

jest.mock('node-windows');
jest.mock('serialport');

describe('Serial port', () => {
  const medplum = new MockClient();
  let bot: Bot;
  let endpoint: Endpoint;

  beforeAll(async () => {
    console.log = jest.fn();
    console.warn = jest.fn();

    medplum.router.router.add('POST', ':resourceType/:id/$execute', async () => {
      return [allOk, {} as Resource];
    });

    bot = await medplum.createResource<Bot>({ resourceType: 'Bot' });

    const url = new URL('serial://COM1');
    url.searchParams.set('baudRate', '9600');
    url.searchParams.set('dataBits', '8');
    url.searchParams.set('stopBits', '1');
    url.searchParams.set('clearOnStartOfHeading', 'true');
    url.searchParams.set('clearOnStartOfText', 'true');
    url.searchParams.set('transmitOnEndOfText', 'true');
    url.searchParams.set('transmitOnEndOfTransmission', 'true');
    url.searchParams.set('ackOnEnquiry', 'true');
    url.searchParams.set('ackOnEndOfText', 'true');
    url.searchParams.set('ackOnEndOfTransmission', 'true');
    url.searchParams.set('ackOnNewLine', 'true');

    endpoint = await medplum.createResource<Endpoint>({
      resourceType: 'Endpoint',
      status: 'active',
      address: url.toString(),
      connectionType: { code: ContentType.TEXT },
      payloadType: [{ coding: [{ code: ContentType.TEXT }] }],
    });
  });

  test('Send and receive', async () => {
    const mockServer = new Server('wss://example.com/ws/agent');
    const state = {
      socket: undefined as Client | undefined,
      messages: [] as string[],
      gotConnectRequest: false,
      gotTransmitRequest: false,
    };

    mockServer.on('connection', (socket) => {
      state.socket = socket;

      socket.on('message', (data) => {
        const command = JSON.parse((data as Buffer).toString('utf8'));
        if (command.type === 'agent:connect:request') {
          state.gotConnectRequest = true;
          socket.send(
            Buffer.from(
              JSON.stringify({
                type: 'agent:connect:response',
              })
            )
          );
        }

        if (command.type === 'agent:transmit:request') {
          state.gotTransmitRequest = true;
          state.messages.push(command.body);
          socket.send(
            Buffer.from(
              JSON.stringify({
                type: 'agent:transmit:response',
                channel: command.channel,
                remote: command.remote,
                body: 'OK',
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

    // Get the mocked instance of SerialPort
    expect(SerialPort).toHaveBeenCalledTimes(1);
    const serialPort = (SerialPort as unknown as jest.Mock).mock.instances[0];
    expect(serialPort.on).toHaveBeenCalledTimes(3);

    const onOpen = serialPort.on.mock.calls[0];
    expect(onOpen[0]).toBe('open');
    expect(onOpen[1]).toBeInstanceOf(Function);

    const onError = serialPort.on.mock.calls[1];
    expect(onError[0]).toBe('error');
    expect(onError[1]).toBeInstanceOf(Function);

    const onData = serialPort.on.mock.calls[2];
    expect(onData[0]).toBe('data');
    expect(onData[1]).toBeInstanceOf(Function);

    expect(serialPort.open).toHaveBeenCalledTimes(1);

    // Simulate an 'open' event
    const onOpenCallback = onOpen[1] as () => void;
    onOpenCallback();

    // Simulate a recoverable 'error' event
    const onErrorCallback = onError[1] as (err: Error) => void;
    onErrorCallback(new Error('test error'));

    // Wait for the WebSocket to connect
    while (!state.socket) {
      await sleep(100);
    }

    // At this point, we expect the websocket to be connected
    expect(state.socket).toBeDefined();
    expect(state.gotConnectRequest).toBe(true);

    // Clear the messages
    state.messages.length = 0;

    // Mock sending data to the serial port
    const onDataCallback = onData[1] as (data: Buffer) => void;
    onDataCallback(Buffer.from([ASCII_START_OF_HEADING]));
    onDataCallback(Buffer.from([ASCII_START_OF_TEXT]));
    onDataCallback(Buffer.from('test\n'));
    onDataCallback(Buffer.from([ASCII_END_OF_TEXT]));
    onDataCallback(Buffer.from([ASCII_END_OF_TRANSMISSION]));
    onDataCallback(Buffer.from([ASCII_ENQUIRY]));

    // Wait for the WebSocket to transmit
    while (!state.gotTransmitRequest) {
      await sleep(100);
    }
    expect(state.gotTransmitRequest).toBe(true);

    // Wait for the WebSocket to receive a reply
    while (state.messages.length === 0) {
      await sleep(100);
    }

    app.stop();
    mockServer.stop();
  });
});
