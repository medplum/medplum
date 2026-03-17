// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { AgentTransmitResponse, ILogger } from '@medplum/core';
import { Hl7Message, normalizeErrorString } from '@medplum/core';
import type { AgentChannel, Endpoint } from '@medplum/fhirtypes';
import type {
  EnhancedMode,
  Hl7Connection,
  Hl7EnhancedAckSentEvent,
  Hl7ErrorEvent,
  Hl7MessageEvent,
} from '@medplum/hl7';
import { Hl7Server } from '@medplum/hl7';
import { randomUUID } from 'node:crypto';
import type { App } from './app';
import { BaseChannel } from './channel';
import { ChannelStatsTracker } from './channel-stats-tracker';
import { getCurrentStats, updateStat } from './stats';

/**
 * Valid values for the appLevelAck query parameter.
 * Based on MSH-16 (Application Acknowledgment Type) in the HL7v2 specification.
 * @see https://hl7-definition.caristix.com/v2/HL7v2.3/Fields/MSH-16
 * @see https://hl7-definition.caristix.com/v2/HL7v2.3/Tables/0155
 */
export const APP_LEVEL_ACK_MODES = ['AL', 'ER', 'NE', 'SU'] as const;
export type AppLevelAckMode = (typeof APP_LEVEL_ACK_MODES)[number];
export const APP_LEVEL_ACK_CODES = ['AA', 'AE', 'AR'] as const;
export type AppLevelAckCode = (typeof APP_LEVEL_ACK_CODES)[number];

export interface ShouldSendAppLevelAckOptions {
  mode: AppLevelAckMode;
  ackCode: AppLevelAckCode;
  enhancedMode: EnhancedMode;
}

export class AgentHl7Channel extends BaseChannel {
  readonly server: Hl7Server;
  private started = false;
  readonly connections = new Map<string, AgentHl7ChannelConnection>();
  readonly log: ILogger;
  readonly channelLog: ILogger;
  private prefix: string;
  stats?: ChannelStatsTracker;
  private appLevelAckMode: AppLevelAckMode = 'AL'; // Default app level ack mode is AL (Always)
  private assignSeqNo: boolean = false;
  private lastSeqNo = -1;

  constructor(app: App, definition: AgentChannel, endpoint: Endpoint) {
    super(app, definition, endpoint);

    this.server = new Hl7Server((connection: Hl7Connection) => this.handleNewConnection(connection));

    // We can set the log prefix statically because we know this channel is keyed off of the name of the channel in the AgentChannel
    // So this channel's name will remain the same for the duration of its lifetime
    this.prefix = `[HL7:${definition.name}] `;
    this.log = app.log.clone({ options: { prefix: this.prefix } });
    this.channelLog = app.channelLog.clone({ options: { prefix: this.prefix } });
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }
    this.started = true;

    const address = new URL(this.getEndpoint().address);
    this.log.info(`Channel starting on ${address}...`);
    this.configureStatsTracker();
    this.configureHl7ServerAndConnections();
    await this.server.start(Number.parseInt(address.port, 10));
    this.log.info('Channel started successfully');
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return;
    }
    this.log.info('Channel stopping...');
    await Promise.allSettled(Array.from(this.connections.values()).map((connection) => connection.close()));
    await this.server.stop();
    this.stats?.cleanup();
    this.started = false;
    this.log.info('Channel stopped successfully');
  }

  shouldAssignSeqNo(): boolean {
    return this.assignSeqNo;
  }

  takeNextSeqNo(): number {
    return ++this.lastSeqNo;
  }

  sendToRemote(msg: AgentTransmitResponse): void {
    const connection = this.connections.get(msg.remote);
    if (connection) {
      const hl7Message = Hl7Message.parse(msg.body);
      const msgControlId = hl7Message.getSegment('MSA')?.getField(2)?.toString();
      const ackCode = hl7Message.getSegment('MSA')?.getField(1)?.toString()?.toUpperCase();

      if (
        ackCode &&
        isAppLevelAckCode(ackCode) &&
        !shouldSendAppLevelAck({
          mode: this.appLevelAckMode,
          ackCode,
          enhancedMode: this.server.getEnhancedMode(),
        })
      ) {
        this.channelLog.debug(
          `[Skipping ACK -- Mode: ${this.appLevelAckMode} -- ID: ${msgControlId ?? 'not provided'} -- ACK: ${
            ackCode ?? 'unknown'
          }]`
        );
        return;
      }

      this.channelLog.info(`[Sending ACK -- ID: ${msgControlId}]: ${hl7Message.toString().replaceAll('\r', '\n')}`);
      connection.hl7Connection.send(Hl7Message.parse(msg.body));

      if (msgControlId) {
        this.stats?.recordAckReceived(msgControlId);
      }
    } else {
      this.log.warn(`Attempted to send message to disconnected remote: ${msg.remote}`);
    }
  }

  async reloadConfig(definition: AgentChannel, endpoint: Endpoint): Promise<void> {
    const previousEndpoint = this.endpoint;
    this.definition = definition;
    this.endpoint = endpoint;
    this.prefix = `[HL7:${definition.name}] `;

    this.log.info('Reloading config... Evaluating if channel needs to change address...');

    this.configureStatsTracker();

    if (this.needToRebindToPort(previousEndpoint, endpoint)) {
      await this.stop();
      await this.start();
      this.log.info(`Address changed: ${previousEndpoint.address} => ${endpoint.address}`);
    } else if (previousEndpoint.address !== endpoint.address) {
      this.log.info(
        `Reconfiguring HL7 server and ${this.connections.size} connections based on new endpoint settings: ${previousEndpoint.address} => ${endpoint.address}`
      );
      this.configureHl7ServerAndConnections();
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

  private configureStatsTracker(): void {
    const logStatsFreqSecs =
      this.app.getAgentConfig()?.setting?.find((setting) => setting.name === 'logStatsFreqSecs')?.valueInteger ?? -1;

    if (logStatsFreqSecs > 0 && !this.stats) {
      this.stats = new ChannelStatsTracker({ heartbeatEmitter: this.app.heartbeatEmitter, log: this.log });
    } else if (logStatsFreqSecs <= 0 && this.stats) {
      this.stats.cleanup();
      this.stats = undefined;
    }
  }

  private configureHl7ServerAndConnections(): void {
    const address = new URL(this.getEndpoint().address);
    const encoding = address.searchParams.get('encoding') ?? undefined;
    const enhancedMode = parseEnhancedMode(address.searchParams.get('enhanced'), this.log);
    const assignSeqNo = address.searchParams.get('assignSeqNo')?.toLowerCase() === 'true';
    const messagesPerMinRaw = address.searchParams.get('messagesPerMin') ?? undefined;
    const appLevelAckRaw = address.searchParams.get('appLevelAck') ?? undefined;
    let messagesPerMin = messagesPerMinRaw ? Number.parseInt(messagesPerMinRaw, 10) : undefined;

    if (messagesPerMin !== undefined && !Number.isInteger(messagesPerMin)) {
      this.log.warn(
        `Invalid messagesPerMin: '${messagesPerMinRaw}'; must be a valid integer. Creating channel without a set messagesPerMin...`
      );
      messagesPerMin = undefined;
    }

    this.appLevelAckMode = parseAppLevelAckMode(appLevelAckRaw, this.log);
    this.assignSeqNo = assignSeqNo;

    // If assignSeqNo is false or not set, set lastSeqNo to -1
    if (!assignSeqNo) {
      this.lastSeqNo = -1;
    }

    this.server.setEncoding(encoding);
    this.server.setEnhancedMode(enhancedMode);
    this.server.setMessagesPerMin(messagesPerMin);
    for (const connection of this.connections.values()) {
      connection.hl7Connection.setEncoding(encoding);
      connection.hl7Connection.setEnhancedMode(enhancedMode);
      connection.hl7Connection.setMessagesPerMin(messagesPerMin);
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
    this.hl7Connection.addEventListener('message', (event: Hl7MessageEvent) => this.handleMessage(event));
    this.hl7Connection.addEventListener('error', (event: Hl7ErrorEvent) => this.handleError(event));
    this.hl7Connection.addEventListener('enhancedAckSent', (event: Hl7EnhancedAckSentEvent) =>
      this.handleEnhancedAckSent(event)
    );
  }

  private async handleMessage(event: Hl7MessageEvent): Promise<void> {
    try {
      this.channel.channelLog.info(`Received: ${event.message.toString().replaceAll('\r', '\n')}`);
      const callback = `Agent/${this.channel.app.agentId}-${randomUUID()}`;

      const msgControlId = event.message.getSegment('MSH')?.getField(10)?.toString();
      this.channel.channelLog.info(
        `[Received -- ID: ${msgControlId ?? 'not provided'}]: ${event.message.toString().replaceAll('\r', '\n')}`
      );

      // Log immediate ACK sent by HL7 library in enhanced mode
      const enhancedMode = this.channel.server.getEnhancedMode();
      if (enhancedMode === 'standard') {
        this.channel.channelLog.info(`[Sent Commit ACK (CA) -- ID: ${msgControlId ?? 'not provided'}]`);
      } else if (enhancedMode === 'aaMode') {
        this.channel.channelLog.info(`[Sent Immediate ACK (AA) -- ID: ${msgControlId ?? 'not provided'}]`);
      }

      // Check if we should assign sequence no. If so, take the next one and set it in MSH.13
      if (this.channel.shouldAssignSeqNo()) {
        const seqNo = this.channel.takeNextSeqNo();
        event.message.getSegment('MSH')?.setField(13, seqNo.toString());
        this.channel.channelLog.info(`Setting sequence number for message control ID '${msgControlId}': ${seqNo}`);
      }

      // Check if queue is ready before storing (safety check for edge cases like shutdown)
      if (!this.channel.app.isQueueReady()) {
        this.channel.channelLog.error(
          `Queue not ready, cannot store message ID: ${msgControlId}. Sending error ACK to client.`
        );
        const errorAck = event.message.buildAck({ ackCode: 'AE' });
        this.hl7Connection.send(errorAck);
        return;
      }

      // Store in durable queue first, then trigger processing
      this.channel.app.hl7DurableQueue.addMessage(
        event.message,
        this.channel.getDefinition().name,
        this.remote,
        callback
      );

      // Trigger WebSocket worker to process the queued message
      this.channel.app.startWebSocketWorker();

      // Log stats
      if (msgControlId) {
        this.channel.stats?.recordMessageSent(msgControlId);
      }
    } catch (err) {
      this.channel.log.error(`HL7 error occurred - check channel logs`);
      this.channel.channelLog.error(`HL7 error: ${normalizeErrorString(err)}`);
    }
  }

  private async handleError(event: Hl7ErrorEvent): Promise<void> {
    this.channel.log.error(`HL7 connection error: ${normalizeErrorString(event.error)}`);
    this.channel.channelLog.error(`HL7 connection error: ${normalizeErrorString(event.error)}`);
  }

  private handleEnhancedAckSent(event: Hl7EnhancedAckSentEvent): void {
    const hl7Message = event.message;
    const msgControlId = hl7Message.getSegment('MSA')?.getField(2)?.toString();
    const ackCode = hl7Message.getSegment('MSA')?.getField(1)?.toString()?.toUpperCase();

    this.channel.channelLog.info(
      `[Sent ${ackCode === 'CA' ? 'Commit ACK (CA)' : 'Immediate ACK (AA)'} -- ID: ${msgControlId ?? 'not provided'}]: ${hl7Message.toString().replaceAll('\r', '\n')}`
    );
  }

  close(): Promise<void> {
    return this.hl7Connection.close();
  }
}

/**
 * Parses and normalizes the enhanced mode parameter from the endpoint URL.
 *
 * @param rawValue - The raw query parameter value retrieved from the endpoint URL (e.g., 'true', 'aa', or undefined).
 * @param logger - The Logger instance to use for logging.
 * @returns The parsed enhanced mode enum value.
 */
export function parseEnhancedMode(rawValue: string | null | undefined, logger: ILogger): EnhancedMode {
  if (!rawValue) {
    return undefined;
  }

  const normalizedValue = rawValue.toLowerCase();

  if (normalizedValue === 'true') {
    return 'standard';
  }

  if (normalizedValue === 'aa') {
    return 'aaMode';
  }

  logger.warn(
    `Invalid enhanced value '${rawValue}'; expected 'true' or 'aa'. Using standard mode (enhanced mode disabled).`
  );
  return undefined;
}

/**
 * Normalizes and validates the configured application-level ACK behavior.
 *
 * In the case that the passed-in `rawValue` is not a valid application-level ACK mode in alignment with valid values for `MSH-16`,
 * the function returns `AL` as a fallback, since that is the assumed default mode.
 *
 * @param rawValue - The raw query parameter value retrieved from the endpoint URL.
 * @param logger - The Logger instance to use for logging.
 * @returns The parsed application-level ACK mode, or `AL` if rawValue is invalid.
 */
export function parseAppLevelAckMode(rawValue: string | undefined, logger: ILogger): AppLevelAckMode {
  if (!rawValue) {
    return 'AL';
  }

  const normalizedValue = rawValue.toUpperCase();
  if (isAppLevelAckMode(normalizedValue)) {
    return normalizedValue;
  }

  logger.warn(`Invalid appLevelAck value '${rawValue}'; expected one of ${APP_LEVEL_ACK_MODES.join(', ')}. Using AL.`);
  return 'AL';
}

/**
 * Determines whether an ACK code is an application-level one or not.
 * @param code - The code to verify whether it is an application-level ACK code or not.
 * @returns True if the ACK code is an application-level one; otherwise, false.
 */
export function isAppLevelAckCode(code: string): code is AppLevelAckCode {
  return (APP_LEVEL_ACK_CODES as readonly string[]).includes(code);
}

/**
 * Determines whether a value is  is an application-level one or not.
 * @param candidate - The candidate to check.
 * @returns True if the value is a valid application-level ACK mode (valid MSH-16 value); otherwise, false.
 * @see https://hl7-definition.caristix.com/v2/HL7v2.3/Fields/MSH-16
 * @see https://hl7-definition.caristix.com/v2/HL7v2.3/Tables/0155
 */
export function isAppLevelAckMode(candidate: string): candidate is AppLevelAckMode {
  return (APP_LEVEL_ACK_MODES as readonly string[]).includes(candidate);
}

/**
 * Determines whether an application-level ACK should be forwarded to the remote system.
 * @param options - The configuration describing the ACK mode, current ACK code, and enhanced mode setting.
 * @returns True if the ACK should be forwarded to the remote system; otherwise, false.
 */
export function shouldSendAppLevelAck(options: ShouldSendAppLevelAckOptions): boolean {
  const { mode, ackCode, enhancedMode } = options;
  // If enhanced mode is not enabled (undefined), always send the ACK
  if (!enhancedMode) {
    return true;
  }

  // For 'aaMode', never forward application-level ACKs (we already sent AA immediately)
  if (enhancedMode === 'aaMode') {
    return false;
  }

  // For 'standard' enhanced mode, follow the app-level ACK mode rules
  switch (mode) {
    case 'AL':
      return true;
    case 'NE':
      return false;
    case 'ER':
      return ackCode !== 'AA';
    case 'SU':
      return ackCode === 'AA';
    default:
      mode satisfies never;
      throw new Error('Invalid app-level ACK mode provided');
  }
}
