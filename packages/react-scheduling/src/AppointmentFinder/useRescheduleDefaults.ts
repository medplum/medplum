// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, WithId } from '@medplum/core';
import { extractServiceTypeReferences, getDisplayString, isDefined } from '@medplum/core';
import type { Appointment, HealthcareService, Schedule, Slot } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { useEffect, useState } from 'react';
import type { SchedulingActor, SchedulingActorResource, SchedulingActorType } from '../actors';
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

const NO_ACTORS: readonly SchedulingActor[] = [];

export interface RescheduleDefaults {
  /** The visit type the appointment is on file under, where it records one. */
  readonly service: WithId<HealthcareService> | undefined;
  /** Who and what it is held on now, arranged into the rows a form asks for them in. */
  readonly selections: ActorSelections;
  /**
   * Actors the visit is held on whose schedules cannot be offered back, named where they
   * could be read.
   *
   * A Schedule that is inactive, no longer names the visit type, or is held on an actor
   * this form does not book leaves its actors out of the rows above — and a move writes
   * the actors it is given, so these are about to be dropped off the visit.
   */
  readonly droppedActors: readonly SchedulingActor[];
  /**
   * Set when the visit type, or a Slot or Schedule the visit is held on, could not be read.
   *
   * `$reschedule` reads those same references, so no move from here would be accepted.
   */
  readonly error: unknown;
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
 * An actor that cannot be read keeps its schedule, shown under the name the schedule
 * gives it: the move is written against the schedule, not the actor.
 *
 * @param appointment - The appointment being moved.
 * @returns Its visit type and actors, whether they are still being read, who a move
 * would drop off it, and why it could not be read, where it could not.
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
          setLoaded({ key, ...defaults, error: undefined });
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setLoaded({ key, service: undefined, selections: NO_SELECTIONS, droppedActors: NO_ACTORS, error });
        }
      });

    return () => controller.abort();
  }, [medplum, key]);

  const stale = loaded.key !== key;

  return {
    service: stale ? undefined : loaded.service,
    selections: stale ? NO_SELECTIONS : loaded.selections,
    droppedActors: stale ? NO_ACTORS : loaded.droppedActors,
    error: stale ? undefined : loaded.error,
    loading: stale,
  };
}

/** What was read, stamped with the appointment it was read for. */
interface LoadedDefaults {
  readonly key: string | undefined;
  readonly service: WithId<HealthcareService> | undefined;
  readonly selections: ActorSelections;
  readonly droppedActors: readonly SchedulingActor[];
  readonly error: unknown;
}

/**
 * Nothing read yet. `key` is undefined, which no appointment's key can be, so a first
 * render always reads as stale.
 */
const NOTHING_LOADED: LoadedDefaults = {
  key: undefined,
  service: undefined,
  selections: NO_SELECTIONS,
  droppedActors: NO_ACTORS,
  error: undefined,
};

/**
 * Reads the visit type and the held schedules.
 * @param medplum - The Medplum client.
 * @param serviceReference - The HealthcareService the appointment names, or empty for one naming none.
 * @param slotReferences - The Slots the appointment holds.
 * @param signal - Abort signal.
 * @returns The defaults to open a form on. Rejects when the visit type, or a Slot or
 * Schedule the visit is held on, cannot be read.
 */
async function loadDefaults(
  medplum: MedplumClient,
  serviceReference: string,
  slotReferences: readonly string[],
  signal: AbortSignal
): Promise<Omit<RescheduleDefaults, 'loading' | 'error'>> {
  const [service, schedules] = await Promise.all([
    serviceReference
      ? medplum.readReference<HealthcareService>({ reference: serviceReference }, { signal })
      : undefined,
    loadHeldSchedules(medplum, slotReferences, signal),
  ]);

  const actors = await loadActors(medplum, schedules, signal);
  const candidates = schedules.map((schedule) => toScheduleCandidate(schedule, service, actors)).filter(isDefined);
  return {
    service,
    selections: toActorSelections(candidates),
    droppedActors: getDroppedActors(schedules, candidates, actors),
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
 * @returns The schedules, in the order the slots name them.
 */
async function loadHeldSchedules(
  medplum: MedplumClient,
  slotReferences: readonly string[],
  signal: AbortSignal
): Promise<WithId<Schedule>[]> {
  const slots = await Promise.all(
    slotReferences.map((reference) => medplum.readReference<Slot>({ reference }, { signal }))
  );

  const scheduleReferences = [...new Set(slots.map((slot) => slot.schedule.reference))].filter(isDefined);

  return Promise.all(scheduleReferences.map((reference) => medplum.readReference<Schedule>({ reference }, { signal })));
}

/**
 * Reads the actors the schedules are held on.
 *
 * One that cannot be read is left out, which costs its schedule nothing but the name it
 * would have been shown under.
 *
 * @param medplum - The Medplum client.
 * @param schedules - The schedules whose actors to read.
 * @param signal - Abort signal.
 * @returns The actors that could be read, by reference.
 */
async function loadActors(
  medplum: MedplumClient,
  schedules: readonly WithId<Schedule>[],
  signal: AbortSignal
): Promise<Map<string, SchedulingActorResource>> {
  const references = [
    ...new Set(schedules.flatMap((schedule) => schedule.actor.map((actor) => actor.reference)).filter(isDefined)),
  ];

  const actorsByReference = new Map<string, SchedulingActorResource>();
  await Promise.all(
    references.map(async (reference) => {
      const actor = await medplum
        .readReference<SchedulingActorResource>({ reference }, { signal })
        .catch(() => undefined);
      if (actor) {
        actorsByReference.set(reference, actor);
      }
    })
  );
  return actorsByReference;
}

/**
 * The actors a move would take off the visit: those on a held schedule that could not
 * be offered back. These actors will be dropped when `$reschedule` is invoked.
 *
 * This can happen if the Schedule is inactive, is no longer eligible for booking against
 * this visit's service type, or is held on an actor this form does not book.
 *
 * @param schedules - The schedules the visit is held on.
 * @param candidates - The ones among them that were offered back.
 * @param actors - The actors that could be read, by reference, to name them by.
 * @returns The actors, deduped, with their names filled in where they could be read.
 */
function getDroppedActors(
  schedules: readonly WithId<Schedule>[],
  candidates: readonly ScheduleCandidate[],
  actors: ReadonlyMap<string, SchedulingActorResource>
): SchedulingActor[] {
  const offered = new Set(candidates.map((candidate) => candidate.schedule.id));
  const kept = new Set(candidates.map((candidate) => getCandidateActor(candidate).reference));

  const dropped = new Map<string, SchedulingActor>();
  const notOffered = schedules.filter((schedule) => !offered.has(schedule.id));
  for (const actor of notOffered.flatMap((schedule) => schedule.actor)) {
    if (actor.reference && !kept.has(actor.reference)) {
      const resource = actors.get(actor.reference);
      dropped.set(actor.reference, { ...actor, display: resource ? getDisplayString(resource) : actor.display });
    }
  }
  return [...dropped.values()];
}

/**
 * Arranges candidates into the rows a form asks for them in, one row each.
 *
 * Rows of one actor type are ANDed, which is what a set of actors already holding a
 * visit between them means: every one of them attends.
 *
 * @param candidates - The candidates to arrange, as {@link toScheduleCandidate} returns them.
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
