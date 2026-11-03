// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { MedplumClient } from '@medplum/core';
import { readConnection } from '../common/connection';
import { SECRET } from '../common/constants';
import { migrateCredential, readCredential } from '../common/credentials';
import { GoogleCalendarClient } from '../common/google-calendar';
import { refreshAccessToken } from '../common/google-oauth';
import { withConnectionLease } from '../common/lease';
import { migrateMirrors } from '../common/migration';
import { assertDeploymentProject, cliAccessToken, loadPackageEnv } from './deployment-auth';

/*
 * Repairs prototype mirrors so the workers accept them. Authenticates like the other scripts:
 * the selected CLI profile by default, or Medplum service credentials when CLIENT_ID and
 * CLIENT_SECRET are set. The Google client comes from the environment or the project secrets.
 */

loadPackageEnv();

function env(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}
async function main(): Promise<void> {
  const baseUrl = process.env.BASE_URL ?? process.env.MEDPLUM_BASE_URL ?? 'https://api.medplum.com/';
  const medplum = process.env.CLIENT_ID
    ? new MedplumClient({ baseUrl, clientId: env('CLIENT_ID'), clientSecret: env('CLIENT_SECRET') })
    : new MedplumClient({ baseUrl, accessToken: cliAccessToken(baseUrl, process.env.MEDPLUM_PROFILE) });
  const projectId = env('PROJECT_ID');
  await assertDeploymentProject(medplum, projectId);
  const project = await medplum.readResource('Project', projectId);
  const secret = (name: string): string =>
    process.env[name] ?? project.secret?.find((s) => s.name === name)?.valueString ?? env(name);
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
      { clientId: secret(SECRET.clientId), clientSecret: secret(SECRET.clientSecret) },
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
