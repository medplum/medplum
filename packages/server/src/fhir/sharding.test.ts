// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import {
  getResourceTypeShardId,
  getResourceTypeShardIds,
  GLOBAL_SHARD_ID,
  isGlobalResourceType,
  normalizeShardId,
  PLACEHOLDER_SHARD_ID,
  TODO_SHARD_ID,
} from './sharding';

describe('Repository sharding', () => {
  test('Identifies global resource types', () => {
    expect(isGlobalResourceType('Project')).toBe(true);
    expect(isGlobalResourceType('ProjectMembership')).toBe(true);
    expect(isGlobalResourceType('User')).toBe(true);
    expect(isGlobalResourceType('Patient')).toBe(false);
  });

  test('Resolves global resource types to the global shard', () => {
    expect(getResourceTypeShardId('Project', 'project-shard')).toBe(GLOBAL_SHARD_ID);
  });

  test('Resolves project resource types to the project shard', () => {
    expect(getResourceTypeShardId('Patient', 'project-shard')).toBe('project-shard');
  });

  test('Allows logical mixing when the project is on the global shard', () => {
    expect(getResourceTypeShardIds(['Project', 'Patient'], GLOBAL_SHARD_ID)).toEqual(new Set([GLOBAL_SHARD_ID]));
  });

  test('Finds distinct shards when the project is not on the global shard', () => {
    expect(getResourceTypeShardIds(['Project', 'Patient'], 'project-shard')).toEqual(
      new Set([GLOBAL_SHARD_ID, 'project-shard'])
    );
  });

  test('Treats transitional shard markers as global until they are replaced', () => {
    expect(normalizeShardId(PLACEHOLDER_SHARD_ID)).toBe(GLOBAL_SHARD_ID);
    expect(normalizeShardId(TODO_SHARD_ID)).toBe(GLOBAL_SHARD_ID);
    expect(getResourceTypeShardId('Patient', PLACEHOLDER_SHARD_ID)).toBe(GLOBAL_SHARD_ID);
  });
});
