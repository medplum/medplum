// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { PoolClient } from 'pg';
import * as fns from '../migrate-functions';

export async function run(client: PoolClient): Promise<void> {
  const results: { name: string; durationMs: number }[] = [];
  // bloom is contrib; HypoPG can use USING bloom only when this extension is loaded.
  const bloomAvailable = await client.query(`SELECT 1 FROM pg_available_extensions WHERE name = 'bloom'`);
  if ((bloomAvailable.rowCount ?? 0) > 0) {
    await fns.query(client, results, `CREATE EXTENSION IF NOT EXISTS bloom`);
  }
  // Official postgres images do not ship hypopg; skip CREATE EXTENSION when the control file is missing.
  const hypopgAvailable = await client.query(`SELECT 1 FROM pg_available_extensions WHERE name = 'hypopg'`);
  if ((hypopgAvailable.rowCount ?? 0) > 0) {
    await fns.query(client, results, `CREATE EXTENSION IF NOT EXISTS hypopg`);
  }
}
