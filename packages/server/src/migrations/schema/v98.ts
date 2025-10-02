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
    "id" BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL,
    "conceptMap" UUID NOT NULL,
    "sourceSystem" BIGINT NOT NULL,
    "sourceCode" TEXT NOT NULL,
    "targetSystem" BIGINT NOT NULL,
    "targetCode" TEXT NOT NULL,
    "relationship" TEXT,
    "sourceDisplay" TEXT,
    "targetDisplay" TEXT,
    "comment" TEXT,
    PRIMARY KEY("id", "conceptMap") -- partition key must be part of PK
  ) PARTITION BY HASH ("conceptMap")`);
  /*
   * We partition the ConceptMapping table by hashing the conceptMap column.
   * This is a good choice because it is a good hash function for UUIDv4s.
   */
  await fns.query(client, results, `
    CREATE TABLE IF NOT EXISTS "ConceptMapping_00" PARTITION OF "ConceptMapping" FOR VALUES WITH (MODULUS 16, REMAINDER 0);
    CREATE TABLE IF NOT EXISTS "ConceptMapping_01" PARTITION OF "ConceptMapping" FOR VALUES WITH (MODULUS 16, REMAINDER 1);
    CREATE TABLE IF NOT EXISTS "ConceptMapping_02" PARTITION OF "ConceptMapping" FOR VALUES WITH (MODULUS 16, REMAINDER 2);
    CREATE TABLE IF NOT EXISTS "ConceptMapping_03" PARTITION OF "ConceptMapping" FOR VALUES WITH (MODULUS 16, REMAINDER 3);
    CREATE TABLE IF NOT EXISTS "ConceptMapping_04" PARTITION OF "ConceptMapping" FOR VALUES WITH (MODULUS 16, REMAINDER 4);
    CREATE TABLE IF NOT EXISTS "ConceptMapping_05" PARTITION OF "ConceptMapping" FOR VALUES WITH (MODULUS 16, REMAINDER 5);
    CREATE TABLE IF NOT EXISTS "ConceptMapping_06" PARTITION OF "ConceptMapping" FOR VALUES WITH (MODULUS 16, REMAINDER 6);
    CREATE TABLE IF NOT EXISTS "ConceptMapping_07" PARTITION OF "ConceptMapping" FOR VALUES WITH (MODULUS 16, REMAINDER 7);
    CREATE TABLE IF NOT EXISTS "ConceptMapping_08" PARTITION OF "ConceptMapping" FOR VALUES WITH (MODULUS 16, REMAINDER 8);
    CREATE TABLE IF NOT EXISTS "ConceptMapping_09" PARTITION OF "ConceptMapping" FOR VALUES WITH (MODULUS 16, REMAINDER 9);
    CREATE TABLE IF NOT EXISTS "ConceptMapping_10" PARTITION OF "ConceptMapping" FOR VALUES WITH (MODULUS 16, REMAINDER 10);
    CREATE TABLE IF NOT EXISTS "ConceptMapping_11" PARTITION OF "ConceptMapping" FOR VALUES WITH (MODULUS 16, REMAINDER 11);
    CREATE TABLE IF NOT EXISTS "ConceptMapping_12" PARTITION OF "ConceptMapping" FOR VALUES WITH (MODULUS 16, REMAINDER 12);
    CREATE TABLE IF NOT EXISTS "ConceptMapping_13" PARTITION OF "ConceptMapping" FOR VALUES WITH (MODULUS 16, REMAINDER 13);
    CREATE TABLE IF NOT EXISTS "ConceptMapping_14" PARTITION OF "ConceptMapping" FOR VALUES WITH (MODULUS 16, REMAINDER 14);
    CREATE TABLE IF NOT EXISTS "ConceptMapping_15" PARTITION OF "ConceptMapping" FOR VALUES WITH (MODULUS 16, REMAINDER 15);
    `);
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
