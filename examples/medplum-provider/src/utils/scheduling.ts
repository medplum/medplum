// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { generateId, getExtension, getIdentifier, parseReference, resolveId, setIdentifier } from '@medplum/core';
import type {
  Appointment,
  HealthcareService,
  Identifier,
  Reference,
  Resource,
  ResourceType,
  Schedule,
  Slot,
} from '@medplum/fhirtypes';
import { isCodeableReferenceLikeTo } from './servicetype';

export const SchedulingParametersURI = 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters';
const MedplumSchedulingTransientIdentifierURI = 'https://medplum.com/fhir/scheduling-transient-id';
export const SchedulingEncounterCodingURI = 'https://medplum.com/fhir/StructureDefinition/SchedulingEncounterCoding';
export const SchedulingPlanDefinitionURI = 'https://medplum.com/fhir/StructureDefinition/SchedulingPlanDefinition';

export const SchedulingTransientIdentifier = {
  set(resource: Resource & { identifier?: Identifier[] }) {
    setIdentifier(resource, MedplumSchedulingTransientIdentifierURI, generateId(), { use: 'temp' });
  },

  get(resource: Resource) {
    return getIdentifier(resource, MedplumSchedulingTransientIdentifierURI);
  },

  remove(resource: Resource & { identifier?: Identifier[] }) {
    resource.identifier = resource.identifier?.filter(
      (identifier) => identifier.system !== MedplumSchedulingTransientIdentifierURI
    );
  },
};

export function hasSchedulingParameters(resource: Schedule | HealthcareService): boolean {
  return !!getExtension(resource, SchedulingParametersURI);
}

export function isSchedulableFor(
  schedule: Schedule,
  healthcareService: WithId<HealthcareService> | (Reference<HealthcareService> & { reference: string })
): boolean {
  return isCodeableReferenceLikeTo(schedule.serviceType, healthcareService);
}

// Calendar-day key in the viewer's local timezone (not UTC — matches how
// times are displayed via formatDateTime). Shared between the slot list's
// day grouping and the month calendar's availability highlighting so they
// always agree on which day a given ISO timestamp belongs to.
export function localDayKey(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * Groups Schedules eligible for `healthcareService` by their actor's resource
 * type, giving the three resource pools (Practitioner / Location / Device)
 * that the multi-resource Find & Book combo orchestration fans out over. See
 * spec §4.2 — this mirrors what `ActorChooser` already does inline.
 * @param schedules - All candidate Schedules to consider.
 * @param healthcareService - The visit type being searched for.
 * @returns A map from actor ResourceType to the eligible Schedules for that type.
 */
export function resolveResourcePools(
  schedules: Schedule[],
  healthcareService: WithId<HealthcareService>
): Partial<Record<ResourceType, WithId<Schedule>[]>> {
  const pools: Partial<Record<ResourceType, WithId<Schedule>[]>> = {};
  for (const schedule of schedules) {
    if (!schedule.id || !isSchedulableFor(schedule, healthcareService)) {
      continue;
    }
    for (const actorRef of schedule.actor) {
      const actorType = parseReference(actorRef)[0];
      const pool = pools[actorType] ?? [];
      pool.push(schedule as WithId<Schedule>);
      pools[actorType] = pool;
    }
  }
  return pools;
}

export type ResourceCombo = {
  key: string;
  schedules: WithId<Schedule>[];
};

/**
 * Cartesian product of the (already criteria-filtered) resource pools, capped
 * at `maxCombos` to bound the number of `$find` calls fanned out per search
 * (spec §4.2, §8) — a demo-grade limitation, not a real search-side
 * combination strategy.
 * @param pools - Resource pools, one array of Schedules per actor resourceType.
 * @param maxCombos - Hard ceiling on the number of combos returned.
 * @returns The list of resource combos (one Schedule per actor type) to search.
 */
export function cartesianCombos(
  pools: Partial<Record<ResourceType, WithId<Schedule>[]>>,
  maxCombos = 20
): ResourceCombo[] {
  const groups = Object.values(pools).filter((g): g is WithId<Schedule>[] => !!g?.length);
  if (groups.length === 0) {
    return [];
  }

  let combos: WithId<Schedule>[][] = [[]];
  for (const group of groups) {
    const next: WithId<Schedule>[][] = [];
    for (const combo of combos) {
      for (const schedule of group) {
        next.push([...combo, schedule]);
      }
    }
    combos = next;
  }

  return combos.slice(0, maxCombos).map((schedules) => ({
    key: schedules.map((s) => s.id).join('+'),
    schedules,
  }));
}

/**
 * Filters a Slot list down to genuine standalone blocks (OOO/holiday/
 * maintenance) by excluding any `busy-unavailable` Slot that's actually a
 * buffer-before/buffer-after side effect of a real appointment. `$book`/
 * `$hold` persist those buffer windows as real `busy-unavailable` Slot
 * resources referenced by the appointment's own `slot` array — they aren't
 * distinguishable by status alone, only by "is this slot referenced by an
 * appointment already being rendered." Without this filter, every booked
 * appointment with a buffer grows an extra "Blocked" background event next
 * to it on both the roster and the availability calendar.
 * @param slots - Candidate Slots (any status) for the visible range.
 * @param appointments - Appointments in the same range, whose `.slot[]` references the buffer/busy Slots to exclude.
 * @returns Only the `busy-unavailable` Slots not referenced by any given appointment.
 */
export function filterStandaloneBlocks(slots: Slot[], appointments: Appointment[]): WithId<Slot>[] {
  const referencedSlotIds = new Set<string>();
  for (const appointment of appointments) {
    for (const ref of appointment.slot ?? []) {
      const id = resolveId(ref);
      if (id) {
        referencedSlotIds.add(id);
      }
    }
  }
  return slots.filter(
    (slot): slot is WithId<Slot> => slot.status === 'busy-unavailable' && !!slot.id && !referencedSlotIds.has(slot.id)
  );
}
