// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { ResourceType } from '@medplum/fhirtypes';
import { getLogger } from '../logger';
import {
  GLOBAL_SHARD_ID,
  PLACEHOLDER_SHARD_ID,
  ShardRoutingError,
  TODO_SHARD_ID,
  normalizeShardId,
  resolveShardId,
} from './sharding';

describe('normalizeShardId', () => {
  test('maps transitory and missing shard IDs to global', () => {
    expect(normalizeShardId(undefined)).toBe(GLOBAL_SHARD_ID);
    expect(normalizeShardId(PLACEHOLDER_SHARD_ID)).toBe(GLOBAL_SHARD_ID);
    expect(normalizeShardId(TODO_SHARD_ID)).toBe(GLOBAL_SHARD_ID);
  });

  test('passes through real shard IDs', () => {
    expect(normalizeShardId(GLOBAL_SHARD_ID)).toBe(GLOBAL_SHARD_ID);
    expect(normalizeShardId('shard-1')).toBe('shard-1');
  });
});

describe('resolveShardId', () => {
  const types = (...resourceTypes: ResourceType[]): ReadonlySet<ResourceType> => new Set(resourceTypes);

  test('global-shard resource types always resolve to the global shard', () => {
    expect(resolveShardId('shard-1', types('Project'))).toBe(GLOBAL_SHARD_ID);
    expect(resolveShardId('shard-1', types('User', 'ProjectMembership'))).toBe(GLOBAL_SHARD_ID);
    expect(resolveShardId(GLOBAL_SHARD_ID, types('User'))).toBe(GLOBAL_SHARD_ID);
  });

  test('project-scoped resource types resolve to the context shard', () => {
    expect(resolveShardId('shard-1', types('Patient'))).toBe('shard-1');
    expect(resolveShardId('shard-1', types('Patient', 'Observation'))).toBe('shard-1');
    expect(resolveShardId(GLOBAL_SHARD_ID, types('Patient'))).toBe(GLOBAL_SHARD_ID);
  });

  test('empty resource types resolve to the context shard', () => {
    expect(resolveShardId('shard-1', types())).toBe('shard-1');
    expect(resolveShardId(GLOBAL_SHARD_ID, types())).toBe(GLOBAL_SHARD_ID);
  });

  test('transitory context shard IDs are normalized', () => {
    expect(resolveShardId(PLACEHOLDER_SHARD_ID, types('Patient'))).toBe(GLOBAL_SHARD_ID);
    expect(resolveShardId(TODO_SHARD_ID, types())).toBe(GLOBAL_SHARD_ID);
  });

  test('mixed resource types on the global shard resolve to global and log', () => {
    const infoSpy = vi.spyOn(getLogger(), 'info').mockImplementation(() => {});
    expect(resolveShardId(GLOBAL_SHARD_ID, types('Project', 'Patient'), 'sharding.test')).toBe(GLOBAL_SHARD_ID);
    expect(resolveShardId(PLACEHOLDER_SHARD_ID, types('User', 'Observation'))).toBe(GLOBAL_SHARD_ID);
    expect(infoSpy).toHaveBeenCalledWith(
      '[RepoSplit] Mixed resource access',
      expect.objectContaining({
        globalResourceTypes: ['Project'],
        projectResourceTypes: ['Patient'],
        source: 'sharding.test',
      })
    );
    infoSpy.mockRestore();
  });

  test('mixed resource types on a project shard throw', () => {
    expect(() => resolveShardId('shard-1', types('Project', 'Patient'), 'sharding.test')).toThrow(
      new ShardRoutingError(
        'Cross-shard access: statement mixes global-shard resource types [Project] with shard "shard-1" resource types [Patient] (source=sharding.test)'
      )
    );
    expect(() => resolveShardId('shard-1', types('User', 'Patient', 'Observation'))).toThrow(ShardRoutingError);
  });
});
