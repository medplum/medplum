// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient } from '@medplum/core';
import { getDisplayString, getReferenceString } from '@medplum/core';
import type { HealthcareService, Location, PractitionerRole, Reference } from '@medplum/fhirtypes';
import type { ConfigurableActorResource } from '../configSearch';

/** How far up a `partOf` chain of Locations to look, as booking does. */
const MAX_LOCATION_DEPTH = 4;

/** Providers per role search, so the query string stays well inside URL length limits. */
const ROLE_SEARCH_BATCH = 50;

/** Where an actor is, as far as booking's service facility filter can tell. */
export interface ActorFacilities {
  /**
   * Every Location the actor counts as being at: a room itself and its ancestors, a
   * device's location and its ancestors, or each location of a provider's active roles. Empty when nothing
   * records where the actor is, which leaves it bookable at every service facility.
   */
  readonly references: readonly string[];
  /** An unreadable or too-deep location chain cannot rule out any service facility. */
  readonly incomplete?: boolean;
  /** The service facilities to name when saying where the actor is, the nearest first. */
  readonly names: readonly string[];
  /** For a room or device, the Locations it sits within, the nearest first. */
  readonly chain?: readonly string[];
}

/** An actor nothing places, so booking offers it everywhere. */
export const UNRESTRICTED: ActorFacilities = { references: [], names: [] };

/**
 * Finds where each actor is, reading what booking reads to decide it: a room's or device's Location and its
 * ancestors, and a provider's active roles. An unreadable or too-deep location chain, or unreadable roles,
 * leaves the actor unrestricted, as booking treats both.
 * @param medplum - The Medplum client.
 * @param actors - The providers, rooms, and devices to place. A room or device may be a draft with edits.
 * @param signal - Aborts the reads.
 * @returns Where each actor is, keyed by its reference.
 */
export async function resolveActorFacilities(
  medplum: MedplumClient,
  actors: readonly ConfigurableActorResource[],
  signal?: AbortSignal
): Promise<Map<string, ActorFacilities>> {
  const practitioners = actors.filter((actor) => actor.resourceType === 'Practitioner');
  const roles = practitioners.length > 0 ? await searchActiveRoles(medplum, practitioners, signal) : [];

  const entries = await Promise.all(
    actors.map(async (actor): Promise<[string, ActorFacilities]> => {
      const reference = getReferenceString(actor);
      switch (actor.resourceType) {
        case 'Practitioner':
          return [reference, await placeByRoles(medplum, reference, roles, signal)];
        case 'Location':
          return [reference, await walkUp(medplum, { reference }, signal, actor)];
        case 'Device':
          return [reference, await walkUp(medplum, actor.location, signal)];
        default:
          return [reference, UNRESTRICTED];
      }
    })
  );
  return new Map(entries);
}

/**
 * Whether booking would offer a visit type with an actor at some service facility. It would when either is
 * unrestricted, or when the visit type is held at a service facility the actor is at.
 * @param service - The visit type, as stored or as edited.
 * @param facilities - Where the actor is.
 * @returns True when the two share a service facility.
 */
export function sharesServiceFacility(
  service: Pick<HealthcareService, 'location'>,
  facilities: ActorFacilities
): boolean {
  if (isHeldEverywhere(service.location) || facilities.incomplete || facilities.references.length === 0) {
    return true;
  }
  return (service.location ?? []).some((location) => {
    const reference = normalizeReference(location.reference);
    return reference !== undefined && facilities.references.includes(reference);
  });
}

/**
 * Whether a visit type names no service facility, so booking offers it with every actor wherever the actor is.
 * @param location - The visit type's `location`, as stored or as edited.
 * @returns True when it names none.
 */
export function isHeldEverywhere(location: readonly Reference<Location>[] | undefined): boolean {
  return !location?.length;
}

/**
 * Says why a visit type can't be booked with an actor, for one that shares no service facility with it.
 * @param serviceName - The visit type's name.
 * @param facilities - Where the actor is.
 * @returns The reason, such as `Cystoscopy isn't held at Downtown Clinic`.
 */
export function describeNoSharedFacility(serviceName: string, facilities: ActorFacilities): string {
  const names = facilities.names;
  const where =
    names.length < 2 ? (names[0] ?? 'this service facility') : `${names.slice(0, -1).join(', ')} or ${names.at(-1)}`;
  return `${serviceName} isn't held at ${where}`;
}

/**
 * Says where a visit type is held, for one an actor shares no service facility with.
 * @param service - The visit type.
 * @param names - Service facility names, keyed by reference, from `resolveLocationNames`.
 * @returns The reason, such as `Held only at Downtown Clinic and Northside`.
 */
export function describeHeldOnlyAt(
  service: Pick<HealthcareService, 'location'>,
  names: ReadonlyMap<string, string>
): string {
  const held = (service.location ?? []).map((location) => {
    const reference = normalizeReference(location.reference);
    return (reference && names.get(reference)) ?? location.display ?? location.reference ?? 'an unnamed location';
  });
  const where = held.length < 2 ? held[0] : `${held.slice(0, -1).join(', ')} and ${held.at(-1)}`;
  return `Held only at ${where}`;
}

/**
 * Names Locations by the resources themselves, rather than by what a reference displays.
 * @param medplum - The Medplum client.
 * @param locations - The Locations to name.
 * @param signal - Aborts the reads.
 * @returns Each readable Location's name, keyed by its reference.
 */
export async function resolveLocationNames(
  medplum: MedplumClient,
  locations: readonly Reference<Location>[],
  signal?: AbortSignal
): Promise<Map<string, string>> {
  const references = [...new Set(locations.map((location) => normalizeReference(location.reference)))].filter(
    (reference) => reference !== undefined
  );
  const entries = await Promise.all(
    references.map(async (reference): Promise<[string, string] | undefined> => {
      const location = await readLocation(medplum, reference, signal);
      return location ? [reference, getDisplayString(location)] : undefined;
    })
  );
  return new Map(entries.filter((entry) => entry !== undefined));
}

async function searchActiveRoles(
  medplum: MedplumClient,
  practitioners: readonly ConfigurableActorResource[],
  signal: AbortSignal | undefined
): Promise<PractitionerRole[]> {
  const references = practitioners.map((practitioner) => getReferenceString(practitioner));
  const batches: string[][] = [];
  for (let start = 0; start < references.length; start += ROLE_SEARCH_BATCH) {
    batches.push(references.slice(start, start + ROLE_SEARCH_BATCH));
  }
  const found = await Promise.all(
    batches.map(async (batch) => {
      try {
        return await medplum.searchResources(
          'PractitionerRole',
          {
            practitioner: batch.join(','),
            // An inactive role no longer places the person, which is how booking reads them too.
            'active:not': 'false',
            _count: '1000',
          },
          { signal }
        );
      } catch {
        return [];
      }
    })
  );
  return found.flat();
}

async function placeByRoles(
  medplum: MedplumClient,
  practitioner: string,
  roles: readonly PractitionerRole[],
  signal: AbortSignal | undefined
): Promise<ActorFacilities> {
  const references = [
    ...new Set(
      roles
        .filter((role) => normalizeReference(role.practitioner?.reference) === practitioner)
        .flatMap((role) => role.location ?? [])
        .map((location) => normalizeReference(location.reference))
        .filter((reference) => reference !== undefined)
    ),
  ];
  const names = await Promise.all(references.map(async (reference) => nameOf(medplum, { reference }, signal)));
  return { references, names };
}

async function walkUp(
  medplum: MedplumClient,
  start: Reference<Location> | undefined,
  signal: AbortSignal | undefined,
  room?: Location
): Promise<ActorFacilities> {
  const references: string[] = [];
  const names: string[] = [];
  let current = normalizeReference(start?.reference);
  for (let depth = 0; current && depth < MAX_LOCATION_DEPTH; depth++) {
    references.push(current);
    const location = depth === 0 && room ? room : await readLocation(medplum, current, signal);
    names.push(location ? getDisplayString(location) : (start?.display ?? current));
    if (!location) {
      break;
    }
    current = normalizeReference(location.partOf?.reference);
  }
  // A remaining reference means a read failed or the depth limit stopped the walk, as in booking.
  // Rooms match themselves too, but explanations still name their nearest parent when present.
  const nameIndex = room?.partOf?.reference ? 1 : 0;
  return {
    references,
    names: names.slice(nameIndex, nameIndex + 1),
    chain: room ? names.slice(1) : names,
    ...(current && { incomplete: true }),
  };
}

async function nameOf(
  medplum: MedplumClient,
  reference: Reference<Location> & { reference: string },
  signal: AbortSignal | undefined
): Promise<string> {
  const location = await readLocation(medplum, reference.reference, signal);
  return location ? getDisplayString(location) : (reference.display ?? reference.reference);
}

async function readLocation(
  medplum: MedplumClient,
  reference: string,
  signal: AbortSignal | undefined
): Promise<Location | undefined> {
  try {
    return await medplum.readReference<Location>({ reference }, { signal });
  } catch {
    return undefined;
  }
}

// Compared by type and id only, since a stored reference may carry a version.
function normalizeReference(reference: string | undefined): string | undefined {
  if (!reference) {
    return undefined;
  }
  const [resourceType, id] = reference.split('/');
  return id ? `${resourceType}/${id}` : undefined;
}
