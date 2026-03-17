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
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Package" (
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
  "name" TEXT,
  "status" TEXT,
  "__category" UUID[],
  "__categoryText" TEXT[],
  "__categorySort" TEXT,
  "___compartmentIdentifierSort" TEXT
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Package_lastUpdated_idx" ON "Package" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Package_projectId_lastUpdated_idx" ON "Package" ("projectId", "lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Package_projectId_idx" ON "Package" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Package__source_idx" ON "Package" ("_source")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Package__profile_idx" ON "Package" USING gin ("_profile")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Package___version_idx" ON "Package" ("__version")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Package_reindex_idx" ON "Package" ("lastUpdated", "__version") WHERE (deleted = false)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Package_compartments_idx" ON "Package" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Package___sharedTokens_idx" ON "Package" USING gin ("__sharedTokens")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Package___sharedTokensTextTrgm_idx" ON "Package" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Package____tag_idx" ON "Package" USING gin ("___tag")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Package____tagTextTrgm_idx" ON "Package" USING gin (token_array_to_text("___tagText") gin_trgm_ops)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Package_name_idx" ON "Package" ("name")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Package_status_idx" ON "Package" ("status")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Package___category_idx" ON "Package" USING gin ("__category")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Package___categoryTextTrgm_idx" ON "Package" USING gin (token_array_to_text("__categoryText") gin_trgm_ops)`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Package_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Package_History_id_idx" ON "Package_History" ("id")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Package_History_lastUpdated_idx" ON "Package_History" ("lastUpdated")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "Package_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL,
  PRIMARY KEY ("resourceId", "targetId", code)
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "Package_Refs_targetId_code_idx" ON "Package_References" ("targetId", "code") INCLUDE ("resourceId")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "PackageRelease" (
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
  "package" TEXT,
  "version" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__packageIdentifierSort" TEXT
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "PackageRelease_lastUpdated_idx" ON "PackageRelease" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "PackageRelease_projectId_lastUpdated_idx" ON "PackageRelease" ("projectId", "lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "PackageRelease_projectId_idx" ON "PackageRelease" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "PackageRelease__source_idx" ON "PackageRelease" ("_source")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "PackageRelease__profile_idx" ON "PackageRelease" USING gin ("_profile")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "PackageRelease___version_idx" ON "PackageRelease" ("__version")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "PackageRelease_reindex_idx" ON "PackageRelease" ("lastUpdated", "__version") WHERE (deleted = false)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "PackageRelease_compartments_idx" ON "PackageRelease" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "PackageRelease___sharedTokens_idx" ON "PackageRelease" USING gin ("__sharedTokens")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "PackageRelease___sharedTokensTextTrgm_idx" ON "PackageRelease" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "PackageRelease____tag_idx" ON "PackageRelease" USING gin ("___tag")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "PackageRelease____tagTextTrgm_idx" ON "PackageRelease" USING gin (token_array_to_text("___tagText") gin_trgm_ops)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "PackageRelease_package_idx" ON "PackageRelease" ("package")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "PackageRelease_version_idx" ON "PackageRelease" ("version")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "PackageRelease_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "PackageRelease_History_id_idx" ON "PackageRelease_History" ("id")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "PackageRelease_History_lastUpdated_idx" ON "PackageRelease_History" ("lastUpdated")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "PackageRelease_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL,
  PRIMARY KEY ("resourceId", "targetId", code)
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "PackageRelease_Refs_targetId_code_idx" ON "PackageRelease_References" ("targetId", "code") INCLUDE ("resourceId")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "PackageInstallation" (
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
  "package" TEXT,
  "status" TEXT,
  "version" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__packageIdentifierSort" TEXT
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "PackageInstallation_lastUpdated_idx" ON "PackageInstallation" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "PackageInstallation_projectId_lastUpdated_idx" ON "PackageInstallation" ("projectId", "lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "PackageInstallation_projectId_idx" ON "PackageInstallation" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "PackageInstallation__source_idx" ON "PackageInstallation" ("_source")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "PackageInstallation__profile_idx" ON "PackageInstallation" USING gin ("_profile")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "PackageInstallation___version_idx" ON "PackageInstallation" ("__version")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "PackageInstallation_reindex_idx" ON "PackageInstallation" ("lastUpdated", "__version") WHERE (deleted = false)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "PackageInstallation_compartments_idx" ON "PackageInstallation" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "PackageInstallation___sharedTokens_idx" ON "PackageInstallation" USING gin ("__sharedTokens")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "PackageInstallation___sharedTokensTextTrgm_idx" ON "PackageInstallation" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "PackageInstallation____tag_idx" ON "PackageInstallation" USING gin ("___tag")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "PackageInstallation____tagTextTrgm_idx" ON "PackageInstallation" USING gin (token_array_to_text("___tagText") gin_trgm_ops)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "PackageInstallation_package_idx" ON "PackageInstallation" ("package")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "PackageInstallation_status_idx" ON "PackageInstallation" ("status")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "PackageInstallation_version_idx" ON "PackageInstallation" ("version")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "PackageInstallation_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "PackageInstallation_History_id_idx" ON "PackageInstallation_History" ("id")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "PackageInstallation_History_lastUpdated_idx" ON "PackageInstallation_History" ("lastUpdated")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "PackageInstallation_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL,
  PRIMARY KEY ("resourceId", "targetId", code)
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "PackageInstallation_Refs_targetId_code_idx" ON "PackageInstallation_References" ("targetId", "code") INCLUDE ("resourceId")`);
}
