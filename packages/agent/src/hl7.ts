import { AgentTransmitResponse, ContentType, Hl7Message, normalizeErrorString } from '@medplum/core';
import { AgentChannel, Endpoint } from '@medplum/fhirtypes';
import { Hl7Connection, Hl7MessageEvent, Hl7Server } from '@medplum/hl7';
import { App } from './app';
import { Channel } from './channel';

export class AgentHl7Channel implements Channel {
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

  sendToRemote(msg: AgentTransmitResponse): void {
    const connection = this.connections.get(msg.remote as string);
    if (connection) {
      connection.hl7Connection.send(Hl7Message.parse(msg.body));
    }
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
        type: 'agent:transmit:request',
        accessToken: await this.channel.app.getAccessToken(),
        channel: this.channel.definition.name as string,
        remote: this.remote,
        contentType: ContentType.HL7_V2,
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
