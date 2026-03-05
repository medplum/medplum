// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Slot } from '@medplum/fhirtypes';
import type { SchedulingParametersExtension } from '../contexts/SchedulingContext';
import type { AvailabilityByDay } from './scheduling';
import { DayMap, SchedulingTransientIdentifier, extractAvailability, toMinutes } from './scheduling';

const PARAMS_URL = 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters' as const;

function makeParams(
  availabilities: {
    dayOfWeek: ('sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat')[];
    timeOfDay: `${number}:${number}:${number}`[];
    duration: number;
    durationUnit: 'h' | 'min' | 'd' | 'wk';
  }[]
): SchedulingParametersExtension {
  return {
    url: PARAMS_URL,
    extension: availabilities.map((avail) => ({
      url: 'availability' as const,
      valueTiming: { repeat: avail },
    })),
  };
}

describe('toMinutes', () => {
  test.each([
    [1, 'min', 1],
    [30, 'min', 30],
    [1, 'h', 60],
    [8, 'h', 480],
    [1, 'd', 1440],
    [3, 'd', 4320],
    [1, 'wk', 10080],
    [2, 'wk', 20160],
  ])('converts %d %s to %d minutes', (value, unit, expected) => {
    expect(toMinutes(value, unit)).toBe(expected);
  });

  test('throws when value is undefined', () => {
    expect(() => toMinutes(undefined, 'h')).toThrow('Got duration without value');
  });

  test('throws for unrecognized unit', () => {
    expect(() => toMinutes(1, 'sec')).toThrow('Got unhandled unit "sec"');
  });
});

describe('extractAvailability', () => {
  const empty = (): AvailabilityByDay => ({ 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] });

  test('returns empty result when there are no extensions', () => {
    const params: SchedulingParametersExtension = { url: PARAMS_URL, extension: [] };
    expect(extractAvailability(params)).toEqual(empty());
  });

  test('returns empty result when no extensions have url "availability"', () => {
    const params: SchedulingParametersExtension = {
      url: PARAMS_URL,
      extension: [{ url: 'duration', valueDuration: { value: 30, unit: 'min' } }],
    };
    expect(extractAvailability(params)).toEqual(empty());
  });

  test('extracts a simple single-day availability within one day', () => {
    const params = makeParams([{ dayOfWeek: ['mon'], timeOfDay: ['09:00:00'], duration: 8, durationUnit: 'h' }]);
    expect(extractAvailability(params)).toEqual({
      ...empty(),
      [DayMap.mon]: [{ start: 9 * 60, end: 17 * 60 }],
    });
  });

  test('extracts availability covering multiple days', () => {
    const params = makeParams([
      { dayOfWeek: ['mon', 'tue', 'wed'], timeOfDay: ['09:00:00'], duration: 1, durationUnit: 'h' },
    ]);
    expect(extractAvailability(params)).toEqual({
      ...empty(),
      [DayMap.mon]: [{ start: 9 * 60, end: 10 * 60 }],
      [DayMap.tue]: [{ start: 9 * 60, end: 10 * 60 }],
      [DayMap.wed]: [{ start: 9 * 60, end: 10 * 60 }],
    });
  });

  test('collects multiple timeOfDay entries into the same day', () => {
    const params = makeParams([
      { dayOfWeek: ['mon'], timeOfDay: ['09:00:00', '14:00:00'], duration: 1, durationUnit: 'h' },
    ]);
    expect(extractAvailability(params)).toEqual({
      ...empty(),
      [DayMap.mon]: [
        { start: 9 * 60, end: 10 * 60 },
        { start: 14 * 60, end: 15 * 60 },
      ],
    });
  });

  test('splits availability that crosses midnight across two days', () => {
    // Tuesday 9pm for 6 hours spans into Wednesday (21:00 + 6h = 03:00 Wednesday)
    const params = makeParams([{ dayOfWeek: ['tue'], timeOfDay: ['21:00:00'], duration: 6, durationUnit: 'h' }]);
    expect(extractAvailability(params)).toEqual({
      ...empty(),
      [DayMap.tue]: [{ start: 21 * 60, end: 24 * 60 }],
      [DayMap.wed]: [{ start: 0, end: 3 * 60 }],
    });
  });

  test('wraps day-of-week from Saturday to Sunday when crossing midnight', () => {
    // Saturday 11pm for 2 hours spans into Sunday
    const params = makeParams([{ dayOfWeek: ['sat'], timeOfDay: ['23:00:00'], duration: 2, durationUnit: 'h' }]);
    expect(extractAvailability(params)).toEqual({
      ...empty(),
      [DayMap.sat]: [{ start: 23 * 60, end: 24 * 60 }],
      [DayMap.sun]: [{ start: 0, end: 1 * 60 }],
    });
  });

  test('combines results from multiple availability extensions', () => {
    const params: SchedulingParametersExtension = {
      url: PARAMS_URL,
      extension: [
        {
          url: 'availability',
          valueTiming: { repeat: { dayOfWeek: ['mon'], timeOfDay: ['09:00:00'], duration: 1, durationUnit: 'h' } },
        },
        {
          url: 'availability',
          valueTiming: { repeat: { dayOfWeek: ['fri'], timeOfDay: ['14:00:00'], duration: 2, durationUnit: 'h' } },
        },
      ],
    };
    expect(extractAvailability(params)).toEqual({
      ...empty(),
      [DayMap.mon]: [{ start: 9 * 60, end: 10 * 60 }],
      [DayMap.fri]: [{ start: 14 * 60, end: 16 * 60 }],
    });
  });

  test('ignores non-availability extensions', () => {
    const params: SchedulingParametersExtension = {
      url: PARAMS_URL,
      extension: [
        { url: 'duration', valueDuration: { value: 30, unit: 'min' } },
        {
          url: 'availability',
          valueTiming: { repeat: { dayOfWeek: ['mon'], timeOfDay: ['10:00:00'], duration: 30, durationUnit: 'min' } },
        },
        { url: 'bufferBefore', valueDuration: { value: 15, unit: 'min' } },
      ],
    };
    expect(extractAvailability(params)).toEqual({
      ...empty(),
      [DayMap.mon]: [{ start: 10 * 60, end: 10 * 60 + 30 }],
    });
  });
});

describe('SchedulingTransientIdentifier', () => {
  test('set', () => {
    const slot: Slot = {
      resourceType: 'Slot',
      start: '2026-01-15T00:00:00.000Z',
      end: '2026-01-15T00:00:00.000Z',
      schedule: { reference: 'Schedule/12345' },
      status: 'busy',
    };

    SchedulingTransientIdentifier.set(slot);
    expect(slot).toHaveProperty('identifier');
    expect(slot.identifier).toHaveLength(1);
    expect(slot.identifier?.[0]).toHaveProperty('system', 'https://medplum.com/fhir/scheduling-transient-id');
    expect(slot.identifier?.[0]).toHaveProperty('use', 'temp');
    expect(slot.identifier?.[0]).toHaveProperty('value');
    // naive check: does this look like a uuid
    expect(slot.identifier?.[0].value).toMatch(/[-0-9a-f]{36}/);
  });

  test('get on a resource that was not `set` upon returns undefined', () => {
    const slot: Slot = {
      resourceType: 'Slot',
      start: '2026-01-15T00:00:00.000Z',
      end: '2026-01-15T00:00:00.000Z',
      schedule: { reference: 'Schedule/12345' },
      status: 'busy',
    };

    expect(SchedulingTransientIdentifier.get(slot)).toBeUndefined();
  });

  test('get on a resource that was `set` upon returns the ID', () => {
    const id = 'cb103a82-f313-4b22-8918-ed8de4b4143d';
    const slot: Slot = {
      resourceType: 'Slot',
      start: '2026-01-15T00:00:00.000Z',
      end: '2026-01-15T00:00:00.000Z',
      schedule: { reference: 'Schedule/12345' },
      status: 'busy',
      identifier: [
        {
          system: 'https://medplum.com/fhir/scheduling-transient-id',
          value: id,
          use: 'temp',
        },
      ],
    };

    expect(SchedulingTransientIdentifier.get(slot)).toEqual(id);
  });
});
