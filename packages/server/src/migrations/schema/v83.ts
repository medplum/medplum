// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/*
 * This is a generated file
 * Do not edit manually.
 */

import { PoolClient } from 'pg';

export async function run(client: PoolClient): Promise<void> {
  await client.query('ALTER TABLE IF EXISTS "AsyncJob" ADD COLUMN IF NOT EXISTS "type" TEXT');
  await client.query('ALTER TABLE IF EXISTS "AsyncJob" ADD COLUMN IF NOT EXISTS "status" TEXT');
  await client.query('CREATE INDEX CONCURRENTLY IF NOT EXISTS "AsyncJob_type_idx" ON "AsyncJob" ("type")');
  await client.query('CREATE INDEX CONCURRENTLY IF NOT EXISTS "AsyncJob_status_idx" ON "AsyncJob" ("status")');
}
