// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { MedplumClient } from '@medplum/core';
import { readConnection } from '../common/connection';
import { migrateCredential, readCredential } from '../common/credentials';
import { GoogleCalendarClient } from '../common/google-calendar';
import { refreshAccessToken } from '../common/google-oauth';
import { withConnectionLease } from '../common/lease';
import { migrateMirrors } from '../common/migration';

function env(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}
async function main(): Promise<void> {
  const medplum = new MedplumClient({
    baseUrl: process.env.BASE_URL ?? 'https://api.medplum.com/',
    clientId: env('CLIENT_ID'),
    clientSecret: env('CLIENT_SECRET'),
  });
  const apply = process.argv.includes('--apply');
  await withConnectionLease(medplum, env('CONNECTION_ID'), async (lease) => {
    // Even dry-run takes a lease to prevent a concurrent sync from changing the evidence.
    if (apply) {
      await migrateCredential(lease);
    }
    const connection = readConnection(await lease.read());
    if (!connection) {
      throw new Error('Invalid connection');
    }
    const access = await refreshAccessToken(
      { clientId: env('GOOGLE_CALENDAR_CLIENT_ID'), clientSecret: env('GOOGLE_CALENDAR_CLIENT_SECRET') },
      await readCredential(medplum, connection)
    );
    const results = await migrateMirrors(
      lease,
      connection,
      new GoogleCalendarClient(access.access_token, { beforeRequest: () => lease.check() }),
      apply
    );
    console.log(JSON.stringify({ applied: apply, results }, null, 2));
    if (results.some((r) => r.action === 'repair-required')) {
      process.exitCode = 1;
    }
  });
}
main().catch(() => {
  console.error('Migration failed; no completion claimed. Inspect connection status and permissions.');
  process.exitCode = 1;
});
