// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { TransactionOptions } from '@medplum/fhir-router';
import type { ResourceType } from '@medplum/fhirtypes';
import { DatabaseMode } from '../../database';

export type RepositoryAccessOperation = 'read' | 'write' | 'transaction' | 'configuration';

export type NormalizedResourceTypes = ReadonlySet<ResourceType>;
export type ResourceTypeInput = ResourceType | readonly ResourceType[] | NormalizedResourceTypes;

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

export function normalizeResourceTypes(input: ResourceTypeInput): NormalizedResourceTypes {
  return typeof input === 'string' ? new Set([input]) : new Set(input);
}

/**
 * Factory helpers for the {@link ExecuteSqlOptions} passed to `Repository.getDatabaseClient` /
 * `Repository.executeSql`. Each helper records the resource types and intent of an access so the
 * operation is routed to the correct database shard.
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
   * @param options - Optional overrides.
   * @param options.resourceTypes - Resource type(s) used only to route the configuration statement
   * to the same shard as the query it configures.
   * @param options.source - Short label identifying the call site.
   * @returns Options describing the reader configuration access.
   */
  sqlReadConfig: (options?: { resourceTypes?: ResourceTypeInput; source?: string }): ExecuteSqlOptions => {
    return {
      mode: DatabaseMode.READER,
      operation: 'configuration',
      resourceTypes: options?.resourceTypes ?? new Set(),
      source: options?.source,
    };
  },

  /**
   * Use when acquiring the WRITER client only to issue configuration statements — e.g.
   * `set_config('statement_timeout', ..., true)` inside a transaction — rather than to read or
   * write resource data. Like {@link repoAccess.sqlReadConfig} but on the writer (the connection a
   * transaction is pinned to).
   * @param options - Optional overrides.
   * @param options.resourceTypes - Resource type(s) used only to route the configuration statement
   * to the same shard as the query it configures.
   * @param options.source - Short label identifying the call site.
   * @returns Options describing the writer configuration access.
   */
  sqlWriteConfig: (options?: { resourceTypes?: ResourceTypeInput; source?: string }): ExecuteSqlOptions => {
    return {
      mode: DatabaseMode.WRITER,
      operation: 'configuration',
      resourceTypes: options?.resourceTypes ?? new Set(),
      source: options?.source,
    };
  },
};
