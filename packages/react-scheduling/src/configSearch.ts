// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
/*
 * Reads everything a configuration surface lists, as opposed to what booking may offer. The booking searches
 * leave out deactivated and unconfigured resources because nobody can book them; an administrator comes
 * looking for exactly those, to finish configuring or to turn back on.
 */
import type { MedplumClient, WithId } from '@medplum/core';
import { getDisplayString } from '@medplum/core';
import type { Bundle, Device, HealthcareService, Location, Practitioner, Resource, Schedule } from '@medplum/fhirtypes';
import type { BookableActorType } from './actors';
import { getActorType, isBookableActorType } from './actors';

// The list waits for every page before it renders, so fewer, larger requests finish sooner. 1000 is also
// what `searchResourcePages` asks for when `_count` is left unset.
const DEFAULT_PAGE_SIZE = 1000;

const DEFAULT_LIMIT = 2000;

export interface ConfigSearchOptions {
  readonly signal?: AbortSignal;
  /** How many resources to read per request. Defaults to 1000. */
  readonly pageSize?: number;
  /** The most resources to read. Reading stops there and the result reports itself incomplete. Defaults to 2000. */
  readonly limit?: number;
}

export interface ConfigurableServicesResult {
  /** The visit types found, by name. */
  readonly services: WithId<HealthcareService>[];
  /** False when `limit` stopped the read with more left, so this is a prefix of the project rather than all of it. */
  readonly complete: boolean;
}

/** A provider, room, or device, as the configuration surface lists them. */
export type ConfigurableActorResource = WithId<Practitioner> | WithId<Location> | WithId<Device>;

/** A provider, room, or device, with the calendars it holds on its own. */
export interface ConfigurableActor<T extends ConfigurableActorResource = ConfigurableActorResource> {
  readonly resource: T;
  /**
   * The Schedules whose only actor is this one. Most actors hold none or one. A Schedule shared with another
   * actor is left out, since scheduling cannot book it.
   */
  readonly schedules: WithId<Schedule>[];
}

export interface ConfigurableActorsResult<T extends ConfigurableActorResource = ConfigurableActorResource> {
  /** The actors found, by name. */
  readonly actors: ConfigurableActor<T>[];
  /** False when `limit` stopped the read with more left. */
  readonly complete: boolean;
}

export interface ConfigurableCalendarsResult {
  /**
   * The Locations that are some Schedule's only actor, each with those Schedules. A room booked today may never
   * have been typed as one, so the rooms search alone would miss it.
   */
  readonly locations: ConfigurableActor<WithId<Location>>[];
  /** False when `limit` stopped the read with more left. */
  readonly complete: boolean;
  /**
   * Calendars read but left out because they hold more than one actor, or an actor of a type this package
   * does not schedule. Scheduling cannot book either, so they are misconfigured rather than hidden.
   */
  readonly skipped: number;
}

type ActorOf<K extends BookableActorType> = Extract<ConfigurableActorResource, { resourceType: K }>;

/**
 * What each actor search filters on. Rooms are the Locations typed as a room or a bed, which leaves out the
 * service facilities they sit in. Providers and devices are every one of them.
 */
const ACTOR_CRITERIA: Record<BookableActorType, Record<string, string>> = {
  Practitioner: {},
  Location: { 'physical-type': 'ro,bd' },
  Device: {},
};

/**
 * Finds every visit type a project holds, including deactivated ones and ones with no scheduling parameters.
 * The search behind `AppointmentServiceSelect` drops both, since neither can be booked.
 * @param medplum - The Medplum client.
 * @param options - An abort signal, and the read's bounds.
 * @returns The visit types by name, and whether the read reached the end.
 */
export async function searchConfigurableServices(
  medplum: MedplumClient,
  options: ConfigSearchOptions = {}
): Promise<ConfigurableServicesResult> {
  const { signal, pageSize = DEFAULT_PAGE_SIZE, limit = DEFAULT_LIMIT } = options;
  const services: WithId<HealthcareService>[] = [];

  const pages = medplum.searchResourcePages(
    'HealthcareService',
    { _sort: 'name', _count: pageSize.toString() },
    { signal }
  );
  for await (const page of pages) {
    signal?.throwIfAborted();
    services.push(...page);
    if (services.length >= limit) {
      return { services: services.slice(0, limit), complete: !hasMore(services.length, limit, page.bundle) };
    }
  }

  return { services, complete: true };
}

/**
 * Finds every provider, room, or device a project holds, each with its calendars, including ones that are
 * turned off and ones with no calendar yet. Booking's searches start from the Schedules, so they can't show an
 * actor without one.
 *
 * Rooms are the Locations typed as a room or a bed. A Location booked as a room without being typed as one is
 * found by `searchConfigurableCalendars` instead.
 * @param medplum - The Medplum client.
 * @param resourceType - Which actors to read.
 * @param options - An abort signal, and the read's bounds.
 * @returns The actors by name, and whether the read reached the end.
 */
export async function searchConfigurableActors<K extends BookableActorType>(
  medplum: MedplumClient,
  resourceType: K,
  options: ConfigSearchOptions = {}
): Promise<ConfigurableActorsResult<ActorOf<K>>> {
  const { signal, pageSize = DEFAULT_PAGE_SIZE, limit = DEFAULT_LIMIT } = options;
  const actors: ActorOf<K>[] = [];
  const schedules: WithId<Schedule>[] = [];
  let complete = true;

  const pages = medplum.searchResourcePages(
    resourceType,
    { ...ACTOR_CRITERIA[resourceType], _count: pageSize.toString(), _revinclude: 'Schedule:actor' },
    { signal }
  );
  for await (const page of pages) {
    signal?.throwIfAborted();
    // The page is typed as the actors, but `_revinclude` puts their Schedules in the same array.
    for (const resource of page as readonly WithId<Resource>[]) {
      if (resource.resourceType === resourceType) {
        actors.push(resource as ActorOf<K>);
      } else if (resource.resourceType === 'Schedule') {
        schedules.push(resource);
      }
    }
    if (actors.length >= limit) {
      complete = !hasMore(actors.length, limit, page.bundle);
      break;
    }
  }

  const byActor = groupBySoleActor(schedules);
  const found = actors.slice(0, limit).map((resource) => ({
    resource,
    schedules: byActor.get(`${resource.resourceType}/${resource.id}`) ?? [],
  }));
  return { actors: sortByName(found), complete };
}

/**
 * Reads every calendar a project holds, to find the Locations booked as rooms that the rooms search misses
 * because nobody typed them as one, and to count the calendars scheduling cannot book at all.
 * @param medplum - The Medplum client.
 * @param options - An abort signal, and the read's bounds.
 * @returns The Locations that are a Schedule's only actor, whether the read reached the end, and how many
 * calendars were left out.
 */
export async function searchConfigurableCalendars(
  medplum: MedplumClient,
  options: ConfigSearchOptions = {}
): Promise<ConfigurableCalendarsResult> {
  const { signal, pageSize = DEFAULT_PAGE_SIZE, limit = DEFAULT_LIMIT } = options;
  const schedules: WithId<Schedule>[] = [];
  const locations = new Map<string, WithId<Location>>();
  let complete = true;

  const pages = medplum.searchResourcePages(
    'Schedule',
    { _count: pageSize.toString(), _include: 'Schedule:actor:Location' },
    { signal }
  );
  for await (const page of pages) {
    signal?.throwIfAborted();
    // The page is typed as Schedules, but `_include` puts each page's Locations in the same array.
    for (const resource of page as readonly (WithId<Schedule> | WithId<Location>)[]) {
      if (resource.resourceType === 'Schedule') {
        schedules.push(resource);
      } else {
        locations.set(`Location/${resource.id}`, resource);
      }
    }
    if (schedules.length >= limit) {
      complete = !hasMore(schedules.length, limit, page.bundle);
      break;
    }
  }

  const read = schedules.slice(0, limit);
  const skipped = read.filter((schedule) => !getSoleActorReference(schedule)).length;
  const found: ConfigurableActor<WithId<Location>>[] = [];
  for (const [reference, held] of groupBySoleActor(read)) {
    const resource = locations.get(reference);
    if (resource) {
      found.push({ resource, schedules: held });
    }
  }
  return { locations: sortByName(found), complete, skipped };
}

// The reference of a Schedule's only actor, or undefined for a Schedule scheduling cannot book: one with
// several actors, or with an actor of a type it does not schedule.
function getSoleActorReference(schedule: Schedule): string | undefined {
  const actor = schedule.actor.length === 1 ? schedule.actor[0] : undefined;
  return actor?.reference && isBookableActorType(getActorType(actor)) ? actor.reference : undefined;
}

function groupBySoleActor(schedules: readonly WithId<Schedule>[]): Map<string, WithId<Schedule>[]> {
  const byActor = new Map<string, WithId<Schedule>[]>();
  for (const schedule of schedules) {
    const reference = getSoleActorReference(schedule);
    if (reference) {
      byActor.set(reference, [...(byActor.get(reference) ?? []), schedule]);
    }
  }
  return byActor;
}

function sortByName<T extends ConfigurableActor>(actors: T[]): T[] {
  return actors.sort((left, right) => getDisplayString(left.resource).localeCompare(getDisplayString(right.resource)));
}

// Reading exactly `limit` is only a prefix when something was left over, either on the page just read or
// behind the next one.
function hasMore(read: number, limit: number, bundle: Bundle): boolean {
  return read > limit || !!bundle.link?.some((link) => link.relation === 'next');
}
