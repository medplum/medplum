// SPDX-FileCopyrightText: Copyright Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// End-to-end workflow test for ai-textract bot.
//
// Usage:
//   node scripts/test-workflow.mjs                    # run all fixtures
//   node scripts/test-workflow.mjs fixtures/sample-lab-report.pdf   # single fixture
//   node scripts/test-workflow.mjs --no-cleanup        # keep created resources after run
//
// Requires MEDPLUM_CLIENT_ID + MEDPLUM_CLIENT_SECRET + MEDPLUM_BOT_ID in .env.

import { MedplumClient } from '@medplum/core';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Config ──────────────────────────────────────────────────────────────────

const BASE_URL = 'https://api.medplum.com';
const POLL_INTERVAL_MS = 3000;
const JOB_TIMEOUT_MS = 360_000; // 6 min (Lambda max 300s + buffer)

const ALL_FIXTURES = [
  'fixtures/sample-lab-report.pdf',
  'fixtures/PRV_LG_0081_DE-IDENTIFIED.pdf',
  'fixtures/PRV_LG_0073_DE-IDENTIFIED.pdf',
  'fixtures/PRV_BSC_2116_906807965_DE-IDENTIFIED.pdf',
  'fixtures/PRV_LG_1039_DE-IDENTIFIED.pdf',
  'fixtures/PRV_LG_0148_DE-IDENTIFIED.pdf',
];

// ─── CLI flags ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const cleanup = !args.includes('--no-cleanup');
const fixtureArgs = args.filter((a) => !a.startsWith('--'));
const fixtures = fixtureArgs.length > 0 ? fixtureArgs : ALL_FIXTURES;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadEnv() {
  const env = {};
  try {
    const content = readFileSync(join(__dirname, '..', '.env'), 'utf-8');
    for (const line of content.split('\n')) {
      const match = line.match(/^([^#][^=]*)=(.*)$/);
      if (match) env[match[1].trim()] = match[2].trim();
    }
  } catch {
    /* ignore */
  }
  return env;
}

function fmt(label, value) {
  return `  ${label.padEnd(22)} ${value}`;
}

function fmtRef(ref) {
  if (!ref) return '(none)';
  return ref.display ? `${ref.reference} (${ref.display})` : ref.reference;
}

async function pollAsyncJob(contentLocation, token) {
  const deadline = Date.now() + JOB_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const res = await fetch(contentLocation, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Poll failed: ${res.status} ${await res.text()}`);
    const job = await res.json();
    process.stdout.write(`\r  AsyncJob status: ${job.status}   `);
    if (job.status === 'completed' || job.status === 'error') {
      process.stdout.write('\n');
      return job;
    }
  }
  throw new Error(`AsyncJob timed out after ${JOB_TIMEOUT_MS / 1000}s`);
}

function printBundle(bundle, fixture) {
  const entries = bundle.entry ?? [];
  console.log(`\n  Bundle: ${entries.length} entries`);

  const patient = entries.find((e) => e.resource?.resourceType === 'Patient')?.resource;
  if (patient) {
    const name = patient.name?.[0];
    const fullName = [name?.given?.join(' '), name?.family].filter(Boolean).join(' ') || '(unknown)';
    console.log(fmt('Patient:', fullName));
    console.log(fmt('  birth/gender:', `${patient.birthDate ?? '?'} / ${patient.gender ?? '?'}`));
    const stableId = patient.identifier?.find((i) => i.system?.startsWith('urn:medplum:document-import'));
    if (stableId) console.log(fmt('  stable ID:', `${stableId.system}|${stableId.value}`));
  } else {
    console.log(fmt('Patient:', '⚠ MISSING'));
  }

  const observations = entries.filter((e) => e.resource?.resourceType === 'Observation');
  console.log(fmt('Observations:', observations.length));
  for (const obs of observations.slice(0, 8)) {
    const r = obs.resource;
    const code = r.code?.text ?? r.code?.coding?.[0]?.display ?? '?';
    const val = r.valueQuantity
      ? `${r.valueQuantity.value} ${r.valueQuantity.unit ?? ''}`
      : (r.valueString ?? r.valueCodeableConcept?.text ?? '(no value)');
    const flag = r.interpretation?.[0]?.coding?.[0]?.code;
    console.log(`    • ${code}: ${val}${flag ? ` [${flag}]` : ''}`);
  }
  if (observations.length > 8) console.log(`    ... and ${observations.length - 8} more`);

  const dr = entries.find((e) => e.resource?.resourceType === 'DiagnosticReport')?.resource;
  if (dr) {
    console.log(fmt('DiagnosticReport:', dr.code?.text ?? '(no title)'));
    console.log(fmt('  effective:', dr.effectiveDateTime ?? '(none)'));
    const labSlice = dr.category?.some((cat) =>
      cat.coding?.some((c) => c.system === 'http://terminology.hl7.org/CodeSystem/v2-0074' && c.code === 'LAB')
    );
    console.log(fmt('  LAB slice:', labSlice ? '✓' : '✗ MISSING'));
    console.log(fmt('  result refs:', (dr.result ?? []).length));
  }

  const docRef = entries.find((e) => e.resource?.resourceType === 'DocumentReference')?.resource;
  if (docRef) {
    const type = docRef.type?.coding?.[0]?.display ?? docRef.type?.text ?? '(none)';
    const cats = (docRef.category ?? []).map((c) => c.coding?.[0]?.display ?? c.coding?.[0]?.code).join(', ');
    console.log(fmt('DocRef type:', type));
    console.log(fmt('DocRef categories:', cats || '(none)'));
  }

  const coverage = entries.filter((e) => e.resource?.resourceType === 'Coverage');
  if (coverage.length > 0) {
    const c = coverage[0].resource;
    const payor = c.payor?.[0]?.display ?? '(unknown)';
    const plan = c.class?.[0]?.name ?? c.class?.[0]?.value ?? '(unknown)';
    console.log(fmt('Coverage:', `${payor} — ${plan}`));
  }

  const conditions = entries.filter((e) => e.resource?.resourceType === 'Condition');
  if (conditions.length > 0) {
    console.log(fmt('Conditions:', conditions.map((e) => e.resource.code?.text).join(', ')));
  }

  const meds = entries.filter((e) => e.resource?.resourceType === 'MedicationRequest');
  if (meds.length > 0) {
    console.log(fmt('Medications:', meds.map((e) => e.resource.medicationCodeableConcept?.text).join(', ')));
  }
}

async function checkDocRef(medplum, docRefId, fixture) {
  try {
    const dr = await medplum.readResource('DocumentReference', docRefId);
    const type = dr.type?.coding?.[0]?.display ?? dr.type?.text;
    const cats = (dr.category ?? []).map((c) => c.coding?.[0]?.display ?? c.coding?.[0]?.code).join(', ');
    const subject = fmtRef(dr.subject);
    const contentTypes = (dr.content ?? []).map((c) => c.attachment?.contentType).join(', ');
    console.log(`\n  Source DocumentReference/${docRefId} after patching:`);
    console.log(fmt('  subject:', subject));
    console.log(fmt('  type:', type ?? '⚠ MISSING'));
    console.log(fmt('  category:', cats || '⚠ MISSING'));
    console.log(fmt('  content types:', contentTypes || '(none)'));
    return { type, cats, subject, contentTypes };
  } catch (err) {
    console.log(`\n  ⚠ Could not read DocumentReference/${docRefId}: ${err.message}`);
    return null;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const env = loadEnv();
const clientId = env['MEDPLUM_CLIENT_ID'];
const clientSecret = env['MEDPLUM_CLIENT_SECRET'];
const botId = env['MEDPLUM_BOT_ID'];

if (!clientId || !clientSecret || !botId) {
  console.error('ERROR: MEDPLUM_CLIENT_ID / MEDPLUM_CLIENT_SECRET / MEDPLUM_BOT_ID not set in .env');
  process.exit(1);
}

const medplum = new MedplumClient({ baseUrl: `${BASE_URL}/` });
await medplum.startClientLogin(clientId, clientSecret);
const token = medplum.getAccessToken();
console.log(`Authenticated as client ${clientId}\n`);
console.log(`Fixtures  : ${fixtures.length}`);
console.log(`Bot ID    : ${botId}`);
console.log(`Cleanup   : ${cleanup}\n`);

const results = [];
const createdDocRefIds = [];

for (const fixture of fixtures) {
  const bar = '─'.repeat(70);
  console.log(`\n${bar}`);
  console.log(`Fixture: ${fixture}`);
  console.log(bar);

  const start = Date.now();
  let pass = false;
  let failReason = '';
  let docRefId = null;

  try {
    // 1. Upload PDF
    const pdfPath = join(__dirname, '..', fixture);
    const pdfData = readFileSync(pdfPath);
    const filename = fixture.split('/').pop();
    const binary = await medplum.createBinary(pdfData, filename, 'application/pdf');
    console.log(`  Binary: ${binary.id}`);

    // 2. Create DocumentReference
    const docRef = await medplum.createResource({
      resourceType: 'DocumentReference',
      status: 'current',
      content: [{ attachment: { contentType: 'application/pdf', url: `Binary/${binary.id}`, title: filename } }],
    });
    docRefId = docRef.id;
    createdDocRefIds.push(docRefId);
    console.log(`  DocumentReference: ${docRefId}`);

    // 3. Execute bot async
    console.log(`  Executing bot ${botId} (async)...`);
    const execRes = await fetch(`${BASE_URL}/fhir/R4/Bot/${botId}/$execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/fhir+json',
        Authorization: `Bearer ${token}`,
        Prefer: 'respond-async',
      },
      body: JSON.stringify(docRef),
    });

    if (execRes.status !== 202) {
      const text = await execRes.text();
      throw new Error(`Expected 202 but got ${execRes.status}: ${text.slice(0, 300)}`);
    }

    const contentLocation = execRes.headers.get('content-location');
    if (!contentLocation) throw new Error('Missing content-location header');
    console.log(`  AsyncJob: ${contentLocation}`);

    // 4. Poll until done
    const job = await pollAsyncJob(contentLocation, token);
    if (job.status === 'error') {
      throw new Error(`Bot job failed: ${JSON.stringify(job.output)}`);
    }

    // 5. Parse result
    const resultParam = job.output?.parameter?.find((p) => p.name === 'responseBody');
    if (!resultParam?.valueString) throw new Error('No responseBody in AsyncJob output');
    const resultBundle = JSON.parse(resultParam.valueString);

    // Detect Lambda-level errors
    if (resultBundle.errorMessage) {
      throw new Error(`Lambda error: ${resultBundle.errorMessage}`);
    }
    if (resultBundle.resourceType !== 'Bundle') {
      throw new Error(`Expected Bundle but got: ${JSON.stringify(resultBundle).slice(0, 200)}`);
    }

    // 6. Print summary
    printBundle(resultBundle, fixture);

    // 7. Verify source DocumentReference was patched
    await checkDocRef(medplum, docRefId, fixture);

    // 8. Assertions
    const entries = resultBundle.entry ?? [];
    const patient = entries.find((e) => e.resource?.resourceType === 'Patient');
    if (!patient) throw new Error('Bundle missing Patient resource');

    const dr = entries.find((e) => e.resource?.resourceType === 'DiagnosticReport')?.resource;
    const observations = entries.filter((e) => e.resource?.resourceType === 'Observation');
    if (dr && observations.length === 0) throw new Error('DiagnosticReport present but no Observations');
    if (dr) {
      const hasLab = dr.category?.some((cat) =>
        cat.coding?.some((c) => c.system === 'http://terminology.hl7.org/CodeSystem/v2-0074' && c.code === 'LAB')
      );
      if (!hasLab) throw new Error('DiagnosticReport missing required v2-0074/LAB category slice');
    }

    pass = true;
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`\n  ✓ PASS  (${elapsed}s)`);
  } catch (err) {
    failReason = err.message ?? String(err);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`\n  ✗ FAIL  (${elapsed}s)\n  Error: ${failReason}`);
  }

  results.push({ fixture, pass, failReason, docRefId });
}

// ─── Summary ─────────────────────────────────────────────────────────────────

const bar = '═'.repeat(70);
console.log(`\n${bar}`);
console.log('RESULTS');
console.log(bar);
const passed = results.filter((r) => r.pass).length;
for (const r of results) {
  const icon = r.pass ? '✓' : '✗';
  const label = r.fixture.split('/').pop().padEnd(45);
  console.log(`  ${icon} ${label} ${r.pass ? 'PASS' : `FAIL: ${r.failReason.slice(0, 60)}`}`);
}
console.log(`\n  ${passed}/${fixtures.length} passed`);

// ─── Cleanup ──────────────────────────────────────────────────────────────────

if (cleanup && createdDocRefIds.length > 0) {
  console.log(`\nCleaning up ${createdDocRefIds.length} created DocumentReference(s)...`);
  for (const id of createdDocRefIds) {
    try {
      await medplum.deleteResource('DocumentReference', id);
    } catch (err) {
      console.log(`  ⚠ Could not delete DocumentReference/${id}: ${err.message}`);
    }
  }
  console.log('  Done.');
}

if (passed < fixtures.length) process.exit(1);
