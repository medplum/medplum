// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Extension, HealthcareService, Practitioner, Schedule } from '@medplum/fhirtypes';
import {
  clearAvailabilityOverride,
  extractServiceTypeReferences,
  getSchedulingTimezone,
  hasAvailabilityOverride,
  resolveAvailability,
  SchedulingParametersURI,
  serviceTypeIncludesService,
  setAvailabilityOverride,
  TimezoneExtensionURI,
  toServiceTypeCodeableConcepts,
} from './scheduling';
import type { WithId } from './utils';
import { createReference } from './utils';

const service = {
  resourceType: 'HealthcareService',
  id: 'service-1',
  name: 'Office visit',
} satisfies WithId<HealthcareService>;

function availableTime(day: string, start: string, end: string): Extension {
  return {
    url: 'availableTime',
    extension: [
      { url: 'daysOfWeek', valueCode: day },
      { url: 'availableStartTime', valueTime: start },
      { url: 'availableEndTime', valueTime: end },
    ],
  };
}

function allDayTime(day: string): Extension {
  return {
    url: 'availableTime',
    extension: [
      { url: 'daysOfWeek', valueCode: day },
      { url: 'allDay', valueBoolean: true },
    ],
  };
}

function scheduleWith(...availability: Extension[]): Schedule {
  return {
    resourceType: 'Schedule',
    id: 'schedule-1',
    actor: [{ reference: 'Practitioner/123' }],
    extension: [
      {
        url: SchedulingParametersURI,
        extension: [
          { url: 'service', valueReference: { reference: 'HealthcareService/service-1' } },
          { url: 'duration', valueDuration: { value: 30, unit: 'min' } },
          { url: 'availability', extension: availability },
        ],
      },
    ],
  };
}

/*
 * Reads the SchedulingParameters extensions for a service straight off the resource, rather than through
 * the module's own lookup, so assertions about what was written do not depend on the code that wrote it.
 */
function schedulingParameters(schedule: Schedule, serviceId = 'service-1'): Extension[] {
  const reference = `HealthcareService/${serviceId}`;
  return (
    schedule.extension?.filter(
      (extension) =>
        extension.url === SchedulingParametersURI &&
        extension.extension?.some(
          (subextension) => subextension.url === 'service' && subextension.valueReference?.reference === reference
        )
    ) ?? []
  );
}

function durationOf(schedule: Schedule): unknown {
  return schedulingParameters(schedule)[0]?.extension?.find((extension) => extension.url === 'duration')?.valueDuration;
}

describe('resolveAvailability', () => {
  test('resolves ranges and all-day entries from the Schedule override', () => {
    const availability = resolveAvailability(
      scheduleWith(
        availableTime('mon', '09:00:00', '12:00:00'),
        availableTime('mon', '13:00:00', '17:00:00'),
        allDayTime('sat')
      ),
      service
    );

    expect(availability).toEqual([
      { daysOfWeek: ['mon'], availableStartTime: '09:00:00', availableEndTime: '12:00:00' },
      { daysOfWeek: ['mon'], availableStartTime: '13:00:00', availableEndTime: '17:00:00' },
      { daysOfWeek: ['sat'], allDay: true },
    ]);
  });

  test('collects entries across multiple matching parameter extensions', () => {
    const schedule = scheduleWith(availableTime('mon', '09:00:00', '12:00:00'));
    schedule.extension?.push({
      url: SchedulingParametersURI,
      extension: [
        { url: 'service', valueReference: { reference: 'HealthcareService/service-1' } },
        { url: 'availability', extension: [allDayTime('sun')] },
      ],
    });

    expect(resolveAvailability(schedule, service)).toEqual([
      { daysOfWeek: ['mon'], availableStartTime: '09:00:00', availableEndTime: '12:00:00' },
      { daysOfWeek: ['sun'], allDay: true },
    ]);
  });

  test('falls back to the HealthcareService default when there is no override', () => {
    const serviceWithDefaults: WithId<HealthcareService> = {
      ...service,
      availableTime: [{ daysOfWeek: ['tue'], availableStartTime: '08:00:00', availableEndTime: '16:00:00' }],
    };

    expect(resolveAvailability(clearAvailabilityOverride(scheduleWith(), service), serviceWithDefaults)).toEqual(
      serviceWithDefaults.availableTime
    );
    expect(resolveAvailability(undefined, serviceWithDefaults)).toEqual(serviceWithDefaults.availableTime);
  });

  test('returns undefined without a service', () => {
    expect(resolveAvailability(scheduleWith(), undefined)).toBeUndefined();
  });

  test('ignores an override belonging to another service', () => {
    // The Schedule overrides service-1 only, so service-2 sees its own default rather than that override.
    const otherService: WithId<HealthcareService> = {
      ...service,
      id: 'service-2',
      availableTime: [{ daysOfWeek: ['fri'], availableStartTime: '08:00:00', availableEndTime: '16:00:00' }],
    };

    expect(resolveAvailability(scheduleWith(availableTime('mon', '09:00:00', '12:00:00')), otherService)).toEqual(
      otherService.availableTime
    );
  });
});

describe('availability overrides', () => {
  test('round-trips availability through the extension it writes', () => {
    const availability = [
      { daysOfWeek: ['mon' as const], availableStartTime: '09:00:00', availableEndTime: '17:00:00' },
      { daysOfWeek: ['sat' as const], allDay: true },
    ];

    const updated = setAvailabilityOverride(scheduleWith(), service, availability);
    expect(resolveAvailability(updated, service)).toEqual(availability);

    // The wire shape is the part callers never have to assemble: daysOfWeek repeats as its own
    // sub-extension rather than holding an array, and allDay replaces the start/end pair.
    const written = schedulingParameters(updated)[0]?.extension?.find((e) => e.url === 'availability');
    expect(written?.extension).toStrictEqual([
      {
        url: 'availableTime',
        extension: [
          { url: 'daysOfWeek', valueCode: 'mon' },
          { url: 'availableStartTime', valueTime: '09:00:00' },
          { url: 'availableEndTime', valueTime: '17:00:00' },
        ],
      },
      {
        url: 'availableTime',
        extension: [
          { url: 'daysOfWeek', valueCode: 'sat' },
          { url: 'allDay', valueBoolean: true },
        ],
      },
    ]);
  });

  test('replaces an existing override rather than appending a second one', () => {
    const schedule = scheduleWith(availableTime('mon', '09:00:00', '17:00:00'));

    const updated = setAvailabilityOverride(schedule, service, [{ daysOfWeek: ['tue'], allDay: true }]);

    expect(resolveAvailability(updated, service)).toEqual([{ daysOfWeek: ['tue'], allDay: true }]);
    expect(schedulingParameters(updated)[0]?.extension?.filter((e) => e.url === 'availability')).toHaveLength(1);
  });

  test('sets and clears an override without mutating input or sibling parameters', () => {
    const schedule = scheduleWith(availableTime('mon', '09:00:00', '17:00:00'));
    const before = structuredClone(schedule);

    const updated = setAvailabilityOverride(schedule, service, [
      { daysOfWeek: ['tue'], availableStartTime: '10:00:00', availableEndTime: '14:00:00' },
    ]);
    expect(schedule).toEqual(before);
    expect(hasAvailabilityOverride(updated, service)).toBe(true);
    expect(resolveAvailability(updated, service)).toEqual([
      { daysOfWeek: ['tue'], availableStartTime: '10:00:00', availableEndTime: '14:00:00' },
    ]);
    expect(durationOf(updated)).toEqual({ value: 30, unit: 'min' });

    const cleared = clearAvailabilityOverride(updated, service);
    expect(hasAvailabilityOverride(cleared, service)).toBe(false);
    expect(durationOf(cleared)).toEqual({ value: 30, unit: 'min' });
  });

  test('does not leave a stale override on a second matching parameter extension', () => {
    const schedule = scheduleWith(availableTime('mon', '09:00:00', '17:00:00'));
    schedule.extension?.push({
      url: SchedulingParametersURI,
      extension: [
        { url: 'service', valueReference: { reference: 'HealthcareService/service-1' } },
        { url: 'availability', extension: [allDayTime('sun')] },
      ],
    });

    const updated = setAvailabilityOverride(schedule, service, [{ daysOfWeek: ['tue'], allDay: true }]);
    expect(resolveAvailability(updated, service)).toEqual([{ daysOfWeek: ['tue'], allDay: true }]);
  });

  test('creates service-specific SchedulingParameters when missing', () => {
    const schedule: Schedule = {
      resourceType: 'Schedule',
      actor: [{ reference: 'Practitioner/123' }],
    };

    const updated = setAvailabilityOverride(schedule, service, [
      { daysOfWeek: ['wed'], availableStartTime: '09:00:00', availableEndTime: '17:00:00' },
    ]);
    expect(schedulingParameters(updated)).toHaveLength(1);
    expect(resolveAvailability(updated, service)).toHaveLength(1);
  });

  test('leaves sibling parameters alone when clearing the availability override', () => {
    const cleared = clearAvailabilityOverride(scheduleWith(availableTime('mon', '09:00:00', '17:00:00')), service);

    expect(hasAvailabilityOverride(cleared, service)).toBe(false);
    // The clear is scoped to the availability url, so duration survives it.
    expect(durationOf(cleared)).toEqual({ value: 30, unit: 'min' });
    expect(schedulingParameters(cleared)).toHaveLength(1);
  });
});

describe('getSchedulingTimezone', () => {
  const actor: Practitioner = {
    resourceType: 'Practitioner',
    extension: [{ url: TimezoneExtensionURI, valueCode: 'America/Los_Angeles' }],
  };
  const serviceWithTimezone: WithId<HealthcareService> = {
    ...service,
    extension: [
      {
        url: SchedulingParametersURI,
        extension: [{ url: 'timezone', valueCode: 'America/Chicago' }],
      },
    ],
  };

  test('uses actor timezone as the fallback', () => {
    expect(getSchedulingTimezone(scheduleWith(), service, actor)).toBe('America/Los_Angeles');
  });

  test('prefers HealthcareService scheduling parameters over actor', () => {
    expect(getSchedulingTimezone(scheduleWith(), serviceWithTimezone, actor)).toBe('America/Chicago');
  });

  test('reads the service alone when there is no Schedule to ask first', () => {
    // Editing a service's own default hours has no calendar in play, and so no
    // actor to fall back to either.
    expect(getSchedulingTimezone(undefined, serviceWithTimezone)).toBe('America/Chicago');
    expect(getSchedulingTimezone(undefined, service)).toBeUndefined();
  });

  test('prefers Schedule scheduling parameters over service and actor', () => {
    const schedule = scheduleWith();
    schedulingParameters(schedule)[0].extension?.push({
      url: 'timezone',
      valueCode: 'America/New_York',
    });
    expect(getSchedulingTimezone(schedule, serviceWithTimezone, actor)).toBe('America/New_York');
  });
});

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
