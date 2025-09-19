// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  AgentError,
  AgentLogsRequest,
  AgentMessage,
  AgentReloadConfigResponse,
  AgentTransmitRequest,
  AgentTransmitResponse,
  AgentUpgradeRequest,
  AgentUpgradeResponse,
  ContentType,
  Hl7Message,
  ILogger,
  LogLevel,
  Logger,
  MEDPLUM_VERSION,
  MedplumClient,
  ReconnectingWebSocket,
  checkIfValidMedplumVersion,
  fetchLatestVersionString,
  isValidHostname,
  normalizeErrorString,
  sleep,
} from '@medplum/core';
import { Agent, AgentChannel, Endpoint, Reference } from '@medplum/fhirtypes';
import { Hl7Client } from '@medplum/hl7';
import { ChildProcess, ExecException, ExecOptionsWithStringEncoding, exec, spawn } from 'node:child_process';
import { existsSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { isIPv4, isIPv6 } from 'node:net';
import { platform } from 'node:os';
import process from 'node:process';
import * as semver from 'semver';
import WebSocket from 'ws';
import { AgentByteStreamChannel } from './bytestream';
import { Channel, ChannelType, getChannelType, getChannelTypeShortName } from './channel';
import { DEFAULT_PING_TIMEOUT, MAX_MISSED_HEARTBEATS, RETRY_WAIT_DURATION_MS } from './constants';
import { AgentDicomChannel } from './dicom';
import { AgentHl7Channel } from './hl7';
import { isWinstonWrapperLogger } from './logger';
import { createPidFile, forceKillApp, isAppRunning, removePidFile, waitForPidFile } from './pid';
import { getCurrentStats } from './stats';
import { UPGRADER_LOG_PATH, UPGRADE_MANIFEST_PATH } from './upgrader-utils';

async function execAsync(
  command: string,
  options: ExecOptionsWithStringEncoding
): Promise<{ stdout: string; stderr: string }> {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    exec(command, options, (ex: ExecException | null, stdout: string, stderr: string) => {
      if (ex) {
        const err = ex as Error;
        reject(err);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

export interface AppOptions {
  mainLogger?: ILogger;
  channelLogger?: ILogger;
}

export class App {
  static instance: App;
  readonly medplum: MedplumClient;
  readonly agentId: string;
  readonly log: ILogger;
  readonly channelLog: ILogger;
  readonly webSocketQueue: AgentMessage[] = [];
  readonly channels = new Map<string, Channel>();
  readonly hl7Queue: AgentMessage[] = [];
  readonly hl7Clients = new Map<string, Hl7Client>();
  heartbeatPeriod = 10 * 1000;
  private heartbeatTimer?: NodeJS.Timeout;
  private outstandingHeartbeats = 0;
  private webSocket?: ReconnectingWebSocket<WebSocket>;
  private webSocketWorker?: Promise<void>;
  private live = false;
  private shutdown = false;
  private keepAlive = false;
  private logStatsFreqSecs = -1;
  private logStatsTimer?: NodeJS.Timeout;
  private config: Agent | undefined;

  constructor(medplum: MedplumClient, agentId: string, logLevel?: LogLevel, options?: AppOptions) {
    App.instance = this;
    this.medplum = medplum;
    this.agentId = agentId;
    this.log = options?.mainLogger ?? new Logger((msg) => console.log(msg), undefined, logLevel);
    this.channelLog = options?.channelLogger ?? new Logger((msg) => console.log(msg), undefined, logLevel);
  }

  async start(): Promise<void> {
    this.log.info('Medplum service starting...');

    await this.startWebSocket();

    await this.reloadConfig();

    // We do this after starting WebSockets so that we can send a message if we finished upgrading
    // We also do it after reloading the config, to make sure that we have bound to the ports before releasing the upgrading agent PID file
    await this.maybeFinalizeUpgrade();

    this.medplum.addEventListener('change', () => {
      if (!this.webSocket) {
        this.connectWebSocket().catch((err) => {
          this.log.error(normalizeErrorString(err));
        });
      } else {
        this.startWebSocketWorker();
      }
    });

    this.log.info('Medplum service started successfully');
  }

  private async maybeFinalizeUpgrade(): Promise<void> {
    if (existsSync(UPGRADE_MANIFEST_PATH)) {
      const upgradeFile = readFileSync(UPGRADE_MANIFEST_PATH, { encoding: 'utf-8' });
      const upgradeDetails = JSON.parse(upgradeFile) as {
        previousVersion: string;
        targetVersion: string;
        callback: string | null;
      };

      // If we are on the right version, send success response to Medplum
      if (MEDPLUM_VERSION.startsWith(upgradeDetails.targetVersion)) {
        // Send message
        await this.sendToWebSocket({
          type: 'agent:upgrade:response',
          statusCode: 200,
          callback: upgradeDetails.callback ?? undefined,
        } satisfies AgentUpgradeResponse);
        this.log.info(`Successfully upgraded to version ${upgradeDetails.targetVersion}`);
      } else {
        // Otherwise if we are on the wrong version, send error
        const errMsg = `Failed to upgrade to version ${upgradeDetails.targetVersion}. Agent still running with version ${MEDPLUM_VERSION}`;
        await this.sendToWebSocket({
          type: 'agent:error',
          body: errMsg,
          callback: upgradeDetails.callback ?? undefined,
        } satisfies AgentError);
        this.log.error(errMsg);
      }

      // Delete manifest
      unlinkSync(UPGRADE_MANIFEST_PATH);

      await this.tryToCreateAgentPidFile();

      // Wait for upgrading agent PID file since it could have been created just a few ms ago
      await waitForPidFile('medplum-upgrading-agent');

      // Now make sure to remove it
      removePidFile('medplum-upgrading-agent');
    }
  }

  private async tryToCreateAgentPidFile(): Promise<void> {
    // Should be ~ 500 seconds (500 ms wait x 1000 times)
    const maxAttempts = 1000;
    let attempt = 0;
    let success = false;
    while (!success) {
      try {
        createPidFile('medplum-agent');
        success = true;
      } catch (_err) {
        this.log.info('Unable to create agent PID file, trying again...');
        attempt++;
        if (attempt === maxAttempts) {
          throw new Error('Too many unsuccessful attempts to create agent PID file');
        }
        await sleep(500);
      }
    }
  }

  private async startWebSocket(): Promise<void> {
    await this.connectWebSocket();
    this.heartbeatTimer = setInterval(() => this.heartbeat(), this.heartbeatPeriod);
  }

  private async heartbeat(): Promise<void> {
    if (!this.webSocket) {
      this.log.warn('WebSocket not connected');
      this.connectWebSocket().catch((err) => {
        this.log.error(normalizeErrorString(err));
      });
      return;
    }

    if (this.live) {
      if (this.outstandingHeartbeats > MAX_MISSED_HEARTBEATS) {
        this.outstandingHeartbeats = 0;
        this.webSocket.reconnect();
        this.log.info('Disconnected from Medplum server. Attempting to reconnect...');
        return;
      }
      this.outstandingHeartbeats += 1;
      await this.sendToWebSocket({ type: 'agent:heartbeat:request' });
    }
  }

  private async connectWebSocket(): Promise<void> {
    const webSocketUrl = new URL(this.medplum.getBaseUrl());
    webSocketUrl.protocol = webSocketUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    webSocketUrl.pathname = '/ws/agent';
    this.log.info(`Connecting to WebSocket: ${webSocketUrl.href}`);

    this.webSocket = new ReconnectingWebSocket<WebSocket>(webSocketUrl.toString(), undefined, {
      WebSocket,
      binaryType: 'nodebuffer',
    });

    this.webSocket.addEventListener('error', () => {
      if (!this.shutdown) {
        // This event is only fired when WebSocket closes due to some kind of error
        // https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/error_event
        // The error event seems to never contain an actual error though
        this.log.error('WebSocket closed due to an error');
      }
    });

    this.webSocket.addEventListener('open', async () => {
      await this.sendToWebSocket({
        type: 'agent:connect:request',
        accessToken: this.medplum.getAccessToken() as string,
        agentId: this.agentId,
      });
    });

    this.webSocket.addEventListener('close', () => {
      if (!this.shutdown && this.live) {
        this.live = false;
        this.log.info('WebSocket closed');
      }
    });

    this.webSocket.addEventListener('message', async (e) => {
      try {
        const data = e.data as Buffer;
        const str = data.toString('utf8');
        this.log.debug(`Received from WebSocket: ${str.replaceAll('\r', '\n')}`);
        const command = JSON.parse(str) as AgentMessage;
        switch (command.type) {
          // @ts-expect-error - Deprecated message type
          case 'connected':
          case 'agent:connect:response':
            this.live = true;
            this.startWebSocketWorker();
            this.log.info('Successfully connected to Medplum server');
            break;
          case 'agent:heartbeat:request':
            this.outstandingHeartbeats = 0;
            await this.sendToWebSocket({ type: 'agent:heartbeat:response', version: MEDPLUM_VERSION });
            break;
          case 'agent:heartbeat:response':
            this.outstandingHeartbeats = 0;
            break;
          // @ts-expect-error - Deprecated message type
          case 'transmit':
          case 'agent:transmit:response': {
            if (!command.callback) {
              this.log.warn('Transmit response missing callback');
            }
            if (this.config?.status !== 'active') {
              this.sendAgentDisabledError(command);
              // We check the existence of a statusCode for backwards compat
            } else if (!(command.statusCode && command.statusCode >= 400)) {
              this.addToHl7Queue(command);
            } else {
              // Log error
              this.log.error(`Error during handling transmit request: ${command.body}`);
            }
            break;
          }
          // @ts-expect-error - Deprecated message type
          case 'push':
          case 'agent:transmit:request':
            if (this.config?.status !== 'active') {
              this.sendAgentDisabledError(command);
            } else if (command.contentType === ContentType.PING) {
              await this.tryPingHost(command);
            } else {
              this.pushMessage(command);
            }
            break;
          case 'agent:reloadconfig:request':
            try {
              this.log.info('Reloading config...');
              await this.reloadConfig();
              await this.sendToWebSocket({
                type: 'agent:reloadconfig:response',
                statusCode: 200,
                callback: command.callback,
              } satisfies AgentReloadConfigResponse);
            } catch (err: unknown) {
              await this.sendToWebSocket({
                type: 'agent:error',
                body: normalizeErrorString(err),
                callback: command.callback,
              });
            }
            break;
          case 'agent:upgrade:request':
            await this.tryUpgradeAgent(command);
            break;
          case 'agent:logs:request':
            await this.handleLogRequest(command);
            break;
          case 'agent:error':
            this.log.error(command.body);
            break;
          default:
            this.log.error(`Unknown message type: ${command.type}`);
        }
      } catch (err) {
        this.log.error(`WebSocket error on incoming message: ${normalizeErrorString(err)}`);
      }
    });

    return new Promise<void>((resolve) => {
      const connectInterval = setInterval(() => this.webSocket?.reconnect(), RETRY_WAIT_DURATION_MS);
      this.webSocket?.addEventListener('open', () => {
        clearInterval(connectInterval);
        resolve();
      });
    });
  }

  private async reloadConfig(): Promise<void> {
    const agent = await this.medplum.readResource('Agent', this.agentId, { cache: 'no-cache' });
    const keepAlive = agent?.setting?.find((setting) => setting.name === 'keepAlive')?.valueBoolean;
    const logStatsFreqSecs = agent?.setting?.find((setting) => setting.name === 'logStatsFreqSecs')?.valueInteger;

    // If keepAlive is off and we have clients currently connected, we should stop them and remove them from the clients
    if (!keepAlive && this.hl7Clients.size !== 0) {
      const results = await Promise.allSettled(Array.from(this.hl7Clients.values()).map((client) => client.close()));
      for (const result of results) {
        if (result.status === 'rejected') {
          this.log.error(normalizeErrorString(result.reason));
        }
      }
      this.hl7Clients.clear();
    }

    if (this.logStatsFreqSecs !== logStatsFreqSecs && this.logStatsTimer) {
      // Clear the interval for log stats if logStatsFreqSecs is not the same in the new config
      clearInterval(this.logStatsTimer);
      this.logStatsTimer = undefined;
    }

    this.config = agent;
    this.keepAlive = keepAlive ?? false;
    this.logStatsFreqSecs = logStatsFreqSecs ?? -1;

    if (this.logStatsFreqSecs > 0) {
      this.logStatsTimer = setInterval(() => {
        const stats = getCurrentStats();
        this.log.info('Agent stats', {
          stats: {
            ...stats,
            webSocketQueueDepth: this.webSocketQueue.length,
            hl7QueueDepth: this.hl7Queue.length,
            hl7ClientCount: this.hl7Clients.size,
            live: this.live,
            outstandingHeartbeats: this.outstandingHeartbeats,
          },
        });
      }, this.logStatsFreqSecs * 1000);
    }

    await this.hydrateListeners();
  }

  /**
   * This method should only be called by {@link App.reloadConfig}
   */
  private async hydrateListeners(): Promise<void> {
    const config = this.config as Agent;

    const pendingRemoval = new Set(this.channels.keys());
    let channels = config.channel ?? [];

    if (config.status === 'off') {
      channels = [];
      this.log.warn(
        "Agent status is currently 'off'. All channels are disconnected until status is set back to 'active'"
      );
    }

    const endpointPromises = [] as Promise<Endpoint>[];
    for (const definition of channels) {
      endpointPromises.push(
        this.medplum.readReference(definition.endpoint as Reference<Endpoint>, { cache: 'no-cache' })
      );
    }

    const endpoints = await Promise.all(endpointPromises);
    this.validateAgentEndpoints(channels, endpoints);

    const filteredChannels = [] as AgentChannel[];
    const filteredEndpoints = [] as Endpoint[];

    for (let i = 0; i < channels.length; i++) {
      const definition = channels[i];
      const endpoint = endpoints[i];

      // If the endpoint for this channel is turned off, we're going to skip over this channel
      // Which means it will be marked for removal in this step
      if (endpoint.status === 'off') {
        this.log.warn(
          `[${getChannelTypeShortName(endpoint)}:${definition.name}] Channel currently has status of 'off'. Channel will not reconnect until status is set to 'active'`
        );
      } else {
        // Push the definition and endpoint into our filtered arrays
        filteredChannels.push(definition);
        filteredEndpoints.push(endpoint);
        // Remove all channels from pendingRemoval list that are present in the new definition (unless the endpoint is 'off')
        // We will remove the channels that are left over -- channels that are not part of the new config
        pendingRemoval.delete(definition.name);
      }
    }

    // Now iterate leftover channels and stop any that were not present in config when reloaded
    for (const leftover of pendingRemoval.keys()) {
      const channel = this.channels.get(leftover) as Channel;
      await channel.stop();

      pendingRemoval.delete(leftover);
      this.channels.delete(leftover);
    }

    // Iterate the channels specified in the config
    // Either start them or reload their config if already present
    for (let i = 0; i < filteredChannels.length; i++) {
      const definition = filteredChannels[i];
      const endpoint = filteredEndpoints[i];

      if (!endpoint.address) {
        this.log.warn(`Ignoring empty endpoint address: ${definition.name}`);
      }

      try {
        await this.startOrReloadChannel(definition, endpoint);
      } catch (err) {
        this.log.error(normalizeErrorString(err));
      }
    }
  }

  /**
   * Validates whether all endpoints are valid. Also ensures that there are no conflicting ports between any endpoints in the group.
   *
   * Will throw if not valid.
   *
   * @param channels - All the channels defined for the agent.
   * @param endpoints - All the endpoints corresponding to the agent channels that should be validated.
   */
  private validateAgentEndpoints(channels: AgentChannel[], endpoints: Endpoint[]): void {
    const seenPorts = new Set<string>();
    const portToChannelMap = new Map<string, [string, string]>();
    for (let i = 0; i < channels.length; i++) {
      const channel = channels[i];
      const endpoint = endpoints[i];

      if (!endpoint.address) {
        throw new Error(`Invalid empty endpoint address for channel '${channel.name}'`);
      }

      let parsedEndpoint: URL;
      try {
        parsedEndpoint = new URL(endpoint.address);
      } catch (err: unknown) {
        throw new Error(
          `Error while validating endpoint address for channel '${channel.name}': ${normalizeErrorString(err)}`
        );
      }
      if (seenPorts.has(parsedEndpoint.port)) {
        const [conflictingChannel, conflictingAddress] = portToChannelMap.get(parsedEndpoint.port) as [string, string];
        throw new Error(
          `Invalid agent config. Both '${conflictingChannel}' (${conflictingAddress}) and '${channel.name}' (${endpoint.address}) declare use of port ${parsedEndpoint.port}`
        );
      }
      seenPorts.add(parsedEndpoint.port);
      portToChannelMap.set(parsedEndpoint.port, [channel.name, endpoint.address]);
    }
  }

  private async startOrReloadChannel(definition: AgentChannel, endpoint: Endpoint): Promise<void> {
    let channel: Channel | undefined = this.channels.get(definition.name);

    if (channel) {
      await channel.reloadConfig(definition, endpoint);
      return;
    }

    switch (getChannelType(endpoint)) {
      case ChannelType.DICOM:
        channel = new AgentDicomChannel(this, definition, endpoint);
        break;
      case ChannelType.HL7_V2:
        channel = new AgentHl7Channel(this, definition, endpoint);
        break;
      case ChannelType.BYTESTREAM:
        channel = new AgentByteStreamChannel(this, definition, endpoint);
        break;
      default:
        throw new Error(`Unsupported endpoint type: ${endpoint.address}`);
    }

    channel.start();
    this.channels.set(definition.name, channel);
  }

  async stop(): Promise<void> {
    this.log.info('Medplum service stopping...');
    this.shutdown = true;

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }

    if (this.logStatsTimer) {
      clearInterval(this.logStatsTimer);
      this.logStatsTimer = undefined;
    }

    if (this.webSocket) {
      this.webSocket.close();
      this.webSocket = undefined;
    }

    if (this.hl7Clients.size !== 0) {
      const clientClosePromises = [];
      for (const channel of this.channels.values()) {
        clientClosePromises.push(channel.stop());
      }
      await Promise.all(clientClosePromises);
    }

    const channelStopPromises = [];
    for (const channel of this.channels.values()) {
      channelStopPromises.push(channel.stop());
    }
    await Promise.all(channelStopPromises);

    this.log.info('Medplum service stopped successfully');
  }

  addToWebSocketQueue(message: AgentMessage): void {
    this.webSocketQueue.push(message);
    this.startWebSocketWorker();
  }

  addToHl7Queue(message: AgentMessage): void {
    this.hl7Queue.push(message);
    this.trySendToHl7Connection();
  }

  private startWebSocketWorker(): void {
    if (this.webSocketWorker) {
      // Websocket worker is already running
      return;
    }

    // Start the worker
    this.webSocketWorker = this.trySendToWebSocket()
      .then(() => {
        this.webSocketWorker = undefined;
      })
      .catch((err) => console.log('WebSocket worker error', err));
  }

  private async trySendToWebSocket(): Promise<void> {
    if (this.live) {
      while (this.webSocketQueue.length > 0) {
        const msg = this.webSocketQueue.shift();
        if (msg) {
          try {
            await this.sendToWebSocket(msg);
          } catch (err) {
            this.log.error(`WebSocket error while attempting to send message: ${normalizeErrorString(err)}`);
            this.webSocketQueue.unshift(msg);
            throw err;
          }
        }
      }
    }
    this.webSocketWorker = undefined;
  }

  private trySendToHl7Connection(): void {
    while (this.hl7Queue.length > 0) {
      const msg = this.hl7Queue.shift();
      if (msg && msg.type === 'agent:transmit:response' && msg.channel) {
        const channel = this.channels.get(msg.channel);
        if (channel) {
          channel.sendToRemote(msg);
        }
      }
    }
  }

  // This covers Windows, Linux, and Mac
  private getPingCommand(host: string, count = 1): string {
    return platform() === 'win32' ? `ping /n ${count} ${host}` : `ping -c ${count} ${host}`;
  }

  private async tryPingHost(message: AgentTransmitRequest): Promise<void> {
    try {
      if (message.body && !message.body.startsWith('PING')) {
        const warnMsg =
          'Message body present but unused. Body for a ping request should be empty or a message formatted as `PING[ count]`.';
        this.log.warn(warnMsg);
      }

      if (isIPv6(message.remote)) {
        const errMsg = `Attempted to ping an IPv6 address: ${message.remote}\n\nIPv6 is currently unsupported.`;
        this.log.error(errMsg);
        throw new Error(errMsg);
      }

      if (!(isIPv4(message.remote) || isValidHostname(message.remote))) {
        const errMsg = `Attempted to ping an invalid host.\n\n"${message.remote}" is not a valid IPv4 address or a resolvable hostname.`;
        this.log.error(errMsg);
        throw new Error(errMsg);
      }

      const pingCountAsStr = message.body.startsWith('PING') ? (message.body.split(' ')?.[1] ?? '') : '';
      let pingCount: number | undefined = undefined;

      if (pingCountAsStr !== '') {
        pingCount = Number.parseInt(pingCountAsStr, 10);
        if (Number.isNaN(pingCount)) {
          throw new Error(
            `Unable to ping ${message.remote} "${pingCountAsStr}" times. "${pingCountAsStr}" is not a number.`
          );
        }
      }

      const { stdout, stderr } = await execAsync(this.getPingCommand(message.remote, pingCount), {
        timeout: DEFAULT_PING_TIMEOUT,
      });

      if (stderr) {
        throw new Error(`Received on stderr:\n\n${stderr.trim()}`);
      }

      const result = stdout.trim();
      this.log.info(`Ping result for ${message.remote}:\n\n${result}`);
      this.addToWebSocketQueue({
        type: 'agent:transmit:response',
        channel: message.channel,
        contentType: ContentType.PING,
        remote: message.remote,
        callback: message.callback,
        statusCode: 200,
        body: result,
      } satisfies AgentTransmitResponse);
    } catch (err) {
      this.log.error(`Error during ping attempt to ${message.remote ?? 'NO_HOST_GIVEN'}: ${normalizeErrorString(err)}`);
      this.addToWebSocketQueue({
        type: 'agent:transmit:response',
        channel: message.channel,
        contentType: ContentType.TEXT,
        remote: message.remote,
        callback: message.callback,
        statusCode: 400,
        body: normalizeErrorString(err),
      } satisfies AgentTransmitResponse);
    }
  }

  private async tryUpgradeAgent(message: AgentUpgradeRequest): Promise<void> {
    this.log.info(`Attempting to upgrade from ${MEDPLUM_VERSION} to ${message.version ?? 'latest'}...`);

    if (platform() !== 'win32') {
      const errMsg = 'Auto-upgrading is currently only supported on Windows';
      this.log.error(errMsg);
      await this.sendToWebSocket({
        type: 'agent:error',
        callback: message.callback,
        body: errMsg,
      } satisfies AgentError);
      return;
    }

    const upgradeInProgress = this.isAgentUpgrading();

    // If the agent detects there is already an upgrade in progress, and force mode is not on, then prevent attempt to upgrade
    if (upgradeInProgress && !message.force) {
      const errMsg = 'Pending upgrade is already in progress';
      this.log.error(errMsg);
      await this.sendToWebSocket({
        type: 'agent:error',
        callback: message.callback,
        body: errMsg,
      } satisfies AgentError);
      return;
    }

    let child: ChildProcess;

    // If there is an explicit version, check if it's valid
    if (message.version && !(await checkIfValidMedplumVersion('agent-upgrader', message.version))) {
      const versionTag = message.version ? `v${message.version}` : 'latest';
      const errMsg = `Error during upgrading to version '${versionTag}'. '${message.version}' is not a valid version`;
      this.log.error(errMsg);
      await this.sendToWebSocket({
        type: 'agent:error',
        callback: message.callback,
        body: errMsg,
      } satisfies AgentError);
      return;
    }

    const targetVersion = message.version ?? (await fetchLatestVersionString('agent-upgrader'));

    // MEDPLUM_VERSION contains major.minor.patch-commit_hash
    if (MEDPLUM_VERSION.startsWith(targetVersion)) {
      // If we are forcing an upgrade, we can still upgrade to a version that we're already on
      // This is mostly if you somehow installed a version that was not released but installed manually
      // This will get you on the official release version for the given semver
      if (!message?.force) {
        this.log.info(`Attempted to upgrade to version ${targetVersion}, but agent is already on that version`);
        await this.sendToWebSocket({
          type: 'agent:upgrade:response',
          statusCode: 200,
          callback: message.callback,
        } satisfies AgentUpgradeResponse);
        return;
      }

      this.log.info(`Forcing upgrade from ${MEDPLUM_VERSION} to ${targetVersion}`);
    }

    // If downgrading to a pre-zero-downtime version, we should check if we are forcing first
    // If not forcing, we should error and warn the user about the implications of downgrading to a pre-zero-downtime version
    // Including downtime during the current downgrade (since the currently running service must stop before downgrading)
    // And future downtime upon any future upgrades
    if (semver.lt(targetVersion, '4.2.4') && !message.force) {
      const errMsg = `WARNING: ${targetVersion} predates the zero-downtime upgrade feature. Downgrading to this version will 1) incur downtime during the downgrade process, as the current agent must stop itself before installing the older agent, and 2) incur downtime on any subsequent upgrade to a later version. We recommend against downgrading to this version, but if you must, reissue the command with force set to true to downgrade.`;
      this.log.error(errMsg);
      await this.sendToWebSocket({
        type: 'agent:error',
        callback: message.callback,
        body: errMsg,
      } satisfies AgentError);
      return;
    }

    if (upgradeInProgress && message.force) {
      // If running, just cleanup the file since it could be that the cleanup failed for whatever reason
      if (isAppRunning('medplum-upgrading-agent')) {
        removePidFile('medplum-upgrading-agent');
      }
      // If running, kill the upgrader and cleanup the file
      if (isAppRunning('medplum-agent-upgrader')) {
        // Attempt to kill the upgrader
        forceKillApp('medplum-agent-upgrader');
        // Remove PID file
        removePidFile('medplum-agent-upgrader');
      }
      // Clean up upgrade.json
      unlinkSync(UPGRADE_MANIFEST_PATH);
    }

    try {
      const command = __filename;
      const logFile = openSync(UPGRADER_LOG_PATH, 'w+');
      child = spawn(command, message.version ? ['--upgrade', message.version] : ['--upgrade'], {
        detached: true,
        stdio: ['ignore', logFile, logFile, 'ipc'],
      });
      // We unref the child process so that this process can close before the child has closed (since we want the child to be able to close the parent process)
      child.unref();

      await new Promise<void>((resolve, reject) => {
        const childTimeout = setTimeout(
          () => reject(new Error('Timed out while waiting for message from child')),
          15000
        );
        child.on('message', (msg: { type: string }) => {
          clearTimeout(childTimeout);
          if (msg.type === 'STARTED') {
            resolve();
          } else {
            reject(new Error(`Received unexpected message type ${msg.type} when expected type STARTED`));
          }
        });

        child.on('error', (err) => {
          this.log.error(normalizeErrorString(err));
          reject(err);
        });
      });
    } catch (err) {
      const versionTag = message.version ? `v${message.version}` : 'latest';
      const errMsg = `Error during upgrading to version '${versionTag}': ${normalizeErrorString(err)}`;
      this.log.error(errMsg);
      await this.sendToWebSocket({
        type: 'agent:error',
        callback: message.callback,
        body: errMsg,
      } satisfies AgentError);
      return;
    }

    try {
      // Write a manifest file
      this.log.info('Writing upgrade manifest...', { previousVersion: MEDPLUM_VERSION, targetVersion });
      writeFileSync(
        UPGRADE_MANIFEST_PATH,
        JSON.stringify({
          previousVersion: MEDPLUM_VERSION,
          targetVersion,
          callback: message.callback ?? null,
        }),
        { encoding: 'utf8', flag: 'w+' }
      );

      this.log.info('Closing IPC...');
      child.disconnect();
    } catch (err: unknown) {
      this.log.error(
        `Error while stopping agent or messaging child process as part of upgrade: ${normalizeErrorString(err)}`
      );
      // Attempt to exit process...
      // If we already wrote a manifest, then when service restarts
      // We SHOULD send an error back to the server on the callback
      process.exit(1);
    }
  }

  private async handleLogRequest(command: AgentLogsRequest): Promise<void> {
    if (!isWinstonWrapperLogger(this.log)) {
      const errMsg = 'Unable to fetch logs since current logger instance does not support fetching';
      this.log.error(errMsg);
      await this.sendToWebSocket({
        type: 'agent:error',
        body: errMsg,
        callback: command.callback,
      });
      return;
    }

    try {
      const logs = await this.log.fetchLogs({ limit: command.limit });
      await this.sendToWebSocket({
        type: 'agent:logs:response',
        statusCode: 200,
        logs,
        callback: command.callback,
      });
    } catch (err) {
      this.log.error(normalizeErrorString(err));
      await this.sendToWebSocket({
        type: 'agent:error',
        body: normalizeErrorString(err),
        callback: command.callback,
      });
    }
  }

  private async sendToWebSocket(message: AgentMessage): Promise<void> {
    if (!this.webSocket) {
      throw new Error('WebSocket not connected');
    }
    if ('accessToken' in message) {
      // Use the latest access token
      // This can be necessary if the message was queued before the access token was refreshed
      await this.medplum.refreshIfExpired();
      message.accessToken = this.medplum.getAccessToken() as string;
    }
    this.webSocket.send(JSON.stringify(message));
  }

  private sendAgentDisabledError(command: AgentTransmitRequest | AgentTransmitResponse): void {
    const errMsg = 'Agent.status is currently set to off';
    this.log.error(errMsg);
    this.addToWebSocketQueue({
      type: 'agent:error',
      callback: command.callback,
      body: errMsg,
    } satisfies AgentError);
  }

  private pushMessage(message: AgentTransmitRequest): void {
    if (!message.remote) {
      this.log.error('Missing remote address');
      return;
    }

    const address = new URL(message.remote);

    let client: Hl7Client;

    if (this.hl7Clients.has(message.remote)) {
      client = this.hl7Clients.get(message.remote) as Hl7Client;
    } else {
      const encoding = address.searchParams.get('encoding') ?? undefined;
      const keepAlive = this.keepAlive;
      client = new Hl7Client({
        host: address.hostname,
        port: Number.parseInt(address.port, 10),
        encoding,
        keepAlive,
      });
      this.log.info(`Client created for remote '${message.remote}'`, { keepAlive, encoding });

      if (client.keepAlive) {
        this.hl7Clients.set(message.remote, client);
        client.addEventListener('close', () => {
          // If the current client for this remote is this client, make sure to clean it up
          if (this.hl7Clients.get(message.remote) === client) {
            this.hl7Clients.delete(message.remote);
          }
          this.log.info(`Persistent connection to remote '${message.remote}' closed`);
        });
        client.addEventListener('error', (event) => {
          // If the current client for this remote is this client, make sure to clean it up
          if (this.hl7Clients.get(message.remote) === client) {
            this.hl7Clients.delete(message.remote);
          }
          this.log.error(
            `Persistent connection to remote '${message.remote}' encountered error: '${normalizeErrorString(event.error)}' - Closing connection...`
          );
          client.close().catch((err) => {
            this.log.error(normalizeErrorString(err));
          });
        });
      }
    }

    const requestMsg = Hl7Message.parse(message.body);
    const msh10 = requestMsg.getSegment('MSH')?.getField(10);
    if (!msh10) {
      this.log.error('MSH.10 is missing but required');
      return;
    }

    this.log.info(`[Request -- ID: ${msh10}]: ${requestMsg.toString().replaceAll('\r', '\n')}`);

    client
      .sendAndWait(requestMsg)
      .then((response) => {
        this.log.info(`[Response -- ID: ${msh10}]: ${response.toString().replaceAll('\r', '\n')}`);
        this.addToWebSocketQueue({
          type: 'agent:transmit:response',
          channel: message.channel,
          remote: message.remote,
          callback: message.callback,
          contentType: ContentType.HL7_V2,
          statusCode: 200,
          body: response.toString(),
        } satisfies AgentTransmitResponse);
      })
      .catch((err) => {
        this.log.error(`HL7 error: ${normalizeErrorString(err)}`);
        this.addToWebSocketQueue({
          type: 'agent:transmit:response',
          channel: message.channel,
          remote: message.remote,
          callback: message.callback,
          contentType: ContentType.TEXT,
          statusCode: 400,
          body: normalizeErrorString(err),
        } satisfies AgentTransmitResponse);

        if (client.keepAlive) {
          this.hl7Clients.delete(message.remote);
          client.close().catch((err) => {
            this.log.error(normalizeErrorString(err));
          });
        }
      })
      .finally(() => {
        if (!client.keepAlive) {
          client.close().catch((err) => {
            this.log.error(normalizeErrorString(err));
          });
        }
      });
  }

  private isAgentUpgrading(): boolean {
    if (existsSync(UPGRADE_MANIFEST_PATH)) {
      return true;
    }
    if (isAppRunning('medplum-upgrading-agent') || isAppRunning('medplum-agent-upgrader')) {
      return true;
    }
    return false;
  }
}
