// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { WithId } from '@medplum/core';
import type { Slot } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { expect, test, vi } from 'vitest';
import { saveConnection } from '../common/connection';
import { IMPORT_IDENTIFIER_SYSTEM } from '../common/constants';
import { importIdentifier } from '../common/import';
import { ConnectionBusyError } from '../common/lease';
import type { TestManifest } from './e2e-fixtures';
import { cleanupFixtures, removeTestEvent, retryBusyCleanup, runWithCleanup, TEST_SYSTEM } from './e2e-fixtures';

const liveEvent = {
  id: 'test-event',
  status: 'confirmed' as const,
  etag: 'v1',
  start: { dateTime: '2026-11-07T10:00:00Z' },
  end: { dateTime: '2026-11-07T10:10:00Z' },
  extendedProperties: { private: { medplumE2ERun: 'run' } },
};

test('cleanup refuses another event and uses an ETag for an owned event', async () => {
  const calendar = { getEvent: vi.fn().mockResolvedValue(liveEvent), deleteEvent: vi.fn() };
  await expect(removeTestEvent(calendar, 'test-event', { medplumE2ERun: 'other' })).rejects.toThrow(
    'ownership/version mismatch'
  );
  expect(calendar.deleteEvent).not.toHaveBeenCalled();
  calendar.getEvent.mockResolvedValueOnce(liveEvent).mockResolvedValueOnce(undefined);
  await removeTestEvent(calendar, 'test-event', { medplumE2ERun: 'run' });
  expect(calendar.deleteEvent).toHaveBeenCalledWith('test-event', 'v1');
});

test('stripped cancelled tombstones require no delete or adoption', async () => {
  const calendar = {
    getEvent: vi.fn().mockResolvedValue({ ...liveEvent, status: 'cancelled', extendedProperties: undefined }),
    deleteEvent: vi.fn(),
  };
  await removeTestEvent(calendar, 'test-event', { medplumE2ERun: 'run' });
  expect(calendar.deleteEvent).not.toHaveBeenCalled();
});

test('test failures still run cleanup and retain both failures', async () => {
  const workError = new Error('write response lost');
  const cleanupError = new Error('cleanup unavailable');
  const cleanup = vi.fn().mockRejectedValue(cleanupError);
  await expect(
    runWithCleanup(async () => {
      throw workError;
    }, cleanup)
  ).rejects.toMatchObject({ errors: [workError, cleanupError] });
  expect(cleanup).toHaveBeenCalledOnce();
});

test('cleanup failure makes an otherwise passing run fail', async () => {
  await expect(
    runWithCleanup(
      async () => undefined,
      async () => {
        throw new Error('cleanup');
      }
    )
  ).rejects.toThrow('Live checks or cleanup failed');
});

test('recovery discovers a lost create response, cancels its Appointment, and deletes only matching imported Slots', async () => {
  const medplum = new MockClient();
  const connection = await saveConnection(medplum, {
    practitionerRef: 'Practitioner/p',
    accountSub: 'account',
    refreshToken: 'unused-test-token',
  });
  const manifest: TestManifest = {
    version: 1,
    run: 'run',
    baseUrl: 'https://example.com/',
    projectId: medplum.getProject()?.id as string,
    practitionerRef: 'Practitioner/p',
    connectionId: connection.basic.id,
    accountSub: 'account',
    calendarId: 'calendar',
    googleEventId: 'test-event',
    start: liveEvent.start.dateTime,
    end: liveEvent.end.dateTime,
    checks: [],
    cleanupComplete: false,
  };
  const appointment = await medplum.createResource({
    resourceType: 'Appointment',
    status: 'booked',
    identifier: [{ system: TEST_SYSTEM, value: 'run' }],
    participant: [{ actor: { reference: 'Practitioner/p' }, status: 'accepted' }],
  });
  const slots: WithId<Slot>[] = [];
  for (const eventId of ['test-event', 'test-event-occurrence', 'unrelated-event']) {
    slots.push(
      await medplum.createResource({
        resourceType: 'Slot',
        status: 'busy-unavailable',
        schedule: { reference: 'Schedule/s' },
        start: manifest.start,
        end: manifest.end,
        identifier: [
          {
            system: IMPORT_IDENTIFIER_SYSTEM,
            value: importIdentifier({
              connectionId: connection.basic.id,
              calendarId: 'calendar',
              eventId,
              scheduleRef: 'Schedule/s',
            }),
          },
        ],
      })
    );
  }
  const before = (await medplum.searchResources('Slot')).map((slot) => slot.id);
  const calendar = {
    getEvent: vi.fn().mockResolvedValue(undefined),
    deleteEvent: vi.fn(),
    listBusyEvents: vi.fn().mockResolvedValue({
      calendarId: 'calendar',
      events: [
        {
          id: 'test-event-occurrence',
          extendedProperties: { private: { medplumE2ERun: manifest.run, medplumE2EProject: manifest.projectId } },
        },
        {
          id: 'unrelated-event',
          extendedProperties: { private: { medplumE2ERun: 'other', medplumE2EProject: manifest.projectId } },
        },
      ],
    }),
  };
  const save = vi.fn();
  await cleanupFixtures(medplum, calendar, manifest, save);
  expect(manifest.googleOccurrenceIds).toEqual(['test-event-occurrence']);
  expect(save).toHaveBeenCalledOnce();
  expect(save.mock.invocationCallOrder[0]).toBeLessThan(calendar.getEvent.mock.invocationCallOrder[0]);
  expect((await medplum.readResource('Appointment', appointment.id)).status).toBe('cancelled');
  const remaining = await medplum.searchResources('Slot');
  expect(remaining.map((s) => s.id).sort()).toEqual(
    before.filter((id) => id !== slots[0].id && id !== slots[1].id).sort()
  );
  // Retrying the same manifest is safe after successful cleanup.
  await cleanupFixtures(medplum, calendar, manifest);
  expect(calendar.deleteEvent).not.toHaveBeenCalled();
});

test('a Google cleanup failure still attempts Medplum cancellation', async () => {
  const medplum = new MockClient();
  const connection = await saveConnection(medplum, {
    practitionerRef: 'Practitioner/p',
    accountSub: 'account',
    refreshToken: 'unused-test-token',
  });
  const manifest: TestManifest = {
    version: 1,
    run: 'run',
    baseUrl: 'https://example.com/',
    projectId: medplum.getProject()?.id as string,
    practitionerRef: 'Practitioner/p',
    connectionId: connection.basic.id,
    accountSub: 'account',
    calendarId: 'calendar',
    googleEventId: 'test-event',
    start: liveEvent.start.dateTime,
    end: liveEvent.end.dateTime,
    checks: [],
    cleanupComplete: false,
  };
  const appointment = await medplum.createResource({
    resourceType: 'Appointment',
    status: 'booked',
    identifier: [{ system: TEST_SYSTEM, value: 'run' }],
    participant: [{ actor: { reference: 'Practitioner/p' }, status: 'accepted' }],
  });
  const calendar = { getEvent: vi.fn().mockRejectedValue(new Error('offline')), deleteEvent: vi.fn() };
  await expect(cleanupFixtures(medplum, calendar, manifest)).rejects.toThrow('Cleanup incomplete');
  expect((await medplum.readResource('Appointment', appointment.id)).status).toBe('cancelled');
});

test('cleanup recovers a lost Schedule response by identifier and removes only its owned imported blocks', async () => {
  const medplum = new MockClient();
  const connection = await saveConnection(medplum, {
    practitionerRef: 'Practitioner/p',
    accountSub: 'account',
    refreshToken: 'test-token',
  });
  const schedule = await medplum.createResource({
    resourceType: 'Schedule',
    identifier: [{ system: TEST_SYSTEM, value: 'run' }],
    actor: [{ reference: 'Practitioner/p' }],
    active: true,
  });
  const manifest: TestManifest = {
    version: 1,
    run: 'run',
    baseUrl: 'https://example.com/',
    projectId: medplum.getProject()?.id as string,
    practitionerRef: 'Practitioner/p',
    connectionId: connection.basic.id,
    accountSub: 'account',
    calendarId: 'calendar',
    googleEventId: 'fixture',
    start: liveEvent.start.dateTime,
    end: liveEvent.end.dateTime,
    checks: [],
    cleanupComplete: false,
    testScheduleId: 'pending-write',
  };
  for (const scheduleRef of [`Schedule/${schedule.id}`, 'Schedule/real']) {
    await medplum.createResource({
      resourceType: 'Slot',
      schedule: { reference: scheduleRef },
      status: 'busy-unavailable',
      start: manifest.start,
      end: manifest.end,
      identifier: [
        {
          system: IMPORT_IDENTIFIER_SYSTEM,
          value: importIdentifier({
            connectionId: connection.basic.id,
            calendarId: 'calendar',
            eventId: 'ordinary-google-event',
            scheduleRef,
          }),
        },
      ],
    });
  }
  await cleanupFixtures(medplum, { getEvent: vi.fn().mockResolvedValue(undefined), deleteEvent: vi.fn() }, manifest);
  expect(await medplum.searchResources('Schedule', { identifier: `${TEST_SYSTEM}|run` })).toHaveLength(0);
  const slots = (await medplum.searchResources('Slot')).filter((slot) =>
    [`Schedule/${schedule.id}`, 'Schedule/real'].includes(slot.schedule.reference ?? '')
  );
  expect(slots).toHaveLength(1);
  expect(slots[0].schedule.reference).toBe('Schedule/real');
});

test('cleanup retries temporary lease contention but preserves permanent errors and has a limit', async () => {
  const pause = vi.fn().mockResolvedValue(undefined);
  const work = vi.fn().mockRejectedValueOnce(new ConnectionBusyError()).mockResolvedValue(undefined);
  await retryBusyCleanup(work, pause);
  expect(work).toHaveBeenCalledTimes(2);
  expect(pause).toHaveBeenCalledTimes(1);
  const failed = vi.fn().mockRejectedValue(new Error('ownership mismatch'));
  await expect(retryBusyCleanup(failed, pause)).rejects.toThrow('ownership mismatch');
  expect(failed).toHaveBeenCalledOnce();
  const busy = vi.fn().mockRejectedValue(new ConnectionBusyError());
  await expect(retryBusyCleanup(busy, pause)).rejects.toThrow('busy');
  expect(busy).toHaveBeenCalledTimes(15);
});
