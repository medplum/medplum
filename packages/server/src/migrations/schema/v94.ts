/*
 * This is a generated file
 * Do not edit manually.
 */

import { PoolClient } from 'pg';
import * as fns from '../migrate-functions';

// prettier-ignore
export async function run(client: PoolClient): Promise<void> {
  const results: { name: string; durationMs: number }[] = []
  await fns.query(client, results, `ALTER TABLE IF EXISTS "Binary" ALTER COLUMN "compartments" DROP NOT NULL`);
}
