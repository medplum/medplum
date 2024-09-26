import {
  AgentError,
  AgentMessage,
  AgentReloadConfigResponse,
  AgentTransmitRequest,
  AgentTransmitResponse,
  AgentUpgradeRequest,
  AgentUpgradeResponse,
  ContentType,
  Hl7Message,
  LogLevel,
  Logger,
  MEDPLUM_VERSION,
  MedplumClient,
  isValidHostname,
  normalizeErrorString,
} from '@medplum/core';
import { Agent, AgentChannel, Endpoint, Reference } from '@medplum/fhirtypes';
import { Hl7Client } from '@medplum/hl7';
import { ChildProcess, ExecException, ExecOptions, exec, spawn } from 'node:child_process';
import { existsSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { isIPv4, isIPv6 } from 'node:net';
import { platform } from 'node:os';
import process from 'node:process';
import WebSocket from 'ws';
import { Channel, ChannelType, getChannelType, getChannelTypeShortName } from './channel';
import { AgentDicomChannel } from './dicom';
import { AgentHl7Channel } from './hl7';
import {
  UPGRADER_LOG_PATH,
  UPGRADE_MANIFEST_PATH,
  checkIfValidMedplumVersion,
  fetchLatestVersionString,
} from './upgrader-utils';

async function execAsync(command: string, options: ExecOptions): Promise<{ stdout: string; stderr: string }> {
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

export const DEFAULT_PING_TIMEOUT = 3600;

export class App {
  static instance: App;
  readonly log: Logger;
  readonly webSocketQueue: AgentMessage[] = [];
  readonly channels = new Map<string, Channel>();
  readonly hl7Queue: AgentMessage[] = [];
  readonly hl7Clients = new Map<string, Hl7Client>();
  heartbeatPeriod = 10 * 1000;
  private heartbeatTimer?: NodeJS.Timeout;
  private reconnectTimer?: NodeJS.Timeout;
  private webSocket?: WebSocket;
  private webSocketWorker?: Promise<void>;
  private live = false;
  private shutdown = false;
  private keepAlive = false;
  private config: Agent | undefined;

  constructor(
    readonly medplum: MedplumClient,
    readonly agentId: string,
    readonly logLevel: LogLevel
  ) {
    App.instance = this;
    this.log = new Logger((msg) => console.log(msg), undefined, logLevel);
  }

  async start(): Promise<void> {
    this.log.info('Medplum service starting...');

    await this.startWebSocket();

    // We do this after starting WebSockets so that we can send a message if we finished upgrading
    await this.maybeFinalizeUpgrade();

    await this.reloadConfig();

    this.medplum.addEventListener('change', () => {
      if (!this.webSocket) {
        this.connectWebSocket().catch(this.log.error);
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
      if (upgradeDetails.targetVersion === MEDPLUM_VERSION.split('-')[0]) {
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
      rmSync(UPGRADE_MANIFEST_PATH);
    }
  }

  private async startWebSocket(): Promise<void> {
    await this.connectWebSocket();
    this.heartbeatTimer = setInterval(() => this.heartbeat(), this.heartbeatPeriod);
  }

  private async heartbeat(): Promise<void> {
    if (!(this.webSocket || this.reconnectTimer)) {
      this.log.warn('WebSocket not connected');
      this.connectWebSocket().catch(this.log.error);
      return;
    }

    if (this.webSocket && this.live) {
      await this.sendToWebSocket({ type: 'agent:heartbeat:request' });
    }
  }

  private async connectWebSocket(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    const webSocketUrl = new URL(this.medplum.getBaseUrl());
    webSocketUrl.protocol = webSocketUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    webSocketUrl.pathname = '/ws/agent';
    this.log.info(`Connecting to WebSocket: ${webSocketUrl.href}`);

    this.webSocket = new WebSocket(webSocketUrl);
    this.webSocket.binaryType = 'nodebuffer';

    this.webSocket.addEventListener('error', (err) => {
      if (!this.shutdown) {
        // This event is only fired when WebSocket closes due to some kind of error
        // https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/error_event
        this.log.error(`WebSocket closed due to an error: ${normalizeErrorString(err)}`);
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
      if (!this.shutdown) {
        this.webSocket = undefined;
        this.live = false;
        this.log.info('WebSocket closed');
        this.reconnectTimer = setTimeout(() => this.connectWebSocket(), 1000);
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
            break;
          case 'agent:heartbeat:request':
            await this.sendToWebSocket({ type: 'agent:heartbeat:response', version: MEDPLUM_VERSION });
            break;
          case 'agent:heartbeat:response':
            // Do nothing
            break;
          // @ts-expect-error - Deprecated message type
          case 'transmit':
          case 'agent:transmit:response': {
            if (!command.callback) {
              throw new Error('Transmit response missing callback');
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

    return new Promise<void>((resolve, reject) => {
      const connectTimeout = setTimeout(
        () => reject(new Error('Timeout when attempting to connect to server WebSocket')),
        10000
      );
      this.webSocket?.addEventListener('open', () => {
        clearTimeout(connectTimeout);
        resolve();
      });
    });
  }

  private async reloadConfig(): Promise<void> {
    const agent = await this.medplum.readResource('Agent', this.agentId);
    const keepAlive = agent?.setting?.find((setting) => setting.name === 'keepAlive')?.valueBoolean;

    if (!keepAlive && this.hl7Clients.size !== 0) {
      for (const client of this.hl7Clients.values()) {
        client.close();
      }
    }

    this.config = agent;
    this.keepAlive = keepAlive ?? false;

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
      endpointPromises.push(this.medplum.readReference(definition.endpoint as Reference<Endpoint>));
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

      if (endpoint.address === '') {
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

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    if (this.webSocket) {
      this.webSocket.close();
      this.webSocket = undefined;
    }

    if (this.hl7Clients.size !== 0) {
      for (const client of this.hl7Clients.values()) {
        client.close();
      }
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

    let child: ChildProcess;

    // If there is an explicit version, check if it's valid
    if (message.version && !(await checkIfValidMedplumVersion(message.version))) {
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

    try {
      const command = __filename;
      const logFile = openSync(UPGRADER_LOG_PATH, 'w+');
      child = spawn(command, ['--upgrade'], { detached: true, stdio: ['ignore', logFile, logFile, 'ipc'] });
      // We unref the child process so that this process can close before the child has closed (since we want the child to be able to close the parent process)
      child.unref();

      await new Promise<void>((resolve, reject) => {
        const childTimeout = setTimeout(
          () => reject(new Error('Timed out while waiting for message from child')),
          5000
        );
        child.on('message', (msg: { type: string }) => {
          clearTimeout(childTimeout);
          if (msg.type === 'STARTED') {
            resolve();
          } else {
            reject(new Error(`Received unexpected message type ${msg.type} when expected type STARTED`));
          }
        });
      });

      child.on('error', (err) => {
        this.log.error(normalizeErrorString(err));
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
      // Stop the agent to prepare for service being restarted
      await this.stop();
      this.log.info('Successfully stopped agent network services');

      // Write a manifest file
      const targetVersion = message.version ?? (await fetchLatestVersionString());

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
          this.hl7Clients.delete(message.remote);
          this.log.info(`Persistent connection to remote '${message.remote}' closed`);
        });
        client.addEventListener('error', () => {
          this.hl7Clients.delete(message.remote);
          this.log.info(
            `Persistent connection to remote '${message.remote}' encountered an error... Closing connection...`
          );
          client.close();
        });
      }
    }

    client
      .sendAndWait(Hl7Message.parse(message.body))
      .then((response) => {
        this.log.info(`Response: ${response.toString().replaceAll('\r', '\n')}`);
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
          client.close();
        }
      })
      .finally(() => {
        if (!client.keepAlive) {
          client.close();
        }
      });
  }
}
