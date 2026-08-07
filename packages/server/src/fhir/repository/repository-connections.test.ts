// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { RepositoryMode } from '@medplum/fhir-router';
import type { PoolClient } from 'pg';
import { initAppServices, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { DatabaseMode } from '../../database';
import { getLogger } from '../../logger';
import { GLOBAL_SHARD_ID, PLACEHOLDER_SHARD_ID } from '../sharding';
import { RepositoryConnection } from './repository-connection';
import { RepositoryConnections } from './repository-connections';

function mockClient(): PoolClient {
  return { query: vi.fn(async () => ({ rows: [] })), release: vi.fn() } as unknown as PoolClient;
}

function borrow(shardId: string, client: PoolClient = mockClient()): RepositoryConnection {
  return RepositoryConnection.borrowClient(client, { mode: DatabaseMode.WRITER, shardId });
}

describe('RepositoryConnections', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Creates one connection per shard and reuses it', () => {
    const connections = new RepositoryConnections();
    try {
      const a = connections.entryFor('shard-a');
      const b = connections.entryFor('shard-b');

      expect(a.connection.shardId).toStrictEqual('shard-a');
      expect(b.connection.shardId).toStrictEqual('shard-b');
      expect(a.connection).not.toBe(b.connection);
      expect(connections.entryFor('shard-a')).toBe(a);
      expect([...connections.entries()]).toStrictEqual([a, b]);
    } finally {
      connections[Symbol.dispose]();
    }
  });

  test('Keys a placeholder shard under the global shard', () => {
    const borrowed = borrow(PLACEHOLDER_SHARD_ID);
    expect(borrowed.shardId).toStrictEqual(GLOBAL_SHARD_ID);

    // The seeded entry must be reachable by the ID routing produces, not the alias it was
    // constructed with, or a repository on the placeholder shard would look sealed against itself.
    const connections = new RepositoryConnections(borrowed);
    expect(connections.entryFor(GLOBAL_SHARD_ID).connection).toBe(borrowed);
  });

  test('Seals a set seeded with a borrowed connection to that shard', () => {
    const connections = new RepositoryConnections(borrow(GLOBAL_SHARD_ID));
    expect(() => connections.entryFor('shard-b')).toThrow(
      `Cannot use shard since repository is sealed to a different shard (Requested shard shard-b, sealed to shard ${GLOBAL_SHARD_ID})`
    );
  });

  test('Leaves a borrowed connection alone when disposed', () => {
    const client = mockClient();
    const borrowed = borrow(GLOBAL_SHARD_ID, client);
    const connections = new RepositoryConnections(borrowed);

    connections[Symbol.dispose]();

    expect(client.release).not.toHaveBeenCalled();
    expect(borrowed.hasConnection()).toBe(true);
  });

  test('Does not police transactions itself', async () => {
    const connections = new RepositoryConnections();
    const entry = connections.entryFor(GLOBAL_SHARD_ID);
    try {
      const result = await entry.connection.withTransaction(
        entry.rootScope,
        async () => {
          expect(connections.peek(GLOBAL_SHARD_ID)?.connection.isInTransaction()).toBe(true);

          // Whether reaching another shard is allowed depends on the caller's own transaction
          // binding, which this set cannot see; `Repository.assertShardReachable` decides.
          expect(connections.entryFor('shard-b').connection.shardId).toStrictEqual('shard-b');
          expect(connections.peek('shard-b')?.connection.isInTransaction()).toBe(false);
          return 'success';
        },
        { resourceTypes: ['Patient'], source: 'test.crossShardTransaction' }
      );
      expect(result).toStrictEqual('success');

      expect(connections.peek(GLOBAL_SHARD_ID)?.connection.isInTransaction()).toBe(false);
    } finally {
      connections[Symbol.dispose]();
    }
  });

  test('Reports per-shard state when several connections are in transactions at once', async () => {
    const connections = new RepositoryConnections();
    const globalEntry = connections.entryFor(GLOBAL_SHARD_ID);
    const projectEntry = connections.entryFor('shard-project');
    expect(globalEntry).not.toBe(projectEntry);

    // Each transaction blocks until the other has begun, so both are open simultaneously.
    const globalStarted = Promise.withResolvers<undefined>();
    const projectStarted = Promise.withResolvers<undefined>();
    const observed: Record<string, boolean | undefined> = {};

    const globalTx = globalEntry.connection.withTransaction(
      globalEntry.rootScope,
      async () => {
        globalStarted.resolve(undefined);
        await projectStarted.promise;
        observed.globalSeesGlobal = connections.peek(GLOBAL_SHARD_ID)?.connection.isInTransaction();
        observed.globalSeesProject = connections.peek('shard-project')?.connection.isInTransaction();
        return 'global success';
      },
      { resourceTypes: ['Patient'], source: 'test.transactionRace.global' }
    );

    const projectTx = projectEntry.connection.withTransaction(
      projectEntry.rootScope,
      async () => {
        projectStarted.resolve(undefined);
        await globalStarted.promise;
        observed.projectSeesProject = connections.peek('shard-project')?.connection.isInTransaction();
        return 'project success';
      },
      { resourceTypes: ['Patient'], source: 'test.transactionRace.project' }
    );

    try {
      await expect(Promise.all([globalTx, projectTx])).resolves.toStrictEqual(['global success', 'project success']);
      expect(observed).toStrictEqual({
        globalSeesGlobal: true,
        globalSeesProject: true,
        projectSeesProject: true,
      });
    } finally {
      connections[Symbol.dispose]();
    }
  });

  test('Applies the preferred mode to connections created later', () => {
    const connections = new RepositoryConnections();
    try {
      connections.setMode(RepositoryMode.READER);

      expect(connections.mode).toStrictEqual(RepositoryMode.READER);
      expect(connections.entryFor('shard-a').connection.mode).toStrictEqual(RepositoryMode.READER);
    } finally {
      connections[Symbol.dispose]();
    }
  });

  test('Reports writer once any one connection has promoted', () => {
    const connections = new RepositoryConnections();
    try {
      connections.setMode(RepositoryMode.READER);
      const a = connections.entryFor('shard-a');
      connections.entryFor('shard-b');
      expect(connections.mode).toStrictEqual(RepositoryMode.READER);

      a.connection.setMode(RepositoryMode.WRITER);

      expect(connections.mode).toStrictEqual(RepositoryMode.WRITER);
    } finally {
      connections[Symbol.dispose]();
    }
  });

  test('Leaves every connection unchanged when one rejects the mode', async () => {
    const connections = new RepositoryConnections();
    // 'shard-b' is created first so it is validated before the pinned writer that rejects: a
    // set that applied as it iterated would already have demoted it by then.
    const b = connections.entryFor('shard-b');
    const pinned = connections.entryFor(GLOBAL_SHARD_ID);
    try {
      await pinned.connection.withStatementTimeout({ timeoutMs: 0, resourceTypes: 'Patient' }, async () => {
        expect(() => connections.setMode(RepositoryMode.READER)).toThrow(
          'Cannot set repository mode to reader while using writer database connection'
        );
        expect(b.connection.mode).toStrictEqual(RepositoryMode.WRITER);
        expect(connections.mode).toStrictEqual(RepositoryMode.WRITER);
      });
    } finally {
      connections[Symbol.dispose]();
    }
  });

  test('Disposes every connection it created even when one throws', () => {
    const warnSpy = vi.spyOn(getLogger(), 'warn').mockImplementation(() => {});
    const connections = new RepositoryConnections();
    const a = connections.entryFor('shard-a').connection;
    const b = connections.entryFor('shard-b').connection;
    const disposeA = vi.spyOn(a, Symbol.dispose).mockImplementation(() => {
      throw new Error('dispose failed');
    });
    const disposeB = vi.spyOn(b, Symbol.dispose);

    try {
      expect(() => connections[Symbol.dispose]()).not.toThrow();

      expect(disposeA).toHaveBeenCalled();
      expect(disposeB).toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        'Error disposing repository connection',
        expect.objectContaining({ shardId: 'shard-a', err: expect.stringContaining('dispose failed') })
      );
    } finally {
      disposeA.mockRestore();
      disposeB.mockRestore();
      warnSpy.mockRestore();
    }
  });

  test('Rejects use after disposal', () => {
    const connections = new RepositoryConnections();
    connections[Symbol.dispose]();

    // Disposal is idempotent, but the set is no longer usable.
    expect(() => connections[Symbol.dispose]()).not.toThrow();
    expect(() => connections.entryFor(GLOBAL_SHARD_ID)).toThrow('Already closed');
    expect(() => connections.setMode(RepositoryMode.READER)).toThrow('Already closed');
  });
});
