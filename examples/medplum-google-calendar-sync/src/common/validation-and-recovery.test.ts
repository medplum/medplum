// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { isFhirCriteriaMet, OperationOutcomeError, preconditionFailed } from '@medplum/core';
import type { Basic, Bot } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { expect, test, vi } from 'vitest';
import { saveConnection } from './connection';
import { IMPORT_IDENTIFIER_SYSTEM, GOOGLE_CALENDAR_NAMESPACE as N } from './constants';
import { busyInterval } from './import';
import { ConnectionBusyError, LEASE_URL, withConnectionLease } from './lease';
import { mutateConnectionState, readState, repairCheckpoint, requestSync, STATE_URL, withState } from './state';
import { ensureSyncSubscription } from './subscriptions';

function corrupt(basic: Basic): Basic {
  return {
    ...basic,
    extension: [
      ...(basic.extension ?? []).filter((e) => e.url !== STATE_URL),
      {
        url: STATE_URL,
        extension: [
          {
            url: 'outboundWork',
            extension: [
              { url: 'phase', valueCode: 'invalid' },
              { url: 'start', valueInstant: '2026-11-01T10:00:00.000Z' },
              { url: 'end', valueInstant: '2026-11-01T11:00:00.000Z' },
            ],
          },
        ],
      },
    ],
  };
}

test('invalid checkpoint is rejected, then quarantined privately with fresh work and a releasable lease', async () => {
  const medplum = new MockClient();
  const connection = await saveConnection(medplum, {
    practitionerRef: 'Practitioner/p',
    accountSub: 'sub',
    refreshToken: 'synthetic',
  });
  const broken = corrupt(connection.basic);
  expect(() => readState(broken)).toThrow('checkpoint');
  const repaired = repairCheckpoint(broken);
  expect(readState(repaired).outboundRequest).toBeTruthy();
  expect(repaired.extension?.find((e) => e.url === `${N}/invalid-outbound-checkpoint`)?.extension).toEqual(
    broken.extension?.find((e) => e.url === STATE_URL)?.extension?.[0].extension
  );
  await medplum.updateResource(broken);
  await withConnectionLease(medplum, connection.basic.id, async (lease) => {
    expect(readState(await lease.read()).outboundWork).toBeUndefined();
  });
  const saved = await medplum.readResource('Basic', connection.basic.id);
  expect(saved.extension?.some((e) => e.url === LEASE_URL)).toBe(false);
  expect(saved.extension?.some((e) => e.url === `${N}/invalid-outbound-checkpoint`)).toBe(true);
});

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

test('request marking repairs corrupt work and persists both requested directions', async () => {
  const medplum = new MockClient();
  const { basic } = await saveConnection(medplum, {
    practitionerRef: 'Practitioner/p',
    accountSub: 'sub',
    refreshToken: 'synthetic',
  });
  await medplum.updateResource(corrupt(basic));
  await requestSync(medplum, basic.id, ['inbound', 'outbound']);
  const saved = await medplum.readResource('Basic', basic.id);
  expect(readState(saved).outboundWork).toBeUndefined();
  expect(readState(saved).outboundError).toBe('checkpoint-repair-required');
  expect(readState(saved).inboundRequest).toBeTruthy();
  expect(readState(saved).outboundRequest).toBeTruthy();
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
