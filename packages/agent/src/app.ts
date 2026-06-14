// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type {
  AgentError,
  AgentLogsRequest,
  AgentMessage,
  AgentReloadConfigResponse,
  AgentStats,
  AgentStatsRequest,
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
  fetchVersionManifest,
  isValidHostname,
  normalizeErrorString,
  sleep,
} from '@medplum/core';
import type { Agent, AgentChannel, Endpoint, OperationOutcomeIssue } from '@medplum/fhirtypes';
import { DEFAULT_ENCODING, ReturnAckCategory } from '@medplum/hl7';
import assert from 'node:assert';
import type { ChildProcess, ExecException, ExecOptionsWithStringEncoding } from 'node:child_process';
import { exec, spawn } from 'node:child_process';
import { existsSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { isIPv4, isIPv6 } from 'node:net';
import { platform } from 'node:os';
import process from 'node:process';
import * as semver from 'semver';
import WebSocket from 'ws';
import { AgentByteStreamChannel } from './bytestream';
import type { Channel } from './channel';
import { ChannelType, getChannelType, getChannelTypeShortName } from './channel';
import {
  DEFAULT_MAX_CLIENTS_PER_REMOTE,
  DEFAULT_PING_TIMEOUT,
  HEARTBEAT_PERIOD_MS,
  MAX_MISSED_HEARTBEATS,
  MAX_NOT_LIVE_HEARTBEATS,
  RETRY_WAIT_DURATION_MS,
} from './constants';
import { AgentDicomChannel } from './dicom';
import type { EnhancedHl7Client } from './enhanced-hl7-client';
import { AgentHl7Channel } from './hl7';
import { Hl7ClientPool } from './hl7-client-pool';
import { isWinstonWrapperLogger } from './logger';
import { createPidFile, forceKillApp, isAppRunning, removePidFile, waitForPidFile } from './pid';
import { DurableQueue } from './queue/durable-queue';
import { QueueLeaseManager } from './queue/lease-manager';
import { RetentionSweeper } from './queue/retention';
import type { ChannelQueueWorker, RetryPolicy } from './queue/worker';
import { getCurrentStats, updateStat } from './stats';
import type { HeartbeatEmitter } from './types';
import { UPGRADER_LOG_PATH, UPGRADE_MANIFEST_PATH, parseDownloadUrl } from './upgrader-utils';

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

/** Upper bound on how long {@link App.stop} waits for clients/channels to drain. */
const STOP_DRAIN_TIMEOUT_MS = 10_000;

/**
 * Resolves to `'timeout'` if `promise` doesn't settle within `ms`. The timer is
 * cleared when the promise settles first, so the common path leaves nothing
 * keeping the event loop alive.
 * @param promise - The promise to wait on.
 * @param ms - Maximum time to wait, in milliseconds.
 * @returns The promise's value, or the literal `'timeout'`.
 */
function raceWithTimeout<T>(promise: Promise<T>, ms: number): Promise<T | 'timeout'> {
  return new Promise<T | 'timeout'>((resolve, reject) => {
    const timer = setTimeout(() => resolve('timeout'), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

export interface AppOptions {
  mainLogger?: ILogger;
  channelLogger?: ILogger;
}

interface UpgradeManifest {
  previousVersion: string;
  targetVersion: string;
  callback: string | null;
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
  readonly hl7Clients = new Map<string, Hl7ClientPool>();
  heartbeatPeriod = HEARTBEAT_PERIOD_MS; // 10 seconds
  private heartbeatTimer?: NodeJS.Timeout;
  readonly heartbeatEmitter: HeartbeatEmitter = new TypedEventTarget();
  private outstandingHeartbeats = 0;
  private notLiveHeartbeats = 0;
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
  private durableQueue: DurableQueue | undefined;
  // Agent-wide channelAutoRetry* settings; fields left undefined fall through to
  // DEFAULT_RETRY_POLICY when channels resolve their per-channel policy.
  private channelRetrySettings: Partial<RetryPolicy> = {};
  private retentionSweeper: RetentionSweeper | undefined;
  private leaseManager: QueueLeaseManager | undefined;
  private queueCheckpointListener: (() => void) | undefined;
  // Whether this process owns the `medplum-agent` PID, i.e. it is the sole agent that should
  // touch the data plane. A normally-started agent is primary from the outset (main.ts creates
  // the PID before start()). An upgrading agent stays non-primary until it wins the PID from the
  // outgoing agent, so that the two overlapping processes don't both send to the same remote.
  private isPrimary = false;

  constructor(medplum: MedplumClient, agentId: string, logLevel?: LogLevel, options?: AppOptions) {
    App.instance = this;
    this.medplum = medplum;
    this.agentId = agentId;
    this.log = options?.mainLogger ?? new Logger((msg) => console.log(msg), undefined, logLevel);
    this.channelLog = options?.channelLogger ?? new Logger((msg) => console.log(msg), undefined, logLevel);
  }

  async start(): Promise<void> {
    this.log.info('Medplum service starting...');

    // A normally-started agent already holds the `medplum-agent` PID (created in main.ts), so it is
    // primary immediately. An upgrading agent is finalizing an upgrade and only becomes primary once
    // it wins that PID from the outgoing agent (see tryToCreateAgentPidFile). Until then it stays
    // connected for control-plane messages but does not touch the data plane.
    this.isPrimary = !existsSync(UPGRADE_MANIFEST_PATH);

    await this.startWebSocket();

    // Begin reloading the config and starting channel listeners, but DON'T wait for the listeners
    // to finish binding to their ports yet. During a zero-downtime upgrade, the previous agent is
    // still listening on those ports; it only releases them once we delete the upgrade manifest
    // below (which signals the installer to stop the old agent). If we awaited the binds here, we
    // would deadlock: waiting for ports the old agent won't free until we delete the manifest,
    // which we can't reach until the binds complete.
    const { listenersStarted } = await this.beginReloadConfig();

    // Delete the upgrade manifest (if present) now that the listeners are attempting to bind.
    // Removing it is the signal the installer waits on before stopping the previous agent, which
    // is what releases the ports our listeners are binding to.
    const upgradeManifest = this.consumeUpgradeManifest();

    // Now that the previous agent is being torn down, the listeners can finish binding.
    await listenersStarted;

    // We do this after starting WebSockets so that we can send a message if we finished upgrading.
    // We also do it after the listeners have bound, to make sure we've acquired the ports before
    // releasing the upgrading agent PID file.
    await this.maybeFinalizeUpgrade(upgradeManifest);

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

  /**
   * Reads and deletes the upgrade manifest if one is present.
   *
   * Deleting the manifest is intentionally decoupled from {@link App.maybeFinalizeUpgrade}: removing
   * the file is the signal the installer waits on before stopping the previous agent (which frees the
   * ports the new agent is binding to), so it must happen BEFORE we await the channel binds. Reporting
   * upgrade status and taking over the agent PID file happen afterwards in {@link App.maybeFinalizeUpgrade}.
   *
   * @returns The parsed manifest, or undefined if no upgrade is in progress.
   */
  private consumeUpgradeManifest(): UpgradeManifest | undefined {
    if (!existsSync(UPGRADE_MANIFEST_PATH)) {
      return undefined;
    }
    const upgradeFile = readFileSync(UPGRADE_MANIFEST_PATH, { encoding: 'utf-8' });
    const upgradeDetails = JSON.parse(upgradeFile) as UpgradeManifest;
    // Delete manifest -- this signals the installer that the new agent is up and binding,
    // so it can stop the previous agent and release the ports.
    unlinkSync(UPGRADE_MANIFEST_PATH);
    return upgradeDetails;
  }

  private async maybeFinalizeUpgrade(upgradeDetails: UpgradeManifest | undefined): Promise<void> {
    if (!upgradeDetails) {
      return;
    }

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

    await this.tryToCreateAgentPidFile();

    // Wait for upgrading agent PID file since it could have been created just a few ms ago
    await waitForPidFile('medplum-upgrading-agent');

    // Now make sure to remove it
    removePidFile('medplum-upgrading-agent');
  }

  private async tryToCreateAgentPidFile(): Promise<void> {
    // Should be ~ 500 seconds (500 ms wait x 1000 times)
    const maxAttempts = 10_000;
    let attempt = 0;
    let success = false;
    while (!success) {
      try {
        createPidFile('medplum-agent');
        success = true;
        // We now own the primary PID, so the outgoing agent has exited and it is safe to start
        // handling data-plane messages.
        this.isPrimary = true;
      } catch (_err) {
        this.log.info('Unable to create agent PID file, trying again...');
        attempt++;
        if (attempt === maxAttempts) {
          throw new Error('Too many unsuccessful attempts to create agent PID file');
        }
        await sleep(50);
      }
    }
  }

  private async startWebSocket(): Promise<void> {
    await this.connectWebSocket();
    this.heartbeatTimer = setInterval(() => {
      this.heartbeat().catch((err) => {
        // An unhandled rejection would crash the process
        this.log.error(`Error during heartbeat: ${normalizeErrorString(err)}`);
      });
    }, this.heartbeatPeriod);
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

    if (!this.live) {
      // The WebSocket can be open without the agent ever becoming live: the
      // `agent:connect:request` may have failed to send, or the server may have failed to
      // process it (without closing the socket). Neither side sends traffic on such a
      // connection, so nothing would ever break us out of this state -- force a reconnect
      // after enough heartbeat periods. This also acts as a backstop while the underlying
      // ReconnectingWebSocket is retrying on its own after a close.
      this.notLiveHeartbeats += 1;
      if (this.notLiveHeartbeats > MAX_NOT_LIVE_HEARTBEATS) {
        this.notLiveHeartbeats = 0;
        this.log.warn('Not connected to Medplum server after multiple heartbeat periods. Attempting to reconnect...');
        this.webSocket.reconnect();
      }
      return;
    }

    this.notLiveHeartbeats = 0;

    if (this.outstandingHeartbeats > MAX_MISSED_HEARTBEATS) {
      this.outstandingHeartbeats = 0;
      this.webSocket.reconnect();
      this.log.info('Disconnected from Medplum server. Attempting to reconnect...');
      return;
    }
    this.outstandingHeartbeats += 1;
    await this.sendToWebSocket({ type: 'agent:heartbeat:request' });
    this.lastHeartbeatSentTime = Date.now();

    // If there are queued messages but no worker draining them (e.g. the last drain attempt
    // failed on a transient error), retry on the heartbeat.
    if (this.webSocketQueue.length > 0) {
      this.startWebSocketWorker();
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
      try {
        await this.sendToWebSocket({
          type: 'agent:connect:request',
          accessToken: this.medplum.getAccessToken() as string,
          agentId: this.agentId,
        });
      } catch (err) {
        // This can fail if the access token is expired and refreshing it fails (e.g. the token
        // endpoint is briefly unreachable right after a network blip). An uncaught error here
        // would crash the process. We stay not-live, and the heartbeat forces a reconnect.
        this.log.error(`Error sending connect request: ${normalizeErrorString(err)}`);
      }
    });

    this.webSocket.addEventListener('close', () => {
      if (!this.shutdown && this.live) {
        this.live = false;
        this.log.info('WebSocket closed');
        // Give in-flight queue dispatches whose transmit request never hit the
        // wire a chance to return to `queued` instead of timing out into `errored`.
        this.forEachChannelWorker((worker) => worker.onWebSocketDisconnect());
      }
    });

    this.webSocket.addEventListener('message', async (e) => {
      let command: AgentMessage | undefined;
      try {
        const data = e.data as Buffer;
        const str = data.toString('utf8');
        this.log.debug(`Received from WebSocket: ${str.replaceAll('\r', '\n')}`);
        command = JSON.parse(str) as AgentMessage;
        switch (command.type) {
          // @ts-expect-error - Deprecated message type
          case 'connected':
          case 'agent:connect:response':
            this.live = true;
            // Reset the heartbeat counters so stale counts from a previous connection don't
            // trigger a premature reconnect.
            this.notLiveHeartbeats = 0;
            this.outstandingHeartbeats = 0;
            this.startWebSocketWorker();
            // Wake the channel queue workers — their loops idle (without
            // claiming rows) while the connection is down.
            this.forEachChannelWorker((worker) => worker.notify());
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
            // While finalizing an upgrade we may briefly overlap with the outgoing agent, which
            // receives the same broadcast and owns the inbound connection. Drop until we're primary.
            if (!this.isPrimary) {
              this.log.debug('Ignoring transmit response while not primary');
              break;
            }
            if (!command.callback) {
              this.log.warn('Transmit response missing callback');
            }
            // First, see if this response belongs to a durable-queue worker.
            // Workers own their callback IDs end-to-end; if any worker claims
            // this response, we skip the legacy in-memory path entirely.
            if (this.routeServerResponseToWorker(command)) {
              break;
            }
            if (this.config?.status !== 'active') {
              this.sendAgentDisabledError(command);
              // We check the existence of a statusCode for backwards compat
            } else if (command.statusCode === undefined || command.statusCode < 400) {
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
            // While finalizing an upgrade we may briefly overlap with the outgoing agent, which
            // receives the same broadcast and is still the primary sender. Drop until we're primary
            // so we don't send the same message to the remote twice.
            if (!this.isPrimary) {
              this.log.debug('Ignoring transmit request while not primary');
              break;
            }
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
          case 'agent:stats:request':
            await this.handleStatsRequest(command);
            break;
          case 'agent:error':
            this.log.error(command.body);
            break;
          default: {
            const errMsg = `Unknown message type: ${command.type}`;
            this.log.error(errMsg);
            await this.sendToWebSocket({
              type: 'agent:error',
              body: errMsg,
              callback: (command as { callback?: string }).callback,
            } satisfies AgentError);
          }
        }
      } catch (err) {
        const errMsg = `WebSocket error on incoming message: ${normalizeErrorString(err)}`;
        this.log.error(errMsg);
        try {
          await this.sendToWebSocket({
            type: 'agent:error',
            body: errMsg,
            callback: command?.callback,
          } satisfies AgentError);
        } catch (sendErr) {
          this.log.error(`Failed to send agent:error response: ${normalizeErrorString(sendErr)}`);
        }
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
    const { listenersStarted } = await this.beginReloadConfig();
    await listenersStarted;
  }

  /**
   * Reloads the agent config and begins (re)starting channel listeners, resolving as soon as the
   * listeners have been *kicked off* -- it does NOT wait for them to finish binding to their ports.
   * The returned `listenersStarted` promise resolves once all listeners have bound, or rejects with
   * the aggregated bind errors.
   *
   * This split exists for the zero-downtime upgrade flow; see {@link App.start} and
   * {@link App.consumeUpgradeManifest} for why binding must be deferred past manifest deletion.
   *
   * @returns An object whose `listenersStarted` promise resolves once all channel listeners have bound.
   */
  private async beginReloadConfig(): Promise<{ listenersStarted: Promise<void> }> {
    const agent = await this.medplum.readResource('Agent', this.agentId, { cache: 'no-cache' });
    const keepAlive = agent?.setting?.find((setting) => setting.name === 'keepAlive')?.valueBoolean;
    const maxClientsPerRemote = agent?.setting?.find((setting) => setting.name === 'maxClientsPerRemote')?.valueInteger;
    const logStatsFreqSecs = agent?.setting?.find((setting) => setting.name === 'logStatsFreqSecs')?.valueInteger;
    const durableQueueOn = agent?.setting?.find((setting) => setting.name === 'durableQueue')?.valueBoolean ?? false;
    const queueDbPath = agent?.setting?.find((setting) => setting.name === 'queueDbPath')?.valueString;
    const queueRetentionDays = agent?.setting?.find((setting) => setting.name === 'queueRetentionDays')?.valueInteger;
    const queueRetentionMaxMb = agent?.setting?.find((setting) => setting.name === 'queueRetentionMaxMb')?.valueInteger;
    const queueErroredRetentionDays = agent?.setting?.find(
      (setting) => setting.name === 'queueErroredRetentionDays'
    )?.valueInteger;
    const queueSweepIntervalSecs = agent?.setting?.find(
      (setting) => setting.name === 'queueSweepIntervalSecs'
    )?.valueInteger;

    // Agent-wide auto-retry defaults. Channels layer their endpoint URL params
    // (autoRetry, autoRetryBaseDelayMs, ...) over these when resolving their
    // RetryPolicy in configureHl7ServerAndConnections.
    this.channelRetrySettings = {
      enabled: agent?.setting?.find((setting) => setting.name === 'channelAutoRetry')?.valueBoolean,
      guaranteedDelivery: agent?.setting?.find((setting) => setting.name === 'channelGuaranteedDelivery')?.valueBoolean,
      baseDelayMs: agent?.setting?.find((setting) => setting.name === 'channelAutoRetryBaseDelayMs')?.valueInteger,
      maxDelayMs: agent?.setting?.find((setting) => setting.name === 'channelAutoRetryMaxDelayMs')?.valueInteger,
      maxAttempts: agent?.setting?.find((setting) => setting.name === 'channelAutoRetryMaxAttempts')?.valueInteger,
      backoffMultiplier: agent?.setting?.find((setting) => setting.name === 'channelAutoRetryBackoffMultiplier')
        ?.valueDecimal,
    };

    // If the keepAlive setting changed, we need to reset the pools we have
    if (this.keepAlive !== keepAlive) {
      const results = await Promise.allSettled(Array.from(this.hl7Clients.values()).map((pool) => pool.closeAll()));
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
      this.logStatsTimer ??= setInterval(() => this.logStats(), this.logStatsFreqSecs * 1000);
    }

    this.reconcileDurableQueue({
      durableQueueOn,
      queueDbPath,
      queueRetentionDays,
      queueRetentionMaxMb,
      queueErroredRetentionDays,
      queueSweepIntervalSecs,
    });

    const startPromises = await this.hydrateListeners();
    return { listenersStarted: this.waitForChannelsToStart(startPromises) };
  }

  /**
   * Opens, closes, or reconfigures the durable queue based on the latest config.
   *
   * Toggling `durableQueue` between true and false at runtime triggers a queue
   * open/close. Toggling other queue settings (retention, sweep interval) starts
   * a fresh {@link RetentionSweeper} against the existing DB without reopening it.
   *
   * Changing `queueDbPath` while the queue is already open is intentionally NOT
   * supported — that would require moving / closing the existing DB. Operators
   * who need to change the path should disable the queue, then re-enable with the
   * new path.
   * @param args - The current queue-related settings drawn from the Agent resource.
   * @param args.durableQueueOn - Master switch — true to open the queue, false to close it.
   * @param args.queueDbPath - Optional override for the DB file path (defaults to `<logDir>/medplum-agent-queue.sqlite`).
   * @param args.queueRetentionDays - Time-based retention window for `processed` rows, in days.
   * @param args.queueRetentionMaxMb - Soft cap on DB size, in MiB.
   * @param args.queueErroredRetentionDays - Floor on `errored` / `nacked` retention, in days.
   * @param args.queueSweepIntervalSecs - How often the retention sweeper runs, in seconds.
   */
  private reconcileDurableQueue(args: {
    durableQueueOn: boolean;
    queueDbPath: string | undefined;
    queueRetentionDays: number | undefined;
    queueRetentionMaxMb: number | undefined;
    queueErroredRetentionDays: number | undefined;
    queueSweepIntervalSecs: number | undefined;
  }): void {
    if (!args.durableQueueOn) {
      if (this.durableQueue) {
        this.log.info('durableQueue disabled — closing queue.');
        this.removeQueueCheckpointListener();
        this.leaseManager?.stop();
        this.leaseManager = undefined;
        this.retentionSweeper?.stop();
        this.retentionSweeper = undefined;
        this.durableQueue.close();
        this.durableQueue = undefined;
      }
      return;
    }

    if (!this.durableQueue) {
      const path = args.queueDbPath ?? this.defaultQueueDbPath();
      try {
        this.durableQueue = DurableQueue.open({ path, log: this.log });
        this.log.info(`Durable queue opened at ${path}.`);
      } catch (err) {
        this.log.error(`Failed to open durable queue at ${path}: ${normalizeErrorString(err)}`);
        this.durableQueue = undefined;
        return;
      }
    }

    // Flush the WAL on every heartbeat tick (same idiom as ChannelStatsTracker /
    // Hl7ClientPool GC). SQLite only attempts checkpoints piggybacked on commits,
    // so once traffic stops nothing else would drain the WAL until the hourly
    // sweep or close(). checkpointWalIfDirty() is a no-op on an idle queue.
    if (!this.queueCheckpointListener) {
      const queue = this.durableQueue;
      this.queueCheckpointListener = () => queue.checkpointWalIfDirty();
      this.heartbeatEmitter.addEventListener('heartbeat', this.queueCheckpointListener);
    }

    // Start the lease manager — it'll attempt acquisition immediately and, on
    // success, the callback runs recoverOnStartup() + brings up channel workers.
    // If a peer (e.g. an old agent in the upgrade overlap) holds the lease, we
    // sit as a follower until the lease is free, then take over.
    if (!this.leaseManager) {
      this.leaseManager = new QueueLeaseManager({ queue: this.durableQueue, log: this.log });
      this.leaseManager.start(() => this.onBecameQueueLeader());
    }

    // (Re)start the retention sweeper with the latest settings. The sweeper runs
    // regardless of leadership because its only writes are DELETEs of terminal
    // rows; both processes running it concurrently is wasteful but not unsafe.
    // (We could gate it on leadership too — left ungated for now since the cost
    // during the brief overlap is small.)
    this.retentionSweeper?.stop();
    this.retentionSweeper = new RetentionSweeper({
      queue: this.durableQueue,
      log: this.log,
      retentionDays: args.queueRetentionDays,
      maxSizeMb: args.queueRetentionMaxMb,
      erroredRetentionDays: args.queueErroredRetentionDays,
      sweepIntervalSecs: args.queueSweepIntervalSecs,
    });
    this.retentionSweeper.start();
  }

  /** Unsubscribes the WAL-checkpoint heartbeat listener, if registered. Idempotent. */
  private removeQueueCheckpointListener(): void {
    if (this.queueCheckpointListener) {
      this.heartbeatEmitter.removeEventListener('heartbeat', this.queueCheckpointListener);
      this.queueCheckpointListener = undefined;
    }
  }

  /**
   * Called by the {@link QueueLeaseManager} the first time we take the lease.
   *
   * This is the single point that runs `recoverOnStartup` and spins up the
   * channel workers. Both depend on us being the only writer — running them at
   * raw queue-open time would race with any peer that still holds the lease.
   *
   * Re-entrancy: if we lose and regain the lease later, this fires again. The
   * recovery sweep is idempotent (no `processing` rows means no work), and
   * `maybeStartWorker` is a no-op if the worker is already running.
   */
  private onBecameQueueLeader(): void {
    const queue = this.durableQueue;
    if (!queue) {
      return;
    }
    const { failed, requeued } = queue.recoverOnStartup();
    if (failed > 0 || requeued > 0) {
      this.log.info(
        `Acquired queue lease — promoted ${failed} interrupted row(s) to failed, requeued ${requeued} guaranteed-delivery row(s).`
      );
    }
    // Tell every HL7 channel to start its worker now that we're leader.
    for (const channel of this.channels.values()) {
      if (channel instanceof AgentHl7Channel) {
        channel.onBecameQueueLeader();
      }
    }
  }

  /** @returns True when this agent currently holds the durable-queue lease. */
  isQueueLeader(): boolean {
    return this.leaseManager?.isLeader() ?? false;
  }

  /**
   * Default location for the queue DB file when no override is provided.
   *
   * Co-locating with the main logger's log directory keeps everything an
   * operator needs to mount a persistent volume in one place. The fallback is
   * the current working directory — same default an unconfigured agent uses.
   * @returns Absolute path to the default queue DB file.
   */
  private defaultQueueDbPath(): string {
    const baseDir =
      (isWinstonWrapperLogger(this.log) && (this.log as unknown as { logDir?: string }).logDir) || process.cwd();
    // Manual join to avoid pulling in node:path solely for this — the agent
    // doesn't need to support exotic path normalizations here.
    const sep = baseDir.endsWith('/') || baseDir.endsWith('\\') ? '' : '/';
    return `${baseDir}${sep}medplum-agent-queue.sqlite`;
  }

  /** @returns The opened {@link DurableQueue}, or undefined when the queue setting is off. */
  getDurableQueue(): DurableQueue | undefined {
    return this.durableQueue;
  }

  /** @returns The agent-wide channelAutoRetry* settings, used as per-channel policy defaults. */
  getChannelRetrySettings(): Partial<RetryPolicy> {
    return this.channelRetrySettings;
  }

  getStats(): AgentStats {
    const stats = getCurrentStats();
    let totalHl7Clients = 0;
    for (const pool of this.hl7Clients.values()) {
      totalHl7Clients += pool.size();
    }

    const hl7Channels = Array.from(this.channels.values()).filter((channel) => channel instanceof AgentHl7Channel);
    const channelStats = Object.fromEntries(
      hl7Channels.map((channel) => [channel.getDefinition().name, channel.stats.getStats()])
    );

    const pools = Array.from(this.hl7Clients.values());
    const clientStats = Object.fromEntries(
      pools.map((pool) => [
        `mllp://${pool.host}:${pool.port}?encoding=${pool.encoding ?? DEFAULT_ENCODING}`,
        pool.getPoolStats(),
      ])
    );

    return {
      ...stats,
      webSocketQueueDepth: this.webSocketQueue.length,
      hl7QueueDepth: this.hl7Queue.length,
      hl7ClientCount: totalHl7Clients,
      live: this.live,
      outstandingHeartbeats: this.outstandingHeartbeats,
      channelStats,
      clientStats,
      ...(this.durableQueue ? { durableQueue: this.getDurableQueueStats(this.durableQueue) } : {}),
    };
  }

  /**
   * Snapshot of durable-queue health, surfaced in `agent:stats:response`.
   *
   * Structured to fit the `AgentStatValue` shape — 3 nested levels of primitive
   * records — so `AgentStats`'s index signature stays satisfied. Null sentinels
   * become `-1` for the same reason ("never swept" reads as -1 on the wire).
   *
   * The field is only included when the queue is on; consumers that detect its
   * absence know the queue is disabled, which is more honest than reporting a
   * zeroed structure that a dashboard could misread as "queue on but idle."
   * @param queue - The opened durable queue to read counters from.
   * @returns A primitive-friendly snapshot fit for `AgentStats`.
   */
  private getDurableQueueStats(
    queue: DurableQueue
  ): Record<string, number | boolean | Record<string, number | Record<string, number>>> {
    const counts = queue.countByState();
    const channelDepth: Record<string, Record<string, number>> = {};
    for (const channel of this.channels.values()) {
      if (channel instanceof AgentHl7Channel) {
        const d = queue.getChannelDepth(channel.getDefinition().name);
        channelDepth[channel.getDefinition().name] = {
          queued: d.queued,
          processing: d.processing,
          // -1 means "no queued rows" (a zero-aged-row would be 0).
          oldestQueuedAgeMs: d.oldestQueuedAgeMs ?? -1,
        };
      }
    }
    const lastResult = this.retentionSweeper?.getLastResult();
    return {
      enabled: true,
      isLeader: this.isQueueLeader(),
      dbSizeBytes: queue.getDbSizeBytes(),
      countsByState: counts,
      channelDepth,
      // -1 means "never swept yet."
      lastSweepAt: this.retentionSweeper?.getLastSweepAt() ?? -1,
      lastSweepDeletedProcessed: lastResult?.deletedProcessed ?? -1,
      lastSweepDeletedErrored: lastResult?.deletedErrored ?? -1,
    };
  }

  private logStats(): void {
    assert(this.logStatsFreqSecs > 0, new Error('Can only log stats when logStatsFreqSecs > 0'));
    this.log.info('Agent stats', { stats: this.getStats() });
  }

  /**
   * This method should only be called by {@link App.beginReloadConfig}.
   *
   * Channel listener start promises are returned rather than awaited here, so the caller can delete
   * the upgrade manifest before waiting for the listeners to bind. See {@link App.start} for the
   * zero-downtime upgrade rationale.
   *
   * @returns The channel listener start promises for the caller to await.
   */
  private async hydrateListeners(): Promise<Promise<void>[]> {
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
    const startPromises: Promise<void>[] = [];

    for (let i = 0; i < filteredChannels.length; i++) {
      const definition = filteredChannels[i];
      const endpoint = filteredEndpoints[i];

      if (!endpoint.address) {
        this.log.warn(`Ignoring empty endpoint address: ${definition.name}`);
      }

      try {
        const newChannel = await this.reloadOrCreateChannel(definition, endpoint);
        if (newChannel) {
          // Kick off listener binding but defer awaiting it -- the caller deletes the upgrade manifest
          // before awaiting the start promises so the previous agent can release the ports. See {@link App.start}.
          // Only register the channel once it has successfully bound, so a failed start doesn't leave a
          // half-initialized channel in the map (which `stop()` would then choke on).
          startPromises.push(
            newChannel.start().then(() => {
              this.channels.set(definition.name, newChannel);
            })
          );
        }
      } catch (err) {
        errors.push(err as Error);
        this.log.error(normalizeErrorString(err));
      }
    }

    // If there were any errors thrown during reloading, throw them as one error.
    // Note: errors from actually binding the listeners are deferred into the returned
    // `startPromises` and surfaced separately by {@link App.waitForChannelsToStart}.
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

    return startPromises;
  }

  /**
   * Awaits the channel listener start promises returned by {@link App.hydrateListeners},
   * aggregating any bind failures into a single error (mirroring {@link App.hydrateListeners}).
   *
   * @param startPromises - The channel listener start promises to await.
   */
  private async waitForChannelsToStart(startPromises: Promise<void>[]): Promise<void> {
    const results = await Promise.allSettled(startPromises);
    const errors = results
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map((result) => result.reason as Error);

    if (!errors.length) {
      return;
    }

    for (const err of errors) {
      this.log.error(normalizeErrorString(err));
    }

    throw new OperationOutcomeError({
      resourceType: 'OperationOutcome',
      issue: [
        {
          severity: 'error',
          code: 'invalid',
          details: {
            text: `${errors.length} error(s) occurred while starting channel listeners`,
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

  /**
   * Reloads the config of an existing channel, or creates a new (unstarted) one.
   *
   * Starting the new channel is intentionally left to the caller ({@link App.hydrateListeners}),
   * which collects the unawaited `start()` promises so binding can be deferred past upgrade
   * manifest deletion. See {@link App.start} for the zero-downtime upgrade rationale.
   *
   * @param definition - The channel definition from the agent config.
   * @param endpoint - The endpoint for the channel.
   * @returns The newly created channel for the caller to start, or `undefined` if no new channel
   * was needed (config reload) or creating it failed.
   */
  private async reloadOrCreateChannel(definition: AgentChannel, endpoint: Endpoint): Promise<Channel | undefined> {
    const existingChannel = this.channels.get(definition.name);

    if (existingChannel) {
      const previousType = getChannelType(existingChannel.getEndpoint());
      const nextType = getChannelType(endpoint);

      if (previousType === nextType) {
        await existingChannel.reloadConfig(definition, endpoint);
        return undefined;
      }

      await existingChannel.stop();
      this.channels.delete(definition.name);
    }

    try {
      const channelType = getChannelType(endpoint);
      return this.createChannel(channelType, definition, endpoint);
    } catch (err) {
      this.log.error(normalizeErrorString(err));
      return undefined;
    }
  }

  private createChannel(channelType: ChannelType, definition: AgentChannel, endpoint: Endpoint): Channel {
    switch (channelType) {
      case ChannelType.DICOM:
        return new AgentDicomChannel(this, definition, endpoint);
      case ChannelType.HL7_V2:
        return new AgentHl7Channel(this, definition, endpoint);
      case ChannelType.BYTE_STREAM:
        return new AgentByteStreamChannel(this, definition, endpoint);
      default:
        throw new Error(`Unsupported endpoint type: ${endpoint.address}`);
    }
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

    // Drain clients and channels with a bounded wait. The durable-queue teardown
    // below must run no matter what happens here — skipping it leaves the WAL
    // unflushed and the lease held until its TTL expires — so a hung or throwing
    // stop must not be allowed to block shutdown indefinitely.
    try {
      const drained = await raceWithTimeout(this.drainForStop(), STOP_DRAIN_TIMEOUT_MS);
      if (drained === 'timeout') {
        this.log.warn(
          `Timed out after ${STOP_DRAIN_TIMEOUT_MS}ms waiting for clients/channels to stop — proceeding with shutdown.`
        );
      }
    } catch (err) {
      this.log.error(`Error while stopping clients/channels: ${normalizeErrorString(err)}`);
    }

    // Channels drain their own workers in stop() above, so by the time we get
    // here no worker is touching the DB and it's safe to tear down.
    this.removeQueueCheckpointListener();
    if (this.retentionSweeper) {
      this.retentionSweeper.stop();
      this.retentionSweeper = undefined;
    }
    // Release the lease BEFORE closing the DB so a waiting peer can take over
    // immediately rather than waiting for our TTL to expire.
    if (this.leaseManager) {
      this.leaseManager.stop();
      this.leaseManager = undefined;
    }
    if (this.durableQueue) {
      this.durableQueue.close();
      this.durableQueue = undefined;
    }

    this.log.info('Medplum service stopped successfully');
  }

  /**
   * Closes all outbound HL7 client pools, then stops every channel. Factored out
   * of {@link App.stop} so the whole drain can be raced against a single timeout.
   *
   * Uses allSettled rather than all: one channel failing to stop must not
   * abandon the wait on its siblings — the durable-queue DB is closed right
   * after this returns, so every channel that *can* drain must finish first.
   */
  private async drainForStop(): Promise<void> {
    if (this.hl7Clients.size !== 0) {
      const poolClosePromises = [];
      for (const pool of this.hl7Clients.values()) {
        poolClosePromises.push(pool.closeAll());
      }
      const poolResults = await Promise.allSettled(poolClosePromises);
      for (const result of poolResults) {
        if (result.status === 'rejected') {
          this.log.error(`Error while closing HL7 client pool: ${normalizeErrorString(result.reason)}`);
        }
      }
      this.hl7Clients.clear();
    }

    const channelStopPromises = [];
    for (const channel of this.channels.values()) {
      channelStopPromises.push(channel.stop());
    }
    const results = await Promise.allSettled(channelStopPromises);
    for (const result of results) {
      if (result.status === 'rejected') {
        this.log.error(`Error while stopping channel: ${normalizeErrorString(result.reason)}`);
      }
    }
  }

  /**
   * Dispatches an `agent:transmit:response` to the owning channel's worker, if any.
   * @param response - The response message received over the agent WebSocket.
   * @returns True if a worker claimed the response (caller should stop here);
   *          false if no worker matched and legacy handling should run.
   */
  private routeServerResponseToWorker(response: AgentTransmitResponse): boolean {
    if (!this.durableQueue) {
      return false;
    }
    if (!response.channel) {
      return false;
    }
    const channel = this.channels.get(response.channel);
    if (!(channel instanceof AgentHl7Channel) || !channel.worker) {
      return false;
    }
    // This channel is owned end-to-end by its durable-queue worker: when the
    // queue is on, inbound messages never use the legacy in-memory path, so
    // their responses must not either. Consume the response here unconditionally.
    // If the worker has no matching in-flight row — e.g. a late response that
    // arrived after the response timeout already errored/requeued the row, or
    // after a requeue/worker stop cleared the pending dispatch — onServerResponse
    // logs and drops it. Returning true regardless prevents it from falling
    // through to addToHl7Queue, which would re-send a stale ACK to the source.
    channel.worker.onServerResponse(response);
    return true;
  }

  addToWebSocketQueue(message: AgentMessage): void {
    this.webSocketQueue.push(message);
    this.startWebSocketWorker();
  }

  /** @returns True when the agent WebSocket is connected and the server has acknowledged the connect request. */
  isLive(): boolean {
    return this.live;
  }

  /**
   * Removes a not-yet-sent `agent:transmit:request` from the WebSocket queue.
   *
   * Used by {@link ChannelQueueWorker.onWebSocketDisconnect} to decide whether
   * an in-flight row can be safely requeued: a request still in this queue
   * provably never reached the server. A request not found here was either
   * already written to the socket or is mid-send — both ambiguous, so the
   * caller must treat `false` as "may have been delivered".
   * @param callbackId - The `callback` ID of the transmit request to remove.
   * @returns True if the request was found and removed before being sent.
   */
  removeUnsentTransmit(callbackId: string): boolean {
    const index = this.webSocketQueue.findIndex(
      (msg) => msg.type === 'agent:transmit:request' && msg.callback === callbackId
    );
    if (index === -1) {
      return false;
    }
    this.webSocketQueue.splice(index, 1);
    return true;
  }

  /**
   * Invokes `fn` for every channel that currently has a durable-queue worker running.
   * @param fn - Callback applied to each running {@link ChannelQueueWorker}.
   */
  private forEachChannelWorker(fn: (worker: ChannelQueueWorker) => void): void {
    for (const channel of this.channels.values()) {
      if (channel instanceof AgentHl7Channel && channel.worker) {
        fn(channel.worker);
      }
    }
  }

  addToHl7Queue(message: AgentMessage): void {
    this.hl7Queue.push(message);
    this.trySendToHl7Connection();
  }

  getAgentConfig(): Agent | undefined {
    return this.config;
  }

  private startWebSocketWorker(): void {
    if (this.webSocketWorker) {
      // Websocket worker is already running
      return;
    }

    // Start the worker
    this.webSocketWorker = this.trySendToWebSocket()
      .catch((err) => {
        this.log.error(`WebSocket worker error: ${normalizeErrorString(err)}`);
      })
      .finally(() => {
        // Always clear the worker, even on error -- otherwise the queue could never drain again.
        // The failed message was put back on the queue; the next enqueue (or the heartbeat)
        // restarts the worker.
        this.webSocketWorker = undefined;
      });
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
  }

  private trySendToHl7Connection(): void {
    while (this.hl7Queue.length > 0) {
      const msg = this.hl7Queue.shift();
      if (msg?.type === 'agent:transmit:response' && msg.channel) {
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
      // Clean up upgrade.json if it exists
      // The upgrade could be considered "in progress" due to a running upgrader process
      // even when the manifest was never written (or was already cleaned up),
      // so we must not assume the file exists here
      if (existsSync(UPGRADE_MANIFEST_PATH)) {
        unlinkSync(UPGRADE_MANIFEST_PATH);
      }
    }

    // Pre-check: verify artifact exists for this OS before spawning upgrader
    try {
      const release = await fetchVersionManifest('agent-upgrader', targetVersion);
      parseDownloadUrl(release, platform());
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
        child.on('message', (msg: { type: 'STARTED' } | { type: 'ERROR'; err: string }) => {
          clearTimeout(childTimeout);
          if (!['STARTED', 'ERROR'].includes(msg.type)) {
            reject(new Error(`Received unexpected message type ${msg.type}, expected 'STARTED' or 'ERROR'`));
          }
          if (msg.type === 'STARTED') {
            resolve();
          } else if (msg.type === 'ERROR') {
            reject(new Error(msg.err));
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

  private async handleStatsRequest(command: AgentStatsRequest): Promise<void> {
    try {
      await this.sendToWebSocket({
        type: 'agent:stats:response',
        statusCode: 200,
        stats: this.getStats(),
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
      message.accessToken = this.medplum.getAccessToken();
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
      const errMsg = 'Missing remote address';
      this.log.error(errMsg);
      this.addToWebSocketQueue({
        type: 'agent:error',
        callback: message.callback,
        body: errMsg,
      } satisfies AgentError);
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
      this.log.info(`Client pool created for remote '${message.remote}'`, {
        keepAlive: this.keepAlive,
        maxClients: this.maxClientsPerRemote,
        encoding,
      });
    }

    const requestMsg = Hl7Message.parse(message.body);
    const msh10 = requestMsg.getSegment('MSH')?.getField(10);
    if (!msh10) {
      const errMsg = 'MSH.10 is missing but required';
      this.log.error(errMsg);
      this.addToWebSocketQueue({
        type: 'agent:transmit:response',
        channel: message.channel,
        remote: message.remote,
        callback: message.callback,
        contentType: ContentType.TEXT,
        statusCode: 400,
        body: errMsg,
      } satisfies AgentTransmitResponse);
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
