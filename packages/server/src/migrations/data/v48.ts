// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
/*
 * This is a generated file
 * Do not edit manually.
 */

import type { PoolClient } from 'pg';
import { prepareCustomMigrationJobData, runCustomMigration } from '../../workers/post-deploy-migration';
import * as fns from '../migrate-functions';
import type { MigrationActionResult } from '../types';
import type { CustomPostDeployMigration } from './types';

export const migration: CustomPostDeployMigration = {
  type: 'custom',
  prepareJobData: (asyncJob) => prepareCustomMigrationJobData(asyncJob),
  run: async (repo, job, jobData) => runCustomMigration(repo, job, jobData, callback),
};

// prettier-ignore
async function callback(client: PoolClient, results: MigrationActionResult[]): Promise<void> {
  await fns.idempotentCreateIndex(client, results, 'Appointment_projectId___appointmentType_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Appointment_projectId___appointmentType_idx" ON "Appointment" USING gin ("projectId", "__appointmentType")`);
  await fns.query(client, results, `DROP INDEX CONCURRENTLY IF EXISTS "Appointment___appointmentType_idx"`);
  await fns.idempotentCreateIndex(client, results, 'Appointment_projectId___appointmentTypeTextTrgm_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Appointment_projectId___appointmentTypeTextTrgm_idx" ON "Appointment" USING gin ("projectId", token_array_to_text("__appointmentTypeText") gin_trgm_ops)`);
  await fns.query(client, results, `DROP INDEX CONCURRENTLY IF EXISTS "Appointment___appointmentTypeTextTrgm_idx"`);
  await fns.idempotentCreateIndex(client, results, 'Appointment_projectId_status_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Appointment_projectId_status_idx" ON "Appointment" ("projectId", "status")`);
  await fns.query(client, results, `DROP INDEX CONCURRENTLY IF EXISTS "Appointment_status_idx"`);
  await fns.idempotentCreateIndex(client, results, 'Communication_projectId___category_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Communication_projectId___category_idx" ON "Communication" USING gin ("projectId", "__category")`);
  await fns.query(client, results, `DROP INDEX CONCURRENTLY IF EXISTS "Communication___category_idx"`);
  await fns.idempotentCreateIndex(client, results, 'Communication_projectId___categoryTextTrgm_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Communication_projectId___categoryTextTrgm_idx" ON "Communication" USING gin ("projectId", token_array_to_text("__categoryText") gin_trgm_ops)`);
  await fns.query(client, results, `DROP INDEX CONCURRENTLY IF EXISTS "Communication___categoryTextTrgm_idx"`);
  await fns.idempotentCreateIndex(client, results, 'Communication_projectId___medium_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Communication_projectId___medium_idx" ON "Communication" USING gin ("projectId", "__medium")`);
  await fns.query(client, results, `DROP INDEX CONCURRENTLY IF EXISTS "Communication___medium_idx"`);
  await fns.idempotentCreateIndex(client, results, 'Communication_projectId___mediumTextTrgm_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Communication_projectId___mediumTextTrgm_idx" ON "Communication" USING gin ("projectId", token_array_to_text("__mediumText") gin_trgm_ops)`);
  await fns.query(client, results, `DROP INDEX CONCURRENTLY IF EXISTS "Communication___mediumTextTrgm_idx"`);
  await fns.idempotentCreateIndex(client, results, 'Communication_projectId_received_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Communication_projectId_received_idx" ON "Communication" ("projectId", "received")`);
  await fns.query(client, results, `DROP INDEX CONCURRENTLY IF EXISTS "Communication_received_idx"`);
  await fns.idempotentCreateIndex(client, results, 'Communication_projectId___received_sorted_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Communication_projectId___received_sorted_idx" ON "Communication" USING gist ("projectId", "__received", "__receivedSort")`);
  await fns.query(client, results, `DROP INDEX CONCURRENTLY IF EXISTS "Communication___received_sorted_idx"`);
  await fns.idempotentCreateIndex(client, results, 'Communication_projectId_status_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Communication_projectId_status_idx" ON "Communication" ("projectId", "status")`);
  await fns.query(client, results, `DROP INDEX CONCURRENTLY IF EXISTS "Communication_status_idx"`);
  await fns.idempotentCreateIndex(client, results, 'Communication_projectId___topic_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Communication_projectId___topic_idx" ON "Communication" USING gin ("projectId", "__topic")`);
  await fns.query(client, results, `DROP INDEX CONCURRENTLY IF EXISTS "Communication___topic_idx"`);
  await fns.idempotentCreateIndex(client, results, 'Communication_projectId___topicTextTrgm_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Communication_projectId___topicTextTrgm_idx" ON "Communication" USING gin ("projectId", token_array_to_text("__topicText") gin_trgm_ops)`);
  await fns.query(client, results, `DROP INDEX CONCURRENTLY IF EXISTS "Communication___topicTextTrgm_idx"`);
  await fns.idempotentCreateIndex(client, results, 'DocumentReference_projectId___type_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "DocumentReference_projectId___type_idx" ON "DocumentReference" USING gin ("projectId", "__type")`);
  await fns.query(client, results, `DROP INDEX CONCURRENTLY IF EXISTS "DocumentReference___type_idx"`);
  await fns.idempotentCreateIndex(client, results, 'DocumentReference_projectId___typeTextTrgm_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "DocumentReference_projectId___typeTextTrgm_idx" ON "DocumentReference" USING gin ("projectId", token_array_to_text("__typeText") gin_trgm_ops)`);
  await fns.query(client, results, `DROP INDEX CONCURRENTLY IF EXISTS "DocumentReference___typeTextTrgm_idx"`);
  await fns.idempotentCreateIndex(client, results, 'DocumentReference_projectId___category_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "DocumentReference_projectId___category_idx" ON "DocumentReference" USING gin ("projectId", "__category")`);
  await fns.query(client, results, `DROP INDEX CONCURRENTLY IF EXISTS "DocumentReference___category_idx"`);
  await fns.idempotentCreateIndex(client, results, 'DocumentReference_projectId___categoryTextTrgm_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "DocumentReference_projectId___categoryTextTrgm_idx" ON "DocumentReference" USING gin ("projectId", token_array_to_text("__categoryText") gin_trgm_ops)`);
  await fns.query(client, results, `DROP INDEX CONCURRENTLY IF EXISTS "DocumentReference___categoryTextTrgm_idx"`);
  await fns.idempotentCreateIndex(client, results, 'DocumentReference_projectId_status_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "DocumentReference_projectId_status_idx" ON "DocumentReference" ("projectId", "status")`);
  await fns.query(client, results, `DROP INDEX CONCURRENTLY IF EXISTS "DocumentReference_status_idx"`);
  await fns.idempotentCreateIndex(client, results, 'Encounter_projectId____tag_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Encounter_projectId____tag_idx" ON "Encounter" USING gin ("projectId", "___tag")`);
  await fns.query(client, results, `DROP INDEX CONCURRENTLY IF EXISTS "Encounter____tag_idx"`);
  await fns.idempotentCreateIndex(client, results, 'Encounter_projectId____tagTextTrgm_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Encounter_projectId____tagTextTrgm_idx" ON "Encounter" USING gin ("projectId", token_array_to_text("___tagText") gin_trgm_ops)`);
  await fns.query(client, results, `DROP INDEX CONCURRENTLY IF EXISTS "Encounter____tagTextTrgm_idx"`);
  await fns.idempotentCreateIndex(client, results, 'Encounter_projectId___class_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Encounter_projectId___class_idx" ON "Encounter" USING gin ("projectId", "__class")`);
  await fns.query(client, results, `DROP INDEX CONCURRENTLY IF EXISTS "Encounter___class_idx"`);
  await fns.idempotentCreateIndex(client, results, 'Encounter_projectId___classTextTrgm_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Encounter_projectId___classTextTrgm_idx" ON "Encounter" USING gin ("projectId", token_array_to_text("__classText") gin_trgm_ops)`);
  await fns.query(client, results, `DROP INDEX CONCURRENTLY IF EXISTS "Encounter___classTextTrgm_idx"`);
  await fns.idempotentCreateIndex(client, results, 'Encounter_projectId_status_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Encounter_projectId_status_idx" ON "Encounter" ("projectId", "status")`);
  await fns.query(client, results, `DROP INDEX CONCURRENTLY IF EXISTS "Encounter_status_idx"`);
  await fns.idempotentCreateIndex(client, results, 'Observation_projectId___code_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Observation_projectId___code_idx" ON "Observation" USING gin ("projectId", "__code")`);
  await fns.query(client, results, `DROP INDEX CONCURRENTLY IF EXISTS "Observation___code_idx"`);
  await fns.idempotentCreateIndex(client, results, 'Observation_projectId___codeTextTrgm_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Observation_projectId___codeTextTrgm_idx" ON "Observation" USING gin ("projectId", token_array_to_text("__codeText") gin_trgm_ops)`);
  await fns.query(client, results, `DROP INDEX CONCURRENTLY IF EXISTS "Observation___codeTextTrgm_idx"`);
  await fns.idempotentCreateIndex(client, results, 'Observation_projectId___category_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Observation_projectId___category_idx" ON "Observation" USING gin ("projectId", "__category")`);
  await fns.query(client, results, `DROP INDEX CONCURRENTLY IF EXISTS "Observation___category_idx"`);
  await fns.idempotentCreateIndex(client, results, 'Observation_projectId___categoryTextTrgm_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Observation_projectId___categoryTextTrgm_idx" ON "Observation" USING gin ("projectId", token_array_to_text("__categoryText") gin_trgm_ops)`);
  await fns.query(client, results, `DROP INDEX CONCURRENTLY IF EXISTS "Observation___categoryTextTrgm_idx"`);
  await fns.idempotentCreateIndex(client, results, 'Observation_projectId_status_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Observation_projectId_status_idx" ON "Observation" ("projectId", "status")`);
  await fns.query(client, results, `DROP INDEX CONCURRENTLY IF EXISTS "Observation_status_idx"`);
  await fns.idempotentCreateIndex(client, results, 'Observation_projectId_valueQuantity_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Observation_projectId_valueQuantity_idx" ON "Observation" ("projectId", "valueQuantity")`);
  await fns.query(client, results, `DROP INDEX CONCURRENTLY IF EXISTS "Observation_valueQuantity_idx"`);
  await fns.idempotentCreateIndex(client, results, 'Observation_projectId___valueQuantity_sorted_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Observation_projectId___valueQuantity_sorted_idx" ON "Observation" USING gist ("projectId", "__valueQuantity", "__valueQuantitySort")`);
  await fns.query(client, results, `DROP INDEX CONCURRENTLY IF EXISTS "Observation___valueQuantity_sorted_idx"`);
  await fns.idempotentCreateIndex(client, results, 'Task_projectId___authoredOn_sorted_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Task_projectId___authoredOn_sorted_idx" ON "Task" USING gist ("projectId", "__authoredOn", "__authoredOnSort")`);
  await fns.query(client, results, `DROP INDEX CONCURRENTLY IF EXISTS "Task___authoredOn_sorted_idx"`);
  await fns.idempotentCreateIndex(client, results, 'Task_projectId___dueDate_sorted_idx', `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Task_projectId___dueDate_sorted_idx" ON "Task" USING gist ("projectId", "__dueDate", "__dueDateSort")`);
  await fns.query(client, results, `DROP INDEX CONCURRENTLY IF EXISTS "Task___dueDate_sorted_idx"`);
}
