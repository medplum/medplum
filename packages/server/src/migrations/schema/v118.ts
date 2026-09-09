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
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Enterprise" (
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
  "name" TEXT,
  "status" TEXT,
  "organization" TEXT,
  "__code" UUID[],
  "__codeText" TEXT[],
  "__codeSort" TEXT,
  "project" TEXT[],
  "projectCode" TEXT[],
  "___compartmentIdentifierSort" TEXT,
  "__organizationIdentifierSort" TEXT,
  "__projectIdentifierSort" TEXT
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Enterprise_lastUpdated_idx" ON "Enterprise" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Enterprise_projectId_lastUpdated_idx" ON "Enterprise" ("projectId", "lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Enterprise_projectId_idx" ON "Enterprise" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Enterprise__source_idx" ON "Enterprise" ("_source")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Enterprise__profile_idx" ON "Enterprise" USING gin ("_profile")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Enterprise___version_idx" ON "Enterprise" ("__version")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Enterprise_reindex_idx" ON "Enterprise" ("lastUpdated", "__version") WHERE (deleted = false)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Enterprise_compartments_idx" ON "Enterprise" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Enterprise___sharedTokens_idx" ON "Enterprise" USING gin ("__sharedTokens")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Enterprise___sharedTokensTextTrgm_idx" ON "Enterprise" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Enterprise____tag_idx" ON "Enterprise" USING gin ("___tag")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Enterprise____tagTextTrgm_idx" ON "Enterprise" USING gin (token_array_to_text("___tagText") gin_trgm_ops)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Enterprise___idnt_idx" ON "Enterprise" USING gin ("__identifier")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Enterprise___idntTextTrgm_idx" ON "Enterprise" USING gin (token_array_to_text("__identifierText") gin_trgm_ops)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Enterprise_name_idx" ON "Enterprise" ("name")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Enterprise_status_idx" ON "Enterprise" ("status")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Enterprise_organization_idx" ON "Enterprise" ("organization")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Enterprise___code_idx" ON "Enterprise" USING gin ("__code")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Enterprise___codeTextTrgm_idx" ON "Enterprise" USING gin (token_array_to_text("__codeText") gin_trgm_ops)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Enterprise_project_idx" ON "Enterprise" USING gin ("project")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Enterprise_projectCode_idx" ON "Enterprise" USING gin ("projectCode")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Enterprise_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Enterprise_History_id_idx" ON "Enterprise_History" ("id")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Enterprise_History_lastUpdated_idx" ON "Enterprise_History" ("lastUpdated")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Enterprise_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL,
  PRIMARY KEY ("resourceId", "targetId", code)
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Enterprise_Refs_targetId_code_idx" ON "Enterprise_References" ("targetId", "code") INCLUDE ("resourceId")`);
}
