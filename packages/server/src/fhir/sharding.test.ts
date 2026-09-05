// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { getStatus, OperationOutcomeError } from '@medplum/core';
import type { ResourceType } from '@medplum/fhirtypes';
import type { Mock } from 'vitest';
import { getLogger } from '../logger';
import { GLOBAL_SHARD_ID, normalizeShardId, PLACEHOLDER_SHARD_ID, resolveShardId, TODO_SHARD_ID } from './sharding';

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
    });

    test('Routes global resource types to the global shard', () => {
      expect(resolveGlobalShardId(types('User'))).toStrictEqual(GLOBAL_SHARD_ID);
      expect(resolveGlobalShardId(types('Project', 'ProjectMembership', 'User'))).toStrictEqual(GLOBAL_SHARD_ID);
    });

    test('logs warning on project-scoped resource types', () => {
      resolveGlobalShardId(types('Patient'), 'shard-project');
      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith(
        expect.any(Number),
        expect.stringContaining('Operation cannot be routed to a project shard from global-only'),
        expect.objectContaining({
          project: 'Patient',
          source: 'shard-project',
        })
      );
    });

    test('logs warning when an operation mixes global and project resource types', () => {
      resolveGlobalShardId(types('ProjectMembership', 'Practitioner'), 'shard-span');
      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith(
        expect.any(Number),
        expect.stringContaining('Operation cannot be routed to a project shard from global-only'),
        expect.objectContaining({
          project: 'Practitioner',
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
