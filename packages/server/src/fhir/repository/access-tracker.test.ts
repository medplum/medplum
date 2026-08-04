// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { ResourceType } from '@medplum/fhirtypes';
import type { MockInstance } from 'vitest';
import { DatabaseMode } from '../../database';
import { getLogger } from '../../logger';
import { Repository } from '../repo';
import { SelectQuery } from '../sql';
import { RepositoryAccessTracker } from './access-tracker';

describe('Repository SQL access', () => {
  const repo = new Repository({ author: { reference: 'system' } });

  test('Rejects a statement that declares no resource types', () => {
    expect(() =>
      repo.getDatabaseClient({
        mode: DatabaseMode.READER,
        operation: 'read',
        resourceTypes: [],
        source: 'test.getDatabaseClient',
      })
    ).toThrow('Cannot route an operation that specifies no resource types');
  });

  test('Rejects a query that declares no resource types', async () => {
    await expect(repo.sqlRead(new SelectQuery('Patient').column('id'), [])).rejects.toThrow(
      'Cannot route an operation that specifies no resource types'
    );
  });
});

describe('RepositoryAccessTracker', () => {
  let tracker: RepositoryAccessTracker;
  let infoSpy: MockInstance;

  beforeEach(() => {
    tracker = new RepositoryAccessTracker();
    infoSpy = vi.spyOn(getLogger(), 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    infoSpy.mockRestore();
  });

  test('Logs a statement that spans shards', () => {
    tracker.recordResourceAccess('sql', 'read', ['User', 'Patient'], 'test.mixedRead');

    expect(infoSpy).toHaveBeenCalledWith('[RepoSplit] Mixed resource access', {
      scope: 'statement',
      layer: 'sql',
      operation: 'read',
      source: 'test.mixedRead',
      inTransaction: false,
      globalResourceTypes: ['User'],
      projectResourceTypes: ['Patient'],
    });
  });

  test.each([
    ['only global types', ['User', 'Project'] as ResourceType[]],
    ['only project-scoped types', ['Patient', 'Observation'] as ResourceType[]],
    ['no types at all', [] as ResourceType[]],
  ])('Ignores a statement touching %s', (_label, resourceTypes) => {
    tracker.recordResourceAccess('sql', 'read', resourceTypes, 'test.notMixed');
    expect(infoSpy).not.toHaveBeenCalled();
  });

  test('Rolls up a transaction that spans shards', () => {
    tracker.startTransaction();
    tracker.recordResourceAccess('sql', 'transaction', ['Project'], 'test.tx');
    tracker.recordResourceAccess('sql', 'read', 'ProjectMembership', 'test.readMembership');
    tracker.recordResourceAccess('sql', 'write', 'Practitioner', 'test.writeProfile');
    tracker.recordResourceAccess('sql', 'write', 'AccessPolicy', 'test.writeProfile');
    tracker.recordResourceAccess('sql', 'configuration', [], 'test.setTimeout');
    infoSpy.mockClear(); // discard the per-statement logs
    tracker.finishTransaction('committed');

    expect(infoSpy).toHaveBeenCalledWith('[RepoSplit] Mixed transaction access', {
      scope: 'transaction',
      status: 'committed',
      globalResourceTypes: ['Project', 'ProjectMembership'],
      projectResourceTypes: ['Practitioner', 'AccessPolicy'],
      readResourceTypes: ['ProjectMembership'],
      writeResourceTypes: ['Practitioner', 'AccessPolicy'],
      sqlReadCount: 1,
      sqlWriteCount: 2,
      cacheReadCount: 0,
      cacheWriteCount: 0,
      sources: ['test.tx', 'test.readMembership', 'test.writeProfile'],
    });
  });

  test('Reports how the transaction ended', () => {
    tracker.startTransaction();
    tracker.recordResourceAccess('sql', 'write', ['User', 'Patient'], 'test.tx');
    tracker.finishTransaction('rolled_back');

    expect(infoSpy).toHaveBeenCalledWith(
      '[RepoSplit] Mixed transaction access',
      expect.objectContaining({ status: 'rolled_back' })
    );
  });

  test('Marks statements recorded inside a transaction', () => {
    tracker.startTransaction();
    tracker.recordResourceAccess('sql', 'read', ['User', 'Patient'], 'test.tx');

    expect(infoSpy).toHaveBeenCalledWith(
      '[RepoSplit] Mixed resource access',
      expect.objectContaining({ inTransaction: true })
    );
  });

  test('Does not roll up a transaction that stays on one shard', () => {
    tracker.startTransaction();
    tracker.recordResourceAccess('sql', 'write', 'Patient', 'test.tx');
    tracker.recordResourceAccess('sql', 'read', 'Observation', 'test.tx');
    tracker.finishTransaction('committed');

    expect(infoSpy).not.toHaveBeenCalled();
  });

  test('Stops recording once the transaction ends', () => {
    tracker.startTransaction();
    tracker.finishTransaction('committed');
    tracker.recordResourceAccess('sql', 'read', ['User', 'Patient'], 'test.afterCommit');

    expect(infoSpy).toHaveBeenCalledWith(
      '[RepoSplit] Mixed resource access',
      expect.objectContaining({ inTransaction: false })
    );
    expect(infoSpy).not.toHaveBeenCalledWith('[RepoSplit] Mixed transaction access', expect.anything());
  });

  test('Tolerates finishing when no transaction is being tracked', () => {
    expect(() => tracker.finishTransaction('rolled_back')).not.toThrow();
    expect(infoSpy).not.toHaveBeenCalled();
  });
});

describe('RepositoryAccessTracker double start', () => {
  test('Warns and overwrites when a previous transaction never finished', () => {
    const tracker = new RepositoryAccessTracker();
    const warnSpy = vi.spyOn(getLogger(), 'warn').mockImplementation(() => {});
    const infoSpy = vi.spyOn(getLogger(), 'info').mockImplementation(() => {});
    try {
      tracker.startTransaction();
      tracker.recordResourceAccess('sql', 'read', ['User', 'Patient'], 'test.abandoned');
      infoSpy.mockClear();

      // A lost diagnostic must not fail the transaction being started.
      expect(() => tracker.startTransaction()).not.toThrow();
      expect(warnSpy).toHaveBeenCalledWith('[RepoSplit] Transaction access rollup was not finished', {
        sources: ['test.abandoned'],
      });

      // The abandoned rollup is discarded rather than merged into the new transaction's.
      tracker.finishTransaction('committed');
      expect(infoSpy).not.toHaveBeenCalledWith('[RepoSplit] Mixed transaction access', expect.anything());
    } finally {
      warnSpy.mockRestore();
      infoSpy.mockRestore();
    }
  });
});
