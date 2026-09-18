// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { PoolClient } from 'pg';
import * as fns from '../migrate-functions';

export async function run(client: PoolClient): Promise<void> {
  const results: { name: string; durationMs: number }[] = [];
  // bloom is contrib; HypoPG can use USING bloom only when this extension is loaded.
  await createExtensionIfAvailable(client, results, 'bloom');
  // Official postgres images do not ship hypopg; skip CREATE EXTENSION when the control file is missing.
  await createExtensionIfAvailable(client, results, 'hypopg');
}

async function createExtensionIfAvailable(
  client: PoolClient,
  results: { name: string; durationMs: number }[],
  name: 'bloom' | 'hypopg'
): Promise<void> {
  const available = await client.query(`SELECT 1 FROM pg_available_extensions WHERE name = $1`, [name]);
  if ((available.rowCount ?? 0) > 0) {
    await fns.query(client, results, `CREATE EXTENSION IF NOT EXISTS ${name}`);
  }
}
