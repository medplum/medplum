// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient } from '@medplum/core';
import { getDisplayString, getReferenceString } from '@medplum/core';
import type { HealthcareService, Location, PractitionerRole, Reference } from '@medplum/fhirtypes';
import type { ConfigurableActorResource } from '../configSearch';

/** How far up a `partOf` chain of Locations to look, as booking does. */
const MAX_LOCATION_DEPTH = 4;

/** Where an actor is, as far as booking's service facility filter can tell. */
export interface ActorFacilities {
  /**
   * Every Location the actor counts as being at: a room's service facility and that facility's ancestors, a
   * device's location and its ancestors, or each location of a provider's active roles. Empty when nothing
   * records where the actor is, which leaves it bookable at every service facility.
   */
  readonly references: readonly string[];
  /** The service facilities to name when saying where the actor is, the nearest first. */
  readonly names: readonly string[];
}

/** An actor nothing places, so booking offers it everywhere. */
export const UNRESTRICTED: ActorFacilities = { references: [], names: [] };

/**
 * Finds where each actor is, reading what booking reads to decide it: a room's or device's Location and its
 * ancestors, and a provider's active roles. A Location that can't be read ends its chain there, and roles that
 * can't be read leave their providers unrestricted, as booking treats both.
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
          return [reference, await walkUp(medplum, actor.partOf, signal)];
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
  const held = (service.location ?? []).map((location) => normalizeReference(location.reference));
  if (held.length === 0 || facilities.references.length === 0) {
    return true;
  }
  return held.some((reference) => reference !== undefined && facilities.references.includes(reference));
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

async function searchActiveRoles(
  medplum: MedplumClient,
  practitioners: readonly ConfigurableActorResource[],
  signal: AbortSignal | undefined
): Promise<PractitionerRole[]> {
  try {
    return await medplum.searchResources(
      'PractitionerRole',
      {
        practitioner: practitioners.map((practitioner) => getReferenceString(practitioner)).join(','),
        // An inactive role no longer places the person, which is how booking reads them too.
        'active:not': 'false',
        _count: '1000',
      },
      { signal }
    );
  } catch {
    return [];
  }
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
  signal: AbortSignal | undefined
): Promise<ActorFacilities> {
  const references: string[] = [];
  const names: string[] = [];
  let current = normalizeReference(start?.reference);
  for (let depth = 0; current && depth < MAX_LOCATION_DEPTH; depth++) {
    references.push(current);
    const location = await readLocation(medplum, current, signal);
    names.push(location ? getDisplayString(location) : (start?.display ?? current));
    current = normalizeReference(location?.partOf?.reference);
  }
  return { references, names: names.slice(0, 1) };
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
