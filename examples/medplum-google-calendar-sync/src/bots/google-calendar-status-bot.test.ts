// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { MockClient } from '@medplum/mock';
import { beforeEach, expect, test, vi } from 'vitest';
import { handler } from './google-calendar-status-bot';
import { handler as settings } from './google-calendar-settings-bot';
import { saveConnection, findConnection, updateConnection } from '../common/connection';
import { operationIdentity } from '../test-auth';
import { BOT_IDENTIFIER_VALUE } from '../common/constants';
import type { BotEvent } from '@medplum/core';
import type { Parameters } from '@medplum/fhirtypes';
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
