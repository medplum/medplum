// SPDX-FileCopyrightText: Copyright Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Cleanup script: deletes test resources created by ai-textract e2e runs.
// Run with: node scripts/cleanup-test-data.mjs

import { MedplumClient } from '@medplum/core';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const env = {};
  try {
    const content = readFileSync(join(__dirname, '..', '.env'), 'utf-8');
    for (const line of content.split('\n')) {
      const match = line.match(/^([^#][^=]*)=(.*)$/);
      if (match) env[match[1].trim()] = match[2].trim();
    }
  } catch { /* ignore */ }
  return env;
}

async function deleteAll(medplum, resourceType, query) {
  let deleted = 0;
  let url = medplum.fhirUrl(resourceType).toString() + '?' + query + '&_count=100';
  while (url) {
    const bundle = await medplum.get(url);
    const entries = bundle.entry ?? [];
    if (entries.length === 0) break;
    for (const entry of entries) {
      if (entry.resource?.id) {
        await medplum.deleteResource(resourceType, entry.resource.id);
        deleted++;
        process.stdout.write(`\r  Deleted ${deleted} ${resourceType}...`);
      }
    }
    const nextLink = bundle.link?.find(l => l.relation === 'next');
    url = nextLink?.url ?? null;
  }
  console.log(`\r  Deleted ${deleted} ${resourceType} total.`);
  return deleted;
}

const env = loadEnv();
const clientId = env['MEDPLUM_CLIENT_ID'];
const clientSecret = env['MEDPLUM_CLIENT_SECRET'];

if (!clientId || !clientSecret) {
  console.error('Missing MEDPLUM_CLIENT_ID / MEDPLUM_CLIENT_SECRET in .env');
  process.exit(1);
}

const medplum = new MedplumClient({ baseUrl: 'https://api.medplum.com/' });
await medplum.startClientLogin(clientId, clientSecret);
console.log('Authenticated.\n');

// 1. Patients — new-format stable IDs
console.log('Deleting Patients (stable urn:medplum:document-import:patient|)...');
await deleteAll(medplum, 'Patient', 'identifier=urn%3Amedplum%3Adocument-import%3Apatient%7C');

// 2. Patients — old-format DocRef IDs
console.log('Deleting Patients (old urn:medplum:document-import|DocumentReference/)...');
await deleteAll(medplum, 'Patient', 'identifier=urn%3Amedplum%3Adocument-import%7CDocumentReference');

// 3. Observations
console.log('Deleting Observations...');
await deleteAll(medplum, 'Observation', 'identifier=urn%3Amedplum%3Adocument-import%7C');

// 4. Coverage
console.log('Deleting Coverage...');
await deleteAll(medplum, 'Coverage', 'identifier=urn%3Amedplum%3Adocument-import%7C');

// 5. Bot-created classification DocumentReferences
console.log('Deleting bot-created DocumentReferences (identifier=urn:medplum:document-import|)...');
await deleteAll(medplum, 'DocumentReference', 'identifier=urn%3Amedplum%3Adocument-import%7C');

// 6. Source PDF DocumentReferences (created by e2e test uploads — content type application/pdf, no identifier)
console.log('Deleting uploaded PDF DocumentReferences (application/pdf content)...');
await deleteAll(medplum, 'DocumentReference', 'contenttype=application%2Fpdf');

console.log('\nDone.');
