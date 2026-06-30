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
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "SmartHealthLink" (
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
  "status" TEXT,
  "mode" TEXT,
  "subject" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__subjectIdentifierSort" TEXT
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "SmartHealthLink_lastUpdated_idx" ON "SmartHealthLink" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "SmartHealthLink_projectId_lastUpdated_idx" ON "SmartHealthLink" ("projectId", "lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "SmartHealthLink_projectId_idx" ON "SmartHealthLink" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "SmartHealthLink__source_idx" ON "SmartHealthLink" ("_source")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "SmartHealthLink__profile_idx" ON "SmartHealthLink" USING gin ("_profile")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "SmartHealthLink___version_idx" ON "SmartHealthLink" ("__version")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "SmartHealthLink_reindex_idx" ON "SmartHealthLink" ("lastUpdated", "__version") WHERE (deleted = false)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "SmartHealthLink_compartments_idx" ON "SmartHealthLink" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "SmartHealthLink___sharedTokens_idx" ON "SmartHealthLink" USING gin ("__sharedTokens")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "SmartHealthLink___sharedTokensTextTrgm_idx" ON "SmartHealthLink" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "SmartHealthLink____tag_idx" ON "SmartHealthLink" USING gin ("___tag")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "SmartHealthLink____tagTextTrgm_idx" ON "SmartHealthLink" USING gin (token_array_to_text("___tagText") gin_trgm_ops)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "SmartHealthLink_status_idx" ON "SmartHealthLink" ("status")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "SmartHealthLink_mode_idx" ON "SmartHealthLink" ("mode")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "SmartHealthLink_subject_idx" ON "SmartHealthLink" ("subject")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "SmartHealthLink_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "SmartHealthLink_History_id_idx" ON "SmartHealthLink_History" ("id")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "SmartHealthLink_History_lastUpdated_idx" ON "SmartHealthLink_History" ("lastUpdated")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "SmartHealthLink_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL,
  PRIMARY KEY ("resourceId", "targetId", code)
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "SmartHealthLink_Refs_targetId_code_idx" ON "SmartHealthLink_References" ("targetId", "code") INCLUDE ("resourceId")`);
}
