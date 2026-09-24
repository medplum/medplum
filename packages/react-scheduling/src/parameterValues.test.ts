// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { HealthcareServiceSchedulingParameterUrl, WithId } from '@medplum/core';
import {
  getHealthcareServiceSchedulingParameters,
  getScheduleSchedulingParameters,
  hasSchedulingParameters,
  SchedulingParametersURI,
} from '@medplum/core';
import type { Extension, HealthcareService, Schedule } from '@medplum/fhirtypes';
import type { SchedulingParameterValues } from './parameterValues';
import {
  getEffectiveSchedulingParameterValues,
  getHealthcareServiceSchedulingParameterValues,
  getScheduleSchedulingParameterValues,
  setHealthcareServiceSchedulingParameterValues,
  setScheduleSchedulingParameterValues,
} from './parameterValues';

const service = {
  resourceType: 'HealthcareService',
  id: 'service-1',
  name: 'Office visit',
} satisfies WithId<HealthcareService>;

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
    parameters: (resource: T, url: HealthcareServiceSchedulingParameterUrl) => Extension[]
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
    (resource) => getHealthcareServiceSchedulingParameterValues(resource),
    (resource, values) => setHealthcareServiceSchedulingParameterValues(resource, values),
    (resource, url) => getHealthcareServiceSchedulingParameters(resource, url)
  );

  describeLevel(
    'schedule',
    (): Schedule => ({ resourceType: 'Schedule', id: 'schedule-1', actor: [{ reference: 'Practitioner/123' }] }),
    (resource) => getScheduleSchedulingParameterValues(resource, visitType),
    (resource, values) => setScheduleSchedulingParameterValues(resource, visitType, values),
    (resource, url) => getScheduleSchedulingParameters(resource, visitType, url)
  );

  test('clearing every parameter on a service drops the container', () => {
    const written = setHealthcareServiceSchedulingParameterValues(visitType, allValues);

    const cleared = setHealthcareServiceSchedulingParameterValues(written, {});

    expect(cleared.extension).toBeUndefined();
    expect(hasSchedulingParameters(cleared)).toBe(false);
  });

  test('a service write omits the service pointer, which the server rejects there', () => {
    const written = setHealthcareServiceSchedulingParameterValues(visitType, allValues);

    const container = written.extension?.find((extension) => extension.url === SchedulingParametersURI);
    expect(container).toBeDefined();
    expect(container?.extension?.map((subextension) => subextension.url)).not.toContain('service');
  });

  test('a schedule write includes the service pointer that scopes the override', () => {
    const schedule: Schedule = {
      resourceType: 'Schedule',
      id: 'schedule-1',
      actor: [{ reference: 'Practitioner/123' }],
    };

    const written = setScheduleSchedulingParameterValues(schedule, visitType, allValues);

    expect(schedulingParameters(written)).toHaveLength(1);
    expect(getScheduleSchedulingParameterValues(written, visitType).duration).toBe(30);
  });

  test('a schedule write leaves another service on the same calendar untouched', () => {
    const other: WithId<HealthcareService> = { resourceType: 'HealthcareService', id: 'service-2', name: 'Follow up' };
    const schedule = setScheduleSchedulingParameterValues(
      { resourceType: 'Schedule', id: 'schedule-1', actor: [{ reference: 'Practitioner/123' }] },
      other,
      { duration: 15, bufferBefore: 2 }
    );

    const written = setScheduleSchedulingParameterValues(schedule, visitType, allValues);

    expect(getScheduleSchedulingParameterValues(written, other)).toMatchObject({ duration: 15, bufferBefore: 2 });
    expect(getScheduleSchedulingParameterValues(written, visitType).duration).toBe(30);
  });
});

describe('getEffectiveSchedulingParameterValues', () => {
  const calendar: Schedule = { resourceType: 'Schedule', id: 'schedule-1', actor: [{ reference: 'Practitioner/123' }] };

  test('a service that sets nothing gets scheduling defaults, with no duration or timezone', () => {
    expect(getEffectiveSchedulingParameterValues(service)).toEqual({
      bufferBefore: 0,
      bufferAfter: 0,
      alignmentInterval: 60,
      alignmentOffset: 0,
      slotCapacity: 1,
      alignmentTimezone: 'Etc/UTC',
    });
  });

  test('a value the service sets beats the default', () => {
    const configured = setHealthcareServiceSchedulingParameterValues(service, { duration: 30, bufferAfter: 10 });

    expect(getEffectiveSchedulingParameterValues(configured)).toMatchObject({
      duration: 30,
      bufferAfter: 10,
      bufferBefore: 0,
    });
  });

  test("a calendar's override beats the service, which beats the default", () => {
    const configured = setHealthcareServiceSchedulingParameterValues(service, { duration: 30, bufferAfter: 10 });
    const overriding = setScheduleSchedulingParameterValues(calendar, configured, { bufferAfter: 20 });

    expect(getEffectiveSchedulingParameterValues(configured, overriding)).toMatchObject({
      duration: 30,
      bufferAfter: 20,
      bufferBefore: 0,
    });
  });

  test("another service's override on the same calendar does not apply", () => {
    const other: WithId<HealthcareService> = { resourceType: 'HealthcareService', id: 'service-2', name: 'Follow up' };
    const overriding = setScheduleSchedulingParameterValues(calendar, other, { bufferAfter: 20 });

    expect(getEffectiveSchedulingParameterValues(service, overriding).bufferAfter).toBe(0);
  });

  test('a legacy zero alignment interval on a calendar still reads as hourly', () => {
    const legacy = setScheduleSchedulingParameterValues(calendar, service, { alignmentInterval: 0 });

    expect(getEffectiveSchedulingParameterValues(service, legacy).alignmentInterval).toBe(60);
  });
});
