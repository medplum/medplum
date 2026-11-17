// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { BotEvent } from '@medplum/core';
import type { Parameters } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { beforeEach, expect, test, vi } from 'vitest';
import { writeProjectCeiling } from '../common/configuration';
import { findConnection, saveConnection, updateConnection } from '../common/connection';
import { BOT_IDENTIFIER_VALUE } from '../common/constants';
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

test('the caller-readable summary contains no worker data', async () => {
  const connection = await saveConnection(medplum, {
    practitionerRef: event.requester?.reference as string,
    accountSub: 'private-sub',
    refreshToken: 'private-token',
  });
  await withConnectionLease(medplum, connection.basic.id, async (lease) => {
    await lease.mutate((basic) =>
      withState(basic, {
        ...readState(basic),
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
  for (const secret of ['private-', 'worker-lease']) {
    expect(json).not.toContain(secret);
  }
  expect(summary).toBeDefined();
});

test.each([
  { field: 'status', valueCode: 'invalid' },
  { field: 'status', valueCode: undefined },
  { field: 'event-detail-level', valueCode: 'full-with-invite' },
])('malformed public code %j returns a read-only stale diagnostic', async ({ field, valueCode }) => {
  await saveConnection(medplum, {
    practitionerRef: event.requester?.reference as string,
    accountSub: 'sub',
    refreshToken: 'synthetic',
  });
  const summary = await medplum.searchOne('Basic', PUBLIC_STATUS_SEARCH);
  if (!summary) {
    throw new Error('Missing summary');
  }
  const url = `https://www.medplum.com/integrations/google-calendar/${field}`;
  await medplum.updateResource({
    ...summary,
    extension: [...(summary.extension ?? []).filter((e) => e.url !== url), ...(valueCode ? [{ url, valueCode }] : [])],
  });
  const writes = vi.spyOn(medplum, 'updateResource');
  writes.mockClear();
  expect((await handler(medplum, event)).parameter).toEqual([
    { name: 'connected', valueBoolean: true },
    { name: 'stale', valueBoolean: true },
    { name: 'staleReason', valueCode: 'invalid-public-status' },
    { name: 'detailsAllowed', valueBoolean: false },
  ]);
  expect(writes).not.toHaveBeenCalled();
});

test('status returns the installed public client ID but never the client secret', async () => {
  const withoutClient = await handler(medplum, event);
  expect(withoutClient.parameter?.some((p) => p.name === 'clientId')).toBe(false);

  const result = await handler(medplum, {
    ...event,
    secrets: {
      GOOGLE_CALENDAR_CLIENT_ID: {
        name: 'GOOGLE_CALENDAR_CLIENT_ID',
        valueString: 'client-1.apps.googleusercontent.com',
      },
      GOOGLE_CALENDAR_CLIENT_SECRET: { name: 'GOOGLE_CALENDAR_CLIENT_SECRET', valueString: 'do-not-return' },
    },
  });
  expect(result.parameter?.find((p) => p.name === 'clientId')?.valueString).toBe('client-1.apps.googleusercontent.com');
  expect(JSON.stringify(result)).not.toContain('do-not-return');
});

test('status reports whether the project lets practitioners choose event details', async () => {
  const before = await handler(medplum, event);
  expect(before.parameter).toContainEqual({ name: 'detailsAllowed', valueBoolean: false });

  await writeProjectCeiling(medplum, 'full');
  const after = await handler(medplum, event);
  expect(after.parameter).toContainEqual({ name: 'detailsAllowed', valueBoolean: true });
});
