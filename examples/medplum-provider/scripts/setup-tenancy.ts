// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
/**
 * Set up Organization-in-Project multi-tenancy.
 *
 * One Medplum Project holds every clinic; each clinic is an Organization, and
 * isolation comes from compartments rather than from remembering to filter by
 * organization in each query. That distinction is the point: in the Prisma
 * design this replaces, a missed `organizationId` filter silently returned
 * another clinic's data, which is a bug class the server can rule out here.
 *
 * Idempotent — safe to re-run.
 *
 * Usage:
 *   npm run setup:tenancy -- --org-name "OC GastroCare" --org-key oc-gastrocare
 */
import { createReference, getReferenceString, MedplumClient } from '@medplum/core';
import type { AccessPolicy, Organization, Parameters, Patient } from '@medplum/fhirtypes';

const ORG_IDENTIFIER_SYSTEM = 'https://lyfe.health/organization';
const POLICY_NAME = 'Lyfe Clinic Access Policy';

/**
 * Resources a clinic user may touch, each confined to their own compartment.
 * Anything absent is denied: Medplum access policies are allow-lists, which is
 * what keeps integration credentials unreadable by ordinary users.
 */
const COMPARTMENT_SCOPED = [
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

/**
 * Sleep out a Medplum 429 and retry.
 *
 * `$set-accounts` with propagate touches every resource in a patient's
 * compartment, which for a synced chart is thousands of writes and will exhaust
 * the rate limit. Medplum reports exactly how long to wait in `_msBeforeNext`,
 * so honour that rather than guessing a backoff.
 * @param fn - The operation to run.
 * @param label - Shown in the log line when a retry happens.
 * @returns The operation's result.
 */
async function withRateLimitRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  const MAX_ATTEMPTS = 6;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isRateLimit = /Too Many Requests|429/i.test(message);
      if (!isRateLimit || attempt === MAX_ATTEMPTS) {
        throw err;
      }
      const match = /_msBeforeNext"?\s*:\s*(\d+)/.exec(message);
      const waitMs = Math.min(60_000, (match ? Number(match[1]) : 30_000) + 1000);
      console.log(
        `    rate limited on ${label}, waiting ${Math.ceil(waitMs / 1000)}s (attempt ${attempt}/${MAX_ATTEMPTS})`
      );
      await new Promise((resolve) => {
        setTimeout(resolve, waitMs);
      });
    }
  }
}

/**
 * Read a `--flag value` pair from argv.
 * @param flag - Flag name without dashes.
 * @param fallback - Value to use when the flag is absent.
 * @returns The supplied or fallback value.
 */
function arg(flag: string, fallback: string): string {
  const i = process.argv.indexOf(`--${flag}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function main(): Promise<void> {
  const baseUrl = process.env.MEDPLUM_BASE_URL;
  const clientId = process.env.MEDPLUM_CLIENT_ID;
  const clientSecret = process.env.MEDPLUM_CLIENT_SECRET;
  if (!baseUrl || !clientId || !clientSecret) {
    throw new Error('MEDPLUM_BASE_URL, MEDPLUM_CLIENT_ID and MEDPLUM_CLIENT_SECRET are required');
  }

  const orgName = arg('org-name', 'OC GastroCare');
  const orgKey = arg('org-key', 'oc-gastrocare');

  const medplum = new MedplumClient({ baseUrl, fetch });
  await medplum.startClientLogin(clientId, clientSecret);
  console.log(`Project: ${medplum.getProject()?.name}`);

  // 1. The clinic itself.
  let org = await withRateLimitRetry(
    () => medplum.searchOne('Organization', `identifier=${ORG_IDENTIFIER_SYSTEM}|${orgKey}`),
    'find organization'
  );
  if (org) {
    console.log(`  organization exists: ${orgName} (${org.id})`);
  } else {
    org = await withRateLimitRetry(
      () =>
        medplum.createResource<Organization>({
          resourceType: 'Organization',
          identifier: [{ system: ORG_IDENTIFIER_SYSTEM, value: orgKey }],
          name: orgName,
          active: true,
        }),
      'create organization'
    );
    console.log(`  organization created: ${orgName} (${org.id})`);
  }

  // 2. The access policy every clinic user is bound to. `%organization` is
  //    filled in per user by their ProjectMembership, so one policy serves all
  //    clinics rather than one policy per clinic drifting apart.
  const policyBody: AccessPolicy = {
    resourceType: 'AccessPolicy',
    name: POLICY_NAME,
    compartment: { reference: '%organization' },
    resource: [
      { resourceType: 'Organization', readonly: true },
      { resourceType: 'Practitioner', readonly: true },
      { resourceType: 'PractitionerRole', readonly: true },
      // `Bot/$execute` first reads the Bot **as the caller**, so a policy that
      // omits Bot makes every bot in the app answer 403 for clinic users — with
      // no hint that the access policy, not the bot, is what refused. Read-only
      // is enough: executing does not require write access, and the bot's own
      // membership supplies whatever the bot itself needs.
      { resourceType: 'Bot', readonly: true },
      ...COMPARTMENT_SCOPED.map((resourceType) => ({
        resourceType,
        criteria: `${resourceType}?_compartment=%organization`,
      })),
    ],
  };

  const existingPolicy = await withRateLimitRetry(
    () => medplum.searchOne('AccessPolicy', `name=${encodeURIComponent(POLICY_NAME)}`),
    'find access policy'
  );
  const policy = await withRateLimitRetry(
    () =>
      existingPolicy
        ? medplum.updateResource<AccessPolicy>({ ...existingPolicy, ...policyBody })
        : medplum.createResource<AccessPolicy>(policyBody),
    'save access policy'
  );
  console.log(`  access policy ${existingPolicy ? 'updated' : 'created'}: ${policy.id}`);

  // 3. Backfill existing patients into the clinic's compartment. `propagate`
  //    carries the account onto every resource in the patient compartment, so
  //    a chart's observations and documents move with it rather than being
  //    left unreachable behind the new policy.
  const orgReference = getReferenceString(org);
  const patients = await withRateLimitRetry(() => medplum.searchResources('Patient', '_count=1000'), 'list patients');
  let enrolled = 0;
  let already = 0;

  for (const patient of patients as Patient[]) {
    const accounts = patient.meta?.accounts ?? [];
    const hasOrg = accounts.some((a) => a.reference === orgReference);

    // The patient carrying the account does NOT mean its compartment does. A
    // propagate that is cut short leaves the chart's observations and documents
    // outside the compartment, where the access policy makes them invisible —
    // and a patient-level check would call that "already enrolled" and skip it
    // forever. So verify against a resource that actually travels with the
    // chart, and re-propagate whenever it disagrees.
    const label = patient.name?.[0]?.family ?? patient.id;
    const total = (
      await withRateLimitRetry(
        () => medplum.search('Observation', `patient=Patient/${patient.id}&_summary=count`),
        `count ${label}`
      )
    ).total;
    const inCompartment = (
      await withRateLimitRetry(
        () =>
          medplum.search('Observation', `patient=Patient/${patient.id}&_compartment=${orgReference}&_summary=count`),
        `count scoped ${label}`
      )
    ).total;

    if (hasOrg && total === inCompartment) {
      already++;
      continue;
    }

    const parameters: Parameters = {
      resourceType: 'Parameters',
      parameter: [
        ...accounts
          .filter((a) => a.reference !== orgReference)
          .map((account) => ({ name: 'accounts', valueReference: { reference: account.reference } })),
        { name: 'accounts', valueReference: createReference(org) },
      ],
    };

    // Run server-side as an AsyncJob. Propagating a synced chart is thousands of
    // writes, which exhausts the rate limit if it runs inside this request.
    process.stdout.write(`  enrolling ${label} (${total} observations)… `);
    // Patient-level account only — deliberately NOT `propagate: true`.
    //
    // $set-accounts with propagate performs thousands of individual server-side
    // writes and dies on the rate limiter for any real chart (three AsyncJobs
    // failed here with "code":"throttled" before this was changed). The chart's
    // other resources are moved by `npm run backfill:compartments`, which does
    // the same job in batch bundles of 200 and is resumable.
    await withRateLimitRetry(
      () => medplum.post(`fhir/R4/Patient/${patient.id}/$set-accounts`, parameters),
      `enrol ${label}`
    );
    console.log('done (chart resources: run backfill:compartments)');
    enrolled++;
  }

  console.log(`\nDone. ${enrolled} patient(s) enrolled, ${already} already in ${orgName}.`);
  console.log('Next: npm run backfill:compartments  (moves chart resources into the compartment)');
}

main().catch((err) => {
  console.error('Setup failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
