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
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "EncryptedSecret" (
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
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "code" TEXT,
  "owner" TEXT,
  "status" TEXT,
  "__expires" TSTZRANGE,
  "__expiresSort" TIMESTAMPTZ,
  "expires" TIMESTAMPTZ,
  "___compartmentIdentifierSort" TEXT,
  "__ownerIdentifierSort" TEXT
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "EncryptedSecret_lastUpdated_idx" ON "EncryptedSecret" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "EncryptedSecret_projectId_lastUpdated_idx" ON "EncryptedSecret" ("projectId", "lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "EncryptedSecret_projectId_idx" ON "EncryptedSecret" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "EncryptedSecret__source_idx" ON "EncryptedSecret" ("_source")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "EncryptedSecret__profile_idx" ON "EncryptedSecret" USING gin ("_profile")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "EncryptedSecret___version_idx" ON "EncryptedSecret" ("__version")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "EncryptedSecret_reindex_idx" ON "EncryptedSecret" ("lastUpdated", "__version") WHERE (deleted = false)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "EncryptedSecret_compartments_idx" ON "EncryptedSecret" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "EncryptedSecret___sharedTokens_idx" ON "EncryptedSecret" USING gin ("__sharedTokens")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "EncryptedSecret___sharedTokensTextTrgm_idx" ON "EncryptedSecret" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "EncryptedSecret____tag_idx" ON "EncryptedSecret" USING gin ("___tag")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "EncryptedSecret____tagTextTrgm_idx" ON "EncryptedSecret" USING gin (token_array_to_text("___tagText") gin_trgm_ops)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "EncryptedSecret___idnt_idx" ON "EncryptedSecret" USING gin ("__identifier")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "EncryptedSecret___idntTextTrgm_idx" ON "EncryptedSecret" USING gin (token_array_to_text("__identifierText") gin_trgm_ops)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "EncryptedSecret_code_idx" ON "EncryptedSecret" ("code")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "EncryptedSecret_owner_idx" ON "EncryptedSecret" ("owner")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "EncryptedSecret_status_idx" ON "EncryptedSecret" ("status")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "EncryptedSecret_expires_idx" ON "EncryptedSecret" ("expires")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "EncryptedSecret___expires_sorted_idx" ON "EncryptedSecret" USING gist ("__expires", "__expiresSort")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "EncryptedSecret_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "EncryptedSecret_History_id_idx" ON "EncryptedSecret_History" ("id")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "EncryptedSecret_History_lastUpdated_idx" ON "EncryptedSecret_History" ("lastUpdated")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "EncryptedSecret_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL,
  PRIMARY KEY ("resourceId", "targetId", code)
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "EncryptedSecret_Refs_targetId_code_idx" ON "EncryptedSecret_References" ("targetId", "code") INCLUDE ("resourceId")`);
}
