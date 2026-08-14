// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, WithId } from '@medplum/core';
import { getDisplayString, getReferenceString, isDefined, serviceTypeIncludesService } from '@medplum/core';
import type { HealthcareService, Location, Reference, Resource, Schedule } from '@medplum/fhirtypes';
import type { SchedulingActor, SchedulingRole } from './AppointmentFinder.roles';
import { ROLE_LABELS, SCHEDULING_ROLES, getSchedulingRole, isSchedulingActorType } from './AppointmentFinder.roles';
import { getActorsKey } from './AppointmentFinder.times';

/**
 * Roles that must be chosen before a search can run.
 *
 * Rooms and devices are left optional: a service may have room schedules
 * configured without every booking needing to hold one.
 */
const REQUIRED_ROLES: ReadonlySet<SchedulingRole> = new Set(['provider']);

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
  const actorType = getCandidateActor(candidate).reference?.split('/')[0];
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

/** Candidates that fill the same role, offered together as one question. */
export interface ScheduleCandidateGroup {
  readonly role: SchedulingRole;
  readonly label: string;
  /** Whether a search can run without one of these being chosen. */
  readonly required: boolean;
  readonly candidates: readonly ScheduleCandidate[];
}

/**
 * What an appointment is being asked for: the schedules chosen, per role.
 * Everything named attends.
 */
export type ActorSelections = Partial<Record<SchedulingRole, readonly string[]>>;

export interface SearchEligibleSchedulesOptions {
  readonly signal?: AbortSignal;
  /** Maximum schedules to consider per service type code. Defaults to 100. */
  readonly count?: number;
}

/**
 * Finds the Schedules that can be booked for a HealthcareService.
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
        { ...criteria, 'active:not': 'false', _count: count, _include: 'Schedule:actor' },
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
    .filter(isDefined);
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

  const reference = schedule.actor[0].reference;
  if (!reference || !isSchedulingActorType(reference.split('/')[0])) {
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

  // The sites the location sits inside, so a role licensed for a whole state
  // covers the sites within it.
  let ancestry: Promise<ReadonlySet<string>> | undefined;
  const getAncestry = async (): Promise<ReadonlySet<string>> => {
    ancestry ??= getLocationAncestry(medplum, locationReference, options);
    return ancestry;
  };
  const keep: ScheduleCandidate[] = [];

  for (const candidate of candidates) {
    if (await isCandidateAtLocation(medplum, candidate, locationReference, getAncestry, options)) {
      keep.push(candidate);
    }
  }

  return keep;
}

async function isCandidateAtLocation(
  medplum: MedplumClient,
  candidate: ScheduleCandidate,
  locationReference: string,
  getAncestry: () => Promise<ReadonlySet<string>>,
  options: FilterCandidatesOptions | undefined
): Promise<boolean> {
  const actor = candidate.actorResource;

  if (getCandidateRole(candidate) === 'room') {
    return isWithinLocation(medplum, getCandidateActor(candidate).reference, locationReference, options);
  }

  if (actor?.resourceType === 'Device') {
    return isWithinLocation(medplum, actor.location?.reference, locationReference, options);
  }
  if (actor?.resourceType === 'PractitionerRole' && actor.location?.length) {
    const ancestry = await getAncestry();
    for (const roleLocation of actor.location) {
      // A role's location counts whether the chosen location sits inside it or
      // it sits inside the chosen location.
      if (roleLocation.reference && ancestry.has(roleLocation.reference)) {
        return true;
      }
      if (await isWithinLocation(medplum, roleLocation.reference, locationReference, options)) {
        return true;
      }
    }
    return false;
  }

  return true;
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

async function getLocationAncestry(
  medplum: MedplumClient,
  locationReference: string,
  options: FilterCandidatesOptions | undefined
): Promise<Set<string>> {
  const ancestry = new Set<string>();
  let reference: string | undefined = locationReference;

  for (let depth = 0; depth < MAX_LOCATION_DEPTH && reference; depth++) {
    ancestry.add(reference);
    const location = await readLocation(medplum, reference, options);
    reference = location?.partOf?.reference;
  }

  return ancestry;
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
    candidates: candidates
      .filter((candidate) => getCandidateRole(candidate) === role)
      .sort((left, right) => getCandidateDisplay(left).localeCompare(getCandidateDisplay(right))),
  })).filter((group) => group.candidates.length > 0);
}

/**
 * Returns the candidates chosen for one role.
 * @param group - The role's candidates.
 * @param selections - What has been chosen.
 * @returns The chosen candidates, in the order they are offered.
 */
export function getSelectedCandidates(group: ScheduleCandidateGroup, selections: ActorSelections): ScheduleCandidate[] {
  const chosen = new Set(selections[group.role] ?? []);
  return group.candidates.filter((candidate) => chosen.has(candidate.schedule.id));
}

function toScheduleReference(candidate: ScheduleCandidate): Reference<Schedule> {
  return { reference: `Schedule/${candidate.schedule.id}` };
}

/**
 * Reports why the current selections cannot be searched, if they cannot.
 * @param groups - The roles offered by the form.
 * @param selections - What has been chosen.
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
  if (groups.every((group) => getSelectedCandidates(group, selections).length === 0)) {
    // Every role optional and none chosen would search the service's whole
    // availability without holding anybody's calendar.
    return `Choose at least one ${groups[0].label.toLowerCase()}`;
  }
  return undefined;
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
 * @param groups - The roles offered by the form.
 * @param selections - What has been chosen.
 * @returns One combination holding every chosen actor, in role order, or an
 *   empty list when nothing is chosen.
 */
export function getActorCombinations(
  groups: readonly ScheduleCandidateGroup[],
  selections: ActorSelections
): ActorCombination[] {
  const chosen = groups.flatMap((group) => getSelectedCandidates(group, selections));
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
