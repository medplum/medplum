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

/** Underlying resources for schedulable actors. */
export type ConfigurableActorResource = WithId<Practitioner> | WithId<Location> | WithId<Device>;

/** An actor and its linked Schedules. */
export interface ConfigurableActor<T extends ConfigurableActorResource = ConfigurableActorResource> {
  readonly resource: T;
  /** Excludes multi-actor Schedules, which aren't supported in scheduling workflows. */
  readonly schedules: WithId<Schedule>[];
}

/** Actor resources which are configurable in the scheduling system. */
export interface ConfigurableActorsResult<T extends ConfigurableActorResource = ConfigurableActorResource> {
  /** The actors found, by name. */
  readonly actors: ConfigurableActor<T>[];
  /** False when `limit` stopped the read with more left. */
  readonly complete: boolean;
}

type ActorOf<K extends BookableActorType> = Extract<ConfigurableActorResource, { resourceType: K }>;

/** Locations are only those typed as a room or a bed, leaving out service facilities. */
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
 * Finds every provider, room, or device that a project holds, with each actor's linked Schedules, if they exist.
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

function groupBySoleActor(schedules: readonly WithId<Schedule>[]): Map<string, WithId<Schedule>[]> {
  const byActor = new Map<string, WithId<Schedule>[]>();
  for (const schedule of schedules) {
    const reference = schedule.actor.length === 1 ? schedule.actor[0].reference : undefined;
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
