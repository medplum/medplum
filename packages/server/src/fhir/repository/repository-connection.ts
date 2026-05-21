// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { OperationOutcomeError } from '@medplum/core';
import { normalizeErrorString, sleep } from '@medplum/core';
import { RepositoryMode } from '@medplum/fhir-router';
import type { Pool, PoolClient } from 'pg';
import { getConfig } from '../../config/loader';
import { DatabaseMode, getDatabasePool } from '../../database';
import { getLogger } from '../../logger';
import type { TransactionIsolationLevel } from '../sql';
import { isRetryableTransactionError, normalizeDatabaseError } from '../sql';

const defaultTransactionAttempts = 2;
const defaultExpBackoffBaseDelayMs = 50;
const transactionIsolationLevelPriority: Record<TransactionIsolationLevel, number> = {
  'REPEATABLE READ': 1,
  SERIALIZABLE: 2,
};

type CallbackFrame = {
  pre: number;
  post: number;
};

export type StatementTimeoutOptions = {
  timeoutMs: number;
  mode?: DatabaseMode;
};

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

  private preCommitCallbacks: (() => Promise<void>)[] = [];
  private postCommitCallbacks: (() => Promise<void>)[] = [];
  private callbackStack: CallbackFrame[] = [];

  /**
   * Creates a connection that owns any PoolClient it acquires.
   */
  constructor() {
    this.mode = RepositoryMode.WRITER;
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

  isInTransaction(): boolean {
    return this.transactionDepth > 0;
  }

  hasConnection(): boolean {
    return !!this.conn;
  }

  /**
   * Returns a database client.
   * Use this method when you don't care if you're in a transaction or not.
   * For example, use this method for "read by ID".
   * The return value can either be a pool client or a pool.
   * If in a transaction, then returns the transaction client (PoolClient).
   * Otherwise, returns the pool (Pool).
   * @param mode - The database mode.
   * @returns The database client.
   */
  getDatabaseClient(mode: DatabaseMode): Pool | PoolClient {
    this.assertNotClosed();
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
      this.conn = undefined;
      this.connMode = undefined;
      this.discardOnRelease = false;
    }
  }

  async withStatementTimeout<TResult>(
    options: StatementTimeoutOptions,
    callback: (client: PoolClient) => Promise<TResult>
  ): Promise<TResult> {
    this.assertNotClosed();
    this.assertOwnsClient();
    if (this.transactionDepth > 0) {
      throw new Error('Cannot set statement timeout during an active transaction');
    }

    const client = await this.getConnection(options.mode ?? DatabaseMode.WRITER);
    this.pinDepth++;
    this.discardOnRelease = true;

    try {
      await client.query(`SELECT set_config('statement_timeout', $1, false)`, [String(options.timeoutMs)]);
      return await callback(client);
    } finally {
      this.pinDepth--;
      if (this.pinDepth === 0) {
        this.releaseConnection();
      }
    }
  }

  async withTransaction<TResult>(
    callback: (client: PoolClient) => Promise<TResult>,
    options?: { serializable?: boolean }
  ): Promise<TResult> {
    this.assertNotClosed();
    const isolationLevel = options?.serializable ? 'SERIALIZABLE' : 'REPEATABLE READ';

    const config = getConfig();
    const transactionAttempts = config.transactionAttempts ?? defaultTransactionAttempts;
    let error: OperationOutcomeError | undefined;
    for (let attempt = 0; attempt < transactionAttempts; attempt++) {
      const attemptStartTime = Date.now();
      let transactionStarted = false;
      try {
        const client = await this.beginTransaction(isolationLevel);
        transactionStarted = true;
        const result = await callback(client);
        await this.commitTransaction();
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
        if (transactionStarted) {
          await this.rollbackTransaction(operationOutcomeError);
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
   * tail of a FIFO queue for transaction state change requests.
   */
  private transactionStateLock: Promise<undefined> = Promise.resolve(undefined);

  /**
   * Serializes the small critical sections that reads/writes transaction
   * state and issues the matching transaction SQL commands:
   * - read/write transactionDepth
   * - choose COMMIT vs RELEASE SAVEPOINT
   * - clear/pop callback frames
   * - release connection state
   * @param callback - The callback to execute with the transaction state lock.
   * @returns Passthrough result of the callback.
   */
  private async withTransactionStateLock<T>(callback: () => Promise<T>): Promise<T> {
    // capture the current tail of the queue
    const previous = this.transactionStateLock;

    // create a new unresolved promise and make it the new queue tail immediately
    const { promise, resolve } = Promise.withResolvers<undefined>();
    this.transactionStateLock = promise;

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

  private async beginTransaction(isolationLevel: TransactionIsolationLevel): Promise<PoolClient> {
    return this.withTransactionStateLock(async () => {
      this.assertNotClosed();
      this.assertCompatibleTransactionIsolationLevel(isolationLevel);
      const nextDepth = this.transactionDepth + 1;
      const conn = await this.getConnection(DatabaseMode.WRITER);
      try {
        if (nextDepth === 1) {
          await conn.query('BEGIN ISOLATION LEVEL ' + isolationLevel);
        } else {
          await conn.query('SAVEPOINT sp' + nextDepth);
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
      this.transactionDepth = nextDepth;
      this.pushCallbackFrame();
      return conn;
    });
  }

  private async commitTransaction(): Promise<void> {
    const shouldProcessPreCommit = await this.withTransactionStateLock(async () => {
      this.assertInTransaction();
      return this.transactionDepth === 1;
    });

    // processPreCommit needs to be invoked outside of the transaction state lock to avoid deadlocks
    // since it could involve transactions. Repository.withTransaction keeps the caller repo blocked
    // during this window, so callback code must use the transaction-scoped repo it was given.
    if (shouldProcessPreCommit) {
      await this.processPreCommit();
    }

    const shouldProcessPostCommit = await this.withTransactionStateLock(async () => {
      this.assertInTransaction();
      const conn = await this.getConnection(DatabaseMode.WRITER);
      if (this.transactionDepth === 1) {
        await conn.query('COMMIT');
        this.transactionDepth = 0;
        this.transactionIsolationLevel = undefined;
        this.releaseConnection();
        this.clearCallbackStack();
        return true;
      } else {
        // If RELEASE SAVEPOINT fails (e.g. transaction in aborted state), let the error propagate.
        // withTransaction's catch will invoke rollbackTransaction, which can run ROLLBACK TO SAVEPOINT
        // even against an aborted transaction to recover — aborting here would discard work the outer
        // scope can still commit. rollbackTransaction's own catch handles the truly-dead-connection case.
        await conn.query('RELEASE SAVEPOINT sp' + this.transactionDepth);
        this.transactionDepth--; // safe to decrement since assertInTransaction() ensures transactionDepth > 0
        this.popCallbackFrame();
        return false;
      }
    });

    if (shouldProcessPostCommit) {
      await this.processPostCommit();
    }
  }

  private async rollbackTransaction(error: Error): Promise<void> {
    return this.withTransactionStateLock(async () => {
      // Tolerate being called after state has already been reset (e.g. when a prior
      // cleanup path in commit/rollback fully aborted the transaction on a dead connection).
      if (this.transactionDepth === 0) {
        return;
      }
      const conn = await this.getConnection(DatabaseMode.WRITER);
      const isOuter = this.transactionDepth === 1;
      try {
        if (isOuter) {
          await conn.query('ROLLBACK');
        } else {
          await conn.query('ROLLBACK TO SAVEPOINT sp' + this.transactionDepth);
        }
      } catch (rollbackErr) {
        // ROLLBACK itself failed — connection is effectively dead (e.g. killed by idle_in_transaction_session_timeout).
        getLogger().warn('Error rolling back transaction', {
          err: normalizeErrorString(rollbackErr),
          originalErr: normalizeErrorString(error),
        });

        // abort the transaction
        this.transactionDepth = 0;
        this.transactionIsolationLevel = undefined;
        this.clearCallbackStack();
        // Pass the original triggering error so the client is released with the right root cause.
        this.releaseConnection(error);
        return;
      }
      this.transactionDepth--; // safe to decrement since early return if transactionDepth === 0
      this.truncateCommitCallbacks();
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

  async ensureInTransaction<TResult>(callback: (client: PoolClient) => Promise<TResult>): Promise<TResult> {
    if (this.transactionDepth) {
      const client = await this.getConnection(DatabaseMode.WRITER);
      return callback(client);
    } else {
      return this.withTransaction(callback);
    }
  }

  async preCommit(fn: () => Promise<void>): Promise<void> {
    if (this.transactionDepth) {
      this.preCommitCallbacks.push(fn);
    } else {
      // rely on thrown errors bubbling up from here to halt the transaction
      await fn();
    }
  }

  private async processPreCommit(): Promise<void> {
    const callbacks = this.preCommitCallbacks;
    this.preCommitCallbacks = [];
    for (const cb of callbacks) {
      // rely on thrown errors bubbling up from here to halt the transaction
      await cb();
    }
  }

  async postCommit(fn: () => Promise<void>): Promise<void> {
    if (this.transactionDepth) {
      this.postCommitCallbacks.push(fn);
    } else {
      await this.invokePostCommitCallback(fn);
    }
  }

  private async processPostCommit(): Promise<void> {
    const callbacks = this.postCommitCallbacks;
    this.postCommitCallbacks = [];
    for (const cb of callbacks) {
      await this.invokePostCommitCallback(cb);
    }
  }

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

  private pushCallbackFrame(): void {
    this.callbackStack.push({
      pre: this.preCommitCallbacks.length,
      post: this.postCommitCallbacks.length,
    });
  }

  private popCallbackFrame(): CallbackFrame {
    const frame = this.callbackStack.pop();

    if (!frame) {
      throw new Error('No callback frame');
    }

    return frame;
  }

  private clearCallbackStack(): void {
    this.callbackStack = [];
  }

  private truncateCommitCallbacks(): void {
    const frame = this.popCallbackFrame();
    if (frame.pre !== this.preCommitCallbacks.length) {
      this.preCommitCallbacks = this.preCommitCallbacks.slice(0, frame.pre);
    }
    if (frame.post !== this.postCommitCallbacks.length) {
      this.postCommitCallbacks = this.postCommitCallbacks.slice(0, frame.post);
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
