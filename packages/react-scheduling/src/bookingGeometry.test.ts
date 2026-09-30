// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SchedulingParameterExtension, WithId } from '@medplum/core';
import { SchedulingParametersURI, setScheduleSchedulingParameter } from '@medplum/core';
import type { Extension, HealthcareService, Schedule } from '@medplum/fhirtypes';
import { resolveBookingGeometry } from './bookingGeometry';

const service = {
  resourceType: 'HealthcareService',
  id: 'service-1',
  name: 'Office visit',
} satisfies WithId<HealthcareService>;

describe('resolveBookingGeometry', () => {
  const serviceWith = (...parameters: Extension[]): WithId<HealthcareService> => ({
    ...service,
    extension: [{ url: SchedulingParametersURI, extension: parameters }],
  });

  const scheduleFor = (target: WithId<HealthcareService>, ...parameters: SchedulingParameterExtension[]): Schedule =>
    parameters.reduce<Schedule>((schedule, parameter) => setScheduleSchedulingParameter(schedule, target, parameter), {
      resourceType: 'Schedule',
      id: 'schedule-1',
      actor: [{ reference: 'Practitioner/123' }],
    });

  test('falls back to the same defaults the scheduling operations apply', () => {
    // `duration` has none: the server refuses a booking without one, so an absent
    // duration is missing configuration rather than a value to guess at.
    expect(resolveBookingGeometry(service)).toStrictEqual({
      duration: undefined,
      bufferBefore: 0,
      bufferAfter: 0,
      slotCapacity: 1,
    });
  });

  test('reads what the service sets for itself', () => {
    const configured = serviceWith(
      { url: 'duration', valueDuration: { value: 45, unit: 'min' } },
      { url: 'bufferAfter', valueDuration: { value: 1, unit: 'h' } },
      { url: 'slotCapacity', valuePositiveInt: 2 }
    );

    expect(resolveBookingGeometry(configured)).toStrictEqual({
      duration: 45,
      bufferBefore: 0,
      bufferAfter: 60,
      slotCapacity: 2,
    });
  });

  test('lets a schedule override the service, parameter by parameter', () => {
    const configured = serviceWith(
      { url: 'duration', valueDuration: { value: 45, unit: 'min' } },
      { url: 'bufferBefore', valueDuration: { value: 10, unit: 'min' } }
    );
    const schedule = scheduleFor(configured, { url: 'duration', valueDuration: { value: 20, unit: 'min' } });

    // Only what the calendar restates is replaced; the rest still comes from the service.
    expect(resolveBookingGeometry(configured, schedule)).toStrictEqual({
      duration: 20,
      bufferBefore: 10,
      bufferAfter: 0,
      slotCapacity: 1,
    });
  });

  test("ignores a schedule's parameters for some other service", () => {
    const configured = serviceWith({ url: 'duration', valueDuration: { value: 45, unit: 'min' } });
    const other: WithId<HealthcareService> = { ...service, id: 'service-2' };
    const schedule = scheduleFor(other, { url: 'duration', valueDuration: { value: 5, unit: 'min' } });

    expect(resolveBookingGeometry(configured, schedule).duration).toBe(45);
  });

  test('refuses a capacity that is not a whole number of visits', () => {
    // Fails closed to 1, matching the server: a malformed stamp must never read as
    // more room than the practice configured.
    expect(resolveBookingGeometry(serviceWith({ url: 'slotCapacity', valuePositiveInt: 0 })).slotCapacity).toBe(1);
    expect(resolveBookingGeometry(serviceWith({ url: 'slotCapacity', valueInteger: 5 })).slotCapacity).toBe(1);
  });
});
