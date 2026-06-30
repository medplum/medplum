// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { assertAgentSettingsSchema } from '@medplum/core';
import type { Agent } from '@medplum/fhirtypes';
import { DEFAULT_MAX_CLIENTS_PER_REMOTE } from './constants';
import {
  DEFAULT_ERRORED_RETENTION_DAYS,
  DEFAULT_MAX_SIZE_MB,
  DEFAULT_RETENTION_DAYS,
  DEFAULT_SWEEP_INTERVAL_SECS,
} from './queue/retention';
import { DEFAULT_RETRY_POLICY } from './queue/worker';
import { AGENT_SETTINGS_MANIFEST, getAgentSettingsSchema, readAgentSetting } from './settings-manifest';

function defaultOf(name: string): unknown {
  const def = AGENT_SETTINGS_MANIFEST.find((s) => s.name === name);
  if (!def) {
    throw new Error(`Manifest is missing setting '${name}'`);
  }
  return def.default;
}

describe('Agent settings manifest', () => {
  test('produces a valid schema tagged with the agent version', () => {
    const schema = getAgentSettingsSchema();
    expect(() => assertAgentSettingsSchema(schema)).not.toThrow();
    expect(schema.agentVersion).toBeTruthy();
  });

  test('has unique setting names', () => {
    const names = AGENT_SETTINGS_MANIFEST.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  // Manifest defaults are display copies of the effective defaults applied at runtime. These assertions
  // fail loudly if the source constants change without the manifest being updated to match.
  test('defaults stay in sync with source constants', () => {
    expect(defaultOf('maxClientsPerRemote')).toBe(DEFAULT_MAX_CLIENTS_PER_REMOTE);
    expect(defaultOf('queueRetentionDays')).toBe(DEFAULT_RETENTION_DAYS);
    expect(defaultOf('queueRetentionMaxMb')).toBe(DEFAULT_MAX_SIZE_MB);
    expect(defaultOf('queueErroredRetentionDays')).toBe(DEFAULT_ERRORED_RETENTION_DAYS);
    expect(defaultOf('queueSweepIntervalSecs')).toBe(DEFAULT_SWEEP_INTERVAL_SECS);
    expect(defaultOf('channelAutoRetry')).toBe(DEFAULT_RETRY_POLICY.enabled);
    expect(defaultOf('channelGuaranteedDelivery')).toBe(DEFAULT_RETRY_POLICY.guaranteedDelivery);
    expect(defaultOf('channelAutoRetryBaseDelayMs')).toBe(DEFAULT_RETRY_POLICY.baseDelayMs);
    expect(defaultOf('channelAutoRetryMaxDelayMs')).toBe(DEFAULT_RETRY_POLICY.maxDelayMs);
    expect(defaultOf('channelAutoRetryMaxAttempts')).toBe(DEFAULT_RETRY_POLICY.maxAttempts);
    expect(defaultOf('channelAutoRetryBackoffMultiplier')).toBe(DEFAULT_RETRY_POLICY.backoffMultiplier);
  });

  test('readAgentSetting reads each value type from the resource', () => {
    const agent: Agent = {
      resourceType: 'Agent',
      name: 'Test',
      status: 'active',
      setting: [
        { name: 'keepAlive', valueBoolean: true },
        { name: 'maxClientsPerRemote', valueInteger: 3 },
        { name: 'channelAutoRetryBackoffMultiplier', valueDecimal: 1.5 },
        { name: 'queueDbPath', valueString: '/tmp/queue.sqlite' },
      ],
    };
    const byName = (name: string): (typeof AGENT_SETTINGS_MANIFEST)[number] =>
      AGENT_SETTINGS_MANIFEST.find((s) => s.name === name) as (typeof AGENT_SETTINGS_MANIFEST)[number];

    expect(readAgentSetting(agent, byName('keepAlive'))).toBe(true);
    expect(readAgentSetting(agent, byName('maxClientsPerRemote'))).toBe(3);
    expect(readAgentSetting(agent, byName('channelAutoRetryBackoffMultiplier'))).toBe(1.5);
    expect(readAgentSetting(agent, byName('queueDbPath'))).toBe('/tmp/queue.sqlite');
    // Absent setting returns undefined
    expect(readAgentSetting(agent, byName('logStatsFreqSecs'))).toBeUndefined();
  });
});
