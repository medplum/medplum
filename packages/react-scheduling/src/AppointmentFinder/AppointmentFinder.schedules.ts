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
 *
 * Only what a search had to fetch is held. The role an actor fills and the name
 * it goes by are read back off the Schedule by `getCandidateRole` and
 * `getCandidateDisplay`, so there is one account of each rather than a copy
 * taken when the candidate was built.
 */
export interface ScheduleCandidate {
  readonly schedule: WithId<Schedule>;
  /** The actor itself, when the search was able to include it. */
  readonly actorResource: WithId<Resource> | undefined;
}

/**
 * Returns the actor a candidate's schedule is held on.
 *
 * `$find` rejects a schedule with more than one, and `searchEligibleSchedules`
 * drops those before they become candidates, so a candidate always has exactly
 * this one.
 *
 * @param candidate - The candidate to read.
 * @returns Its schedule's only actor.
 */
export function getCandidateActor(candidate: ScheduleCandidate): SchedulingActor {
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
 *
 * The Schedule's own display is preferred over the actor resource's name: it is
 * always present, and it is what the site chose to call the actor in this
 * context.
 *
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
 * One actor an appointment needs, and the schedules that could supply it.
 *
 * Any *one* of the schedules fills the requirement, so naming several asks for a
 * choice between them. Naming several requirements asks for all of them at once:
 * a surgeon and an anesthesiologist are two requirements, while "whichever
 * surgeon is free" is one requirement naming both.
 *
 * Both are needed within a single role, which is why the choice is modelled here
 * rather than as a mode the role is in.
 */
export interface ActorRequirement {
  readonly scheduleIds: readonly string[];
}

/**
 * What an appointment is being asked for, as requirements per role.
 *
 * `$find` only intersects the schedules in one request, so it can answer one
 * candidate per requirement. A choice between candidates is therefore a request
 * per combination of them, which `getActorCombinations` enumerates.
 */
export type ActorSelections = Partial<Record<SchedulingRole, readonly ActorRequirement[]>>;

/**
 * Builds requirements for actors that all attend, one each.
 *
 * The shape every selection has while a choice between actors is unbuilt.
 *
 * @param scheduleIds - The schedules chosen.
 * @returns One single-candidate requirement per schedule.
 */
export function toActorRequirements(scheduleIds: readonly string[]): ActorRequirement[] {
  return scheduleIds.map((scheduleId) => ({ scheduleIds: [scheduleId] }));
}

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
 * Each role says where it is in its own way. A room is a Location `partOf` the
 * site holding it, so it counts when the chosen location is somewhere above it —
 * directly, or through a floor or wing in between. A device says where it is
 * kept in `Device.location`. A practitioner says where they may work in
 * `PractitionerRole.location`, which is also where licensure by state or
 * jurisdiction lives, so a role counts when any of its locations is the chosen
 * one, a site that one sits inside, or somewhere inside it in turn.
 *
 * A candidate that says nothing about where it is, or whose ancestry cannot be
 * read, is kept: hiding something the caller may be entitled to book is worse
 * than offering something at the wrong site, which the names themselves tend to
 * make obvious. A plain Practitioner actor carries no location at all, so it is
 * always kept.
 *
 * Sites are matched through `Location.partOf`. A licensure model that instead
 * marks jurisdictions with identifiers has no chain to follow, so the roles it
 * describes are only kept when the location is named on them directly. Deciding
 * who may be booked from licensure belongs upstream of this, in the schedules
 * the caller offers at all.
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

  const resolved = new Map<string, Location | undefined>();
  // The sites the location sits inside, so a role licensed for a whole state
  // covers the sites within it.
  const ancestry = await getLocationAncestry(medplum, locationReference, resolved, options);
  const keep: ScheduleCandidate[] = [];

  for (const candidate of candidates) {
    if (await isCandidateAtLocation(medplum, candidate, locationReference, ancestry, resolved, options)) {
      keep.push(candidate);
    }
  }

  return keep;
}

async function isCandidateAtLocation(
  medplum: MedplumClient,
  candidate: ScheduleCandidate,
  locationReference: string,
  ancestry: ReadonlySet<string>,
  resolved: Map<string, Location | undefined>,
  options: FilterCandidatesOptions | undefined
): Promise<boolean> {
  const actor = candidate.actorResource;

  if (getCandidateRole(candidate) === 'room') {
    return isWithinLocation(
      medplum,
      getCandidateActor(candidate).reference,
      locationReference,
      resolved,
      options,
      actor as Location | undefined
    );
  }

  if (actor?.resourceType === 'Device') {
    return isWithinLocation(medplum, actor.location?.reference, locationReference, resolved, options);
  }
  if (actor?.resourceType === 'PractitionerRole' && actor.location?.length) {
    for (const roleLocation of actor.location) {
      // A role's location counts whether the chosen location sits inside it or
      // it sits inside the chosen location.
      if (roleLocation.reference && ancestry.has(roleLocation.reference)) {
        return true;
      }
      if (await isWithinLocation(medplum, roleLocation.reference, locationReference, resolved, options)) {
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
 * @param resolved - Locations already read, to save reading them again.
 * @param options - Abort signal.
 * @param included - The starting Location, when a search already returned it.
 * @returns Whether the target is at or above the Location, or unknowable.
 */
async function isWithinLocation(
  medplum: MedplumClient,
  reference: string | undefined,
  locationReference: string,
  resolved: Map<string, Location | undefined>,
  options: FilterCandidatesOptions | undefined,
  included?: Location
): Promise<boolean> {
  if (!reference) {
    return true;
  }

  let current: string = reference;
  let resource = included;

  for (let depth = 0; depth < MAX_LOCATION_DEPTH; depth++) {
    if (current === locationReference) {
      return true;
    }
    const location = resource ?? (await readLocation(medplum, current, resolved, options));
    if (!location) {
      return true;
    }
    const parent = location.partOf?.reference;
    if (!parent) {
      // The chain ends above this Location without passing through the target.
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
  locationReference: string,
  resolved: Map<string, Location | undefined>,
  options: FilterCandidatesOptions | undefined
): Promise<Set<string>> {
  const ancestry = new Set<string>();
  let reference: string | undefined = locationReference;

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
  options: FilterCandidatesOptions | undefined
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
 * Each group is sorted by name, which is the order its field lists them in.
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
 * Returns the candidates that could fill one requirement.
 *
 * Ids matching nothing on offer are dropped, so a stale selection leaves a
 * requirement narrower rather than unfillable.
 *
 * @param group - The role's candidates.
 * @param requirement - The requirement to resolve.
 * @returns The candidates that could fill it, in the order they are offered.
 */
export function getRequirementCandidates(
  group: ScheduleCandidateGroup,
  requirement: ActorRequirement
): ScheduleCandidate[] {
  return group.candidates.filter((candidate) => requirement.scheduleIds.includes(candidate.schedule.id));
}

/**
 * Names the actor a requirement asks for.
 *
 * A requirement offering a choice reads out its alternatives, so one line says
 * either who is wanted or who would do.
 *
 * @param group - The role's candidates.
 * @param requirement - The requirement to describe.
 * @returns The name, or an empty string when nothing on offer can fill it.
 */
export function getRequirementLabel(group: ScheduleCandidateGroup, requirement: ActorRequirement): string {
  return getRequirementCandidates(group, requirement).map(getCandidateDisplay).join(' or ');
}

/**
 * Returns every candidate chosen for one role, across all of its requirements.
 * @param group - The role's candidates.
 * @param selections - What has been chosen.
 * @returns The chosen candidates, in the order they are offered.
 */
export function getSelectedCandidates(group: ScheduleCandidateGroup, selections: ActorSelections): ScheduleCandidate[] {
  const chosen = new Set((selections[group.role] ?? []).flatMap((requirement) => requirement.scheduleIds));
  return group.candidates.filter((candidate) => chosen.has(candidate.schedule.id));
}

/**
 * Resolves every requirement to the candidates that could fill it.
 *
 * Requirements nothing on offer can fill drop out, matching a role left empty:
 * a selection that has gone stale narrows the search rather than emptying it.
 *
 * @param groups - The roles offered by the form.
 * @param selections - What has been chosen.
 * @returns One entry per fillable requirement, in role order.
 */
function resolveRequirements(
  groups: readonly ScheduleCandidateGroup[],
  selections: ActorSelections
): ScheduleCandidate[][] {
  const resolved: ScheduleCandidate[][] = [];
  for (const group of groups) {
    for (const requirement of selections[group.role] ?? []) {
      const candidates = getRequirementCandidates(group, requirement);
      if (candidates.length > 0) {
        resolved.push(candidates);
      }
    }
  }
  return resolved;
}

function countCombinations(resolved: readonly ScheduleCandidate[][]): number {
  return resolved.reduce((total, candidates) => total * candidates.length, resolved.length > 0 ? 1 : 0);
}

/**
 * The most requests one search will fan out to.
 *
 * `$find` takes no cursor, so each combination costs a request whose results
 * cannot be paged together with the others. A choice wide enough to pass this is
 * better narrowed than answered slowly.
 */
export const MAX_ACTOR_COMBINATIONS = 12;

/**
 * Counts the requests the current selections would take, without building them.
 * @param groups - The roles offered by the form.
 * @param selections - What has been chosen.
 * @returns The number of actor combinations, or 0 when nothing is chosen.
 */
export function countActorCombinations(groups: readonly ScheduleCandidateGroup[], selections: ActorSelections): number {
  return countCombinations(resolveRequirements(groups, selections));
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
  const combinations = countActorCombinations(groups, selections);
  if (combinations === 0) {
    // Every role optional and none chosen would search the service's whole
    // availability without holding anybody's calendar.
    return `Choose at least one ${groups[0].label.toLowerCase()}`;
  }
  if (combinations > MAX_ACTOR_COMBINATIONS) {
    return `That is ${combinations} sets of actors to search for. Narrow it to ${MAX_ACTOR_COMBINATIONS} or fewer.`;
  }
  return undefined;
}

/** One way of holding an appointment: a single actor for every requirement. */
export interface ActorCombination {
  /** Matches `getActorGroupKey` of the appointments offered for these actors. */
  readonly key: string;
  readonly label: string;
  readonly actors: readonly SchedulingActor[];
  readonly schedules: readonly Reference<Schedule>[];
}

/**
 * Enumerates the sets of actors an appointment could be held on.
 *
 * One combination is one `$find` request: the schedules within it are
 * intersected, so its times are the times all of those actors are free, and the
 * times found for different combinations are alternatives to offer side by side.
 * Naming the actors is also how a request for a time outside the offered ones
 * says whose calendars it is for.
 *
 * Selections naming a single candidate per requirement — every selection the
 * form makes today — produce exactly one combination, and so one request.
 *
 * @param groups - The roles offered by the form.
 * @param selections - What has been chosen.
 * @returns One combination per way of filling every requirement, in role order.
 *   Empty when nothing is chosen, and when there are more than
 *   `MAX_ACTOR_COMBINATIONS` of them — which `getSelectionError` refuses before
 *   a search gets this far.
 */
export function getActorCombinations(
  groups: readonly ScheduleCandidateGroup[],
  selections: ActorSelections
): ActorCombination[] {
  const resolved = resolveRequirements(groups, selections);
  if (resolved.length === 0 || countCombinations(resolved) > MAX_ACTOR_COMBINATIONS) {
    return [];
  }

  let combinations: ScheduleCandidate[][] = [[]];
  for (const candidates of resolved) {
    combinations = combinations.flatMap((partial) => candidates.map((candidate) => [...partial, candidate]));
  }
  return combinations.map(toActorCombination);
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
