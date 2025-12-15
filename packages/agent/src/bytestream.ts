// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { AgentTransmitResponse, ILogger } from '@medplum/core';
import { ContentType, normalizeErrorString } from '@medplum/core';
import type { AgentChannel, Endpoint } from '@medplum/fhirtypes';
import assert from 'node:assert';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import type { App } from './app';
import { BaseChannel } from './channel';

/**
 * Matches byte patterns in a streaming byte sequence and returns corresponding response buffers.
 * Uses a sliding window approach to efficiently match patterns as bytes stream in.
 */
class ByteSequenceMatcher {
  private readonly patterns: Array<{ pattern: Buffer; response: Buffer }> = [];
  private readonly buffer: number[] = [];
  private maxPatternLength = 0;

  /**
   * Register a pattern and its corresponding response.
   * @param pattern - The byte sequence to match
   * @param response - The byte sequence to return when pattern matches
   */
  addPattern(pattern: Buffer, response: Buffer): void {
    this.patterns.push({ pattern, response });
    this.maxPatternLength = Math.max(this.maxPatternLength, pattern.length);
  }

  /**
   * Process an incoming byte and check for pattern matches.
   * @param byte - The incoming byte (0-255)
   * @returns Array of response buffers for any patterns that matched, empty array if none
   */
  processByte(byte: number): Buffer[] {
    this.buffer.push(byte);

    // Keep buffer size limited to max pattern length
    if (this.buffer.length > this.maxPatternLength) {
      this.buffer.shift();
    }

    const matches: Buffer[] = [];

    // Check each pattern for a match ending at the current byte
    for (const { pattern, response } of this.patterns) {
      if (this.buffer.length < pattern.length) {
        continue;
      }

      // Check if the last N bytes match the pattern
      let match = true;
      for (let i = 0; i < pattern.length; i++) {
        if (this.buffer[this.buffer.length - pattern.length + i] !== pattern[i]) {
          match = false;
          break;
        }
      }

      if (match) {
        matches.push(response);
      }
    }

    return matches;
  }

  /**
   * Clear the internal buffer (e.g., when a start character is detected).
   */
  reset(): void {
    this.buffer.length = 0;
  }
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
  sequenceMappings: ByteSequenceMatcher = new ByteSequenceMatcher();

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

  private configureTcpServerAndConnections(): void {
    const address = new URL(this.getEndpoint().address);

    const startCharStr = address.searchParams.get('startChar');
    const endCharStr = address.searchParams.get('endChar');
    if (!(startCharStr && endCharStr)) {
      throw new Error(`Failed to parse startChar and/or endChar query param(s) from ${address}`);
    }

    this.startChar = startCharStr.codePointAt(0) ?? -1;
    this.endChar = endCharStr.codePointAt(0) ?? -1;

    // These should never eval to -1, but just in case we assert
    assert(this.startChar !== -1 && this.endChar !== -1);

    // Parse byte sequence mappings from extensions
    this.parseSequenceMappings();
  }

  /**
   * Parse byte sequence mappings from Endpoint extensions.
   * Looks for extensions with URL: https://medplum.com/fhir/StructureDefinition/endpoint-bytestream-sequence-mappings
   * Each extension should have nested extensions for "pattern" and "response" with URL-encoded byte sequences.
   */
  private parseSequenceMappings(): void {
    const endpoint = this.getEndpoint();
    const extensionUrl = 'https://medplum.com/fhir/StructureDefinition/endpoint-bytestream-sequence-mappings';

    // Reset matcher
    this.sequenceMappings = new ByteSequenceMatcher();

    if (!endpoint.extension) {
      return;
    }

    // Find all extensions with the mapping URL
    for (const ext of endpoint.extension) {
      if (ext.url !== extensionUrl || !ext.extension) {
        continue;
      }

      // Extract pattern and response from nested extensions
      let patternStr: string | undefined;
      let responseStr: string | undefined;

      for (const nestedExt of ext.extension) {
        if (nestedExt.url === 'pattern' && nestedExt.valueString) {
          patternStr = nestedExt.valueString;
        } else if (nestedExt.url === 'response' && nestedExt.valueString) {
          responseStr = nestedExt.valueString;
        }
      }

      if (patternStr && responseStr) {
        try {
          const pattern = this.parseUrlEncodedBytes(patternStr);
          const response = this.parseUrlEncodedBytes(responseStr);
          this.sequenceMappings.addPattern(pattern, response);
          this.log.debug(`Registered byte sequence mapping: pattern=${patternStr}, response=${responseStr}`);
        } catch (err) {
          this.log.warn(`Failed to parse byte sequence mapping: ${normalizeErrorString(err)}`);
        }
      }
    }
  }

  /**
   * Parse URL percent-encoded byte sequence string into a Buffer.
   * @param encoded - URL-encoded string (e.g., "%05%06")
   * @returns Buffer containing the decoded bytes
   */
  private parseUrlEncodedBytes(encoded: string): Buffer {
    const bytes: number[] = [];
    let i = 0;

    while (i < encoded.length) {
      if (encoded[i] === '%' && i + 2 < encoded.length) {
        // Parse %HH sequence
        const hex = encoded.substring(i + 1, i + 3);
        const byte = Number.parseInt(hex, 16);
        if (Number.isNaN(byte)) {
          throw new Error(`Invalid hex sequence in URL-encoded byte sequence: ${hex}`);
        }
        bytes.push(byte);
        i += 3;
      } else {
        // Regular character - convert to byte
        bytes.push(encoded.charCodeAt(i));
        i += 1;
      }
    }

    return Buffer.from(bytes);
  }

  sendToRemote(msg: AgentTransmitResponse): void {
    const connection = this.connections.get(msg.remote);
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

        // Check for byte sequence matches and inject responses immediately
        const matches = this.channel.sequenceMappings.processByte(char);
        for (const response of matches) {
          this.channel.channelLog.debug(`Pattern matched, injecting response: ${response.toString('hex')}`);
          this.write(response);
        }

        if (char === this.channel.startChar) {
          // Clear chunks when we hit a start character
          this.msgChunks.length = 0;
          this.msgTotalLength = 0;
          // Reset matcher on start character
          this.channel.sequenceMappings.reset();
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
