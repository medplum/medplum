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
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "DicomStudy" (
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
  "studyInstanceUid" TEXT,
  "studyId" TEXT,
  "studyDate" DATE,
  "studyTime" TEXT,
  "accessionNumber" TEXT,
  "modalities" TEXT[],
  "referringPhysiciansName" TEXT,
  "patientName" TEXT,
  "patientId" TEXT,
  "___compartmentIdentifierSort" TEXT
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomStudy_lastUpdated_idx" ON "DicomStudy" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomStudy_projectId_lastUpdated_idx" ON "DicomStudy" ("projectId", "lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomStudy_projectId_idx" ON "DicomStudy" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomStudy__source_idx" ON "DicomStudy" ("_source")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomStudy__profile_idx" ON "DicomStudy" USING gin ("_profile")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomStudy___version_idx" ON "DicomStudy" ("__version")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomStudy_reindex_idx" ON "DicomStudy" ("lastUpdated", "__version") WHERE (deleted = false)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomStudy_compartments_idx" ON "DicomStudy" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomStudy___sharedTokens_idx" ON "DicomStudy" USING gin ("__sharedTokens")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomStudy___sharedTokensTextTrgm_idx" ON "DicomStudy" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomStudy____tag_idx" ON "DicomStudy" USING gin ("___tag")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomStudy____tagTextTrgm_idx" ON "DicomStudy" USING gin (token_array_to_text("___tagText") gin_trgm_ops)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomStudy_studyInstanceUid_idx" ON "DicomStudy" ("studyInstanceUid")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomStudy_studyId_idx" ON "DicomStudy" ("studyId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomStudy_studyDate_idx" ON "DicomStudy" ("studyDate")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomStudy_studyTime_idx" ON "DicomStudy" ("studyTime")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomStudy_accessionNumber_idx" ON "DicomStudy" ("accessionNumber")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomStudy_modalities_idx" ON "DicomStudy" USING gin ("modalities")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomStudy_referringPhysiciansName_idx" ON "DicomStudy" ("referringPhysiciansName")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomStudy_patientName_idx" ON "DicomStudy" ("patientName")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomStudy_patientId_idx" ON "DicomStudy" ("patientId")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "DicomStudy_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomStudy_History_id_idx" ON "DicomStudy_History" ("id")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomStudy_History_lastUpdated_idx" ON "DicomStudy_History" ("lastUpdated")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "DicomStudy_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL,
  PRIMARY KEY ("resourceId", "targetId", code)
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomStudy_Refs_targetId_code_idx" ON "DicomStudy_References" ("targetId", "code") INCLUDE ("resourceId")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "DicomSeries" (
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
  "study" TEXT,
  "seriesInstanceUid" TEXT,
  "seriesNumber" TEXT,
  "performedProcedureStepStartDate" TEXT,
  "performedProcedureStepStartTime" TEXT,
  "scheduledProcedureStepId" TEXT,
  "requestedProcedureId" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__studyIdentifierSort" TEXT
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomSeries_lastUpdated_idx" ON "DicomSeries" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomSeries_projectId_lastUpdated_idx" ON "DicomSeries" ("projectId", "lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomSeries_projectId_idx" ON "DicomSeries" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomSeries__source_idx" ON "DicomSeries" ("_source")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomSeries__profile_idx" ON "DicomSeries" USING gin ("_profile")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomSeries___version_idx" ON "DicomSeries" ("__version")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomSeries_reindex_idx" ON "DicomSeries" ("lastUpdated", "__version") WHERE (deleted = false)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomSeries_compartments_idx" ON "DicomSeries" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomSeries___sharedTokens_idx" ON "DicomSeries" USING gin ("__sharedTokens")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomSeries___sharedTokensTextTrgm_idx" ON "DicomSeries" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomSeries____tag_idx" ON "DicomSeries" USING gin ("___tag")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomSeries____tagTextTrgm_idx" ON "DicomSeries" USING gin (token_array_to_text("___tagText") gin_trgm_ops)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomSeries_study_idx" ON "DicomSeries" ("study")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomSeries_seriesInstanceUid_idx" ON "DicomSeries" ("seriesInstanceUid")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomSeries_seriesNumber_idx" ON "DicomSeries" ("seriesNumber")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomSeries_performedProcedureStepStartDate_idx" ON "DicomSeries" ("performedProcedureStepStartDate")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomSeries_performedProcedureStepStartTime_idx" ON "DicomSeries" ("performedProcedureStepStartTime")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomSeries_scheduledProcedureStepId_idx" ON "DicomSeries" ("scheduledProcedureStepId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomSeries_requestedProcedureId_idx" ON "DicomSeries" ("requestedProcedureId")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "DicomSeries_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomSeries_History_id_idx" ON "DicomSeries_History" ("id")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomSeries_History_lastUpdated_idx" ON "DicomSeries_History" ("lastUpdated")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "DicomSeries_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL,
  PRIMARY KEY ("resourceId", "targetId", code)
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomSeries_Refs_targetId_code_idx" ON "DicomSeries_References" ("targetId", "code") INCLUDE ("resourceId")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "DicomInstance" (
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
  "study" TEXT,
  "series" TEXT,
  "sopClassUid" TEXT,
  "sopInstanceUid" TEXT,
  "instanceNumber" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__studyIdentifierSort" TEXT,
  "__seriesIdentifierSort" TEXT
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomInstance_lastUpdated_idx" ON "DicomInstance" ("lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomInstance_projectId_lastUpdated_idx" ON "DicomInstance" ("projectId", "lastUpdated")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomInstance_projectId_idx" ON "DicomInstance" ("projectId")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomInstance__source_idx" ON "DicomInstance" ("_source")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomInstance__profile_idx" ON "DicomInstance" USING gin ("_profile")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomInstance___version_idx" ON "DicomInstance" ("__version")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomInstance_reindex_idx" ON "DicomInstance" ("lastUpdated", "__version") WHERE (deleted = false)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomInstance_compartments_idx" ON "DicomInstance" USING gin ("compartments")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomInstance___sharedTokens_idx" ON "DicomInstance" USING gin ("__sharedTokens")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomInstance___sharedTokensTextTrgm_idx" ON "DicomInstance" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomInstance____tag_idx" ON "DicomInstance" USING gin ("___tag")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomInstance____tagTextTrgm_idx" ON "DicomInstance" USING gin (token_array_to_text("___tagText") gin_trgm_ops)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomInstance_study_idx" ON "DicomInstance" ("study")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomInstance_series_idx" ON "DicomInstance" ("series")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomInstance_sopClassUid_idx" ON "DicomInstance" ("sopClassUid")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomInstance_sopInstanceUid_idx" ON "DicomInstance" ("sopInstanceUid")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomInstance_instanceNumber_idx" ON "DicomInstance" ("instanceNumber")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "DicomInstance_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomInstance_History_id_idx" ON "DicomInstance_History" ("id")`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomInstance_History_lastUpdated_idx" ON "DicomInstance_History" ("lastUpdated")`);
  await fns.query(client, results, `CREATE TABLE IF NOT EXISTS "DicomInstance_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL,
  PRIMARY KEY ("resourceId", "targetId", code)
)`);
  await fns.query(client, results, `CREATE INDEX IF NOT EXISTS "DicomInstance_Refs_targetId_code_idx" ON "DicomInstance_References" ("targetId", "code") INCLUDE ("resourceId")`);
}
