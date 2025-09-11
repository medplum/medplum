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
  await fns.query(client, results, `ALTER TABLE IF EXISTS "Patient" ADD COLUMN IF NOT EXISTS "__familySort" TEXT`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "Patient" ADD COLUMN IF NOT EXISTS "__givenSort" TEXT`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "Patient" ADD COLUMN IF NOT EXISTS "__nameSort" TEXT`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "Person" ADD COLUMN IF NOT EXISTS "__nameSort" TEXT`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "Practitioner" ADD COLUMN IF NOT EXISTS "__familySort" TEXT`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "Practitioner" ADD COLUMN IF NOT EXISTS "__givenSort" TEXT`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "Practitioner" ADD COLUMN IF NOT EXISTS "__nameSort" TEXT`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "RelatedPerson" ADD COLUMN IF NOT EXISTS "__nameSort" TEXT`);
}
