import { AgentTransmitResponse, ContentType, Hl7Message, Logger, normalizeErrorString } from '@medplum/core';
import { AgentChannel, Endpoint } from '@medplum/fhirtypes';
import { Hl7Connection, Hl7ErrorEvent, Hl7MessageEvent, Hl7Server } from '@medplum/hl7';
import { randomUUID } from 'node:crypto';
import { App } from './app';
import { BaseChannel } from './channel';
import { getCurrentStats, updateStat } from './stats';

export class AgentHl7Channel extends BaseChannel {
  readonly server: Hl7Server;
  private started = false;
  readonly connections = new Map<string, AgentHl7ChannelConnection>();
  readonly log: Logger;

  constructor(app: App, definition: AgentChannel, endpoint: Endpoint) {
    super(app, definition, endpoint);

    this.server = new Hl7Server((connection) => this.handleNewConnection(connection));

    // We can set the log prefix statically because we know this channel is keyed off of the name of the channel in the AgentChannel
    // So this channel's name will remain the same for the duration of its lifetime
    this.log = app.log.clone({ options: { prefix: `[HL7:${definition.name}] ` } });
  }

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    const address = new URL(this.getEndpoint().address as string);
    const encoding = address.searchParams.get('encoding') ?? undefined;
    const enhancedMode = address.searchParams.get('enhanced')?.toLowerCase() === 'true';
    this.log.info(`Channel starting on ${address}...`);
    this.server.start(Number.parseInt(address.port, 10), encoding, enhancedMode);
    this.log.info('Channel started successfully');
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return;
    }
    this.log.info('Channel stopping...');
    this.connections.forEach((connection) => connection.close());
    await this.server.stop();
    this.started = false;
    this.log.info('Channel stopped successfully');
  }

  sendToRemote(msg: AgentTransmitResponse): void {
    const connection = this.connections.get(msg.remote as string);
    if (connection) {
      connection.hl7Connection.send(Hl7Message.parse(msg.body));
    } else {
      this.log.warn(`Attempted to send message to disconnected remote: ${msg.remote}`);
    }
  }

  private handleNewConnection(connection: Hl7Connection): void {
    const c = new AgentHl7ChannelConnection(this, connection);
    updateStat('hl7ConnectionsOpen', getCurrentStats().hl7ConnectionsOpen + 1);
    c.hl7Connection.addEventListener('close', () => {
      this.log.info(`Closing connection: ${c.remote}`);
      this.connections.delete(c.remote);
      updateStat('hl7ConnectionsOpen', getCurrentStats().hl7ConnectionsOpen - 1);
    });
    this.log.info(`HL7 connection established: ${c.remote}`);
    this.connections.set(c.remote, c);
  }
}

export class AgentHl7ChannelConnection {
  readonly channel: AgentHl7Channel;
  readonly hl7Connection: Hl7Connection;
  readonly remote: string;

  constructor(channel: AgentHl7Channel, hl7Connection: Hl7Connection) {
    this.channel = channel;
    this.hl7Connection = hl7Connection;
    this.remote = `${hl7Connection.socket.remoteAddress}:${hl7Connection.socket.remotePort}`;

    // Add listener immediately to handle incoming messages
    this.hl7Connection.addEventListener('message', (event) => this.handleMessage(event));
    this.hl7Connection.addEventListener('error', (event) => this.handleError(event));
  }

  private async handleMessage(event: Hl7MessageEvent): Promise<void> {
    try {
      this.channel.log.info(`Received: ${event.message.toString().replaceAll('\r', '\n')}`);
      this.channel.app.addToWebSocketQueue({
        type: 'agent:transmit:request',
        accessToken: 'placeholder',
        channel: this.channel.getDefinition().name as string,
        remote: this.remote,
        contentType: ContentType.HL7_V2,
        body: event.message.toString(),
        callback: `Agent/${this.channel.app.agentId}-${randomUUID()}`,
      });
    } catch (err) {
      this.channel.log.error(`HL7 error: ${normalizeErrorString(err)}`);
    }
  }

  private async handleError(event: Hl7ErrorEvent): Promise<void> {
    this.channel.log.error(`HL7 connection error: ${normalizeErrorString(event.error)}`);
  }

  close(): void {
    this.hl7Connection.close();
  }
}
