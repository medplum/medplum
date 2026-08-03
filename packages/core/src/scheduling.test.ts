// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { HealthcareService, Identifier, Slot } from '@medplum/fhirtypes';
import {
  extractServiceTypeReferences,
  SchedulingTransientIdentifier,
  serviceTypeIncludesService,
  toServiceTypeCodeableConcepts,
} from './scheduling';
import type { WithId } from './utils';
import { createReference } from './utils';

const service = {
  resourceType: 'HealthcareService',
  id: 'service-1',
  name: 'Office visit',
} satisfies WithId<HealthcareService>;

describe('serviceType CodeableConcepts', () => {
  test('converts, matches, and extracts HealthcareService references', () => {
    const serviceType = toServiceTypeCodeableConcepts(service);

    expect(serviceTypeIncludesService(serviceType, service)).toBe(true);
    expect(extractServiceTypeReferences(serviceType)).toEqual([
      expect.objectContaining({ reference: 'HealthcareService/service-1' }),
    ]);
  });

  test('preserves service type coding while adding a reference', () => {
    const serviceWithType = {
      ...service,
      type: [{ coding: [{ system: 'http://example.com/service', code: 'office' }] }],
    };
    const serviceType = toServiceTypeCodeableConcepts(serviceWithType);

    expect(serviceType[0].coding?.[0].code).toBe('office');
    expect(serviceTypeIncludesService(serviceType, serviceWithType)).toBe(true);
  });

  test('matches a HealthcareService reference', () => {
    const serviceType = toServiceTypeCodeableConcepts(service);

    expect(serviceTypeIncludesService(serviceType, createReference(service))).toBe(true);
    expect(serviceTypeIncludesService(serviceType, { reference: 'HealthcareService/service-2' })).toBe(false);
  });

  test('does not match an unrelated service', () => {
    const serviceType = toServiceTypeCodeableConcepts(service);
    expect(serviceTypeIncludesService(serviceType, { ...service, id: 'service-2' })).toBe(false);
    expect(serviceTypeIncludesService(undefined, service)).toBe(false);
  });
});

describe('SchedulingTransientIdentifier', () => {
  // Built fresh per test, since `set` and `remove` mutate the resource.
  function buildSlot(identifier?: Identifier[]): Slot {
    return {
      resourceType: 'Slot',
      start: '2026-01-15T00:00:00.000Z',
      end: '2026-01-15T00:00:00.000Z',
      schedule: { reference: 'Schedule/12345' },
      status: 'busy',
      identifier,
    };
  }

  test('set', () => {
    const slot = buildSlot();

    SchedulingTransientIdentifier.set(slot);
    expect(slot.identifier).toHaveLength(1);
    expect(slot.identifier?.[0]).toHaveProperty('system', 'https://medplum.com/fhir/scheduling-transient-id');
    expect(slot.identifier?.[0]).toHaveProperty('use', 'temp');
    // naive check: does this look like a uuid
    expect(slot.identifier?.[0].value).toMatch(/[-0-9a-f]{36}/);
  });

  test('get on a resource that was not `set` upon returns undefined', () => {
    expect(SchedulingTransientIdentifier.get(buildSlot())).toBeUndefined();
  });

  test('get on a resource that was `set` upon returns the ID', () => {
    const id = 'cb103a82-f313-4b22-8918-ed8de4b4143d';
    const slot = buildSlot([
      { system: 'https://medplum.com/fhir/scheduling-transient-id', value: id, use: 'temp' },
    ]);

    expect(SchedulingTransientIdentifier.get(slot)).toEqual(id);
  });

  test('remove strips the transient identifier and preserves others', () => {
    const other: Identifier = { system: 'https://example.com/mrn', value: 'abc' };
    const slot = buildSlot([other]);
    SchedulingTransientIdentifier.set(slot);

    SchedulingTransientIdentifier.remove(slot);
    expect(slot.identifier).toEqual([other]);
    expect(SchedulingTransientIdentifier.get(slot)).toBeUndefined();
  });
});
