// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { MedplumClient } from '@medplum/core';
import type { CalendarConnection } from './connection';
import { EVENT_PROPERTY } from './constants';
import type { GoogleCalendarClient } from './google-calendar';
import type { ConnectionLease } from './lease';
import type { GoogleCalendarEvent } from './mapping';
import { toGoogleEventId } from './mapping';
import { ownershipStore } from './ownership';
import { assertCurrentProject } from './project';
import { isImportedSlot } from './sync';

export interface MigrationResult {
  eventId: string;
  action: 'migrate' | 'skip' | 'repair-required';
}
async function sourceBelongs(medplum: MedplumClient, source: string, practitioner: string): Promise<boolean> {
  const match = source.match(/^(Appointment|Slot)\/([A-Za-z0-9.-]+)$/);
  if (!match) {
    return false;
  }
  const resource = await medplum.readResource(match[1] as 'Appointment' | 'Slot', match[2], { cache: 'no-cache' });
  await assertCurrentProject(medplum, resource);
  if (isImportedSlot(resource)) {
    return false;
  }
  let refs: (string | undefined)[];
  if (resource.resourceType === 'Appointment') {
    refs = resource.participant.map((p) => p.actor?.reference);
  } else {
    const schedule = await medplum.readReference(resource.schedule);
    await assertCurrentProject(medplum, schedule);
    if (schedule.resourceType !== 'Schedule') {
      return false;
    }
    refs = schedule.actor.map((a) => a.reference);
  }
  for (const ref of refs) {
    if (ref === practitioner) {
      return true;
    }
    if (ref?.startsWith('PractitionerRole/')) {
      const role = await medplum.readResource('PractitionerRole', ref.split('/')[1]);
      await assertCurrentProject(medplum, role);
      if (role.practitioner?.reference === practitioner) {
        return true;
      }
    }
  }
  return false;
}
/**
 * Rechecks project, source, account-bound connection and ETag for each write. Ambiguity is reported.
 * @param lease - Exclusive connection lease.
 * @param connection - Account-bound connection being migrated.
 * @param calendar - Client authenticated to that account.
 * @param apply - Write changes only when explicitly selected.
 * @returns The decision for each candidate event.
 */
export async function migrateMirrors(
  lease: ConnectionLease,
  connection: CalendarConnection,
  calendar: Pick<GoogleCalendarClient, 'listEvents' | 'getEvent' | 'updateEvent'>,
  apply = false
): Promise<MigrationResult[]> {
  const project = connection.basic.meta?.project;
  if (!project) {
    throw new Error('Connection has no project');
  }
  const results: MigrationResult[] = [];
  const owned = ownershipStore(lease, connection);
  for (const candidate of await calendar.listEvents([`${EVENT_PROPERTY.project}=${project}`])) {
    await lease.check();
    const event = await calendar.getEvent(candidate.id);
    if (!event) {
      continue;
    }
    const props = event.extendedProperties?.private;
    if (props?.[EVENT_PROPERTY.connection] && props[EVENT_PROPERTY.connection] !== connection.basic.id) {
      results.push({ eventId: event.id, action: 'skip' });
      continue;
    }
    const source = props?.[EVENT_PROPERTY.source];
    const sourceId = source?.match(/^(Appointment|Slot)\/([A-Za-z0-9.-]+)$/)?.[2];
    let verified = false;
    try {
      verified = Boolean(
        source &&
        sourceId &&
        toGoogleEventId(sourceId) === event.id &&
        props?.[EVENT_PROPERTY.project] === project &&
        event.etag &&
        event.status !== 'cancelled' &&
        (await sourceBelongs(lease.medplum, source, connection.practitionerRef))
      );
    } catch {
      /* Missing or unreadable source is not proof of ownership. */
    }
    if (!verified) {
      results.push({ eventId: event.id, action: 'repair-required' });
      continue;
    }
    results.push({ eventId: event.id, action: 'migrate' });
    if (!apply) {
      continue;
    }
    const scrubbed: GoogleCalendarEvent = {
      id: event.id,
      status: 'confirmed',
      summary: 'Busy',
      start: event.start,
      end: event.end,
      transparency: 'opaque',
      visibility: 'private',
      attendees: [],
      reminders: { useDefault: false },
      extendedProperties: {
        private: { ...props, [EVENT_PROPERTY.connection]: connection.basic.id, medplumDetail: 'busy-only' },
      },
    };
    await lease.check();
    await calendar.updateEvent(event.id, scrubbed, event.etag);
    await owned.remember(scrubbed);
  }
  return results;
}
