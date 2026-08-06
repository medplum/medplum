// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Extension, HealthcareService, Identifier, Practitioner, Schedule, Slot } from '@medplum/fhirtypes';
import {
  clearScheduleParameter,
  durationToMinutes,
  extractServiceTypeReferences,
  getEffectiveAvailability,
  getScheduleParameters,
  getSchedulingTimezone,
  SchedulingParametersURI,
  SchedulingTransientIdentifier,
  serviceTypeIncludesService,
  setScheduleAvailability,
  setScheduleParameter,
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

// Whether a Schedule sets availability of its own, read off the resource for the same reason as
// `schedulingParameters` above. The module has no wrapper for this: the question is one line through
// `getScheduleParameters`, which is how callers ask it.
function hasAvailability(schedule: Schedule, serviceId = 'service-1'): boolean {
  return schedulingParameters(schedule, serviceId).some((parameters) =>
    parameters.extension?.some((subextension) => subextension.url === 'availability')
  );
}

describe('getEffectiveAvailability', () => {
  test('resolves ranges and all-day entries from the hours the Schedule sets', () => {
    const availability = getEffectiveAvailability(
      service,
      scheduleWith(
        availableTime('mon', '09:00:00', '12:00:00'),
        availableTime('mon', '13:00:00', '17:00:00'),
        allDayTime('sat')
      )
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

    expect(getEffectiveAvailability(service, schedule)).toEqual([
      { daysOfWeek: ['mon'], availableStartTime: '09:00:00', availableEndTime: '12:00:00' },
      { daysOfWeek: ['sun'], allDay: true },
    ]);
  });

  test('falls back to the HealthcareService default when the Schedule sets no hours', () => {
    const serviceWithDefaults: WithId<HealthcareService> = {
      ...service,
      availableTime: [{ daysOfWeek: ['tue'], availableStartTime: '08:00:00', availableEndTime: '16:00:00' }],
    };

    expect(
      getEffectiveAvailability(serviceWithDefaults, clearScheduleParameter(scheduleWith(), service, 'availability'))
    ).toEqual(serviceWithDefaults.availableTime);
    expect(getEffectiveAvailability(serviceWithDefaults)).toEqual(serviceWithDefaults.availableTime);
  });

  test('returns undefined without a service', () => {
    expect(getEffectiveAvailability(undefined, scheduleWith())).toBeUndefined();
  });

  test('ignores hours belonging to another service', () => {
    // The Schedule sets hours for service-1 only, so service-2 sees its own default rather than those.
    const otherService: WithId<HealthcareService> = {
      ...service,
      id: 'service-2',
      availableTime: [{ daysOfWeek: ['fri'], availableStartTime: '08:00:00', availableEndTime: '16:00:00' }],
    };

    expect(getEffectiveAvailability(otherService, scheduleWith(availableTime('mon', '09:00:00', '12:00:00')))).toEqual(
      otherService.availableTime
    );
  });
});

describe('schedule availability', () => {
  test('round-trips availability through the extension it writes', () => {
    const availability = [
      { daysOfWeek: ['mon' as const], availableStartTime: '09:00:00', availableEndTime: '17:00:00' },
      { daysOfWeek: ['sat' as const], allDay: true },
    ];

    const updated = setScheduleAvailability(scheduleWith(), service, availability);
    expect(getEffectiveAvailability(service, updated)).toEqual(availability);

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

  test('replaces existing availability rather than appending a second entry', () => {
    const schedule = scheduleWith(availableTime('mon', '09:00:00', '17:00:00'));

    const updated = setScheduleAvailability(schedule, service, [{ daysOfWeek: ['tue'], allDay: true }]);

    expect(getEffectiveAvailability(service, updated)).toEqual([{ daysOfWeek: ['tue'], allDay: true }]);
    expect(schedulingParameters(updated)[0]?.extension?.filter((e) => e.url === 'availability')).toHaveLength(1);
  });

  test('sets and clears availability without mutating input or sibling parameters', () => {
    const schedule = scheduleWith(availableTime('mon', '09:00:00', '17:00:00'));
    const before = structuredClone(schedule);

    const updated = setScheduleAvailability(schedule, service, [
      { daysOfWeek: ['tue'], availableStartTime: '10:00:00', availableEndTime: '14:00:00' },
    ]);
    expect(schedule).toEqual(before);
    expect(hasAvailability(updated)).toBe(true);
    expect(getEffectiveAvailability(service, updated)).toEqual([
      { daysOfWeek: ['tue'], availableStartTime: '10:00:00', availableEndTime: '14:00:00' },
    ]);
    expect(durationOf(updated)).toEqual({ value: 30, unit: 'min' });

    const cleared = clearScheduleParameter(updated, service, 'availability');
    expect(hasAvailability(cleared)).toBe(false);
    expect(durationOf(cleared)).toEqual({ value: 30, unit: 'min' });
  });

  test('does not leave stale availability on a second matching parameter extension', () => {
    const schedule = scheduleWith(availableTime('mon', '09:00:00', '17:00:00'));
    schedule.extension?.push({
      url: SchedulingParametersURI,
      extension: [
        { url: 'service', valueReference: { reference: 'HealthcareService/service-1' } },
        { url: 'availability', extension: [allDayTime('sun')] },
      ],
    });

    const updated = setScheduleAvailability(schedule, service, [{ daysOfWeek: ['tue'], allDay: true }]);
    expect(getEffectiveAvailability(service, updated)).toEqual([{ daysOfWeek: ['tue'], allDay: true }]);
  });

  test('matches a service reference that carries a version suffix', () => {
    // Scheduling matches the `service` reference on resourceType and id, so a versioned reference names the
    // same service. Missing it here would append a second SchedulingParameters extension for that service,
    // which the scheduling operations reject.
    const schedule = scheduleWith(availableTime('mon', '09:00:00', '17:00:00'));
    schedulingParameters(schedule)[0].extension = schedulingParameters(schedule)[0].extension?.map((subextension) =>
      subextension.url === 'service'
        ? { url: 'service', valueReference: { reference: 'HealthcareService/service-1/_history/2' } }
        : subextension
    );

    // Asked through the module rather than the local reader, since tolerating the suffix is the point.
    expect(getScheduleParameters(schedule, service, 'availability')).toHaveLength(1);

    const updated = setScheduleAvailability(schedule, service, [{ daysOfWeek: ['tue'], allDay: true }]);
    expect(schedulingParameters(updated, 'service-1/_history/2')).toHaveLength(1);
    expect(schedule.extension).toHaveLength(1);
    expect(updated.extension).toHaveLength(1);
    expect(getEffectiveAvailability(service, updated)).toEqual([{ daysOfWeek: ['tue'], allDay: true }]);
  });

  test('creates service-specific SchedulingParameters when missing', () => {
    const schedule: Schedule = {
      resourceType: 'Schedule',
      actor: [{ reference: 'Practitioner/123' }],
    };

    const updated = setScheduleAvailability(schedule, service, [
      { daysOfWeek: ['wed'], availableStartTime: '09:00:00', availableEndTime: '17:00:00' },
    ]);
    expect(schedulingParameters(updated)).toHaveLength(1);
    expect(getEffectiveAvailability(service, updated)).toHaveLength(1);
  });

  // Both shapes below would serialize to an extension with neither a value nor sub-extensions of its
  // own, which fails FHIR constraint ext-1 and is rejected on write. Refused where the extension is
  // built, so the caller hears about it in its own terms rather than as a constraint failure from the
  // server, and so the Schedule it passed in is never left holding something unwritable.
  test('refuses availability with no entries', () => {
    const schedule = scheduleWith(availableTime('mon', '09:00:00', '17:00:00'));

    expect(() => setScheduleAvailability(schedule, service, [])).toThrow(/at least one availableTime/);
    // Clearing is the way to hand the calendar back to the service default, and it still works.
    expect(hasAvailability(clearScheduleParameter(schedule, service, 'availability'))).toBe(false);
  });

  test('refuses an entry that sets neither allDay nor both times', () => {
    const schedule = scheduleWith(availableTime('mon', '09:00:00', '17:00:00'));

    expect(() => setScheduleAvailability(schedule, service, [{ daysOfWeek: ['tue'] }])).toThrow(/must set allDay/);
    expect(() =>
      setScheduleAvailability(schedule, service, [{ daysOfWeek: ['tue'], availableStartTime: '09:00:00' }])
    ).toThrow(/must set allDay/);
    expect(() =>
      setScheduleAvailability(schedule, service, [{ daysOfWeek: ['tue'], availableEndTime: '17:00:00' }])
    ).toThrow(/must set allDay/);

    expect(getEffectiveAvailability(service, schedule)).toEqual([
      { daysOfWeek: ['mon'], availableStartTime: '09:00:00', availableEndTime: '17:00:00' },
    ]);
  });

  test('leaves sibling parameters alone when clearing availability', () => {
    const cleared = clearScheduleParameter(
      scheduleWith(availableTime('mon', '09:00:00', '17:00:00')),
      service,
      'availability'
    );

    expect(hasAvailability(cleared)).toBe(false);
    // The clear is scoped to the availability url, so duration survives it.
    expect(durationOf(cleared)).toEqual({ value: 30, unit: 'min' });
    expect(schedulingParameters(cleared)).toHaveLength(1);
  });
});

describe('schedule parameters', () => {
  // A parameter this module has no typed wrapper for, standing in for the ones to come.
  const bufferBefore: Extension = { url: 'bufferBefore', valueDuration: { value: 10, unit: 'min' } };

  test('sets, reads, and clears a parameter with no wrapper of its own', () => {
    const schedule = scheduleWith(availableTime('mon', '09:00:00', '17:00:00'));
    const before = structuredClone(schedule);

    const updated = setScheduleParameter(schedule, service, bufferBefore);
    expect(schedule).toEqual(before);
    expect(getScheduleParameters(updated, service, 'bufferBefore')).toEqual([bufferBefore]);
    // Setting one parameter leaves the others in place, availability included.
    expect(durationOf(updated)).toEqual({ value: 30, unit: 'min' });
    expect(hasAvailability(updated)).toBe(true);

    const cleared = clearScheduleParameter(updated, service, 'bufferBefore');
    expect(getScheduleParameters(cleared, service, 'bufferBefore')).toEqual([]);
    expect(hasAvailability(cleared)).toBe(true);
  });

  test('replaces a parameter rather than appending a second one', () => {
    const schedule = setScheduleParameter(scheduleWith(), service, bufferBefore);

    const updated = setScheduleParameter(schedule, service, {
      url: 'bufferBefore',
      valueDuration: { value: 20, unit: 'min' },
    });

    expect(getScheduleParameters(updated, service, 'bufferBefore')).toEqual([
      { url: 'bufferBefore', valueDuration: { value: 20, unit: 'min' } },
    ]);
  });

  test('reads a parameter across every matching SchedulingParameters extension', () => {
    const schedule = scheduleWith();
    schedule.extension?.push({
      url: SchedulingParametersURI,
      extension: [{ url: 'service', valueReference: { reference: 'HealthcareService/service-1' } }, bufferBefore],
    });

    expect(getScheduleParameters(schedule, service, 'duration')).toEqual([
      { url: 'duration', valueDuration: { value: 30, unit: 'min' } },
    ]);
    expect(getScheduleParameters(schedule, service, 'bufferBefore')).toEqual([bufferBefore]);
  });

  test('reads nothing for a service the Schedule holds no parameters for', () => {
    const otherService = { ...service, id: 'service-2' } satisfies WithId<HealthcareService>;

    expect(getScheduleParameters(scheduleWith(), otherService, 'duration')).toEqual([]);
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
    expect(getSchedulingTimezone(service, scheduleWith(), actor)).toBe('America/Los_Angeles');
  });

  test('prefers HealthcareService scheduling parameters over actor', () => {
    expect(getSchedulingTimezone(serviceWithTimezone, scheduleWith(), actor)).toBe('America/Chicago');
  });

  test('reads the service alone when there is no Schedule to ask first', () => {
    // Editing a service's own default hours has no calendar in play, and so no
    // actor to fall back to either.
    expect(getSchedulingTimezone(serviceWithTimezone)).toBe('America/Chicago');
    expect(getSchedulingTimezone(service)).toBeUndefined();
  });

  test('prefers Schedule scheduling parameters over service and actor', () => {
    const schedule = scheduleWith();
    schedulingParameters(schedule)[0].extension?.push({
      url: 'timezone',
      valueCode: 'America/New_York',
    });
    expect(getSchedulingTimezone(serviceWithTimezone, schedule, actor)).toBe('America/New_York');
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
    const slot = buildSlot([{ system: 'https://medplum.com/fhir/scheduling-transient-id', value: id, use: 'temp' }]);

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
