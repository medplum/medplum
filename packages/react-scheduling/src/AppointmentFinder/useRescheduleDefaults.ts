// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, WithId } from '@medplum/core';
import { extractServiceTypeReferences, isDefined } from '@medplum/core';
import type { Appointment, HealthcareService, Schedule, Slot } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { useEffect, useState } from 'react';
import type { SchedulingActorResource, SchedulingActorType } from '../actors';
import { getActorType, isBookableActorType } from '../actors';
import type { ActorRequirement, ActorSelections, ScheduleCandidate } from './AppointmentFinder.schedules';
import { createActorRequirement, getCandidateActor, toScheduleCandidate } from './AppointmentFinder.schedules';

/**
 * Separates the references packed into the effect's dependency.
 *
 * A FHIR reference cannot contain a newline, so none can be split in two by one.
 */
const KEY_SEPARATOR = '\n';

const NO_SELECTIONS: ActorSelections = {};

export interface RescheduleDefaults {
  /** The visit type the appointment is on file under, where it records one. */
  readonly service: WithId<HealthcareService> | undefined;
  /** Who and what it is held on now, arranged into the rows a form asks for them in. */
  readonly selections: ActorSelections;
  /**
   * True when some of what the visit is held on could not be offered back.
   *
   * A Slot or Schedule this viewer cannot read, or a Schedule the visit type no longer
   * names, leaves its actor out of the rows above — and a move writes the actors it is
   * given, so one left out is one dropped off the visit. Worth saying out loud.
   */
  readonly incomplete: boolean;
  /**
   * True until the reads settle.
   *
   * A form reads its defaults once, at mount, so one mounted while this is true would
   * open on nothing and never take them.
   */
  readonly loading: boolean;
}

/**
 * Reads what an appointment is currently held on, for a form that offers to move it.
 *
 * The visit type comes off `Appointment.serviceType`, which carries a reference to the
 * HealthcareService it was booked under; the actors come off the Slots it holds, which
 * name the Schedules — the appointment's own participants would not say which of an
 * actor's schedules is the one being moved off.
 *
 * Nothing here is required: whatever cannot be read is simply not pre-filled, and the
 * viewer answers it themselves.
 *
 * @param appointment - The appointment being moved.
 * @returns Its visit type and actors, whether they are still being read, and whether
 * anything holding the visit could not be read back at all.
 */
export function useRescheduleDefaults(appointment: WithId<Appointment>): RescheduleDefaults {
  const medplum = useMedplum();

  // Packed into one string so the effect turns on what is being read rather than on
  // arrays that every render builds anew.
  const key = [
    extractServiceTypeReferences(appointment.serviceType)[0]?.reference ?? '',
    ...(appointment.slot ?? []).map((slot) => slot.reference).filter(isDefined),
  ].join(KEY_SEPARATOR);

  const [loaded, setLoaded] = useState<LoadedDefaults>(NOTHING_LOADED);

  useEffect(() => {
    const controller = new AbortController();
    const [serviceReference, ...slotReferences] = key.split(KEY_SEPARATOR);

    loadDefaults(medplum, serviceReference, slotReferences, controller.signal)
      .then((defaults) => {
        if (!controller.signal.aborted) {
          setLoaded({ key, ...defaults });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          // If we didn't read the slots, it can result in the form not pre-filling all
          // the participants, which can result in actors being inadvertently dropped.
          // Mark as "incomplete" in that scenario.
          const incomplete = slotReferences.length > 0;
          setLoaded({ key, service: undefined, selections: NO_SELECTIONS, incomplete });
        }
      });

    return () => controller.abort();
  }, [medplum, key]);

  const stale = loaded.key !== key;

  return {
    service: stale ? undefined : loaded.service,
    selections: stale ? NO_SELECTIONS : loaded.selections,
    incomplete: !stale && loaded.incomplete,
    loading: stale,
  };
}

/** What was read, stamped with the appointment it was read for. */
interface LoadedDefaults {
  readonly key: string | undefined;
  readonly service: WithId<HealthcareService> | undefined;
  readonly selections: ActorSelections;
  readonly incomplete: boolean;
}

/**
 * Nothing read yet. `key` is undefined, which no appointment's key can be, so a first
 * render always reads as stale.
 */
const NOTHING_LOADED: LoadedDefaults = {
  key: undefined,
  service: undefined,
  selections: NO_SELECTIONS,
  incomplete: false,
};

/**
 * Reads the visit type and the held schedules, whichever of them can be read.
 * @param medplum - The Medplum client.
 * @param serviceReference - The HealthcareService the appointment names, or empty for one naming none.
 * @param slotReferences - The Slots the appointment holds.
 * @param signal - Abort signal.
 * @returns The defaults to open a form on.
 */
async function loadDefaults(
  medplum: MedplumClient,
  serviceReference: string,
  slotReferences: readonly string[],
  signal: AbortSignal
): Promise<Omit<RescheduleDefaults, 'loading'>> {
  const [service, held] = await Promise.all([
    serviceReference
      ? medplum.readReference<HealthcareService>({ reference: serviceReference }, { signal }).catch(() => undefined)
      : undefined,
    loadHeldSchedules(medplum, slotReferences, signal),
  ]);

  const candidates = await loadScheduleCandidates(medplum, held.schedules, service, { signal });
  return {
    service,
    selections: toActorSelections(candidates),
    // A schedule that could not be read, and one the visit type no longer names, come
    // out the same way: an actor holding the visit that no row above names.
    incomplete: !held.complete || candidates.length < held.schedules.length,
  };
}

/**
 * The Schedules an appointment's Slots are held on.
 *
 * Deduped, since the buffer either side of a visit is held on the same schedule as the
 * visit itself.
 *
 * @param medplum - The Medplum client.
 * @param slotReferences - The Slots the appointment holds.
 * @param signal - Abort signal.
 * @returns The schedules, in the order the slots name them, and whether every Slot and
 * Schedule the appointment named could be read.
 */
async function loadHeldSchedules(
  medplum: MedplumClient,
  slotReferences: readonly string[],
  signal: AbortSignal
): Promise<{ schedules: WithId<Schedule>[]; complete: boolean }> {
  const slots = await Promise.all(
    slotReferences.map(async (reference) =>
      medplum.readReference<Slot>({ reference }, { signal }).catch(() => undefined)
    )
  );

  const scheduleReferences = [...new Set(slots.filter(isDefined).map((slot) => slot.schedule.reference))].filter(
    isDefined
  );

  const schedules = await Promise.all(
    scheduleReferences.map(async (reference) =>
      medplum.readReference<Schedule>({ reference }, { signal }).catch(() => undefined)
    )
  );

  const read = schedules.filter(isDefined);
  return { schedules: read, complete: slots.every(isDefined) && read.length === scheduleReferences.length };
}

/**
 * Pairs schedules already in hand with the actors they are held on.
 *
 * For schedules arrived at some other way than by the search above — the ones the Slots
 * of an appointment being moved name, say. An actor that cannot be read costs its
 * schedule nothing but the name it would have been shown under.
 *
 * @param medplum - The Medplum client.
 * @param schedules - The schedules to pair up.
 * @param service - The service they are wanted for, or undefined to keep every schedule.
 *   One that is not bookable for the service is left out, as the search leaves it out.
 * @param options - Optional parameters
 * @param options.signal - An AbortSignal
 * @returns The candidates, in the order the schedules were given.
 */
async function loadScheduleCandidates(
  medplum: MedplumClient,
  schedules: readonly WithId<Schedule>[],
  service: WithId<HealthcareService> | undefined,
  options?: { readonly signal?: AbortSignal }
): Promise<ScheduleCandidate[]> {
  const references = [
    ...new Set(schedules.flatMap((schedule) => schedule.actor.map((actor) => actor.reference)).filter(isDefined)),
  ];

  const actorsByReference = new Map<string, SchedulingActorResource>();
  await Promise.all(
    references.map(async (reference) => {
      const actor = await medplum
        .readReference<SchedulingActorResource>({ reference }, { signal: options?.signal })
        .catch(() => undefined);
      if (actor) {
        actorsByReference.set(reference, actor);
      }
    })
  );

  return schedules.map((schedule) => toScheduleCandidate(schedule, service, actorsByReference)).filter(isDefined);
}

/**
 * Arranges candidates into the rows a form asks for them in, one row each.
 *
 * Rows of one actor type are ANDed, which is what a set of actors already holding a
 * visit between them means: every one of them attends.
 *
 * @param candidates - The candidates to arrange, as {@link loadScheduleCandidates} returns them.
 * @returns What to ask for, per actor type.
 */
function toActorSelections(candidates: readonly ScheduleCandidate[]): ActorSelections {
  const selections: Partial<Record<SchedulingActorType, ActorRequirement[]>> = {};
  for (const candidate of candidates) {
    const actorType = getActorType(getCandidateActor(candidate));
    if (isBookableActorType(actorType)) {
      const rows = (selections[actorType] ??= []);
      rows.push(createActorRequirement([candidate]));
    }
  }
  return selections;
}
