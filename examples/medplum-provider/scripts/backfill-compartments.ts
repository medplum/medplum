// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
/**
 * Backfill an Organization compartment across every patient chart.
 *
 * Multi-tenancy here is Medplum's Organization compartment: a clinic user's
 * AccessPolicy is `criteria: Type?_compartment=%organization`, so a resource is
 * visible to that clinic only if it carries the Organization in `meta.accounts`.
 * A Patient can carry the account while its chart does not, and the chart is
 * then invisible — present in the database, absent from the UI.
 *
 * The obvious fix, `POST Patient/{id}/$set-accounts` with `propagate: true`,
 * does not survive a real chart. It performs thousands of individual
 * server-side writes and trips the points-per-minute limiter partway through,
 * failing with `{"code":"throttled","limit":50000}`. `Prefer: respond-async`
 * does not help — the AsyncJob hits the same limiter. The partial result is the
 * worst outcome, because the Patient now carries the account and a
 * patient-level check calls it "already enrolled" forever.
 *
 * So this script does the propagation from the client side, in bulk:
 *
 *   - It asks the server for exactly the resources that are NOT yet in the
 *     compartment (`_compartment:not=Organization/{id}`), so a re-run after a
 *     crash picks up precisely where it stopped. Idempotent and resumable by
 *     construction — a fully-migrated chart costs one count query per type and
 *     zero writes.
 *   - It writes them back in `Bundle type=batch` chunks through
 *     `bots/shared/batch.ts`, which handles whole-bundle 429s, per-entry 429s
 *     inside an HTTP 200, and sleeps the exact `_msBeforeNext` window.
 *   - It then verifies: per resource type, `total` vs `inCompartment`, and
 *     exits non-zero when they disagree. A migration that reports success
 *     without re-reading the server is how the last one went unnoticed.
 *
 * Usage:
 *   npm run backfill:compartments                          # default org, all patients
 *   npm run backfill:compartments -- --org-key oc-gastrocare
 *   npm run backfill:compartments -- --org-id 698a6272-... --patient 52136807-...
 *   npm run backfill:compartments -- --verify-only
 *   npm run backfill:compartments -- --dry-run
 */
import { MedplumClient } from '@medplum/core';
import type { Bundle, Organization, Patient, Reference, Resource, ResourceType } from '@medplum/fhirtypes';
import { executeBatchWithRetry, MAX_BUNDLE_ENTRIES, updateEntry, withMedplum429Retry } from '../bots/shared/batch.ts';

/** Identifier system that `scripts/setup-tenancy.ts` keys clinics on. */
const ORG_IDENTIFIER_SYSTEM = 'https://lyfe.health/organization';

/**
 * Resource types that must travel with a chart.
 *
 * This is the same list the clinic AccessPolicy compartment-scopes in
 * `setup-tenancy.ts`. The two must stay in step: a type scoped by the policy
 * but missed here is a type the clinic cannot see.
 */
const RESOURCE_TYPES: ResourceType[] = [
  'Patient',
  'Observation',
  'DiagnosticReport',
  'Encounter',
  'Condition',
  'AllergyIntolerance',
  'MedicationRequest',
  'MedicationStatement',
  'DocumentReference',
  'Appointment',
  'Communication',
  'Task',
  'Immunization',
  'Procedure',
  'Coverage',
];

/** Safety valve: stop a drain loop that stops making progress. */
const MAX_DRAIN_ROUNDS_SLACK = 5;

/**
 * Read a `--flag value` pair from argv.
 * @param flag - Flag name without dashes.
 * @param fallback - Value to use when the flag is absent.
 * @returns The supplied value, or the fallback.
 */
function arg(flag: string, fallback: string): string {
  const i = process.argv.indexOf(`--${flag}`);
  const value = i >= 0 ? process.argv[i + 1] : undefined;
  return value ?? fallback;
}

/**
 * Test for a bare `--flag` in argv.
 * @param flag - Flag name without dashes.
 * @returns True when the flag is present.
 */
function hasFlag(flag: string): boolean {
  return process.argv.includes(`--${flag}`);
}

/**
 * Build the search fragment that selects one patient's slice of a resource type.
 *
 * `Patient` is its own compartment root, so it is selected by id; everything
 * else hangs off the `patient` search parameter, which all fifteen types above
 * support.
 * @param resourceType - The type being searched.
 * @param patientId - The patient whose chart is in scope.
 * @returns A query fragment with no leading `&`.
 */
function patientScope(resourceType: ResourceType, patientId: string): string {
  return resourceType === 'Patient' ? `_id=${patientId}` : `patient=Patient/${patientId}`;
}

/**
 * Count resources matching a search.
 * @param medplum - Authenticated client.
 * @param resourceType - The type to count.
 * @param query - Query fragment, without `_summary=count`.
 * @param label - Shown in the log line when a rate limit is waited out.
 * @returns The server's reported total.
 */
async function count(
  medplum: MedplumClient,
  resourceType: ResourceType,
  query: string,
  label: string
): Promise<number> {
  const result = await withMedplum429Retry(
    () => medplum.search(resourceType, `${query}&_summary=count`),
    `count ${label}`
  );
  return result.total ?? 0;
}

/**
 * Add the Organization to a resource's `meta.accounts`, leaving the rest alone.
 *
 * `meta.account` (singular, legacy) is only populated when it is empty, so an
 * existing primary account is never silently reassigned; the server derives it
 * from `accounts` otherwise.
 * @param resource - The resource as read from the server.
 * @param orgReference - Reference string, e.g. `Organization/abc`.
 * @returns A copy carrying the account, ready to PUT.
 */
function withAccount(resource: Resource, orgReference: string): Resource {
  const existing: Reference[] = resource.meta?.accounts ?? [];
  const accounts = [...existing.filter((a) => a.reference !== orgReference), { reference: orgReference }];
  return {
    ...resource,
    meta: { ...resource.meta, accounts, account: resource.meta?.account ?? { reference: orgReference } },
  };
}

/**
 * Fetch the next page of resources that are missing the Organization account.
 *
 * Asking the server for the complement (`_compartment:not`) rather than
 * filtering client-side is what makes the run resumable: the query result
 * shrinks as writes land, so the loop can simply re-ask from offset zero and a
 * re-run after a crash does no redundant work. Some deployments may not support
 * the modifier, so the caller can fall back to a client-side filter.
 * @param medplum - Authenticated client.
 * @param resourceType - The type to page.
 * @param scope - Patient-scoping query fragment.
 * @param orgReference - Reference string, e.g. `Organization/abc`.
 * @param pageSize - Maximum resources to return.
 * @returns The matching resources, oldest id first.
 */
async function fetchMissingPage(
  medplum: MedplumClient,
  resourceType: ResourceType,
  scope: string,
  orgReference: string,
  pageSize: number
): Promise<Resource[]> {
  const bundle: Bundle = await withMedplum429Retry(
    () => medplum.search(resourceType, `${scope}&_compartment:not=${orgReference}&_sort=_id&_count=${pageSize}`),
    `page ${resourceType}`
  );
  return (bundle.entry ?? []).map((e) => e.resource).filter((r): r is Resource => Boolean(r));
}

/**
 * Same as {@link fetchMissingPage}, but filtering client-side.
 *
 * Used only when the server rejects the `_compartment:not` modifier. Pages the
 * whole slice by id and keeps the resources that lack the account — correct but
 * far chattier, since already-correct resources are read on every re-run.
 * @param medplum - Authenticated client.
 * @param resourceType - The type to page.
 * @param scope - Patient-scoping query fragment.
 * @param orgReference - Reference string, e.g. `Organization/abc`.
 * @param pageSize - Maximum resources to return per request.
 * @returns Every resource in the slice that lacks the account.
 */
async function fetchMissingByScan(
  medplum: MedplumClient,
  resourceType: ResourceType,
  scope: string,
  orgReference: string,
  pageSize: number
): Promise<Resource[]> {
  const missing: Resource[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const bundle: Bundle = await withMedplum429Retry(
      () => medplum.search(resourceType, `${scope}&_sort=_id&_count=${pageSize}&_offset=${offset}`),
      `scan ${resourceType}`
    );
    const page = (bundle.entry ?? []).map((e) => e.resource).filter((r): r is Resource => Boolean(r));
    for (const resource of page) {
      if (!(resource.meta?.accounts ?? []).some((a) => a.reference === orgReference)) {
        missing.push(resource);
      }
    }
    if (page.length < pageSize) {
      return missing;
    }
  }
}

/** What one patient/type pass did. */
interface PassResult {
  /** Resources successfully written into the compartment. */
  wrote: number;
  /** Resources that were selected for a write but never settled 2xx. */
  failed: number;
}

/**
 * Move every out-of-compartment resource of one type, for one patient, into the
 * Organization compartment.
 *
 * Runs as a drain loop rather than offset paging: each round re-asks for the
 * first page of what is still missing. That is self-correcting (a write that
 * silently failed shows up again next round) and stops as soon as the server
 * says nothing is left.
 * @param medplum - Authenticated client.
 * @param resourceType - The type to migrate.
 * @param patientId - The patient whose chart is in scope.
 * @param orgReference - Reference string, e.g. `Organization/abc`.
 * @param options - Chunk size, dry-run switch, and whether the `:not` modifier works.
 * @param options.chunkSize - Resources per batch bundle.
 * @param options.dryRun - Report what would be written without writing.
 * @param options.useNotModifier - False to use the client-side scan fallback.
 * @returns Counts of written and failed resources.
 */
async function backfillType(
  medplum: MedplumClient,
  resourceType: ResourceType,
  patientId: string,
  orgReference: string,
  options: { chunkSize: number; dryRun: boolean; useNotModifier: boolean }
): Promise<PassResult> {
  const scope = patientScope(resourceType, patientId);
  const total = await count(medplum, resourceType, scope, `${resourceType} total`);
  if (total === 0) {
    return { wrote: 0, failed: 0 };
  }

  const maxRounds = Math.ceil(total / options.chunkSize) + MAX_DRAIN_ROUNDS_SLACK;
  let wrote = 0;
  let failed = 0;

  for (let round = 0; round < maxRounds; round++) {
    const missing = options.useNotModifier
      ? await fetchMissingPage(medplum, resourceType, scope, orgReference, options.chunkSize)
      : (await fetchMissingByScan(medplum, resourceType, scope, orgReference, options.chunkSize)).slice(
          0,
          options.chunkSize
        );
    if (missing.length === 0) {
      break;
    }
    if (options.dryRun) {
      console.log(`    ${resourceType}: would write ${missing.length} (of ${total})`);
      return { wrote: 0, failed: 0 };
    }

    const result = await executeBatchWithRetry(
      medplum,
      missing.map((resource) => updateEntry(withAccount(resource, orgReference))),
      { chunkSize: options.chunkSize, label: `backfill ${resourceType}` }
    );
    wrote += result.wrote;

    if (result.wrote === 0) {
      // Nothing settled: retrying the same page would spin forever.
      failed += missing.length;
      console.warn(`    ${resourceType}: stalled with ${missing.length} still outside the compartment`);
      break;
    }
    process.stdout.write(`    ${resourceType}: ${wrote}/${total}\r`);
  }

  // Counted with `_compartment=` rather than `_compartment:not=` so the summary
  // line is still correct on a deployment that lacks the modifier.
  const covered = await count(
    medplum,
    resourceType,
    `${scope}&_compartment=${orgReference}`,
    `${resourceType} covered`
  );
  const stillMissing = total - covered;
  if (wrote > 0 || stillMissing > 0) {
    console.log(`    ${resourceType}: ${covered}/${total} in compartment (wrote ${wrote})`);
  }
  return { wrote, failed: failed || stillMissing };
}

/** Per-resource-type coverage for the verification report. */
interface Coverage {
  /** Resource type being reported. */
  resourceType: ResourceType;
  /** Resources attached to the in-scope patients. */
  total: number;
  /** Of those, how many the Organization compartment can see. */
  inCompartment: number;
}

/**
 * Re-read the server and report coverage per resource type.
 *
 * Deliberately counted from the server rather than from what the write loop
 * believed it did, since an entry can report 2xx and still not be indexed the
 * way the AccessPolicy queries it.
 * @param medplum - Authenticated client.
 * @param patientIds - Patients in scope.
 * @param orgReference - Reference string, e.g. `Organization/abc`.
 * @returns One row per resource type, in the order of {@link RESOURCE_TYPES}.
 */
async function verify(medplum: MedplumClient, patientIds: string[], orgReference: string): Promise<Coverage[]> {
  const rows: Coverage[] = [];
  for (const resourceType of RESOURCE_TYPES) {
    let total = 0;
    let inCompartment = 0;
    for (const patientId of patientIds) {
      const scope = patientScope(resourceType, patientId);
      total += await count(medplum, resourceType, scope, `verify ${resourceType}`);
      inCompartment += await count(
        medplum,
        resourceType,
        `${scope}&_compartment=${orgReference}`,
        `verify scoped ${resourceType}`
      );
    }
    rows.push({ resourceType, total, inCompartment });
  }
  return rows;
}

/**
 * Collect the patients that belong to this Organization.
 *
 * Both the compartment and `managingOrganization` are consulted: a patient that
 * was created with the organization set but never enrolled would otherwise be
 * invisible to this script for exactly the reason it needs fixing.
 * @param medplum - Authenticated client.
 * @param org - The clinic.
 * @returns Deduplicated patient ids.
 */
async function findPatients(medplum: MedplumClient, org: Organization): Promise<string[]> {
  const orgReference = `Organization/${org.id}`;
  const queries = [`_compartment=${orgReference}&_count=1000`, `organization=${orgReference}&_count=1000`];
  const ids = new Set<string>();
  for (const query of queries) {
    const patients = await withMedplum429Retry(
      () => medplum.searchResources('Patient', `${query}&_fields=id`),
      'list patients'
    );
    for (const patient of patients as Patient[]) {
      if (patient.id) {
        ids.add(patient.id);
      }
    }
  }
  return [...ids];
}

async function main(): Promise<void> {
  const baseUrl = process.env.MEDPLUM_BASE_URL;
  const clientId = process.env.MEDPLUM_CLIENT_ID;
  const clientSecret = process.env.MEDPLUM_CLIENT_SECRET;
  if (!baseUrl || !clientId || !clientSecret) {
    throw new Error('MEDPLUM_BASE_URL, MEDPLUM_CLIENT_ID and MEDPLUM_CLIENT_SECRET are required');
  }

  const orgId = arg('org-id', '');
  const orgKey = arg('org-key', 'oc-gastrocare');
  const onlyPatient = arg('patient', '');
  const chunkSize = Number(arg('chunk', String(MAX_BUNDLE_ENTRIES)));
  const dryRun = hasFlag('dry-run');
  const verifyOnly = hasFlag('verify-only');

  const medplum = new MedplumClient({ baseUrl, fetch });
  await medplum.startClientLogin(clientId, clientSecret);
  console.log(`Project: ${medplum.getProject()?.name}`);

  const org = orgId
    ? await medplum.readResource('Organization', orgId)
    : await medplum.searchOne('Organization', `identifier=${ORG_IDENTIFIER_SYSTEM}|${orgKey}`);
  if (!org?.id) {
    throw new Error(`Organization not found (${orgId || `${ORG_IDENTIFIER_SYSTEM}|${orgKey}`})`);
  }
  const orgReference = `Organization/${org.id}`;
  console.log(`Organization: ${org.name} (${orgReference})`);

  const patientIds = onlyPatient ? [onlyPatient] : await findPatients(medplum, org);
  if (patientIds.length === 0) {
    throw new Error(`No patients found for ${orgReference}`);
  }
  console.log(`Patients in scope: ${patientIds.length}`);

  // Probe the modifier once rather than per type: if this deployment does not
  // support it, every type has to use the slower client-side scan.
  let useNotModifier = true;
  try {
    await medplum.search('Patient', `_compartment:not=${orgReference}&_summary=count`);
  } catch {
    useNotModifier = false;
    console.log('  note: server rejected _compartment:not — falling back to a client-side scan');
  }

  if (!verifyOnly) {
    let wrote = 0;
    let failed = 0;
    for (const patientId of patientIds) {
      console.log(`\n  Patient/${patientId}`);
      for (const resourceType of RESOURCE_TYPES) {
        const pass = await backfillType(medplum, resourceType, patientId, orgReference, {
          chunkSize,
          dryRun,
          useNotModifier,
        });
        wrote += pass.wrote;
        failed += pass.failed;
      }
    }
    console.log(`\nWrote ${wrote} resource(s) into ${orgReference}${failed > 0 ? `, ${failed} still missing` : ''}`);
  }

  console.log('\nVerification');
  console.log(`  ${'resourceType'.padEnd(22)} ${'total'.padStart(7)} ${'inCompartment'.padStart(14)}`);
  const rows = await verify(medplum, patientIds, orgReference);
  let mismatched = 0;
  for (const row of rows) {
    const ok = row.total === row.inCompartment;
    if (!ok) {
      mismatched++;
    }
    console.log(
      `  ${row.resourceType.padEnd(22)} ${String(row.total).padStart(7)} ${String(row.inCompartment).padStart(14)}` +
        `  ${ok ? 'ok' : 'MISMATCH'}`
    );
  }

  if (mismatched > 0) {
    throw new Error(`${mismatched} resource type(s) are not fully in ${orgReference}`);
  }
  console.log(`\nAll ${rows.length} resource types fully in ${orgReference}.`);
}

main().catch((err) => {
  console.error('Backfill failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
