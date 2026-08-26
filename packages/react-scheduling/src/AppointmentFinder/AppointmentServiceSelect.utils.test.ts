// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { SchedulingParametersURI } from '@medplum/core';
import type { Duration, HealthcareService } from '@medplum/fhirtypes';
import { getServiceDurationMinutes, isServiceKeptAtLocation } from './AppointmentServiceSelect.utils';

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

describe('isServiceKeptAtLocation', () => {
  const service: HealthcareService = {
    resourceType: 'HealthcareService',
    name: 'Ultrasound Imaging',
    location: [{ reference: 'Location/main-clinic' }, { reference: 'Location/satellite-clinic' }],
  };

  test('a site the service names', () => {
    expect(isServiceKeptAtLocation(service, { reference: 'Location/main-clinic' })).toBe(true);
    expect(isServiceKeptAtLocation(service, { reference: 'Location/satellite-clinic' })).toBe(true);
  });

  test('a site the service does not name', () => {
    expect(isServiceKeptAtLocation(service, { reference: 'Location/other-clinic' })).toBe(false);
  });

  test('a room inside a site the service names does not count', () => {
    // The `location` search parameter matches by exact reference and does not walk
    // `partOf`, so neither does this.
    expect(isServiceKeptAtLocation(service, { reference: 'Location/exam-room-a' })).toBe(false);
  });

  test('a service naming no site is kept whatever the site', () => {
    // Nothing about it was ever tied to a site, so no site can invalidate it — even
    // though the search would not offer it once a site is chosen.
    const unsited: HealthcareService = { resourceType: 'HealthcareService', name: 'Walk-in' };
    expect(isServiceKeptAtLocation(unsited, { reference: 'Location/main-clinic' })).toBe(true);
    expect(isServiceKeptAtLocation({ ...unsited, location: [] }, { reference: 'Location/main-clinic' })).toBe(true);
    expect(isServiceKeptAtLocation(unsited, undefined)).toBe(true);
  });

  test('no site narrows nothing', () => {
    expect(isServiceKeptAtLocation(service, undefined)).toBe(true);
  });
});
