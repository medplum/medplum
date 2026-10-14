// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { createReference } from '@medplum/core';
import type { Location, Practitioner, PractitionerRole, Reference } from '@medplum/fhirtypes';
import { SERVICE_FACILITY_ROLE_SYSTEM } from '../../constants';
import type { ConfigChange } from '../ConfigPage/configSave';

/*
 * A provider's service facilities are the locations of their active PractitionerRoles, which is how booking
 * places them. The workspace writes one role per provider, its own, marked with `SERVICE_FACILITY_ROLE_SYSTEM`.
 * Every other role, such as one a sync wrote, places the provider too but is never changed here. The workspace's
 * role is turned off rather than emptied, and never deleted.
 */

/**
 * Reduces a reference to its type and id, since a stored reference may carry a version.
 * @param reference - The reference string.
 * @returns `ResourceType/id`, or undefined for one that isn't a relative reference.
 */
export function normalizeReference(reference: string | undefined): string | undefined {
  if (!reference) {
    return undefined;
  }
  const [resourceType, id] = reference.split('/');
  return id ? `${resourceType}/${id}` : undefined;
}

function isOwnRole(role: PractitionerRole): boolean {
  return !!role.identifier?.some((identifier) => identifier.system === SERVICE_FACILITY_ROLE_SYSTEM);
}

function isActive(role: PractitionerRole): boolean {
  return role.active !== false;
}

function referencesOf(role: PractitionerRole): string[] {
  return (role.location ?? []).flatMap((location) => normalizeReference(location.reference) ?? []);
}

/** A provider's service facilities, as their roles place them. */
export interface ProviderFacilities {
  /** One per service facility any active role names, in the order the roles name them. */
  readonly facilities: Reference<Location>[];
  /** The service facilities an active role other than the workspace's names, which can't be removed here. */
  readonly locked: ReadonlySet<string>;
}

/**
 * Reads a provider's service facilities off their roles. A service facility shows once however many roles name
 * it, and is locked when an active role other than the workspace's names it.
 * @param roles - Every role naming the provider, active or not.
 * @returns The service facilities, each reference carrying only type and id.
 */
export function providerFacilitiesOf(roles: readonly PractitionerRole[]): ProviderFacilities {
  const facilities = new Map<string, Reference<Location>>();
  const locked = new Set<string>();
  for (const role of roles.filter(isActive)) {
    for (const location of role.location ?? []) {
      const reference = normalizeReference(location.reference);
      if (!reference) {
        continue;
      }
      if (!facilities.has(reference)) {
        facilities.set(reference, { reference, ...(location.display && { display: location.display }) });
      }
      if (!isOwnRole(role)) {
        locked.add(reference);
      }
    }
  }
  return { facilities: [...facilities.values()], locked };
}

/**
 * Works out the write to the workspace's role that leaves a provider at exactly the service facilities given.
 *
 * The role keeps the service facilities it names that are still wanted, and takes on each wanted one no other
 * active role names. It is created the first time it has one to hold.
 * @param roles - Every role naming the provider, active or not, as stored.
 * @param practitioner - The provider.
 * @param facilities - The service facilities the provider should be at.
 * @returns The change to the workspace's role, or none when the roles already place the provider there.
 */
export function buildRoleChanges(
  roles: readonly WithId<PractitionerRole>[],
  practitioner: WithId<Practitioner>,
  facilities: readonly Reference<Location>[]
): ConfigChange<PractitionerRole>[] {
  const wanted = new Set(facilities.flatMap((facility) => normalizeReference(facility.reference) ?? []));
  const placedElsewhere = new Set(roles.filter((role) => isActive(role) && !isOwnRole(role)).flatMap(referencesOf));
  const own = roles.find(isOwnRole);
  const stored = own && isActive(own) ? (own.location ?? []) : [];

  const kept = stored.filter((location) => {
    const reference = normalizeReference(location.reference);
    return reference === undefined || wanted.has(reference);
  });
  const held = new Set(kept.flatMap((location) => normalizeReference(location.reference) ?? []));
  const added = facilities.filter((facility) => {
    const reference = normalizeReference(facility.reference);
    if (!reference || held.has(reference) || placedElsewhere.has(reference)) {
      return false;
    }
    held.add(reference);
    return true;
  });
  const location = [...kept, ...added];

  if (!own) {
    if (location.length === 0) {
      return [];
    }
    const identifier = { system: SERVICE_FACILITY_ROLE_SYSTEM, value: practitioner.id };
    return [
      {
        draft: {
          resourceType: 'PractitionerRole',
          identifier: [identifier],
          practitioner: createReference(practitioner),
          location,
          active: true,
        },
        ifNoneExist: `identifier=${identifier.system}|${identifier.value}`,
      },
    ];
  }
  if (location.length === 0) {
    return isActive(own) ? [{ stored: own, draft: { ...own, active: false } }] : [];
  }
  if (isActive(own) && added.length === 0 && kept.length === stored.length) {
    return [];
  }
  return [{ stored: own, draft: { ...own, active: true, location } }];
}
