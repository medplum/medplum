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
  await fns.query(client, results, `ALTER TABLE IF EXISTS "AllergyIntolerance" ADD COLUMN IF NOT EXISTS "encounter" TEXT`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "AllergyIntolerance" ADD COLUMN IF NOT EXISTS "__encounterIdentifierSort" TEXT`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "Immunization" ADD COLUMN IF NOT EXISTS "encounter" TEXT`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "Immunization" ADD COLUMN IF NOT EXISTS "__encounterIdentifierSort" TEXT`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "ProjectMembership" ADD COLUMN IF NOT EXISTS "__identifier" UUID[]`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "ProjectMembership" ADD COLUMN IF NOT EXISTS "__identifierText" TEXT[]`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "ProjectMembership" ADD COLUMN IF NOT EXISTS "__identifierSort" TEXT`);
}
