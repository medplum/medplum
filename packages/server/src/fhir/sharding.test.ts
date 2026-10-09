// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { getStatus, OperationOutcomeError } from '@medplum/core';
import type { ResourceType } from '@medplum/fhirtypes';
import type { Mock } from 'vitest';
import { getConfig, loadTestConfig } from '../config/loader';
import { getLogger } from '../logger';
import { TEST_SHARD_ID } from '../test.setup';
import {
  getAllShards,
  getDefaultShardId,
  getShardConfig,
  GLOBAL_SHARD_ID,
  isConfiguredShardId,
  isShardingEnabled,
  normalizeShardId,
  PLACEHOLDER_SHARD_ID,
  resetStrictShardingEnforcement,
  resolveShardId,
  setStrictShardingEnforcement,
  TODO_SHARD_ID,
} from './sharding';

const PROJECT_SHARD_ID = 'shard-1';

function types(...resourceTypes: ResourceType[]): ReadonlySet<ResourceType> {
  return new Set(resourceTypes);
}

describe('normalizeShardId', () => {
  test.each([
    ['undefined', undefined],
    ['empty string', ''],
    ['the placeholder shard', PLACEHOLDER_SHARD_ID],
    ['the TODO shard', TODO_SHARD_ID],
    ['the global shard', GLOBAL_SHARD_ID],
  ])('Maps %s to the global shard', (_label, shardId) => {
    expect(normalizeShardId(shardId)).toStrictEqual(GLOBAL_SHARD_ID);
  });

  test('Passes through a real shard ID', () => {
    expect(normalizeShardId(PROJECT_SHARD_ID)).toStrictEqual(PROJECT_SHARD_ID);
  });
});

function resolveProjectShardId(shardId: string, resourceTypes: ReadonlySet<ResourceType>, source?: string): string {
  return resolveShardId({ kind: 'project-shard', shardId }, resourceTypes, source);
}

function resolveGlobalShardId(resourceTypes: ReadonlySet<ResourceType>, source?: string): string {
  return resolveShardId({ kind: 'global-only' }, resourceTypes, source);
}

describe('resolveShardId', () => {
  describe('for kind: global-only', () => {
    let logSpy: Mock;
    beforeEach(() => {
      logSpy = vi.spyOn(getLogger(), 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      logSpy.mockRestore();
      resetStrictShardingEnforcement();
    });

    test('Routes global resource types to the global shard', () => {
      expect(resolveGlobalShardId(types('User'))).toStrictEqual(GLOBAL_SHARD_ID);
      expect(resolveGlobalShardId(types('Project', 'ProjectMembership', 'User'))).toStrictEqual(GLOBAL_SHARD_ID);
    });

    test('logs warning on project-scoped resource types', () => {
      const fn = (): unknown => resolveGlobalShardId(types('Patient'), 'shard-project');
      expect(fn).toThrow('Operation cannot be routed to a project shard from global-only');

      setStrictShardingEnforcement(false);
      expect(logSpy).toHaveBeenCalledTimes(0);
      fn();
      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith(
        expect.any(Number),
        expect.stringContaining('Operation cannot be routed to a project shard from global-only'),
        expect.objectContaining({
          projectTypes: 'Patient',
          source: 'shard-project',
        })
      );
    });

    test('logs warning when an operation mixes global and project resource types', () => {
      const fn = (): unknown => resolveGlobalShardId(types('ProjectMembership', 'Practitioner'), 'shard-span');
      expect(fn).toThrow('Operation cannot be routed to a project shard from global-only');

      setStrictShardingEnforcement(false);
      expect(logSpy).toHaveBeenCalledTimes(0);
      fn();
      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith(
        expect.any(Number),
        expect.stringContaining('Operation cannot be routed to a project shard from global-only'),
        expect.objectContaining({
          projectTypes: 'Practitioner',
          source: 'shard-span',
        })
      );
    });
  });

  describe('for kind: project-shard', () => {
    test('Routes global resource types to the global shard', () => {
      expect(resolveProjectShardId(PROJECT_SHARD_ID, types('User'))).toStrictEqual(GLOBAL_SHARD_ID);
      expect(resolveProjectShardId(PROJECT_SHARD_ID, types('Project', 'ProjectMembership', 'User'))).toStrictEqual(
        GLOBAL_SHARD_ID
      );
    });

    test('Routes project-scoped resource types to the project shard', () => {
      expect(resolveProjectShardId(PROJECT_SHARD_ID, types('Patient'))).toStrictEqual(PROJECT_SHARD_ID);
      expect(resolveProjectShardId(PROJECT_SHARD_ID, types('Patient', 'Observation'))).toStrictEqual(PROJECT_SHARD_ID);
    });

    test('Refuses to route an operation naming no resource types', () => {
      expect(() => resolveProjectShardId(PROJECT_SHARD_ID, types(), 'sharding.test')).toThrow(
        'Cannot route an operation that specifies no resource types'
      );
      expect(() => resolveProjectShardId(GLOBAL_SHARD_ID, types())).toThrow(
        'Cannot route an operation that specifies no resource types'
      );
    });

    test('Normalizes the context shard ID', () => {
      expect(resolveProjectShardId(PLACEHOLDER_SHARD_ID, types('Patient'))).toStrictEqual(GLOBAL_SHARD_ID);
      expect(resolveProjectShardId(TODO_SHARD_ID, types('Patient'))).toStrictEqual(GLOBAL_SHARD_ID);
    });

    test('Throws when an operation spans shards', () => {
      expect(() =>
        resolveProjectShardId(PROJECT_SHARD_ID, types('ProjectMembership', 'Practitioner'), 'shard-span')
      ).toThrow(
        `Operation cannot span shards (${GLOBAL_SHARD_ID}: ProjectMembership, ${PROJECT_SHARD_ID}: Practitioner, source: shard-span)`
      );
    });

    test('Throws an OperationOutcomeError', () => {
      let err: unknown;
      try {
        resolveProjectShardId(PROJECT_SHARD_ID, types('User', 'Patient'));
      } catch (caught) {
        err = caught;
      }

      expect(err).toBeInstanceOf(OperationOutcomeError);
      expect(getStatus((err as OperationOutcomeError).outcome)).toStrictEqual(500);
    });

    test('Resolves mixed resource types to the global shard when the project lives there', () => {
      const logSpy = vi.spyOn(getLogger(), 'log').mockImplementation(() => {});
      try {
        expect(resolveProjectShardId(GLOBAL_SHARD_ID, types('Project', 'Patient'), 'sharding.test')).toBe(
          GLOBAL_SHARD_ID
        );
        // Recording the mixed access is `RepositoryAccessTracker`'s job; this function only resolves.
        expect(logSpy).not.toHaveBeenCalled();
      } finally {
        logSpy.mockRestore();
      }
    });
  });
});

describe('Without shards configured', () => {
  beforeAll(async () => {
    await loadTestConfig();
  });

  test('Sharding is disabled', () => {
    expect(isShardingEnabled()).toBe(false);
  });

  test('New projects default to the global shard', () => {
    expect(getDefaultShardId()).toStrictEqual(GLOBAL_SHARD_ID);
  });

  test.each<[boolean, string[]]>([
    [false, [GLOBAL_SHARD_ID]],
    [true, []],
  ])('getAllShards(excludeGlobal=%s) yields %j', (excludeGlobal, expected) => {
    expect(Array.from(getAllShards(excludeGlobal), (shard) => shard.id)).toStrictEqual(expected);
  });
});

describe('With shards configured', () => {
  beforeAll(async () => {
    await loadTestConfig({ sharded: true });
  });

  test('Sharding is enabled', () => {
    expect(isShardingEnabled()).toBe(true);
  });

  describe('getDefaultShardId', () => {
    test('Returns the shard that sets isDefaultShard', () => {
      expect(getDefaultShardId()).toStrictEqual(TEST_SHARD_ID);
    });

    test('Returns the global shard when no configured shard sets isDefaultShard', () => {
      const shardConfig = getShardConfig(TEST_SHARD_ID);
      shardConfig.isDefaultShard = false;
      try {
        expect(getDefaultShardId()).toStrictEqual(GLOBAL_SHARD_ID);
      } finally {
        shardConfig.isDefaultShard = true;
      }
    });
  });

  describe('isConfiguredShardId', () => {
    test.each([GLOBAL_SHARD_ID, TEST_SHARD_ID])('Accepts %s', (shardId) => {
      expect(isConfiguredShardId(shardId)).toBe(true);
    });

    test.each(['unknown-shard', '', PLACEHOLDER_SHARD_ID, TODO_SHARD_ID, 'toString'])('Rejects "%s"', (shardId) => {
      expect(isConfiguredShardId(shardId)).toBe(false);
    });
  });

  describe('getShardConfig', () => {
    test('Returns the main database settings for the global shard', () => {
      const config = getConfig();
      expect(getShardConfig(GLOBAL_SHARD_ID)).toStrictEqual({
        id: GLOBAL_SHARD_ID,
        database: config.database,
        readonlyDatabase: config.readonlyDatabase,
      });
    });

    test('Returns a configured shard with its own database', () => {
      const shardConfig = getShardConfig(TEST_SHARD_ID);
      expect(shardConfig.id).toStrictEqual(TEST_SHARD_ID);
      expect(shardConfig.database.dbname).toStrictEqual('medplum_test_shard_1');
    });

    test.each(['unknown-shard', PLACEHOLDER_SHARD_ID, 'toString'])('Throws for "%s"', (shardId) => {
      expect(() => getShardConfig(shardId)).toThrow(`Shard config not found for shard ID: ${shardId}`);
    });
  });

  describe('getAllShards', () => {
    test('Yields the global shard first, then configured shards', () => {
      expect(Array.from(getAllShards(), (shard) => shard.id)).toStrictEqual([GLOBAL_SHARD_ID, TEST_SHARD_ID]);
    });

    test('Omits the global shard when excludeGlobal is set', () => {
      expect(Array.from(getAllShards(true), (shard) => shard.id)).toStrictEqual([TEST_SHARD_ID]);
    });
  });
});
