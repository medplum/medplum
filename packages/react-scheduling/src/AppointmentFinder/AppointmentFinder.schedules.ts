// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, WithId } from '@medplum/core';
import {
  assertNever,
  getDisplayString,
  getReferenceString,
  isDefined,
  lazy,
  serviceTypeIncludesService,
} from '@medplum/core';
import type { HealthcareService, Location, PractitionerRole, Reference, Resource, Schedule } from '@medplum/fhirtypes';
import type { SchedulingActor, SchedulingRole } from './AppointmentFinder.roles';
import {
  ROLE_LABELS,
  SCHEDULING_ROLES,
  getSchedulingRole,
  isBookableActorType,
  isRoleRequired,
  isSchedulingActorType,
} from './AppointmentFinder.roles';
import { getActorsKey } from './AppointmentFinder.times';

/**
 * A Schedule that can be booked for a service, paired with the actor it belongs
 * to.
 */
export interface ScheduleCandidate {
  readonly schedule: WithId<Schedule>;
  /** The actor itself, when the search was able to include it. */
  readonly actorResource: WithId<Resource> | undefined;
}

/**
 * Returns the actor a candidate's schedule is held on.
 * @param candidate - The candidate to read.
 * @returns Its schedule's only actor.
 */
function getCandidateActor(candidate: ScheduleCandidate): SchedulingActor {
  return candidate.schedule.actor[0];
}

/**
 * Returns the role a candidate fills, from the type of its actor.
 * @param candidate - The candidate to read.
 * @returns The role, or undefined for an actor of a type nothing books against.
 */
export function getCandidateRole(candidate: ScheduleCandidate): SchedulingRole | undefined {
  const actorType = getActorType(getCandidateActor(candidate).reference);
  return isSchedulingActorType(actorType) ? getSchedulingRole(actorType) : undefined;
}

/**
 * Names a candidate's actor, for use in plain-text option lists.
 * @param candidate - The candidate to name.
 * @returns The name to show.
 */
export function getCandidateDisplay(candidate: ScheduleCandidate): string {
  const actor = getCandidateActor(candidate);
  return (
    actor.display ??
    (candidate.actorResource && getDisplayString(candidate.actorResource)) ??
    actor.reference ??
    `Schedule/${candidate.schedule.id}`
  );
}

/**
 * What an appointment is being asked for: the schedules chosen, per role.
 * Everything named attends.
 */
export type ActorSelections = Partial<Record<SchedulingRole, readonly ScheduleCandidate[]>>;

export interface SearchScheduleCandidatesOptions {
  /** Which of the service's actors to offer. */
  readonly role: SchedulingRole;
  /** What the user typed. Empty offers whatever the role has, unfiltered by name. */
  readonly query: string;
  /**
   * The site being booked at. Actors sited elsewhere are left out: a room or a
   * device anywhere inside it counts, a provider only if one of their
   * PractitionerRoles names it.
   */
  readonly location?: Reference<Location> | WithId<Location>;
  readonly signal?: AbortSignal;
  /** Maximum schedules to consider. Defaults to 25. */
  readonly count?: number;
}

/** How many schedules one search offers. */
const DEFAULT_COUNT = 25;

/**
 * The chained filters that scope a Schedule search to one role's actors.
 * @param role - The role whose actors to offer.
 * @param query - What the user typed, or empty to match any name.
 * @returns The `actor:` criteria to search with.
 */
function getActorCriteria(role: SchedulingRole, query: string): Record<string, string> {
  switch (role) {
    case 'provider':
      return {
        'actor:Practitioner.active:not': 'false',
        ...(query ? { 'actor:Practitioner.name': query } : undefined),
      };
    case 'room':
      return {
        'actor:Location.status:not': 'inactive',
        ...(query ? { 'actor:Location.name': query } : undefined),
      };
    case 'device':
      return {
        'actor:Device.status:not': 'inactive',
        ...(query ? { 'actor:Device.device-name': query } : undefined),
      };
    default:
      return assertNever(role);
  }
}

/**
 * Finds the Schedules that can be booked for one role, narrowed to the actors
 * whose name matches what was typed.
 * @param medplum - The Medplum client.
 * @param service - The HealthcareService being booked, or undefined to search
 *   unconstrained by service type — every active, bookable schedule for the role.
 * @param options - The role, the text typed, the site, an abort signal, and a page size.
 * @returns The matching schedules, each with its actor, by display name.
 */
export async function searchScheduleCandidates(
  medplum: MedplumClient,
  service: WithId<HealthcareService> | undefined,
  options: SearchScheduleCandidatesOptions
): Promise<ScheduleCandidate[]> {
  const count = (options.count ?? DEFAULT_COUNT).toString();
  const actorCriteria = getActorCriteria(options.role, options.query);

  const tokens = service ? getServiceTypeTokens(service) : [];
  const typeCriteria = tokens.length > 0 ? { 'service-type': tokens.join(',') } : {};

  const bundle = await medplum.search(
    'Schedule',
    { ...typeCriteria, ...actorCriteria, 'active:not': 'false', _count: count, _include: 'Schedule:actor' },
    { signal: options.signal }
  );

  const actorsByReference = new Map<string, WithId<Resource>>();
  const schedules: WithId<Schedule>[] = [];

  for (const entry of bundle.entry ?? []) {
    const resource = entry.resource as WithId<Resource> | undefined;
    if (!resource?.id) {
      continue;
    }
    if (entry.search?.mode === 'include') {
      actorsByReference.set(`${resource.resourceType}/${resource.id}`, resource);
    } else if (resource.resourceType === 'Schedule') {
      schedules.push(resource);
    }
  }

  const found = schedules
    .map((schedule) => toScheduleCandidate(schedule, service, actorsByReference))
    .filter(isDefined);

  // Filter by location
  const kept = await filterCandidatesByLocation(medplum, found, options.location, { signal: options.signal });
  return kept.sort((left, right) => getCandidateDisplay(left).localeCompare(getCandidateDisplay(right)));
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
  service: WithId<HealthcareService> | undefined,
  actors: Map<string, WithId<Resource>>
): ScheduleCandidate | undefined {
  if (schedule.active === false || (service && !serviceTypeIncludesService(schedule.serviceType, service))) {
    return undefined;
  }

  // `$find` errors on schedules with anything other than a single actor, so
  // offering them would only produce a request that cannot succeed.
  if (schedule.actor.length !== 1) {
    return undefined;
  }

  // Leaves out schedules held on a PractitionerRole
  const reference = schedule.actor[0].reference;
  if (!reference || !isBookableActorType(getActorType(reference))) {
    return undefined;
  }

  return { schedule, actorResource: actors.get(reference) };
}

/** How far up a `partOf` chain of Locations to look. */
const MAX_LOCATION_DEPTH = 4;

export interface FilterCandidatesOptions {
  readonly signal?: AbortSignal;
}

/**
 * Narrows candidates to the ones available at one location.
 *
 * A candidate that says nothing about where it is, or whose ancestry cannot be
 * read, is kept: hiding something the caller may be entitled to book is worse
 * than offering something at the wrong site.
 *
 * @param medplum - The Medplum client.
 * @param candidates - Candidates to narrow.
 * @param location - The site being booked at, or undefined to keep everything.
 * @param options - Abort signal.
 * @returns The candidates, minus the ones sited elsewhere.
 */
export async function filterCandidatesByLocation(
  medplum: MedplumClient,
  candidates: readonly ScheduleCandidate[],
  location: Reference<Location> | WithId<Location> | undefined,
  options?: FilterCandidatesOptions
): Promise<ScheduleCandidate[]> {
  const locationReference = location && getReferenceString(location);
  if (!locationReference) {
    return [...candidates];
  }

  // The location where a Practitioner practices is recorded on their PractitionerRoles.
  const getRoles = lazy(() => searchRolesByPractitioner(medplum, candidates, options));

  // Test candidates concurrently & let the client's request cache collapse repeated
  // Location reads.
  const verdicts = await Promise.all(
    candidates.map(async (candidate) => isCandidateAtLocation(candidate, medplum, locationReference, getRoles, options))
  );

  return candidates.filter((_, index) => verdicts[index]);
}

/**
 * Loads the PractitionerRoles held by the practitioners among the candidates.
 *
 * A provider is booked on their Practitioner, but it is their PractitionerRoles
 * that record _where_ they practice, so the roles have to be read back to filter
 * by site. One search covers every candidate.
 *
 * @param medplum - The Medplum client.
 * @param candidates - Candidates whose practitioners should be looked up.
 * @param options - Abort signal.
 * @returns The active roles, keyed by the practitioner reference they name.
 *   Empty when the roles cannot be read, which keeps those candidates on offer.
 */
async function searchRolesByPractitioner(
  medplum: MedplumClient,
  candidates: readonly ScheduleCandidate[],
  options: FilterCandidatesOptions | undefined
): Promise<ReadonlyMap<string, readonly PractitionerRole[]>> {
  const byPractitioner = new Map<string, PractitionerRole[]>();
  const references = [
    ...new Set(
      candidates
        .map((candidate) => getCandidateActor(candidate).reference)
        .filter((reference) => getActorType(reference) === 'Practitioner')
    ),
  ];

  if (references.length === 0) {
    return byPractitioner;
  }

  let roles: PractitionerRole[];
  try {
    roles = await medplum.searchResources(
      'PractitionerRole',
      // An inactive role no longer places the person at its site.
      { practitioner: references.join(','), 'active:not': 'false', _count: '1000' },
      { signal: options?.signal }
    );
  } catch {
    // Unreadable, so where these people practice is unknown.
    return byPractitioner;
  }

  for (const role of roles) {
    const reference = role.practitioner?.reference;
    if (!reference) {
      continue;
    }
    const held = byPractitioner.get(reference);
    if (held) {
      held.push(role);
    } else {
      byPractitioner.set(reference, [role]);
    }
  }

  return byPractitioner;
}

/**
 * Reports whether one candidate can be booked at a location.
 *
 * Each role records where it is in a different place, so the role decides which
 * question to ask; a role that records nothing is kept.
 *
 * @param candidate - The candidate to site.
 * @param medplum - The Medplum client.
 * @param locationReference - The site being booked at.
 * @param getRoles - Reads the candidates' PractitionerRoles, once between them all.
 * @param options - Abort signal.
 * @returns Whether the candidate is available at the location, or says nothing about it.
 */
async function isCandidateAtLocation(
  candidate: ScheduleCandidate,
  medplum: MedplumClient,
  locationReference: string,
  getRoles: () => Promise<ReadonlyMap<string, readonly PractitionerRole[]>>,
  options: FilterCandidatesOptions | undefined
): Promise<boolean> {
  const actor = candidate.actorResource;
  const actorReference = getCandidateActor(candidate).reference;
  const role = getCandidateRole(candidate);

  switch (role) {
    case 'room':
      // A room is the Location, so it sites itself.
      return isWithinLocation(medplum, actorReference, locationReference, options);
    case 'device': {
      // Where a device is kept is recorded on the Device itself, which is only
      // to hand when the search could include it.
      const device = actor?.resourceType === 'Device' ? actor : undefined;
      return isWithinLocation(medplum, device?.location?.reference, locationReference, options);
    }
    case 'provider':
      return isPractitionerAtLocation(actorReference, locationReference, getRoles);
    case undefined:
      // An actor of a type nothing books against, so nothing sites it either.
      return true;
    default:
      return assertNever(role);
  }
}

/**
 * Reports whether a practitioner practices at a location.
 *
 * Where someone practices lives on their PractitionerRoles, and a person with no
 * role that names a location is kept rather than hidden.
 *
 * @param actorReference - The practitioner the schedule is held on.
 * @param locationReference - The site being booked at.
 * @param getRoles - Reads the candidates' PractitionerRoles, once between them all.
 * @returns Whether one of their roles names the site.
 */
async function isPractitionerAtLocation(
  actorReference: string | undefined,
  locationReference: string,
  getRoles: () => Promise<ReadonlyMap<string, readonly PractitionerRole[]>>
): Promise<boolean> {
  const roles = await getRoles();
  const held = (actorReference ? roles.get(actorReference) : undefined) ?? [];
  const practiceLocations = held.flatMap((role) => role.location ?? []);
  if (practiceLocations.length === 0) {
    // Nothing records where this person practices.
    return true;
  }
  return practiceLocations.some((roleLocation) => roleLocation.reference === locationReference);
}

function getActorType(reference: string | undefined): string | undefined {
  return reference?.split('/')[0];
}

/**
 * Walks up from a Location to the one being booked at.
 * @param medplum - The Medplum client.
 * @param reference - The Location to start from, or undefined to say nothing.
 * @param locationReference - The Location being looked for.
 * @param options - Abort signal.
 * @returns Whether the target is at or above the Location, or unknowable.
 */
async function isWithinLocation(
  medplum: MedplumClient,
  reference: string | undefined,
  locationReference: string,
  options: FilterCandidatesOptions | undefined
): Promise<boolean> {
  if (!reference) {
    return true;
  }

  let current: string = reference;

  for (let depth = 0; depth < MAX_LOCATION_DEPTH; depth++) {
    if (current === locationReference) {
      return true;
    }
    const location = await readLocation(medplum, current, options);
    if (!location) {
      return true;
    }
    const parent = location.partOf?.reference;
    if (!parent) {
      // The chain ends above this Location without passing through the target.
      return false;
    }
    current = parent;
  }

  // Deeper than we look. Treat it as unverifiable rather than excluded.
  return true;
}

/**
 * Reads a Location, or reports that it cannot be read.
 * @param medplum - The Medplum client.
 * @param reference - The Location to read.
 * @param options - Abort signal.
 * @returns The Location, or undefined when it cannot be read.
 */
async function readLocation(
  medplum: MedplumClient,
  reference: string,
  options: FilterCandidatesOptions | undefined
): Promise<Location | undefined> {
  try {
    return await medplum.readReference<Location>({ reference }, { signal: options?.signal });
  } catch {
    // Unreadable, so its ancestry is unknown.
    return undefined;
  }
}

/**
 * Returns everything chosen, across roles.
 * @param selections - What has been chosen.
 * @returns The chosen candidates, in `SCHEDULING_ROLES` order.
 */
export function getSelectedCandidates(selections: ActorSelections): ScheduleCandidate[] {
  return SCHEDULING_ROLES.flatMap((role) => selections[role] ?? []);
}

function toScheduleReference(candidate: ScheduleCandidate): Reference<Schedule> {
  return { reference: `Schedule/${candidate.schedule.id}` };
}

/**
 * Reports why the current selections cannot be searched, if they cannot.
 * @param selections - What has been chosen.
 * @returns A message to show the user, or undefined when the search can run.
 */
export function getSelectionError(selections: ActorSelections): string | undefined {
  const missing = SCHEDULING_ROLES.find((role) => isRoleRequired(role) && (selections[role] ?? []).length === 0);
  return missing ? `Choose at least one ${ROLE_LABELS[missing].toLowerCase()}` : undefined;
}

/**
 * One way of holding an appointment: a set of actors whose schedules `$find`
 * intersects in a single request. A role contributes as many actors as were
 * chosen for it, since everything chosen attends.
 */
export interface ActorCombination {
  /** Matches `getActorGroupKey` of the appointments offered for these actors. */
  readonly key: string;
  readonly label: string;
  readonly actors: readonly SchedulingActor[];
  readonly schedules: readonly Reference<Schedule>[];
}

/**
 * Builds the sets of actors an appointment could be held on.
 *
 * One combination is one `$find` request: the schedules within it are
 * intersected, so its times are the times all of those actors are free.
 *
 * @param selections - What has been chosen.
 * @returns One combination holding every chosen actor, in role order, or an
 *   empty list when nothing is chosen.
 */
export function getActorCombinations(selections: ActorSelections): ActorCombination[] {
  const chosen = getSelectedCandidates(selections);
  return chosen.length > 0 ? [toActorCombination(chosen)] : [];
}

function toActorCombination(candidates: readonly ScheduleCandidate[]): ActorCombination {
  const actors = candidates.map(getCandidateActor);
  return {
    key: getActorsKey(actors),
    label: candidates.map(getCandidateDisplay).join(' · '),
    actors,
    schedules: candidates.map(toScheduleReference),
  };
}
