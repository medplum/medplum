// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ILogger } from '@medplum/core';
import { LogLevel, OperationOutcomeError, normalizeErrorString } from '@medplum/core';
import type { Agent, AgentChannel, AgentSetting, Endpoint, OperationOutcomeIssue } from '@medplum/fhirtypes';
import { createServer } from 'node:net';
import type { ChannelConfigIssue, ChannelType } from './channel';
import { getChannelType } from './channel';
import type { AgentRetryDefaults } from './queue/worker';
import { isRetryMode } from './queue/worker';

/** Highest port number a TCP listener can bind to. */
const MAX_PORT = 65535;

/** Default time to wait for a probe bind to settle before giving up on the port. */
const DEFAULT_PROBE_TIMEOUT_MS = 1000;

/**
 * The agent-wide `Agent.setting` values, parsed and normalized.
 *
 * Produced by {@link parseAgentSettings} during the validate phase and applied wholesale
 * by `App.applyAgentSettings` only once the whole config has passed validation.
 */
export interface ParsedAgentSettings {
  keepAlive: boolean;
  maxClientsPerRemote: number | undefined;
  logStatsFreqSecs: number | undefined;
  durableQueueOn: boolean;
  queueDbPath: string | undefined;
  queueRetentionDays: number | undefined;
  queueRetentionMaxMb: number | undefined;
  queueErroredRetentionDays: number | undefined;
  queueSweepIntervalSecs: number | undefined;
  channelRetrySettings: AgentRetryDefaults;
  /** When true, every `warning` issue is promoted to an `error` and the reload is rejected. */
  strictConfigValidation: boolean;
}

/** A channel the new config wants running, with its address already parsed. */
export interface DesiredChannel {
  definition: AgentChannel;
  endpoint: Endpoint;
  type: ChannelType;
  port: number;
}

/**
 * A fully validated description of the channel set the agent should be running.
 *
 * Building a plan mutates nothing: if any part of the config is invalid, planning throws and
 * the agent keeps running exactly the config it had. It describes the desired *state*, not a
 * diff -- the work to get there is derived from the live channel map at apply time, so the
 * same plan stays correct when it is re-applied later against a map that has since changed
 * (rollback). Endpoints are captured resolved, so a re-apply needs no server round trip.
 */
export interface ConfigPlan {
  agent: Agent;
  settings: ParsedAgentSettings;
  /** The channels that should be running once this plan is applied. */
  desired: DesiredChannel[];
  /** Non-fatal issues, logged when the plan is applied. */
  warnings: ChannelConfigIssue[];
  /** Every resolved endpoint, positionally aligned with the agent's channel list, for the snapshot. */
  endpoints: Endpoint[];
}

/**
 * An {@link ILogger} that turns `warn` calls into {@link ChannelConfigIssue}s and drops
 * everything else.
 *
 * This exists so the channel validators can call the *existing* warn-and-default parsers
 * (`parseEnhancedMode`, `parseAppLevelAckMode`, `parseDuplicateBehavior`,
 * `resolveRetryPolicy`) unchanged, during the validate phase, and collect what they would
 * have logged. Every param rule -- including cross-field ones -- therefore has exactly one
 * implementation, shared between validation and the runtime configure path.
 *
 * @param channel - The channel name to stamp on collected issues, if any.
 * @param code - The issue code to stamp on collected issues.
 * @returns The collecting logger and the array it appends to.
 */
export function createIssueCollector(
  channel?: string,
  code = 'invalid-param'
): { log: ILogger; issues: ChannelConfigIssue[] } {
  const issues: ChannelConfigIssue[] = [];
  const log: ILogger = {
    level: LogLevel.WARN,
    warn: (message: string) => {
      issues.push({ severity: 'warning', code, channel, message });
    },
    error: () => undefined,
    info: () => undefined,
    debug: () => undefined,
    clone: () => log,
  };
  return { log, issues };
}

/**
 * Reads and validates every agent-wide `Agent.setting` value.
 *
 * Pure: settings are returned rather than assigned, so nothing is committed until the whole
 * config has passed validation. Malformed values are reported as warnings and fall back to
 * their defaults (matching the historical behavior), and are promoted to errors by the
 * caller when `strictConfigValidation` is on.
 *
 * @param agent - The agent config being validated.
 * @returns The parsed settings plus any issues found.
 */
export function parseAgentSettings(agent: Agent): {
  settings: ParsedAgentSettings;
  issues: ChannelConfigIssue[];
} {
  const issues: ChannelConfigIssue[] = [];
  const find = (name: string): AgentSetting | undefined => agent.setting?.find((setting) => setting.name === name);

  /**
   * Reads an integer setting, rejecting negatives and non-integers -- which every
   * count/duration setting here shares.
   * @param name - The setting name to read.
   * @returns The value, or undefined when unset or invalid.
   */
  const nonNegativeInteger = (name: string): number | undefined => {
    const value = find(name)?.valueInteger;
    if (value === undefined) {
      return undefined;
    }
    if (!Number.isInteger(value) || value < 0) {
      issues.push({
        severity: 'warning',
        code: 'invalid-setting',
        field: `setting.${name}`,
        message: `Invalid ${name} setting '${value}'; expected a non-negative integer. Ignoring.`,
      });
      return undefined;
    }
    return value;
  };

  const rawRetryMode = find('channelRetryMode')?.valueString;
  let retryMode: AgentRetryDefaults['mode'];
  if (rawRetryMode !== undefined) {
    const normalized = rawRetryMode.toLowerCase();
    if (isRetryMode(normalized)) {
      retryMode = normalized;
    } else {
      issues.push({
        severity: 'warning',
        code: 'invalid-setting',
        field: 'setting.channelRetryMode',
        message: `Invalid channelRetryMode setting '${rawRetryMode}'; expected 'none', 'normal', or 'guaranteed'. Ignoring.`,
      });
    }
  }

  const rawBackoffMultiplier = find('channelAutoRetryBackoffMultiplier')?.valueDecimal;
  let backoffMultiplier: number | undefined;
  if (rawBackoffMultiplier !== undefined) {
    if (Number.isFinite(rawBackoffMultiplier) && rawBackoffMultiplier > 0) {
      backoffMultiplier = rawBackoffMultiplier;
    } else {
      issues.push({
        severity: 'warning',
        code: 'invalid-setting',
        field: 'setting.channelAutoRetryBackoffMultiplier',
        message: `Invalid channelAutoRetryBackoffMultiplier setting '${rawBackoffMultiplier}'; expected a positive number. Ignoring.`,
      });
    }
  }

  const settings: ParsedAgentSettings = {
    keepAlive: find('keepAlive')?.valueBoolean ?? false,
    maxClientsPerRemote: nonNegativeInteger('maxClientsPerRemote'),
    logStatsFreqSecs: nonNegativeInteger('logStatsFreqSecs'),
    durableQueueOn: find('durableQueue')?.valueBoolean ?? false,
    queueDbPath: find('queueDbPath')?.valueString,
    queueRetentionDays: nonNegativeInteger('queueRetentionDays'),
    queueRetentionMaxMb: nonNegativeInteger('queueRetentionMaxMb'),
    queueErroredRetentionDays: nonNegativeInteger('queueErroredRetentionDays'),
    queueSweepIntervalSecs: nonNegativeInteger('queueSweepIntervalSecs'),
    channelRetrySettings: {
      mode: retryMode,
      baseDelayMs: nonNegativeInteger('channelAutoRetryBaseDelayMs'),
      maxDelayMs: nonNegativeInteger('channelAutoRetryMaxDelayMs'),
      maxAttempts: nonNegativeInteger('channelAutoRetryMaxAttempts'),
      backoffMultiplier,
    },
    strictConfigValidation: find('strictConfigValidation')?.valueBoolean ?? false,
  };

  return { settings, issues };
}

/**
 * Validates the parts of a channel that are common to every channel type: that the endpoint
 * resolved, that its address is present, parses, uses a supported scheme, and carries a real
 * port, and that neither the port nor the channel name collides with another channel.
 *
 * Runs before the per-type `validateConfig` statics, which rely on those guarantees.
 *
 * @param channels - The channel definitions from the agent config.
 * @param endpoints - The resolved endpoints, positionally matching `channels`; `undefined` where the read failed.
 * @returns The channels that passed, along with every issue found.
 */
export function validateChannelStructure(
  channels: AgentChannel[],
  endpoints: (Endpoint | undefined)[]
): { valid: DesiredChannel[]; issues: ChannelConfigIssue[] } {
  const issues: ChannelConfigIssue[] = [];
  const valid: DesiredChannel[] = [];
  const seenNames = new Set<string>();
  // port -> [channel name, address] of the first channel that claimed it
  const claimedPorts = new Map<number, [string, string]>();

  for (let i = 0; i < channels.length; i++) {
    const definition = channels[i];
    const endpoint = endpoints[i];

    if (seenNames.has(definition.name)) {
      issues.push({
        severity: 'error',
        code: 'duplicate-channel-name',
        channel: definition.name,
        message: `Invalid agent config. Duplicate channel name '${definition.name}'`,
      });
      continue;
    }
    seenNames.add(definition.name);

    if (!endpoint) {
      issues.push({
        severity: 'error',
        code: 'missing-endpoint',
        channel: definition.name,
        field: 'endpoint',
        message: `Unable to read endpoint '${definition.endpoint?.reference}' for channel '${definition.name}'`,
      });
      continue;
    }

    if (!endpoint.address) {
      issues.push({
        severity: 'error',
        code: 'empty-address',
        channel: definition.name,
        field: 'endpoint.address',
        message: `Invalid empty endpoint address for channel '${definition.name}'`,
      });
      continue;
    }

    let address: URL;
    try {
      address = new URL(endpoint.address);
    } catch (err: unknown) {
      issues.push({
        severity: 'error',
        code: 'invalid-address',
        channel: definition.name,
        field: 'endpoint.address',
        message: `Error while validating endpoint address for channel '${definition.name}': ${normalizeErrorString(err)}`,
      });
      continue;
    }

    let type: ChannelType;
    try {
      type = getChannelType(endpoint);
    } catch (err: unknown) {
      issues.push({
        severity: 'error',
        code: 'unsupported-endpoint-type',
        channel: definition.name,
        field: 'endpoint.address',
        message: normalizeErrorString(err),
      });
      continue;
    }

    // An address with no port used to reach `server.listen(NaN)`, which silently binds an
    // arbitrary free port -- the channel comes up on a port nobody configured.
    const port = Number.parseInt(address.port, 10);
    if (!Number.isInteger(port) || port < 1 || port > MAX_PORT) {
      issues.push({
        severity: 'error',
        code: 'invalid-port',
        channel: definition.name,
        field: 'endpoint.address',
        message: `Invalid port '${address.port}' in endpoint address for channel '${definition.name}'; expected an integer from 1 to ${MAX_PORT}`,
      });
      continue;
    }

    const conflict = claimedPorts.get(port);
    if (conflict) {
      const [conflictingChannel, conflictingAddress] = conflict;
      issues.push({
        severity: 'error',
        code: 'duplicate-port',
        channel: definition.name,
        field: 'endpoint.address',
        message: `Invalid agent config. Both '${conflictingChannel}' (${conflictingAddress}) and '${definition.name}' (${endpoint.address}) declare use of port ${port}`,
      });
      continue;
    }
    claimedPorts.set(port, [definition.name, endpoint.address]);

    valid.push({ definition, endpoint, type, port });
  }

  return { valid, issues };
}

/**
 * Checks that a TCP port is actually bindable, right now, by binding it and letting go.
 *
 * This is what turns the most common real-world config failure -- something else already
 * owns the port -- into a validation error raised while the old config is still running and
 * fully revertible. It matters most for HL7 and DICOM, whose servers retry `EADDRINUSE`
 * indefinitely and so never surface a conflict as a failed `start()` at all.
 *
 * Binds on all interfaces rather than the address's hostname, matching what the channels
 * themselves do: probing `127.0.0.1` for `mllp://localhost:9001` would pass while the real
 * bind on `0.0.0.0` fails. `exclusive` is set because the default lets a bind succeed by
 * joining a shared cluster handle instead of proving the port is free.
 *
 * Inherently TOCTOU: a third party can take the port between the probe and the real bind.
 * Rollback is the backstop for that.
 *
 * @param port - The port to probe.
 * @param timeoutMs - How long to wait for the bind to settle.
 * @returns Resolves if the port is bindable; rejects with the bind error otherwise.
 */
export async function probePort(port: number, timeoutMs = DEFAULT_PROBE_TIMEOUT_MS): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const server = createServer();
    const timer = setTimeout(() => {
      server.close();
      reject(new Error(`Timed out after ${timeoutMs}ms probing port ${port}`));
    }, timeoutMs);

    const settle = (err?: Error): void => {
      clearTimeout(timer);
      server.removeAllListeners();
      if (err) {
        server.close();
        reject(err);
      } else {
        server.close(() => resolve());
      }
    };

    server.once('error', (err: Error & { code?: string }) => {
      settle(new Error(`Unable to bind port ${port}: ${err.code ?? normalizeErrorString(err)}`));
    });
    server.once('listening', () => settle());
    server.listen({ port, exclusive: true });
  });
}

/**
 * Probes every port in `targets` concurrently.
 * @param targets - The ports to probe, each tagged with the channel that wants it.
 * @param timeoutMs - Per-probe timeout.
 * @returns One `port-unavailable` issue per port that could not be bound.
 */
export async function probePorts(
  targets: { port: number; channel: string }[],
  timeoutMs = DEFAULT_PROBE_TIMEOUT_MS
): Promise<ChannelConfigIssue[]> {
  const results = await Promise.allSettled(targets.map((target) => probePort(target.port, timeoutMs)));
  const issues: ChannelConfigIssue[] = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'rejected') {
      issues.push({
        severity: 'error',
        code: 'port-unavailable',
        channel: targets[i].channel,
        field: 'endpoint.address',
        message: `Channel '${targets[i].channel}' cannot start: ${normalizeErrorString(result.reason)}`,
      });
    }
  }
  return issues;
}

/**
 * Renders an issue as an `OperationOutcomeIssue`.
 *
 * The location goes in `diagnostics` rather than `expression` because
 * `operationOutcomeIssueToString` renders `diagnostics` inline -- so the single error string
 * the agent sends back over the websocket carries each problem *and* where it is, with no
 * server-side change needed.
 *
 * @param issue - The issue to render.
 * @returns The equivalent `OperationOutcomeIssue`.
 */
export function toOperationOutcomeIssue(issue: ChannelConfigIssue): OperationOutcomeIssue {
  const context = [issue.channel, issue.field].filter(Boolean).join('.');
  return {
    severity: issue.severity,
    code: issue.severity === 'warning' ? 'informational' : 'invalid',
    details: { text: issue.message },
    ...(context ? { diagnostics: context } : {}),
  };
}

/**
 * Bundles every issue into a single error, so one reload reports every problem at once.
 * @param issues - The issues to report.
 * @param summary - Leading summary line.
 * @returns The error to throw.
 */
export function configIssuesToError(issues: ChannelConfigIssue[], summary: string): OperationOutcomeError {
  return new OperationOutcomeError({
    resourceType: 'OperationOutcome',
    issue: [{ severity: 'error', code: 'invalid', details: { text: summary } }, ...issues.map(toOperationOutcomeIssue)],
  });
}
