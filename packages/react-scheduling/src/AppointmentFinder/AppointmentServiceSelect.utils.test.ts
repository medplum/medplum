// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { SchedulingParametersURI } from '@medplum/core';
import type { Duration, HealthcareService } from '@medplum/fhirtypes';
import { getServiceDurationMinutes } from './AppointmentServiceSelect.utils';

function serviceWithDuration(valueDuration: Duration): HealthcareService {
  return {
    resourceType: 'HealthcareService',
    name: 'Office visit',
    extension: [{ url: SchedulingParametersURI, extension: [{ url: 'duration', valueDuration }] }],
  };
}

describe('getServiceDurationMinutes', () => {
  test('reads the length a service configures for itself', () => {
    expect(getServiceDurationMinutes(serviceWithDuration({ value: 45, unit: 'min' }))).toBe(45);
  });

  test('converts the configured units to minutes', () => {
    expect(getServiceDurationMinutes(serviceWithDuration({ value: 2, unit: 'h' }))).toBe(120);
  });

  test('reads a zero length rather than passing over it', () => {
    // Scheduling accepts a zero duration, so reading it as absent would describe a
    // configured service as an unconfigured one.
    expect(getServiceDurationMinutes(serviceWithDuration({ value: 0, unit: 'min' }))).toBe(0);
  });

  test('ignores a length it cannot read, rather than reporting a wrong one', () => {
    // Units scheduling does not accept, and a negative value, reach the field as nothing
    // rather than as a number the server would reject.
    expect(getServiceDurationMinutes(serviceWithDuration({ value: 90, unit: 's' }))).toBeUndefined();
    expect(getServiceDurationMinutes(serviceWithDuration({ value: -30, unit: 'min' }))).toBeUndefined();
  });

  test('reports nothing when the service configures no length', () => {
    expect(getServiceDurationMinutes({ resourceType: 'HealthcareService', name: 'Office visit' })).toBeUndefined();
    // SchedulingParameters present but silent on duration, which is the misconfiguration
    // `$find` rejects at booking time.
    expect(
      getServiceDurationMinutes({
        resourceType: 'HealthcareService',
        name: 'Office visit',
        extension: [{ url: SchedulingParametersURI, extension: [{ url: 'timezone', valueCode: 'America/New_York' }] }],
      })
    ).toBeUndefined();
  });
});
