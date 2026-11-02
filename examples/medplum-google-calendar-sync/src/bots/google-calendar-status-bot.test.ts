// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { BotEvent } from '@medplum/core';
import { OperationOutcomeError, forbidden } from '@medplum/core';
import type { Appointment, Parameters } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { beforeEach, expect, test, vi } from 'vitest';
import { findConnection, saveConnection, updateConnection } from '../common/connection';
import { BOT_IDENTIFIER_VALUE, IMPORT_IDENTIFIER_SYSTEM } from '../common/constants';
import { importIdentifier } from '../common/import';
import { withConnectionLease } from '../common/lease';
import { PUBLIC_STATUS_SEARCH } from '../common/public-status';
import { readState, withState } from '../common/state';
import { operationIdentity } from '../test-auth';
import { handler as settings } from './google-calendar-settings-bot';
import { handler } from './google-calendar-status-bot';
let medplum: MockClient;
let event: BotEvent<Parameters>;
beforeEach(async () => {
  medplum = new MockClient({ project: { resourceType: 'Project', id: 'proj-1', name: 'test' } });
  const practitioner = await medplum.createResource({ resourceType: 'Practitioner' });
  vi.spyOn(medplum, 'getProfileAsync').mockResolvedValue(practitioner);
  event = {
    bot: { reference: 'Bot/status' },
    requester: { reference: `Practitioner/${practitioner.id}` },
    contentType: 'application/fhir+json',
    input: { resourceType: 'Parameters' },
    secrets: {},
  };
});
test('status is read-only, omits credentials, and rejects its former mutation input', async () => {
  await saveConnection(medplum, {
    practitionerRef: event.requester?.reference as string,
    accountSub: 'sub',
    refreshToken: 'secret-token',
  });
  const writes = vi.spyOn(medplum, 'updateResource');
  writes.mockClear();
  const result = await handler(medplum, event);
  expect(result.parameter).toContainEqual({ name: 'connected', valueBoolean: true });
  expect(JSON.stringify(result)).not.toContain('secret-token');
  expect(writes).not.toHaveBeenCalled();
  await expect(
    handler(medplum, {
      ...event,
      input: { resourceType: 'Parameters', parameter: [{ name: 'eventDetailLevel', valueString: 'full' }] },
    })
  ).rejects.toThrow('Unknown parameter');
});
test('settings queues a scrub without resuming revoked access', async () => {
  const connection = await saveConnection(medplum, {
    practitionerRef: event.requester?.reference as string,
    accountSub: 'sub',
    refreshToken: 'secret',
  });
  await updateConnection(medplum, connection, { status: 'reauth-required' });
  await operationIdentity(medplum, event, BOT_IDENTIFIER_VALUE.settings);
  await settings(medplum, {
    ...event,
    input: { resourceType: 'Parameters', parameter: [{ name: 'eventDetailLevel', valueString: 'initials' }] },
  });
  expect(await findConnection(medplum, event.requester?.reference as string)).toMatchObject({
    status: 'reauth-required',
    eventDetailLevel: 'initials',
  });
});
test('status refuses a forged requester even with readable Basic data', async () => {
  await expect(handler(medplum, { ...event, requester: { reference: 'Practitioner/other' } })).rejects.toThrow(
    'run as the caller'
  );
});

test('the caller-readable summary contains neither worker data nor raw conflicts', async () => {
  const connection = await saveConnection(medplum, {
    practitionerRef: event.requester?.reference as string,
    accountSub: 'private-sub',
    refreshToken: 'private-token',
  });
  await withConnectionLease(medplum, connection.basic.id, async (lease) => {
    await lease.mutate((basic) =>
      withState(basic, {
        ...readState(basic),
        conflicts: [
          {
            key: 'private-google-event-id',
            appointment: 'Appointment/hidden',
            schedules: ['Schedule/hidden'],
            start: '2026-11-01T10:00:00Z',
            end: '2026-11-01T11:00:00Z',
          },
        ],
        channels: [
          {
            id: 'private-channel',
            tokenHash: 'private-hash',
            resourceId: 'private-resource',
            expires: '2026-12-01T00:00:00Z',
          },
        ],
      })
    );
  });
  const summary = await medplum.searchOne('Basic', PUBLIC_STATUS_SEARCH);
  const json = JSON.stringify(summary);
  for (const secret of ['private-', 'Appointment/hidden', 'Schedule/hidden', 'worker-lease']) {
    expect(json).not.toContain(secret);
  }
  expect(summary).toBeDefined();
});

test('status derives readable overlaps without exposing denied appointment or Schedule references', async () => {
  const practitionerRef = event.requester?.reference as string;
  const connection = await saveConnection(medplum, { practitionerRef, accountSub: 'sub', refreshToken: 'token' });
  const start = new Date(Date.now() + 60_000).toISOString();
  const end = new Date(Date.now() + 120_000).toISOString();
  const schedule = await medplum.createResource({ resourceType: 'Schedule', actor: [{ reference: practitionerRef }] });
  const visible = await medplum.createResource({
    resourceType: 'Appointment',
    status: 'booked',
    start,
    end,
    participant: [{ actor: { reference: practitionerRef }, status: 'accepted' }],
  });
  const hidden = await medplum.createResource<Appointment>({ ...visible, id: undefined });
  await medplum.createResource({
    resourceType: 'Slot',
    status: 'busy-unavailable',
    start,
    end,
    schedule: { reference: `Schedule/${schedule.id}` },
    identifier: [
      {
        system: IMPORT_IDENTIFIER_SYSTEM,
        value: importIdentifier({
          connectionId: connection.basic.id,
          calendarId: 'private-calendar',
          eventId: 'private-event',
          scheduleRef: `Schedule/${schedule.id}`,
        }),
      },
    ],
  });
  const read = medplum.readReference.bind(medplum);
  vi.spyOn(medplum, 'readReference').mockImplementation((ref, options) => {
    if ([`Appointment/${hidden.id}`, `Schedule/${schedule.id}`].includes(ref.reference ?? '')) {
      throw new OperationOutcomeError(forbidden);
    }
    return read(ref, options);
  });
  const result = await handler(medplum, event);
  expect(result.parameter).toContainEqual({ name: 'activeConflictCount', valueInteger: 1 });
  const json = JSON.stringify(result);
  expect(json).toContain(`Appointment/${visible.id}`);
  for (const value of [hidden.id, schedule.id, 'private-calendar', 'private-event']) {
    expect(json).not.toContain(value);
  }
});
