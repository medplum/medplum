// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
/**
 * Seed the per-tenant credential encryption key into `Project.secret[]`.
 *
 * Bots have no environment of their own — `event.secrets` is built from the
 * project's secrets — so this is where `LYFE_CREDENTIAL_ENCRYPTION_KEY` has to
 * live for `bots/lyfe-integrations.ts` to read it.
 *
 * Idempotent, and deliberately one-directional: if the secret already exists it
 * is left exactly as-is and the script exits 0. Overwriting it would not "reset"
 * anything — every DrChrono and ZUS secret already stored for every clinic is
 * ciphertext under the old key, and would become permanently unreadable. Key
 * rotation is a separate operation that has to re-encrypt those records first,
 * and this script is not it.
 *
 * Usage:
 *   npm run seed:credential-key
 *   npm run seed:credential-key -- --print   (also print the key, once)
 */
import { MedplumClient } from '@medplum/core';
import type { Project, ProjectSetting } from '@medplum/fhirtypes';
import { randomBytes } from 'node:crypto';

/** Must match ENCRYPTION_KEY_SECRET_NAME in bots/shared/credentials.ts. */
const SECRET_NAME = 'LYFE_CREDENTIAL_ENCRYPTION_KEY';

/** 32 bytes, hex encoded — exactly an AES-256 key, no KDF needed at read time. */
const KEY_BYTES = 32;

async function main(): Promise<void> {
  const baseUrl = process.env.MEDPLUM_BASE_URL;
  const clientId = process.env.MEDPLUM_CLIENT_ID;
  const clientSecret = process.env.MEDPLUM_CLIENT_SECRET;
  if (!baseUrl || !clientId || !clientSecret) {
    throw new Error('MEDPLUM_BASE_URL, MEDPLUM_CLIENT_ID and MEDPLUM_CLIENT_SECRET are required');
  }

  const medplum = new MedplumClient({ baseUrl, fetch });
  await medplum.startClientLogin(clientId, clientSecret);

  const projectId = medplum.getProject()?.id;
  if (!projectId) {
    throw new Error('Client login returned no project');
  }

  // Read the Project through the FHIR API rather than trusting the login
  // payload: the login copy is a projection and does not carry `secret`, so
  // writing it back would silently delete every other project secret.
  const project: Project = await medplum.readResource('Project', projectId);
  console.log(`Project: ${project.name} (${project.id})`);

  const secrets: ProjectSetting[] = project.secret ?? [];
  const existing = secrets.find((s) => s.name === SECRET_NAME);
  if (existing) {
    console.log(`  ${SECRET_NAME} already set — leaving it alone.`);
    console.log('  Rotating it would orphan every credential already encrypted under it.');
    return;
  }

  const value = randomBytes(KEY_BYTES).toString('hex');
  await medplum.updateResource<Project>({
    ...project,
    secret: [...secrets, { name: SECRET_NAME, valueString: value }],
  });

  console.log(`  ${SECRET_NAME} created (${KEY_BYTES} random bytes, hex).`);
  if (process.argv.includes('--print')) {
    console.log(`  ${value}`);
  } else {
    console.log('  Value not printed. Re-run with --print only if you need a copy for a backup vault.');
  }
}

main().catch((err) => {
  console.error('Seed failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
