// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { EMPTY } from '@medplum/core';
import type { TransactionOptions } from '@medplum/fhir-router';
import type { ResourceType } from '@medplum/fhirtypes';
import { DatabaseMode } from '../../database';
import { getLogger } from '../../logger';
import { globalShardResourceTypes } from '../sharding';

export type RepositoryAccessOperation = 'read' | 'write' | 'transaction' | 'configuration';

export type ResourceTypeInput = ResourceType | readonly ResourceType[] | ReadonlySet<ResourceType>;

export interface RepositoryAccessOptions {
  /** The resource types involved in the operation */
  readonly resourceTypes: ResourceTypeInput;
  /** Short label identifying the call site (e.g. `repo.readResourceFromDatabase`) */
  readonly source?: string;
}

export interface ExecuteSqlOptions extends RepositoryAccessOptions {
  readonly operation: RepositoryAccessOperation;
  readonly mode: DatabaseMode;
}

export interface TransactionSqlOptions extends RepositoryAccessOptions, TransactionOptions {}

/**
 * Everything a transaction touched. Savepoints share the outermost transaction since they
 * run on the same connection. Access in a savepoint that later rolls back is still counted
 * since the code path attempted it.
 */
type TransactionAccessRollup = {
  sqlReadCount: number;
  sqlWriteCount: number;
  readResourceTypes: Set<ResourceType>;
  writeResourceTypes: Set<ResourceType>;
  globalResourceTypes: Set<ResourceType>;
  projectResourceTypes: Set<ResourceType>;
  sources: Set<string>;
};

export type TransactionAccessStatus = 'committed' | 'rolled_back';

/**
 * Logs operations that span the multiple shards at two granularities: each
 * statement as it happens, and each transaction rolled up when it ends.
 *
 * Legacy project's live on the global shard, so a mixed operation still resolves to a
 * single physical shard and runs fine. The logs produced here are the inventory of
 * cross-logical shard access; i.e. what has to be split up before a project can move
 * off the global shard without hitting errors.
 */
export class RepositoryAccessTracker {
  private rollup: TransactionAccessRollup | undefined;

  /**
   * Starts tracking a physical transaction. Call only for the outermost transaction; nested
   * savepoints record into the rollup already in progress.
   */
  startTransaction(): void {
    if (this.rollup) {
      // A rollup already in progress means a previous transaction on this connection never finished,
      // which is a bug in this class's bookkeeping — but the transaction being started is real work.
      // Warn and overwrite rather than throwing, so a lost diagnostic does not fail the request.
      getLogger().warn('[RepoSplit] Transaction access rollup was not finished', {
        sources: Array.from(this.rollup.sources),
      });
    }

    this.rollup = {
      sqlReadCount: 0,
      sqlWriteCount: 0,
      readResourceTypes: new Set(),
      writeResourceTypes: new Set(),
      globalResourceTypes: new Set(),
      projectResourceTypes: new Set(),
      sources: new Set(),
    };
  }

  /**
   * Stops tracking the current physical transaction, logging its rollup if it spanned shards.
   * Safe to call when no transaction is being tracked.
   * @param status - How the transaction ended.
   */
  finishTransaction(status: TransactionAccessStatus): void {
    const rollup = this.rollup;
    this.rollup = undefined;
    if (!rollup?.globalResourceTypes.size || !rollup.projectResourceTypes.size) {
      return;
    }

    getLogger().info('[RepoSplit] Mixed transaction access', {
      scope: 'transaction',
      status,
      globalResourceTypes: Array.from(rollup.globalResourceTypes),
      projectResourceTypes: Array.from(rollup.projectResourceTypes),
      readResourceTypes: Array.from(rollup.readResourceTypes),
      writeResourceTypes: Array.from(rollup.writeResourceTypes),
      sqlReadCount: rollup.sqlReadCount,
      sqlWriteCount: rollup.sqlWriteCount,
      sources: Array.from(rollup.sources),
    });
  }

  /**
   * Records one SQL access: logs it if it spans shards, and folds it into the rollup of the
   * transaction in progress, if any.
   * @param operation - What the access does.
   * @param resourceTypes - The resource types the access touches.
   * @param source - Short label identifying the call site.
   */
  recordResourceAccess(
    operation: RepositoryAccessOperation,
    resourceTypes: ResourceTypeInput,
    source: string | undefined
  ): void {
    if (operation === 'configuration') {
      return;
    }

    const all = normalizeResourceTypes(resourceTypes);
    if (all.size === 0) {
      return;
    }

    let global: ResourceType[] | undefined;
    let project: ResourceType[] | undefined;
    for (const resourceType of all) {
      if (globalShardResourceTypes.has(resourceType)) {
        (global ??= []).push(resourceType);
      } else {
        (project ??= []).push(resourceType);
      }
    }

    if (global && project) {
      getLogger().info('[RepoSplit] Mixed resource access', {
        scope: 'statement',
        operation,
        source,
        inTransaction: this.rollup !== undefined,
        globalResourceTypes: global,
        projectResourceTypes: project,
      });
    }

    const rollup = this.rollup;
    if (!rollup) {
      return;
    }

    if (operation === 'read') {
      rollup.sqlReadCount++;
      addAll(rollup.readResourceTypes, all);
    } else if (operation === 'write') {
      rollup.sqlWriteCount++;
      addAll(rollup.writeResourceTypes, all);
    }
    addAll(rollup.globalResourceTypes, global);
    addAll(rollup.projectResourceTypes, project);
    if (source) {
      rollup.sources.add(source);
    }
  }
}

function addAll(target: Set<ResourceType>, values: Iterable<ResourceType> | undefined): void {
  for (const value of values ?? EMPTY) {
    target.add(value);
  }
}

/**
 * Coerces the accepted resource-type shapes into a set.
 * @param input - One resource type, or a list or set of them.
 * @returns The resource types as a set.
 */
export function normalizeResourceTypes(input: ResourceTypeInput): ReadonlySet<ResourceType> {
  return typeof input === 'string' ? new Set([input]) : new Set(input);
}

/**
 * Factory helpers for the {@link ExecuteSqlOptions} passed to `Repository.getDatabaseClient` /
 * `Repository.executeSql`. Each helper records the resource types and intent of an access so the
 * shard-boundary tracking sees it.
 */
export const repoAccess = {
  /**
   * Use when reading resources (read-by-id, history, search, count, etc.).
   * Pass the resource type(s) the query selects from so the access is attributed correctly.
   * Defaults to DatabaseMode.READER which can be overridden as needed, which should be rare.
   * @param resourceTypes - The resource type(s) the query reads.
   * @param options - Optional overrides.
   * @param options.mode - The database mode to use (default: DatabaseMode.READER).
   * @param options.source - Short label identifying the call site (e.g. `repo.readResource`).
   * @returns Options describing the read access.
   */
  sqlRead: (
    resourceTypes: ResourceTypeInput,
    options?: { mode?: DatabaseMode; source?: string }
  ): ExecuteSqlOptions => {
    return {
      mode: options?.mode ?? DatabaseMode.READER,
      operation: 'read',
      resourceTypes,
      source: options?.source,
    };
  },

  /**
   * Use when writing resources (INSERT/UPDATE/DELETE on a resource and its
   * history/lookup tables). Always uses DatabaseMode.WRITER.
   * @param resourceTypes - The resource type(s) the query writes.
   * @param options - Optional overrides.
   * @param options.source - Short label identifying the call site (e.g. `repo.updateResource`).
   * @returns Options describing the write access.
   */
  sqlWrite: (resourceTypes: ResourceTypeInput, options?: { source?: string }): ExecuteSqlOptions => {
    return {
      mode: DatabaseMode.WRITER,
      operation: 'write',
      resourceTypes,
      source: options?.source,
    };
  },

  /**
   * Use when acquiring a READER client only to issue session/transaction configuration — e.g.
   * `SET statement_timeout = 2000` — rather than to read resource data. No resources should be read.
   * @param resourceTypes - The resource type(s) whose queries the statement configures.
   * @param options - Optional overrides.
   * @param options.source - Short label identifying the call site.
   * @returns Options describing the reader configuration access.
   */
  sqlReadConfig: (resourceTypes: ResourceTypeInput, options?: { source?: string }): ExecuteSqlOptions => {
    return {
      mode: DatabaseMode.READER,
      operation: 'configuration',
      resourceTypes,
      source: options?.source,
    };
  },

  /**
   * Use when acquiring the WRITER client only to issue configuration statements — e.g.
   * `set_config('statement_timeout', ..., true)` inside a transaction — rather than to read or
   * write resource data. Like {@link repoAccess.sqlReadConfig} but on the writer (the connection a
   * transaction is pinned to).
   * @param resourceTypes - The resource type(s) whose queries the statement configures.
   * @param options - Optional overrides.
   * @param options.source - Short label identifying the call site.
   * @returns Options describing the writer configuration access.
   */
  sqlWriteConfig: (resourceTypes: ResourceTypeInput, options?: { source?: string }): ExecuteSqlOptions => {
    return {
      mode: DatabaseMode.WRITER,
      operation: 'configuration',
      resourceTypes,
      source: options?.source,
    };
  },
};
