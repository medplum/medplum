import { Hl7Message, MedplumClient, normalizeErrorString } from '@medplum/core';
import { AgentChannel, Endpoint, Reference } from '@medplum/fhirtypes';
import { Hl7Client, Hl7Connection, Hl7MessageEvent, Hl7Server } from '@medplum/hl7';
import { EventLogger } from 'node-windows';
import WebSocket from 'ws';

interface QueueItem {
  channel: string;
  remote: string;
  body: string;
}

export class App {
  readonly log: EventLogger;
  readonly webSocket: WebSocket;
  readonly webSocketQueue: QueueItem[] = [];
  readonly channels = new Map<string, AgentHl7Channel>();
  readonly hl7Queue: QueueItem[] = [];
  live = false;

  constructor(
    readonly medplum: MedplumClient,
    readonly agentId: string
  ) {
    this.log = {
      info: console.log,
      warn: console.warn,
      error: console.error,
    } as EventLogger;

    const webSocketUrl = new URL(medplum.getBaseUrl());
    webSocketUrl.protocol = webSocketUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    webSocketUrl.pathname = '/ws/agent';
    this.log.info(`Connecting to WebSocket: ${webSocketUrl.href}`);

    this.webSocket = new WebSocket(webSocketUrl);
    this.webSocket.binaryType = 'nodebuffer';
    this.webSocket.addEventListener('error', (err) => this.log.error(err.message));
    this.webSocket.addEventListener('open', () => {
      this.webSocket.send(
        JSON.stringify({
          type: 'connect',
          accessToken: medplum.getAccessToken(),
          agentId,
        })
      );
    });

    this.webSocket.addEventListener('message', (e) => {
      try {
        const data = e.data as Buffer;
        const str = data.toString('utf8');
        this.log.info(`Received from WebSocket: ${str.replaceAll('\r', '\n')}`);
        const command = JSON.parse(str);
        switch (command.type) {
          case 'connected':
            this.live = true;
            this.trySendToWebSocket();
            break;
          case 'transmit':
            this.addToHl7Queue(command);
            break;
          case 'push':
            this.pushMessage(command);
            break;
        }
      } catch (err) {
        this.log.error(`WebSocket error: ${normalizeErrorString(err)}`);
      }
    });
  }

  async start(): Promise<void> {
    this.log.info('Medplum service starting...');

    const agent = await this.medplum.readResource('Agent', this.agentId);

    for (const definition of agent.channel as AgentChannel[]) {
      const endpoint = await this.medplum.readReference(definition.endpoint as Reference<Endpoint>);
      const channel = new AgentHl7Channel(this, definition, endpoint);
      channel.start();
      this.channels.set(definition.name as string, channel);
    }

    this.log.info('Medplum service started successfully');
  }

  stop(): void {
    this.log.info('Medplum service stopping...');
    this.channels.forEach((channel) => channel.stop());
    this.log.info('Medplum service stopped successfully');
  }

  addToWebSocketQueue(message: QueueItem): void {
    this.webSocketQueue.push(message);
    this.trySendToWebSocket();
  }

  addToHl7Queue(message: QueueItem): void {
    this.hl7Queue.push(message);
    this.trySendToHl7Connection();
  }

  private trySendToWebSocket(): void {
    if (this.live) {
      while (this.webSocketQueue.length > 0) {
        const msg = this.webSocketQueue.shift();
        if (msg) {
          this.webSocket.send(
            JSON.stringify({
              type: 'transmit',
              accessToken: this.medplum.getAccessToken(),
              ...msg,
            })
          );
        }
      }
    }
  }

  private trySendToHl7Connection(): void {
    while (this.hl7Queue.length > 0) {
      const msg = this.hl7Queue.shift();
      if (msg) {
        const channel = this.channels.get(msg.channel);
        if (channel) {
          const connection = channel.connections.get(msg.remote);
          if (connection) {
            connection.hl7Connection.send(Hl7Message.parse(msg.body));
          }
        }
      }
    }
  }

  private pushMessage(message: QueueItem): void {
    const address = new URL(message.remote);
    const client = new Hl7Client({
      host: address.hostname,
      port: parseInt(address.port, 10),
    });

    client
      .sendAndWait(Hl7Message.parse(message.body))
      .then((response) => {
        this.log.info(`Response: ${response.toString().replaceAll('\r', '\n')}`);
      })
      .catch((err) => {
        this.log.error(`HL7 error: ${normalizeErrorString(err)}`);
      })
      .finally(() => {
        client.close();
      });
  }
}

export class AgentHl7Channel {
  readonly server: Hl7Server;
  readonly connections = new Map<string, AgentHl7ChannelConnection>();

  constructor(
    readonly app: App,
    readonly definition: AgentChannel,
    readonly endpoint: Endpoint
  ) {
    this.server = new Hl7Server((connection) => this.handleNewConnection(connection));
  }

  start(): void {
    const address = new URL(this.endpoint.address as string);
    this.app.log.info(`Channel starting on ${address}`);
    this.server.start(parseInt(address.port, 10));
    this.app.log.info('Channel started successfully');
  }

  stop(): void {
    this.app.log.info('Channel stopping...');
    this.connections.forEach((connection) => connection.close());
    this.server.stop();
    this.app.log.info('Channel stopped successfully');
  }

  private handleNewConnection(connection: Hl7Connection): void {
    const c = new AgentHl7ChannelConnection(this, connection);
    this.app.log.info(`HL7 connection established: ${c.remote}`);
    this.connections.set(c.remote, c);
  }
}

export class AgentHl7ChannelConnection {
  readonly remote: string;

  constructor(
    readonly channel: AgentHl7Channel,
    readonly hl7Connection: Hl7Connection
  ) {
    this.remote = `${hl7Connection.socket.remoteAddress}:${hl7Connection.socket.remotePort}`;

    // Add listener immediately to handle incoming messages
    this.hl7Connection.addEventListener('message', (event) => this.handler(event));
  }

  private async handler(event: Hl7MessageEvent): Promise<void> {
    try {
      this.channel.app.log.info('Received:');
      this.channel.app.log.info(event.message.toString().replaceAll('\r', '\n'));
      this.channel.app.addToWebSocketQueue({
        channel: this.channel.definition.name as string,
        remote: this.remote,
        body: event.message.toString(),
      });
    } catch (err) {
      this.channel.app.log.error(`HL7 error: ${normalizeErrorString(err)}`);
    }
  }

  close(): void {
    this.hl7Connection.close();
  }
}

if (typeof require !== 'undefined' && require.main === module) {
  if (process.argv.length < 6) {
    console.log('Usage: node medplum-agent.js <baseUrl> <clientId> <clientSecret> <agentId>');
    process.exit(1);
  }

  const [_node, _script, baseUrl, clientId, clientSecret, agentId] = process.argv;
  const medplum = new MedplumClient({ baseUrl, clientId });
  medplum
    .startClientLogin(clientId, clientSecret)
    .then(() => new App(medplum, agentId).start())
    .catch(console.error);
}
