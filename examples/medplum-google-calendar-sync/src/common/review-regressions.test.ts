// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { isFhirCriteriaMet, resourceMatchesSubscriptionCriteria } from '@medplum/core';
import type { Schedule, PractitionerRole, Appointment } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { beforeEach, expect, test, vi } from 'vitest';
import { auditPolicyGrants, ensureBotMembership, ensureOperationPolicy, ensureSyncSubscription } from './install';
import { saveConnection } from './connection';
import { LEASE_URL, withConnectionLease } from './lease';
import { runInbound } from './inbound';
import { BOT_IDENTIFIER_SYSTEM, BOT_IDENTIFIER_VALUE } from './constants';
import { readState, withState } from './state';
import { callerStatus } from './public-status';
let medplum: MockClient;
beforeEach(() => {
  medplum = new MockClient({ project: { resourceType: 'Project', id: 'p', name: 'p' } });
});

test.each(['Schedule', 'PractitionerRole'] as const)(
  '%s deletion bypasses the transition filter while metadata changes do not fire',
  async (type) => {
    const bot = { resourceType: 'Bot' as const, id: 'dispatcher' };
    const updates = await ensureSyncSubscription(medplum, bot, type);
    const deletes = await ensureSyncSubscription(medplum, bot, type, true);
    const before: Schedule | PractitionerRole =
      type === 'Schedule'
        ? { resourceType: type, actor: [{ reference: 'Practitioner/a' }] }
        : { resourceType: type, practitioner: { reference: 'Practitioner/a' } };
    const after =
      before.resourceType === 'Schedule'
        ? { ...before, actor: [{ reference: 'Practitioner/b' }] }
        : { ...before, practitioner: { reference: 'Practitioner/b' } };
    expect(await isFhirCriteriaMet(updates, before, async () => undefined)).toBe(true);
    expect(await isFhirCriteriaMet(updates, after, async () => before)).toBe(true);
    expect(await isFhirCriteriaMet(updates, { ...before, meta: { versionId: 'new' } }, async () => before)).toBe(false);
    for (const [subscription, expected] of [
      [updates, false],
      [deletes, true],
    ] as const) {
      expect(
        await resourceMatchesSubscriptionCriteria({
          resource: before,
          subscription,
          context: { interaction: 'delete' },
          getPreviousResource: async () => before,
        })
      ).toBe(expected);
    }
    expect(deletes.extension?.filter((e) => e.valueCode).map((e) => e.valueCode)).toEqual(['delete']);
    expect(updates.extension?.filter((e) => e.valueCode).map((e) => e.valueCode)).toEqual(['create', 'update']);
  }
);

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

test('status never reads historical appointments one at a time', async () => {
  const practitionerRef = 'Practitioner/p';
  await saveConnection(medplum, { practitionerRef, accountSub: 'sub', refreshToken: 'token' });
  for (let i = 0; i < 100; i++) {
    await medplum.createResource<Appointment>({
      resourceType: 'Appointment',
      status: 'booked',
      start: '2020-01-01T10:00:00Z',
      end: '2020-01-01T11:00:00Z',
      participant: [{ actor: { reference: practitionerRef }, status: 'accepted' }],
    });
  }
  const reads = vi.spyOn(medplum, 'readReference');
  const searches = vi.spyOn(medplum, 'searchResourcePages');
  const status = await callerStatus(medplum, practitionerRef);
  expect(status.parameter).toContainEqual({ name: 'activeConflictCount', valueInteger: 0 });
  expect(reads).not.toHaveBeenCalled();
  const query = searches.mock.calls.find(([type]) => type === 'Appointment')?.[1];
  expect(query).toContain('end=gt');
  expect(query).toContain('date=lt');
  expect(query).toContain('status=');
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

test('audit separates expected workers and warns when their Bot has been deleted', async () => {
  const bot = await medplum.createResource({
    resourceType: 'Bot',
    identifier: [{ system: BOT_IDENTIFIER_SYSTEM, value: BOT_IDENTIFIER_VALUE.connect }],
  });
  const policy = await ensureOperationPolicy(medplum, true);
  const membership = await ensureBotMembership(medplum, 'p', bot, policy);
  const expected: string[] = [];
  expect(await auditPolicyGrants(medplum, 'p', expected)).toEqual([]);
  expect(expected).toEqual([`ProjectMembership/${membership.id}`]);
  await medplum.deleteResource('Bot', bot.id);
  const after: string[] = [];
  expect(await auditPolicyGrants(medplum, 'p', after)).toEqual([`ProjectMembership/${membership.id}`]);
  expect(after).toEqual([]);
});
