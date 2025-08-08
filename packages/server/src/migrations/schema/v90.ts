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
  const actions: { name: string; durationMs: number }[] = []
  await fns.query(client, actions, 'ALTER TABLE IF EXISTS "Flag" ADD COLUMN IF NOT EXISTS "status" TEXT');
}
