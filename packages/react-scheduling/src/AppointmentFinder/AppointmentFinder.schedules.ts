// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, WithId } from '@medplum/core';
import { getDisplayString, getReferenceString, isDefined, serviceTypeIncludesService } from '@medplum/core';
import type {
  CodeableConcept,
  Coding,
  HealthcareService,
  Location,
  Reference,
  Resource,
  Schedule,
} from '@medplum/fhirtypes';
import type { SchedulingActor, SchedulingActorType, SchedulingRole } from './AppointmentFinder.roles';
import { ROLE_LABELS, SCHEDULING_ROLES, getSchedulingRole, isSchedulingActorType } from './AppointmentFinder.roles';
import { getActorsKey } from './AppointmentFinder.times';

/**
 * Roles that must be chosen before a search can run.
 *
 * Rooms and devices are left optional: a service may have room schedules
 * configured without every booking needing to hold one.
 */
const REQUIRED_ROLES: ReadonlySet<SchedulingRole> = new Set(['provider']);

/** A Schedule that can be booked for a service, paired with the actor it belongs to. */
export interface ScheduleCandidate {
  readonly schedule: WithId<Schedule>;
  /** The schedule's only actor. `$find` rejects schedules with more than one. */
  readonly actor: SchedulingActor;
  readonly actorType: SchedulingActorType;
  readonly role: SchedulingRole;
  /** A human-readable name for the actor, for use in plain-text option lists. */
  readonly actorDisplay: string;
  /**
   * Codings saying what kind of thing the actor is, for narrowing a long list of
   * them down. Empty for actors that carry nothing to narrow by.
   */
  readonly qualifiers: readonly Coding[];
  /**
   * The actor itself, when the search was able to include it. Timezone
   * resolution falls back to the actor's `timezone` extension, so without this
   * a schedule that relies on that fallback would be read in the wrong zone.
   */
  readonly actorResource: WithId<Resource> | undefined;
}

/** Candidates that fill the same role, offered together as one question. */
export interface ScheduleCandidateGroup {
  readonly role: SchedulingRole;
  readonly label: string;
  /** Whether a search can run without one of these being chosen. */
  readonly required: boolean;
  readonly candidates: readonly ScheduleCandidate[];
}

/**
 * Chosen schedule ids per role.
 *
 * Everything chosen attends: `$find` intersects the schedules it is given, so
 * two providers and a room describe one appointment they are all free for,
 * rather than a choice between them.
 */
export type ActorSelections = Partial<Record<SchedulingRole, readonly string[]>>;

export interface SearchEligibleSchedulesOptions {
  readonly signal?: AbortSignal;
  /** Maximum schedules to consider per service type code. Defaults to 100. */
  readonly count?: number;
}

/**
 * Finds the Schedules that can be booked for a HealthcareService.
 *
 * No search parameter indexes the `service-type-reference` extension that
 * actually links a Schedule to a service, so this searches on the service type
 * codings the two share and then confirms the link client-side. A service with
 * no codings at all cannot be narrowed that way, so its schedules are read and
 * filtered instead.
 *
 * @param medplum - The Medplum client.
 * @param service - The HealthcareService being booked.
 * @param options - Abort signal and page size.
 * @returns Every schedule bookable for the service, each with its actor.
 */
export async function searchEligibleSchedules(
  medplum: MedplumClient,
  service: WithId<HealthcareService>,
  options?: SearchEligibleSchedulesOptions
): Promise<ScheduleCandidate[]> {
  const count = (options?.count ?? 100).toString();
  const tokens = getServiceTypeTokens(service);
  const searches = tokens.length > 0 ? tokens.map((token) => ({ 'service-type': token })) : [{}];

  const bundles = await Promise.all(
    searches.map(async (criteria) =>
      medplum.search(
        'Schedule',
        { ...criteria, _count: count, _include: 'Schedule:actor' },
        { signal: options?.signal }
      )
    )
  );

  // `_include` results are merged across searches first, so a schedule found by
  // one token can still name its actor using another search's included copy.
  const actorsByReference = new Map<string, WithId<Resource>>();
  const schedules = new Map<string, WithId<Schedule>>();

  for (const bundle of bundles) {
    for (const entry of bundle.entry ?? []) {
      const resource = entry.resource as WithId<Resource> | undefined;
      if (!resource?.id) {
        continue;
      }
      if (entry.search?.mode === 'include') {
        actorsByReference.set(`${resource.resourceType}/${resource.id}`, resource);
      } else if (resource.resourceType === 'Schedule') {
        schedules.set(resource.id, resource);
      }
    }
  }

  return [...schedules.values()]
    .map((schedule) => toScheduleCandidate(schedule, service, actorsByReference))
    .filter(isDefined)
    .sort((left, right) => left.actorDisplay.localeCompare(right.actorDisplay));
}

function getServiceTypeTokens(service: HealthcareService): string[] {
  const tokens = (service.type ?? [])
    .flatMap((concept) => concept.coding ?? [])
    .filter((coding) => coding.code)
    .map((coding) => (coding.system ? `${coding.system}|${coding.code}` : (coding.code as string)));
  return [...new Set(tokens)];
}

function toScheduleCandidate(
  schedule: WithId<Schedule>,
  service: WithId<HealthcareService>,
  actors: Map<string, WithId<Resource>>
): ScheduleCandidate | undefined {
  if (schedule.active === false || !serviceTypeIncludesService(schedule.serviceType, service)) {
    return undefined;
  }

  // `$find` errors on schedules with anything other than a single actor, so
  // offering them would only produce a request that cannot succeed.
  if (schedule.actor.length !== 1) {
    return undefined;
  }

  const actor = schedule.actor[0];
  const reference = actor.reference;
  const actorType = reference?.split('/')[0];
  if (!reference || !isSchedulingActorType(actorType)) {
    return undefined;
  }

  const actorResource = actors.get(reference);

  return {
    schedule,
    actor,
    actorType,
    role: getSchedulingRole(actorType),
    actorDisplay: actor.display ?? (actorResource && getDisplayString(actorResource)) ?? reference,
    qualifiers: getActorQualifiers(actorResource),
    actorResource,
  };
}

/**
 * Reads the codings that say what kind of thing an actor is.
 *
 * A PractitionerRole states the role it holds and the specialties it practises,
 * and rooms and devices state their type. A plain Practitioner states none of
 * this in R4 — a surgeon and an anesthesiologist are both just practitioners —
 * so actors modelled that way cannot be told apart here.
 *
 * @param actor - The resolved actor, if the search was able to include it.
 * @returns The codings found, in a stable order, or an empty array.
 */
export function getActorQualifiers(actor: Resource | undefined): Coding[] {
  if (!actor) {
    return [];
  }
  let concepts: (CodeableConcept | undefined)[];
  switch (actor.resourceType) {
    case 'PractitionerRole':
      concepts = [...(actor.code ?? []), ...(actor.specialty ?? [])];
      break;
    case 'Location':
      concepts = actor.type ?? [];
      break;
    case 'Device':
      concepts = [actor.type];
      break;
    default:
      return [];
  }

  const seen = new Map<string, Coding>();
  for (const coding of concepts.flatMap((concept) => concept?.coding ?? [])) {
    const key = getQualifierKey(coding);
    if (key && !seen.has(key)) {
      seen.set(key, coding);
    }
  }
  return [...seen.values()];
}

/**
 * Returns the key a qualifier coding is identified by.
 * @param coding - The coding to key.
 * @returns `system|code`, or undefined for a coding with no code.
 */
export function getQualifierKey(coding: Coding): string | undefined {
  return coding.code ? `${coding.system ?? ''}|${coding.code}` : undefined;
}

/**
 * Names the qualifiers an actor carries, for matching what a user types.
 *
 * @param candidate - The candidate to describe.
 * @returns The display names of its codings, in a stable order.
 */
export function getQualifierLabels(candidate: ScheduleCandidate): string[] {
  const labels: string[] = [];
  for (const coding of candidate.qualifiers) {
    const label = coding.display ?? coding.code;
    if (label && !labels.includes(label)) {
      labels.push(label);
    }
  }
  return labels;
}

/**
 * Reports whether a candidate matches a typed search.
 *
 * The qualifiers are searched along with the name, so a long list of
 * practitioners can be narrowed by typing what is wanted from them rather than
 * by who they are.
 *
 * @param candidate - The candidate to test.
 * @param query - What the user typed. Empty matches everything.
 * @returns Whether to offer the candidate.
 */
export function candidateMatchesQuery(candidate: ScheduleCandidate, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  return [candidate.actorDisplay, ...getQualifierLabels(candidate)].join(' ').toLowerCase().includes(needle);
}

/** How far up a `partOf` chain of Locations to look. */
const MAX_LOCATION_DEPTH = 4;

export interface FilterRoomsOptions {
  readonly signal?: AbortSignal;
}

/**
 * Narrows candidates to the ones available at one clinic.
 *
 * Each role says where it is in its own way. A room is a Location `partOf` the
 * site holding it, so it counts when the clinic is somewhere above it — directly,
 * or through a floor or wing in between. A device says where it is kept in
 * `Device.location`. A practitioner says where they may work in
 * `PractitionerRole.location`, which is also where licensure by state or
 * jurisdiction lives, so a role counts when any of its locations is the clinic, a
 * site the clinic sits inside, or somewhere inside the clinic in turn.
 *
 * A candidate that says nothing about where it is, or whose ancestry cannot be
 * read, is kept: hiding something the caller may be entitled to book is worse
 * than offering something at the wrong site, which the names themselves tend to
 * make obvious. A plain Practitioner actor carries no location at all, so it is
 * always kept.
 *
 * Sites are matched through `Location.partOf`. A licensure model that instead
 * marks jurisdictions with identifiers has no chain to follow, so the roles it
 * describes are only kept when the clinic is named on them directly. Deciding who
 * may be booked from licensure belongs upstream of this, in the schedules the
 * caller offers at all.
 *
 * @param medplum - The Medplum client.
 * @param candidates - Candidates to narrow.
 * @param clinic - The site being booked at, or undefined to keep everything.
 * @param options - Abort signal.
 * @returns The candidates, minus the ones sited elsewhere.
 */
export async function filterCandidatesByClinic(
  medplum: MedplumClient,
  candidates: readonly ScheduleCandidate[],
  clinic: Reference<Location> | WithId<Location> | undefined,
  options?: FilterRoomsOptions
): Promise<ScheduleCandidate[]> {
  const clinicReference = clinic && getReferenceString(clinic);
  if (!clinicReference) {
    return [...candidates];
  }

  const resolved = new Map<string, Location | undefined>();
  // The sites the clinic sits inside, so a role licensed for a whole state
  // covers the clinics within it.
  const ancestry = await getLocationAncestry(medplum, clinicReference, resolved, options);
  const keep: ScheduleCandidate[] = [];

  for (const candidate of candidates) {
    if (await isCandidateAtClinic(medplum, candidate, clinicReference, ancestry, resolved, options)) {
      keep.push(candidate);
    }
  }

  return keep;
}

async function isCandidateAtClinic(
  medplum: MedplumClient,
  candidate: ScheduleCandidate,
  clinicReference: string,
  ancestry: ReadonlySet<string>,
  resolved: Map<string, Location | undefined>,
  options: FilterRoomsOptions | undefined
): Promise<boolean> {
  if (candidate.role === 'room') {
    return isLocationWithinClinic(
      medplum,
      candidate.actor.reference,
      clinicReference,
      resolved,
      options,
      candidate.actorResource as Location | undefined
    );
  }

  const actor = candidate.actorResource;
  if (actor?.resourceType === 'Device') {
    return isLocationWithinClinic(medplum, actor.location?.reference, clinicReference, resolved, options);
  }
  if (actor?.resourceType === 'PractitionerRole' && actor.location?.length) {
    for (const location of actor.location) {
      // A role's location counts whether the clinic sits inside it or it sits
      // inside the clinic. The first is licensure: a role held for a whole state
      // covers the clinics within it, which the ancestry answers. The second is a
      // role attached to a room or a department, which needs the same `partOf`
      // climb a room candidate gets, and which brings with it the same leniency
      // for a chain that cannot be read.
      if (location.reference && ancestry.has(location.reference)) {
        return true;
      }
      if (await isLocationWithinClinic(medplum, location.reference, clinicReference, resolved, options)) {
        return true;
      }
    }
    return false;
  }

  return true;
}

/**
 * Walks up from a Location to the clinic being booked at.
 * @param medplum - The Medplum client.
 * @param reference - The Location to start from, or undefined to say nothing.
 * @param clinicReference - The clinic being looked for.
 * @param resolved - Locations already read, to save reading them again.
 * @param options - Abort signal.
 * @param included - The starting Location, when a search already returned it.
 * @returns Whether the clinic is at or above the Location, or unknowable.
 */
async function isLocationWithinClinic(
  medplum: MedplumClient,
  reference: string | undefined,
  clinicReference: string,
  resolved: Map<string, Location | undefined>,
  options: FilterRoomsOptions | undefined,
  included?: Location
): Promise<boolean> {
  if (!reference) {
    return true;
  }

  let current: string = reference;
  let resource = included;

  for (let depth = 0; depth < MAX_LOCATION_DEPTH; depth++) {
    if (current === clinicReference) {
      return true;
    }
    const location = resource ?? (await readLocation(medplum, current, resolved, options));
    if (!location) {
      return true;
    }
    const parent = location.partOf?.reference;
    if (!parent) {
      // The chain ends above this Location without passing through the clinic.
      return false;
    }
    current = parent;
    resource = undefined;
  }

  // Deeper than we look. Treat it as unverifiable rather than excluded.
  return true;
}

async function getLocationAncestry(
  medplum: MedplumClient,
  clinicReference: string,
  resolved: Map<string, Location | undefined>,
  options: FilterRoomsOptions | undefined
): Promise<Set<string>> {
  const ancestry = new Set<string>();
  let reference: string | undefined = clinicReference;

  for (let depth = 0; depth < MAX_LOCATION_DEPTH && reference; depth++) {
    ancestry.add(reference);
    const location = await readLocation(medplum, reference, resolved, options);
    reference = location?.partOf?.reference;
  }

  return ancestry;
}

async function readLocation(
  medplum: MedplumClient,
  reference: string,
  resolved: Map<string, Location | undefined>,
  options: FilterRoomsOptions | undefined
): Promise<Location | undefined> {
  if (resolved.has(reference)) {
    return resolved.get(reference);
  }
  let location: Location | undefined;
  try {
    location = await medplum.readReference<Location>({ reference }, { signal: options?.signal });
  } catch {
    // Unreadable, so its ancestry is unknown.
    location = undefined;
  }
  resolved.set(reference, location);
  return location;
}

/**
 * Groups candidates into one question per role present.
 *
 * The result drives the booking form: a service booked against providers and
 * rooms asks about both, and one booked against providers alone asks only about
 * them. Nothing has to be configured per service to make that happen.
 *
 * @param candidates - Candidates to group.
 * @returns One group per role present, in `SCHEDULING_ROLES` order.
 */
export function groupCandidatesByRole(candidates: readonly ScheduleCandidate[]): ScheduleCandidateGroup[] {
  return SCHEDULING_ROLES.map((role) => ({
    role,
    label: ROLE_LABELS[role],
    required: REQUIRED_ROLES.has(role),
    candidates: candidates.filter((candidate) => candidate.role === role),
  })).filter((group) => group.candidates.length > 0);
}

/**
 * Returns the candidates chosen for one role.
 * @param group - The role's candidates.
 * @param selections - Chosen schedule ids per role.
 * @returns The chosen candidates, in the order they are offered.
 */
export function getSelectedCandidates(group: ScheduleCandidateGroup, selections: ActorSelections): ScheduleCandidate[] {
  const selected = selections[group.role] ?? [];
  return group.candidates.filter((candidate) => selected.includes(candidate.schedule.id));
}

/**
 * Collects the schedules a search should be run against.
 *
 * Every chosen actor goes into the one request: `$find` intersects the schedules
 * it is given, so the times it offers are the times all of them are free. A
 * fourth actor therefore costs nothing but availability, and an appointment
 * needing a surgeon, an anesthesiologist and a theatre is one request.
 *
 * A role with nothing chosen contributes nothing, which searches without holding
 * a room or a device at all. Whether that is allowed is `getSelectionError`'s
 * business, not this function's.
 *
 * @param groups - The roles offered by the form.
 * @param selections - Chosen schedule ids per role.
 * @returns A reference to each chosen actor's Schedule, in role order.
 */
export function getSelectedSchedules(
  groups: readonly ScheduleCandidateGroup[],
  selections: ActorSelections
): Reference<Schedule>[] {
  return groups.flatMap((group) => getSelectedCandidates(group, selections).map(toScheduleReference));
}

function toScheduleReference(candidate: ScheduleCandidate): Reference<Schedule> {
  return { reference: `Schedule/${candidate.schedule.id}` };
}

/**
 * Reports why the current selections cannot be searched, if they cannot.
 * @param groups - The roles offered by the form.
 * @param selections - Chosen schedule ids per role.
 * @returns A message to show the user, or undefined when the search can run.
 */
export function getSelectionError(
  groups: readonly ScheduleCandidateGroup[],
  selections: ActorSelections
): string | undefined {
  if (groups.length === 0) {
    return 'No schedules are configured for this service.';
  }
  const missing = groups.find((group) => group.required && getSelectedCandidates(group, selections).length === 0);
  if (missing) {
    return `Choose at least one ${missing.label.toLowerCase()}`;
  }
  // Every role optional and none chosen would search the service's whole
  // availability without holding anybody's calendar.
  if (groups.every((group) => getSelectedCandidates(group, selections).length === 0)) {
    return `Choose at least one ${groups[0].label.toLowerCase()}`;
  }
  return undefined;
}

/** Who an appointment is being held on: one actor per chosen candidate. */
export interface ActorCombination {
  /** Matches `getActorGroupKey` of the appointments offered for these actors. */
  readonly key: string;
  readonly label: string;
  readonly actors: readonly SchedulingActor[];
  readonly schedules: readonly Reference<Schedule>[];
}

/**
 * Describes who the current selections would hold an appointment on.
 *
 * Naming them is how a request for a time outside the offered ones says whose
 * calendars it is for. There is only ever one set of them, because everything
 * chosen attends.
 *
 * @param groups - The roles offered by the form.
 * @param selections - Chosen schedule ids per role.
 * @returns The actors and their schedules, or undefined when nothing is chosen.
 */
export function getActorCombination(
  groups: readonly ScheduleCandidateGroup[],
  selections: ActorSelections
): ActorCombination | undefined {
  const candidates = groups.flatMap((group) => getSelectedCandidates(group, selections));
  if (candidates.length === 0) {
    return undefined;
  }

  const actors = candidates.map((candidate) => candidate.actor);
  return {
    key: getActorsKey(actors),
    label: candidates.map((candidate) => candidate.actorDisplay).join(' · '),
    actors,
    schedules: candidates.map(toScheduleReference),
  };
}
