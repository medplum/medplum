// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { Appointment } from '@medplum/fhirtypes';
import { randomUUID } from 'node:crypto';
import type { CalendarConnection } from './connection';
import type { CalendarConflict, ImportResult } from './import';
import { findConflicts, importedSlots, practitionerSchedules, readImportedIdentity } from './import';
import type { ConnectionLease } from './lease';
import { MIRRORED_APPOINTMENT_STATUSES } from './mapping';
import { projectQuery } from './project';
import { parseSyncRange } from './range-sync';
import { readState, withState } from './state';

export class ConflictRefreshPending extends Error {}

/**
 * Refresh conflicts from local imported blocks; Appointment edits do not require a Google snapshot.
 * @param lease - Current connection lease.
 * @param connection - Connection whose imported blocks are checked.
 * @param imported - Completed import, reused instead of searching the Slots just written.
 */
export async function refreshConflicts(
  lease: ConnectionLease,
  connection: CalendarConnection,
  imported?: ImportResult
): Promise<void> {
  const medplum = lease.medplum;
  const check = async (): Promise<void> => {
    if (Date.now() >= lease.deadline - 60_000) {
      throw new ConflictRefreshPending('Local conflict refresh will resume in the next delivery');
    }
    await lease.check();
  };
  await check();
  const now = new Date();
  const range = parseSyncRange(undefined, undefined, now);
  const schedules = new Set(
    (imported?.schedules ?? (await practitionerSchedules(medplum, connection.practitionerRef))).map(
      (s) => `Schedule/${s.id}`
    )
  );
  const actors = new Set([connection.practitionerRef]);
  for await (const page of medplum.searchResourcePages(
    'PractitionerRole',
    await projectQuery(medplum, { practitioner: connection.practitionerRef })
  )) {
    await check();
    for (const role of page) {
      actors.add(`PractitionerRole/${role.id}`);
    }
  }
  const appointments: Appointment[] = [];
  for await (const page of medplum.searchResourcePages(
    'Appointment',
    await projectQuery(medplum, {
      actor: [...actors].join(','),
      status: [...MIRRORED_APPOINTMENT_STATUSES].join(','),
      end: `gt${range.start.toISOString()}`,
      date: `lt${range.end.toISOString()}`,
      _count: '200',
    })
  )) {
    appointments.push(...page);
    await check();
  }
  const conflicts = new Map<string, CalendarConflict>();
  const add = (items: CalendarConflict[]): void => {
    for (const conflict of items) {
      const previous = conflicts.get(conflict.key);
      conflicts.set(conflict.key, {
        ...conflict,
        schedules: [...new Set([...(previous?.schedules ?? []), ...conflict.schedules])].sort(),
      });
    }
  };
  if (imported) {
    add(
      findConflicts(
        connection.basic.id,
        imported.calendarId,
        imported.intervals,
        [...schedules],
        appointments,
        actors,
        now
      )
    );
  } else {
    for (const schedule of schedules) {
      await check();
      const slots = await importedSlots(
        medplum,
        connection.basic.id,
        undefined,
        {
          schedule,
          end: `gt${range.start.toISOString()}`,
          start: `lt${range.end.toISOString()}`,
        },
        check
      );
      for (let index = 0; index < slots.length; index++) {
        if (index % 200 === 0) {
          await check();
        }
        const slot = slots[index];
        const identity = readImportedIdentity(slot);
        if (identity?.scheduleRef !== schedule) {
          continue;
        }
        add(
          findConflicts(
            connection.basic.id,
            identity.calendarId,
            [{ eventId: identity.eventId, start: slot.start, end: slot.end }],
            [schedule],
            appointments,
            actors,
            now
          )
        );
      }
    }
  }
  await check();
  const values = [...conflicts.values()].sort((a, b) => a.key.localeCompare(b.key));
  if (JSON.stringify(readState(await lease.read()).conflicts) === JSON.stringify(values)) {
    return;
  }
  await lease.mutate((basic) => {
    const state = readState(basic);
    if (JSON.stringify(state.conflicts) !== JSON.stringify(values)) {
      state.conflictsRevision = randomUUID();
    }
    state.conflicts = values;
    return withState(basic, state);
  });
}
