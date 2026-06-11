// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { OperationOutcomeError } from '@medplum/core';
import { normalizeErrorString, sleep } from '@medplum/core';
import { RepositoryMode } from '@medplum/fhir-router';
import assert from 'node:assert';
import type { PoolClient } from 'pg';
import { getConfig } from '../../config/loader';
import { DatabaseMode, getDatabasePool } from '../../database';
import { getLogger } from '../../logger';
import type { PgQueryable, TransactionIsolationLevel } from '../sql';
import { isRetryableTransactionError, normalizeDatabaseError } from '../sql';
import type { TransactionIdleStatus, TransactionIdleTrackerOptions } from './transaction-idle-tracker';
import { TransactionIdleTracker } from './transaction-idle-tracker';

const defaultTransactionAttempts = 2;
const defaultExpBackoffBaseDelayMs = 50;
const transactionIsolationLevelPriority: Record<TransactionIsolationLevel, number> = {
  'REPEATABLE READ': 1,
  SERIALIZABLE: 2,
};

export type StatementTimeoutOptions = {
  timeoutMs: number;
  mode?: DatabaseMode;
};

export type Scope = object & { readonly _brand: 'scope' };

type WritableScope = {
  readonly _brand: 'scope';
  parent?: WritableScope;
  state: 'active' | 'released' | 'committing' | 'post-commit' | 'ended';
  preCommitCallbacks: (() => Promise<void>)[];
  postCommitCallbacks: (() => Promise<void>)[];
};

function createScope(parent?: WritableScope): WritableScope {
  return {
    _brand: 'scope',
    parent,
    state: 'active',
    preCommitCallbacks: [],
    postCommitCallbacks: [],
  };
}

function validateWritableScope(scope: unknown): WritableScope {
  if (typeof scope === 'object' && scope !== null && '_brand' in scope && scope._brand === 'scope') {
    return scope as unknown as WritableScope;
  }
  throw new Error('Invalid scope');
}

/**
 * Shared database-session state for one or more Repository facades.
 *
 * Any repositories that can share a PoolClient should share a RepositoryConnection
 * so transaction depth, savepoints, callbacks, and cache deferral decisions
 * cannot diverge from the underlying Postgres transaction.
 */
export class RepositoryConnection implements Disposable {
  private conn?: PoolClient;
  private connMode?: DatabaseMode;
  private ownsClient = true;
  private transactionDepth = 0;
  private transactionIsolationLevel?: TransactionIsolationLevel;
  private pinDepth = 0;
  private discardOnRelease = false;
  private closed = false;
  mode: RepositoryMode;
  private transactionIdleTracker?: TransactionIdleTracker;

  private rootScope: WritableScope;
  private currentScope: WritableScope;

  /**
   * Creates a connection that owns any PoolClient it acquires.
   */
  constructor() {
    this.mode = RepositoryMode.WRITER;
    // rootScope can not actually have callbacks, maybe we should update the type
    this.rootScope = createScope();
    this.currentScope = this.rootScope;
  }

  /**
   * Creates a connection around a caller-owned PoolClient.
   * @param client - Caller-owned database client.
   * @param options - Borrowed client options.
   * @param options.mode - Database mode for the borrowed client.
   * @returns Repository connection wrapping the borrowed client.
   */
  static borrowClient(client: PoolClient, options: { mode: DatabaseMode }): RepositoryConnection {
    const connection = new RepositoryConnection();
    connection.conn = client;
    connection.connMode = options.mode;
    connection.ownsClient = false;
    connection.mode = options.mode === DatabaseMode.READER ? RepositoryMode.READER : RepositoryMode.WRITER;
    return connection;
  }

  getCurrentScope(): Scope {
    return this.currentScope;
  }

  isInTransaction(): boolean {
    return this.transactionDepth > 0;
  }

  hasConnection(): boolean {
    return !!this.conn;
  }

  assertCurrentScope(scope: unknown): WritableScope {
    const writableScope = validateWritableScope(scope);
    if (writableScope !== this.currentScope) {
      throw new Error('Scope is not current');
    }
    // TODO does writableScope.state need to be checked?
    return writableScope;
  }

  assertScope(scope: Scope): WritableScope {
    const writableScope = validateWritableScope(scope);
    let current = writableScope;
    while (current !== this.currentScope) {
      if (!current.parent) {
        throw new Error(
          'Repository is in an active transaction; use the transaction-scoped repository passed to the callback'
        );
      }

      if (current.state === 'ended') {
        throw new Error('The transaction has ended');
      }
      current = current.parent;
    }

    return writableScope;
  }

  /**
   * Returns a database client.
   * Use this method when you don't care if you're in a transaction or not.
   * For example, use this method for "read by ID".
   * The return value can either be a pool client or a pool.
   * If in a transaction, then returns the transaction client (PoolClient).
   * Otherwise, returns the pool (Pool).
   * @param scope - The scope of the database client.
   * @param mode - The database mode.
   * @returns The database client.
   */
  getDatabaseClient(scope: Scope, mode: DatabaseMode): PgQueryable {
    this.assertNotClosed();
    this.assertScope(scope);
    if (this.conn) {
      // A held client might be pinned outside a transaction, but it still has one physical
      // database role. Do not let writer work accidentally run on a reader connection.
      this.assertConnectionMode(mode);
      return this.conn;
    }
    this.assertCanAcquireConnection();
    if (mode === DatabaseMode.WRITER) {
      // If we ever use a writer, then all subsequent operations must use a writer.
      this.mode = RepositoryMode.WRITER;
    }
    return getDatabasePool(this.mode === RepositoryMode.WRITER ? DatabaseMode.WRITER : mode);
  }

  /**
   * Returns a proper database connection.
   * Unlike getDatabaseClient(), this method always returns a PoolClient.
   * @param mode - The database mode.
   * @returns Database connection.
   */
  private async getConnection(mode: DatabaseMode): Promise<PoolClient> {
    this.assertNotClosed();
    if (this.conn) {
      this.assertConnectionMode(mode);
      return this.conn;
    }

    this.assertCanAcquireConnection();
    this.conn = await getDatabasePool(mode).connect();
    this.connMode = mode;
    return this.conn;
  }

  /**
   * Releases the database connection.
   * Include an error to remove the connection from the pool.
   * See: https://github.com/brianc/node-postgres/blob/master/packages/pg-pool/index.js#L333
   * @param err - Optional error to remove the connection from the pool.
   */
  private releaseConnection(err?: boolean | Error): void {
    if (!this.conn) {
      return;
    }
    // Normal releases wait for all active pin scopes to unwind. Error releases are forced
    // because the current physical client is no longer safe to reuse.
    if (this.pinDepth > 0 && !err) {
      return;
    }
    const releaseErr = err || this.discardOnRelease;
    if (this.ownsClient) {
      const conn = this.conn;
      this.discardTransactionIdleTracking();
      this.conn = undefined;
      this.connMode = undefined;
      this.discardOnRelease = false;
      try {
        conn.release(releaseErr);
      } catch (releaseError) {
        // pg-pool throws if release() is called twice (e.g. socket already errored out).
        // We've done our part; just log and move on.
        getLogger().warn('Error releasing database client', { err: normalizeErrorString(releaseError) });
      }
    } else if (releaseErr) {
      // Shared connection is known to be dead. Drop our reference so we don't reuse it.
      // The owner of the connection is responsible for the actual release.
      this.discardTransactionIdleTracking();
      this.conn = undefined;
      this.connMode = undefined;
      this.discardOnRelease = false;
    }
  }

  async withStatementTimeout<TResult>(
    options: StatementTimeoutOptions,
    callback: (client: PoolClient) => Promise<TResult>
  ): Promise<TResult> {
    const client = await this.withConnectionStateLock(async () => {
      this.assertNotClosed();
      this.assertOwnsClient();
      if (this.transactionDepth > 0) {
        throw new Error('Cannot set statement timeout during an active transaction');
      }

      const client = await this.getConnection(options.mode ?? DatabaseMode.WRITER);

      await client.query(`SELECT set_config('statement_timeout', $1, false)`, [String(options.timeoutMs)]);
      this.pinDepth++;
      this.discardOnRelease = true;
      return client;
    });

    try {
      // invoking the callback must happen outside of the connection state lock to avoid deadlocks
      return await callback(client);
    } finally {
      await this.withConnectionStateLock(async () => {
        this.pinDepth--;
        if (this.pinDepth === 0) {
          this.releaseConnection();
        }
      });
    }
  }

  async withTransaction<TResult>(
    scope: Scope,
    callback: (txScope: Scope) => Promise<TResult>,
    options?: { serializable?: boolean }
  ): Promise<TResult> {
    this.assertNotClosed();
    const isolationLevel = options?.serializable ? 'SERIALIZABLE' : 'REPEATABLE READ';

    const config = getConfig();
    const transactionAttempts = config.transactionAttempts ?? defaultTransactionAttempts;
    let error: OperationOutcomeError | undefined;
    for (let attempt = 0; attempt < transactionAttempts; attempt++) {
      const attemptStartTime = Date.now();
      let txScope: WritableScope | undefined;
      try {
        const { client, scope: newTxScope } = await this.beginTransaction(scope, isolationLevel);
        txScope = newTxScope;
        if (this.transactionDepth === 1) {
          this.startTransactionIdleTracking(client, {
            thresholdMs: config.idleInTransactionLogThresholdMs ?? -1,
            attempt,
            transactionAttempts,
            serializable: options?.serializable ?? false,
          });
        }
        const result = await callback(txScope);
        await this.commitTransaction(txScope);
        if (attempt > 0) {
          getLogger().info('Completed transaction', {
            attempt,
            attemptDurationMs: Date.now() - attemptStartTime,
            transactionAttempts,
            serializable: options?.serializable ?? false,
          });
        }
        return result;
      } catch (err) {
        const operationOutcomeError = normalizeDatabaseError(err);
        // Assigning here and throwing below is necessary to satisfy TypeScript
        error = operationOutcomeError;

        // Ensure transaction is rolled back before attempting any retry
        if (txScope) {
          await this.rollbackTransaction(txScope, operationOutcomeError);
        }
        if (this.transactionDepth || !isRetryableTransactionError(operationOutcomeError)) {
          break; // Fall through to throw statement outside of the loop
        }
      } finally {
        this.endTransaction();
      }

      const attemptDurationMs = Date.now() - attemptStartTime;

      if (attempt + 1 < transactionAttempts) {
        const baseDelayMs = config.transactionExpBackoffBaseDelayMs ?? defaultExpBackoffBaseDelayMs;
        // Attempts are 0-indexed, so first wait after first attempt will be somewhere between 75% and 125% of baseDelayMs
        // This calculation results in something like this for the default values:
        // Between attempt 0 and 1: 50 * (2^0) = 50 * [0.75, 1.25] = **[37.5, 63.5] ms**
        // Between attempt 1 and 2: 50 * (2^1) = 100 * [0.75, 1.25] = **[75, 125] ms**
        // etc...
        const delayMs = Math.ceil(baseDelayMs * 2 ** attempt * (0.75 + Math.random() * 0.5));
        getLogger().info('Retrying transaction', {
          attempt,
          attemptDurationMs,
          transactionAttempts,
          serializable: options?.serializable ?? false,
          delayMs,
          baseDelayMs,
        });
        await sleep(delayMs);
      } else {
        getLogger().info('Transaction failed final attempt', {
          attempt,
          attemptDurationMs,
          transactionAttempts,
          serializable: options?.serializable ?? false,
        });
      }
    }

    // Cannot be undefined: either the function returns normally from the `try` block,
    // or `error` is assigned at top of `catch` block before reaching this line
    throw error;
  }

  /**
   * tail of a FIFO queue for connection state change requests.
   */
  private connectionStateLock: Promise<undefined> = Promise.resolve(undefined);

  /**
   * Serializes the small critical sections that reads/writes connection
   * state and issues the matching connection SQL commands:
   * - read/write transactionDepth
   * - choose COMMIT vs RELEASE SAVEPOINT
   * - clear/pop callback frames
   * - release connection state
   * - set statement_timeout or other connection-level config
   * @param callback - The callback to execute with the transaction state lock.
   * @returns Passthrough result of the callback.
   */
  private async withConnectionStateLock<T>(callback: () => Promise<T>): Promise<T> {
    // capture the current tail of the queue
    const previous = this.connectionStateLock;

    // create a new unresolved promise and make it the new queue tail immediately
    const { promise, resolve } = Promise.withResolvers<undefined>();
    this.connectionStateLock = promise;

    // Wait previous request resolves
    await previous;
    // current request owns the lock.

    try {
      return await callback();
    } finally {
      // release the lock
      resolve(undefined);
    }
  }

  private async beginTransaction(
    scope: Scope,
    isolationLevel: TransactionIsolationLevel
  ): Promise<{ client: PoolClient; scope: WritableScope }> {
    return this.withConnectionStateLock(async () => {
      this.assertScope(scope);
      this.assertNotClosed();
      this.assertCompatibleTransactionIsolationLevel(isolationLevel);
      const nextDepth = this.transactionDepth + 1;
      const client = await this.getConnection(DatabaseMode.WRITER);
      try {
        if (nextDepth === 1) {
          await client.query('BEGIN ISOLATION LEVEL ' + isolationLevel);
        } else {
          await client.query('SAVEPOINT sp' + nextDepth);
        }
      } catch (err) {
        if (nextDepth === 1) {
          // If BEGIN itself fails, no transaction exists to roll back. Drop the client
          // with the original error so pg-pool does not return a questionable session.
          this.releaseConnection(err instanceof Error ? err : true);
        }
        throw err;
      }
      // Publish transaction state only after Postgres confirms BEGIN/SAVEPOINT.
      if (nextDepth === 1) {
        this.transactionIsolationLevel = isolationLevel;
      }
      const txScope = createScope(this.currentScope);
      this.currentScope = txScope;
      this.transactionDepth = nextDepth;
      return { client, scope: txScope };
    });
  }

  private async commitTransaction(txScope: WritableScope): Promise<void> {
    const shouldProcessPreCommit = await this.withConnectionStateLock(async () => {
      this.assertCurrentScope(txScope);
      this.assertInTransaction();
      const isOuter = this.transactionDepth === 1;
      if (isOuter) {
        this.currentScope.state = 'committing';
      }
      return isOuter;
    });

    // processPreCommit needs to be invoked outside of the transaction state lock to avoid deadlocks
    // since it could involve transactions. Repository.withTransaction keeps the caller repo blocked
    // during this window, so callback code must use the transaction-scoped repo it was given.
    if (shouldProcessPreCommit) {
      await this.processPreCommit(this.currentScope);
    }

    const shouldProcessPostCommit = await this.withConnectionStateLock(async () => {
      this.assertCurrentScope(txScope);
      this.assertInTransaction();
      const conn = await this.getConnection(DatabaseMode.WRITER);
      if (this.transactionDepth === 1) {
        await conn.query('COMMIT');
        this.finishTransactionIdleTracking('committed');

        assert(this.currentScope.state === 'committing');
        this.currentScope.state = 'post-commit';

        this.transactionDepth = 0;
        this.transactionIsolationLevel = undefined;
        this.releaseConnection();
        return true;
      } else {
        // If RELEASE SAVEPOINT fails (e.g. transaction in aborted state), let the error propagate.
        // withTransaction's catch will invoke rollbackTransaction, which can run ROLLBACK TO SAVEPOINT
        // even against an aborted transaction to recover — aborting here would discard work the outer
        // scope can still commit. rollbackTransaction's own catch handles the truly-dead-connection case.
        await conn.query('RELEASE SAVEPOINT sp' + this.transactionDepth);
        this.transactionDepth--; // safe to decrement since assertInTransaction() ensures transactionDepth > 0

        assert(this.currentScope.parent);
        this.currentScope.state = 'released';
        this.currentScope.parent.preCommitCallbacks.push(...this.currentScope.preCommitCallbacks);
        this.currentScope.parent.postCommitCallbacks.push(...this.currentScope.postCommitCallbacks);
        this.currentScope = this.currentScope.parent;
        return false;
      }
    });

    if (shouldProcessPostCommit) {
      try {
        await this.processPostCommit(this.currentScope);
      } finally {
        assert(this.currentScope.state === 'post-commit');
        assert(this.currentScope.parent);
        this.currentScope.state = 'ended';
        this.currentScope = this.currentScope.parent;
      }
    }
  }

  private async rollbackTransaction(txScope: WritableScope, error: Error): Promise<void> {
    return this.withConnectionStateLock(async () => {
      // Tolerate being called after state has already been reset (e.g. when a prior
      // cleanup path in commit/rollback fully aborted the transaction on a dead connection).
      if (this.transactionDepth === 0) {
        return;
      }
      this.assertCurrentScope(txScope);
      const conn = await this.getConnection(DatabaseMode.WRITER);
      const isOuter = this.transactionDepth === 1;
      try {
        if (isOuter) {
          await conn.query('ROLLBACK');
        } else {
          await conn.query('ROLLBACK TO SAVEPOINT sp' + this.transactionDepth);
        }
      } catch (rollbackErr) {
        if (isOuter) {
          this.finishTransactionIdleTracking('rolled_back');
        }

        // ROLLBACK itself failed — connection is effectively dead (e.g. killed by idle_in_transaction_session_timeout).
        getLogger().warn('Error rolling back transaction', {
          err: normalizeErrorString(rollbackErr),
          originalErr: normalizeErrorString(error),
        });

        // abort the transaction
        while (this.currentScope !== this.rootScope) {
          assert(this.currentScope.parent);
          this.currentScope.state = 'ended';
          this.currentScope = this.currentScope.parent;
        }
        this.transactionDepth = 0;
        this.transactionIsolationLevel = undefined;

        // Pass the original triggering error so the client is released with the right root cause.
        this.releaseConnection(error);
        return;
      }
      if (isOuter) {
        this.finishTransactionIdleTracking('rolled_back');
      }
      // accept active: e.g. withTransaction callback threw
      // accept committing: pre-commit callback threw
      assert(this.currentScope.state === 'active' || this.currentScope.state === 'committing');
      assert(this.currentScope.parent);
      this.currentScope.state = 'ended';
      this.currentScope = this.currentScope.parent;

      this.transactionDepth--; // safe to decrement since early return if transactionDepth === 0
      if (isOuter) {
        this.transactionIsolationLevel = undefined;
        this.releaseConnection(error);
      }
    });
  }

  private endTransaction(): void {
    if (this.transactionDepth === 0) {
      this.releaseConnection();
    }
  }

  private startTransactionIdleTracking(client: PoolClient, options: TransactionIdleTrackerOptions): void {
    if (options.thresholdMs < 0 || this.transactionIdleTracker) {
      return;
    }
    this.transactionIdleTracker = new TransactionIdleTracker(client, options);
  }

  private finishTransactionIdleTracking(status: TransactionIdleStatus): void {
    this.transactionIdleTracker?.finish(status);
    this.transactionIdleTracker = undefined;
  }

  private discardTransactionIdleTracking(): void {
    this.transactionIdleTracker?.discard();
    this.transactionIdleTracker = undefined;
  }

  private assertInTransaction(): void {
    if (this.transactionDepth === 0) {
      throw new Error('Not in transaction');
    }
  }

  private assertOwnsClient(): void {
    if (!this.ownsClient) {
      throw new Error('Does not own database client');
    }
  }

  private assertCanAcquireConnection(): void {
    if (!this.ownsClient) {
      // A borrowed RepositoryConnection wraps someone else's PoolClient. If that
      // client is gone, acquiring a replacement here would leak it because this
      // object is intentionally not allowed to release clients.
      throw new Error('Borrowed repository connection is no longer available');
    }
  }

  private assertConnectionMode(mode: DatabaseMode): void {
    if (!this.connMode) {
      throw new Error('Repository connection has no database mode');
    }
    if (this.connMode === DatabaseMode.READER && mode === DatabaseMode.WRITER) {
      throw new Error('Cannot use reader database connection for writer operation');
    }
  }

  private assertCompatibleTransactionIsolationLevel(isolationLevel: TransactionIsolationLevel): void {
    if (this.transactionDepth === 0) {
      return;
    }

    const activeIsolationLevel = this.transactionIsolationLevel;
    if (!activeIsolationLevel) {
      throw new Error('Active transaction is missing isolation level');
    }

    if (transactionIsolationLevelPriority[isolationLevel] > transactionIsolationLevelPriority[activeIsolationLevel]) {
      throw new Error(`Cannot start ${isolationLevel} transaction inside active ${activeIsolationLevel} transaction`);
    }
  }

  async preCommit(scope: Scope, fn: () => Promise<void>): Promise<void> {
    this.assertScope(scope);
    // accept committing so that pre-commit callbacks can add additional pre-commit callbacks
    if (this.currentScope.state !== 'active' && this.currentScope.state !== 'committing') {
      throw new Error('Cannot add pre-commit callback while scope is not active');
    }
    if (this.currentScope !== this.rootScope) {
      this.currentScope.preCommitCallbacks.push(fn);
    } else {
      // rely on thrown errors bubbling up from here to halt the transaction
      await fn();
    }
  }

  private async processPreCommit(scope: WritableScope): Promise<void> {
    let cb: (() => Promise<void>) | undefined;
    while ((cb = scope.preCommitCallbacks.shift())) {
      // rely on thrown errors bubbling up from here to halt the transaction
      await cb();
    }
  }

  async postCommit(scope: Scope, fn: () => Promise<void>): Promise<void> {
    this.assertScope(scope);
    if (this.currentScope.state === 'post-commit') {
      // this constraint could be relaxed if we wanted to allow post-commit callbacks
      // to add additional post-commit callbacks if there is a compelling reason to do so
      // But from the lifecycle of a transaction, it's not clear why that would be sensible
      // since post-commit callbacks are invoked after definitionally executed after committing
      // the transaction.
      throw new Error('Cannot add post-commit callback while processing post-commit callbacks');
    }
    if (this.currentScope !== this.rootScope) {
      this.currentScope.postCommitCallbacks.push(fn);
    } else {
      await this.invokePostCommitCallback(fn);
    }
  }

  private async processPostCommit(scope: WritableScope): Promise<void> {
    let cb: (() => Promise<void>) | undefined;
    while ((cb = scope.postCommitCallbacks.shift())) {
      await this.invokePostCommitCallback(cb);
    }
  }

  /**
   * Invokes a post-commit callback and suppresses/logs any errors that occur
   * @param fn - The post-commit callback to invoke.
   */
  private async invokePostCommitCallback(fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      if (err instanceof Error) {
        getLogger().error('Error processing post-commit callback', err);
      } else {
        getLogger().error('Error processing post-commit callback', { err });
      }
    }
  }

  [Symbol.dispose](removeConnection?: boolean): void {
    this.assertNotClosed();
    if (this.transactionDepth > 0) {
      // Bad state, remove connection from pool
      getLogger().error('Closing Repository with active transaction');
      this.releaseConnection(new Error('Closing Repository with active transaction'));
    } else {
      // Good state, return healthy connection to pool
      this.releaseConnection(removeConnection);
    }
    this.closed = true;
  }

  private assertNotClosed(): void {
    if (this.closed) {
      throw new Error('Already closed');
    }
  }
}
