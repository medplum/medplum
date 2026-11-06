// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { Appointment, Schedule, Slot } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { CalendarConnection } from './connection';
import { saveConnection } from './connection';
import { IMPORT_IDENTIFIER_SYSTEM } from './constants';
import type { RemoteCalendarEvent } from './google-calendar';
import {
  busyInterval,
  findConflicts,
  importBusyTime,
  importedSlots,
  importIdentifier,
  readImportedIdentity,
} from './import';

const RANGE = { start: new Date('2026-10-01T00:00:00Z'), end: new Date('2026-12-30T00:00:00Z') };
const PRACTITIONER = 'Practitioner/example';
const BUSY: RemoteCalendarEvent = {
  id: 'series_20261012T160000Z',
  status: 'confirmed',
  start: { dateTime: '2026-10-12T09:00:00-07:00' },
  end: { dateTime: '2026-10-12T09:30:00-07:00' },
};

describe('Google busy import', () => {
  let medplum: MockClient;
  let connection: CalendarConnection;
  let schedule: Schedule;
  beforeEach(async () => {
    medplum = new MockClient({ project: { resourceType: 'Project', id: 'proj-1', name: 'Calendar test' } });
    connection = await saveConnection(medplum, {
      practitionerRef: PRACTITIONER,
      accountSub: 'google-sub',
      refreshToken: 'test-token',
    });
    schedule = await medplum.createResource<Schedule>({
      resourceType: 'Schedule',
      active: true,
      actor: [{ reference: PRACTITIONER }],
    });
  });
  function run(
    events: RemoteCalendarEvent[] = [BUSY],
    beforeWrite: () => Promise<void> = vi.fn(async () => undefined)
  ): ReturnType<typeof importBusyTime> {
    return importBusyTime(
      medplum,
      { listBusyEvents: async () => ({ calendarId: 'primary@clinic.example', events }) },
      connection,
      RANGE,
      beforeWrite
    );
  }
  test('stable identities distinguish every connection, calendar, occurrence and Schedule', () => {
    const identity = { connectionId: 'c', calendarId: 'cal|one', eventId: 'e/one', scheduleRef: 'Schedule/s' };
    const value = importIdentifier(identity);
    const slot: Slot = {
      resourceType: 'Slot',
      identifier: [{ system: IMPORT_IDENTIFIER_SYSTEM, value }],
      status: 'busy-unavailable',
      schedule: { reference: 'Schedule/s' },
      start: '',
      end: '',
    };
    expect(readImportedIdentity(slot)).toEqual(identity);
    for (const key of Object.keys(identity) as (keyof typeof identity)[]) {
      expect(importIdentifier({ ...identity, [key]: identity[key] + '2' })).not.toBe(value);
    }
    expect(
      readImportedIdentity({ ...slot, identifier: [{ system: IMPORT_IDENTIFIER_SYSTEM, value: 'v1.invalid' }] })
    ).toBeUndefined();
  });
  test.each([
    { status: 'cancelled' },
    { transparency: 'transparent' },
    { start: { date: '2026-10-12' }, end: { date: '2026-10-13' } },
    { attendees: [{ self: true, responseStatus: 'declined' }] },
    { extendedProperties: { private: { medplumProject: 'project', medplumSource: 'Appointment/a' } } },
  ])('excludes ineligible Google events: %j', (change) => {
    expect(busyInterval({ ...BUSY, ...change }, 'project')).toBeUndefined();
  });
  test('keeps tentative invitations and normalizes offset/DST instants', () => {
    expect(busyInterval({ ...BUSY, attendees: [{ self: true, responseStatus: 'needsAction' }] })).toEqual({
      eventId: BUSY.id,
      start: '2026-10-12T16:00:00.000Z',
      end: '2026-10-12T16:30:00.000Z',
    });
    expect(
      busyInterval({
        ...BUSY,
        start: { dateTime: '2026-11-01T01:30:00-07:00' },
        end: { dateTime: '2026-11-01T01:30:00-08:00' },
      })
    ).toMatchObject({ start: '2026-11-01T08:30:00.000Z', end: '2026-11-01T09:30:00.000Z' });
  });
  test('imports to every active direct and role Schedule, without private content or duplicate Slots', async () => {
    const role = await medplum.createResource({
      resourceType: 'PractitionerRole',
      practitioner: { reference: PRACTITIONER },
    });
    const second = await medplum.createResource<Schedule>({
      resourceType: 'Schedule',
      actor: [{ reference: `PractitionerRole/${role.id}` }],
    });
    await medplum.createResource<Schedule>({
      resourceType: 'Schedule',
      active: false,
      actor: [{ reference: PRACTITIONER }],
    });
    const beforeWrite = vi.fn(async () => undefined);
    const snapshot = { ...BUSY, summary: 'Private appointment', description: 'Private notes' };
    expect(await run([snapshot], beforeWrite)).toMatchObject({ createdOrUpdated: 2, removed: 0 });
    const slots = await importedSlots(medplum, connection.basic.id);
    expect(slots.map((s) => s.schedule.reference).sort()).toEqual(
      [`Schedule/${schedule.id}`, `Schedule/${second.id}`].sort()
    );
    expect(slots.every((s) => !s.comment && !s.serviceType && s.status === 'busy-unavailable')).toBe(true);
    expect(JSON.stringify(slots)).not.toContain('Private');
    expect(await run()).toMatchObject({ createdOrUpdated: 0, removed: 0 });
    expect((await importedSlots(medplum, connection.basic.id)).map((s) => s.id)).toEqual(slots.map((s) => s.id));
    expect(beforeWrite).toHaveBeenCalledTimes(2);
  });
  test('a new Schedule is populated without a Google event change; inactive Schedule blocks are removed', async () => {
    await run();
    const second = await medplum.createResource<Schedule>({
      resourceType: 'Schedule',
      active: true,
      actor: [{ reference: PRACTITIONER }],
    });
    await medplum.updateResource({ ...schedule, active: false });
    expect(await run()).toMatchObject({ createdOrUpdated: 1, removed: 1 });
    expect((await importedSlots(medplum, connection.basic.id)).map((s) => s.schedule.reference)).toEqual([
      `Schedule/${second.id}`,
    ]);
  });
  test.each(
    [
      [],
      [{ ...BUSY, status: 'cancelled' }],
      [{ ...BUSY, transparency: 'transparent' }],
      [{ ...BUSY, start: { date: '2026-10-12' }, end: { date: '2026-10-13' } }],
      [{ ...BUSY, attendees: [{ self: true, responseStatus: 'declined' }] }],
    ].map((events) => ({ events }))
  )('removes former busy time after an authoritative exclusion', async ({ events }) => {
    await run();
    expect(await run(events)).toMatchObject({ removed: 1 });
    expect(await importedSlots(medplum, connection.basic.id)).toHaveLength(0);
  });
  test('updates a recurring exception in place and removes only the cancelled occurrence', async () => {
    const second = { ...BUSY, id: 'series_20261013T160000Z' };
    await run([BUSY, second]);
    const old = await importedSlots(medplum, connection.basic.id);
    await run([
      { ...BUSY, start: { dateTime: '2026-10-12T16:10:00Z' } },
      { ...second, status: 'cancelled' },
    ]);
    const slots = await importedSlots(medplum, connection.basic.id);
    expect(slots).toHaveLength(1);
    expect(slots[0].id).toBe(old.find((s) => readImportedIdentity(s)?.eventId === BUSY.id)?.id);
    expect(slots[0].start).toBe('2026-10-12T16:10:00.000Z');
  });
  test('does not write Appointments, ordinary Slots or another connection’s blocks', async () => {
    const ordinary = await medplum.createResource<Slot>({
      resourceType: 'Slot',
      status: 'busy-unavailable',
      schedule: { reference: `Schedule/${schedule.id}` },
      start: '2026-10-12T16:00:00Z',
      end: '2026-10-12T17:00:00Z',
    });
    const appointment = await medplum.createResource<Appointment>({
      resourceType: 'Appointment',
      status: 'booked',
      participant: [{ actor: { reference: PRACTITIONER }, status: 'accepted' }],
      start: ordinary.start,
      end: ordinary.end,
    });
    await run();
    const own = (await importedSlots(medplum, connection.basic.id))[0];
    const foreign = await medplum.createResource<Slot>({
      ...own,
      id: undefined,
      identifier: [
        {
          system: IMPORT_IDENTIFIER_SYSTEM,
          value: importIdentifier({
            ...(readImportedIdentity(own) as NonNullable<ReturnType<typeof readImportedIdentity>>),
            connectionId: 'other',
          }),
        },
      ],
    });
    await run([]);
    expect(await medplum.readResource('Slot', ordinary.id)).toEqual(ordinary);
    expect(await medplum.readResource('Slot', foreign.id)).toEqual(foreign);
    expect(await medplum.readResource('Appointment', appointment.id)).toEqual(appointment);
  });
  test('preserves all blocks on a failed Google fetch or malformed timed event', async () => {
    await run();
    const before = await importedSlots(medplum, connection.basic.id);
    await expect(
      importBusyTime(
        medplum,
        {
          listBusyEvents: async () => {
            throw new Error('page 2 failed');
          },
        },
        connection,
        RANGE,
        async () => undefined
      )
    ).rejects.toThrow('page 2 failed');
    await expect(run([{ ...BUSY, start: { dateTime: 'invalid' } }])).rejects.toThrow('malformed');
    expect(await importedSlots(medplum, connection.basic.id)).toEqual(before);
  });
  test('failed upserts or lost serialization prevent the removal sweep', async () => {
    await run();
    const before = await importedSlots(medplum, connection.basic.id);
    const other = { ...BUSY, id: 'new-occurrence' };
    await expect(
      run([other], async () => {
        throw new Error('worker lease lost');
      })
    ).rejects.toThrow('lease lost');
    expect(await importedSlots(medplum, connection.basic.id)).toEqual(before);
  });
  test('repairs locally edited Google-owned time and status', async () => {
    await run();
    const slot = (await importedSlots(medplum, connection.basic.id))[0];
    await medplum.updateResource({ ...slot, start: '2026-10-12T15:00:00Z', status: 'free' });
    await run();
    expect((await importedSlots(medplum, connection.basic.id))[0]).toMatchObject({
      id: slot.id,
      status: 'busy-unavailable',
      start: '2026-10-12T16:00:00.000Z',
    });
  });
});

describe('conflicts', () => {
  const interval = busyInterval(BUSY) as NonNullable<ReturnType<typeof busyInterval>>;
  const booked: Appointment = {
    resourceType: 'Appointment',
    id: 'visit',
    status: 'booked',
    start: '2026-10-12T16:15:00Z',
    end: '2026-10-12T16:45:00Z',
    participant: [{ actor: { reference: PRACTITIONER }, status: 'accepted' }],
  };
  const now = new Date('2026-10-01T00:00:00Z');
  const run = (appointments = [booked], time = now): ReturnType<typeof findConflicts> =>
    findConflicts(
      'conn',
      'calendar',
      [interval],
      ['Schedule/a', 'Schedule/b', 'Schedule/a'],
      appointments,
      new Set([PRACTITIONER]),
      time
    );
  test('one stable conflict per occurrence and appointment across matching Schedules', () => {
    const conflicts = run([booked, booked]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      appointment: 'Appointment/visit',
      schedules: ['Schedule/a', 'Schedule/b'],
      start: '2026-10-12T16:15:00.000Z',
      end: '2026-10-12T16:30:00.000Z',
    });
    expect(run()).toEqual(conflicts);
  });
  test('adjacent, declined, cancelled, proposed and wholly past appointments do not conflict', () => {
    expect(run([{ ...booked, start: interval.end }])).toEqual([]);
    expect(run([{ ...booked, end: interval.start }])).toEqual([]);
    expect(run([{ ...booked, participant: [{ actor: { reference: PRACTITIONER }, status: 'declined' }] }])).toEqual([]);
    expect(
      run([
        { ...booked, status: 'cancelled' },
        { ...booked, status: 'proposed' },
      ])
    ).toEqual([]);
    expect(run([booked], new Date('2026-10-13T00:00:00Z'))).toEqual([]);
  });
});
