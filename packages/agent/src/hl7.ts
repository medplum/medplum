// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { AgentTransmitResponse, ILogger } from '@medplum/core';
import { ContentType, Hl7Message, normalizeErrorString } from '@medplum/core';
import type { AgentChannel, Endpoint } from '@medplum/fhirtypes';
import type { Hl7Connection, Hl7ErrorEvent, Hl7MessageEvent } from '@medplum/hl7';
import { Hl7Server } from '@medplum/hl7';
import { randomUUID } from 'node:crypto';
import type { App } from './app';
import { BaseChannel } from './channel';
import { ChannelStatsTracker } from './channel-stats-tracker';
import { getCurrentStats, updateStat } from './stats';

export class AgentHl7Channel extends BaseChannel {
  readonly server: Hl7Server;
  private started = false;
  readonly connections = new Map<string, AgentHl7ChannelConnection>();
  readonly log: ILogger;
  readonly channelLog: ILogger;
  private prefix: string;
  stats?: ChannelStatsTracker;

  constructor(app: App, definition: AgentChannel, endpoint: Endpoint) {
    super(app, definition, endpoint);

    this.server = new Hl7Server((connection) => this.handleNewConnection(connection));

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

  sendToRemote(msg: AgentTransmitResponse): void {
    const connection = this.connections.get(msg.remote as string);
    if (connection) {
      const hl7Message = Hl7Message.parse(msg.body);
      const msgControlId = hl7Message.getSegment('MSA')?.getField(2)?.toString();
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
    const address = new URL(this.getEndpoint().address as string);
    const encoding = address.searchParams.get('encoding') ?? undefined;
    const enhancedMode = address.searchParams.get('enhanced')?.toLowerCase() === 'true';
    const messagesPerMinRaw = address.searchParams.get('messagesPerMin') ?? undefined;
    let messagesPerMin = messagesPerMinRaw ? Number.parseInt(messagesPerMinRaw, 10) : undefined;

    if (messagesPerMin !== undefined && !Number.isInteger(messagesPerMin)) {
      this.log.warn(
        `Invalid messagesPerMin: '${messagesPerMinRaw}'; must be a valid integer. Creating channel without a set messagesPerMin...`
      );
      messagesPerMin = undefined;
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
    this.hl7Connection.addEventListener('message', (event) => this.handleMessage(event));
    this.hl7Connection.addEventListener('error', (event) => this.handleError(event));
  }

  private async handleMessage(event: Hl7MessageEvent): Promise<void> {
    try {
      const msgControlId = event.message.getSegment('MSH')?.getField(10)?.toString();
      this.channel.channelLog.info(
        `[Received -- ID: ${msgControlId ?? 'not provided'}]: ${event.message.toString().replaceAll('\r', '\n')}`
      );

      this.channel.app.addToWebSocketQueue({
        type: 'agent:transmit:request',
        accessToken: 'placeholder',
        channel: this.channel.getDefinition().name as string,
        remote: this.remote,
        contentType: ContentType.HL7_V2,
        body: event.message.toString(),
        callback: `Agent/${this.channel.app.agentId}-${randomUUID()}`,
      });

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

  close(): Promise<void> {
    return this.hl7Connection.close();
  }
}
