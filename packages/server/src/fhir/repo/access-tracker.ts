// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { isResourceType } from '@medplum/core';
import type { Reference, ResourceType } from '@medplum/fhirtypes';
import type { Pool, PoolClient } from 'pg';
import type { DatabaseMode } from '../../database';
import { getLogger } from '../../logger';

export type RepositoryAccessLayer = 'sql' | 'cache';
export type RepositoryAccessOperation = 'read' | 'write';
export type TransactionAccessStatus = 'committed' | 'rolled_back';

export type TransactionAccessFrame = {
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

export type RepositoryAccessTracker = {
  transactionFrames: TransactionAccessFrame[];
};

export interface ExecuteSqlOptions {
  readonly client?: Pool | PoolClient;
  readonly mode: DatabaseMode;
  readonly operation: RepositoryAccessOperation;
  readonly resourceTypes: Iterable<ResourceType>;
  readonly source: string;
}

const splitTrackedResourceTypes = new Set<ResourceType>(['Project', 'ProjectMembership', 'User']);

export function createTransactionAccessFrame(): TransactionAccessFrame {
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

export function createRepositoryAccessTracker(): RepositoryAccessTracker {
  return {
    transactionFrames: [],
  };
}

export function getCurrentTransactionFrame(
  accessTracker: RepositoryAccessTracker
): TransactionAccessFrame | undefined {
  return accessTracker.transactionFrames[accessTracker.transactionFrames.length - 1];
}

export function hasTrackedTransaction(accessTracker: RepositoryAccessTracker): boolean {
  return accessTracker.transactionFrames.length > 0;
}

export function partitionResourceTypes(resourceTypes: Iterable<ResourceType>): {
  all: ResourceType[];
  special: ResourceType[];
  other: ResourceType[];
} {
  const all = new Set<ResourceType>();
  const special = new Set<ResourceType>();
  const other = new Set<ResourceType>();

  for (const resourceType of resourceTypes) {
    if (!resourceType) {
      continue;
    }
    all.add(resourceType);
    if (splitTrackedResourceTypes.has(resourceType)) {
      special.add(resourceType);
    } else {
      other.add(resourceType);
    }
  }

  return {
    all: [...all].sort(),
    special: [...special].sort(),
    other: [...other].sort(),
  };
}

export function mergeTransactionAccessFrame(target: TransactionAccessFrame, source: TransactionAccessFrame): void {
  target.sqlReadCount += source.sqlReadCount;
  target.sqlWriteCount += source.sqlWriteCount;
  target.cacheReadCount += source.cacheReadCount;
  target.cacheWriteCount += source.cacheWriteCount;

  for (const resourceType of source.readResourceTypes) {
    target.readResourceTypes.add(resourceType);
  }
  for (const resourceType of source.writeResourceTypes) {
    target.writeResourceTypes.add(resourceType);
  }
  for (const resourceType of source.specialResourceTypes) {
    target.specialResourceTypes.add(resourceType);
  }
  for (const resourceType of source.otherResourceTypes) {
    target.otherResourceTypes.add(resourceType);
  }
  for (const sourceName of source.sources) {
    target.sources.add(sourceName);
  }
}

export function getLocalReferenceResourceTypes(references: Reference[]): ResourceType[] {
  const resourceTypes = new Set<ResourceType>();
  for (const reference of references) {
    const resourceType = reference.reference?.split('/')[0];
    if (resourceType && isResourceType(resourceType)) {
      resourceTypes.add(resourceType);
    }
  }
  return [...resourceTypes].sort();
}

export function recordTrackedResourceAccess(
  accessTracker: RepositoryAccessTracker,
  layer: RepositoryAccessLayer,
  operation: RepositoryAccessOperation,
  resourceTypes: Iterable<ResourceType>,
  source: string
): void {
  const access = partitionResourceTypes(resourceTypes);
  if (access.all.length === 0) {
    return;
  }

  if (access.special.length > 0 && access.other.length > 0) {
    getLogger().info('[RepoSplit] Mixed resource access', {
      scope: 'statement',
      layer,
      operation,
      source,
      inTransaction: hasTrackedTransaction(accessTracker),
      specialResourceTypes: access.special,
      otherResourceTypes: access.other,
      resourceTypes: access.all,
    });
  }

  const frame = getCurrentTransactionFrame(accessTracker);
  if (!frame) {
    return;
  }

  if (layer === 'sql') {
    if (operation === 'read') {
      frame.sqlReadCount++;
    } else {
      frame.sqlWriteCount++;
    }
  } else if (operation === 'read') {
    frame.cacheReadCount++;
  } else {
    frame.cacheWriteCount++;
  }

  const resourceTypeSet = operation === 'read' ? frame.readResourceTypes : frame.writeResourceTypes;
  for (const resourceType of access.all) {
    resourceTypeSet.add(resourceType);
  }
  for (const resourceType of access.special) {
    frame.specialResourceTypes.add(resourceType);
  }
  for (const resourceType of access.other) {
    frame.otherResourceTypes.add(resourceType);
  }
  frame.sources.add(source);
}

export function logTrackedTransactionAccess(frame: TransactionAccessFrame, status: TransactionAccessStatus): void {
  if (!frame.specialResourceTypes.size || !frame.otherResourceTypes.size) {
    return;
  }

  getLogger().info('[RepoSplit] Mixed transaction access', {
    scope: 'transaction',
    status,
    specialResourceTypes: [...frame.specialResourceTypes].sort(),
    otherResourceTypes: [...frame.otherResourceTypes].sort(),
    readResourceTypes: [...frame.readResourceTypes].sort(),
    writeResourceTypes: [...frame.writeResourceTypes].sort(),
    sqlReadCount: frame.sqlReadCount,
    sqlWriteCount: frame.sqlWriteCount,
    cacheReadCount: frame.cacheReadCount,
    cacheWriteCount: frame.cacheWriteCount,
    sources: [...frame.sources].sort(),
  });
}
