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

// The most the server returns in one page. Each list reads a single page; a project with more needs a paginated
// list rather than a longer read.
const PAGE_SIZE = '1000';

export interface ConfigSearchOptions {
  readonly signal?: AbortSignal;
}

export interface ConfigurableServicesResult {
  /** The visit types found, by name. */
  readonly services: WithId<HealthcareService>[];
  /** False when the project holds more than one page, so this is a prefix of it rather than all of it. */
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
  /** False when the project holds more than one page. */
  readonly complete: boolean;
}

type ActorOf<K extends BookableActorType> = Extract<ConfigurableActorResource, { resourceType: K }>;

// Sorted on the server so that a project with more than one page lists its first actors by name rather than
// an arbitrary thousand.
const ACTOR_SORT: Record<BookableActorType, Record<string, string>> = {
  Practitioner: { _sort: 'name' },
  Location: { _sort: 'name' },
  Device: { _sort: 'device-name' },
};

const ROOM_PHYSICAL_TYPES = new Set(['ro', 'bd']);

/**
 * Finds every visit type a project holds, including deactivated ones and ones with no scheduling parameters.
 * The search behind `AppointmentServiceSelect` drops both, since neither can be booked.
 * @param medplum - The Medplum client.
 * @param options - An abort signal.
 * @returns The visit types by name, and whether that is all of them.
 */
export async function searchConfigurableServices(
  medplum: MedplumClient,
  options: ConfigSearchOptions = {}
): Promise<ConfigurableServicesResult> {
  const services = await medplum.searchResources(
    'HealthcareService',
    { _sort: 'name', _count: PAGE_SIZE },
    { signal: options.signal }
  );
  // A cached result resolves whether or not the signal has since aborted.
  options.signal?.throwIfAborted();
  return { services, complete: !hasNextPage(services.bundle) };
}

/**
 * Finds every provider, room, or device that a project holds, with each actor's linked Schedules, if they exist.
 * @param medplum - The Medplum client.
 * @param resourceType - Which actors to read.
 * @param options - An abort signal.
 * @returns The actors by name, and whether that is all of them.
 */
export async function searchConfigurableActors<K extends BookableActorType>(
  medplum: MedplumClient,
  resourceType: K,
  options: ConfigSearchOptions = {}
): Promise<ConfigurableActorsResult<ActorOf<K>>> {
  const page = await medplum.searchResources(
    resourceType,
    { ...ACTOR_SORT[resourceType], _count: PAGE_SIZE, _revinclude: 'Schedule:actor' },
    { signal: options.signal }
  );
  options.signal?.throwIfAborted();
  const actors: ActorOf<K>[] = [];
  const schedules: WithId<Schedule>[] = [];
  // The page is typed as the actors, but `_revinclude` puts their Schedules in the same array.
  for (const resource of page as readonly WithId<Resource>[]) {
    if (resource.resourceType === resourceType) {
      actors.push(resource as ActorOf<K>);
    } else if (resource.resourceType === 'Schedule') {
      schedules.push(resource);
    }
  }

  const byActor = groupBySoleActor(schedules);
  const found = actors
    .map((resource) => ({ resource, schedules: byActor.get(`${resource.resourceType}/${resource.id}`) ?? [] }))
    .filter(isConfigurable);
  return { actors: sortByName(found), complete: !hasNextPage(page.bundle) };
}

// Rooms are the Locations typed as a room or a bed, and any Location with a Schedule, which booking lists as a
// room whatever its type. Every other Location is a service facility, not an actor.
function isConfigurable(actor: ConfigurableActor): boolean {
  if (actor.resource.resourceType !== 'Location') {
    return true;
  }
  return (
    actor.schedules.length > 0 ||
    (actor.resource.physicalType?.coding ?? []).some((coding) => ROOM_PHYSICAL_TYPES.has(coding.code ?? ''))
  );
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

function hasNextPage(bundle: Bundle): boolean {
  return !!bundle.link?.some((link) => link.relation === 'next');
}
