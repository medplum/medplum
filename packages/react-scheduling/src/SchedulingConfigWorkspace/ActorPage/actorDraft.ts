// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { deepClone, deepEquals, getExtensionValue, TimezoneExtensionURI } from '@medplum/core';
import type { Device, Location, Practitioner, Reference } from '@medplum/fhirtypes';
import { isActorInactive } from '../SchedulingConfigWorkspace.utils';

/** A provider, room, or device, as stored or as the page would store it. */
export type ActorResource = Practitioner | Location | Device;

/** What the page holds for the actor itself. */
export interface ActorGeneralFields {
  /** A room's or device's name. Unused for a provider, whose name is read-only. */
  readonly name: string;
  /** Whether the actor is on: `Practitioner.active`, or a room's or device's `status` not being `inactive`. */
  readonly active: boolean;
  /** A room's `partOf`, or a device's `location`. */
  readonly location?: Reference<Location>;
  /** The actor's `timezone` extension. */
  readonly timezone?: string;
}

const USER_FRIENDLY_NAME = 'user-friendly-name';

/**
 * Seeds the page's General fields from the actor.
 * @param resource - The provider, room, or device, as stored.
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
  return { name: resource.deviceName?.[0]?.name ?? '', active, location: resource.location, timezone };
}

/**
 * Builds the actor to store from what the page holds. Only what was edited is rewritten, so a provider's
 * save changes its time zone and nothing an external system maintains.
 * @param base - The actor as stored.
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
  if (fields.name !== initial.name) {
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

function setLocation(resource: Location | Device, location: Reference<Location> | undefined): void {
  if (resource.resourceType === 'Location') {
    resource.partOf = location;
  } else {
    resource.location = location;
  }
}

function setName(resource: Location | Device, name: string): void {
  if (resource.resourceType === 'Location') {
    resource.name = name;
    return;
  }
  // The name shown for a device is its first `deviceName`, so the edited name goes first.
  const [first, ...rest] = resource.deviceName ?? [];
  resource.deviceName =
    first?.type === USER_FRIENDLY_NAME
      ? [{ ...first, name }, ...rest]
      : [{ name, type: USER_FRIENDLY_NAME }, ...(resource.deviceName ?? [])];
}
