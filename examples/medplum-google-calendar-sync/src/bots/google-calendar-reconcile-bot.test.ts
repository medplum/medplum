// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { BotEvent } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { CalendarConnection } from '../common/connection';
import { saveConnection, updateConnection } from '../common/connection';
import { BOT_IDENTIFIER_VALUE } from '../common/constants';
import type * as RangeSyncModule from '../common/range-sync';
import { readState, withState } from '../common/state';
import { operationIdentity } from '../test-auth';
import { handler } from './google-calendar-reconcile-bot';

const { syncRange } = vi.hoisted(() => ({
  syncRange:
    vi.fn<
      (
        session: unknown,
        connection: CalendarConnection,
        range: RangeSyncModule.SyncRange
      ) => Promise<Record<string, number>>
    >(),
}));

vi.mock('../common/range-sync', async (importOriginal) => {
  const original = await importOriginal<typeof RangeSyncModule>();
  return { ...original, syncRange };
});

const secrets: BotEvent['secrets'] = {
  GOOGLE_CALENDAR_CLIENT_ID: { name: 'id', valueString: 'cid' },
  GOOGLE_CALENDAR_CLIENT_SECRET: { name: 'secret', valueString: 'csecret' },
};

describe('google-calendar-reconcile-bot', () => {
  let medplum: MockClient;
  const event: BotEvent = {
    bot: { reference: 'Bot/reconcile' },
    contentType: 'application/fhir+json',
    input: undefined,
    secrets,
  };

  beforeEach(async () => {
    medplum = new MockClient({ project: { resourceType: 'Project', id: 'proj-1', name: 'Calendar test' } });
    await operationIdentity(medplum, event, BOT_IDENTIFIER_VALUE.reconcile);
    vi.spyOn(medplum, 'executeBot').mockResolvedValue({});
    syncRange.mockReset();
    syncRange.mockResolvedValue({ candidates: 1, inserted: 1, errors: 0 });
  });

  // The server stamps meta.project on the Basic; MockClient doesn't, so the test does.
  async function connected(practitionerRef: string): Promise<CalendarConnection> {
    const saved = await saveConnection(medplum, { practitionerRef, accountSub: practitionerRef, refreshToken: 'rt' });
    const basic = await medplum.updateResource({ ...saved.basic, meta: { ...saved.basic.meta, project: 'proj-1' } });
    return { ...saved, basic };
  }

  test('nothing to do without active connections', async () => {
    await handler(medplum, event);
    const paused = await connected('Practitioner/paused');
    await updateConnection(medplum, paused, { status: 'reauth-required' });
    await handler(medplum, event);
    expect(syncRange).not.toHaveBeenCalled();
  });

  test('pushes the next 90 days for every active practitioner', async () => {
    const a = await connected('Practitioner/a');
    const b = await connected('Practitioner/b');
    const before = Date.now();

    await handler(medplum, event);

    expect(syncRange).not.toHaveBeenCalled();
    expect(medplum.executeBot).toHaveBeenCalled();
    await handler(medplum, { ...event, input: { connectionIds: [a.basic.id, b.basic.id] } });
    expect(readState(await medplum.readResource('Basic', a.basic.id)).inboundRequest).not.toBe(
      readState(a.basic).inboundRequest
    );
    await handler(medplum, { ...event, input: a.basic });
    await handler(medplum, { ...event, input: b.basic });
    expect(syncRange).toHaveBeenCalledTimes(2);
    expect(syncRange.mock.calls.map(([, c]) => c.practitionerRef).sort()).toEqual(['Practitioner/a', 'Practitioner/b']);
    const [, , range] = syncRange.mock.calls[0];
    expect(range.start.getTime()).toBeGreaterThanOrEqual(before);
    expect(range.end.getTime() - range.start.getTime()).toBe(90 * 24 * 60 * 60 * 1000);
  });

  test('one practitioner failing does not stop the others, but the run reports it', async () => {
    const a = await connected('Practitioner/a');
    const b = await connected('Practitioner/b');
    syncRange.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ candidates: 2, errors: 1 });

    await expect(handler(medplum, { ...event, input: a.basic })).rejects.toThrow('boom');
    await expect(handler(medplum, { ...event, input: b.basic })).rejects.toThrow('incomplete');
    expect(syncRange).toHaveBeenCalledTimes(2);
  });
  test('Schedule reassignment queues current and former practitioners, not unrelated connections', async () => {
    const a = await connected('Practitioner/a');
    const b = await connected('Practitioner/b');
    const c = await connected('Practitioner/c');
    const first = await medplum.createResource({ resourceType: 'Schedule', actor: [{ reference: 'Practitioner/a' }] });
    const next = await medplum.updateResource({ ...first, actor: [{ reference: 'Practitioner/b' }] });
    vi.spyOn(medplum, 'readHistory').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'history',
      entry: [{ resource: next }, { resource: first }],
    });
    await handler(medplum, { ...event, input: next });
    for (const connection of [a, b]) {
      expect(readState(await medplum.readResource('Basic', connection.basic.id)).inboundRequest).not.toBe(
        readState(connection.basic).inboundRequest
      );
    }
    expect(readState(await medplum.readResource('Basic', c.basic.id)).inboundRequest).toBe(
      readState(c.basic).inboundRequest
    );
    expect(medplum.executeBot).not.toHaveBeenCalled();
  });

  test('minute recovery requeues incomplete directions without changing checkpoint generations', async () => {
    const connection = await connected('Practitioner/a');
    const before = readState(connection.basic);
    await handler(medplum, { ...event, input: { connectionIds: [connection.basic.id], retry: true } });
    expect(medplum.executeBot).toHaveBeenCalledTimes(2);
    expect(readState(await medplum.readResource('Basic', connection.basic.id))).toEqual(before);
    await medplum.updateResource(
      withState(connection.basic, {
        ...before,
        inboundCompleted: before.inboundRequest,
        outboundCompleted: before.outboundRequest,
      })
    );
    vi.mocked(medplum.executeBot).mockClear();
    await handler(medplum, { ...event, input: { connectionIds: [connection.basic.id], retry: true } });
    expect(medplum.executeBot).not.toHaveBeenCalled();
  });
  test('minute recovery dispatches corrupt checkpoints without skipping other connections', async () => {
    const a = await connected('Practitioner/a');
    const b = await connected('Practitioner/b');
    await medplum.updateResource({
      ...a.basic,
      extension: a.basic.extension?.map((e) =>
        e.url.endsWith('/sync-state')
          ? {
              ...e,
              extension: [
                ...(e.extension ?? []),
                {
                  url: 'outboundWork',
                  extension: [{ url: 'phase', valueCode: 'invalid' }],
                },
              ],
            }
          : e
      ),
    });
    await handler(medplum, { ...event, input: { connectionIds: [a.basic.id, b.basic.id], retry: true } });
    expect(medplum.executeBot).toHaveBeenCalledTimes(4);
    for (const connection of [a, b]) {
      expect(medplum.executeBot).toHaveBeenCalledWith(
        expect.objectContaining({ value: BOT_IDENTIFIER_VALUE.reconcile }),
        { resourceType: 'Basic', id: connection.basic.id },
        expect.anything(),
        expect.anything()
      );
    }
  });

  test('minute recovery dispatches pending conflicts even after the Google generation completed', async () => {
    const connection = await connected('Practitioner/a');
    const state = readState(connection.basic);
    await medplum.updateResource(
      withState(connection.basic, {
        ...state,
        inboundCompleted: state.inboundRequest,
        outboundCompleted: state.outboundRequest,
        conflictsPending: true,
      })
    );
    await handler(medplum, { ...event, input: { connectionIds: [connection.basic.id], retry: true } });
    expect(medplum.executeBot).toHaveBeenCalledTimes(1);
    expect(medplum.executeBot).toHaveBeenCalledWith(
      expect.objectContaining({ value: BOT_IDENTIFIER_VALUE.inbound }),
      { resourceType: 'Basic', id: connection.basic.id },
      expect.anything(),
      expect.anything()
    );
  });

  test.each(['active', 'reauth-required'] as const)(
    'summary retry dispatches %s connections even during Google backoff',
    async (status) => {
      const connection = await connected('Practitioner/a');
      if (status === 'reauth-required') {
        await updateConnection(medplum, connection, { status });
      }
      const basic = await medplum.readResource('Basic', connection.basic.id);
      const state = readState(basic);
      await medplum.updateResource(
        withState(basic, {
          ...state,
          inboundCompleted: state.inboundRequest,
          outboundCompleted: state.outboundRequest,
          statusPublishPending: true,
          inboundRetryAt: new Date(Date.now() + 3600_000).toISOString(),
        })
      );
      await handler(medplum, { ...event, input: { connectionIds: [connection.basic.id], retry: true } });
      expect(medplum.executeBot).toHaveBeenCalledTimes(1);
      expect(medplum.executeBot).toHaveBeenCalledWith(
        expect.objectContaining({ value: BOT_IDENTIFIER_VALUE.inbound }),
        { resourceType: 'Basic', id: connection.basic.id },
        expect.anything(),
        expect.anything()
      );
    }
  );
});
