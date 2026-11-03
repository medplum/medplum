// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { BotEvent } from '@medplum/core';
import type { Parameters, Practitioner } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { CalendarConnection } from '../common/connection';
import { findConnection, saveConnection, updateConnection } from '../common/connection';
import { BOT_IDENTIFIER_VALUE, IMPORT_IDENTIFIER_SYSTEM } from '../common/constants';
import { importIdentifier } from '../common/import';
import { runInbound } from '../common/inbound';
import { LEASE_URL, withConnectionLease } from '../common/lease';
import { readState, withState } from '../common/state';
import { operationIdentity } from '../test-auth';
import { handler } from './google-calendar-disconnect-bot';

const PROJECT_ID = 'proj-1';
const secrets: BotEvent['secrets'] = {
  GOOGLE_CALENDAR_CLIENT_ID: { name: 'id', valueString: 'cid' },
  GOOGLE_CALENDAR_CLIENT_SECRET: { name: 'secret', valueString: 'csecret' },
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('google-calendar-disconnect-bot', () => {
  let medplum: MockClient;
  let practitionerRef: string;
  let event: BotEvent<Parameters>;
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    medplum = new MockClient({ project: { resourceType: 'Project', id: 'proj-1', name: 'Calendar test' } });
    const practitioner = await medplum.createResource<Practitioner>({
      resourceType: 'Practitioner',
      meta: { project: PROJECT_ID },
    });
    practitionerRef = `Practitioner/${practitioner.id}`;
    event = {
      bot: { reference: 'Bot/disconnect' },
      contentType: 'application/fhir+json',
      input: { resourceType: 'Parameters' },
      secrets,
      requester: { reference: practitionerRef },
    };
    await operationIdentity(medplum, event, BOT_IDENTIFIER_VALUE.disconnect);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // The server stamps meta.project on the Basic; MockClient doesn't, so the test does.
  async function connected(): Promise<CalendarConnection> {
    const saved = await saveConnection(medplum, {
      practitionerRef,
      accountSub: 'sub',
      refreshToken: 'rt',
    });
    const basic = await medplum.updateResource({ ...saved.basic, meta: { ...saved.basic.meta, project: PROJECT_ID } });
    return { ...saved, basic };
  }

  test('queues disconnect during a worker lease without losing it to a late reauth update', async () => {
    const connection = await connected();
    await withConnectionLease(medplum, connection.basic.id, async (lease) => {
      const result = await handler(medplum, event);
      expect(result.parameter).toContainEqual({ name: 'status', valueCode: 'disconnecting' });
      await lease.check();
      await updateConnection(medplum, connection, { status: 'reauth-required' }, lease);
      expect((await findConnection(medplum, practitionerRef))?.status).toBe('disconnecting');
      expect(readState(await lease.read()).inboundRequest).not.toBe(readState(connection.basic).inboundRequest);
    });
    expect((await findConnection(medplum, practitionerRef))?.status).toBe('disconnecting');
  });

  test('nothing to do when not connected', async () => {
    expect((await handler(medplum, event)).parameter).toEqual([{ name: 'connected', valueBoolean: false }]);
  });

  test('deletes this project’s events, revokes, and removes the record', async () => {
    const connection = await connected();
    const mirrored = ['e0001', 'e0002', 'e0003'].map((id) => ({
      id,
      etag: '"version1"',
      extendedProperties: {
        private: {
          medplumProject: PROJECT_ID,
          medplumSource: `Appointment/${id}`,
          medplumConnection: connection.basic.id,
        },
      },
    }));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(200, { access_token: 'at', expires_in: 1, scope: 's', token_type: 'Bearer' }))
      .mockResolvedValueOnce(json(200, { items: mirrored.slice(0, 2), nextPageToken: 'p2' }))
      .mockResolvedValueOnce(json(200, { items: mirrored.slice(2) }));
    for (const mirror of mirrored) {
      fetchMock.mockResolvedValueOnce(json(200, mirror)).mockResolvedValueOnce(new Response(null, { status: 204 }));
    }
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));
    globalThis.fetch = fetchMock;

    const result = await handler(medplum, event);

    expect(result.parameter).toContainEqual({ name: 'status', valueCode: 'disconnecting' });
    await runInbound(medplum, event, connection.basic.id);
    const urls = fetchMock.mock.calls.map(([url]) => url as string);
    expect(urls.filter((u) => u.includes('/events/') && u.includes('sendUpdates=none'))).toHaveLength(3);
    expect(urls.at(-1)).toBe('https://oauth2.googleapis.com/revoke');
    expect(await findConnection(medplum, practitionerRef)).toBeUndefined();
  });

  test.each([false, true])(
    'uncertain mirrors keep the first repair reason while freeing owned Slots (legacy first=%s)',
    async (legacyFirst) => {
      const connection = await connected();
      const slot = await medplum.createResource({
        resourceType: 'Slot',
        status: 'busy-unavailable',
        schedule: { reference: 'Schedule/synthetic' },
        start: '2026-11-01T10:00:00.000Z',
        end: '2026-11-01T11:00:00.000Z',
        identifier: [
          {
            system: IMPORT_IDENTIFIER_SYSTEM,
            value: importIdentifier({
              connectionId: connection.basic.id,
              calendarId: 'synthetic',
              eventId: 'event',
              scheduleRef: 'Schedule/synthetic',
            }),
          },
        ],
      });
      const fetch = vi
        .fn()
        .mockResolvedValueOnce(json(200, { access_token: 'at' }))
        .mockResolvedValueOnce(
          json(200, {
            items: [
              ...(legacyFirst
                ? [
                    {
                      id: 'legacy-id',
                      extendedProperties: {
                        private: { medplumProject: PROJECT_ID, medplumSource: 'Appointment/legacy' },
                      },
                    },
                  ]
                : []),
              {
                id: 'unrelated-id',
                extendedProperties: {
                  private: {
                    medplumProject: PROJECT_ID,
                    medplumConnection: connection.basic.id,
                    medplumSource: 'Appointment/different',
                  },
                },
              },
            ],
          })
        );
      globalThis.fetch = fetch;
      await handler(medplum, event);
      await expect(runInbound(medplum, event, connection.basic.id)).rejects.toThrow('Uncertain mirrors');
      const basic = await medplum.readResource('Basic', connection.basic.id);
      expect(readState(basic)).toMatchObject({
        googleCleaned: false,
        slotsCleaned: true,
        cleanupIssue: legacyFirst ? 'legacy-mirror-repair-required' : 'mirror-identity-repair-required',
      });
      expect(basic.extension?.some((e) => e.url === LEASE_URL)).toBe(false);
      await expect(medplum.readResource('Slot', slot.id)).rejects.toThrow();
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(Date.parse(readState(basic).inboundRetryAt ?? '')).toBeGreaterThan(Date.now() + 59 * 60_000);
      await runInbound(medplum, event, connection.basic.id);
      expect(fetch).toHaveBeenCalledTimes(2);

      // The administrator has removed the uncertain mirrors and explicitly retries cleanup.
      fetch
        .mockResolvedValueOnce(json(200, { access_token: 'at' }))
        .mockResolvedValueOnce(json(200, { items: [] }))
        .mockResolvedValueOnce(new Response(null, { status: 200 }));
      await handler(medplum, event);
      expect(readState(await medplum.readResource('Basic', connection.basic.id)).inboundRetryAt).toBeUndefined();
      await runInbound(medplum, event, connection.basic.id);
      expect(fetch).toHaveBeenCalledTimes(5);
      expect(await findConnection(medplum, practitionerRef)).toBeUndefined();
    }
  );

  test('an explicit disconnect preserves Google retry deadlines without a mirror repair issue', async () => {
    const connection = await connected();
    const retryAt = new Date(Date.now() + 60_000).toISOString();
    await medplum.updateResource(
      withState(connection.basic, { ...readState(connection.basic), inboundRetryAt: retryAt })
    );
    const fetch = vi.fn();
    globalThis.fetch = fetch;
    await handler(medplum, event);
    expect(readState(await medplum.readResource('Basic', connection.basic.id)).inboundRetryAt).toBe(retryAt);
    await runInbound(medplum, event, connection.basic.id);
    expect(fetch).not.toHaveBeenCalled();
  });

  test('keeps the record when the calendar sweep fails, so it can be retried', async () => {
    const connection = await connected();
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(json(200, { access_token: 'at', expires_in: 1, scope: 's', token_type: 'Bearer' }))
      .mockResolvedValue(json(401, { error: { code: 401, message: 'nope', errors: [{ reason: 'authError' }] } }));

    await handler(medplum, event);
    await expect(runInbound(medplum, event, connection.basic.id)).rejects.toMatchObject({ status: 401 });
    expect(await findConnection(medplum, practitionerRef)).toBeDefined();
  });

  test('revocation during disconnect pauses remote work until explicitly acknowledged', async () => {
    const connection = await connected();
    const slot = await medplum.createResource({
      resourceType: 'Slot',
      status: 'busy-unavailable',
      schedule: { reference: 'Schedule/synthetic' },
      start: '2026-12-01T10:00:00.000Z',
      end: '2026-12-01T11:00:00.000Z',
      identifier: [
        {
          system: IMPORT_IDENTIFIER_SYSTEM,
          value: importIdentifier({
            connectionId: connection.basic.id,
            calendarId: 'synthetic',
            eventId: 'busy-event',
            scheduleRef: 'Schedule/synthetic',
          }),
        },
      ],
    });
    const fetch = vi.fn().mockImplementation(async () => json(400, { error: 'invalid_grant' }));
    globalThis.fetch = fetch;
    await handler(medplum, event);
    await runInbound(medplum, event, connection.basic.id);
    expect(fetch).toHaveBeenCalledTimes(1);
    const paused = await medplum.readResource('Basic', connection.basic.id);
    expect(readState(paused).inboundError).toBe('reauth-required');
    await medplum.updateResource(withState(paused, { ...readState(paused), statusPublishPending: true }));
    await runInbound(medplum, event, connection.basic.id);
    expect(fetch).toHaveBeenCalledTimes(1);
    const published = await medplum.readResource('Basic', connection.basic.id);
    expect(readState(published).statusPublishPending).toBeUndefined();
    expect((await medplum.readResource('Slot', slot.id)).status).toBe('busy-unavailable');
    await expect(handler(medplum, event)).rejects.toThrow('forgetRevoked=true');
    event.input.parameter = [{ name: 'forgetRevoked', valueBoolean: true }];
    await handler(medplum, event);
    await runInbound(medplum, event, connection.basic.id);
    expect(await findConnection(medplum, practitionerRef)).toBeUndefined();
    await expect(medplum.readResource('Slot', slot.id)).rejects.toThrow();
  });

  test('requires an explicit acknowledgement before forgetting a revoked connection', async () => {
    const connection = await connected();
    await updateConnection(medplum, connection, { status: 'reauth-required' });
    globalThis.fetch = vi.fn().mockImplementation(async () => json(400, { error: 'invalid_grant' }));

    await expect(handler(medplum, event)).rejects.toThrow('forgetRevoked=true');
    expect(await findConnection(medplum, practitionerRef)).toBeDefined();
    event.input.parameter = [{ name: 'forgetRevoked', valueBoolean: true }];
    await handler(medplum, event);
    await runInbound(medplum, event, connection.basic.id);
    expect(await findConnection(medplum, practitionerRef)).toBeUndefined();
  });
});
