// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { isResourceType } from '@medplum/core';
import { getLogger } from '../logger';
import { GlobalOnlyResourceTypes, GlobalResourceTypes } from './sharding';

/**
 * Classification of a SQL table relative to the proposed global/non-global database split.
 *
 * - `global`: the table lives on (or would live on) the global shard
 * - `non-global`: the table lives on a per-project shard
 * - `unknown`: the name isn't a recognizable resource/lookup/history table (aliases like
 *   `combined`, join aliases like `T1`, migration bookkeeping tables, etc.) — not a signal
 */
export type TableSide = 'global' | 'non-global' | 'unknown';

/**
 * Classifies a table name by the side of the proposed split it lives on.
 *
 * Main resource tables (`Patient`, `User`) classify directly. Related tables
 * (`Patient_History`, `Patient_Token`, `Patient_References`, `Patient_HumanName`, etc.)
 * classify as their parent resource type, since they always live on the same shard.
 * Anything else classifies as `unknown`.
 * @param name - The table name (as it appears in SQL, without quoting).
 * @returns The side of the divide, or `unknown` if not a recognized table.
 */
export function classifyTable(name: string): TableSide {
  if (isResourceType(name)) {
    return isGlobalResourceType(name) ? 'global' : 'non-global';
  }
  const underscoreIdx = name.indexOf('_');
  if (underscoreIdx > 0) {
    const prefix = name.slice(0, underscoreIdx);
    if (isResourceType(prefix)) {
      return isGlobalResourceType(prefix) ? 'global' : 'non-global';
    }
  }
  return 'unknown';
}

function isGlobalResourceType(type: string): boolean {
  return GlobalResourceTypes.has(type) || GlobalOnlyResourceTypes.has(type);
}

/**
 * Tracks the set of tables touched within a scope (one SQL statement or one transaction)
 * and logs the first time both sides of the proposed global/non-global database split
 * are observed together.
 *
 * SQL scopes can be created with a parent (typically the active transaction's scope),
 * and table observations forward to the parent so that an inter-SQL cross-divide
 * within a transaction is detected even when no individual SQL crosses on its own.
 */
export class CrossDivideScope {
  readonly tables = new Set<string>();
  private readonly kind: 'sql' | 'transaction';
  private readonly parent?: CrossDivideScope;
  private sawGlobal = false;
  private sawNonGlobal = false;
  private logged = false;

  constructor(kind: 'sql' | 'transaction', parent?: CrossDivideScope) {
    this.kind = kind;
    this.parent = parent;
  }

  addTable(table: string): void {
    if (this.tables.has(table)) {
      this.parent?.addTable(table);
      return;
    }
    this.tables.add(table);

    const side = classifyTable(table);
    if (side === 'global') {
      this.sawGlobal = true;
    } else if (side === 'non-global') {
      this.sawNonGlobal = true;
    }

    if (this.sawGlobal && this.sawNonGlobal && !this.logged) {
      this.logged = true;
      try {
        getLogger().error('Cross-divide access', {
          scope: this.kind,
          tables: Array.from(this.tables).join(','),
          lastTable: table,
        });
      } catch {
        // Never let logging failures affect query execution
      }
    }

    this.parent?.addTable(table);
  }
}
