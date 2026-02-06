// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type {
  AgentError,
  AgentLogsRequest,
  AgentMessage,
  AgentReloadConfigResponse,
  AgentTransmitRequest,
  AgentTransmitResponse,
  AgentUpgradeRequest,
  AgentUpgradeResponse,
  ILogger,
  LogLevel,
  MedplumClient,
} from '@medplum/core';
import {
  ContentType,
  Hl7Message,
  Logger,
  MEDPLUM_VERSION,
  OperationOutcomeError,
  ReconnectingWebSocket,
  TypedEventTarget,
  checkIfValidMedplumVersion,
  fetchLatestVersionString,
  isValidHostname,
  normalizeErrorString,
  sleep,
} from '@medplum/core';
import type { Agent, AgentChannel, Endpoint, OperationOutcomeIssue } from '@medplum/fhirtypes';
import type { Hl7Connection } from '@medplum/hl7';
import { DEFAULT_ENCODING, Hl7Client, Hl7Server, ReturnAckCategory } from '@medplum/hl7';
import assert from 'node:assert';
import type { ChildProcess, ExecException, ExecOptionsWithStringEncoding } from 'node:child_process';
import { exec, execSync, spawn } from 'node:child_process';
import { existsSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { isIPv4, isIPv6 } from 'node:net';
import { platform } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import * as semver from 'semver';
import WebSocket from 'ws';
import { AgentByteStreamChannel } from './bytestream';
import type { Channel } from './channel';
import { ChannelType, getChannelType, getChannelTypeShortName } from './channel';
import type { ChannelStats } from './channel-stats-tracker';
import {
  DEFAULT_MAX_CLIENTS_PER_REMOTE,
  DEFAULT_PING_TIMEOUT,
  HEARTBEAT_PERIOD_MS,
  MAX_MISSED_HEARTBEATS,
  RETRY_WAIT_DURATION_MS,
} from './constants';
import { AgentDicomChannel } from './dicom';
import type { EnhancedHl7Client } from './enhanced-hl7-client';
import { AgentHl7Channel } from './hl7';
import { Hl7ClientPool } from './hl7-client-pool';
import { isWinstonWrapperLogger } from './logger';
import { createPidFile, forceKillApp, isAppRunning, removePidFile, waitForPidFile } from './pid';
import { AgentHl7DurableQueue, waitForQueueRelease } from './queue';
import { getCurrentStats, updateStat } from './stats';
import type { HeartbeatEmitter } from './types';
import { UPGRADER_LOG_PATH, UPGRADE_MANIFEST_PATH } from './upgrader-utils';

// Handoff coordination files for zero-downtime upgrades
const HANDOFF_READY_PATH = join(__dirname, '.handoff-ready');
const HANDOFF_GO_PATH = join(__dirname, '.handoff-go');

// Rollback coordination files
const HANDOFF_ROLLBACK_PATH = join(__dirname, '.handoff-rollback');
const ROLLBACK_COMPLETE_PATH = join(__dirname, '.rollback-complete');
export const SKIP_SERVICE_CLEANUP_PATH = join(__dirname, '.skip-service-cleanup');

// Default healthcheck channel name (magic name for upgrade verification)
const HEALTHCHECK_CHANNEL_NAME = '_medplum_healthcheck';

// Rollback timeout in milliseconds
const ROLLBACK_TIMEOUT_MS = 10000;

// Minimum version that supports the new handoff protocol for queue coordination.
// Versions before this use the installer-based coordination (Windows) which doesn't
// require the handoff signal. When upgrading FROM a version >= this, we require
// the handoff signal and abort if we don't receive it.
// TODO: Fix this when finalizing branch
const MIN_HANDOFF_PROTOCOL_VERSION = '5.0.14';

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
  readonly channels = new Map<string, Channel>();
  readonly hl7DurableQueue: AgentHl7DurableQueue;
  readonly hl7Clients = new Map<string, Hl7ClientPool>();
  heartbeatPeriod = HEARTBEAT_PERIOD_MS; // 10 seconds
  private heartbeatTimer?: NodeJS.Timeout;
  readonly heartbeatEmitter: HeartbeatEmitter = new TypedEventTarget();
  private outstandingHeartbeats = 0;
  private webSocket?: ReconnectingWebSocket<WebSocket>;
  private webSocketWorker?: Promise<void>;
  private live = false;
  private shutdown = false;
  private keepAlive = false;
  private maxClientsPerRemote = DEFAULT_MAX_CLIENTS_PER_REMOTE;
  private logStatsFreqSecs = -1;
  private logStatsTimer?: NodeJS.Timeout;
  private config: Agent | undefined;
  private lastHeartbeatSentTime: number = -1;

  constructor(medplum: MedplumClient, agentId: string, logLevel?: LogLevel, options?: AppOptions) {
    App.instance = this;
    this.medplum = medplum;
    this.agentId = agentId;
    this.log = options?.mainLogger ?? new Logger((msg) => console.log(msg), undefined, logLevel);
    this.channelLog = options?.channelLogger ?? new Logger((msg) => console.log(msg), undefined, logLevel);

    // Initialize durable queue
    this.hl7DurableQueue = new AgentHl7DurableQueue(this.log);
  }

  async start(): Promise<void> {
    this.log.info('Medplum service starting...');

    const isUpgrade = existsSync(UPGRADE_MANIFEST_PATH);
    let previousVersionSupportsHandoff = false;
    let upgradeDetails: { previousVersion: string; targetVersion: string; callback: string | null } | undefined;

    if (isUpgrade) {
      // Read upgrade manifest to check previous version
      const upgradeFile = readFileSync(UPGRADE_MANIFEST_PATH, { encoding: 'utf-8' });
      upgradeDetails = JSON.parse(upgradeFile) as {
        previousVersion: string;
        targetVersion: string;
        callback: string | null;
      };

      this.log.info(
        `Upgrade detected from version ${upgradeDetails.previousVersion} to ${upgradeDetails.targetVersion}`
      );

      const strippedPrevVersion = upgradeDetails.previousVersion.split('-')[0];

      // Check if the previous version supports the handoff protocol
      // If previousVersion is "UNKNOWN" (set by installer) or older than MIN_HANDOFF_PROTOCOL_VERSION,
      // we skip the handoff coordination and rely on installer-based coordination
      previousVersionSupportsHandoff =
        upgradeDetails.previousVersion !== 'UNKNOWN' &&
        semver.valid(strippedPrevVersion) !== null &&
        semver.gte(strippedPrevVersion, MIN_HANDOFF_PROTOCOL_VERSION);

      if (previousVersionSupportsHandoff) {
        this.log.info('Previous version supports handoff protocol, coordinating with old agent...');

        // Signal to old agent: "I'm ready to take over"
        writeFileSync(HANDOFF_READY_PATH, process.pid.toString());
        this.log.info('Handoff ready signal sent');

        // Explicitly stop the old service to trigger its stop() method
        // This will cause the old agent to see .handoff-ready and write .handoff-go
        if (platform() === 'win32') {
          const oldServiceName = `MedplumAgent_${upgradeDetails.previousVersion}`;
          this.log.info(`Stopping old service: ${oldServiceName}`);
          try {
            execSync(`net stop "${oldServiceName}"`, { encoding: 'utf-8', timeout: 30000 });
            this.log.info('Old service stop command sent');
          } catch (err) {
            // Service might already be stopping or stopped
            this.log.warn(`Error stopping old service (may already be stopping): ${normalizeErrorString(err)}`);
          }
        }

        // Wait for old agent to signal "go" (means it has stopped channels)
        // If we don't receive it, abort - the old agent should have sent it
        const receivedSignal = await this.waitForHandoffGo();
        if (!receivedSignal) {
          this.log.error('Failed to receive handoff signal from old agent, aborting upgrade');
          this.cleanupHandoffFiles();
          throw new Error('Upgrade aborted: handoff signal not received from old agent');
        }
      } else {
        this.log.info(
          `Previous version (${upgradeDetails.previousVersion}) does not support handoff protocol, ` +
            'relying on installer-based coordination'
        );
      }
    }

    // Wrap the rest of start() in a try-catch to support rollback on failure
    try {
      // Initialize the queue - during upgrades from versions that support handoff, wait for release
      if (isUpgrade && previousVersionSupportsHandoff) {
        await waitForQueueRelease(this.log);
      }
      this.hl7DurableQueue.init();

      await this.startWebSocket();

      await this.reloadConfig();

      // Run healthcheck during upgrades to verify the new agent is working
      if (isUpgrade && upgradeDetails) {
        try {
          await this.runUpgradeHealthcheck();
        } catch (healthcheckErr) {
          throw new Error(`Upgrade healthcheck failed: ${normalizeErrorString(healthcheckErr)}`);
        }
      }

      // We do this after starting WebSockets so that we can send a message if we finished upgrading
      // We also do it after reloading the config, to make sure that we have bound to the ports before releasing the upgrading agent PID file
      await this.maybeFinalizeUpgrade();

      // Clean up handoff files if they exist
      this.cleanupHandoffFiles();

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
    } catch (startupError) {
      // If this is an upgrade and startup failed, attempt rollback
      if (isUpgrade && upgradeDetails) {
        this.log.error(`Startup failed during upgrade: ${normalizeErrorString(startupError)}`);

        const rollbackSuccess = await this.attemptRollback(
          startupError as Error,
          upgradeDetails.previousVersion,
          previousVersionSupportsHandoff
        );

        if (rollbackSuccess) {
          this.log.info('Rollback succeeded, old agent should be running');
          // Delete upgrade.json so installer can proceed (and not delete old service)
          if (existsSync(UPGRADE_MANIFEST_PATH)) {
            unlinkSync(UPGRADE_MANIFEST_PATH);
          }
          this.cleanupHandoffFiles();
          // Exit this process - the old agent is handling things now
          process.exit(1);
        } else {
          this.log.error('Rollback failed, attempting to continue with this agent');
          // Re-throw the original error
          throw startupError;
        }
      } else {
        // Not an upgrade, just re-throw
        throw startupError;
      }
    }
  }

  /**
   * Wait for the old agent to signal that it has stopped its channels and is ready for handoff.
   *
   * @param timeoutMs - Maximum time to wait in milliseconds (default 30 seconds).
   * @returns True if the handoff signal was received, false if timeout occurred.
   */
  private async waitForHandoffGo(timeoutMs = 30000): Promise<boolean> {
    const startTime = Date.now();
    this.log.info('Waiting for handoff signal from old agent...');

    while (!existsSync(HANDOFF_GO_PATH)) {
      if (Date.now() - startTime > timeoutMs) {
        this.log.warn(`Timeout waiting for handoff signal after ${timeoutMs}ms`);
        return false;
      }
      await sleep(10); // Check every 10ms for fast handoff
    }

    // Small delay to ensure old agent has fully stopped channels
    await sleep(50);
    this.log.info('Handoff signal received from old agent');
    return true;
  }

  /**
   * Clean up handoff coordination files.
   */
  private cleanupHandoffFiles(): void {
    try {
      if (existsSync(HANDOFF_READY_PATH)) {
        unlinkSync(HANDOFF_READY_PATH);
      }
      if (existsSync(HANDOFF_GO_PATH)) {
        unlinkSync(HANDOFF_GO_PATH);
      }
      if (existsSync(HANDOFF_ROLLBACK_PATH)) {
        unlinkSync(HANDOFF_ROLLBACK_PATH);
      }
      if (existsSync(ROLLBACK_COMPLETE_PATH)) {
        unlinkSync(ROLLBACK_COMPLETE_PATH);
      }
    } catch (err) {
      this.log.warn(`Error cleaning up handoff files: ${normalizeErrorString(err)}`);
    }
  }

  /**
   * Run upgrade healthcheck to verify the agent is working correctly.
   * Uses either a configured healthcheck endpoint or a temporary auto-ACK server.
   * @returns Promise that resolves if healthcheck passes, rejects with error if it fails.
   */
  private async runUpgradeHealthcheck(): Promise<void> {
    // Check for configured healthcheck endpoint
    const configuredEndpoint = this.config?.setting?.find((s) => s.name === 'upgradeHealthcheckEndpoint')?.valueString;

    // Also check if there's a healthcheck channel configured
    const healthcheckChannel = this.config?.channel?.find((c) => c.name === HEALTHCHECK_CHANNEL_NAME);

    if (configuredEndpoint) {
      // Use configured endpoint - send through normal channel flow
      await this.runConfiguredHealthcheck(configuredEndpoint);
    } else if (healthcheckChannel) {
      // Use the magic healthcheck channel
      await this.runConfiguredHealthcheck(HEALTHCHECK_CHANNEL_NAME);
    } else {
      // Use temporary auto-ACK server
      await this.runDefaultHealthcheck();
    }
  }

  /**
   * Run healthcheck using a configured endpoint/channel.
   * This sends a message through the normal HL7 flow.
   * @param channelNameOrEndpoint - The channel name or endpoint to run the healthcheck against.
   * @returns a Promise that resolves when the healthcheck completes.
   */
  private async runConfiguredHealthcheck(channelNameOrEndpoint: string): Promise<void> {
    this.log.info(`Running configured healthcheck: ${channelNameOrEndpoint}`);

    // Find the channel by name
    const channel = this.channels.get(channelNameOrEndpoint);
    if (!channel) {
      // If it's not a channel name, it might be an endpoint address - find channel by endpoint
      const channelByEndpoint = Array.from(this.channels.values()).find(
        (c) => c.getEndpoint().address === channelNameOrEndpoint
      );
      if (!channelByEndpoint) {
        throw new Error(`Healthcheck channel or endpoint not found: ${channelNameOrEndpoint}`);
      }
    }

    // Parse endpoint address to get host/port
    const endpoint = channel?.getEndpoint().address ?? channelNameOrEndpoint;
    const url = new URL(endpoint);
    const host = url.hostname || 'localhost';
    const port = parseInt(url.port, 10);

    await this.sendHealthcheckMessage(host, port);
  }

  /**
   * Run default healthcheck using a temporary auto-ACK server.
   * This tests that the agent can receive and respond to HL7 messages locally.
   */
  private async runDefaultHealthcheck(): Promise<void> {
    this.log.info('Running default healthcheck with temporary auto-ACK server');

    let server: Hl7Server | undefined;
    let serverPort: number | undefined;

    try {
      // Create a temporary server that auto-ACKs all messages
      server = new Hl7Server((connection: Hl7Connection) => {
        connection.addEventListener('message', (event) => {
          // Auto-ACK the message
          const ack = event.message.buildAck();
          connection.send(ack);
        });
      });

      // Start on port 0 to let OS assign an available port
      await server.start(0);

      // Get the actual port assigned
      const address = server.server?.address();
      if (!address || typeof address === 'string') {
        throw new Error('Failed to get server port');
      }
      serverPort = address.port;

      this.log.info(`Healthcheck server started on port ${serverPort}`);

      // Send test message
      await this.sendHealthcheckMessage('127.0.0.1', serverPort);

      this.log.info('Default healthcheck passed');
    } finally {
      // Always stop the temporary server
      if (server) {
        try {
          await server.stop({ forceDrainTimeoutMs: 1000 });
        } catch (err) {
          this.log.warn(`Error stopping healthcheck server: ${normalizeErrorString(err)}`);
        }
      }
    }
  }

  /**
   * Send a test HL7 message and verify we receive an ACK.
   * @param host - The host of the endpoint to send the healthcheck message to.
   * @param port - The port of the endpoint to send the healthcheck message to.
   */
  private async sendHealthcheckMessage(host: string, port: number): Promise<void> {
    const client = new Hl7Client({ host, port, connectTimeout: 5000 });

    try {
      // Build a simple ADT^A01 test message
      const testMessage = Hl7Message.parse(
        [
          'MSH|^~\\&|HEALTHCHECK|AGENT|TEST|TEST|' +
            new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14) +
            '||ADT^A01|HEALTHCHECK001|P|2.5',
          'EVN|A01|' + new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14),
          'PID|1||HEALTHCHECK^^^AGENT||TEST^HEALTHCHECK||19700101|U',
        ].join('\r')
      );

      this.log.info(`Sending healthcheck message to ${host}:${port}`);

      // Send and wait for ACK with timeout
      const response = await client.sendAndWait(testMessage, { timeoutMs: 10000 });

      // Verify ACK
      const ackCode = response.getSegment('MSA')?.getField(1)?.toString()?.toUpperCase();
      if (ackCode !== 'AA' && ackCode !== 'CA') {
        throw new Error(`Healthcheck received unexpected ACK code: ${ackCode}`);
      }

      this.log.info(`Healthcheck passed with ACK code: ${ackCode}`);
    } finally {
      await client.close();
    }
  }

  /**
   * Attempt to rollback to the previous agent version after a failed upgrade.
   * @param error - The error that triggered the rollback.
   * @param previousVersion - The version to roll back to.
   * @param previousVersionSupportsHandoff - Whether the previous version supports the handoff protocol.
   * @returns True if rollback succeeded, false otherwise.
   */
  private async attemptRollback(
    error: Error,
    previousVersion: string,
    previousVersionSupportsHandoff: boolean
  ): Promise<boolean> {
    this.log.error(`Upgrade failed, attempting rollback: ${normalizeErrorString(error)}`);

    // First, stop our channels and close the queue to release resources
    await this.stopChannelsAndQueue();

    // Try handoff-based rollback if the old agent supports it and is still running
    if (previousVersionSupportsHandoff) {
      const handoffRollbackSuccess = await this.rollbackViaHandoff();
      if (handoffRollbackSuccess) {
        return true;
      }
      this.log.warn('Handoff rollback failed, trying service restart');
    }

    // Fall back to service restart
    return this.rollbackViaServiceRestart(previousVersion);
  }

  /**
   * Stop channels and close the queue without triggering handoff signals.
   */
  private async stopChannelsAndQueue(): Promise<void> {
    this.log.info('Stopping channels and queue for rollback...');

    // Stop heartbeat and stats timers
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
    if (this.logStatsTimer) {
      clearInterval(this.logStatsTimer);
      this.logStatsTimer = undefined;
    }

    // Close WebSocket
    if (this.webSocket) {
      this.webSocket.close();
      this.webSocket = undefined;
    }

    // Close HL7 client pools
    if (this.hl7Clients.size !== 0) {
      await Promise.all(Array.from(this.hl7Clients.values()).map((pool) => pool.closeAll()));
      this.hl7Clients.clear();
    }

    // Stop channels
    await Promise.all(Array.from(this.channels.values()).map((channel) => channel.stop()));
    this.channels.clear();

    // Close the queue
    this.hl7DurableQueue.close();
  }

  /**
   * Attempt rollback via the handoff protocol.
   * Signals the old agent to restart its channels and take back control.
   * @returns True if rollback succeeded, false otherwise.
   */
  private async rollbackViaHandoff(): Promise<boolean> {
    this.log.info('Attempting rollback via handoff protocol...');

    try {
      // Signal old agent to rollback
      writeFileSync(HANDOFF_ROLLBACK_PATH, JSON.stringify({ pid: process.pid, time: Date.now() }));
      this.log.info('Rollback signal sent to old agent');

      // Wait for old agent to confirm rollback
      const startTime = Date.now();
      while (!existsSync(ROLLBACK_COMPLETE_PATH)) {
        if (Date.now() - startTime > ROLLBACK_TIMEOUT_MS) {
          this.log.warn(`Rollback timeout after ${ROLLBACK_TIMEOUT_MS}ms`);
          return false;
        }
        await sleep(50);
      }

      this.log.info('Old agent confirmed rollback complete');

      // Write skip flag so --remove-old-services doesn't delete old service
      writeFileSync(SKIP_SERVICE_CLEANUP_PATH, Date.now().toString());

      return true;
    } catch (err) {
      this.log.error(`Error during handoff rollback: ${normalizeErrorString(err)}`);
      return false;
    }
  }

  /**
   * Attempt rollback by restarting the old Windows service.
   * @param previousVersion - The version to restart.
   * @returns True if rollback succeeded, false otherwise.
   */
  private rollbackViaServiceRestart(previousVersion: string): boolean {
    if (platform() !== 'win32') {
      this.log.error('Service restart rollback only supported on Windows');
      return false;
    }

    this.log.info(`Attempting to restart old service for version ${previousVersion}...`);

    try {
      // Try to start the old service
      // Service name format: MedplumAgent_<version>
      const oldServiceName = `MedplumAgent_${previousVersion}`;
      execSync(`net start "${oldServiceName}"`, { encoding: 'utf-8' });
      this.log.info(`Successfully restarted old service: ${oldServiceName}`);

      // Write skip flag so --remove-old-services doesn't delete old service
      writeFileSync(SKIP_SERVICE_CLEANUP_PATH, Date.now().toString());

      return true;
    } catch (err) {
      this.log.error(`Failed to restart old service: ${normalizeErrorString(err)}`);

      // If service restart failed, the service may have been deleted already
      // In this case, we can't rollback - the new agent should try to recover itself
      this.log.error('Rollback failed - old service could not be restarted');
      return false;
    }
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
    this.heartbeatEmitter.dispatchEvent({ type: 'heartbeat' });

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
      this.lastHeartbeatSentTime = Date.now();
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
            updateStat('ping', Date.now() - this.lastHeartbeatSentTime);
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
              // Check if this is a response to a durable queue message
              const dbMsg = command.callback
                ? this.hl7DurableQueue.getMessageByCallback(command.callback)
                : this.hl7DurableQueue.getMessageByRemote(command.remote);
              if (dbMsg?.status === 'sent') {
                // Update durable queue with response
                this.hl7DurableQueue.markAsResponseQueued(dbMsg.id, command.body);
                this.trySendToHl7Connection();
                // Trigger worker to process any new messages that arrived while waiting
                this.startWebSocketWorker();
              } else if (command.callback) {
                this.log.warn(`Received response for unknown message: ${command.remote}`);
              }
            } else {
              // Log error
              this.log.error(`Error during handling transmit request: ${command.body}`);
              // Mark as error in durable queue if applicable
              const dbMsg = command.callback
                ? this.hl7DurableQueue.getMessageByCallback(command.callback)
                : this.hl7DurableQueue.getMessageByRemote(command.remote);
              if (dbMsg) {
                this.hl7DurableQueue.markAsError(dbMsg.id);
              }
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
    const maxClientsPerRemote = agent?.setting?.find((setting) => setting.name === 'maxClientsPerRemote')?.valueInteger;
    const logStatsFreqSecs = agent?.setting?.find((setting) => setting.name === 'logStatsFreqSecs')?.valueInteger;

    // If the keepAlive setting changed, we need to reset the pools we have
    if (this.keepAlive !== keepAlive) {
      const results = await Promise.allSettled(Array.from(this.hl7Clients.values()).map((pool) => pool.closeAll()));
      for (const result of results) {
        if (result.status === 'rejected') {
          this.log.error(normalizeErrorString(result.reason));
        }
      }
      // We need to stop tracking stats for each client so that the heartbeat listener is removed
      // Before clearing the clients
      for (const pool of this.hl7Clients.values()) {
        pool.stopTrackingStats();
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

    // Determine maxClientsPerRemote: default is 10, but becomes 1 when keepAlive is true (unless explicitly set)
    if (maxClientsPerRemote !== undefined) {
      this.maxClientsPerRemote = maxClientsPerRemote;
    } else if (this.keepAlive) {
      this.maxClientsPerRemote = 1;
    } else {
      this.maxClientsPerRemote = DEFAULT_MAX_CLIENTS_PER_REMOTE;
    }

    // If we have pools sitting around at this point (they weren't cleared above), set the maxClients for all of the pools
    for (const pool of this.hl7Clients.values()) {
      pool.setMaxClients(this.maxClientsPerRemote);
    }

    this.logStatsFreqSecs = logStatsFreqSecs ?? -1;

    if (this.logStatsFreqSecs > 0) {
      this.log.info(`Stats logging enabled. Logging stats every ${this.logStatsFreqSecs} seconds...`);
      if (this.keepAlive) {
        for (const pool of this.hl7Clients.values()) {
          pool.startTrackingStats();
        }
      }
      this.logStatsTimer ??= setInterval(() => this.logStats(), this.logStatsFreqSecs * 1000);
    } else {
      for (const pool of this.hl7Clients.values()) {
        pool.stopTrackingStats();
      }
    }

    await this.hydrateListeners();
  }

  private logStats(): void {
    assert(this.logStatsFreqSecs > 0, new Error('Can only log stats when logStatsFreqSecs > 0'));

    const stats = getCurrentStats();
    let totalHl7Clients = 0;
    for (const pool of this.hl7Clients.values()) {
      totalHl7Clients += pool.size();
    }

    const hl7Channels = Array.from(this.channels.values()).filter((channel) => channel instanceof AgentHl7Channel);
    const channelStats = Object.fromEntries(
      hl7Channels.map((channel) => [channel.getDefinition().name, channel.stats?.getStats() as ChannelStats])
    );

    const pools = Array.from(this.hl7Clients.values());
    const clientStats = Object.fromEntries(
      pools.map((pool) => [
        `mllp://${pool.host}:${pool.port}?encoding=${pool.encoding ?? DEFAULT_ENCODING}`,
        pool.getPoolStats() as ChannelStats,
      ])
    );

    this.log.info('Agent stats', {
      stats: {
        ...stats,
        durableQueueReceived: this.hl7DurableQueue.countByStatus('received'),
        durableQueueSent: this.hl7DurableQueue.countByStatus('sent'),
        durableQueueResponseQueued: this.hl7DurableQueue.countByStatus('response_queued'),
        hl7ClientCount: totalHl7Clients,
        live: this.live,
        outstandingHeartbeats: this.outstandingHeartbeats,
        channelStats,
        clientStats,
      },
    });
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
      endpointPromises.push(this.medplum.readReference(definition.endpoint, { cache: 'no-cache' }));
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
    const errors = [] as Error[];

    for (let i = 0; i < filteredChannels.length; i++) {
      const definition = filteredChannels[i];
      const endpoint = filteredEndpoints[i];

      if (!endpoint.address) {
        this.log.warn(`Ignoring empty endpoint address: ${definition.name}`);
      }

      try {
        await this.startOrReloadChannel(definition, endpoint);
      } catch (err) {
        errors.push(err as Error);
        this.log.error(normalizeErrorString(err));
      }
    }

    // If there were any errors thrown during reloading, throw them as one error
    if (errors.length) {
      throw new OperationOutcomeError({
        resourceType: 'OperationOutcome',
        issue: [
          {
            severity: 'error',
            code: 'invalid',
            details: {
              text: `${errors.length} error(s) occurred while reloading channels`,
            },
          },
          ...errors.map(
            (err) =>
              ({
                severity: 'error',
                code: 'invalid',
                details: { text: normalizeErrorString(err) },
              }) satisfies OperationOutcomeIssue
          ),
        ],
      });
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

    try {
      const channelType = getChannelType(endpoint);
      switch (channelType) {
        case ChannelType.DICOM:
          channel = new AgentDicomChannel(this, definition, endpoint);
          break;
        case ChannelType.HL7_V2:
          channel = new AgentHl7Channel(this, definition, endpoint);
          break;
        case ChannelType.BYTE_STREAM:
          channel = new AgentByteStreamChannel(this, definition, endpoint);
          break;
        default:
          throw new Error(`Unsupported endpoint type: ${endpoint.address}`);
      }
    } catch (err) {
      this.log.error(normalizeErrorString(err));
      return;
    }

    await channel.start();
    this.channels.set(definition.name, channel);
  }

  async stop(): Promise<void> {
    this.log.info('Medplum service stopping...');
    this.shutdown = true;

    // Check if a new agent is waiting for handoff
    const isUpgradeHandoff = existsSync(HANDOFF_READY_PATH);
    if (isUpgradeHandoff) {
      this.log.info('New agent is waiting for handoff');
    }

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
      const poolClosePromises = [];
      for (const pool of this.hl7Clients.values()) {
        poolClosePromises.push(pool.closeAll());
      }
      await Promise.all(poolClosePromises);
      this.hl7Clients.clear();
    }

    const channelStopPromises = [];
    for (const channel of this.channels.values()) {
      channelStopPromises.push(channel.stop());
    }
    await Promise.all(channelStopPromises);

    // Signal new agent: "channels stopped, GO!"
    // This allows the new agent to start its channels immediately
    if (isUpgradeHandoff) {
      writeFileSync(HANDOFF_GO_PATH, Date.now().toString());
      this.log.info('Handoff signal sent to new agent');
    }

    // Close the durable queue AFTER signaling handoff
    // New agent can start channels while we close the queue
    this.hl7DurableQueue.close();

    // If this is a handoff, wait briefly for potential rollback request
    // The new agent might fail to start and request rollback
    if (isUpgradeHandoff) {
      const rollbackRequested = await this.waitForRollbackRequest();
      if (rollbackRequested) {
        this.log.info('Rollback requested by new agent, recovering...');
        await this.recoverFromRollback();
        // Don't exit - continue running as normal
        return;
      }
    }

    this.log.info('Medplum service stopped successfully');
  }

  /**
   * Wait briefly for a rollback request from the new agent.
   * @returns True if rollback was requested, false otherwise.
   */
  private async waitForRollbackRequest(): Promise<boolean> {
    // Wait for up to ROLLBACK_TIMEOUT_MS for a rollback request
    // This gives the new agent time to detect failures and request rollback
    const startTime = Date.now();
    this.log.info(`Waiting up to ${ROLLBACK_TIMEOUT_MS}ms for potential rollback request...`);

    while (Date.now() - startTime < ROLLBACK_TIMEOUT_MS) {
      if (existsSync(HANDOFF_ROLLBACK_PATH)) {
        return true;
      }
      await sleep(100);
    }

    this.log.info('No rollback requested, proceeding with shutdown');
    return false;
  }

  /**
   * Recover from a rollback request - restart channels and resume normal operation.
   */
  private async recoverFromRollback(): Promise<void> {
    this.log.info('Starting recovery from rollback...');
    this.shutdown = false;

    try {
      // Re-initialize the queue
      this.hl7DurableQueue.init();

      // Restart WebSocket
      await this.startWebSocket();

      // Reload config and start channels
      await this.reloadConfig();

      // Restart heartbeat
      this.heartbeatTimer = setInterval(() => this.heartbeat(), this.heartbeatPeriod);

      // Signal that rollback is complete
      writeFileSync(ROLLBACK_COMPLETE_PATH, Date.now().toString());
      this.log.info('Rollback recovery complete, resuming normal operation');

      // Re-register the change listener
      this.medplum.addEventListener('change', () => {
        if (!this.webSocket) {
          this.connectWebSocket().catch((err) => {
            this.log.error(normalizeErrorString(err));
          });
        } else {
          this.startWebSocketWorker();
        }
      });
    } catch (err) {
      this.log.error(`Failed to recover from rollback: ${normalizeErrorString(err)}`);
      // Still try to signal that we attempted recovery
      try {
        writeFileSync(ROLLBACK_COMPLETE_PATH, JSON.stringify({ error: normalizeErrorString(err), time: Date.now() }));
      } catch (_writeErr) {
        // Ignore write errors
      }
      throw err;
    }
  }

  /**
   * Check if the durable queue is ready for use.
   * @returns True if the queue is initialized and not closed.
   */
  isQueueReady(): boolean {
    return this.hl7DurableQueue.isReady();
  }

  addToWebSocketQueue(message: AgentMessage): void {
    // Legacy method - for non-HL7 messages (like ping responses, errors)
    // Store in a temporary variable and send immediately
    this.sendToWebSocket(message).catch((err) =>
      this.log.error(`Error sending to WebSocket: ${normalizeErrorString(err)}`)
    );
  }

  getAgentConfig(): Agent | undefined {
    return this.config;
  }

  startWebSocketWorker(): void {
    if (this.webSocketWorker) {
      // Websocket worker is already running
      return;
    }

    // Start the worker
    this.webSocketWorker = this.trySendToWebSocket()
      .then((processedCount) => {
        this.webSocketWorker = undefined;
        // Only restart if we processed messages (new ones might have arrived)
        if (processedCount && processedCount > 0) {
          this.startWebSocketWorker();
        }
      })
      .catch((err) => {
        this.log.error(`WebSocket worker error: ${normalizeErrorString(err)}`);
        this.webSocketWorker = undefined;
        // Try to restart worker to process any remaining messages
        this.startWebSocketWorker();
      });
  }

  private async trySendToWebSocket(): Promise<number> {
    if (this.live) {
      // Refresh token once upfront to avoid repeated refreshes
      await this.medplum.refreshIfExpired();
      const accessToken = this.medplum.getAccessToken() as string;

      // Get all messages with status='received' in one query
      const dbMessages = this.hl7DurableQueue.getAllReceivedMessages();

      if (dbMessages.length === 0) {
        return 0;
      }

      // Send all messages and track results
      let successCount = 0;

      for (const dbMsg of dbMessages) {
        const agentMsg: AgentMessage = {
          type: 'agent:transmit:request',
          accessToken,
          channel: dbMsg.channel,
          remote: dbMsg.remote,
          contentType: ContentType.HL7_V2,
          body: dbMsg.raw_message,
          callback: dbMsg.callback,
        };

        try {
          if (!this.webSocket) {
            throw new Error('WebSocket not connected');
          }
          // Send via WebSocket
          this.webSocket.send(JSON.stringify(agentMsg));
          // Mark as sent IMMEDIATELY after sending to avoid race condition
          // where response arrives before status is updated
          this.hl7DurableQueue.markAsSent(dbMsg.id);
          successCount++;
        } catch (err) {
          this.log.error(`WebSocket error while attempting to send message: ${normalizeErrorString(err)}`);
          this.hl7DurableQueue.markAsError(dbMsg.id);
        }
      }

      return successCount;
    }
    return 0;
  }

  private trySendToHl7Connection(): void {
    // Process response messages from durable queue
    let dbMsg = this.hl7DurableQueue.getNextResponseQueuedMessage();
    while (dbMsg) {
      const channel = this.channels.get(dbMsg.channel);
      if (channel) {
        try {
          channel.sendToRemote({
            type: 'agent:transmit:response',
            channel: dbMsg.channel,
            remote: dbMsg.remote,
            contentType: ContentType.HL7_V2,
            body: dbMsg.response_message,
          });
          this.hl7DurableQueue.markAsResponseSent(dbMsg.id);
        } catch (err) {
          this.log.error(`Error sending HL7 response: ${normalizeErrorString(err)}`);
          this.hl7DurableQueue.markAsResponseError(dbMsg.id);
        }
      } else {
        this.log.warn(`Channel not found for response: ${dbMsg.channel}`);
        this.hl7DurableQueue.markAsResponseError(dbMsg.id);
      }

      dbMsg = this.hl7DurableQueue.getNextResponseQueuedMessage();
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
    const encoding = address.searchParams.get('encoding') ?? undefined;
    let msgReturnAck: ReturnAckCategory | undefined;
    try {
      msgReturnAck = this.parseReturnAck(message.returnAck);
    } catch (err) {
      this.log.error(normalizeErrorString(err));
      this.addToWebSocketQueue({
        type: 'agent:transmit:response',
        channel: message.channel,
        remote: message.remote,
        callback: message.callback,
        contentType: ContentType.TEXT,
        statusCode: 400,
        body: normalizeErrorString(err),
      } satisfies AgentTransmitResponse);
      return;
    }

    let defaultReturnAck: ReturnAckCategory | undefined;
    try {
      defaultReturnAck = this.parseReturnAck(address.searchParams.get('defaultReturnAck'));
    } catch (err) {
      this.log.warn(`${normalizeErrorString(err)} - falling back to default return ACK behavior of 'first'.`);
    }

    // Determine the effective returnAck with fallback chain:
    // 1. Per-message returnAck from AgentTransmitRequest (highest priority)
    // 2. defaultReturnAck from Device URL
    // 3. 'first' (default - for backwards compatibility)
    const returnAck = msgReturnAck ?? defaultReturnAck ?? ReturnAckCategory.FIRST;

    let pool: Hl7ClientPool;

    // Get or create the pool for this remote
    if (this.hl7Clients.has(message.remote)) {
      pool = this.hl7Clients.get(message.remote) as Hl7ClientPool;
    } else {
      const keepAlive = this.keepAlive;
      pool = new Hl7ClientPool({
        host: address.hostname,
        port: Number.parseInt(address.port, 10),
        encoding,
        keepAlive: this.keepAlive,
        maxClients: this.maxClientsPerRemote,
        log: this.log,
        heartbeatEmitter: this.heartbeatEmitter,
      });
      this.hl7Clients.set(message.remote, pool);
      if (keepAlive && this.logStatsFreqSecs > 0) {
        pool.startTrackingStats();
      }
      this.log.info(`Client pool created for remote '${message.remote}'`, {
        keepAlive: this.keepAlive,
        maxClients: this.maxClientsPerRemote,
        encoding,
        trackingStats: this.logStatsFreqSecs > 0,
      });
    }

    const requestMsg = Hl7Message.parse(message.body);
    const msh10 = requestMsg.getSegment('MSH')?.getField(10);
    if (!msh10) {
      this.log.error('MSH.10 is missing but required');
      return;
    }

    this.log.info(`[Request -- ID: ${msh10}]: ${requestMsg.toString().replaceAll('\r', '\n')}`);

    let forceClose = false;
    let client: EnhancedHl7Client;

    try {
      // Get a client from the pool
      client = pool.getClient();
    } catch (err) {
      this.log.error(`Failed to get client from pool: ${normalizeErrorString(err)}`);
      this.addToWebSocketQueue({
        type: 'agent:transmit:response',
        channel: message.channel,
        remote: message.remote,
        callback: message.callback,
        contentType: ContentType.TEXT,
        statusCode: 400,
        body: normalizeErrorString(err),
      } satisfies AgentTransmitResponse);
      return;
    }

    client
      .sendAndWait(requestMsg, { returnAck })
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

        // We mark that an error occurred so we can decide to force close the client or not below
        forceClose = true;
      })
      .finally(() => {
        // Release the client back to the pool
        pool.releaseClient(client, forceClose);
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

  /**
   * Parses and normalizes the `returnAck` mode parameter from the Device URL.
   *
   * @param rawValue - The raw query parameter value retrieved from the Device URL (e.g., 'application', 'first', or undefined).
   * @returns The parsed `ReturnAckCategory` enum value.
   */
  private parseReturnAck(rawValue: string | null | undefined): ReturnAckCategory | undefined {
    if (!rawValue) {
      return undefined;
    }

    const normalizedValue = rawValue.toLowerCase();

    if (normalizedValue === 'application') {
      return ReturnAckCategory.APPLICATION;
    }

    if (normalizedValue === 'first') {
      return ReturnAckCategory.FIRST;
    }

    throw new Error(`Invalid value for returnAck; expected: 'first' or 'application', received: ${rawValue}`);
  }
}
