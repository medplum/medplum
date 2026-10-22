// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { deepClone, deepEquals, generateId, getExtensionValue, TimezoneExtensionURI } from '@medplum/core';
import type { Device, HumanName, Location, Practitioner, Reference } from '@medplum/fhirtypes';
import { LOCATION_PHYSICAL_TYPE_CODE_SYSTEM, SCHEDULING_CONFIG_PROVIDER_SYSTEM } from '../../constants';
import { isActorInactive } from '../SchedulingConfigWorkspace.utils';

/** A provider, room, or device, as stored or as the page would store it. */
export type ActorResource = Practitioner | Location | Device;

/**
 * The kinds of actor the workspace creates. A provider created here has no NPI, since one with an NPI comes from
 * elsewhere.
 */
export type NewActorType = 'Practitioner' | 'Location' | 'Device';

/** What the page holds for the actor itself. */
export interface ActorGeneralFields {
  /** A room's name, or a new device's. Unused for a provider or a stored device. */
  readonly name: string;
  /** The given and family names of a provider the workspace created. Other providers' names are read-only. */
  readonly given?: string;
  readonly family?: string;
  /** Whether the actor is on: `Practitioner.active`, or a room's or device's `status` not being `inactive`. */
  readonly active: boolean;
  /** A room's `partOf`, or a device's `location`. */
  readonly location?: Reference<Location>;
  /** The actor's `timezone` extension. */
  readonly timezone?: string;
}

/**
 * A provider, room, or device that hasn't been saved yet. A provider carries the workspace's marker, so the
 * workspace keeps its name and status. Rooms are typed `ro`, so the service facility pickers never offer one as a
 * service facility.
 * @param resourceType - What to create.
 * @returns The resource to start from.
 */
export function newActorResource(resourceType: NewActorType): ActorResource {
  if (resourceType === 'Practitioner') {
    return {
      resourceType: 'Practitioner',
      active: true,
      identifier: [{ system: SCHEDULING_CONFIG_PROVIDER_SYSTEM, value: generateId() }],
    };
  }
  if (resourceType === 'Location') {
    return {
      resourceType: 'Location',
      status: 'active',
      physicalType: {
        coding: [{ system: LOCATION_PHYSICAL_TYPE_CODE_SYSTEM, code: 'ro', display: 'Room' }],
      },
    };
  }
  return { resourceType: 'Device', status: 'active' };
}

/**
 * Whether the page edits the actor's name: a room's, or a new device's. A stored device can carry several names,
 * and which one an edit should replace isn't settled, but a new one has none.
 * @param resource - The actor as the page would store it.
 * @returns True when the name is edited.
 */
export function hasEditableName(resource: ActorResource): resource is Location | Device {
  return resource.resourceType === 'Location' || (resource.resourceType === 'Device' && !resource.id);
}

/**
 * Whether the workspace keeps the provider: one it created, which carries its marker. Any other comes from an
 * external system, which keeps its name, NPIs, and status.
 * @param practitioner - The provider.
 * @returns True when the workspace created the provider.
 */
export function isOwnProvider(practitioner: Practitioner): boolean {
  return (practitioner.identifier ?? []).some((identifier) => identifier.system === SCHEDULING_CONFIG_PROVIDER_SYSTEM);
}

/**
 * Why the actor's name can't be saved, by field: a room's or new device's name, or the given or family name of a
 * provider the workspace created.
 * @param resource - The actor as the page would store it.
 * @param fields - What the page holds.
 * @returns Each empty required name field's error.
 */
export function getNameErrors(
  resource: ActorResource,
  fields: ActorGeneralFields
): Partial<Record<'name' | 'given' | 'family', string>> {
  if (resource.resourceType === 'Practitioner') {
    if (!isOwnProvider(resource)) {
      return {};
    }
    return {
      ...(!fields.given?.trim() && { given: 'A first name is required.' }),
      ...(!fields.family?.trim() && { family: 'A last name is required.' }),
    };
  }
  return hasEditableName(resource) && !fields.name.trim() ? { name: 'A name is required.' } : {};
}

/**
 * Seeds the page's General fields from the actor.
 * @param resource - The provider, room, or device, as stored or as newly started.
 * @returns What the page opens with.
 */
export function actorGeneralFieldsOf(resource: ActorResource): ActorGeneralFields {
  const timezone = getExtensionValue(resource, TimezoneExtensionURI) as string | undefined;
  const active = !isActorInactive(resource);
  if (resource.resourceType === 'Practitioner') {
    if (!isOwnProvider(resource)) {
      return { name: '', active, timezone };
    }
    const [name] = resource.name ?? [];
    return { name: '', given: name?.given?.join(' ') ?? '', family: name?.family ?? '', active, timezone };
  }
  if (resource.resourceType === 'Location') {
    return { name: resource.name ?? '', active, location: resource.partOf, timezone };
  }
  return { name: '', active, location: resource.location, timezone };
}

/**
 * Builds the actor to store from what the page holds. Only what was edited is rewritten, so saving a provider
 * from elsewhere changes its time zone and nothing that system maintains.
 * @param base - The actor as stored, or as newly started.
 * @param fields - What the page holds.
 * @param initial - What the page opened with.
 * @returns The actor to store.
 */
export function buildActorResource<T extends ActorResource>(
  base: T,
  fields: ActorGeneralFields,
  initial: ActorGeneralFields
): T {
  const draft = deepClone(base);
  if (fields.timezone !== initial.timezone) {
    setTimezone(draft, fields.timezone);
  }
  // Only `inactive` is off, so switching back on leaves any other stored status, like suspended, as it was.
  if (fields.active !== initial.active) {
    setActive(draft, fields.active);
  }
  if (draft.resourceType === 'Practitioner') {
    if (isOwnProvider(draft) && (fields.given !== initial.given || fields.family !== initial.family)) {
      setProviderName(draft, fields.given ?? '', fields.family ?? '');
    }
    return draft;
  }
  if (hasEditableName(draft) && fields.name !== initial.name) {
    setName(draft, fields.name.trim());
  }
  if (!deepEquals(fields.location, initial.location)) {
    setLocation(draft, fields.location);
  }
  return draft;
}

function setActive(resource: ActorResource, active: boolean): void {
  if (resource.resourceType === 'Practitioner') {
    resource.active = active;
  } else {
    resource.status = active ? 'active' : 'inactive';
  }
}

function setTimezone(resource: ActorResource, timezone: string | undefined): void {
  const entry = timezone ? [{ url: TimezoneExtensionURI, valueCode: timezone }] : [];
  const current = resource.extension ?? [];
  const index = current.findIndex((extension) => extension.url === TimezoneExtensionURI);
  const extension =
    index < 0 ? [...current, ...entry] : [...current.slice(0, index), ...entry, ...current.slice(index + 1)];
  if (extension.length > 0) {
    resource.extension = extension;
  } else {
    delete resource.extension;
  }
}

function setName(resource: Location | Device, name: string): void {
  if (resource.resourceType === 'Location') {
    resource.name = name;
  } else {
    resource.deviceName = [{ name, type: 'user-friendly-name' }];
  }
}

// Rewrites the first name the workspace stored, keeping anything else on it, like a prefix added elsewhere. Its
// `text` would go stale, so it's dropped.
function setProviderName(resource: Practitioner, given: string, family: string): void {
  const [first, ...rest] = resource.name ?? [];
  const name: HumanName = {
    ...(first ?? { use: 'official' }),
    given: given.trim().split(/\s+/),
    family: family.trim(),
  };
  delete name.text;
  resource.name = [name, ...rest];
}

function setLocation(resource: Location | Device, location: Reference<Location> | undefined): void {
  if (resource.resourceType === 'Location') {
    resource.partOf = location;
  } else {
    resource.location = location;
  }
}
