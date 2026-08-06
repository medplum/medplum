// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { OperationOutcomeError, WithId } from '@medplum/core';
import { clearScheduleParameter, SchedulingParametersURI } from '@medplum/core';
import type { Extension, HealthcareService, OperationOutcome, Schedule } from '@medplum/fhirtypes';
import { getEffectiveAvailability, setScheduleAvailability } from './availability';

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
 * the core lookup, so assertions about what was written do not depend on the code that wrote it.
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
// `schedulingParameters` above. There is no wrapper for this: the question is one line through
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

  // Scheduling configuration is intricate enough that hours resolved from an ambiguous entry are harder to
  // track down than a read that fails outright, so a repeated single-valued sub-extension is refused rather
  // than settled by taking the first. `daysOfWeek` is the one that repeats by design.
  test.each([
    { url: 'allDay', value: { valueBoolean: true } },
    { url: 'availableStartTime', value: { valueTime: '09:00:00' } },
    { url: 'availableEndTime', value: { valueTime: '17:00:00' } },
  ])('refuses a repeated $url', ({ url, value }) => {
    const entry: Extension = {
      url: 'availableTime',
      extension: [
        { url: 'daysOfWeek', valueCode: 'mon' },
        { url, ...value },
        { url, ...value },
      ],
    };

    expect(() => getEffectiveAvailability(service, scheduleWith(entry))).toThrow(
      new RegExp(`at most one ${url}, found 2`)
    );
  });

  test('reads repeated daysOfWeek as the set of days it is', () => {
    const entry = availableTime('mon', '09:00:00', '12:00:00');
    entry.extension?.push({ url: 'daysOfWeek', valueCode: 'tue' });

    expect(getEffectiveAvailability(service, scheduleWith(entry))).toEqual([
      { daysOfWeek: ['mon', 'tue'], availableStartTime: '09:00:00', availableEndTime: '12:00:00' },
    ]);
  });

  test('reports a repeat on the branch it does not read from', () => {
    // An all-day entry never reads the times, but a repeat among them still leaves the entry ambiguous.
    const entry = allDayTime('sat');
    entry.extension?.push({ url: 'availableEndTime', valueTime: '17:00:00' });
    entry.extension?.push({ url: 'availableEndTime', valueTime: '18:00:00' });

    expect(() => getEffectiveAvailability(service, scheduleWith(entry))).toThrow(/at most one availableEndTime/);
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

describe('setScheduleAvailability', () => {
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

  test('reports what is missing as a required-value validation issue', () => {
    let outcome: OperationOutcome | undefined;
    try {
      setScheduleAvailability(scheduleWith(), service, []);
    } catch (err) {
      outcome = (err as OperationOutcomeError).outcome;
    }

    expect(outcome?.issue?.[0]).toMatchObject({ severity: 'error', code: 'required' });
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
});
