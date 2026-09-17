// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Coding, Extension, HealthcareService, Practitioner, Schedule } from '@medplum/fhirtypes';
import type { SchedulingParameterValues } from './scheduling';
import {
  clearSchedulingParameter,
  extractServiceTypeReferences,
  getSchedulingParameters,
  getSchedulingParameterValues,
  getSchedulingRequirements,
  getSchedulingTimezone,
  hasSchedulingParameters,
  minutesToSchedulingDuration,
  REQUIRES_DIAGNOSIS_CODE,
  REQUIRES_MEDICAL_NECESSITY_CODE,
  REQUIRES_PROCEDURE_CODE,
  SCHEDULING_ELIGIBILITY_SYSTEM,
  schedulingDurationToMinutes,
  SchedulingParametersURI,
  serviceTypeIncludesService,
  setSchedulingParameter,
  setSchedulingParameterValues,
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
// `schedulingParameters` above.
function hasAvailability(schedule: Schedule, serviceId = 'service-1'): boolean {
  return schedulingParameters(schedule, serviceId).some((parameters) =>
    parameters.extension?.some((subextension) => subextension.url === 'availability')
  );
}

describe('schedule parameters', () => {
  // A single `value[x]` parameter, which is the shape these functions are for. `availability` nests instead,
  // and is reached through the typed wrapper in `@medplum/react-scheduling`.
  const bufferBefore: Extension = { url: 'bufferBefore', valueDuration: { value: 10, unit: 'min' } };

  test('sets, reads, and clears a parameter with no wrapper of its own', () => {
    const schedule = scheduleWith(availableTime('mon', '09:00:00', '17:00:00'));
    const before = structuredClone(schedule);

    const updated = setSchedulingParameter(schedule, service, bufferBefore);
    expect(schedule).toEqual(before);
    expect(getSchedulingParameters(updated, service, 'bufferBefore')).toEqual([bufferBefore]);
    // Setting one parameter leaves the others in place, availability included.
    expect(durationOf(updated)).toEqual({ value: 30, unit: 'min' });
    expect(hasAvailability(updated)).toBe(true);

    const cleared = clearSchedulingParameter(updated, service, 'bufferBefore');
    expect(getSchedulingParameters(cleared, service, 'bufferBefore')).toEqual([]);
    expect(hasAvailability(cleared)).toBe(true);
  });

  test('replaces a parameter rather than appending a second one', () => {
    const schedule = setSchedulingParameter(scheduleWith(), service, bufferBefore);

    const updated = setSchedulingParameter(schedule, service, {
      url: 'bufferBefore',
      valueDuration: { value: 20, unit: 'min' },
    });

    expect(getSchedulingParameters(updated, service, 'bufferBefore')).toEqual([
      { url: 'bufferBefore', valueDuration: { value: 20, unit: 'min' } },
    ]);
  });

  test('does not leave a stale value on a second matching parameter extension', () => {
    const schedule = scheduleWith();
    schedule.extension?.push({
      url: SchedulingParametersURI,
      extension: [{ url: 'service', valueReference: { reference: 'HealthcareService/service-1' } }, bufferBefore],
    });

    const updated = setSchedulingParameter(schedule, service, {
      url: 'bufferBefore',
      valueDuration: { value: 20, unit: 'min' },
    });

    expect(getSchedulingParameters(updated, service, 'bufferBefore')).toEqual([
      { url: 'bufferBefore', valueDuration: { value: 20, unit: 'min' } },
    ]);
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
    expect(getSchedulingParameters(schedule, service, 'availability')).toHaveLength(1);

    const updated = setSchedulingParameter(schedule, service, bufferBefore);
    expect(schedulingParameters(updated, 'service-1/_history/2')).toHaveLength(1);
    expect(schedule.extension).toHaveLength(1);
    expect(updated.extension).toHaveLength(1);
    expect(getSchedulingParameters(updated, service, 'bufferBefore')).toEqual([bufferBefore]);
  });

  test('creates service-specific SchedulingParameters when missing', () => {
    const schedule: Schedule = {
      resourceType: 'Schedule',
      actor: [{ reference: 'Practitioner/123' }],
    };

    const updated = setSchedulingParameter(schedule, service, bufferBefore);
    expect(schedulingParameters(updated)).toHaveLength(1);
    expect(getSchedulingParameters(updated, service, 'bufferBefore')).toEqual([bufferBefore]);
  });

  test('leaves sibling parameters and the container in place when clearing one', () => {
    const cleared = clearSchedulingParameter(
      scheduleWith(availableTime('mon', '09:00:00', '17:00:00')),
      service,
      'availability'
    );

    expect(hasAvailability(cleared)).toBe(false);
    // The clear is scoped to the availability url, so duration survives it.
    expect(durationOf(cleared)).toEqual({ value: 30, unit: 'min' });
    expect(schedulingParameters(cleared)).toHaveLength(1);
  });

  test('reads a parameter across every matching SchedulingParameters extension', () => {
    const schedule = scheduleWith();
    schedule.extension?.push({
      url: SchedulingParametersURI,
      extension: [{ url: 'service', valueReference: { reference: 'HealthcareService/service-1' } }, bufferBefore],
    });

    expect(getSchedulingParameters(schedule, service, 'duration')).toEqual([
      { url: 'duration', valueDuration: { value: 30, unit: 'min' } },
    ]);
    expect(getSchedulingParameters(schedule, service, 'bufferBefore')).toEqual([bufferBefore]);
  });

  test('reads nothing for a service the Schedule holds no parameters for', () => {
    const otherService = { ...service, id: 'service-2' } satisfies WithId<HealthcareService>;

    expect(getSchedulingParameters(scheduleWith(), otherService, 'duration')).toEqual([]);
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

describe('schedulingDurationToMinutes', () => {
  test('converts every unit scheduling accepts', () => {
    expect(schedulingDurationToMinutes({ value: 30, unit: 'min' })).toBe(30);
    expect(schedulingDurationToMinutes({ value: 1, unit: 'h' })).toBe(60);
    expect(schedulingDurationToMinutes({ value: 1, unit: 'd' })).toBe(1440);
    expect(schedulingDurationToMinutes({ value: 1, unit: 'wk' })).toBe(10080);
    expect(schedulingDurationToMinutes({ value: 0, unit: 'min' })).toBe(0);
  });

  test('refuses a duration the scheduling operations would refuse', () => {
    // Rejected rather than read as minutes: a unit guessed wrong here and
    // validated there would have the two disagree by hours.
    expect(schedulingDurationToMinutes({ value: 30, unit: 's' })).toBeUndefined();
    expect(schedulingDurationToMinutes({ value: 1, unit: 'mo' })).toBeUndefined();
    // `unit` is what the operations validate; a UCUM code alone is not enough.
    expect(schedulingDurationToMinutes({ value: 1, code: 'h' })).toBeUndefined();
    expect(schedulingDurationToMinutes({ value: 1 })).toBeUndefined();
    expect(schedulingDurationToMinutes({ unit: 'min' })).toBeUndefined();
    expect(schedulingDurationToMinutes({ value: -30, unit: 'min' })).toBeUndefined();
    expect(schedulingDurationToMinutes(undefined)).toBeUndefined();
  });
});

describe('getSchedulingRequirements', () => {
  function withEligibility(...codings: Coding[]): HealthcareService {
    return { ...service, eligibility: codings.map((coding) => ({ code: { coding: [coding] } })) };
  }

  function requirement(code: string): Coding {
    return { system: SCHEDULING_ELIGIBILITY_SYSTEM, code };
  }

  test('Reads each requirement a visit type names', () => {
    expect(getSchedulingRequirements(withEligibility(requirement(REQUIRES_PROCEDURE_CODE)))).toStrictEqual(
      new Set([REQUIRES_PROCEDURE_CODE])
    );
    expect(getSchedulingRequirements(withEligibility(requirement(REQUIRES_DIAGNOSIS_CODE)))).toStrictEqual(
      new Set([REQUIRES_DIAGNOSIS_CODE])
    );
    expect(getSchedulingRequirements(withEligibility(requirement(REQUIRES_MEDICAL_NECESSITY_CODE)))).toStrictEqual(
      new Set([REQUIRES_MEDICAL_NECESSITY_CODE])
    );
  });

  test('Requirements are independent, so a visit type can ask for a subset', () => {
    const service = withEligibility(requirement(REQUIRES_PROCEDURE_CODE), requirement(REQUIRES_DIAGNOSIS_CODE));
    expect(getSchedulingRequirements(service)).toStrictEqual(
      new Set([REQUIRES_PROCEDURE_CODE, REQUIRES_DIAGNOSIS_CODE])
    );
  });

  test('Several requirements under one eligibility entry', () => {
    const eligibility = [
      { code: { coding: [requirement(REQUIRES_PROCEDURE_CODE), requirement(REQUIRES_MEDICAL_NECESSITY_CODE)] } },
    ];
    expect(getSchedulingRequirements({ ...service, eligibility })).toStrictEqual(
      new Set([REQUIRES_PROCEDURE_CODE, REQUIRES_MEDICAL_NECESSITY_CODE])
    );
  });

  test('Visit type with no eligibility requirements asks for nothing', () => {
    expect(getSchedulingRequirements(service)).toStrictEqual(new Set());
  });

  test('Undefined service asks for nothing, so nothing is asked before a visit type is chosen', () => {
    expect(getSchedulingRequirements(undefined)).toStrictEqual(new Set());
  });

  test('Finds the codes among other eligibility requirements', () => {
    const service = withEligibility(requirement('referral-required'), requirement(REQUIRES_DIAGNOSIS_CODE));
    expect(getSchedulingRequirements(service)).toStrictEqual(new Set([REQUIRES_DIAGNOSIS_CODE]));
  });

  test('Another system using the same code does not count', () => {
    const impostor: Coding = { system: 'http://example.com/eligibility', code: REQUIRES_PROCEDURE_CODE };
    expect(getSchedulingRequirements(withEligibility(impostor))).toStrictEqual(new Set());
  });

  test('Eligibility carrying no coding does not throw', () => {
    expect(getSchedulingRequirements({ ...service, eligibility: [{ comment: 'Ask the front desk' }] })).toStrictEqual(
      new Set()
    );
  });

  test('A requirement named twice is held once', () => {
    const service = withEligibility(requirement(REQUIRES_PROCEDURE_CODE), requirement(REQUIRES_PROCEDURE_CODE));
    expect(getSchedulingRequirements(service)).toStrictEqual(new Set([REQUIRES_PROCEDURE_CODE]));
  });
});

describe('service parameters', () => {
  // Typed wider than the shared fixture, whose `satisfies` narrows it to a literal without `extension`.
  const visitType: WithId<HealthcareService> = service;

  const bufferBefore: Extension = { url: 'bufferBefore', valueDuration: { value: 10, unit: 'min' } };
  const duration: Extension = { url: 'duration', valueDuration: { value: 30, unit: 'min' } };

  test('sets, reads, and clears a parameter on a visitType with no extensions at all', () => {
    const before = structuredClone(visitType);

    const updated = setSchedulingParameter(visitType, bufferBefore);
    expect(visitType).toEqual(before);
    expect(getSchedulingParameters(updated, 'bufferBefore')).toEqual([bufferBefore]);
    // The container carries no `service` reference: a service's parameters are about itself.
    expect(updated.extension).toEqual([{ url: SchedulingParametersURI, extension: [bufferBefore] }]);

    const cleared = clearSchedulingParameter(updated, 'bufferBefore');
    expect(getSchedulingParameters(cleared, 'bufferBefore')).toEqual([]);
  });

  test('replaces a parameter rather than appending a second one', () => {
    const configured = setSchedulingParameter(visitType, bufferBefore);

    const updated = setSchedulingParameter(configured, {
      url: 'bufferBefore',
      valueDuration: { value: 20, unit: 'min' },
    });

    expect(getSchedulingParameters(updated, 'bufferBefore')).toEqual([
      { url: 'bufferBefore', valueDuration: { value: 20, unit: 'min' } },
    ]);
  });

  test('leaves the other parameters and unrelated extensions in place', () => {
    const configured: WithId<HealthcareService> = {
      ...visitType,
      extension: [
        { url: 'https://example.com/unrelated', valueString: 'kept' },
        { url: SchedulingParametersURI, extension: [duration] },
      ],
    };

    const updated = setSchedulingParameter(configured, bufferBefore);

    expect(getSchedulingParameters(updated, 'duration')).toEqual([duration]);
    expect(updated.extension?.[0]).toEqual({ url: 'https://example.com/unrelated', valueString: 'kept' });
  });

  test('does not leave a stale value on a second parameters extension', () => {
    const configured: WithId<HealthcareService> = {
      ...visitType,
      extension: [
        { url: SchedulingParametersURI, extension: [bufferBefore] },
        {
          url: SchedulingParametersURI,
          extension: [{ url: 'bufferBefore', valueDuration: { value: 99, unit: 'min' } }],
        },
      ],
    };

    const updated = setSchedulingParameter(configured, {
      url: 'bufferBefore',
      valueDuration: { value: 20, unit: 'min' },
    });

    expect(getSchedulingParameters(updated, 'bufferBefore')).toEqual([
      { url: 'bufferBefore', valueDuration: { value: 20, unit: 'min' } },
    ]);
  });

  test('drops a parameters extension left holding nothing, and the extension array with it', () => {
    const configured = setSchedulingParameter(visitType, bufferBefore);

    const cleared = clearSchedulingParameter(configured, 'bufferBefore');

    // An empty container would violate ext-1 and leave hasSchedulingParameters reporting it as configured.
    expect(cleared.extension).toBeUndefined();
    expect(hasSchedulingParameters(cleared)).toBe(false);
  });

  test('keeps the parameters extension while other parameters remain', () => {
    const configured = setSchedulingParameter(setSchedulingParameter(visitType, duration), bufferBefore);

    const cleared = clearSchedulingParameter(configured, 'bufferBefore');

    expect(getSchedulingParameters(cleared, 'duration')).toEqual([duration]);
    expect(hasSchedulingParameters(cleared)).toBe(true);
  });

  test('keeps unrelated extensions when the parameters extension is dropped', () => {
    const configured = setSchedulingParameter(
      { ...visitType, extension: [{ url: 'https://example.com/unrelated', valueString: 'kept' }] },
      bufferBefore
    );

    const cleared = clearSchedulingParameter(configured, 'bufferBefore');

    expect(cleared.extension).toEqual([{ url: 'https://example.com/unrelated', valueString: 'kept' }]);
  });

  test('clearing a parameter that was never set is a no-op', () => {
    const configured = setSchedulingParameter(visitType, duration);

    expect(clearSchedulingParameter(configured, 'bufferBefore')).toEqual(configured);
    expect(clearSchedulingParameter(visitType, 'bufferBefore')).toEqual(visitType);
  });

  test('reads every copy of a parameter that repeats', () => {
    const configured: WithId<HealthcareService> = {
      ...visitType,
      extension: [{ url: SchedulingParametersURI, extension: [duration, bufferBefore] }],
    };

    expect(getSchedulingParameters(configured, 'duration')).toEqual([duration]);
    expect(getSchedulingParameters(configured, 'missing')).toEqual([]);
  });
});

describe('minutesToSchedulingDuration', () => {
  test('always emits minutes, never a tidier unit', () => {
    expect(minutesToSchedulingDuration(60)).toEqual({ value: 60, unit: 'min' });
    expect(minutesToSchedulingDuration(1440)).toEqual({ value: 1440, unit: 'min' });
  });

  test.each([0, 1, 30, 60, 1440])('round trips %i through schedulingDurationToMinutes', (minutes) => {
    expect(schedulingDurationToMinutes(minutesToSchedulingDuration(minutes))).toBe(minutes);
  });
});

describe('flat scheduling parameters', () => {
  const visitType: WithId<HealthcareService> = service;

  const allValues: SchedulingParameterValues = {
    duration: 30,
    bufferBefore: 5,
    bufferAfter: 10,
    alignmentInterval: 15,
    alignmentOffset: 5,
    slotCapacity: 2,
    timezone: 'America/New_York',
    alignmentTimezone: 'America/Chicago',
  };

  // Both levels encode the flat parameters identically, so every case runs against each. Generic rather
  // than a describe.each table, which would erase both resource types to a union the assertions cannot call.
  function describeLevel<T extends Schedule | WithId<HealthcareService>>(
    name: string,
    empty: () => T,
    read: (resource: T) => SchedulingParameterValues,
    write: (resource: T, values: SchedulingParameterValues) => T,
    parameters: (resource: T, url: string) => Extension[]
  ): void {
    describe(`on a ${name}`, () => {
      test('round trips every parameter', () => {
        const written = write(empty(), allValues);
        expect(read(written)).toEqual(allValues);
      });

      test('reads a parameter this level does not set as undefined', () => {
        expect(read(empty())).toEqual({
          duration: undefined,
          bufferBefore: undefined,
          bufferAfter: undefined,
          alignmentInterval: undefined,
          alignmentOffset: undefined,
          slotCapacity: undefined,
          timezone: undefined,
          alignmentTimezone: undefined,
        });
      });

      test('writes durations in minutes, capacity as a positiveInt, and timezones as codes', () => {
        const written = write(empty(), allValues);

        expect(parameters(written, 'bufferBefore')).toEqual([
          { url: 'bufferBefore', valueDuration: { value: 5, unit: 'min' } },
        ]);
        expect(parameters(written, 'slotCapacity')).toEqual([{ url: 'slotCapacity', valuePositiveInt: 2 }]);
        expect(parameters(written, 'timezone')).toEqual([{ url: 'timezone', valueCode: 'America/New_York' }]);
      });

      test('an unset value emits no sub-extension at all, rather than a zero', () => {
        const written = write(empty(), { duration: 30 });

        expect(parameters(written, 'bufferBefore')).toEqual([]);
        expect(read(written).bufferBefore).toBeUndefined();
      });

      test('a key set to undefined clears an existing parameter', () => {
        const written = write(empty(), allValues);

        const cleared = write(written, { ...allValues, bufferBefore: undefined });

        expect(parameters(cleared, 'bufferBefore')).toEqual([]);
        expect(read(cleared).bufferAfter).toBe(10);
      });

      test('a key left out entirely clears it too, since the values are the whole state', () => {
        const written = write(empty(), allValues);

        const cleared = write(written, { duration: 30 });

        expect(read(cleared)).toEqual({
          duration: 30,
          bufferBefore: undefined,
          bufferAfter: undefined,
          alignmentInterval: undefined,
          alignmentOffset: undefined,
          slotCapacity: undefined,
          timezone: undefined,
          alignmentTimezone: undefined,
        });
      });

      test('does not mutate the resource it was given', () => {
        const original = write(empty(), allValues);
        const before = structuredClone(original);

        write(original, { duration: 45 });

        expect(original).toEqual(before);
      });

      test.each([
        ['h', { value: 2, unit: 'h' }, 120],
        ['d', { value: 1, unit: 'd' }, 1440],
        ['wk', { value: 1, unit: 'wk' }, 10080],
      ])('reads a duration stored in %s as minutes', (_unit, stored, minutes) => {
        const written = write(empty(), { duration: 1 });
        parameters(written, 'duration')[0].valueDuration = stored;

        expect(read(written).duration).toBe(minutes);
      });

      test.each([
        ['a unit scheduling does not accept', { value: 30, unit: 's' }],
        ['a negative value', { value: -30, unit: 'min' }],
        ['code without unit, which scheduling does not read', { value: 30, code: 'min' }],
      ])('reads %s as undefined rather than as a number', (_case, stored) => {
        const written = write(empty(), { duration: 1 });
        parameters(written, 'duration')[0].valueDuration = stored;

        expect(read(written).duration).toBeUndefined();
      });

      test('reads a stored alignmentInterval of zero as hourly', () => {
        const written = write(empty(), { alignmentInterval: 15 });
        parameters(written, 'alignmentInterval')[0].valueDuration = { value: 0, unit: 'min' };

        expect(read(written).alignmentInterval).toBe(60);
      });

      test('leaves availability alone', () => {
        const withAvailability = write(empty(), { duration: 30 });
        const container = (withAvailability.extension as Extension[]).find(
          (extension: Extension) => extension.url === SchedulingParametersURI
        ) as Extension;
        container.extension = [...(container.extension ?? []), { url: 'availability', extension: [] }];

        const written = write(withAvailability, { duration: 45 });

        const updated = (written.extension as Extension[]).find(
          (extension: Extension) => extension.url === SchedulingParametersURI
        ) as Extension;
        expect(updated.extension?.some((subextension) => subextension.url === 'availability')).toBe(true);
      });
    });
  }

  describeLevel(
    'service',
    () => visitType,
    (resource) => getSchedulingParameterValues(resource),
    (resource, values) => setSchedulingParameterValues(resource, values),
    (resource, url) => getSchedulingParameters(resource, url)
  );

  describeLevel(
    'schedule',
    (): Schedule => ({ resourceType: 'Schedule', id: 'schedule-1', actor: [{ reference: 'Practitioner/123' }] }),
    (resource) => getSchedulingParameterValues(resource, visitType),
    (resource, values) => setSchedulingParameterValues(resource, visitType, values),
    (resource, url) => getSchedulingParameters(resource, visitType, url)
  );

  test('clearing every parameter on a service drops the container', () => {
    const written = setSchedulingParameterValues(visitType, allValues);

    const cleared = setSchedulingParameterValues(written, {});

    expect(cleared.extension).toBeUndefined();
    expect(hasSchedulingParameters(cleared)).toBe(false);
  });

  test('a service write never emits the service reference scheduling rejects on it', () => {
    const written = setSchedulingParameterValues(visitType, allValues);

    expect(getSchedulingParameters(written, 'service')).toEqual([]);
  });

  test('a schedule write keeps the service reference naming what it configures', () => {
    const schedule: Schedule = {
      resourceType: 'Schedule',
      id: 'schedule-1',
      actor: [{ reference: 'Practitioner/123' }],
    };

    const written = setSchedulingParameterValues(schedule, visitType, allValues);

    expect(schedulingParameters(written)).toHaveLength(1);
    expect(getSchedulingParameterValues(written, visitType).duration).toBe(30);
  });

  test('a schedule write leaves another service on the same calendar untouched', () => {
    const other: WithId<HealthcareService> = { resourceType: 'HealthcareService', id: 'service-2', name: 'Follow up' };
    const schedule = setSchedulingParameterValues(
      { resourceType: 'Schedule', id: 'schedule-1', actor: [{ reference: 'Practitioner/123' }] },
      other,
      { duration: 15, bufferBefore: 2 }
    );

    const written = setSchedulingParameterValues(schedule, visitType, allValues);

    expect(getSchedulingParameterValues(written, other)).toMatchObject({ duration: 15, bufferBefore: 2 });
    expect(getSchedulingParameterValues(written, visitType).duration).toBe(30);
  });
});
