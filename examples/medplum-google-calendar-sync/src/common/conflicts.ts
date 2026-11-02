// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { Appointment } from '@medplum/fhirtypes';
import { randomUUID } from 'node:crypto';
import type { CalendarConnection } from './connection';
import type { CalendarConflict } from './import';
import { findConflicts, importedSlots, practitionerSchedules, readImportedIdentity } from './import';
import type { ConnectionLease } from './lease';
import { MIRRORED_APPOINTMENT_STATUSES } from './mapping';
import { projectQuery } from './project';
import { parseSyncRange } from './range-sync';
import { readState, withState } from './state';

/**
 * Refresh conflicts from local imported blocks; Appointment edits do not require a Google snapshot.
 * @param lease - Current connection lease.
 * @param connection - Connection whose imported blocks are checked.
 */
export async function refreshConflicts(lease: ConnectionLease, connection: CalendarConnection): Promise<void> {
  const medplum = lease.medplum;
  const now = new Date();
  const range = parseSyncRange(undefined, undefined, now);
  const schedules = new Set(
    (await practitionerSchedules(medplum, connection.practitionerRef)).map((s) => `Schedule/${s.id}`)
  );
  const actors = new Set([connection.practitionerRef]);
  for await (const page of medplum.searchResourcePages(
    'PractitionerRole',
    await projectQuery(medplum, { practitioner: connection.practitionerRef })
  )) {
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
    await lease.check();
  }
  const conflicts = new Map<string, CalendarConflict>();
  for (const slot of await importedSlots(medplum, connection.basic.id, undefined, {
    end: `gt${range.start.toISOString()}`,
    start: `lt${range.end.toISOString()}`,
  })) {
    const identity = readImportedIdentity(slot);
    if (!identity || !schedules.has(identity.scheduleRef)) {
      continue;
    }
    for (const conflict of findConflicts(
      connection.basic.id,
      identity.calendarId,
      [{ eventId: identity.eventId, start: slot.start, end: slot.end }],
      [identity.scheduleRef],
      appointments,
      actors,
      now
    )) {
      const previous = conflicts.get(conflict.key);
      conflicts.set(conflict.key, {
        ...conflict,
        schedules: [...new Set([...(previous?.schedules ?? []), identity.scheduleRef])].sort(),
      });
    }
    await lease.check();
  }
  const values = [...conflicts.values()].sort((a, b) => a.key.localeCompare(b.key));
  await lease.mutate((basic) => {
    const state = readState(basic);
    if (JSON.stringify(state.conflicts) !== JSON.stringify(values)) {
      state.conflictsRevision = randomUUID();
    }
    state.conflicts = values;
    return withState(basic, state);
  });
}
