// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Slot } from '@medplum/fhirtypes';
import { SchedulingTransientIdentifier } from './scheduling';

describe('SchedulingTransientIdentifier', () => {
  test('set', () => {
    const slot: Slot = {
      resourceType: 'Slot',
      start: '2026-01-15T00:00:00.000Z',
      end: '2026-01-15T00:00:00.000Z',
      schedule: { reference: 'Schedule/12345' },
      status: 'busy',
    };

    SchedulingTransientIdentifier.set(slot);
    expect(slot).toHaveProperty('identifier');
    expect(slot.identifier).toHaveLength(1);
    expect(slot.identifier?.[0]).toHaveProperty('system', 'https://medplum.com/fhir/scheduling-transient-id');
    expect(slot.identifier?.[0]).toHaveProperty('use', 'temp');
    expect(slot.identifier?.[0]).toHaveProperty('value');
    // naive check: does this look like a uuid
    expect(slot.identifier?.[0].value).toMatch(/[-0-9a-f]{36}/);
  });

  test('get on a resource that was not `set` upon returns undefined', () => {
    const slot: Slot = {
      resourceType: 'Slot',
      start: '2026-01-15T00:00:00.000Z',
      end: '2026-01-15T00:00:00.000Z',
      schedule: { reference: 'Schedule/12345' },
      status: 'busy',
    };

    expect(SchedulingTransientIdentifier.get(slot)).toBeUndefined();
  });

  test('get on a resource that was `set` upon returns the ID', () => {
    const id = 'cb103a82-f313-4b22-8918-ed8de4b4143d';
    const slot: Slot = {
      resourceType: 'Slot',
      start: '2026-01-15T00:00:00.000Z',
      end: '2026-01-15T00:00:00.000Z',
      schedule: { reference: 'Schedule/12345' },
      status: 'busy',
      identifier: [
        {
          system: 'https://medplum.com/fhir/scheduling-transient-id',
          value: id,
          use: 'temp',
        },
      ],
    };

    expect(SchedulingTransientIdentifier.get(slot)).toEqual(id);
  });
});
