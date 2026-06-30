// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { AgentSettingDef, AgentSettingsSchema, AgentSettingType } from '@medplum/core';
import { MEDPLUM_VERSION } from '@medplum/core';
import type { Agent, AgentSettingValue } from '@medplum/fhirtypes';

/**
 * The declarative manifest of every setting this agent build supports.
 *
 * This is the SINGLE SOURCE OF TRUTH for agent settings: {@link App.beginReloadConfig} reads settings
 * through this manifest (see {@link readAgentSetting}), and the release build serializes it to
 * `agent-settings-schema.json` (see the "Generate agent settings schema" step in
 * `.github/workflows/publish.yml`) so the Medplum App can render a version-accurate editor without
 * hardcoding any setting names or versions.
 *
 * The numeric/boolean `default`s here mirror the effective defaults applied elsewhere in the agent
 * (e.g. {@link DEFAULT_RETRY_POLICY}, the queue retention defaults). `settings-manifest.test.ts` asserts
 * they stay in sync with those source constants -- update both together.
 */
export const AGENT_SETTINGS_MANIFEST: AgentSettingDef[] = [
  // --- Connection ---
  {
    name: 'keepAlive',
    type: 'boolean',
    label: 'Keep Alive',
    description: 'Maintain persistent connections to remote devices instead of dialing per message.',
    category: 'Connection',
    default: false,
  },
  {
    name: 'maxClientsPerRemote',
    type: 'integer',
    label: 'Max Clients Per Remote',
    description:
      'Maximum concurrent outbound connections to a single remote device. Defaults to 1 when Keep Alive is enabled.',
    category: 'Connection',
    default: 5,
    min: 1,
  },
  {
    name: 'logStatsFreqSecs',
    type: 'integer',
    label: 'Log Stats Frequency (seconds)',
    description: 'How often to log runtime statistics. Set to -1 to disable.',
    category: 'Connection',
    default: -1,
    min: -1,
  },

  // --- Durable Queue ---
  {
    name: 'durableQueue',
    type: 'boolean',
    label: 'Durable Queue',
    description: 'Persist inbound HL7 messages to an on-disk SQLite queue for guaranteed processing.',
    category: 'Durable Queue',
    default: false,
  },
  {
    name: 'queueDbPath',
    type: 'string',
    label: 'Queue Database Path',
    description: 'Path to the SQLite queue database file. Defaults to medplum-agent-queue.sqlite in the log directory.',
    category: 'Durable Queue',
    visibleWhen: [{ setting: 'durableQueue', equals: true }],
  },
  {
    name: 'queueRetentionDays',
    type: 'integer',
    label: 'Queue Retention (days)',
    description: 'How long to retain processed messages before sweeping.',
    category: 'Durable Queue',
    default: 7,
    min: 1,
    visibleWhen: [{ setting: 'durableQueue', equals: true }],
  },
  {
    name: 'queueRetentionMaxMb',
    type: 'integer',
    label: 'Queue Max Size (MB)',
    description: 'Soft cap on the queue database size, in MiB.',
    category: 'Durable Queue',
    default: 512,
    min: 1,
    visibleWhen: [{ setting: 'durableQueue', equals: true }],
  },
  {
    name: 'queueErroredRetentionDays',
    type: 'integer',
    label: 'Errored Retention (days)',
    description: 'Minimum retention for errored / nacked messages before they are eligible for sweeping.',
    category: 'Durable Queue',
    default: 90,
    min: 1,
    visibleWhen: [{ setting: 'durableQueue', equals: true }],
  },
  {
    name: 'queueSweepIntervalSecs',
    type: 'integer',
    label: 'Sweep Interval (seconds)',
    description: 'How often the retention sweeper runs.',
    category: 'Durable Queue',
    default: 3600,
    min: 1,
    visibleWhen: [{ setting: 'durableQueue', equals: true }],
  },

  // --- Auto-Retry ---
  {
    name: 'channelAutoRetry',
    type: 'boolean',
    label: 'Channel Auto-Retry',
    description: 'Agent-wide default for automatically retrying failed channel message delivery.',
    category: 'Auto-Retry',
    default: true,
  },
  {
    name: 'channelGuaranteedDelivery',
    type: 'boolean',
    label: 'Guaranteed Delivery',
    description:
      'Keep retrying until upstream gives a definitive answer, even across failures that could duplicate delivery.',
    category: 'Auto-Retry',
    default: true,
    visibleWhen: [{ setting: 'channelAutoRetry', equals: true }],
  },
  {
    name: 'channelAutoRetryBaseDelayMs',
    type: 'integer',
    label: 'Base Delay (ms)',
    description: 'Delay before the first retry.',
    category: 'Auto-Retry',
    default: 1000,
    min: 0,
    visibleWhen: [{ setting: 'channelAutoRetry', equals: true }],
  },
  {
    name: 'channelAutoRetryMaxDelayMs',
    type: 'integer',
    label: 'Max Delay (ms)',
    description: 'Cap on the computed exponential backoff delay.',
    category: 'Auto-Retry',
    default: 60000,
    min: 0,
    visibleWhen: [{ setting: 'channelAutoRetry', equals: true }],
  },
  {
    name: 'channelAutoRetryMaxAttempts',
    type: 'integer',
    label: 'Max Attempts',
    description: 'Total dispatch attempts before a retryable failure becomes terminal. 0 = retry indefinitely.',
    category: 'Auto-Retry',
    default: 0,
    min: 0,
    visibleWhen: [{ setting: 'channelAutoRetry', equals: true }],
  },
  {
    name: 'channelAutoRetryBackoffMultiplier',
    type: 'decimal',
    label: 'Backoff Multiplier',
    description: 'Exponential base: delay = baseDelay * multiplier^(attempt-1). 1 = fixed interval.',
    category: 'Auto-Retry',
    default: 2,
    min: 1,
    step: 0.1,
    visibleWhen: [{ setting: 'channelAutoRetry', equals: true }],
  },
];

/**
 * Returns the full settings schema for this agent build, tagged with the current agent version.
 * This is what the build serializes and what clients fetch to render a settings editor.
 * @returns The settings schema for this agent build.
 */
export function getAgentSettingsSchema(): AgentSettingsSchema {
  return { agentVersion: MEDPLUM_VERSION, settings: AGENT_SETTINGS_MANIFEST };
}

/**
 * Reads the value of a single setting from an Agent resource, typed according to its manifest definition.
 * @param agent - The Agent resource (or undefined).
 * @param def - The manifest definition for the setting to read.
 * @returns The setting's value, or `undefined` if it is not set on the resource.
 */
export function readAgentSetting(agent: Agent | undefined, def: AgentSettingDef): AgentSettingValue | undefined {
  const setting = agent?.setting?.find((s) => s.name === def.name);
  if (!setting) {
    return undefined;
  }
  switch (def.type) {
    case 'boolean':
      return setting.valueBoolean;
    case 'integer':
      return setting.valueInteger;
    case 'decimal':
      return setting.valueDecimal;
    case 'string':
      return setting.valueString;
    default:
      return undefined;
  }
}

// Looks up a setting definition by name, asserting it exists in the manifest and matches the expected
// type. This is what makes the manifest the single source of truth: a setting must be declared here
// before it can be read at runtime, so the published schema can never silently omit a live setting.
function requireDef(name: string, type: AgentSettingType): AgentSettingDef {
  const def = AGENT_SETTINGS_MANIFEST.find((d) => d.name === name);
  if (!def) {
    throw new Error(`Unknown agent setting '${name}' (not declared in the settings manifest)`);
  }
  if (def.type !== type) {
    throw new Error(`Agent setting '${name}' is declared as '${def.type}', not '${type}'`);
  }
  return def;
}

/**
 * Reads a boolean setting from an Agent resource via the manifest.
 * @param agent - The Agent resource (or undefined).
 * @param name - The setting name; must be declared as a `boolean` in the manifest.
 * @returns The boolean value, or `undefined` if unset.
 */
export function readBooleanSetting(agent: Agent | undefined, name: string): boolean | undefined {
  return readAgentSetting(agent, requireDef(name, 'boolean')) as boolean | undefined;
}

/**
 * Reads an integer setting from an Agent resource via the manifest.
 * @param agent - The Agent resource (or undefined).
 * @param name - The setting name; must be declared as an `integer` in the manifest.
 * @returns The integer value, or `undefined` if unset.
 */
export function readIntegerSetting(agent: Agent | undefined, name: string): number | undefined {
  return readAgentSetting(agent, requireDef(name, 'integer')) as number | undefined;
}

/**
 * Reads a decimal setting from an Agent resource via the manifest.
 * @param agent - The Agent resource (or undefined).
 * @param name - The setting name; must be declared as a `decimal` in the manifest.
 * @returns The decimal value, or `undefined` if unset.
 */
export function readDecimalSetting(agent: Agent | undefined, name: string): number | undefined {
  return readAgentSetting(agent, requireDef(name, 'decimal')) as number | undefined;
}

/**
 * Reads a string setting from an Agent resource via the manifest.
 * @param agent - The Agent resource (or undefined).
 * @param name - The setting name; must be declared as a `string` in the manifest.
 * @returns The string value, or `undefined` if unset.
 */
export function readStringSetting(agent: Agent | undefined, name: string): string | undefined {
  return readAgentSetting(agent, requireDef(name, 'string')) as string | undefined;
}
