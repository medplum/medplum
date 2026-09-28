// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { deepClone, deepEquals, getExtensionValue, TimezoneExtensionURI } from '@medplum/core';
import type { Device, Location, Practitioner, Reference } from '@medplum/fhirtypes';

/** A provider, room, or device, as stored or as the page would store it. */
export type ActorResource = Practitioner | Location | Device;

/** The kinds of actor the workspace creates. Providers come from elsewhere. */
export type NewActorType = 'Location' | 'Device';

/** What the page holds for the actor itself. */
export interface ActorGeneralFields {
  /** A room's or device's name. Unused for a provider, whose name is read-only. */
  readonly name: string;
  readonly status?: string;
  /** A room's `partOf`, or a device's `location`. */
  readonly location?: Reference<Location>;
  /** The actor's `timezone` extension. */
  readonly timezone?: string;
}

const USER_FRIENDLY_NAME = 'user-friendly-name';

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
        coding: [
          { system: 'http://terminology.hl7.org/CodeSystem/location-physical-type', code: 'ro', display: 'Room' },
        ],
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
  if (resource.resourceType === 'Practitioner') {
    return { name: '', timezone };
  }
  if (resource.resourceType === 'Location') {
    return { name: resource.name ?? '', status: resource.status, location: resource.partOf, timezone };
  }
  return { name: resource.deviceName?.[0]?.name ?? '', status: resource.status, location: resource.location, timezone };
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
  if (draft.resourceType === 'Practitioner') {
    return draft;
  }
  if (fields.status !== initial.status) {
    draft.status = fields.status as typeof draft.status;
  }
  if (draft.resourceType === 'Location') {
    if (fields.name !== initial.name) {
      draft.name = fields.name.trim();
    }
    if (!deepEquals(fields.location, initial.location)) {
      if (fields.location) {
        draft.partOf = fields.location;
      } else {
        delete draft.partOf;
      }
    }
  } else {
    if (fields.name !== initial.name) {
      setDeviceName(draft, fields.name.trim());
    }
    if (!deepEquals(fields.location, initial.location)) {
      if (fields.location) {
        draft.location = fields.location;
      } else {
        delete draft.location;
      }
    }
  }
  return draft;
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

// The name shown for a device is its first `deviceName`, so the edited name goes first.
function setDeviceName(device: Device, name: string): void {
  const [first, ...rest] = device.deviceName ?? [];
  device.deviceName =
    first?.type === USER_FRIENDLY_NAME
      ? [{ ...first, name }, ...rest]
      : [{ name, type: USER_FRIENDLY_NAME }, ...(device.deviceName ?? [])];
}
