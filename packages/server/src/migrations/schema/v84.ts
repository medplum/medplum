/*
 * This is a generated file
 * Do not edit manually.
 */

import { PoolClient } from 'pg';

export async function run(client: PoolClient): Promise<void> {
  await client.query('DROP INDEX CONCURRENTLY IF EXISTS "Observation_lastUpdated_compound_idx"');
}
