// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { isResourceType } from '@medplum/core';
import type { TransactionOptions } from '@medplum/fhir-router';
import type { Reference, ResourceType } from '@medplum/fhirtypes';
import type { DatabaseMode } from '../../database';
import { getLogger } from '../../logger';

export type RepositoryAccessLayer = 'sql' | 'cache';
export type RepositoryAccessOperation = 'read' | 'write' | 'transaction' | 'configuration';

export interface RepositoryAccessOptions {
  readonly resourceTypes: Iterable<ResourceType>;
  readonly source: string;
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

export function createRepositoryAccessTracker(): RepositoryAccessTracker {
  return new RepositoryAccessTracker();
}

export class RepositoryAccessTracker {
  readonly transactionFrames: TransactionAccessFrame[] = [];

  getCurrentTransactionFrame(): TransactionAccessFrame | undefined {
    return this.transactionFrames[this.transactionFrames.length - 1];
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

  clearTransactionFrames(): void {
    this.transactionFrames.length = 0;
  }

  logTransactionAccess(frame: TransactionAccessFrame, status: 'committed' | 'rolled_back'): void {
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

  recordResourceAccess(
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
        inTransaction: this.hasTrackedTransaction(),
        specialResourceTypes: access.special,
        otherResourceTypes: access.other,
        resourceTypes: access.all,
      });
    }

    const frame = this.getCurrentTransactionFrame();
    if (!frame) {
      return;
    }

    if (layer === 'sql') {
      if (operation === 'read') {
        frame.sqlReadCount++;
      } else if (operation === 'write') {
        frame.sqlWriteCount++;
      }
    } else if (operation === 'read') {
      frame.cacheReadCount++;
    } else {
      frame.cacheWriteCount++;
    }

    if (operation === 'read') {
      for (const resourceType of access.all) {
        frame.readResourceTypes.add(resourceType);
      }
    } else if (operation === 'write') {
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

function partitionResourceTypes(resourceTypes: Iterable<ResourceType>): {
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

function mergeTransactionAccessFrame(target: TransactionAccessFrame, source: TransactionAccessFrame): void {
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
