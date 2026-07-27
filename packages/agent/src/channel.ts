// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { AgentTransmitResponse, ILogger } from '@medplum/core';
import type { AgentChannel, Endpoint } from '@medplum/fhirtypes';
import type { App } from './app';
import type { AgentRetryDefaults } from './queue/worker';

/**
 * A single problem found while validating an agent config, before any of it is applied.
 *
 * Issues are accumulated across the whole config -- every channel and every agent-wide
 * setting -- so an operator sees all of them in one `$reload-config` round trip instead
 * of fixing them one at a time.
 *
 * `error` issues abort the reload with nothing applied. `warning` issues are logged and
 * the config is applied anyway, preserving the agent's long-standing warn-and-default
 * behavior for malformed channel params -- unless the `strictConfigValidation` agent
 * setting is on, which promotes every warning to an error.
 */
export interface ChannelConfigIssue {
  severity: 'error' | 'warning';
  /** Stable slug for tests and log filtering, e.g. `invalid-port`, `port-unavailable`. */
  code: string;
  /** The `AgentChannel.name` this issue belongs to; absent for agent-wide setting issues. */
  channel?: string;
  /** Where in the config the problem is, e.g. `endpoint.address`, `startChar`, `setting.queueRetentionDays`. */
  field?: string;
  message: string;
}

/**
 * Agent-wide inputs a channel validator needs but cannot reach from a static method
 * (a static has no `App` to read them off of).
 */
export interface ChannelValidationContext {
  /** Agent-wide `channelRetryMode` / `channelAutoRetry*` settings the channel layers its URL params over. */
  retryDefaults: AgentRetryDefaults;
  /** Whether the durable queue will be open once this config is applied. */
  durableQueueOn: boolean;
}

/**
 * The static side of a channel class: constructible, and able to validate a config
 * without* being constructed.
 *
 * Validation has to be static because channel constructors have side effects --
 * {@link AgentHl7Channel} registers a heartbeat listener via its `ChannelStatsTracker`,
 * {@link AgentDicomChannel} creates a temp dir -- so constructing a channel just to
 * validate it and then discarding it would leak. TypeScript has no `abstract static`,
 * so the contract is expressed here and enforced by {@link App.channelClassFor}, whose
 * return type is this interface: a channel class missing `validateConfig` fails to
 * compile there.
 */
export interface ChannelConstructor {
  new (app: App, definition: AgentChannel, endpoint: Endpoint): Channel;
  /**
   * Checks a channel definition + endpoint for problems, without touching any live state.
   *
   * Must be a pure function of its arguments: it runs during the validate phase, before
   * anything at all has been mutated, and may be called for a channel that does not exist
   * yet. It should mirror exactly what the channel's `start()` / `configure*()` path can
   * throw on, so those paths are never reached with input they would reject.
   *
   * Callers guarantee `endpoint.address` is non-empty and parses as a URL whose scheme
   * maps to this channel type, so implementations may safely `new URL(endpoint.address)`.
   *
   * @param definition - The channel definition from the agent config.
   * @param endpoint - The resolved endpoint for the channel.
   * @param ctx - Agent-wide settings the channel layers its endpoint params over.
   * @returns Every issue found; empty when the config is valid.
   */
  validateConfig(definition: AgentChannel, endpoint: Endpoint, ctx: ChannelValidationContext): ChannelConfigIssue[];
}

export interface Channel {
  readonly log: ILogger;
  readonly channelLog: ILogger;
  start(): Promise<void>;
  stop(): Promise<void>;
  sendToRemote(message: AgentTransmitResponse): boolean;
  reloadConfig(definition: AgentChannel, endpoint: Endpoint): Promise<void>;
  validateConfig(definition: AgentChannel, endpoint: Endpoint, ctx: ChannelValidationContext): ChannelConfigIssue[];
  getDefinition(): AgentChannel;
  getEndpoint(): Endpoint;
}

export abstract class BaseChannel implements Channel {
  readonly app: App;
  protected definition: AgentChannel;
  protected endpoint: Endpoint;

  constructor(app: App, definition: AgentChannel, endpoint: Endpoint) {
    this.app = app;
    this.definition = definition;
    this.endpoint = endpoint;
  }

  abstract readonly log: ILogger;
  abstract readonly channelLog: ILogger;
  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
  abstract sendToRemote(message: AgentTransmitResponse): boolean;
  abstract reloadConfig(definition: AgentChannel, endpoint: Endpoint): Promise<void>;

  /**
   * Instance-side convenience for validating a *prospective* config against this
   * channel's own type, delegating to the subclass's static implementation so the
   * rules live in exactly one place per channel.
   * @param definition - The prospective channel definition.
   * @param endpoint - The prospective endpoint.
   * @param ctx - Agent-wide settings the channel layers its endpoint params over.
   * @returns Every issue found; empty when the config is valid.
   */
  validateConfig(definition: AgentChannel, endpoint: Endpoint, ctx: ChannelValidationContext): ChannelConfigIssue[] {
    return (this.constructor as unknown as ChannelConstructor).validateConfig(definition, endpoint, ctx);
  }

  getDefinition(): AgentChannel {
    return this.definition;
  }

  getEndpoint(): Endpoint {
    return this.endpoint;
  }
}

export const ChannelType = {
  HL7_V2: 'HL7_V2',
  DICOM: 'DICOM',
  BYTE_STREAM: 'BYTE_STREAM',
} as const;
export type ChannelType = (typeof ChannelType)[keyof typeof ChannelType];

export function getChannelType(endpoint: Endpoint): ChannelType {
  if (endpoint.address.startsWith('dicom')) {
    return ChannelType.DICOM;
  }
  if (endpoint.address.startsWith('mllp')) {
    return ChannelType.HL7_V2;
  }
  if (endpoint.address.startsWith('tcp')) {
    return ChannelType.BYTE_STREAM;
  }
  throw new Error(`Unsupported endpoint type: ${endpoint.address}`);
}

export function getChannelTypeShortName(endpoint: Endpoint): string {
  try {
    const channelType = getChannelType(endpoint);
    switch (channelType) {
      case ChannelType.HL7_V2:
        return 'HL7';
      case ChannelType.DICOM:
        return 'DICOM';
      case ChannelType.BYTE_STREAM:
        return 'Byte Stream';
      default:
        channelType satisfies never;
        throw new Error('Unreachable');
    }
  } catch (err) {
    throw new Error(`Invalid endpoint type with address '${endpoint.address}'`, { cause: err });
  }
}
