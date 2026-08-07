// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Duration, Schedule } from '@medplum/fhirtypes';
import { DrRiveraSchedule, UltrasoundImagingService } from '../stories/scheduling';
import { getConfiguredDurationMinutes } from './AppointmentFinder.params';

describe('getConfiguredDurationMinutes', () => {
  test('Reads the length the service is configured for', () => {
    expect(getConfiguredDurationMinutes(UltrasoundImagingService)).toBe(30);
    expect(getConfiguredDurationMinutes(undefined)).toBeUndefined();
  });

  test('A Schedule overrides the service, as the server does', () => {
    const schedule: Schedule = {
      ...DrRiveraSchedule,
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
          extension: [
            { url: 'service', valueReference: { reference: 'HealthcareService/ultrasound-imaging' } },
            { url: 'duration', valueDuration: { value: 1, unit: 'h' } },
          ],
        },
      ],
    };

    expect(getConfiguredDurationMinutes(UltrasoundImagingService, schedule)).toBe(60);
    // Parameters for another service are not this service's.
    expect(getConfiguredDurationMinutes({ ...UltrasoundImagingService, id: 'other' }, schedule)).toBe(30);
  });

  test('Reports nothing when the service configures no length', () => {
    expect(getConfiguredDurationMinutes({ ...UltrasoundImagingService, extension: undefined })).toBeUndefined();
  });

  test('Reads the same units the scheduling operations do', () => {
    // Shared with the server through `durationToMinutes`, so that a visit shown
    // here as a day long is a day long when it is booked. A unit the operations
    // refuse is reported as no length rather than guessed at as minutes.
    expect(durationOf({ value: 1, unit: 'd' })).toBe(1440);
    expect(durationOf({ value: 2, unit: 'wk' })).toBe(20160);
    expect(durationOf({ value: 45, unit: 'min' })).toBe(45);
    expect(durationOf({ value: 1800, unit: 's' })).toBeUndefined();
    expect(durationOf({ value: 1, code: 'h' })).toBeUndefined();
  });
});

// The length a service configured with the given duration is read as.
function durationOf(valueDuration: Duration): number | undefined {
  return getConfiguredDurationMinutes({
    ...UltrasoundImagingService,
    extension: [
      {
        url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
        extension: [{ url: 'duration', valueDuration }],
      },
    ],
  });
}
