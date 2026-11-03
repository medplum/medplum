// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { BotEvent, ResourceArray, WithId } from '@medplum/core';
import type { Appointment, Practitioner, PractitionerRole, Resource, Schedule, Slot } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { writeProjectCeiling } from './configuration';
import type { CalendarConnection } from './connection';
import { findConnection, saveConnection } from './connection';
import type { GoogleCalendarEvent } from './mapping';
import { toGoogleEventId } from './mapping';
import { parseSyncRange, syncRange } from './range-sync';
import { readState, requestSync } from './state';
import type { SyncDeps } from './sync';
import { SyncSession } from './sync';

const PROJECT_ID = 'proj-1';
const NOW = new Date('2026-10-07T12:00:00Z');
const RANGE = { start: new Date('2026-10-01T00:00:00Z'), end: new Date('2026-12-31T00:00:00Z') };

const secrets: BotEvent['secrets'] = {
  GOOGLE_CALENDAR_CLIENT_ID: { name: 'id', valueString: 'cid' },
  GOOGLE_CALENDAR_CLIENT_SECRET: { name: 'secret', valueString: 'csecret' },
};

function fakeDeps(upserts: GoogleCalendarEvent[], failFor?: string): SyncDeps {
  return {
    refreshAccessToken: async () => ({ access_token: 'at', expires_in: 3599, scope: 's', token_type: 'Bearer' }),
    createCalendarClient: () => ({
      upsertEvent: async (event) => {
        if (event.id === failFor) {
          throw new Error('400 invalid');
        }
        upserts.push(event);
        return 'inserted';
      },
      listEvents: async () => [],
      deleteOwnedEvent: async () => undefined,
    }),
  };
}

describe('range-sync', () => {
  let medplum: MockClient;
  let upserts: GoogleCalendarEvent[];
  let practitionerRef: string;
  let connection: CalendarConnection;
  let schedule: Schedule;
  /** What the (stubbed) Medplum searches return: the in-memory repo can't run the chained/_filter queries. */
  let searched: { appointments: WithId<Appointment>[]; slots: WithId<Slot>[] };

  beforeEach(async () => {
    medplum = new MockClient({ project: { resourceType: 'Project', id: 'proj-1', name: 'Calendar test' } });
    upserts = [];
    searched = { appointments: [], slots: [] };
    const practitioner = await medplum.createResource<Practitioner>({ resourceType: 'Practitioner' });
    practitionerRef = `Practitioner/${practitioner.id}`;
    schedule = await medplum.createResource<Schedule>({
      resourceType: 'Schedule',
      actor: [{ reference: practitionerRef }],
    });
    connection = await saveConnection(medplum, {
      practitionerRef,
      accountSub: 'sub',
      refreshToken: 'rt',
    });
    const realPages = medplum.searchResourcePages.bind(medplum);
    vi.spyOn(medplum, 'searchResourcePages').mockImplementation(((resourceType: string, query?: string) => {
      if (resourceType !== 'Appointment' && resourceType !== 'Slot') {
        return realPages(resourceType as 'Basic', query);
      }
      const items: Resource[] = resourceType === 'Appointment' ? searched.appointments : searched.slots;
      const page = [...items] as ResourceArray;
      page.bundle = { resourceType: 'Bundle', type: 'searchset' };
      return (async function* () {
        yield page as never;
      })();
    }) as typeof medplum.searchResourcePages);
  });

  afterEach(() => vi.restoreAllMocks());

  function booked(extra: Partial<Appointment> = {}): Promise<WithId<Appointment>> {
    return medplum.createResource<Appointment>({
      resourceType: 'Appointment',
      status: 'booked',
      start: '2026-10-10T16:00:00Z',
      end: '2026-10-10T16:30:00Z',
      participant: [{ actor: { reference: practitionerRef }, status: 'accepted' }],
      ...extra,
    });
  }

  function run(deps = fakeDeps(upserts)): ReturnType<typeof syncRange> {
    return syncRange(new SyncSession(medplum, secrets, PROJECT_ID, deps), connection, RANGE);
  }

  test('ranges: default is now to +90 days; bounds are validated', () => {
    expect(parseSyncRange(undefined, undefined, NOW)).toEqual({ start: NOW, end: new Date('2027-01-05T12:00:00Z') });
    expect(parseSyncRange('2026-10-01T00:00:00Z', undefined, NOW).end).toEqual(new Date('2026-12-30T00:00:00Z'));
    expect(() => parseSyncRange('nope', undefined, NOW)).toThrow('ISO 8601');
    expect(() => parseSyncRange('2026-10-02T00:00:00Z', '2026-10-01T00:00:00Z', NOW)).toThrow('after start');
    expect(() => parseSyncRange('2026-01-01T00:00:00Z', '2027-06-01T00:00:00Z', NOW)).toThrow('one year');
  });

  test('pushes every mirrorable appointment and blocked slot in range', async () => {
    const a1 = await booked();
    const a2 = await booked();
    const block = await medplum.createResource<Slot>({
      resourceType: 'Slot',
      status: 'busy-unavailable',
      schedule: { reference: `Schedule/${schedule.id}` },
      start: '2026-10-13T00:00:00Z',
      end: '2026-10-14T00:00:00Z',
    });
    searched.appointments = [a1, a2];
    searched.slots = [block];

    const counts = await run();

    expect(counts).toMatchObject({ candidates: 3, inserted: 3, errors: 0 });
    expect(upserts.map((e) => e.id).sort()).toEqual(
      [toGoogleEventId(a1.id), toGoogleEventId(a2.id), toGoogleEventId(block.id)].sort()
    );
  });

  test('skips what no longer belongs: cancelled, declined via a role, buffers, and vanished', async () => {
    const role = await medplum.createResource<PractitionerRole>({
      resourceType: 'PractitionerRole',
      practitioner: { reference: practitionerRef },
    });
    const declined = await booked({
      participant: [{ actor: { reference: `PractitionerRole/${role.id}` }, status: 'declined' }],
    });
    const cancelled = await booked({ status: 'cancelled' });
    const buffer = await medplum.createResource<Slot>({
      resourceType: 'Slot',
      status: 'busy-unavailable',
      schedule: { reference: `Schedule/${schedule.id}` },
      start: '2026-10-10T15:50:00Z',
      end: '2026-10-10T16:00:00Z',
    });
    await booked({ slot: [{ reference: `Slot/${buffer.id}` }], participant: [] });
    const vanished = await booked();
    await medplum.deleteResource('Appointment', vanished.id);
    searched.appointments = [declined, cancelled, vanished];
    searched.slots = [buffer];

    const counts = await run();

    expect(counts).toMatchObject({ candidates: 4, errors: 0 });
    expect(upserts).toHaveLength(0);
  });

  test('one failing event does not stop the rest', async () => {
    const bad = await booked();
    const good = await booked();
    searched.appointments = [bad, good];

    const counts = await run(fakeDeps(upserts, toGoogleEventId(bad.id)));

    expect(counts).toMatchObject({ candidates: 2, inserted: 1, errors: 1 });
    expect(upserts.map((e) => e.id)).toEqual([toGoogleEventId(good.id)]);
  });

  test.each(['unchanged', 'rescheduled', 'cancelled', 'google-edit'] as const)(
    'repair skips only unchanged discovered source versions (%s)',
    async (change) => {
      const source = await booked();
      searched.appointments = [source];
      const deps = fakeDeps(upserts);
      const original = deps.createCalendarClient;
      const remove = vi.fn(async () => undefined);
      deps.createCalendarClient = (token) => ({
        ...original(token),
        listEvents: async () => {
          if (change === 'rescheduled') {
            await medplum.updateResource({ ...source, end: '2026-10-10T17:00:00Z' });
          } else if (change === 'cancelled') {
            await medplum.updateResource({ ...source, status: 'cancelled' });
          }
          return [{ ...upserts[0], ...(change === 'google-edit' ? { summary: 'External edit' } : {}) }];
        },
        deleteOwnedEvent: remove,
      });
      await run(deps);
      expect(upserts).toHaveLength(change === 'rescheduled' || change === 'google-edit' ? 2 : 1);
      expect(remove).toHaveBeenCalledTimes(change === 'cancelled' ? 1 : 0);
      if (change === 'rescheduled') {
        expect(upserts[1].end.dateTime).toBe('2026-10-10T17:00:00.000Z');
      }
    }
  );

  test('repairs cancellations missed by Subscriptions, verifies sources outside the discovery window', async () => {
    const cancelled = await booked({ status: 'cancelled' });
    const outside = await booked({ start: '2027-06-01T16:00:00Z', end: '2027-06-01T16:30:00Z' });
    const mirror = (source: WithId<Appointment>): GoogleCalendarEvent => ({
      id: toGoogleEventId(source.id) as string,
      status: 'confirmed',
      summary: 'Appointment',
      start: { dateTime: source.start as string },
      end: { dateTime: source.end as string },
      transparency: 'opaque',
      visibility: 'private',
      attendees: [],
      reminders: { useDefault: true },
      extendedProperties: {
        private: {
          medplumProject: PROJECT_ID,
          medplumSource: `Appointment/${source.id}`,
          medplumConnection: connection.basic.id,
        },
      },
    });
    const remove = vi.fn(async () => undefined);
    const deps = fakeDeps(upserts);
    const original = deps.createCalendarClient;
    deps.createCalendarClient = (token) => ({
      ...original(token),
      listEvents: async () => [mirror(cancelled), mirror(outside)],
      deleteOwnedEvent: remove,
    });
    expect(await run(deps)).toMatchObject({ candidates: 0, repaired: 1, deleted: 1, errors: 0 });
    expect(remove).toHaveBeenCalledWith(
      toGoogleEventId(cancelled.id),
      expect.objectContaining({ medplumSource: `Appointment/${cancelled.id}` })
    );
    expect(upserts.map((e) => e.id)).toEqual([toGoogleEventId(outside.id)]);
  });

  test('a read failure cannot authorize removal, and another connection’s event is untouched', async () => {
    const source = await booked();
    const event: GoogleCalendarEvent = {
      id: toGoogleEventId(source.id) as string,
      status: 'confirmed',
      summary: 'Appointment',
      start: { dateTime: source.start as string },
      end: { dateTime: source.end as string },
      transparency: 'opaque',
      visibility: 'private',
      attendees: [],
      reminders: { useDefault: true },
      extendedProperties: {
        private: {
          medplumProject: PROJECT_ID,
          medplumSource: `Appointment/${source.id}`,
          medplumConnection: connection.basic.id,
        },
      },
    };
    const other = {
      ...event,
      id: 'other',
      extendedProperties: { private: { ...event.extendedProperties.private, medplumConnection: 'other' } },
    };
    const remove = vi.fn(async () => undefined);
    const deps = fakeDeps(upserts);
    const original = deps.createCalendarClient;
    deps.createCalendarClient = (token) => ({
      ...original(token),
      listEvents: async () => [event, other],
      deleteOwnedEvent: remove,
    });
    const read = medplum.readResource.bind(medplum);
    vi.spyOn(medplum, 'readResource').mockImplementation(((type, id, options) => {
      if (type === 'Appointment') {
        return Promise.reject(new Error('permission denied'));
      }
      return read(type, id, options);
    }) as typeof medplum.readResource);
    expect(await run(deps)).toMatchObject({ errors: 1, deleted: 0 });
    expect(remove).not.toHaveBeenCalled();
    expect(upserts).toEqual([]);
  });

  test('stops when the connection needs re-authorization', async () => {
    searched.appointments = [await booked(), await booked()];
    const deps = fakeDeps(upserts);
    deps.refreshAccessToken = async () => {
      const { GoogleOAuthError } = await import('./google-oauth');
      throw new GoogleOAuthError(400, 'invalid_grant', 'revoked');
    };

    const counts = await run(deps);

    // Stopped after the first candidate: the second was never attempted.
    expect(counts).toEqual({ candidates: 1, errors: 1, 'reauth-required': 1 });
    expect((await findConnection(medplum, practitionerRef))?.status).toBe('reauth-required');
  });
  test('resumes an interrupted discovery from its durable cursor', async () => {
    searched.appointments = [await booked(), await booked()].sort((a, b) => a.id.localeCompare(b.id));
    let time = Date.now();
    vi.spyOn(Date, 'now').mockImplementation(() => time);
    const deps = fakeDeps(upserts);
    const client = deps.createCalendarClient('token');
    const upsert = client.upsertEvent;
    client.upsertEvent = async (event) => {
      const result = await upsert(event);
      time += 7 * 60_000;
      return result;
    };
    deps.createCalendarClient = () => client;
    const first = await syncRange(new SyncSession(medplum, secrets, PROJECT_ID, deps), connection, RANGE, true);
    expect(first.pending).toBe(1);
    const stored = await medplum.readResource('Basic', connection.basic.id);
    expect(readState(stored).outboundWork?.cursor).toBe(`Appointment/${searched.appointments[0].id}`);
    expect(readState(stored).privacyPending).toBe(true);
    const result = await syncRange(
      new SyncSession(medplum, secrets, PROJECT_ID, fakeDeps(upserts)),
      connection,
      RANGE,
      true
    );
    expect(result.errors).toBe(0);
    expect(upserts.map((e) => e.id)).toEqual(searched.appointments.map((a) => toGoogleEventId(a.id)));
    expect(readState(await medplum.readResource('Basic', connection.basic.id)).outboundWork).toBeUndefined();
    expect(readState(await medplum.readResource('Basic', connection.basic.id)).privacyPending).toBe(false);
  });

  test('a new privacy request during a run remains pending for the next run', async () => {
    searched.appointments = [await booked()];
    const deps = fakeDeps(upserts);
    const client = deps.createCalendarClient('token');
    const upsert = client.upsertEvent;
    client.upsertEvent = async (event) => {
      await writeProjectCeiling(medplum, 'busy-only');
      await requestSync(medplum, connection.basic.id, ['outbound'], true);
      return upsert(event);
    };
    deps.createCalendarClient = () => client;
    await run(deps);
    expect(readState(await medplum.readResource('Basic', connection.basic.id)).privacyPending).toBe(true);
    await run();
    expect(readState(await medplum.readResource('Basic', connection.basic.id)).privacyPending).toBe(false);
  });
});
