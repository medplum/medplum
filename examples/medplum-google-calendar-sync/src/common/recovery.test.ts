// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { MockClient } from '@medplum/mock';
import { beforeEach, expect, test, vi } from 'vitest';
import { GoogleCalendarClient } from './google-calendar';
import { saveConnection } from './connection';
import { ownershipStore, MIRROR_SEARCH } from './ownership';
import { withConnectionLease } from './lease';
import { migrateMirrors } from './migration';
import type { GoogleCalendarEvent } from './mapping';
import { toGoogleEventId } from './mapping';
const sourceId = '12345678-1234-1234-1234-123456789abc';
const event: GoogleCalendarEvent = {
  id: toGoogleEventId(sourceId) as string,
  status: 'confirmed',
  summary: 'Busy',
  start: { dateTime: '2026-11-01T10:00:00Z' },
  end: { dateTime: '2026-11-01T11:00:00Z' },
  transparency: 'opaque',
  visibility: 'private',
  attendees: [],
  reminders: { useDefault: false },
  extendedProperties: {
    private: { medplumProject: 'p', medplumSource: `Appointment/${sourceId}`, medplumConnection: 'connection' },
  },
};
const response = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status });
let medplum: MockClient;
beforeEach(() => {
  medplum = new MockClient({ project: { resourceType: 'Project', id: 'p', name: 'p' } });
});
test('stripped tombstones require an ownership receipt and ETag; confirmed collisions are never adopted', async () => {
  for (const [status, receipt, etag, succeeds] of [
    ['cancelled', true, 'v1', true],
    ['cancelled', false, 'v1', false],
    ['confirmed', true, 'v1', false],
    ['cancelled', true, undefined, false],
  ] as const) {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(409, { error: { errors: [{ reason: 'duplicate' }] } }))
      .mockResolvedValueOnce(response(200, { id: event.id, status, etag }))
      .mockResolvedValueOnce(response(200, event));
    const has = vi.fn().mockResolvedValue(receipt);
    const remember = vi.fn().mockResolvedValue(undefined);
    const client = new GoogleCalendarClient('test', { fetch, ownership: { has, remember } });
    if (succeeds) {
      await expect(client.upsertEvent(event)).resolves.toBe('replaced');
      expect(fetch.mock.calls[2][1].headers['If-Match']).toBe('v1');
    } else {
      await expect(client.upsertEvent(event)).rejects.toThrow();
      expect(fetch).toHaveBeenCalledTimes(2);
    }
  }
});
test('an ownership receipt cannot override conflicting private properties', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(response(409, {}))
    .mockResolvedValueOnce(
      response(200, {
        id: event.id,
        status: 'cancelled',
        etag: 'v1',
        extendedProperties: { private: { medplumProject: 'foreign' } },
      })
    );
  const client = new GoogleCalendarClient('test', {
    fetch,
    ownership: { has: async () => true, remember: async () => undefined },
  });
  await expect(client.upsertEvent(event)).rejects.toThrow('collision');
  expect(fetch).toHaveBeenCalledTimes(2);
});
test('receipts are account/source/connection bound and retry without duplicates', async () => {
  const connection = await saveConnection(medplum, {
    practitionerRef: 'Practitioner/p',
    accountSub: 'account',
    refreshToken: 'token',
  });
  const boundEvent = {
    ...event,
    extendedProperties: { private: { ...event.extendedProperties.private, medplumConnection: connection.basic.id } },
  };
  await withConnectionLease(medplum, connection.basic.id, async (lease) => {
    const store = ownershipStore(lease, connection);
    expect(await store.has(boundEvent)).toBe(false);
    await store.remember(boundEvent);
    await store.remember(boundEvent);
    expect(await store.has(boundEvent)).toBe(true);
    expect(await ownershipStore(lease, { ...connection, accountSub: 'other' }).has(boundEvent)).toBe(false);
    expect(
      await store.has({
        ...boundEvent,
        extendedProperties: { private: { ...event.extendedProperties.private, medplumSource: 'Slot/another' } },
      })
    ).toBe(false);
  });
  expect(await medplum.searchResources('Basic', MIRROR_SEARCH)).toHaveLength(1);
});
test('legacy migration is dry-run by default, scrubs attendees on apply, and refuses ambiguous sources', async () => {
  const connection = await saveConnection(medplum, {
    practitionerRef: 'Practitioner/p',
    accountSub: 'account',
    refreshToken: 'token',
  });
  await medplum.createResource({
    resourceType: 'Appointment',
    id: sourceId,
    status: 'booked',
    participant: [{ actor: { reference: 'Practitioner/p' }, status: 'accepted' }],
  });
  const legacy = {
    ...event,
    etag: 'old',
    attendees: [{ email: 'patient@example.test' }],
    extendedProperties: { private: { medplumProject: 'p', medplumSource: `Appointment/${sourceId}` } },
  };
  const calendar = {
    listEvents: vi.fn().mockResolvedValue([legacy]),
    getEvent: vi.fn().mockResolvedValue(legacy),
    updateEvent: vi.fn().mockResolvedValue(legacy),
  };
  await withConnectionLease(medplum, connection.basic.id, async (lease) => {
    expect(await migrateMirrors(lease, connection, calendar)).toEqual([{ eventId: event.id, action: 'migrate' }]);
    expect(calendar.updateEvent).not.toHaveBeenCalled();
    await migrateMirrors(lease, connection, calendar, true);
    expect(calendar.updateEvent).toHaveBeenCalledWith(
      event.id,
      expect.objectContaining({
        attendees: [],
        summary: 'Busy',
        extendedProperties: { private: expect.objectContaining({ medplumConnection: connection.basic.id }) },
      }),
      'old'
    );
    await medplum.deleteResource('Appointment', sourceId);
    calendar.updateEvent.mockClear();
    expect(await migrateMirrors(lease, connection, calendar, true)).toEqual([
      { eventId: event.id, action: 'repair-required' },
    ]);
    expect(calendar.updateEvent).not.toHaveBeenCalled();
  });
});
