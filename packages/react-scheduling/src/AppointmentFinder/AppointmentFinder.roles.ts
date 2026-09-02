// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { isResource } from '@medplum/core';
import type { ExtractResource, Resource, Schedule } from '@medplum/fhirtypes';

/** Resource types that may appear in `Schedule.actor`. */
export const SCHEDULING_ACTOR_TYPES = ['Practitioner', 'PractitionerRole', 'Location', 'Device'] as const;

export type SchedulingActorType = (typeof SCHEDULING_ACTOR_TYPES)[number];

/**
 * A reference to something a Schedule belongs to. The same union an Appointment
 * accepts as a participant, so an actor can be carried straight across.
 */
export type SchedulingActorReference = Schedule['actor'][number];

/** A loaded actor resource. Tied to `SCHEDULING_ACTOR_TYPES`, including PractitionerRole. */
export type SchedulingActorResource = WithId<ExtractResource<SchedulingActorType>>;

/**
 * An actor as a reference, or as the resource when it has already been read.
 */
export type SchedulingActor = SchedulingActorReference | SchedulingActorResource;

/**
 * The parts of an appointment a user chooses, in the order they are asked about.
 *
 * Each role becomes one question, because `$find` intersects the schedules it is
 * given: a time is offered only when the provider *and* the room *and* the
 * device are all free for it.
 */
export const SCHEDULING_ROLES = ['provider', 'room', 'device'] as const;

export type SchedulingRole = (typeof SCHEDULING_ROLES)[number];

export const ROLE_LABELS: Record<SchedulingRole, string> = {
  provider: 'Provider',
  room: 'Room',
  device: 'Device',
};

/**
 * Which role each actor type answers.
 *
 * A room is a Location, usually one `partOf` the clinic being booked at, and a
 * provider may be modelled either as a Practitioner or as the role they hold.
 */
const ROLE_BY_ACTOR_TYPE: Record<SchedulingActorType, SchedulingRole> = {
  Practitioner: 'provider',
  PractitionerRole: 'provider',
  Location: 'room',
  Device: 'device',
};

export function isSchedulingActorType(value: string | undefined): value is SchedulingActorType {
  return SCHEDULING_ACTOR_TYPES.includes(value as SchedulingActorType);
}

/**
 * Actor types whose schedules may be offered for booking.
 *
 * Does not include `PractitionerRole` to prevent double-booking
 * a `Practitioner` who holds multiple roles. See `getSchedulingRole` for how
 * `PractitionerRole` is still used to determine eligibility for a schedule.
 */
export const BOOKABLE_ACTOR_TYPES = ['Practitioner', 'Location', 'Device'] as const;

export type BookableActorType = (typeof BOOKABLE_ACTOR_TYPES)[number];

export function isBookableActorType(value: string | undefined): value is BookableActorType {
  return BOOKABLE_ACTOR_TYPES.includes(value as BookableActorType);
}

/**
 * Returns the role an actor type is chosen as.
 * @param actorType - A `Schedule.actor` resource type.
 * @returns The role that actor fills.
 */
export function getSchedulingRole(actorType: SchedulingActorType): SchedulingRole {
  return ROLE_BY_ACTOR_TYPE[actorType];
}

/**
 * Names the role an actor is filling (e.g. "Provider", "Room", "Device"), from its own resource type.
 * @param actor - A scheduling actor, as a reference or resource itself.
 * @returns The role's label.
 */
export function getActorRoleLabel(actor: SchedulingActorReference | Resource): string | undefined {
  const actorType = isResource(actor) ? actor.resourceType : actor.reference?.split('/')[0];
  return isSchedulingActorType(actorType) ? ROLE_LABELS[getSchedulingRole(actorType)] : undefined;
}

/**
 * Roles that must be filled before a search can run.
 *
 * Rooms and devices are left optional: a service may have room schedules
 * configured without every booking needing to hold one.
 */
const REQUIRED_ROLES: ReadonlySet<SchedulingRole> = new Set(['provider']);

/**
 * Reports whether a role has to be filled.
 * @param role - The role being filled.
 * @returns Whether a search can run without it.
 */
export function isRoleRequired(role: SchedulingRole): boolean {
  return REQUIRED_ROLES.has(role);
}
