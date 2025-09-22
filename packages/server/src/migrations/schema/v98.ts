// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
/*
 * This is a generated file
 * Do not edit manually.
 */

import { PoolClient } from 'pg';
import * as fns from '../migrate-functions';

// prettier-ignore
export async function run(client: PoolClient): Promise<void> {
  const results: { name: string; durationMs: number }[] = []
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "ConceptMapping" (
    "id" BIGINT,
    "conceptMap" UUID,
    "sourceSystem" TEXT,
    "sourceCode" TEXT,
    "targetSystem" TEXT,
    "targetCode" TEXT,
    "relationship" TEXT,
    "sourceDisplay" TEXT,
    "targetDisplay" TEXT,
    "comment" TEXT
  )`);
  await fns.query(client, results, `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "ConceptMapping_map_source_target_idx" ON "ConceptMapping" ("conceptMap", "sourceSystem", "sourceCode", "targetSystem", "targetCode")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "ConceptMapping_Attribute" (
    "mapping" BIGINT,
    "uri" TEXT,
    "type" TEXT,
    "value" TEXT,
    "kind" TEXT
  )`);
  await fns.query(client, results, `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "ConceptMapping_Attribute_pkey_idx" ON "ConceptMapping_Attribute" ("mapping", "uri", "type", "value", "kind")`);
}
