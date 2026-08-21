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
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Cron" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID NOT NULL,
  "__version" INTEGER NOT NULL,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "onBehalfOf" TEXT,
  "target" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__onBehalfOfIdentifierSort" TEXT,
  "__targetIdentifierSort" TEXT
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Cron_lastUpdated_idx" ON "Cron" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Cron_projectId_lastUpdated_idx" ON "Cron" ("projectId", "lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Cron_projectId_idx" ON "Cron" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Cron__source_idx" ON "Cron" ("_source")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Cron__profile_idx" ON "Cron" USING gin ("_profile")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Cron___version_idx" ON "Cron" ("__version")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Cron_reindex_idx" ON "Cron" ("lastUpdated", "__version") WHERE (deleted = false)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Cron_compartments_idx" ON "Cron" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Cron___sharedTokens_idx" ON "Cron" USING gin ("__sharedTokens")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Cron___sharedTokensTextTrgm_idx" ON "Cron" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Cron____tag_idx" ON "Cron" USING gin ("___tag")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Cron____tagTextTrgm_idx" ON "Cron" USING gin (token_array_to_text("___tagText") gin_trgm_ops)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Cron_onBehalfOf_idx" ON "Cron" ("onBehalfOf")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Cron_target_idx" ON "Cron" ("target")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Cron_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Cron_History_id_idx" ON "Cron_History" ("id")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Cron_History_lastUpdated_idx" ON "Cron_History" ("lastUpdated")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Cron_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL,
  PRIMARY KEY ("resourceId", "targetId", code)
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Cron_Refs_targetId_code_idx" ON "Cron_References" ("targetId", "code") INCLUDE ("resourceId")`);
}
