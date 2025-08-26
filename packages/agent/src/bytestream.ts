// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { AgentTransmitResponse, Logger, normalizeErrorString } from '@medplum/core';
import { AgentChannel, Endpoint } from '@medplum/fhirtypes';
import assert from 'node:assert';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import { App } from './app';
import { BaseChannel } from './channel';

export class AgentByteStreamChannel extends BaseChannel {
  readonly app: App;
  readonly server: net.Server;
  private started = false;
  readonly connections = new Map<string, ByteStreamChannelConnection>();
  readonly log: Logger;

  startChar = -1;
  endChar = -1;

  constructor(app: App, definition: AgentChannel, endpoint: Endpoint) {
    super(app, definition, endpoint);

    this.app = app;
    this.server = net.createServer((socket) => this.handleNewConnection(socket));

    // We can set the log prefix statically because we know this channel is keyed off of the name of the channel in the AgentChannel
    // So this channel's name will remain the same for the duration of its lifetime
    this.log = app.log.clone({ options: { prefix: `[Byte Stream:${definition.name}] ` } });
  }

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;

    const address = new URL(this.getEndpoint().address);
    this.log.info(`Channel starting on ${address}...`);
    this.configureTcpServerAndConnections();
    this.server.listen(Number.parseInt(address.port, 10));
    this.log.info('Channel started successfully');

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

  async reloadConfig(definition: AgentChannel, endpoint: Endpoint): Promise<void> {
    const previousEndpoint = this.endpoint;
    this.definition = definition;
    this.endpoint = endpoint;

    this.log.info('Reloading config... Evaluating if channel needs to change address...');

    if (this.needToRebindToPort(previousEndpoint, endpoint)) {
      await this.stop();
      this.start();
      this.log.info(`Address changed: ${previousEndpoint.address} => ${endpoint.address}`);
    } else if (previousEndpoint.address !== endpoint.address) {
      this.log.info(
        `Reconfiguring TCP server and ${this.connections.size} connections based on new endpoint settings: ${previousEndpoint.address} => ${endpoint.address}`
      );
      this.configureTcpServerAndConnections();
    } else {
      this.log.info(`No address change needed. Listening at ${endpoint.address}`);
    }
  }

  private needToRebindToPort(firstEndpoint: Endpoint, secondEndpoint: Endpoint): boolean {
    if (
      firstEndpoint.address === secondEndpoint.address ||
      new URL(firstEndpoint.address).port === new URL(secondEndpoint.address).port
    ) {
      return false;
    }
    return true;
  }

  private configureTcpServerAndConnections(): void {
    const address = new URL(this.getEndpoint().address as string);

    const startCharStr = address.searchParams.get('startChar');
    const endCharStr = address.searchParams.get('endChar');
    if (!(startCharStr && endCharStr)) {
      throw new Error(`Failed to parse startChar and/or endChar query param(s) from ${address}`);
    }

    assert(this.startChar !== -1 && this.endChar !== -1);

    // These should never eval to -1, but just in case we assert
    this.startChar = startCharStr.codePointAt(0) ?? -1;
    this.endChar = endCharStr.codePointAt(0) ?? -1;
  }

  sendToRemote(msg: AgentTransmitResponse): void {
    const connection = this.connections.get(msg.remote as string);
    if (connection) {
      connection.write(Buffer.from(msg.body, 'hex'));
    }
  }

  private handleNewConnection(socket: net.Socket): void {
    const c = new ByteStreamChannelConnection(this, socket);
    this.log.info(`Byte stream connection established: ${c.remote}`);
    this.connections.set(c.remote, c);
  }
}

export class ByteStreamChannelConnection {
  private msgChunks: Buffer[] = [];
  private msgTotalLength = -1; // -1 signals message start char has not yet been received
  readonly channel: AgentByteStreamChannel;
  readonly socket: net.Socket;
  readonly remote: string;

  constructor(channel: AgentByteStreamChannel, socket: net.Socket) {
    this.channel = channel;
    this.socket = socket;
    this.remote = `${socket.remoteAddress}:${socket.remotePort}`;

    // Add listener immediately to handle incoming messages
    this.socket.on('data', (data: Buffer) => this.handler(data));
  }

  private async handler(data: Buffer): Promise<void> {
    try {
      this.channel.log.info(`Received: ${data.toString('hex').replaceAll('\r', '\n')}`);

      let lastEndIndex = -1;

      for (let i = 0; i < data.length; i++) {
        const char = data[i];

        if (char === this.channel.startChar) {
          // Clear chunks when we hit a start character
          this.msgChunks.length = 0;
          this.msgTotalLength = 0;
        } else if (char === this.channel.endChar) {
          // If received end character but there's no start to the message, just continue
          if (this.msgTotalLength === -1) {
            continue;
          }
          // Slice from after the last end char (or beginning) to current position
          const startSlice = lastEndIndex + 1;
          const slice = data.subarray(startSlice, i + 1); // Include the end char

          this.msgChunks.push(slice);
          this.msgTotalLength += slice.length;

          // Create final buffer and transmit
          const messageBuffer = Buffer.concat(this.msgChunks, this.msgTotalLength);
          this.channel.app.addToWebSocketQueue({
            type: 'agent:transmit:request',
            accessToken: 'placeholder',
            channel: this.channel.getDefinition().name as string,
            remote: this.remote,
            contentType: 'application/octet-stream',
            body: messageBuffer.toString('hex'),
            callback: `Agent/${this.channel.app.agentId}-${randomUUID()}`,
          });

          // Reset for next message
          this.msgChunks.length = 0;
          lastEndIndex = i;
          this.msgTotalLength = -1;
        }
      }

      // After processing all bytes, handle any remaining data after the last end char
      if (lastEndIndex < data.length - 1) {
        const remainingSlice = data.subarray(lastEndIndex + 1);
        if (remainingSlice.length > 0) {
          this.msgChunks.push(remainingSlice);
          this.msgTotalLength += remainingSlice.length;
        }
      }
    } catch (err) {
      this.channel.log.error(`Byte stream error: ${normalizeErrorString(err)}`);
    }
  }

  write(data: Buffer): void {
    this.socket.write(data);
  }

  close(): void {
    this.socket.end();
  }
}
