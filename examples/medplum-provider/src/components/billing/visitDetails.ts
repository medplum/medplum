// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, PatchOperation, WithId } from '@medplum/core';
import { getReferenceString } from '@medplum/core';
import type {
  Claim,
  ClaimResponse,
  Coding,
  Encounter,
  Location,
  Organization,
  Patient,
  PaymentReconciliation,
  Practitioner,
  Reference,
} from '@medplum/fhirtypes';
import { getClaimEncounter } from './claimConditions';
import { isClaimEditable } from './claimStatus';

/**
 * A change to a visit's details. Each field left out is unchanged; `null` clears it. Check in and check out live on the
 * encounter alone, so every claim for the visit already shares them.
 */
export interface VisitDetailsChange {
  readonly practitioner?: Reference<Practitioner>;
  readonly billingOrganization?: Reference<Organization> | null;
  readonly facility?: Reference<Location> | null;
  /** The CMS place of service, which each claim line carries. */
  readonly placeOfService?: Coding | null;
}

/**
 * Applies a visit-details change to a claim: the practitioner renders (first care team member), the billing
 * organization bills (the provider, else the practitioner), and the facility is the service facility.
 * @param claim - The claim.
 * @param change - The change.
 * @returns The claim with the change applied.
 */
export function applyVisitDetails(claim: Claim, change: VisitDetailsChange): Claim {
  const result: Claim = { ...claim };
  const [first, ...rest] = claim.careTeam ?? [];
  if (change.practitioner) {
    result.careTeam = [{ ...first, sequence: first?.sequence ?? 1, provider: change.practitioner }, ...rest];
  }
  const practitioner = change.practitioner ?? first?.provider ?? claim.provider;
  const current = claim.provider.reference?.startsWith('Organization/') ? claim.provider : undefined;
  const organization = change.billingOrganization === undefined ? current : (change.billingOrganization ?? undefined);
  result.provider = organization ?? practitioner;
  if (change.facility !== undefined) {
    result.facility = change.facility ?? undefined;
  }
  if (change.placeOfService !== undefined) {
    const place = change.placeOfService;
    result.item = claim.item?.map(({ locationCodeableConcept: _, ...item }) =>
      place ? { ...item, locationCodeableConcept: { coding: [place] } } : item
    );
  }
  return result;
}

/**
 * The visit's practitioner and facility as encounter patches, matching the visit's own Visit Details panel.
 * @param encounter - The visit's encounter.
 * @param change - The change.
 * @returns The patch operations; empty when nothing on the encounter changes.
 */
export function getEncounterVisitPatch(encounter: Encounter, change: VisitDetailsChange): PatchOperation[] {
  const ops: PatchOperation[] = [];
  if (change.practitioner && encounter.participant?.[0]?.individual?.reference !== change.practitioner.reference) {
    ops.push({ op: 'add', path: '/participant', value: [{ individual: change.practitioner }] });
  }
  if (change.facility && encounter.location?.[0]?.location?.reference !== change.facility.reference) {
    ops.push({ op: 'add', path: '/location', value: [{ location: change.facility }] });
  } else if (change.facility === null && encounter.location) {
    ops.push({ op: 'remove', path: '/location' });
  }
  return ops;
}

/** A claim for a visit, with its claim responses, oldest first. */
export interface VisitClaim {
  readonly claim: WithId<Claim>;
  readonly responses: WithId<ClaimResponse>[];
}

/**
 * Finds every claim for a visit: its own claim and any related claims made from it, oldest first. With `claim`, also
 * finds the claims it's related to either way, for a claim that lost its visit link.
 *
 * Every search brings the claims' responses with it. Claims with lines on the visit come from an encounter search and
 * the claims `claim` links to by id. A related claim with no lines yet can only be found among the patient's claims,
 * but it's always created after the claim it links to, so that search starts at the earliest date that could hold one:
 * `claim`'s own creation (run alongside the others), then, only if a claim it links to is older, the gap before it.
 * Without `claim`, it starts at the visit's start or its earliest claim.
 * @param medplum - The Medplum client.
 * @param patient - The visit's patient.
 * @param encounter - The visit's encounter, if known.
 * @param claim - A claim whose related claims to include.
 * @param claim.id - The claim's id, to find claims that link to it.
 * @param claim.created - When the claim was created.
 * @param claim.related - The references of the claims it links to.
 * @returns The visit's claims with their responses.
 */
export async function findVisitClaims(
  medplum: MedplumClient,
  patient: Reference<Patient>,
  encounter: Reference<Encounter> | undefined,
  claim?: { readonly id?: string; readonly created?: string; readonly related?: readonly string[] }
): Promise<VisitClaim[]> {
  const linked = new Set(claim?.related);
  const linkedIds = [...linked].map((r) => r.split('/')[1]).filter(Boolean);
  const byPatient = (created: string[]): Promise<ClaimsWithResponses> =>
    searchClaimsWithResponses(medplum, {
      patient: patient.reference ?? '',
      ...(created.length ? { created } : {}),
      _count: '1000',
    });
  const claimDay = toDay(claim?.created);

  const [onVisit, linkedClaims, recent, visit] = await Promise.all([
    encounter?.reference ? searchClaimsWithResponses(medplum, { encounter: encounter.reference }) : EMPTY,
    linkedIds.length ? searchClaimsWithResponses(medplum, { _id: linkedIds.join(',') }) : EMPTY,
    claimDay ? byPatient([`ge${claimDay}`]) : EMPTY,
    !claimDay && encounter?.reference ? medplum.readReference(encounter).catch(() => undefined) : undefined,
  ]);
  const found = [onVisit, linkedClaims, recent];

  const since = toDay(
    earliest([visit?.period?.start, ...[...onVisit.claims, ...linkedClaims.claims].map((c) => c.created)])
  );
  if (!claimDay) {
    // Without a claim or a date to start from, look through all the patient's claims.
    found.push(await byPatient(since ? [`ge${since}`] : []));
  } else if (since && since < claimDay) {
    found.push(await byPatient([`ge${since}`, `lt${claimDay}`]));
  }

  const self = claim?.id ? `Claim/${claim.id}` : undefined;
  const belongs = (c: WithId<Claim>): boolean =>
    c.id === claim?.id ||
    linked.has(getReferenceString(c)) ||
    (!!encounter?.reference && getClaimEncounter(c)?.reference === encounter.reference) ||
    !!c.related?.some((r) => !!r.claim?.reference && (r.claim.reference === self || linked.has(r.claim.reference)));
  const claims = new Map<string, WithId<Claim>>();
  const responses = new Map<string, WithId<ClaimResponse>>();
  for (const result of found) {
    result.claims.filter((c) => c.status !== 'entered-in-error' && belongs(c)).forEach((c) => claims.set(c.id, c));
    result.responses.forEach((r) => responses.set(r.id, r));
  }
  const sortedResponses = [...responses.values()].sort((a, b) =>
    (a.meta?.lastUpdated ?? '').localeCompare(b.meta?.lastUpdated ?? '')
  );
  return [...claims.values()]
    .sort((a, b) => (a.created ?? '').localeCompare(b.created ?? ''))
    .map((c) => ({
      claim: c,
      responses: sortedResponses.filter((r) => r.request?.reference === getReferenceString(c)),
    }));
}

interface ClaimsWithResponses {
  readonly claims: WithId<Claim>[];
  readonly responses: WithId<ClaimResponse>[];
}

const EMPTY: ClaimsWithResponses = { claims: [], responses: [] };

/**
 * Searches claims and brings their responses in the same request.
 * @param medplum - The Medplum client.
 * @param params - The Claim search parameters.
 * @returns The matching claims and their responses.
 */
async function searchClaimsWithResponses(
  medplum: MedplumClient,
  params: Record<string, string | string[]>
): Promise<ClaimsWithResponses> {
  // Repeated, not comma-joined: `created=ge…&created=lt…` is a range, `created=ge…,lt…` isn't.
  const query = new URLSearchParams({ _revinclude: 'ClaimResponse:request' });
  for (const [key, value] of Object.entries(params)) {
    (Array.isArray(value) ? value : [value]).forEach((v) => query.append(key, v));
  }
  const bundle = await medplum.search('Claim', query, { cache: 'no-cache' });
  const result = { claims: [] as WithId<Claim>[], responses: [] as WithId<ClaimResponse>[] };
  for (const entry of bundle.entry ?? []) {
    const resource = entry.resource as WithId<Claim> | WithId<ClaimResponse> | undefined;
    if (resource?.resourceType === 'Claim') {
      result.claims.push(resource);
    } else if (resource?.resourceType === 'ClaimResponse') {
      result.responses.push(resource);
    }
  }
  return result;
}

function toDay(date: string | undefined): string | undefined {
  return date ? earliest([date]) : undefined;
}

/**
 * The earliest of some dates, as a date for a `ge` search.
 * @param dates - FHIR dates or date-times.
 * @returns The earliest day, e.g. "2026-10-02", if any are given.
 */
function earliest(dates: (string | undefined)[]): string | undefined {
  const times = dates
    .filter((d): d is string => !!d)
    .map((d) => new Date(d).getTime())
    .filter((t) => !isNaN(t));
  return times.length ? new Date(Math.min(...times)).toISOString().slice(0, 10) : undefined;
}

/**
 * Finds the claims for a visit that can still change: its own claim and any related claims, before they're submitted.
 * @param medplum - The Medplum client.
 * @param patient - The visit's patient.
 * @param encounter - The visit's encounter.
 * @returns The visit's editable claims.
 */
export async function findEditableVisitClaims(
  medplum: MedplumClient,
  patient: Reference<Patient>,
  encounter: Reference<Encounter>
): Promise<WithId<Claim>[]> {
  return (await findVisitClaims(medplum, patient, encounter))
    .filter(({ claim, responses }) => claim.status !== 'cancelled' && isClaimEditable(claim, responses))
    .map(({ claim }) => claim);
}

/**
 * Shares a visit-details change with the visit and every claim for it that can still change, so the visit and its
 * related claims never disagree. Submitted claims keep what they were sent with.
 * @param medplum - The Medplum client.
 * @param patient - The visit's patient.
 * @param encounterRef - The visit's encounter.
 * @param change - The change.
 * @param options - What to leave out.
 * @param options.skipEncounter - Leave the encounter alone, when the caller saves it itself.
 * @param options.skipClaimId - Leave this claim alone, when the caller saves it itself.
 */
export async function syncVisitDetails(
  medplum: MedplumClient,
  patient: Reference<Patient>,
  encounterRef: Reference<Encounter>,
  change: VisitDetailsChange,
  options: { readonly skipEncounter?: boolean; readonly skipClaimId?: string } = {}
): Promise<void> {
  const saves: Promise<unknown>[] = [];
  if (!options.skipEncounter) {
    const encounter = await medplum.readReference(encounterRef);
    const ops = getEncounterVisitPatch(encounter, change);
    if (ops.length) {
      saves.push(medplum.patchResource('Encounter', encounter.id, ops));
    }
  }
  for (const claim of await findEditableVisitClaims(medplum, patient, encounterRef)) {
    if (claim.id === options.skipClaimId) {
      continue;
    }
    const next = applyVisitDetails(claim, change);
    if (JSON.stringify(next) !== JSON.stringify(claim)) {
      saves.push(medplum.updateResource(next));
    }
  }
  await Promise.all(saves);
}

/**
 * Finds the remittances that pay any of the given claims. A remittance names its claims only in `detail.request`, which
 * has no search parameter, so this reads the most recent remittances and keeps the ones that name a claim.
 * @param medplum - The Medplum client.
 * @param claimIds - The claim IDs.
 * @returns The remittances, newest first.
 */
export async function findClaimRemittances(
  medplum: MedplumClient,
  claimIds: string[]
): Promise<WithId<PaymentReconciliation>[]> {
  if (!claimIds.length) {
    return [];
  }
  const refs = new Set(claimIds.map((id) => `Claim/${id}`));
  const recent = await medplum.searchResources(
    'PaymentReconciliation',
    { _sort: '-created', _count: '200' },
    { cache: 'no-cache' }
  );
  return recent.filter((r) => r.detail?.some((d) => refs.has(d.request?.reference ?? '')));
}
