// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Location, Practitioner, PractitionerRole, Reference } from '@medplum/fhirtypes';
import type { ConfigChange } from '../ConfigPage/configSave';

/*
 * A provider's service facilities are the locations of their active PractitionerRoles, which is how booking
 * places them. The workspace edits only roles it could have written itself: a role carrying any identifier is
 * another system's, and is never changed. Of a role it does edit, it writes `practitioner`, `location`, and
 * `active`, and nothing else, and it never deletes one. A service facility is taken away by turning its role off.
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

/**
 * Whether a role was written by another system, which the workspace leaves alone.
 * @param role - The role.
 * @returns True when it carries an identifier.
 */
export function isLinkedElsewhere(role: PractitionerRole): boolean {
  return !!role.identifier?.length;
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
  /** The service facilities an active role from another system names, which can't be removed here. */
  readonly locked: ReadonlySet<string>;
}

/**
 * Reads a provider's service facilities off their roles. A service facility shows once however many roles name
 * it, and is locked when any active role naming it is another system's.
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
      if (isLinkedElsewhere(role)) {
        locked.add(reference);
      }
    }
  }
  return { facilities: [...facilities.values()], locked };
}

/**
 * Works out the role writes that leave a provider at exactly the service facilities given.
 *
 * A role the workspace may edit that names a service facility no longer wanted loses it from `location`, or is
 * turned off when that leaves it naming none. A wanted service facility no active role names reactivates an
 * inactive role that names only it, or else gets a new role. Roles from another system are never changed.
 * @param roles - Every role naming the provider, active or not, as stored.
 * @param practitioner - The provider, which a new role names.
 * @param facilities - The service facilities the provider should be at.
 * @returns A change per role to write, which is empty when the roles already place the provider there.
 */
export function buildRoleChanges(
  roles: readonly WithId<PractitionerRole>[],
  practitioner: Reference<Practitioner>,
  facilities: readonly Reference<Location>[]
): ConfigChange<PractitionerRole>[] {
  const wanted = new Set(facilities.flatMap((facility) => normalizeReference(facility.reference) ?? []));
  const changes: ConfigChange<PractitionerRole>[] = [];
  const placed = new Set<string>();

  for (const role of roles.filter(isActive)) {
    const references = referencesOf(role);
    if (isLinkedElsewhere(role)) {
      references.forEach((reference) => placed.add(reference));
      continue;
    }
    const kept = (role.location ?? []).filter((location) => {
      const reference = normalizeReference(location.reference);
      return reference === undefined || wanted.has(reference);
    });
    kept.flatMap((location) => normalizeReference(location.reference) ?? []).forEach((ref) => placed.add(ref));
    if (kept.length === (role.location ?? []).length) {
      continue;
    }
    // Turned off rather than emptied, so it keeps naming the service facility it can be reactivated for.
    const draft: PractitionerRole = kept.length === 0 ? { ...role, active: false } : { ...role, location: kept };
    changes.push({ stored: role, draft });
  }

  for (const facility of facilities) {
    const reference = normalizeReference(facility.reference);
    if (!reference || placed.has(reference)) {
      continue;
    }
    placed.add(reference);
    const inactive = roles.find((role) => !isActive(role) && !isLinkedElsewhere(role) && namesOnly(role, reference));
    if (inactive) {
      changes.push({ stored: inactive, draft: { ...inactive, active: true } });
    } else {
      changes.push({
        draft: { resourceType: 'PractitionerRole', practitioner, location: [facility], active: true },
      });
    }
  }
  return changes;
}

function namesOnly(role: PractitionerRole, reference: string): boolean {
  const references = referencesOf(role);
  return references.length === 1 && references[0] === reference;
}
