// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/*
 * This is a generated file
 * Do not edit manually.
 */

import { PoolClient } from 'pg';

// prettier-ignore
export async function run(client: PoolClient): Promise<void> {
  await client.query('ALTER TABLE IF EXISTS "DatabaseMigration" ADD COLUMN IF NOT EXISTS "firstBoot" BOOLEAN NOT NULL DEFAULT false');
}
