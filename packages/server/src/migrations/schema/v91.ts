// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/*
 * This is a generated file
 * Do not edit manually.
 */

import { PoolClient } from 'pg';

export async function run(client: PoolClient): Promise<void> {
  await client.query('ALTER TABLE IF EXISTS "Coding" ADD COLUMN IF NOT EXISTS "isSynonym" BOOLEAN');
  await client.query('DROP INDEX CONCURRENTLY "Coding_display_idx"');
  await client.query('ALTER INDEX IF EXISTS "Coding_display_trgm_idx" RENAME TO "Coding_display_idx"');
}
