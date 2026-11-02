// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { MedplumClient, WithId } from '@medplum/core';
import { sleep } from '@medplum/core';
import type { Appointment } from '@medplum/fhirtypes';
import type { GoogleCalendarClient } from '../common/google-calendar';
import { GOOGLE_CALENDAR_NAMESPACE as N, EVENT_PROPERTY } from '../common/constants';
import { importedSlots, readImportedIdentity } from '../common/import';
import { ConnectionBusyError, ifMatch, withConnectionLease } from '../common/lease';
import { projectQuery } from '../common/project';
import { toGoogleEventId } from '../common/mapping';

export const TEST_SYSTEM = `${N}/e2e-run`;
export interface TestManifest {
  version: 1;
  run: string;
  baseUrl: string;
  projectId: string;
  practitionerRef: string;
  connectionId: string;
  accountSub: string;
  calendarId: string;
  googleEventId: string;
  start: string;
  end: string;
  checks: string[];
  cleanupComplete: boolean;
  googleOccurrenceIds?: string[];
  testScheduleId?: string;
}
export type TestCalendar = Pick<GoogleCalendarClient, 'getEvent' | 'deleteEvent'> &
  Partial<Pick<GoogleCalendarClient, 'listBusyEvents'>>;

export async function fixtureAppointments(
  medplum: MedplumClient,
  manifest: TestManifest
): Promise<WithId<Appointment>[]> {
  const result: WithId<Appointment>[] = [];
  for await (const page of medplum.searchResourcePages(
    'Appointment',
    await projectQuery(medplum, {
      identifier: `${TEST_SYSTEM}|${manifest.run}`,
      _count: '100',
    })
  )) {
    for (const appointment of page) {
      if (
        appointment.meta?.project !== manifest.projectId ||
        !appointment.identifier?.some((id) => id.system === TEST_SYSTEM && id.value === manifest.run) ||
        !appointment.participant.some((p) => p.actor?.reference === manifest.practitionerRef)
      ) {
        throw new Error('Test Appointment ownership mismatch');
      }
      result.push(appointment);
    }
  }
  return result;
}

// Cleanup checks exact identity, never names, time windows, or all events on a calendar.
export async function removeTestEvent(
  calendar: TestCalendar,
  id: string,
  properties: Record<string, string>
): Promise<void> {
  const event = await calendar.getEvent(id);
  if (!event || event.status === 'cancelled') {
    return;
  }
  if (
    !event.etag ||
    !Object.entries(properties).every(([key, value]) => event.extendedProperties?.private?.[key] === value)
  ) {
    throw new Error('Test Google event ownership/version mismatch; retained for repair');
  }
  await calendar.deleteEvent(id, event.etag);
  const remaining = await calendar.getEvent(id);
  if (remaining && remaining.status !== 'cancelled') {
    throw new Error('Google test event remains after deletion');
  }
}

export async function cleanupFixtures(
  medplum: MedplumClient,
  calendar: TestCalendar,
  manifest: TestManifest,
  save: () => void = () => {}
): Promise<void> {
  const failures: string[] = [];
  const attempt = async (name: string, work: () => Promise<void>): Promise<void> => {
    try {
      await work();
    } catch {
      failures.push(name);
    }
  };
  // Persist recurrence identities from Google-owned fixture markers before removing the series.
  // This also recovers a lost insert/update response or interruption before the runner saved them.
  if (calendar.listBusyEvents) {
    const snapshot = await calendar.listBusyEvents(
      manifest.start,
      new Date(Date.parse(manifest.end) + 3 * 86400_000).toISOString()
    );
    manifest.googleOccurrenceIds = [
      ...new Set([
        ...(manifest.googleOccurrenceIds ?? []),
        ...snapshot.events
          .filter(
            (event) =>
              event.extendedProperties?.private?.medplumE2ERun === manifest.run &&
              event.extendedProperties?.private?.medplumE2EProject === manifest.projectId
          )
          .map((event) => event.id),
      ]),
    ];
    save();
  }
  // Remove upstream sources first, even if a worker currently holds the lease.
  await attempt('Google source', () =>
    removeTestEvent(calendar, manifest.googleEventId, {
      medplumE2ERun: manifest.run,
      medplumE2EProject: manifest.projectId,
    })
  );
  await attempt('Appointment cancellation', async () => {
    for (const appointment of await fixtureAppointments(medplum, manifest)) {
      if (appointment.status !== 'cancelled') {
        await medplum.updateResource({ ...appointment, status: 'cancelled' }, ifMatch(appointment));
      }
    }
  });
  // Do not race an importer or outbound worker; a busy lease leaves recovery pending.
  await attempt('Worker-serialized cleanup', async () => {
    await retryBusyCleanup(() =>
      withConnectionLease(medplum, manifest.connectionId, async (lease) => {
        for (const appointment of await fixtureAppointments(medplum, manifest)) {
          if (appointment.status !== 'cancelled') {
            throw new Error('Fixture still active');
          }
          const id = toGoogleEventId(appointment.id);
          if (!id) {
            throw new Error('Invalid fixture event identity');
          }
          await lease.check();
          await removeTestEvent(calendar, id, {
            [EVENT_PROPERTY.project]: manifest.projectId,
            [EVENT_PROPERTY.source]: `Appointment/${appointment.id}`,
            [EVENT_PROPERTY.connection]: manifest.connectionId,
          });
        }
        const source = await calendar.getEvent(manifest.googleEventId);
        if (source && source.status !== 'cancelled') {
          throw new Error('Google source still active');
        }
        const testSchedule = manifest.testScheduleId
          ? await medplum.searchOne(
              'Schedule',
              await projectQuery(medplum, { identifier: `${TEST_SYSTEM}|${manifest.run}` })
            )
          : undefined;
        if (
          testSchedule &&
          (testSchedule.meta?.project !== manifest.projectId ||
            !testSchedule.actor.some((actor) => actor.reference === manifest.practitionerRef))
        ) {
          throw new Error('Test Schedule ownership mismatch');
        }
        for (const slot of await importedSlots(medplum, manifest.connectionId)) {
          const identity = readImportedIdentity(slot);
          if (
            !identity ||
            ((!testSchedule || identity.scheduleRef !== `Schedule/${testSchedule.id}`) &&
              ![manifest.googleEventId, ...(manifest.googleOccurrenceIds ?? [])].includes(identity.eventId)) ||
            identity.calendarId !== manifest.calendarId
          ) {
            continue;
          }
          if (slot.meta?.project !== manifest.projectId) {
            throw new Error('Foreign Slot');
          }
          await lease.check();
          await medplum.deleteResource('Slot', slot.id, ifMatch(slot));
        }
        if (testSchedule) {
          await lease.check();
          await medplum.deleteResource('Schedule', testSchedule.id, ifMatch(testSchedule));
        }
      })
    );
  });
  if (failures.length) {
    throw new Error(`Cleanup incomplete: ${failures.join(', ')}. Retry with the saved manifest.`);
  }
}

// Always preserve both failures: failed cleanup must never turn a failed run into success.
export async function runWithCleanup(work: () => Promise<void>, cleanup: () => Promise<void>): Promise<void> {
  const errors: unknown[] = [];
  try {
    await work();
  } catch (err) {
    errors.push(err);
  } finally {
    try {
      await cleanup();
    } catch (err) {
      errors.push(err);
    }
  }
  if (errors.length) {
    throw new AggregateError(errors, 'Live checks or cleanup failed');
  }
}

// Worker contention is expected after cancellation; keep retries bounded and preserve other errors.
export async function retryBusyCleanup(work: () => Promise<void>, pause = sleep): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await work();
      return;
    } catch (error) {
      if (!(error instanceof ConnectionBusyError) || attempt >= 14) {
        throw error;
      }
      await pause(2000);
    }
  }
}
