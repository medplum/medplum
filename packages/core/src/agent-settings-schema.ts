// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { AgentSettingValue } from '@medplum/fhirtypes';
import { fetchVersionManifest } from './version-utils';

/**
 * The name of the release asset that contains the {@link AgentSettingsSchema} for a given agent version.
 *
 * The agent build emits this file from its settings manifest and attaches it to the GitHub release. The
 * `publish-meta` pipeline then propagates it to `download.medplum.com` and lists it in each version
 * manifest's `assets[]`, so {@link fetchAgentSettingsSchema} can locate it via {@link fetchVersionManifest}.
 */
export const AGENT_SETTINGS_SCHEMA_ASSET_NAME = 'agent-settings-schema.json';

/** The value type a given agent setting accepts. Mirrors the `value[x]` choices on `AgentSetting`. */
export type AgentSettingType = 'string' | 'boolean' | 'integer' | 'decimal';

/**
 * A condition under which a setting is relevant. When a setting declares one or more
 * `visibleWhen` conditions, it should only be surfaced (and applied) when ALL of them hold --
 * e.g. the `queue*` settings are only meaningful when `durableQueue` is `true`.
 */
export interface AgentSettingVisibilityCondition {
  /** The name of another setting this one depends on. */
  readonly setting: string;
  /** The value the depended-on setting must equal for this setting to be relevant. */
  readonly equals: AgentSettingValue;
}

/** A single selectable option for a setting that is constrained to an enumerated set of values. */
export interface AgentSettingOption {
  readonly value: AgentSettingValue;
  readonly label?: string;
}

/**
 * A declarative description of a single agent setting. This is the unit the agent build publishes so
 * that clients (e.g. the Medplum App) can render an editor for a given agent version WITHOUT hardcoding
 * the supported settings -- or which versions support them -- anywhere in `@medplum/core` or the app.
 */
export interface AgentSettingDef {
  /** The `AgentSetting.name` this definition describes (e.g. `keepAlive`, `maxClientsPerRemote`). */
  readonly name: string;
  /** Which `value[x]` field on `AgentSetting` this setting uses. */
  readonly type: AgentSettingType;
  /** Human-readable label for the setting. */
  readonly label: string;
  /** Optional longer description / help text. */
  readonly description?: string;
  /** Optional grouping for display (e.g. `Connection`, `Durable Queue`, `Auto-Retry`). */
  readonly category?: string;
  /** The default the agent applies when the setting is absent. */
  readonly default?: AgentSettingValue;
  /** Whether a value is required. */
  readonly required?: boolean;
  /** Minimum value (inclusive) for `integer`/`decimal` settings. */
  readonly min?: number;
  /** Maximum value (inclusive) for `integer`/`decimal` settings. */
  readonly max?: number;
  /** Step increment for `integer`/`decimal` settings. */
  readonly step?: number;
  /** Validation regex (as a string) for `string` settings. */
  readonly pattern?: string;
  /** When present, the setting is constrained to this enumerated set of values. */
  readonly options?: AgentSettingOption[];
  /** When present, the setting is only relevant while ALL of these conditions hold. */
  readonly visibleWhen?: AgentSettingVisibilityCondition[];
}

/** The full set of settings supported by a specific agent version. */
export interface AgentSettingsSchema {
  /** The agent version this schema describes (e.g. `4.3.0`). */
  readonly agentVersion: string;
  /** All settings supported by this version. */
  readonly settings: AgentSettingDef[];
}

const AGENT_SETTING_TYPES: readonly AgentSettingType[] = ['string', 'boolean', 'integer', 'decimal'];

/**
 * Asserts that a given candidate is an {@link AgentSettingsSchema}.
 * @param candidate - An object assumed to be an `AgentSettingsSchema`.
 */
export function assertAgentSettingsSchema(candidate: unknown): asserts candidate is AgentSettingsSchema {
  const schema = candidate as AgentSettingsSchema;
  if (typeof schema?.agentVersion !== 'string') {
    throw new Error('Agent settings schema missing valid agentVersion');
  }
  if (!Array.isArray(schema.settings)) {
    throw new Error('Agent settings schema missing settings array');
  }
  for (const setting of schema.settings) {
    if (!setting?.name) {
      throw new Error('Agent setting definition missing name');
    }
    if (!AGENT_SETTING_TYPES.includes(setting.type)) {
      throw new Error(`Agent setting '${setting.name}' has invalid type '${setting.type}'`);
    }
  }
}

const agentSettingsSchemas = new Map<string, AgentSettingsSchema>();

/**
 * Clears the locally-cached `AgentSettingsSchema`s for all versions.
 */
export function clearAgentSettingsSchemaCache(): void {
  agentSettingsSchemas.clear();
}

/**
 * Fetches the published {@link AgentSettingsSchema} for a given agent version.
 *
 * The schema is resolved entirely client-side via the existing release-manifest channel: it locates the
 * `agent-settings-schema.json` asset in the version manifest (see {@link fetchVersionManifest}) and fetches
 * it from `download.medplum.com`. Schemas are immutable per version, so results are cached in memory.
 *
 * @param appName - The name of the app fetching the schema (for release-manifest telemetry).
 * @param version - The agent version to fetch the schema for. Any build-metadata suffix (e.g. a git
 * shorthash) is stripped, since releases are tagged by base semver.
 * @returns The settings schema for the specified version.
 */
export async function fetchAgentSettingsSchema(appName: string, version: string): Promise<AgentSettingsSchema> {
  // Agent versions reported at runtime may carry a `-<shorthash>` suffix; releases are tagged by base semver.
  const baseVersion = version.split('-')[0];
  let schema = agentSettingsSchemas.get(baseVersion);
  if (!schema) {
    const manifest = await fetchVersionManifest(appName, baseVersion);
    const asset = manifest.assets.find((a) => a.name === AGENT_SETTINGS_SCHEMA_ASSET_NAME);
    if (!asset) {
      throw new Error(`Release v${baseVersion} has no '${AGENT_SETTINGS_SCHEMA_ASSET_NAME}' asset`);
    }
    const res = await fetch(asset.browser_download_url);
    if (res.status !== 200) {
      throw new Error(
        `Received status code ${res.status} while fetching agent settings schema for version '${baseVersion}'`
      );
    }
    const response = (await res.json()) as unknown;
    assertAgentSettingsSchema(response);
    schema = response;
    agentSettingsSchemas.set(baseVersion, schema);
  }
  return schema;
}
