// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { HealthcareService } from '@medplum/fhirtypes';
import { extractServiceTypeReferences, serviceTypeIncludesService, toServiceTypeCodeableConcepts } from './scheduling';

const service: HealthcareService = {
  resourceType: 'HealthcareService',
  id: 'service-1',
  name: 'Office visit',
};

describe('serviceType CodeableConcepts', () => {
  test('converts, matches, and extracts HealthcareService references', () => {
    const serviceWithId = { ...service, id: 'service-1' };
    const serviceType = toServiceTypeCodeableConcepts(serviceWithId);

    expect(serviceTypeIncludesService(serviceType, serviceWithId)).toBe(true);
    expect(extractServiceTypeReferences(serviceType)).toEqual([
      expect.objectContaining({ reference: 'HealthcareService/service-1' }),
    ]);
  });

  test('preserves service type coding while adding a reference', () => {
    const serviceWithType = {
      ...service,
      id: 'service-1',
      type: [{ coding: [{ system: 'http://example.com/service', code: 'office' }] }],
    };
    const serviceType = toServiceTypeCodeableConcepts(serviceWithType);

    expect(serviceType[0].coding?.[0].code).toBe('office');
    expect(serviceTypeIncludesService(serviceType, serviceWithType)).toBe(true);
  });

  test('does not match an unrelated service', () => {
    const serviceType = toServiceTypeCodeableConcepts({ ...service, id: 'service-1' });
    expect(serviceTypeIncludesService(serviceType, { ...service, id: 'service-2' })).toBe(false);
    expect(serviceTypeIncludesService(undefined, { ...service, id: 'service-1' })).toBe(false);
  });
});
