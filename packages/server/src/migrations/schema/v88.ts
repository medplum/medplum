/*
 * This is a generated file
 * Do not edit manually.
 */

import { PoolClient } from 'pg';

// prettier-ignore
export async function run(client: PoolClient): Promise<void> {
  await client.query('ALTER TABLE IF EXISTS "Group" ADD COLUMN IF NOT EXISTS "characteristicReference" TEXT[]');
}
