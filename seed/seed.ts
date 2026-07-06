// SPDX-License-Identifier: Apache-2.0
// Seeds MedsScript starter content (demo group/clinic, billing plans,
// questionnaires, protocols) into the Medplum project as a FHIR transaction.
// Idempotent: every entry is a conditional update keyed by identifier/name,
// so re-running updates in place instead of duplicating.
//
// Auth uses a Medplum ClientApplication (client-credentials) — no user password.
// Create one in the app: Project settings -> Client Applications -> New,
// then export its ID/secret before running (see README.md).

import { MedplumClient } from '@medplum/core';
import type { Bundle } from '@medplum/fhirtypes';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const baseUrl = process.env.MEDPLUM_BASE_URL ?? 'https://api.medsscript.com/';
const clientId = process.env.MEDPLUM_CLIENT_ID;
const clientSecret = process.env.MEDPLUM_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error('Set MEDPLUM_CLIENT_ID and MEDPLUM_CLIENT_SECRET (from a Medplum ClientApplication).');
  process.exit(1);
}

const bundlePath = fileURLToPath(new URL('./seed-bundle.json', import.meta.url));
const bundle = JSON.parse(readFileSync(bundlePath, 'utf8')) as Bundle;

const medplum = new MedplumClient({ baseUrl });
await medplum.startClientLogin(clientId, clientSecret);

console.log(`Seeding ${bundle.entry?.length ?? 0} resources into ${baseUrl} ...`);
const result = await medplum.executeBatch(bundle);

let ok = 0;
let failed = 0;
for (const entry of result.entry ?? []) {
  const status = entry.response?.status ?? '???';
  const loc = entry.response?.location ?? entry.response?.outcome ? JSON.stringify(entry.response?.outcome) : '';
  if (status.startsWith('2')) {
    ok++;
    console.log(`  ok   ${status}  ${entry.response?.location ?? ''}`);
  } else {
    failed++;
    console.log(`  FAIL ${status}  ${loc}`);
  }
}
console.log(`\nDone: ${ok} ok, ${failed} failed.`);
process.exit(failed > 0 ? 1 : 0);
