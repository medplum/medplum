// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { TransactionOptions } from '@medplum/fhir-router';
import type { ResourceType } from '@medplum/fhirtypes';
import type { DatabaseMode } from '../../database';
import { getLogger } from '../../logger';

export type RepositoryAccessLayer = 'sql' | 'cache';
export type RepositoryAccessOperation = 'read' | 'write' | 'transaction' | 'configuration';

export type ResourceTypeInput = ResourceType | readonly ResourceType[] | ReadonlySet<ResourceType>;

export interface RepositoryAccessOptions {
  readonly resourceTypes: ResourceTypeInput;
  readonly source?: string;
}

export interface ExecuteSqlOptions extends RepositoryAccessOptions {
  readonly operation: RepositoryAccessOperation;
  readonly mode: DatabaseMode;
}

export interface TransactionSqlOptions extends RepositoryAccessOptions, TransactionOptions {}

type TransactionAccessFrame = {
  sqlReadCount: number;
  sqlWriteCount: number;
  cacheReadCount: number;
  cacheWriteCount: number;
  readResourceTypes: Set<ResourceType>;
  writeResourceTypes: Set<ResourceType>;
  specialResourceTypes: Set<ResourceType>;
  otherResourceTypes: Set<ResourceType>;
  sources: Set<string>;
};

const splitTrackedResourceTypes = new Set<ResourceType>(['Project', 'ProjectMembership', 'User']);

export class RepositoryAccessTracker {
  readonly transactionFrames: TransactionAccessFrame[] = [];

  getCurrentTransactionFrame(): TransactionAccessFrame | undefined {
    return this.transactionFrames.at(-1);
  }

  private hasTrackedTransaction(): boolean {
    return this.transactionFrames.length > 0;
  }

  pushTransactionFrame(): void {
    this.transactionFrames.push(createTransactionAccessFrame());
  }

  popTransactionFrame(): TransactionAccessFrame {
    const frame = this.transactionFrames.pop();
    if (!frame) {
      throw new Error('No transaction frame');
    }
    return frame;
  }

  mergeLastTransactionFrame(): void {
    const popped = this.popTransactionFrame();
    const current = this.getCurrentTransactionFrame();
    if (!current) {
      throw new Error('No current transaction frame');
    }
    mergeTransactionAccessFrame(current, popped);
  }

  /**
   * Folds every live transaction frame into a single aggregate frame, empties the stack, and
   * returns the aggregate (or undefined if no frames were live). Used on abnormal termination —
   * e.g. when ROLLBACK itself fails and the whole transaction is torn down at once — where the
   * normal per-level commit/rollback bookkeeping cannot run. Inner savepoint frames may still be
   * unmerged at that point (a failed `ROLLBACK TO SAVEPOINT` skips {@link mergeLastTransactionFrame}),
   * so they are folded in here to give the caller the full picture for a final log.
   * @returns The aggregate of all live frames, or undefined if the stack was empty.
   */
  collapseTransactionFrames(): TransactionAccessFrame | undefined {
    while (this.transactionFrames.length > 1) {
      this.mergeLastTransactionFrame();
    }
    return this.transactionFrames.pop();
  }

  logTransactionAccess(frame: TransactionAccessFrame, status: 'committed' | 'rolled_back'): void {
    if (!frame.specialResourceTypes.size || !frame.otherResourceTypes.size) {
      return;
    }

    getLogger().info('[RepoSplit] Mixed transaction access', {
      scope: 'transaction',
      status,
      specialResourceTypes: Array.from(frame.specialResourceTypes),
      otherResourceTypes: Array.from(frame.otherResourceTypes),
      readResourceTypes: Array.from(frame.readResourceTypes),
      writeResourceTypes: Array.from(frame.writeResourceTypes),
      sqlReadCount: frame.sqlReadCount,
      sqlWriteCount: frame.sqlWriteCount,
      cacheReadCount: frame.cacheReadCount,
      cacheWriteCount: frame.cacheWriteCount,
      sources: Array.from(frame.sources),
    });
  }

  recordResourceAccess(
    layer: RepositoryAccessLayer,
    operation: RepositoryAccessOperation,
    resourceTypes: ResourceTypeInput,
    source: string | undefined
  ): void {
    const access = partitionResourceTypes(resourceTypes);
    if (access.all.size === 0) {
      return;
    }

    if (access.special.size > 0 && access.other.size > 0) {
      getLogger().info('[RepoSplit] Mixed resource access', {
        scope: 'statement',
        layer,
        operation,
        source,
        inTransaction: this.hasTrackedTransaction(),
        specialResourceTypes: Array.from(access.special),
        otherResourceTypes: Array.from(access.other),
        resourceTypes: Array.from(access.all),
      });
    }

    const frame = this.getCurrentTransactionFrame();
    if (frame) {
      updateTransactionAccessFrame(frame, layer, operation, source, access);
    }
  }
}

function updateTransactionAccessFrame(
  frame: TransactionAccessFrame,
  layer: RepositoryAccessLayer,
  operation: RepositoryAccessOperation,
  source: string | undefined,
  access: ResourceTypePartition
): void {
  if (operation === 'read') {
    if (layer === 'sql') {
      frame.sqlReadCount++;
    } else {
      frame.cacheReadCount++;
    }
    for (const resourceType of access.all) {
      frame.readResourceTypes.add(resourceType);
    }
  } else if (operation === 'write') {
    if (layer === 'sql') {
      frame.sqlWriteCount++;
    } else {
      frame.cacheWriteCount++;
    }
    for (const resourceType of access.all) {
      frame.writeResourceTypes.add(resourceType);
    }
  }
  for (const resourceType of access.special) {
    frame.specialResourceTypes.add(resourceType);
  }
  for (const resourceType of access.other) {
    frame.otherResourceTypes.add(resourceType);
  }
  if (source) {
    frame.sources.add(source);
  }
}

function createTransactionAccessFrame(): TransactionAccessFrame {
  return {
    sqlReadCount: 0,
    sqlWriteCount: 0,
    cacheReadCount: 0,
    cacheWriteCount: 0,
    readResourceTypes: new Set<ResourceType>(),
    writeResourceTypes: new Set<ResourceType>(),
    specialResourceTypes: new Set<ResourceType>(),
    otherResourceTypes: new Set<ResourceType>(),
    sources: new Set<string>(),
  };
}

type ResourceTypePartition = {
  readonly all: Set<ResourceType>;
  readonly special: Set<ResourceType>;
  readonly other: Set<ResourceType>;
};

function partitionResourceTypes(resourceTypes: ResourceTypeInput): ResourceTypePartition {
  resourceTypes = normalizeResourceTypes(resourceTypes);
  const all = new Set<ResourceType>();
  const special = new Set<ResourceType>();
  const other = new Set<ResourceType>();

  for (const resourceType of resourceTypes) {
    all.add(resourceType);
    if (splitTrackedResourceTypes.has(resourceType)) {
      special.add(resourceType);
    } else {
      other.add(resourceType);
    }
  }

  return { all, special, other };
}

const setsToMerge = ['readResourceTypes', 'writeResourceTypes', 'specialResourceTypes', 'otherResourceTypes'] as const;

function mergeTransactionAccessFrame(target: TransactionAccessFrame, source: TransactionAccessFrame): void {
  target.sqlReadCount += source.sqlReadCount;
  target.sqlWriteCount += source.sqlWriteCount;
  target.cacheReadCount += source.cacheReadCount;
  target.cacheWriteCount += source.cacheWriteCount;

  for (const set of setsToMerge) {
    for (const item of source[set]) {
      target[set].add(item);
    }
  }

  for (const sourceName of source.sources) {
    target.sources.add(sourceName);
  }
}

// export const access = {
//   sqlRead: (
//     resourceTypes: ResourceType | Iterable<ResourceType>,
//     options?: { mode?: DatabaseMode; source?: string }
//   ): ExecuteSqlOptions => {
//     return {
//       mode: options?.mode ?? DatabaseMode.READER,
//       operation: 'read',
//       resourceTypes,
//       source: options?.source ?? 'sqlRead',
//     };
//   },

//   sqlWrite: (
//     resourceTypes: ResourceType | Iterable<ResourceType>,
//     options?: { source?: string }
//   ): ExecuteSqlOptions => {
//     return {
//       mode: DatabaseMode.WRITER,
//       operation: 'write',
//       resourceTypes,
//       source: options?.source ?? 'sqlWrite',
//     };
//   },
// };

function normalizeResourceTypes(input: ResourceTypeInput): ReadonlySet<ResourceType> {
  return typeof input === 'string' ? new Set([input]) : new Set(input);
}
