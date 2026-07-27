// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { AgentTransmitResponse, ILogger } from '@medplum/core';
import { ContentType, normalizeErrorString } from '@medplum/core';
import type { AgentChannel, Endpoint } from '@medplum/fhirtypes';
import assert from 'node:assert';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import type { App } from './app';
import type { ChannelConfigIssue } from './channel';
import { BaseChannel } from './channel';

/**
 * Reads the `startChar` / `endChar` framing characters a byte-stream channel needs to
 * delimit messages on the wire.
 *
 * Shared by {@link AgentByteStreamChannel.validateConfig} and the runtime configure path so
 * validation cannot disagree with what the channel actually accepts.
 *
 * @param address - The parsed endpoint address.
 * @returns The framing characters, as code points.
 */
function parseFrameChars(address: URL): { startChar: number; endChar: number } {
  const startCharStr = address.searchParams.get('startChar');
  const endCharStr = address.searchParams.get('endChar');
  if (!(startCharStr && endCharStr)) {
    throw new Error(`Failed to parse startChar and/or endChar query param(s) from ${address}`);
  }

  const startChar = startCharStr.codePointAt(0) ?? -1;
  const endChar = endCharStr.codePointAt(0) ?? -1;

  // These should never eval to -1, but just in case we assert
  assert(startChar !== -1 && endChar !== -1);

  return { startChar, endChar };
}

export class AgentByteStreamChannel extends BaseChannel {
  readonly app: App;
  readonly server: net.Server;
  private started = false;
  readonly connections = new Map<string, ByteStreamChannelConnection>();
  readonly log: ILogger;
  readonly channelLog: ILogger;

  startChar = -1;
  endChar = -1;

  constructor(app: App, definition: AgentChannel, endpoint: Endpoint) {
    super(app, definition, endpoint);

    this.app = app;
    this.server = net.createServer((socket) => this.handleNewConnection(socket));

    // We can set the log prefix statically because we know this channel is keyed off of the name of the channel in the AgentChannel
    // So this channel's name will remain the same for the duration of its lifetime
    this.log = app.log.clone({ options: { prefix: `[Byte Stream:${definition.name}] ` } });
    this.channelLog = app.channelLog.clone({ options: { prefix: `[Byte Stream:${definition.name}] ` } });
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }
    this.started = true;

    const address = new URL(this.getEndpoint().address);
    this.log.info(`Channel starting on ${address}...`);
    this.configureTcpServerAndConnections();

    await new Promise<void>((resolve) => {
      this.server.listen(Number.parseInt(address.port, 10), resolve);
    });

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
      await this.start();
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

  /**
   * Validates that the endpoint carries the framing characters this channel cannot run without.
   *
   * These used to be checked at `start()` / `reloadConfig()` time, which meant a config missing
   * them was already half-applied by the time it failed. Checking here, against the same parser
   * the runtime path uses, means that config is rejected before anything is touched.
   *
   * @param definition - The channel definition from the agent config.
   * @param endpoint - The resolved endpoint; its address is guaranteed parseable.
   * @returns Every issue found; empty when the config is valid.
   */
  static validateConfig(definition: AgentChannel, endpoint: Endpoint): ChannelConfigIssue[] {
    try {
      parseFrameChars(new URL(endpoint.address));
    } catch (err) {
      return [
        {
          severity: 'error',
          code: 'invalid-frame-chars',
          channel: definition.name,
          field: 'endpoint.address',
          message: normalizeErrorString(err),
        },
      ];
    }
    return [];
  }

  private configureTcpServerAndConnections(): void {
    // Unreachable with an invalid address: AgentByteStreamChannel.validateConfig rejects the
    // config before it reaches a live channel. Kept as a guard for direct construction.
    const { startChar, endChar } = parseFrameChars(new URL(this.getEndpoint().address));
    this.startChar = startChar;
    this.endChar = endChar;
  }

  sendToRemote(msg: AgentTransmitResponse): boolean {
    const connection = this.connections.get(msg.remote);
    if (!connection) {
      return false;
    }
    connection.write(Buffer.from(msg.body, 'hex'));
    return true;
  }

  private handleNewConnection(socket: net.Socket): void {
    const c = new ByteStreamChannelConnection(this, socket);
    this.log.info(`Byte stream connection established: ${c.remote}`);
    this.connections.set(c.remote, c);
  }
}

export class ByteStreamChannelConnection {
  private readonly msgChunks: Buffer[] = [];
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
      this.channel.channelLog.info(`Received: ${data.toString('hex').replaceAll('\r', '\n')}`);

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
            channel: this.channel.getDefinition().name,
            remote: this.remote,
            contentType: ContentType.OCTET_STREAM,
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
      this.channel.log.error(`Byte stream error occurred - check channel logs`);
      this.channel.channelLog.error(`Byte stream error: ${normalizeErrorString(err)}`);
    }
  }

  write(data: Buffer): void {
    this.socket.write(data);
  }

  close(): void {
    this.socket.end();
  }
}
