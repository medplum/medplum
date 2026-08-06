// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, WithId } from '@medplum/core';
import {
  durationToMinutes,
  getDisplayString,
  getExtensions,
  getReferenceString,
  getScheduleParameters,
  isDefined,
  SchedulingParametersURI,
  serviceTypeIncludesService,
} from '@medplum/core';
import type {
  Appointment,
  Bundle,
  CodeableConcept,
  Coding,
  Extension,
  HealthcareService,
  Location,
  Patient,
  Reference,
  Resource,
  Schedule,
  Slot,
} from '@medplum/fhirtypes';
import { isSameDay } from '@medplum/react';

/**
 * The longest window `Appointment/$find` accepts. Requests wider than this are
 * rejected outright, so callers have to keep their own date range inside it.
 */
export const MAX_FIND_WINDOW_DAYS = 31;

/** How many days one search covers, and how much further loading more reaches. */
export const DEFAULT_FIND_PAGE_DAYS = 14;

/**
 * The most days a page may cover. A day under the operation's limit, because a
 * page that ends at the close of a day spans an extra hour across a daylight
 * saving change and `$find` counts those hours.
 */
const MAX_PAGE_DAYS = MAX_FIND_WINDOW_DAYS - 1;

/** Resource types that may appear in `Schedule.actor`. */
export const SCHEDULING_ACTOR_TYPES = ['Practitioner', 'PractitionerRole', 'Location', 'Device'] as const;

export type SchedulingActorType = (typeof SCHEDULING_ACTOR_TYPES)[number];

/**
 * A reference to something a Schedule belongs to. The same union an Appointment
 * accepts as a participant, so an actor can be carried straight across.
 */
export type SchedulingActor = Schedule['actor'][number];

/**
 * The parts of an appointment a user chooses, in the order they are asked about.
 *
 * Each role becomes one question, because `$find` intersects the schedules it is
 * given: a time is offered only when the provider *and* the room *and* the
 * device are all free for it.
 */
export const SCHEDULING_ROLES = ['provider', 'room', 'device'] as const;

export type SchedulingRole = (typeof SCHEDULING_ROLES)[number];

export const ROLE_LABELS: Record<SchedulingRole, string> = {
  provider: 'Provider',
  room: 'Room',
  device: 'Device',
};

/**
 * Which role each actor type answers.
 *
 * A room is a Location, usually one `partOf` the clinic being booked at, and a
 * provider may be modelled either as a Practitioner or as the role they hold.
 */
const ROLE_BY_ACTOR_TYPE: Record<SchedulingActorType, SchedulingRole> = {
  Practitioner: 'provider',
  PractitionerRole: 'provider',
  Location: 'room',
  Device: 'device',
};

/**
 * Roles that must be chosen before a search can run.
 *
 * Rooms and devices are left optional: a service may have room schedules
 * configured without every booking needing to hold one.
 */
const REQUIRED_ROLES: ReadonlySet<SchedulingRole> = new Set(['provider']);

export function isSchedulingActorType(value: string | undefined): value is SchedulingActorType {
  return SCHEDULING_ACTOR_TYPES.includes(value as SchedulingActorType);
}

/**
 * Returns the role an actor type is chosen as.
 * @param actorType - A `Schedule.actor` resource type.
 * @returns The role that actor fills.
 */
export function getSchedulingRole(actorType: SchedulingActorType): SchedulingRole {
  return ROLE_BY_ACTOR_TYPE[actorType];
}

/**
 * Names the role an actor is filling, from its own reference.
 *
 * Used where an actor is shown away from the field it was chosen in, so that a
 * card headed by three names says which of them is the provider.
 *
 * @param actor - A reference to a scheduling actor.
 * @returns The role's label, or undefined for a reference of another type.
 */
export function getActorRoleLabel(actor: Reference): string | undefined {
  const actorType = actor.reference?.split('/')[0];
  return isSchedulingActorType(actorType) ? ROLE_LABELS[getSchedulingRole(actorType)] : undefined;
}

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

export type TimeOfDay = 'any' | 'morning' | 'afternoon';

/** A calendar day's worth of available times, split by the actors offering them. */
export interface AppointmentSlotGroup {
  /** Stable key derived from the actors, so React keys survive a refetch. */
  readonly key: string;
  readonly actors: readonly SchedulingActor[];
  readonly durationMinutes: number;
  /** Sorted by start time. */
  readonly appointments: readonly Appointment[];
}

export interface AppointmentDay {
  /** `YYYY-MM-DD` in the scheduling timezone. */
  readonly key: string;
  /** Local midnight of the same calendar day, for the calendar and its heading. */
  readonly date: Date;
  readonly groups: readonly AppointmentSlotGroup[];
}

interface ZonedParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
}

/**
 * Breaks an instant into calendar parts in a given timezone.
 *
 * Days and times are always read in the schedule's timezone rather than the
 * browser's, so a clinic three timezones away still shows its own hours.
 *
 * @param date - The instant to read.
 * @param timezone - IANA timezone identifier. Defaults to the browser's.
 * @returns The year, month, day, and hour in that timezone.
 */
function getZonedParts(date: Date, timezone: string | undefined): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const read = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find((p) => p.type === type)?.value);

  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
  };
}

/**
 * Formats an instant's time of day in a given timezone (e.g. "12:30 PM").
 * @param date - The instant to format.
 * @param timezone - IANA timezone identifier. Defaults to the browser's.
 * @returns The formatted time.
 */
export function formatZonedTime(date: Date, timezone?: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

/**
 * Formats a calendar day as a heading (e.g. "Monday, July 27").
 * @param date - Local midnight of the day.
 * @returns The formatted day.
 */
export function formatDayHeading(date: Date): string {
  return new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(date);
}

/**
 * Returns how far a timezone is from UTC at a given instant.
 * @param instant - The instant to read the offset at.
 * @param timezone - IANA timezone identifier.
 * @returns The offset in milliseconds, positive east of UTC.
 */
function getTimezoneOffsetMs(instant: Date, timezone: string): number {
  const { year, month, day, hour, minute } = getZonedParts(instant, timezone);
  // No zone is offset by part of a minute, so comparing whole minutes is enough
  // and avoids having to format seconds.
  return Date.UTC(year, month - 1, day, hour, minute) - Math.floor(instant.getTime() / 60000) * 60000;
}

/**
 * Reads a wall-clock time on a given day as an instant in a timezone.
 *
 * A time typed into the form means the time on the clinic's clock, so it has to
 * be resolved through the scheduling timezone rather than the browser's.
 *
 * @param day - Local midnight of the day the time falls on.
 * @param time - A 24-hour `HH:MM` time.
 * @param timezone - IANA timezone identifier. Defaults to the browser's.
 * @returns The instant, or undefined when the time is not a valid `HH:MM`.
 */
export function parseZonedTime(day: Date, time: string, timezone?: string): Date | undefined {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) {
    return undefined;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) {
    return undefined;
  }
  if (!timezone) {
    return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute);
  }

  const wallClock = Date.UTC(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute);
  // Read the offset near the answer, then re-read it at the answer in case the
  // first guess landed on the far side of a daylight saving change.
  const guess = getTimezoneOffsetMs(new Date(wallClock), timezone);
  const offset = getTimezoneOffsetMs(new Date(wallClock - guess), timezone);
  return new Date(wallClock - offset);
}

/**
 * Restricts appointments to a half of the day, read in the scheduling timezone.
 * @param appointments - Appointments to filter.
 * @param timeOfDay - The half of the day to keep, or `any` to keep all.
 * @param timezone - IANA timezone identifier. Defaults to the browser's.
 * @returns The matching appointments.
 */
export function filterByTimeOfDay(
  appointments: readonly Appointment[],
  timeOfDay: TimeOfDay,
  timezone?: string
): Appointment[] {
  if (timeOfDay === 'any') {
    return [...appointments];
  }
  return appointments.filter((appointment) => {
    if (!appointment.start) {
      return false;
    }
    const { hour } = getZonedParts(new Date(appointment.start), timezone);
    return timeOfDay === 'morning' ? hour < 12 : hour >= 12;
  });
}

/**
 * Groups proposed appointments into days, and each day into the sets of actors
 * offering those times.
 *
 * A search holds one set of actors, so a day usually has a single group. The
 * grouping is what names who the times are with, and it keeps the times from an
 * earlier search from being read as this one's when the selection changes.
 *
 * @param appointments - Proposed appointments from `$find`.
 * @param timezone - IANA timezone identifier. Defaults to the browser's.
 * @returns Days in ascending order, each holding its groups.
 */
export function groupAppointmentsByDay(appointments: readonly Appointment[], timezone?: string): AppointmentDay[] {
  const days = new Map<string, Map<string, Appointment[]>>();

  for (const appointment of appointments) {
    if (!appointment.start) {
      continue;
    }
    const { year, month, day } = getZonedParts(new Date(appointment.start), timezone);
    const dayKey = `${year}-${pad(month)}-${pad(day)}`;

    let groups = days.get(dayKey);
    if (!groups) {
      groups = new Map();
      days.set(dayKey, groups);
    }

    const groupKey = getActorGroupKey(appointment);
    const group = groups.get(groupKey);
    if (group) {
      group.push(appointment);
    } else {
      groups.set(groupKey, [appointment]);
    }
  }

  return [...days.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([dayKey, groups]) => ({
      key: dayKey,
      date: parseDayKey(dayKey),
      groups: [...groups.entries()]
        .map(([groupKey, groupAppointments]) => toSlotGroup(groupKey, groupAppointments))
        .sort((left, right) => left.key.localeCompare(right.key)),
    }));
}

function toSlotGroup(key: string, appointments: Appointment[]): AppointmentSlotGroup {
  const sorted = [...appointments].sort((left, right) => (left.start ?? '').localeCompare(right.start ?? ''));
  return {
    key,
    actors: sorted[0]?.participant?.map((participant) => participant.actor).filter(isDefined) ?? [],
    durationMinutes: getDurationMinutes(sorted[0]),
    appointments: sorted,
  };
}

/**
 * Builds a key identifying the set of actors an appointment is offered by.
 * @param appointment - The proposed appointment.
 * @returns A key that is stable across refetches.
 */
export function getActorGroupKey(appointment: Appointment): string {
  return getActorsKey((appointment.participant ?? []).map((participant) => participant.actor).filter(isDefined));
}

/**
 * Builds a key identifying a set of actors, independent of their order.
 * @param actors - The actors to key.
 * @returns The key.
 */
export function getActorsKey(actors: readonly Reference[]): string {
  return actors
    .map((actor) => getReferenceString(actor))
    .filter(isDefined)
    .sort((left, right) => left.localeCompare(right))
    .join('+');
}

/**
 * Returns an appointment's length in whole minutes.
 *
 * Taken from the proposed appointment itself rather than re-resolving
 * `SchedulingParameters`, which is what the server already did to produce it.
 *
 * @param appointment - The proposed appointment.
 * @returns The length in minutes, or 0 when either end is missing.
 */
export function getDurationMinutes(appointment: Appointment | undefined): number {
  if (!appointment?.start || !appointment.end) {
    return 0;
  }
  const start = new Date(appointment.start).getTime();
  const end = new Date(appointment.end).getTime();
  return Math.round((end - start) / 60000);
}

/**
 * Returns a key uniquely identifying a proposed appointment.
 *
 * Proposed appointments have no id, and consecutive pages meet at the boundary
 * of a day, so identity is the times plus the actors.
 *
 * @param appointment - The proposed appointment.
 * @returns The de-duplication key.
 */
export function getAppointmentKey(appointment: Appointment): string {
  return `${appointment.start}/${appointment.end}/${getActorGroupKey(appointment)}`;
}

/**
 * Finds the appointment offered at an exact time by an exact set of actors.
 *
 * Used to answer a request for a specific time: matching one of the offered
 * times hands back the server's own proposal, `contained` Slots and all, rather
 * than a look-alike built here.
 *
 * @param appointments - Proposed appointments from `$find`.
 * @param start - The requested start time.
 * @param actorsKey - The actors it must be with, from `getActorsKey`.
 * @returns The matching appointment, if one was offered.
 */
export function findAppointmentAt(
  appointments: readonly Appointment[],
  start: Date,
  actorsKey?: string
): Appointment | undefined {
  return appointments.find(
    (appointment) =>
      !!appointment.start &&
      new Date(appointment.start).getTime() === start.getTime() &&
      (actorsKey === undefined || getActorGroupKey(appointment) === actorsKey)
  );
}

export interface CustomAppointmentOptions {
  readonly start: Date;
  readonly durationMinutes: number;
  readonly actors: readonly SchedulingActor[];
  /** Schedules to hold the time on, which become the Slots a booking needs. */
  readonly schedules?: readonly Reference<Schedule>[];
  readonly serviceType?: CodeableConcept[];
}

/**
 * Builds a proposed Appointment for a time the server did not offer.
 *
 * Shaped like a `$find` result so a caller can handle it the same way, but the
 * times in it were never checked against anybody's availability: it exists for
 * the case where a user has decided to book over whatever is there.
 *
 * @param options - The time, length, actors, and schedules to hold.
 * @returns A proposed Appointment.
 */
export function buildCustomAppointment(options: CustomAppointmentOptions): Appointment {
  const start = options.start.toISOString();
  const end = new Date(options.start.getTime() + options.durationMinutes * 60 * 1000).toISOString();

  const contained: Slot[] = (options.schedules ?? []).map((schedule) => ({
    resourceType: 'Slot',
    status: 'busy',
    schedule,
    start,
    end,
  }));

  return {
    resourceType: 'Appointment',
    status: 'proposed',
    start,
    end,
    serviceType: options.serviceType,
    participant: options.actors.map((actor) => ({ actor, required: 'required', status: 'needs-action' })),
    contained: contained.length > 0 ? contained : undefined,
  };
}

export interface AppointmentBookingDetails {
  /** Who the appointment is for. Added as a participant if it is not one already. */
  readonly patient?: Reference<Patient>;
  /** Why the visit is happening, recorded for the practice. */
  readonly comment?: string;
  /** What the patient is told to do before the visit. */
  readonly patientInstruction?: string;
}

/**
 * Fills in the parts of a proposed appointment that only the person booking it
 * knows.
 *
 * `$find` proposes a time on a set of calendars and nothing more, so the patient
 * and anything written about the visit are added here, on the way to `$book`.
 * The proposal is left otherwise untouched, `contained` Slots and all, because
 * the server validates what it produced against what comes back.
 *
 * @param appointment - The proposed appointment being booked.
 * @param details - The patient and notes gathered while confirming.
 * @returns A copy of the appointment, ready to book.
 */
export function applyBookingDetails(appointment: Appointment, details: AppointmentBookingDetails): Appointment {
  const participant = [...(appointment.participant ?? [])];
  const patientReference = details.patient?.reference;

  if (details.patient && !participant.some((existing) => existing.actor?.reference === patientReference)) {
    participant.push({ actor: details.patient, required: 'required', status: 'accepted' });
  }

  return {
    ...appointment,
    participant,
    comment: trimToUndefined(details.comment) ?? appointment.comment,
    patientInstruction: trimToUndefined(details.patientInstruction) ?? appointment.patientInstruction,
  };
}

function trimToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === '' ? undefined : trimmed;
}

/**
 * Reads the visit length configured for a service, in minutes.
 *
 * The same precedence the server applies: a Schedule's parameters for the
 * service win over the service's own.
 *
 * @param service - The service being booked.
 * @param schedule - A Schedule that may override the service's parameters.
 * @returns The configured length, or undefined when none is configured.
 */
export function getConfiguredDurationMinutes(
  service: WithId<HealthcareService> | undefined,
  schedule?: Schedule
): number | undefined {
  if (!service) {
    return undefined;
  }
  const fromSchedule = schedule
    ? getScheduleParameters(schedule, service, 'duration').map(readDurationMinutes).find(isDefined)
    : undefined;
  if (fromSchedule !== undefined) {
    return fromSchedule;
  }

  // A HealthcareService's parameters are about itself, so there is no service reference to match on.
  return getExtensions(service, [SchedulingParametersURI, 'duration']).map(readDurationMinutes).find(isDefined);
}

function readDurationMinutes(duration: Extension): number | undefined {
  return durationToMinutes(duration.valueDuration);
}

/**
 * Converts a `YYYY-MM-DD` key into local midnight of that calendar day.
 *
 * The calendar reads dates with `getDate()` and friends, so a day identified in
 * the schedule's timezone has to be re-expressed locally to land on the right
 * cell.
 *
 * @param key - A `YYYY-MM-DD` day key.
 * @returns Local midnight of that day.
 */
export function parseDayKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

/**
 * Returns the input type to use for a date or time field.
 *
 * JSDOM does not fire change events for `<input type="date">` or
 * `<input type="time">`, so tests get a plain text field, matching what
 * `DateTimeInput` does.
 *
 * @param type - The native input type to use outside of tests.
 * @returns The input type for the current environment.
 */
export function getNativeInputType(type: 'date' | 'time'): string {
  return import.meta.env.NODE_ENV === 'test' ? 'text' : type;
}

export interface FindWindow {
  readonly start: Date;
  readonly end: Date;
}

/**
 * How many times one `$find` request asks for.
 *
 * The operation's own default is 20, which is a morning rather than a page, and
 * it fills the window from the front: a request left at the default would answer
 * a fortnight with the first day of it and quietly leave the rest looking empty.
 * The ceiling the server allows is 1000.
 */
export const DEFAULT_FIND_COUNT = 500;

/** What one `$find` request asks for. */
export interface FindRequest {
  /** The service being booked, as a reference string. */
  readonly service: string;
  /** Schedules to intersect. A time is offered only when all of them are free. */
  readonly schedules: readonly string[];
  readonly start: Date;
  readonly end: Date;
  /** Most times to return. Defaults to `DEFAULT_FIND_COUNT`. */
  readonly count?: number;
}

export interface FindAppointmentsOptions {
  /** Aborts the request. */
  readonly signal?: AbortSignal;
}

/**
 * Runs one `Appointment/$find` request.
 *
 * Shared so that the two searches the finder runs — the times being read and the
 * scan behind the calendar's marks — ask in exactly the same way, and differ only
 * in the window and the count they pass.
 *
 * @param medplum - The Medplum client.
 * @param request - What to ask for.
 * @param options - Fetch options.
 * @returns The proposed appointments, and whether the count cut them short.
 */
export async function findAppointments(
  medplum: MedplumClient,
  request: FindRequest,
  options?: FindAppointmentsOptions
): Promise<{ appointments: Appointment[]; truncated: boolean }> {
  const count = request.count ?? DEFAULT_FIND_COUNT;
  const url = medplum.fhirUrl('Appointment', '$find');
  url.searchParams.append('start', request.start.toISOString());
  url.searchParams.append('end', request.end.toISOString());
  url.searchParams.append('service-type-reference', request.service);
  for (const schedule of request.schedules) {
    url.searchParams.append('schedule', schedule);
  }
  url.searchParams.append('_count', count.toString());

  const bundle = await medplum.get<Bundle<Appointment>>(url, { signal: options?.signal });
  const appointments = (bundle.entry ?? []).map((entry) => entry.resource).filter(isDefined);
  // A full page means the window was answered as far as the count reached and no
  // further, which is not the same as there being nothing after it.
  return { appointments, truncated: appointments.length >= count };
}

/**
 * Returns one page of a search, working forwards from where it starts.
 *
 * `$find` refuses a range longer than 31 days, and a user is not asking to read
 * a month of times at once anyway, so a search runs a couple of weeks at a time
 * and reaches further out only when asked to. Pages end at the close of a day,
 * which keeps each one whole days long and lets how far the search has reached
 * be named as a date.
 *
 * @param start - Where the whole search begins.
 * @param end - Where the whole search ends, or undefined to keep reaching further out.
 * @param index - Which page to return, counting from zero.
 * @param pageDays - Days per page. Defaults to a fortnight, capped near the operation's limit.
 * @returns The window to search, or undefined once the range is used up.
 */
export function getFindWindow(
  start: Date,
  end: Date | undefined,
  index: number,
  pageDays = DEFAULT_FIND_PAGE_DAYS
): FindWindow | undefined {
  const days = Math.min(Math.max(Math.floor(pageDays), 1), MAX_PAGE_DAYS);
  // The first page opens at the requested instant, so a search starting midway
  // through today does not offer times that have already passed.
  const from = index <= 0 ? start : endOfDay(addDays(start, index * days - 1));
  const until = endOfDay(addDays(start, (index + 1) * days - 1));
  if (end && end < until) {
    return end > from ? { start: from, end } : undefined;
  }
  return { start: from, end: until };
}

/**
 * Returns the last instant of a day, so that a range covers the whole of it.
 * @param date - Any instant during the day.
 * @returns Local midnight less a millisecond, at the end of that day.
 */
export function endOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/** The days a search covers. Either end may be open. */
export interface DateRange {
  readonly start?: Date;
  readonly end?: Date;
}

/**
 * Returns the last instant of a date's month.
 * @param date - Any instant during the month.
 * @returns The close of that month's last day.
 */
export function endOfMonth(date: Date): Date {
  return endOfDay(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

/**
 * Lists the days a range covers, for marking them on the calendar.
 *
 * @param range - The days asked for.
 * @param limit - The most days to return, so an open-ended range stays bounded.
 * @returns Local midnight of each day, or an empty array for an open range.
 */
export function enumerateDateRange(range: DateRange, limit = MAX_FIND_WINDOW_DAYS): Date[] {
  if (!range.start || !range.end) {
    return range.start ? [range.start] : [];
  }
  const days: Date[] = [];
  for (let day = range.start; day <= range.end && days.length < limit; day = addDays(day, 1)) {
    days.push(day);
  }
  return days;
}

/**
 * Says in words which days a search covers.
 * @param range - The days asked for.
 * @returns The range as a phrase, or undefined when both ends are open.
 */
export function formatDateRange(range: DateRange): string | undefined {
  const { start, end } = range;
  if (start && end) {
    return isSameDay(start, end) ? formatDayHeading(start) : `${formatDayHeading(start)} – ${formatDayHeading(end)}`;
  }
  if (start) {
    return `From ${formatDayHeading(start)}`;
  }
  if (end) {
    return `Through ${formatDayHeading(end)}`;
  }
  return undefined;
}
