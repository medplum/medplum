import { AgentTransmitResponse, Logger, normalizeErrorString } from '@medplum/core';
import { AgentChannel, Endpoint } from '@medplum/fhirtypes';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import { App } from './app';
import { BaseChannel } from './channel';

export class AgentSerialChannel extends BaseChannel {
  readonly server: net.Server;
  private started = false;
  readonly connections = new Map<string, SerialChannelConnection>();
  readonly log: Logger;

  constructor(
    readonly app: App,
    definition: AgentChannel,
    endpoint: Endpoint
  ) {
    super(app, definition, endpoint);

    this.server = net.createServer((socket) => this.handleNewConnection(socket));

    // We can set the log prefix statically because we know this channel is keyed off of the name of the channel in the AgentChannel
    // So this channel's name will remain the same for the duration of its lifetime
    this.log = app.log.clone({ options: { prefix: `[Serial:${definition.name}] ` } });
  }

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    const address = new URL(this.getEndpoint().address as string);
    this.log.info(`Channel starting on ${address}...`);
    this.server.listen(Number.parseInt(address.port, 10));
    this.log.info('Channel started successfully');
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return;
    }
    this.log.info('Channel stopping...');
    for (const [_, connection] of this.connections) {
      connection.close();
    }
    await new Promise<void>((resolve, reject) => {
      this.server.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
    this.started = false;
    this.log.info('Channel stopped successfully');
  }

  sendToRemote(msg: AgentTransmitResponse): void {
    const connection = this.connections.get(msg.remote as string);
    if (connection) {
      connection.write(Buffer.from(msg.body, 'hex'));
    }
  }

  private handleNewConnection(socket: net.Socket): void {
    const c = new SerialChannelConnection(this, socket);
    this.log.info(`Serial connection established: ${c.remote}`);
    this.connections.set(c.remote, c);
  }
}

export class SerialChannelConnection {
  readonly remote: string;

  constructor(
    readonly channel: AgentSerialChannel,
    readonly socket: net.Socket
  ) {
    this.remote = `${socket.remoteAddress}:${socket.remotePort}`;

    // Add listener immediately to handle incoming messages
    this.socket.on('data', (data: Buffer) => this.handler(data));
  }

  private async handler(data: Buffer): Promise<void> {
    try {
      this.channel.log.info(`Received: ${data.toString('hex').replaceAll('\r', '\n')}`);
      this.channel.app.addToWebSocketQueue({
        type: 'agent:transmit:request',
        accessToken: 'placeholder',
        channel: this.channel.getDefinition().name as string,
        remote: this.remote,
        contentType: 'application/octet-stream',
        body: data.toString('hex'),
        callback: `Agent/${this.channel.app.agentId}-${randomUUID()}`,
      });
    } catch (err) {
      this.channel.log.error(`Serial error: ${normalizeErrorString(err)}`);
    }
  }

  write(data: Buffer): void {
    this.socket.write(data);
  }

  close(): void {
    this.socket.end();
  }
}
