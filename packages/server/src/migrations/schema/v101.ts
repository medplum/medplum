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
  await fns.query(client, results, `ALTER TABLE IF EXISTS "ActivityDefinition" ADD COLUMN IF NOT EXISTS "__code" UUID[]`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "ActivityDefinition" ADD COLUMN IF NOT EXISTS "__codeText" TEXT[]`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "ActivityDefinition" ADD COLUMN IF NOT EXISTS "__codeSort" TEXT`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "Communication" ADD COLUMN IF NOT EXISTS "priorityOrder" INTEGER`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "Communication" ADD COLUMN IF NOT EXISTS "priority" TEXT`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "ProjectMembership" ADD COLUMN IF NOT EXISTS "active" BOOLEAN`);
}
