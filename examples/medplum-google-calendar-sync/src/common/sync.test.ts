// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { BotEvent } from '@medplum/core';
import type {
  Appointment,
  HealthcareService,
  Patient,
  Practitioner,
  PractitionerRole,
  Schedule,
  Slot,
} from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { findConnection, saveConnection } from './connection';
import { GoogleOAuthError } from './google-oauth';
import type { GoogleCalendarEvent } from './mapping';
import type { SyncDeps } from './sync';
import { SyncSession } from './sync';

const PROJECT_ID = 'proj-1';

const secrets: BotEvent['secrets'] = {
  GOOGLE_CALENDAR_CLIENT_ID: { name: 'id', valueString: 'cid' },
  GOOGLE_CALENDAR_CLIENT_SECRET: { name: 'secret', valueString: 'csecret' },
};

interface FakeCalendar {
  upserts: GoogleCalendarEvent[];
  deletes: string[];
}

function fakeDeps(calendars: Map<string, FakeCalendar>, refresh?: SyncDeps['refreshAccessToken']): SyncDeps {
  return {
    refreshAccessToken:
      refresh ??
      vi.fn(async (_client, refreshToken: string) => ({
        access_token: `access-for-${refreshToken}`,
        expires_in: 3599,
        scope: 's',
        token_type: 'Bearer',
      })),
    createCalendarClient: (accessToken) => {
      const calendar = calendars.get(accessToken) ?? { upserts: [], deletes: [] };
      calendars.set(accessToken, calendar);
      return {
        upsertEvent: async (event) => {
          calendar.upserts.push(event);
          return 'inserted';
        },
        listEvents: async () => [],
        deleteOwnedEvent: async (id) => {
          calendar.deletes.push(id);
        },
      };
    },
  };
}

describe('SyncSession', () => {
  let medplum: MockClient;
  let calendars: Map<string, FakeCalendar>;
  let rivera: Practitioner;
  let chen: Practitioner;
  let chenRole: PractitionerRole;
  let jane: Patient;
  let schedule: Schedule;

  beforeEach(async () => {
    medplum = new MockClient({ project: { resourceType: 'Project', id: 'proj-1', name: 'Calendar test' } });
    calendars = new Map();
    rivera = await medplum.createResource<Practitioner>({ resourceType: 'Practitioner', name: [{ family: 'Rivera' }] });
    chen = await medplum.createResource<Practitioner>({ resourceType: 'Practitioner', name: [{ family: 'Chen' }] });
    chenRole = await medplum.createResource<PractitionerRole>({
      resourceType: 'PractitionerRole',
      practitioner: { reference: `Practitioner/${chen.id}` },
    });
    jane = await medplum.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Jane'], family: 'Smith' }],
    });
    schedule = await medplum.createResource<Schedule>({
      resourceType: 'Schedule',
      actor: [{ reference: `Practitioner/${rivera.id}` }],
    });
  });

  async function connect(practitioner: Practitioner, token: string, level?: 'initials' | 'full'): Promise<void> {
    const practitionerRef = `Practitioner/${practitioner.id}`;
    await saveConnection(medplum, {
      practitionerRef,
      accountSub: `sub-${practitioner.id}`,
      refreshToken: token,
      eventDetailLevel: level,
    });
  }

  function appointment(overrides: Partial<Appointment> = {}): Promise<Appointment> {
    return medplum.createResource<Appointment>({
      resourceType: 'Appointment',
      status: 'booked',
      start: '2026-10-12T16:00:00Z',
      end: '2026-10-12T16:30:00Z',
      participant: [
        { actor: { reference: `Practitioner/${rivera.id}` }, status: 'accepted' },
        { actor: { reference: `PractitionerRole/${chenRole.id}` }, status: 'accepted' },
        { actor: { reference: `Patient/${jane.id}` }, status: 'accepted' },
      ],
      ...overrides,
    });
  }

  function session(deps = fakeDeps(calendars), extraSecrets: BotEvent['secrets'] = {}): SyncSession {
    return new SyncSession(medplum, { ...secrets, ...extraSecrets }, PROJECT_ID, deps);
  }

  test('mirrors a booked appointment to every connected practitioner, resolving roles', async () => {
    await connect(rivera, 'rt-rivera');
    await connect(chen, 'rt-chen');
    const appt = await appointment();

    const results = await session().syncSource({ resource: appt, deleted: false });

    expect(results).toEqual([
      { practitionerRef: `Practitioner/${rivera.id}`, outcome: 'inserted' },
      { practitionerRef: `Practitioner/${chen.id}`, outcome: 'inserted' },
    ]);
    const riveraEvent = calendars.get('access-for-rt-rivera')?.upserts[0];
    expect(riveraEvent?.summary).toBe('Appointment');
    expect(riveraEvent?.extendedProperties.private).toMatchObject({
      medplumDetail: 'busy-only',
      medplumProject: PROJECT_ID,
      medplumSource: `Appointment/${appt.id}`,
    });
    expect(calendars.get('access-for-rt-chen')?.upserts).toHaveLength(1);
  });

  test('skips practitioners who are not connected', async () => {
    await connect(rivera, 'rt-rivera');
    const results = await session().syncSource({ resource: await appointment(), deleted: false });
    expect(results.map((r) => r.outcome)).toEqual(['inserted', 'not-connected']);
  });

  test('a practitioner listed directly and through a role is one recipient, unless every entry declined', async () => {
    await connect(chen, 'rt-chen');
    const both = await appointment({
      participant: [
        { actor: { reference: `Practitioner/${chen.id}` }, status: 'declined' },
        { actor: { reference: `PractitionerRole/${chenRole.id}` }, status: 'accepted' },
      ],
    });
    expect(await session().syncSource({ resource: both, deleted: false })).toEqual([
      { practitionerRef: `Practitioner/${chen.id}`, outcome: 'inserted' },
    ]);
    const neither = await appointment({
      participant: [
        { actor: { reference: `Practitioner/${chen.id}` }, status: 'declined' },
        { actor: { reference: `PractitionerRole/${chenRole.id}` }, status: 'declined' },
      ],
    });
    expect(await session().syncSource({ resource: neither, deleted: false })).toEqual([
      { practitionerRef: `Practitioner/${chen.id}`, outcome: 'deleted' },
    ]);
  });

  test('deletes for cancelled, deleted and declined', async () => {
    await connect(rivera, 'rt-rivera');
    await connect(chen, 'rt-chen');
    const s = session();

    const cancelled = await appointment({ status: 'cancelled' });
    await s.syncSource({ resource: cancelled, deleted: false });
    const gone = await appointment();
    await medplum.deleteResource('Appointment', gone.id as string);
    await s.syncSource({ resource: gone, deleted: true });
    const declined = await appointment({
      participant: [
        { actor: { reference: `Practitioner/${rivera.id}` }, status: 'declined' },
        { actor: { reference: `Practitioner/${chen.id}` }, status: 'accepted' },
      ],
    });
    const results = await s.syncSource({ resource: declined, deleted: false });

    expect(results).toEqual([
      { practitionerRef: `Practitioner/${rivera.id}`, outcome: 'deleted' },
      { practitionerRef: `Practitioner/${chen.id}`, outcome: 'inserted' },
    ]);
    const riveraDeletes = calendars.get('access-for-rt-rivera')?.deletes ?? [];
    expect(riveraDeletes).toHaveLength(3);
    expect(riveraDeletes[0]).toBe(cancelled.id?.replaceAll('-', ''));
  });

  test('uses the stricter of the project ceiling and the practitioner override', async () => {
    await connect(rivera, 'rt-rivera', 'initials');
    await connect(chen, 'rt-chen');
    const appt = await appointment({ serviceType: [{ text: 'Follow-up' }] });
    await session(fakeDeps(calendars), { GOOGLE_CALENDAR_DETAIL_LEVEL: { name: 'l', valueString: 'full' } }).syncSource(
      { resource: appt, deleted: false }
    );
    expect(calendars.get('access-for-rt-rivera')?.upserts[0]?.summary).toBe('Appointment · J.S.');
    expect(calendars.get('access-for-rt-chen')?.upserts[0]?.summary).toBe('Jane Smith · Follow-up');
  });

  test('mirrors blocked time to the schedule actor, but not buffers', async () => {
    await connect(rivera, 'rt-rivera');
    const s = session();
    const block = await medplum.createResource<Slot>({
      resourceType: 'Slot',
      status: 'busy-unavailable',
      schedule: { reference: `Schedule/${schedule.id}` },
      start: '2026-10-13T00:00:00Z',
      end: '2026-10-14T00:00:00Z',
    });
    expect(await s.syncSource({ resource: block, deleted: false })).toEqual([
      { practitionerRef: `Practitioner/${rivera.id}`, outcome: 'inserted' },
    ]);
    expect(calendars.get('access-for-rt-rivera')?.upserts[0]?.summary).toBe('Busy');

    const buffer = await medplum.createResource<Slot>({
      resourceType: 'Slot',
      status: 'busy-unavailable',
      schedule: { reference: `Schedule/${schedule.id}` },
      start: '2026-10-12T15:50:00Z',
      end: '2026-10-12T16:00:00Z',
    });
    await appointment({ slot: [{ reference: `Slot/${buffer.id}` }] });
    expect(await s.syncSource({ resource: buffer, deleted: false })).toEqual([
      { practitionerRef: `Practitioner/${rivera.id}`, outcome: 'deleted' },
    ]);
  });

  test('imported Slots are ignored on both update and delete deliveries', async () => {
    await connect(rivera, 'rt-rivera');
    const slot = await medplum.createResource<Slot>({
      resourceType: 'Slot',
      status: 'busy-unavailable',
      schedule: { reference: `Schedule/${schedule.id}` },
      start: '2026-10-12T15:00:00Z',
      end: '2026-10-12T16:00:00Z',
      identifier: [{ system: 'https://www.medplum.com/integrations/google-calendar/imported-slot', value: 'owned' }],
    });
    expect(await session().syncSource({ resource: slot, deleted: false })).toEqual([]);
    expect(await session().syncSource({ resource: slot, deleted: true })).toEqual([]);
    expect(calendars.size).toBe(0);
  });

  test('a dead refresh token pauses the connection', async () => {
    await connect(rivera, 'rt-rivera');
    const refresh = vi.fn(async () => {
      throw new GoogleOAuthError(400, 'invalid_grant', 'revoked');
    });
    const s = session(fakeDeps(calendars, refresh));
    const appt = await appointment();

    const tasksBefore = await medplum.searchResources('Task');
    const results = await s.syncSource({ resource: appt, deleted: false });
    expect(results[0]).toEqual({ practitionerRef: `Practitioner/${rivera.id}`, outcome: 'reauth-required' });
    expect((await findConnection(medplum, `Practitioner/${rivera.id}`))?.status).toBe('reauth-required');

    // Already paused: no second refresh attempt.
    await s.syncSource({ resource: appt, deleted: false });
    expect(refresh).toHaveBeenCalledTimes(1);

    expect(await medplum.searchResources('DetectedIssue')).toHaveLength(0);
    expect(await medplum.searchResources('Task')).toEqual(tasksBefore);
  });

  test('one practitioner failing does not block the others', async () => {
    await connect(rivera, 'rt-rivera');
    await connect(chen, 'rt-chen');
    const deps = fakeDeps(calendars);
    const working = deps.createCalendarClient;
    deps.createCalendarClient = (token) =>
      token === 'access-for-rt-rivera'
        ? {
            upsertEvent: async () => {
              throw new Error('boom');
            },
            listEvents: async () => [],
            deleteOwnedEvent: async () => undefined,
          }
        : working(token);
    const results = await session(deps).syncSource({ resource: await appointment(), deleted: false });
    expect(results).toEqual([
      { practitionerRef: `Practitioner/${rivera.id}`, outcome: 'error', error: 'boom' },
      { practitionerRef: `Practitioner/${chen.id}`, outcome: 'inserted' },
    ]);
  });

  test('a practitioner taken off an appointment has their event removed', async () => {
    await connect(rivera, 'rt-rivera');
    await connect(chen, 'rt-chen');
    const s = session();
    const original = await appointment();
    await s.syncSource({ resource: original, deleted: false });

    const reassigned = await medplum.updateResource({
      ...original,
      participant: [
        { actor: { reference: `Practitioner/${chen.id}` }, status: 'accepted' },
        { actor: { reference: `Patient/${jane.id}` }, status: 'accepted' },
      ],
    });
    const results = await s.syncSource({ resource: reassigned, deleted: false });

    expect(results).toEqual([
      { practitionerRef: `Practitioner/${chen.id}`, outcome: 'inserted' },
      { practitionerRef: `Practitioner/${rivera.id}`, outcome: 'deleted' },
    ]);
    expect(calendars.get('access-for-rt-rivera')?.deletes).toEqual([original.id?.replaceAll('-', '')]);
  });

  test('the referenced HealthcareService names the visit, not the fallback text', async () => {
    await connect(rivera, 'rt-rivera', 'full');
    const service = await medplum.createResource<HealthcareService>({
      resourceType: 'HealthcareService',
      name: 'Follow-up visit',
    });
    const appt = await appointment({
      serviceType: [
        {
          text: 'Office Visit',
          extension: [
            {
              url: 'https://medplum.com/fhir/service-type-reference',
              valueReference: { reference: `HealthcareService/${service.id}` },
            },
          ],
        },
      ],
    });
    await session(fakeDeps(calendars), { GOOGLE_CALENDAR_DETAIL_LEVEL: { name: 'l', valueString: 'full' } }).syncSource(
      { resource: appt, deleted: false }
    );
    expect(calendars.get('access-for-rt-rivera')?.upserts[0]?.summary).toBe('Jane Smith · Follow-up visit');
  });
});
