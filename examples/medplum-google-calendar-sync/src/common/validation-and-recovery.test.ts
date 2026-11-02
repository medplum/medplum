// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { isFhirCriteriaMet, OperationOutcomeError, preconditionFailed, validateResource } from '@medplum/core';
import type { Basic, Bot, StructureDefinition } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { expect, test, vi } from 'vitest';
import { ConflictRefreshPending, refreshConflicts } from './conflicts';
import { saveConnection } from './connection';
import { IMPORT_IDENTIFIER_SYSTEM, GOOGLE_CALENDAR_NAMESPACE as N } from './constants';
import { busyInterval, importIdentifier } from './import';
import { ensureSyncSubscription } from './install';
import { ConnectionBusyError, LEASE_URL, withConnectionLease } from './lease';
import { DEFINITIONS, PROFILES } from './profiles';
import { readState, repairCheckpoint, requestSync, STATE_URL, withState } from './state';
const profile = (name: keyof typeof PROFILES): { profile: StructureDefinition } => ({
  profile: DEFINITIONS.find((d) => d.url === PROFILES[name]) as StructureDefinition,
});
const publicStatus: Basic = {
  resourceType: 'Basic',
  code: { coding: [{ system: N, code: 'calendar-public-status' }] },
  subject: { reference: 'Practitioner/p' },
  identifier: [{ system: `${N}/public-status`, value: 'Basic/c' }],
  extension: [{ url: `${N}/status`, valueCode: 'active' }],
};

test('public status accepts its projection but rejects private fields, invalid types and conflicting subtype codes', () => {
  expect(() => validateResource(publicStatus, profile('publicStatus'))).not.toThrow();
  for (const extra of [
    { url: `${N}/secret`, valueString: 'synthetic' },
    { url: `${N}/event-detail-level`, valueCode: 'full-with-invite' },
    { url: `${N}/account-email`, valueBoolean: true },
    { url: STATE_URL, extension: [{ url: 'lastInbound', valueBoolean: true }] },
    { url: STATE_URL, extension: [{ url: 'note', valueString: 'synthetic' }] },
  ]) {
    expect(() =>
      validateResource(
        { ...publicStatus, extension: [...(publicStatus.extension ?? []), extra] },
        profile('publicStatus')
      )
    ).toThrow();
  }
  expect(() =>
    validateResource(
      {
        ...publicStatus,
        code: { coding: [...(publicStatus.code.coding ?? []), { system: N, code: 'calendar-settings' }] },
      },
      profile('publicStatus')
    )
  ).toThrow();
});

test('resource profiles retain inherited constraints', () => {
  for (const url of Object.values(PROFILES)) {
    const definition = DEFINITIONS.find((d) => d.url === url) as StructureDefinition;
    expect(definition.snapshot?.element[0].constraint?.some((c) => c.key === 'dom-2')).toBe(true);
  }
});

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
  expect(() => validateResource(broken, profile('connection'))).toThrow();
  expect(() => readState(broken)).toThrow('checkpoint');
  const repaired = repairCheckpoint(broken);
  expect(() => validateResource(repaired, profile('connection'))).not.toThrow();
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

test.each([1, 40])(
  'local conflict refresh checks %i Slots without per-Slot lease reads or Google calls',
  async (count) => {
    const medplum = new MockClient();
    const connection = await saveConnection(medplum, {
      practitionerRef: 'Practitioner/p',
      accountSub: 'sub',
      refreshToken: 'synthetic',
    });
    const a = await medplum.createResource({
      resourceType: 'Schedule',
      active: true,
      actor: [{ reference: 'Practitioner/p' }],
    });
    await medplum.createResource({ resourceType: 'Schedule', active: true, actor: [{ reference: 'Practitioner/p' }] });
    const start = new Date(Date.now() + 3600_000).toISOString(),
      end = new Date(Date.now() + 7200_000).toISOString();
    await medplum.createResource({
      resourceType: 'Appointment',
      status: 'booked',
      start,
      end,
      participant: [{ actor: { reference: 'Practitioner/p' }, status: 'accepted' }],
    });
    for (let index = 0; index < count; index++) {
      await medplum.createResource({
        resourceType: 'Slot',
        status: 'busy-unavailable',
        start,
        end,
        schedule: { reference: `Schedule/${a.id}` },
        identifier: [
          {
            system: IMPORT_IDENTIFIER_SYSTEM,
            value: importIdentifier({
              connectionId: connection.basic.id,
              calendarId: 'synthetic',
              eventId: `event-${index}`,
              scheduleRef: `Schedule/${a.id}`,
            }),
          },
        ],
      });
    }
    const fetch = vi.spyOn(globalThis, 'fetch');
    try {
      await withConnectionLease(medplum, connection.basic.id, async (lease) => {
        await refreshConflicts(lease, connection);
        const reads = vi.spyOn(lease, 'read');
        const writes = vi.spyOn(lease, 'mutate');
        await refreshConflicts(lease, connection);
        expect(writes).not.toHaveBeenCalled();
        // Checks are per page/schedule, not per Slot.
        expect(reads.mock.calls.length).toBeLessThan(12);
        reads.mockRestore();
        writes.mockRestore();
      });
      const state = readState(await medplum.readResource('Basic', connection.basic.id));
      expect(state.conflicts).toHaveLength(count);
      expect(
        state.conflicts.every((conflict) => JSON.stringify(conflict.schedules) === JSON.stringify([`Schedule/${a.id}`]))
      ).toBe(true);
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  }
);

test.each([
  ['2026-11-02T11:00:00.000Z', '2026-11-02T10:00:00.000Z'],
  ['2026-11-02T10:00:00.000Z', undefined],
  ['2026-11-02T10:00:00Z', '2026-11-02T11:00:00.000Z'],
])('invalid requested range %s / %s is rejected and repaired once', async (start, end) => {
  const medplum = new MockClient();
  const connection = await saveConnection(medplum, {
    practitionerRef: 'Practitioner/p',
    accountSub: 'sub',
    refreshToken: 'synthetic',
  });
  const broken = withState(connection.basic, {
    ...readState(connection.basic),
    requestedRangeStart: start,
    requestedRangeEnd: end,
  });
  expect(() => validateResource(broken, profile('connection'))).toThrow();
  const repaired = repairCheckpoint(broken);
  expect(() => validateResource(repaired, profile('connection'))).not.toThrow();
  expect(readState(repaired).requestedRangeStart).toBeUndefined();
  expect(readState(repaired).requestedRangeEnd).toBeUndefined();
  expect(readState(repaired).outboundError).toBe('checkpoint-repair-required');
  expect(repairCheckpoint(repaired)).toBe(repaired);
  const corruptedAgain = repairCheckpoint(corrupt(repaired));
  expect(corruptedAgain.extension?.filter((e) => e.url === `${N}/invalid-outbound-checkpoint`)).toHaveLength(1);
});

test('connection identifier must equal its practitioner subject', async () => {
  const medplum = new MockClient();
  const { basic } = await saveConnection(medplum, {
    practitionerRef: 'Practitioner/p',
    accountSub: 'sub',
    refreshToken: 'synthetic',
  });
  expect(() => validateResource(basic, profile('connection'))).not.toThrow();
  expect(() =>
    validateResource({ ...basic, subject: { reference: 'Practitioner/other' } }, profile('connection'))
  ).toThrow();
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
  expect(() => validateResource(saved, profile('connection'))).not.toThrow();
});

test('conflict refresh stops before its budget expires and scopes Slot reads by Schedule', async () => {
  const medplum = new MockClient();
  const connection = await saveConnection(medplum, {
    practitionerRef: 'Practitioner/p',
    accountSub: 'sub',
    refreshToken: 'synthetic',
  });
  const schedule = await medplum.createResource({ resourceType: 'Schedule', actor: [{ reference: 'Practitioner/p' }] });
  const queries = vi.spyOn(medplum, 'searchResourcePages');
  await withConnectionLease(medplum, connection.basic.id, async (lease) => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(lease.deadline - 30_000);
    try {
      await expect(refreshConflicts(lease, connection)).rejects.toBeInstanceOf(ConflictRefreshPending);
    } finally {
      clock.mockRestore();
    }
    await refreshConflicts(lease, connection);
  });
  const slotQueries = queries.mock.calls.filter(([type]) => type === 'Slot');
  expect(slotQueries).toHaveLength(1);
  expect(new URLSearchParams(slotQueries[0][1] as string).get('schedule')).toBe(`Schedule/${schedule.id}`);
});
