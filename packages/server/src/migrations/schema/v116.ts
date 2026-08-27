// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/*
 * Hand-written migration: the schema builder does not model extended statistics,
 * so this cannot be regenerated from the schema definition in migrate.ts.
 */

import type { PoolClient } from 'pg';
import * as fns from '../migrate-functions';

export async function run(client: PoolClient): Promise<void> {
  const results: { name: string; durationMs: number }[] = [];

  // "property" and "value" are strongly correlated: a given value is only ever used by a handful of properties,
  // so estimating the two clauses independently understates the row count of a `property = X AND value = Y`
  // lookup by orders of magnitude (30x-2000x on the representative dataset)
  await fns.query(
    client,
    results,
    `CREATE STATISTICS IF NOT EXISTS "Coding_Property_property_value_stat" ON "property", "value" FROM "Coding_Property"`
  );

  // The default target of 100 has ~30% error; increasing to 1000 captures ~450 MCV pairs for ~5% error, at the cost of a slower ANALYZE
  await fns.query(client, results, `ALTER STATISTICS "Coding_Property_property_value_stat" SET STATISTICS 1000`);
  await fns.analyzeTable(client, results, 'Coding_Property');
}
