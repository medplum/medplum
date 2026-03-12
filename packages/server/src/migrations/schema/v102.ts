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
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "shard_sync_outbox" (
  "id" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "resourceType" TEXT NOT NULL,
  "resourceId" UUID NOT NULL,
  "resourceVersionId" UUID NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastAttemptAt" TIMESTAMPTZ
)`);
}
