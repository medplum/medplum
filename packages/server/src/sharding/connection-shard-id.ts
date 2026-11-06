// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { PgQueryable } from '../fhir/sql';

// Weak keys: an entry is dropped when its pool or client is garbage collected, so discarded clients need no cleanup.
const connectionShardIds = new WeakMap<PgQueryable, string>();

export function setConnectionShardId(conn: PgQueryable, shardId: string): void {
  connectionShardIds.set(conn, shardId);
}

/**
 * @param conn - A database pool or a client checked out from one.
 * @returns The shard the connection belongs to, or undefined if it did not come from a shard pool.
 */
export function getConnectionShardId(conn: PgQueryable): string | undefined {
  return connectionShardIds.get(conn);
}
