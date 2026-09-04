// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Dereference } from '@medplum/core';
import { assertNever, parseReference } from '@medplum/core';
import type { Schedule } from '@medplum/fhirtypes';

/**
 * A reference to something a Schedule belongs to. The same union an Appointment
 * accepts as a participant, so an actor can be carried straight across.
 */
export type SchedulingActor = Schedule['actor'][number];
export type SchedulingActorType = Dereference<SchedulingActor>['resourceType'];

/**
 * Actor types whose schedules may be offered for booking, in the order they are
 * asked about.
 *
 * Each type becomes one question, because `$find` intersects the schedules it is
 * given: a time is offered only when the practitioner *and* the location *and*
 * the device are all free for it.
 *
 * Does not include `PractitionerRole` to prevent double-booking a `Practitioner`
 * who holds multiple roles. A practitioner is booked on their `Practitioner`,
 * but their `PractitionerRole`s still decide which schedules they are eligible
 * for and where they practice.
 */
export const BOOKABLE_ACTOR_TYPES = ['Practitioner', 'Location', 'Device'] as const satisfies SchedulingActorType[];

export type BookableActorType = (typeof BOOKABLE_ACTOR_TYPES)[number];

export function isBookableActorType(value: string | undefined): value is BookableActorType {
  return BOOKABLE_ACTOR_TYPES.includes(value as BookableActorType);
}

/**
 * Extracts the resource type from a reference to an actor.
 *
 * Only supports references that may be used for Scheduling operations, which are
 * those that have a qualified `reference` attribute. The attribute must be present,
 * and may not be a reference to a "contained" resource (eg. `{ reference: "#cid" }`)
 *
 * @param reference - A Reference to a schedulable resource
 * @returns The type that the reference refers to.
 */
export function getActorType(reference: SchedulingActor): SchedulingActorType {
  const result = parseReference(reference)[0];
  if (result.startsWith('#')) {
    throw new Error('Actors as contained resources not supported in scheduling UI');
  }
  return result;
}

/**
 * Provides the label we use for scheduling resource types in this UI
 *
 * @param resourceType - A scheduling actor type
 * @returns The type's label
 */
export function getActorTypeLabel(resourceType: SchedulingActorType): string {
  switch (resourceType) {
    case 'Device':
      return 'Device';
    case 'HealthcareService':
      return 'Healthcare Service';
    case 'Location':
      return 'Room';
    case 'Patient':
      return 'Patient';
    case 'Practitioner':
      return 'Provider';
    case 'PractitionerRole':
      return 'Practitioner Role';
    case 'RelatedPerson':
      return 'Related Person';
  }
  return assertNever(resourceType);
}

/**
 * Actor types that must be chosen before a search can run.
 *
 * Locations and devices are left optional: a service may have location schedules
 * configured without every booking needing to hold one.
 */
export const REQUIRED_ACTOR_TYPES: ReadonlySet<SchedulingActorType> = new Set(['Practitioner']);

/**
 * Reports whether an actorType has to be chosen to be a valid booking
 * @param actorType - The actor type being chosen.
 * @returns Whether a search can run without it.
 */
export function isActorTypeRequired(actorType: SchedulingActorType): boolean {
  return REQUIRED_ACTOR_TYPES.has(actorType);
}
