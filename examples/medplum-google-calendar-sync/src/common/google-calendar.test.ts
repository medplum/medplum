// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type * as ImportedModule0 from '@medplum/core';

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { GoogleApiError, GoogleCalendarClient } from './google-calendar';
import type { GoogleCalendarEvent } from './mapping';

vi.mock('@medplum/core', async (importOriginal) => ({
  ...(await importOriginal<typeof ImportedModule0>()),
  sleep: vi.fn(async () => undefined),
}));

const event: GoogleCalendarEvent = {
  id: '6f1c2a9e4b7d4c0e9a3b5d7f1e2c4a6b',
  etag: '"version1"',
  status: 'confirmed',
  summary: 'Appointment',
  description: 'https://app.medplum.com/Appointment/x',
  start: { dateTime: '2026-10-12T16:00:00.000Z' },
  end: { dateTime: '2026-10-12T16:30:00.000Z' },
  transparency: 'opaque',
  visibility: 'private',
  attendees: [],
  reminders: { useDefault: true },
  extendedProperties: { private: { medplumProject: 'proj', medplumSource: 'Appointment/x' } },
};

function reply(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function googleError(status: number, reason: string): Response {
  return reply(status, { error: { code: status, message: reason, errors: [{ reason }] } });
}

describe('GoogleCalendarClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let client: GoogleCalendarClient;

  beforeEach(() => {
    fetchMock = vi.fn();
    client = new GoogleCalendarClient('token', { fetch: fetchMock as unknown as typeof fetch, maxRetries: 2 });
  });

  function calls(): { method: string; url: string; body?: unknown }[] {
    return fetchMock.mock.calls.map(([url, init]) => ({
      method: (init as RequestInit).method as string,
      url: url as string,
      body: (init as RequestInit).body ? JSON.parse((init as RequestInit).body as string) : undefined,
    }));
  }

  test('sends the bearer token and sendUpdates=none on writes', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, event));
    await client.insertEvent(event);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=none');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer token' });
  });

  test('getEvent returns undefined on 404 and 410', async () => {
    fetchMock.mockResolvedValueOnce(googleError(404, 'notFound'));
    expect(await client.getEvent('abc')).toBeUndefined();
    fetchMock.mockResolvedValueOnce(googleError(410, 'deleted'));
    expect(await client.getEvent('abc')).toBeUndefined();
  });

  test('deleteEvent treats already-gone as done but surfaces other errors', async () => {
    fetchMock.mockResolvedValueOnce(reply(410));
    await expect(client.deleteEvent('abc')).resolves.toBeUndefined();
    fetchMock.mockResolvedValueOnce(googleError(401, 'authError'));
    await expect(client.deleteEvent('abc')).rejects.toMatchObject({ status: 401, reason: 'authError' });
  });

  test('retries 429 and 5xx with backoff, then gives up', async () => {
    fetchMock
      .mockResolvedValueOnce(googleError(429, 'rateLimitExceeded'))
      .mockResolvedValueOnce(googleError(503, 'backendError'))
      .mockResolvedValueOnce(reply(200, event));
    expect(await client.getEvent(event.id)).toEqual(event);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    fetchMock.mockReset();
    fetchMock.mockResolvedValue(googleError(429, 'rateLimitExceeded'));
    await expect(client.getEvent(event.id)).rejects.toBeInstanceOf(GoogleApiError);
    expect(fetchMock).toHaveBeenCalledTimes(3); // initial + maxRetries
  });

  test('defers long Retry-After deadlines without retrying early or echoing private error content', async () => {
    const retry = new Response(
      JSON.stringify({ error: { message: 'private event details', errors: [{ reason: 'rateLimitExceeded' }] } }),
      { status: 429, headers: { 'Retry-After': '120' } }
    );
    fetchMock.mockResolvedValue(retry);
    const before = Date.now();
    const failure = await client.getEvent(event.id).catch((err: unknown) => err);
    expect(failure).toBeInstanceOf(GoogleApiError);
    expect((failure as GoogleApiError).retryAt).toBeGreaterThanOrEqual(before + 120_000);
    expect((failure as Error).message).not.toContain('private event details');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('403 is retried only for quota reasons', async () => {
    fetchMock.mockResolvedValueOnce(googleError(403, 'insufficientPermissions'));
    await expect(client.getEvent(event.id)).rejects.toMatchObject({ status: 403 });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(googleError(403, 'userRateLimitExceeded')).mockResolvedValueOnce(reply(200, event));
    expect(await client.getEvent(event.id)).toEqual(event);
  });

  test('listEvents follows pages and ANDs the private properties', async () => {
    fetchMock
      .mockResolvedValueOnce(reply(200, { items: [event], nextPageToken: 'p2' }))
      .mockResolvedValueOnce(reply(200, { items: [{ ...event, id: 'second' }] }));
    const events = await client.listEvents(['medplumProject=proj']);
    expect(events.map((e) => e.id)).toEqual([event.id, 'second']);
    const first = new URL(calls()[0].url);
    expect(first.searchParams.getAll('privateExtendedProperty')).toEqual(['medplumProject=proj']);
    expect(first.searchParams.get('singleEvents')).toBe('false');
    expect(new URL(calls()[1].url).searchParams.get('pageToken')).toBe('p2');
  });

  test.each(['medplumProject', 'medplumSource', 'medplumConnection'])(
    'refuses a collision with another %s',
    async (key) => {
      const desired = {
        ...event,
        extendedProperties: { private: { ...event.extendedProperties.private, medplumConnection: 'conn' } },
      };
      const other = {
        ...desired,
        extendedProperties: { private: { ...desired.extendedProperties.private, [key]: 'other' } },
      };
      fetchMock.mockResolvedValueOnce(googleError(409, 'duplicate')).mockResolvedValueOnce(reply(200, other));
      await expect(client.upsertEvent(desired)).rejects.toThrow('ownership');
      expect(calls().map((c) => c.method)).toEqual(['POST', 'GET']);
    }
  );

  test('uses If-Match for owned deletions, and refuses stripped tombstones', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, event)).mockResolvedValueOnce(reply(204));
    await client.deleteOwnedEvent(event.id, event.extendedProperties.private);
    expect(fetchMock.mock.calls[1][1].headers).toMatchObject({ 'If-Match': event.etag });
    fetchMock.mockReset().mockResolvedValueOnce(reply(200, { id: event.id, status: 'cancelled' }));
    await expect(client.deleteOwnedEvent(event.id, event.extendedProperties.private)).rejects.toThrow('ownership');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('fetches every busy-event page before resolving the actual calendar identity', async () => {
    fetchMock
      .mockResolvedValueOnce(reply(200, { items: [event], nextPageToken: 'next' }))
      .mockResolvedValueOnce(reply(200, { items: [{ ...event, id: 'occurrence-2' }] }))
      .mockResolvedValueOnce(reply(200, { id: 'primary@clinic.example' }));
    const result = await client.listBusyEvents('2026-10-01T00:00:00Z', '2026-12-30T00:00:00Z');
    expect(result.calendarId).toBe('primary@clinic.example');
    expect(result.events).toHaveLength(2);
    const query = new URL(calls()[0].url).searchParams;
    expect(query.get('singleEvents')).toBe('true');
    expect(query.get('timeMin')).toBe('2026-10-01T00:00:00Z');
    expect(query.has('syncToken')).toBe(false);
    expect(query.has('privateExtendedProperty')).toBe(false);
  });

  test('an incomplete event listing never returns a partial snapshot', async () => {
    fetchMock
      .mockResolvedValueOnce(reply(200, { items: [event], nextPageToken: 'next' }))
      .mockResolvedValueOnce(googleError(403, 'insufficientPermissions'));
    await expect(client.listBusyEvents('2026-10-01T00:00:00Z', '2026-12-30T00:00:00Z')).rejects.toMatchObject({
      status: 403,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  describe('upsertEvent', () => {
    test('inserts when the id is free', async () => {
      fetchMock.mockResolvedValueOnce(reply(200, event));
      expect(await client.upsertEvent(event)).toBe('inserted');
      expect(calls().map((c) => c.method)).toEqual(['POST']);
    });

    test('replaces an existing event, live or a deleted tombstone, as confirmed', async () => {
      fetchMock
        .mockResolvedValueOnce(googleError(409, 'duplicate'))
        .mockResolvedValueOnce(reply(200, event))
        .mockResolvedValueOnce(reply(200, event));
      expect(await client.upsertEvent(event)).toBe('replaced');
      expect(calls().map((c) => c.method)).toEqual(['POST', 'GET', 'PUT']);
      expect(calls()[2]).toMatchObject({
        url: `https://www.googleapis.com/calendar/v3/calendars/primary/events/${event.id}?sendUpdates=none`,
        body: { status: 'confirmed', summary: 'Appointment' },
      });
      expect(calls()[2].body).not.toHaveProperty('location');
    });

    test('non-duplicate insert failures propagate', async () => {
      fetchMock.mockResolvedValueOnce(googleError(400, 'invalid'));
      await expect(client.upsertEvent(event)).rejects.toMatchObject({ status: 400, reason: 'invalid' });
    });
  });
});
