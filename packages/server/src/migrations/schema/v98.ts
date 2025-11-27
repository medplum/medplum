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
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "ConceptMapping" (
    "id" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "conceptMap" UUID NOT NULL,
    "sourceSystem" BIGINT NOT NULL,
    "sourceCode" TEXT NOT NULL,
    "targetSystem" BIGINT NOT NULL,
    "targetCode" TEXT NOT NULL,
    "relationship" TEXT,
    "sourceDisplay" TEXT,
    "targetDisplay" TEXT,
    "comment" TEXT
  )`);
  await fns.query(client, results, `CREATE UNIQUE INDEX IF NOT EXISTS "ConceptMapping_map_source_target_idx" ON "ConceptMapping" ("conceptMap", "sourceSystem", "sourceCode", "targetSystem", "targetCode")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "ConceptMapping_map_reverse_idx" ON "ConceptMapping" ("conceptMap", "targetSystem", "targetCode", "sourceSystem")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "CodingSystem" (
    "id" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "system" TEXT NOT NULL
  )`);
  await fns.query(client, results, `CREATE UNIQUE INDEX IF NOT EXISTS "CodingSystem_system_idx" ON "CodingSystem" ("system") INCLUDE ("id")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "ConceptMapping_Attribute" (
    "mapping" BIGINT NOT NULL,
    "uri" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    PRIMARY KEY (mapping, uri, type, value, kind)
  )`);
}
