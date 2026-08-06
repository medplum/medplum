// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { HealthcareService } from '@medplum/fhirtypes';
import {
  durationToMinutes,
  extractServiceTypeReferences,
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

describe('durationToMinutes', () => {
  test('converts every unit scheduling accepts', () => {
    expect(durationToMinutes({ value: 30, unit: 'min' })).toBe(30);
    expect(durationToMinutes({ value: 1, unit: 'h' })).toBe(60);
    expect(durationToMinutes({ value: 1, unit: 'd' })).toBe(1440);
    expect(durationToMinutes({ value: 1, unit: 'wk' })).toBe(10080);
    expect(durationToMinutes({ value: 0, unit: 'min' })).toBe(0);
  });

  test('refuses a duration the scheduling operations would refuse', () => {
    // Rejected rather than read as minutes: a unit guessed wrong here and
    // validated there would have the two disagree by hours.
    expect(durationToMinutes({ value: 30, unit: 's' })).toBeUndefined();
    expect(durationToMinutes({ value: 1, unit: 'mo' })).toBeUndefined();
    // `unit` is what the operations validate; a UCUM code alone is not enough.
    expect(durationToMinutes({ value: 1, code: 'h' })).toBeUndefined();
    expect(durationToMinutes({ value: 1 })).toBeUndefined();
    expect(durationToMinutes({ unit: 'min' })).toBeUndefined();
    expect(durationToMinutes({ value: -30, unit: 'min' })).toBeUndefined();
    expect(durationToMinutes(undefined)).toBeUndefined();
  });
});
