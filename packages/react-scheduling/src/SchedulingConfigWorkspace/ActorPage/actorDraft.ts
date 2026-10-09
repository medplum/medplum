// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { deepClone, deepEquals, getExtensionValue, TimezoneExtensionURI } from '@medplum/core';
import type { Device, Location, Practitioner, Reference } from '@medplum/fhirtypes';
import { LOCATION_PHYSICAL_TYPE_CODE_SYSTEM } from '../../constants';
import { isActorInactive } from '../SchedulingConfigWorkspace.utils';

/** A provider, room, or device, as stored or as the page would store it. */
export type ActorResource = Practitioner | Location | Device;

/** The kinds of actor the workspace creates. Providers come from elsewhere. */
export type NewActorType = 'Location' | 'Device';

/** What the page holds for the actor itself. */
export interface ActorGeneralFields {
  /** A room's name. Unused for a provider or device, whose names are read-only. */
  readonly name: string;
  /** Whether the actor is on: `Practitioner.active`, or a room's or device's `status` not being `inactive`. */
  readonly active: boolean;
  /** A room's `partOf`, or a device's `location`. */
  readonly location?: Reference<Location>;
  /** The actor's `timezone` extension. */
  readonly timezone?: string;
}

/**
 * A room or device that hasn't been saved yet. Rooms are typed `ro`, so the service facility pickers never
 * offer one as a service facility.
 * @param resourceType - What to create.
 * @returns The resource to start from.
 */
export function newActorResource(resourceType: NewActorType): Location | Device {
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
 * Seeds the page's General fields from the actor.
 * @param resource - The provider, room, or device, as stored or as newly started.
 * @returns What the page opens with.
 */
export function actorGeneralFieldsOf(resource: ActorResource): ActorGeneralFields {
  const timezone = getExtensionValue(resource, TimezoneExtensionURI) as string | undefined;
  const active = !isActorInactive(resource);
  if (resource.resourceType === 'Practitioner') {
    return { name: '', active, timezone };
  }
  if (resource.resourceType === 'Location') {
    return { name: resource.name ?? '', active, location: resource.partOf, timezone };
  }
  return { name: '', active, location: resource.location, timezone };
}

/**
 * Builds the actor to store from what the page holds. Only what was edited is rewritten, so a provider's
 * save changes its time zone and nothing an external system maintains.
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
    return draft;
  }
  if (draft.resourceType === 'Location' && fields.name !== initial.name) {
    draft.name = fields.name.trim();
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

function setLocation(resource: Location | Device, location: Reference<Location> | undefined): void {
  if (resource.resourceType === 'Location') {
    resource.partOf = location;
  } else {
    resource.location = location;
  }
}
