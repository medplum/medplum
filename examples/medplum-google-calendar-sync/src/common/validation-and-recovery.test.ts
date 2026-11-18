// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { isFhirCriteriaMet, OperationOutcomeError, preconditionFailed } from '@medplum/core';
import type { Bot } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { expect, test, vi } from 'vitest';
import { saveConnection } from './connection';
import { IMPORT_IDENTIFIER_SYSTEM } from './constants';
import { busyInterval } from './import';
import { ConnectionBusyError, LEASE_URL, withConnectionLease } from './lease';
import { mutateConnectionState, readState, withState } from './state';
import { ensureSyncSubscription } from './subscriptions';

test('a compare-and-swap acquisition race is a retryable busy connection', async () => {
  const medplum = new MockClient();
  const connection = await saveConnection(medplum, {
    practitionerRef: 'Practitioner/p',
    accountSub: 'sub',
    refreshToken: 'synthetic',
  });
  vi.spyOn(medplum, 'updateResource').mockRejectedValueOnce(new OperationOutcomeError(preconditionFailed));
  const work = vi.fn();
  await expect(withConnectionLease(medplum, connection.basic.id, work)).rejects.toBeInstanceOf(ConnectionBusyError);
  expect(work).not.toHaveBeenCalled();
});

test('foreign-project mirrors block time while this project mirrors do not', () => {
  const event = {
    id: 'event',
    start: { dateTime: '2026-11-01T10:00:00Z' },
    end: { dateTime: '2026-11-01T11:00:00Z' },
    extendedProperties: { private: { medplumProject: 'project-a', medplumSource: 'Appointment/a' } },
  };
  expect(busyInterval(event, 'project-a')).toBeUndefined();
  expect(busyInterval(event, 'project-b')).toBeDefined();
});

test('Slot delivery excludes imported writes and deletes but retains native blocks and ownership transitions', async () => {
  const medplum = new MockClient();
  const bot = await medplum.createResource<Bot>({ resourceType: 'Bot' });
  const sub = await ensureSyncSubscription(medplum, bot, 'Slot');
  const native = {
    resourceType: 'Slot' as const,
    status: 'busy-unavailable' as const,
    schedule: { reference: 'Schedule/s' },
    start: '2026-11-01T10:00:00Z',
    end: '2026-11-01T11:00:00Z',
  };
  const imported = { ...native, identifier: [{ system: IMPORT_IDENTIFIER_SYSTEM, value: 'synthetic' }] };
  expect(await isFhirCriteriaMet(sub, imported, async () => undefined)).toBe(false);
  expect(await isFhirCriteriaMet(sub, imported, async () => imported)).toBe(false);
  expect(await isFhirCriteriaMet(sub, native, async () => undefined)).toBe(true);
  expect(await isFhirCriteriaMet(sub, native, async () => native)).toBe(true);
  expect(await isFhirCriteriaMet(sub, imported, async () => native)).toBe(true);
  expect(await isFhirCriteriaMet(sub, native, async () => imported)).toBe(true);
});

test('queued state mutations rebase on a worker write and preserve its lease and checkpoints', async () => {
  const medplum = new MockClient();
  const connection = await saveConnection(medplum, {
    practitionerRef: 'Practitioner/p',
    accountSub: 'sub',
    refreshToken: 'synthetic',
  });
  await withConnectionLease(medplum, connection.basic.id, async (lease) => {
    const update = medplum.updateResource.bind(medplum);
    const before = await lease.read();
    const competing = withState(before, { ...readState(before), lastInbound: '2026-11-02T00:00:00.000Z' });
    const writes = vi.spyOn(medplum, 'updateResource').mockImplementationOnce(async () => {
      await update(competing);
      throw new OperationOutcomeError(preconditionFailed);
    });
    await mutateConnectionState(medplum, connection.basic.id, (basic) =>
      withState(basic, { ...readState(basic), outboundRequest: 'new-request' })
    );
    const current = await lease.read();
    expect(readState(current)).toMatchObject({
      lastInbound: '2026-11-02T00:00:00.000Z',
      outboundRequest: 'new-request',
    });
    expect(current.extension?.find((e) => e.url === LEASE_URL)).toEqual(
      before.extension?.find((e) => e.url === LEASE_URL)
    );
    expect(writes.mock.calls[0][1]).toMatchObject({ headers: { 'If-Match': `W/"${before.meta?.versionId}"` } });
  });
});
