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
    "id" BIGSERIAL PRIMARY KEY,
    "conceptMap" UUID NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "sourceCode" TEXT NOT NULL,
    "targetSystem" TEXT NOT NULL,
    "targetCode" TEXT NOT NULL,
    "relationship" TEXT,
    "sourceDisplay" TEXT,
    "targetDisplay" TEXT,
    "comment" TEXT
  )`);
  await fns.query(client, results, `CREATE UNIQUE INDEX IF NOT EXISTS "ConceptMapping_map_source_target_idx" ON "ConceptMapping" ("conceptMap", "sourceSystem", "sourceCode", "targetSystem", "targetCode")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "ConceptMapping_Attribute" (
    "mapping" BIGINT NOT NULL,
    "uri" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "kind" TEXT NOT NULL
  )`);
  await fns.query(client, results, `CREATE UNIQUE INDEX IF NOT EXISTS "ConceptMapping_Attribute_pkey_idx" ON "ConceptMapping_Attribute" ("mapping", "uri", "type", "value", "kind")`);
}
