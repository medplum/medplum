// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
/*
 * This is a generated file
 * Do not edit manually.
 */

import type { PoolClient } from 'pg';
import * as fns from '../migrate-functions';

// prettier-ignore
export async function run(client: PoolClient): Promise<void> {
  const results: { name: string; durationMs: number }[] = []
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "shard_sync_outbox_attempts" (
  "id" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "outbox_id" BIGINT NOT NULL,
  "attemptedAt" TIMESTAMPTZ NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "shard_sync_outbox_attempts_outbox_id_idx" ON "shard_sync_outbox_attempts" ("outbox_id")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "shard_sync_outbox_deadletter" (
  "id" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "outbox_id" BIGINT NOT NULL,
  "resourceType" TEXT NOT NULL,
  "resourceId" UUID NOT NULL,
  "resourceVersionId" UUID NOT NULL,
  "movedAt" TIMESTAMPTZ NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "shard_sync_outbox_deadletter_outbox_id_idx" ON "shard_sync_outbox_deadletter" ("outbox_id")`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "shard_sync_outbox" DROP COLUMN IF EXISTS "attempts"`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "shard_sync_outbox" DROP COLUMN IF EXISTS "lastAttemptAt"`);
}
