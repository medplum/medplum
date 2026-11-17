// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { MockClient } from '@medplum/mock';
import { beforeEach, expect, test, vi } from 'vitest';
import { saveConnection } from './connection';
import { runInbound } from './inbound';
import { LEASE_URL, withConnectionLease } from './lease';
import { readState, withState } from './state';

let medplum: MockClient;
beforeEach(() => {
  medplum = new MockClient({ project: { resourceType: 'Project', id: 'p', name: 'p' } });
});

test('a failed public summary never holds the lease or fails completed credential persistence', async () => {
  const create = vi.mocked(medplum.createResourceIfNoneExist).getMockImplementation()?.bind(medplum);
  if (!create) {
    throw new Error('Missing project-stamping adapter');
  }
  let fail = true;
  vi.spyOn(medplum, 'createResourceIfNoneExist').mockImplementation(async (resource, query, options) => {
    if (
      fail &&
      resource.resourceType === 'Basic' &&
      resource.code.coding?.some((c) => c.code === 'calendar-public-status')
    ) {
      throw new Error('publication unavailable');
    }
    return create(resource, query, options);
  });
  const connection = await saveConnection(medplum, {
    practitionerRef: 'Practitioner/p',
    accountSub: 'sub',
    refreshToken: 'token',
  });
  const current = await medplum.readResource('Basic', connection.basic.id);
  expect(current.extension?.some((e) => e.url === LEASE_URL)).toBe(false);
  expect(readState(current).statusPublishPending).toBe(true);
  fail = false;
  await withConnectionLease(medplum, connection.basic.id, async () => undefined);
  expect(readState(await medplum.readResource('Basic', connection.basic.id)).statusPublishPending).toBeUndefined();
});

test('summary-only retries publish without any Google request', async () => {
  const connection = await saveConnection(medplum, {
    practitionerRef: 'Practitioner/p',
    accountSub: 'sub',
    refreshToken: 'token',
  });
  const state = readState(connection.basic);
  await medplum.updateResource(
    withState(connection.basic, { ...state, inboundCompleted: state.inboundRequest, statusPublishPending: true })
  );
  const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected Google request'));
  await expect(
    runInbound(
      medplum,
      { bot: { reference: 'Bot/import' }, input: {}, contentType: 'application/fhir+json', secrets: {} },
      connection.basic.id
    )
  ).resolves.toBeUndefined();
  expect(fetch).not.toHaveBeenCalled();
  expect(readState(await medplum.readResource('Basic', connection.basic.id)).statusPublishPending).toBeUndefined();
  fetch.mockRestore();
});
