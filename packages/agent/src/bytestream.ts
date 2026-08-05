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

/** Encodings available for the `body` of a byte-stream channel's transmit request/response. */
export type ByteStreamBodyEncoding = 'hex' | 'utf-8';

/** A byte sequence to watch for on the wire, and the reply written back once it completes. */
export type ByteSequenceRule = { readonly pattern: Buffer; readonly response: Buffer };

/**
 * A byte-stream channel's fully-parsed endpoint settings.
 *
 * Immutable, and rebuilt only on start and on an endpoint address change, so one instance is
 * shared read-only across every connection. Per-stream matching state lives outside it, in
 * {@link ByteSequenceMatcher}.
 */
export type ByteStreamConfig = {
  readonly startChar: number;
  readonly endChar: number;
  readonly autoRespond: readonly ByteSequenceRule[];
  readonly stripSequences: readonly Buffer[];
  readonly stripControlChars: boolean;
  readonly bodyEncoding: ByteStreamBodyEncoding;
};

/**
 * Decodes one `%XX`-style byte sequence param value into raw bytes.
 *
 * `URLSearchParams` percent-decodes before we see the value, so this reads code points
 * exactly as `startChar`/`endChar` do. That decoding is UTF-8, so a byte >= 0x80 has to be
 * written as its UTF-8 encoding (`%C3%A9` for 0xE9); a bare `%E9` is invalid UTF-8 and
 * arrives as U+FFFD, which the range check below rejects rather than silently corrupting.
 *
 * @param decoded - The already-decoded value, e.g. '\x05\x15'.
 * @param label - Param name, used in warnings.
 * @param logger - Logger used to warn about values that are dropped.
 * @returns The bytes, or undefined if the value was empty or not byte-representable.
 */
function parseByteSequence(decoded: string, label: string, logger: ILogger): Buffer | undefined {
  if (!decoded) {
    logger.warn(`Invalid ${label}: empty byte sequence. Ignoring.`);
    return undefined;
  }

  const bytes: number[] = [];
  for (const char of decoded) {
    const codePoint = char.codePointAt(0);
    if (codePoint === undefined || codePoint > 0xff) {
      logger.warn(
        `Invalid ${label} ${JSON.stringify(decoded)}: not a byte sequence. ` +
          `Write bytes >= 0x80 as their UTF-8 encoding, e.g. %C3%A9 for 0xE9. Ignoring.`
      );
      return undefined;
    }
    bytes.push(codePoint);
  }
  return Buffer.from(bytes);
}

/**
 * Renders bytes in the `%XX` form used to configure them, for log messages.
 * @param bytes - The bytes to render.
 * @returns The `%XX` form, e.g. '%05%15'.
 */
function formatByteSequence(bytes: Buffer): string {
  let formatted = '';
  for (const byte of bytes) {
    formatted += `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
  }
  return formatted;
}

/**
 * Parses the repeatable `autoRespond=<pattern>:<response>` params into match rules.
 *
 * The `:` is structural and is consumed after percent-decoding, so a 0x3A byte cannot appear
 * in a pattern or response. In practice these are link-level handshakes built from C0 control
 * bytes (ENQ/ACK/NAK/EOT), well below 0x20.
 *
 * @param rawValues - Every `autoRespond` value, already percent-decoded.
 * @param logger - Logger used to warn about entries that are dropped.
 * @returns The valid rules in declaration order; invalid and duplicate entries are skipped.
 */
export function parseAutoRespondRules(rawValues: readonly string[], logger: ILogger): ByteSequenceRule[] {
  const rules: ByteSequenceRule[] = [];

  for (const rawValue of rawValues) {
    const separator = rawValue.indexOf(':');
    if (separator === -1) {
      logger.warn(`Invalid autoRespond ${JSON.stringify(rawValue)}; expected '<pattern>:<response>'. Ignoring.`);
      continue;
    }

    const pattern = parseByteSequence(rawValue.slice(0, separator), 'autoRespond pattern', logger);
    const response = parseByteSequence(rawValue.slice(separator + 1), 'autoRespond response', logger);
    if (!pattern || !response) {
      continue;
    }

    if (rules.some((rule) => rule.pattern.equals(pattern))) {
      logger.warn(`Duplicate autoRespond pattern ${formatByteSequence(pattern)}; keeping the first.`);
      continue;
    }
    rules.push({ pattern, response });
  }

  return rules;
}

/**
 * Parses a repeatable `%XX`-style byte sequence param into raw byte sequences.
 *
 * @param rawValues - Every value for the param, already percent-decoded.
 * @param label - Param name, used in warnings.
 * @param logger - Logger used to warn about values that are dropped.
 * @returns The valid sequences, deduplicated, in declaration order.
 */
export function parseByteSequences(rawValues: readonly string[], label: string, logger: ILogger): Buffer[] {
  const sequences: Buffer[] = [];

  for (const rawValue of rawValues) {
    const sequence = parseByteSequence(rawValue, label, logger);
    if (sequence && !sequences.some((existing) => existing.equals(sequence))) {
      sequences.push(sequence);
    }
  }

  return sequences;
}

/**
 * Normalizes the configured transmit body encoding.
 *
 * Defaults to `hex`, which is the encoding byte-stream channels have always used, so bots
 * decoding with `Buffer.from(body, 'hex')` keep working unless a channel opts out.
 *
 * @param rawValue - The raw `bodyEncoding` query param value.
 * @param logger - Logger used to warn about an unrecognized value.
 * @returns The parsed encoding, or `hex` if unset or invalid.
 */
export function parseBodyEncoding(rawValue: string | null | undefined, logger: ILogger): ByteStreamBodyEncoding {
  if (!rawValue) {
    return 'hex';
  }

  const normalizedValue = rawValue.toLowerCase();
  if (normalizedValue === 'hex') {
    return 'hex';
  }
  if (normalizedValue === 'utf-8' || normalizedValue === 'utf8') {
    return 'utf-8';
  }

  logger.warn(`Invalid bodyEncoding '${rawValue}'; expected 'hex' or 'utf-8'. Using 'hex'.`);
  return 'hex';
}

/**
 * @param window - The most recent bytes of the stream, oldest first.
 * @param pattern - The sequence to look for at the end of `window`.
 * @returns True when the last `pattern.length` entries of `window` equal `pattern`.
 */
function endsWith(window: readonly number[], pattern: Buffer): boolean {
  if (window.length < pattern.length) {
    return false;
  }
  const offset = window.length - pattern.length;
  for (let i = 0; i < pattern.length; i++) {
    if (window[offset + i] !== pattern[i]) {
      return false;
    }
  }
  return true;
}

/**
 * Sliding-window matcher for {@link ByteSequenceRule} patterns over a single byte stream.
 *
 * Rules are shared read-only; the window is not, so there is one matcher per
 * {@link ByteStreamChannelConnection}. A channel-wide instance would let concurrent
 * connections interleave into one window — one socket's bytes completing another's pattern,
 * and either socket's reset discarding the other's progress.
 */
export class ByteSequenceMatcher {
  private readonly rules: readonly ByteSequenceRule[];
  private readonly window: number[] = [];
  private readonly windowSize: number;

  constructor(rules: readonly ByteSequenceRule[]) {
    this.rules = rules;
    this.windowSize = rules.reduce((longest, rule) => Math.max(longest, rule.pattern.length), 0);
  }

  /**
   * Feeds the next byte of the stream to the matcher.
   * @param byte - The byte to match against.
   * @returns Responses for every rule whose pattern completes at `byte`, in rule order.
   */
  match(byte: number): Buffer[] {
    if (this.windowSize === 0) {
      return [];
    }

    this.window.push(byte);
    if (this.window.length > this.windowSize) {
      this.window.shift();
    }

    const responses: Buffer[] = [];
    for (const { pattern, response } of this.rules) {
      if (endsWith(this.window, pattern)) {
        responses.push(response);
      }
    }
    return responses;
  }

  /** Discards partial progress, e.g. when message framing restarts at a start char. */
  reset(): void {
    this.window.length = 0;
  }
}

/**
 * Removes configured byte sequences from an assembled message body.
 *
 * Whole occurrences are removed, so a multi-byte sequence never leaves its leading bytes
 * behind. The longest sequence wins where several could match at one offset, and the scan
 * resumes past a match so sequences cannot match inside one another.
 *
 * @param buffer - The assembled message, framing chars included.
 * @param sequences - Sequences to remove.
 * @param stripControlChars - Also drop every remaining C0 control byte (0x00-0x1F), framing
 * chars included — a channel wanting them preserved should leave this off.
 * @returns The filtered bytes, or `buffer` itself when there is nothing to filter.
 */
export function filterMessageBytes(buffer: Buffer, sequences: readonly Buffer[], stripControlChars: boolean): Buffer {
  if (sequences.length === 0 && !stripControlChars) {
    return buffer;
  }

  const longestFirst = [...sequences].sort((a, b) => b.length - a.length);
  const filtered = Buffer.allocUnsafe(buffer.length);
  let written = 0;
  let i = 0;

  while (i < buffer.length) {
    let matchedLength = 0;
    for (const sequence of longestFirst) {
      // A short tail makes subarray shorter than the sequence, so equals() correctly fails.
      if (buffer.subarray(i, i + sequence.length).equals(sequence)) {
        matchedLength = sequence.length;
        break;
      }
    }

    if (matchedLength > 0) {
      i += matchedLength;
      continue;
    }

    const byte = buffer[i];
    if (!(stripControlChars && byte < 0x20)) {
      filtered[written] = byte;
      written++;
    }
    i++;
  }

  return filtered.subarray(0, written);
}

export class AgentByteStreamChannel extends BaseChannel {
  readonly app: App;
  readonly server: net.Server;
  private started = false;
  readonly connections = new Map<string, ByteStreamChannelConnection>();
  readonly log: ILogger;
  readonly channelLog: ILogger;

  private config: ByteStreamConfig = {
    startChar: -1,
    endChar: -1,
    autoRespond: [],
    stripSequences: [],
    stripControlChars: false,
    bodyEncoding: 'hex',
  };

  constructor(app: App, definition: AgentChannel, endpoint: Endpoint) {
    super(app, definition, endpoint);

    this.app = app;
    this.server = net.createServer((socket) => this.handleNewConnection(socket));

    // We can set the log prefix statically because we know this channel is keyed off of the name of the channel in the AgentChannel
    // So this channel's name will remain the same for the duration of its lifetime
    this.log = app.log.clone({ options: { prefix: `[Byte Stream:${definition.name}] ` } });
    this.channelLog = app.channelLog.clone({ options: { prefix: `[Byte Stream:${definition.name}] ` } });
  }

  /** @returns The channel's parsed endpoint settings. Shared read-only with its connections. */
  getConfig(): ByteStreamConfig {
    return this.config;
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
    const params = address.searchParams;

    const startCharStr = params.get('startChar');
    const endCharStr = params.get('endChar');
    if (!(startCharStr && endCharStr)) {
      throw new Error(`Failed to parse startChar and/or endChar query param(s) from ${address}`);
    }

    const startChar = startCharStr.codePointAt(0) ?? -1;
    const endChar = endCharStr.codePointAt(0) ?? -1;

    // These should never eval to -1, but just in case we assert
    assert(startChar !== -1 && endChar !== -1);

    // Every setting is read from the address string, so reloadConfig's address comparison is
    // enough to pick up any of them — there is no separate settings source to refresh.
    this.config = Object.freeze({
      startChar,
      endChar,
      autoRespond: parseAutoRespondRules(params.getAll('autoRespond'), this.log),
      stripSequences: parseByteSequences(params.getAll('stripSequence'), 'stripSequence', this.log),
      stripControlChars: params.get('stripControlChars')?.toLowerCase() === 'true',
      bodyEncoding: parseBodyEncoding(params.get('bodyEncoding'), this.log),
    });

    for (const connection of this.connections.values()) {
      connection.applyConfig(this.config);
    }
  }

  sendToRemote(msg: AgentTransmitResponse): boolean {
    const connection = this.connections.get(msg.remote);
    if (!connection) {
      return false;
    }
    connection.write(Buffer.from(msg.body, this.config.bodyEncoding));
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
  private matcher: ByteSequenceMatcher;
  readonly channel: AgentByteStreamChannel;
  readonly socket: net.Socket;
  readonly remote: string;

  constructor(channel: AgentByteStreamChannel, socket: net.Socket) {
    this.channel = channel;
    this.socket = socket;
    this.remote = `${socket.remoteAddress}:${socket.remotePort}`;
    this.matcher = new ByteSequenceMatcher(channel.getConfig().autoRespond);

    // Add listener immediately to handle incoming messages
    this.socket.on('data', (data: Buffer) => this.handler(data));
  }

  /**
   * Rebinds this connection to reloaded channel settings.
   *
   * Partial pattern progress is dropped along with the rules that were being matched, since
   * a half-matched old rule says nothing about the new ones.
   *
   * @param config - The channel's newly parsed settings.
   */
  applyConfig(config: ByteStreamConfig): void {
    this.matcher = new ByteSequenceMatcher(config.autoRespond);
  }

  private async handler(data: Buffer): Promise<void> {
    try {
      const config = this.channel.getConfig();
      this.channel.channelLog.info(`Received ${data.length} byte(s): ${data.toString('hex')}`);

      let lastEndIndex = -1;

      for (let i = 0; i < data.length; i++) {
        const char = data[i];

        // Auto-responses are a link-level handshake, answered the moment their pattern
        // completes — before framing, and between framed messages as readily as inside one.
        for (const response of this.matcher.match(char)) {
          this.channel.channelLog.debug(`Auto-responding ${formatByteSequence(response)}`);
          this.write(response);
        }

        if (char === config.startChar) {
          // Clear chunks when we hit a start character
          this.msgChunks.length = 0;
          this.msgTotalLength = 0;
          // A restarted frame means any partial match belonged to bytes we just discarded
          this.matcher.reset();
        } else if (char === config.endChar) {
          // If received end character but there's no start to the message, just continue
          if (this.msgTotalLength === -1) {
            continue;
          }
          // Slice from after the last end char (or beginning) to current position
          const startSlice = lastEndIndex + 1;
          const slice = data.subarray(startSlice, i + 1); // Include the end char

          this.msgChunks.push(slice);
          this.msgTotalLength += slice.length;

          const messageBuffer = Buffer.concat(this.msgChunks, this.msgTotalLength);
          const body = filterMessageBytes(messageBuffer, config.stripSequences, config.stripControlChars);
          if (body.length !== messageBuffer.length) {
            this.channel.channelLog.debug(`Filtered ${messageBuffer.length - body.length} byte(s) from message body`);
          }

          this.channel.app.addToWebSocketQueue({
            type: 'agent:transmit:request',
            accessToken: 'placeholder',
            channel: this.channel.getDefinition().name,
            remote: this.remote,
            contentType: ContentType.OCTET_STREAM,
            body: body.toString(config.bodyEncoding),
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
