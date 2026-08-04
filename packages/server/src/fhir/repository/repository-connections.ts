// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { normalizeErrorString } from '@medplum/core';
import { RepositoryMode } from '@medplum/fhir-router';
import { getLogger } from '../../logger';
import { shardRoutingError } from '../sharding';
import type { ConnectionScope } from './repository-connection';
import { RepositoryConnection } from './repository-connection';

export type ConnectionEntry = {
  readonly connection: RepositoryConnection;
  /**
   * The scope a repository binds to for this shard unless it holds a transaction scope here.
   *
   * A connection's root scope is created with the connection and never changes, so it is safe to
   * share across every repository using this set: a repository bound to the root scope is
   * correctly locked out for as long as some other repository has a transaction scope pushed onto
   * the same connection.
   */
  readonly rootScope: ConnectionScope;
  /** False for a caller-owned client, which we must never release. */
  readonly owned: boolean;
};

/**
 * The database connections backing one or more `Repository` facades. One per
 * shard created lazily. A `RepositoryConnection` speaks to exactly one database,
 * so a repository whose resource types do not all live on the same shard needs
 * more than one connection managed by this class. It deliberately enforces only
 * one rule of its own: A borrowed connection is the only connection. A set seeded
 * with a caller-owned client cannot acquire more, matching `RepositoryConnection`'s
 * refusal to replace a borrowed client.
 *
 * Notably it does *not* police transactions, and offers no set-wide view of them. Several
 * connections may have transactions open at the same time, which is legal: they are separate
 * databases and so separate atomicity domains, and nothing promises atomicity across them. What must
 * never happen is a *single* transaction spanning shards, but that is managed by a repository's
 * binding rather than this set. {@link Repository.assertShardReachable} enforces it, where the
 * binding lives.
 *
 * Scope bookkeeping likewise stays with `Repository`. Everything here is shared by reference
 * between repository facades using it, so a connection created by one is visible to — and disposed
 * with — all of them.
 */
export class RepositoryConnections implements Disposable {
  private readonly _entries = new Map<string, ConnectionEntry>();
  /** Mode applied to connections created from here on. See {@link mode}. */
  private preferredMode: RepositoryMode = RepositoryMode.WRITER;
  private closed = false;
  /** Set when seeded with a caller-owned client; no other shard may then be reached. */
  private readonly sealedToShardId: string | undefined;

  /**
   * @param borrowed - Optional caller-owned connection to seed the set with. The set is then
   * sealed to that connection's shard, and disposing the set leaves the connection alone.
   */
  constructor(borrowed?: RepositoryConnection) {
    if (borrowed) {
      this.sealedToShardId = borrowed.shardId;
      this.preferredMode = borrowed.mode;
      this._entries.set(borrowed.shardId, {
        connection: borrowed,
        rootScope: borrowed.getCurrentScope(),
        owned: false,
      });
    }
  }

  /**
   * The entry for a shard if its connection already exists, without creating one.
   *
   * This is how callers ask about a particular shard — `peek(id)?.connection.isInTransaction()` is
   * single-valued, where a set-wide "which shard is bound?" is not.
   * @param shardId - The shard to look up. Must already be normalized.
   * @returns The entry, or undefined if this set has never reached that shard.
   */
  peek(shardId: string): ConnectionEntry | undefined {
    return this._entries.get(shardId);
  }

  /**
   * @returns True if any connection in the set holds a live PoolClient.
   */
  hasConnection(): boolean {
    for (const entry of this._entries.values()) {
      if (entry.connection.hasConnection()) {
        return true;
      }
    }
    return false;
  }

  /**
   * Returns the entry for a shard, creating its connection on first use.
   *
   * Transaction state is not consulted: whether the caller is allowed to reach this shard depends on
   * the caller's own transaction binding, which only it knows. See
   * `Repository.assertShardReachable`.
   * @param shardId - The shard to reach. Must already be normalized.
   * @param source - (optional) The source of the operation, used for logging and debugging.
   * @returns The entry for that shard.
   * @throws If this set is sealed to a borrowed connection for a different shard.
   */
  entryFor(shardId: string, source?: string): ConnectionEntry {
    this.assertNotClosed();

    const existing = this._entries.get(shardId);
    if (existing) {
      return existing;
    }

    if (this.sealedToShardId !== undefined) {
      throw shardRoutingError(
        'Cannot use shard since repository is sealed to a different shard',
        `Requested shard ${shardId}, sealed to shard ${this.sealedToShardId}${source ? ', source: ' + source : ''}`
      );
    }

    const connection = new RepositoryConnection(shardId);
    connection.setMode(this.preferredMode);
    const entry: ConnectionEntry = { connection, rootScope: connection.getCurrentScope(), owned: true };
    this._entries.set(shardId, entry);
    return entry;
  }

  /**
   * @returns The entries created so far, in creation order.
   */
  entries(): Iterable<ConnectionEntry> {
    return this._entries.values();
  }

  /**
   * Preferred mode for future pool-backed operations.
   *
   * {@link RepositoryConnection.mode} promotes monotonically to writer once its connection has
   * done writer work, so this reports writer as soon as any one connection has.
   * @returns The preferred repository mode.
   */
  get mode(): RepositoryMode {
    for (const entry of this._entries.values()) {
      if (entry.connection.mode === RepositoryMode.WRITER) {
        return RepositoryMode.WRITER;
      }
    }
    return this.preferredMode;
  }

  /**
   * Sets the preferred mode on every connection, now and for those created later.
   * @param mode - The mode to apply.
   * @throws If any connection cannot adopt the mode, in which case none of them are changed.
   */
  setMode(mode: RepositoryMode): void {
    this.assertNotClosed();
    // Validate every connection before mutating any, so a rejection cannot leave the set
    // half-promoted.
    for (const entry of this._entries.values()) {
      entry.connection.assertCanSetMode(mode);
    }
    this.preferredMode = mode;
    for (const entry of this._entries.values()) {
      entry.connection.setMode(mode);
    }
  }

  [Symbol.dispose](removeConnection?: boolean): void {
    // idempotent
    if (this.closed) {
      return;
    }
    this.closed = true;
    for (const entry of this._entries.values()) {
      if (!entry.owned) {
        continue;
      }
      try {
        entry.connection[Symbol.dispose](removeConnection);
      } catch (err) {
        // Keep going: leaking the remaining shards' PoolClients is worse than losing this error.
        getLogger().warn('Error disposing repository connection', {
          shardId: entry.connection.shardId,
          err: normalizeErrorString(err),
        });
      }
    }
  }

  private assertNotClosed(): void {
    if (this.closed) {
      throw new Error('Already closed');
    }
  }
}
