// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { BotEvent, WithId } from '@medplum/core';
import type { Appointment, Slot } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { BOT_IDENTIFIER_VALUE } from '../common/constants';
import type * as SyncModule from '../common/sync';
import { operationIdentity, secrets } from '../test-auth';
import type { SyncBotInput } from './google-calendar-sync-bot';
import { handler, resolveSource } from './google-calendar-sync-bot';

const syncSource = vi.fn<(source: SyncModule.SyncSource) => Promise<SyncModule.SyncResult[]>>();

vi.mock('../common/sync', async (importOriginal) => {
  const original = await importOriginal<typeof SyncModule>();
  return {
    ...original,
    SyncSession: class {
      syncSource = syncSource;
    },
  };
});

function event(input: SyncBotInput): BotEvent<SyncBotInput> {
  return { bot: { reference: 'Bot/sync' }, contentType: 'application/fhir+json', input, secrets };
}

describe('google-calendar-sync-bot', () => {
  let medplum: MockClient;

  beforeEach(async () => {
    medplum = new MockClient({ project: { resourceType: 'Project', id: 'proj-1', name: 'Calendar test' } });
    await operationIdentity(
      medplum,
      event({ resourceType: 'Appointment', status: 'booked', participant: [] }),
      BOT_IDENTIFIER_VALUE.sync
    );
    syncSource.mockReset();
  });

  const booked = (): Promise<WithId<Appointment>> =>
    medplum.createResource<Appointment>({ resourceType: 'Appointment', status: 'booked', participant: [] });

  test('re-reads the current version rather than trusting the payload', async () => {
    const created = await booked();
    const updated = await medplum.updateResource({ ...created, status: 'cancelled' });
    const source = await resolveSource(medplum, { ...created, meta: { ...created.meta, project: 'p' } });
    expect(source).toEqual({ resource: updated, deleted: false });
  });

  test('a payload for a vanished resource becomes a deletion', async () => {
    const stale: Appointment = { resourceType: 'Appointment', id: 'gone', status: 'booked', participant: [] };
    expect(await resolveSource(medplum, stale)).toEqual({ resource: stale, deleted: true });
  });

  test('a delete notification is a deletion only when Medplum no longer has the resource', async () => {
    const last: Appointment = { resourceType: 'Appointment', id: 'x', status: 'booked', participant: [] };
    expect(await resolveSource(medplum, { deletedResource: last })).toEqual({
      resource: last,
      deleted: true,
    });

    // A forged delete for a live resource syncs the live version instead.
    const live = await booked();
    expect(await resolveSource(medplum, { deletedResource: live })).toEqual({
      resource: live,
      deleted: false,
    });
  });

  test('a transient read failure propagates rather than becoming a deletion', async () => {
    const appt = await booked();
    vi.spyOn(medplum, 'readResource').mockRejectedValueOnce(new Error('503 upstream'));
    await expect(resolveSource(medplum, appt)).rejects.toThrow('503 upstream');
  });

  test('ignores payloads that are neither Appointment nor Slot', async () => {
    expect(await resolveSource(medplum, { resourceType: 'Patient' } as unknown as SyncBotInput)).toBeUndefined();
    await expect(
      handler(medplum, event({ resourceType: 'Patient' } as unknown as SyncBotInput))
    ).resolves.toBeUndefined();
    expect(syncSource).not.toHaveBeenCalled();
  });

  test('a Slot payload goes through as a slot source', async () => {
    const slot = await medplum.createResource<Slot>({
      resourceType: 'Slot',
      status: 'busy-unavailable',
      schedule: { reference: 'Schedule/s' },
      start: '2026-10-09T13:00:00Z',
      end: '2026-10-09T15:00:00Z',
    });
    syncSource.mockResolvedValueOnce([{ practitionerRef: 'Practitioner/a', outcome: 'inserted' }]);
    await handler(medplum, event(slot));
    expect(syncSource).toHaveBeenCalledWith({
      resource: expect.objectContaining({ id: slot.id }),
      deleted: false,
    });
  });

  test('runs the session with the resource project and surfaces failures', async () => {
    const appt = await booked();
    syncSource.mockResolvedValueOnce([{ practitionerRef: 'Practitioner/a', outcome: 'inserted' }]);
    await expect(handler(medplum, event(appt))).resolves.toBeUndefined();
    expect(syncSource).toHaveBeenCalledWith({
      resource: expect.objectContaining({ id: appt.id }),
      deleted: false,
    });

    syncSource.mockResolvedValueOnce([
      { practitionerRef: 'Practitioner/a', outcome: 'inserted' },
      { practitionerRef: 'Practitioner/b', outcome: 'error', error: 'boom' },
    ]);
    await expect(handler(medplum, event(appt))).rejects.toThrow('1 of 2 practitioners failed to sync');
  });
});
