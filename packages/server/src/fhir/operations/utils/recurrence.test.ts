// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { OccurrenceChangedExtensionURI, RecurrenceIdExtensionURI } from '@medplum/core';
import type { Appointment, Extension } from '@medplum/fhirtypes';
import { getPath, withPath } from '../../../util/withpath';
import {
  expandWeeklySeries,
  markOccurrenceChanged,
  projectWeeksForward,
  readWeeklyTemplate,
  weekProjector,
  weeklyTemplate,
} from './recurrence';

// US DST begins at 2am on Sunday 2026-03-08.
describe('projectWeeksForward', () => {
  test('keeps the wall-clock time across a DST transition', () => {
    // 9am EST, then 9am EDT.
    expect(projectWeeksForward(new Date('2026-03-01T14:00:00Z'), 1, 'America/New_York')).toEqual(
      new Date('2026-03-08T13:00:00Z')
    );
  });

  test('is undefined when the wall-clock time falls in a DST gap', () => {
    // 2:15am EST; 2:15am doesn't exist on 2026-03-08.
    expect(projectWeeksForward(new Date('2026-03-01T07:15:00Z'), 1, 'America/New_York')).toBeUndefined();
    // Past the gap, the same wall-clock time exists again.
    expect(projectWeeksForward(new Date('2026-03-01T07:15:00Z'), 2, 'America/New_York')).toEqual(
      new Date('2026-03-15T06:15:00Z')
    );
  });
});

describe('weekProjector', () => {
  // Every 5 minutes, from a week before a transition to a week after.
  function anchorsAround(transition: string): Date[] {
    const start = Date.parse(transition) - 7 * 24 * 60 * 60 * 1000;
    return Array.from({ length: (14 * 24 * 60) / 5 }, (_, idx) => new Date(start + idx * 5 * 60 * 1000));
  }

  test.each([
    // US spring forward and fall back
    ['America/New_York', '2026-03-08T07:00:00Z'],
    ['America/New_York', '2026-11-01T06:00:00Z'],
    // A 30-minute DST shift
    ['Australia/Lord_Howe', '2026-04-04T15:00:00Z'],
    // Transitions at midnight, so some days start at 1am
    ['America/Havana', '2026-03-08T05:00:00Z'],
    // A 2-hour DST shift
    ['Antarctica/Troll', '2026-03-29T01:00:00Z'],
  ])('matches projectWeeksForward in %s around %s', (timezone, transition) => {
    const anchors = anchorsAround(transition);
    for (const weeksForward of [1, 2]) {
      const expected = anchors.map((anchor) => projectWeeksForward(anchor, weeksForward, timezone));
      expect(anchors.map(weekProjector(weeksForward, timezone))).toEqual(expected);
      // Out of order, too, if more slowly.
      const project = weekProjector(weeksForward, timezone);
      expect(anchors.toReversed().map((anchor) => project(anchor))).toEqual(expected.toReversed());
    }
  });
});

describe('readWeeklyTemplate', () => {
  // Monday 2026-03-09, 9am in New York.
  const start = '2026-03-09T13:00:00.000Z';

  function read(template: Extension | undefined): ReturnType<typeof readWeeklyTemplate> {
    const appointment: Appointment = {
      resourceType: 'Appointment',
      status: 'proposed',
      participant: [],
      extension: [{ url: 'http://example.com/other', valueString: 'kept' }, ...(template ? [template] : [])],
    };
    return readWeeklyTemplate(withPath(appointment, 'Parameters.appointment'));
  }

  // The template `weeklyTemplate` builds, with one element replaced (or removed, if undefined).
  function withElement(url: string, element: Extension | undefined, inside?: 'weeklyTemplate'): Extension {
    const template = weeklyTemplate(start, 3, 'America/New_York');
    const replace = (elements: Extension[] = []): Extension[] => [
      ...elements.filter((e) => e.url !== url),
      ...(element ? [element] : []),
    ];
    return {
      ...template,
      extension: inside
        ? template.extension?.map((e) => (e.url === inside ? { ...e, extension: replace(e.extension) } : e))
        : replace(template.extension),
    };
  }

  test('reads the template weeklyTemplate builds', () => {
    const template = read(weeklyTemplate(start, 3, 'America/New_York'));
    expect(template).toMatchObject({ occurrenceCount: 3, weekday: 'monday', timezone: 'America/New_York' });
    expect(template && getPath(template)).toBe('Parameters.appointment.extension[1]');
  });

  test('is undefined for an Appointment without a template', () => {
    expect(read(undefined)).toBeUndefined();
  });

  test.each<[string, Extension]>([
    ['an excludingDate', withElement('excludingDate', { url: 'excludingDate', valueDate: '2026-03-16' })],
    ['a repeated element', withElement('extra', { url: 'occurrenceCount', valuePositiveInt: 3 })],
    ['a missing timezone', withElement('timezone', undefined)],
    [
      'a timezone that is not IANA',
      withElement('timezone', {
        url: 'timezone',
        valueCodeableConcept: { coding: [{ system: 'https://www.iana.org/time-zones', code: 'Mars/Olympus_Mons' }] },
      }),
    ],
    [
      'a recurrence that is not weekly',
      withElement('recurrenceType', {
        url: 'recurrenceType',
        valueCodeableConcept: { coding: [{ system: 'http://unitsofmeasure.org', code: 'mo' }] },
      }),
    ],
    ['a single occurrence', withElement('occurrenceCount', { url: 'occurrenceCount', valuePositiveInt: 1 })],
    ['too many occurrences', withElement('occurrenceCount', { url: 'occurrenceCount', valuePositiveInt: 7 })],
    ['a missing weeklyTemplate', withElement('weeklyTemplate', undefined)],
    [
      'a fortnightly series',
      withElement('weekInterval', { url: 'weekInterval', valuePositiveInt: 2 }, 'weeklyTemplate'),
    ],
    ['two weekdays', withElement('friday', { url: 'friday', valueBoolean: true }, 'weeklyTemplate')],
    ['no weekday', withElement('monday', { url: 'monday', valueBoolean: false }, 'weeklyTemplate')],
    [
      'an unknown weekly element',
      withElement('everyOtherDay', { url: 'everyOtherDay', valueBoolean: true }, 'weeklyTemplate'),
    ],
  ])('refuses %s', (_, template) => {
    expect(() => read(template)).toThrow('Unsupported recurrenceTemplate');
  });

  test('refuses two templates', () => {
    const template = weeklyTemplate(start, 3, 'America/New_York');
    const appointment: Appointment = {
      resourceType: 'Appointment',
      status: 'proposed',
      participant: [],
      extension: [template, template],
    };
    expect(() => readWeeklyTemplate(withPath(appointment, 'Parameters.appointment'))).toThrow(
      'Unsupported recurrenceTemplate: an Appointment may carry only one'
    );
  });

  test("points at the template's extension", () => {
    expect(() => read(withElement('occurrenceCount', undefined))).toThrow(
      expect.objectContaining({
        outcome: expect.objectContaining({
          issue: [expect.objectContaining({ expression: ['Parameters.appointment.extension[1]'] })],
        }),
      })
    );
  });
});

describe('expandWeeklySeries', () => {
  function occurrence(start: string, end: string, bufferBefore?: string): Appointment {
    return {
      resourceType: 'Appointment',
      status: 'proposed',
      start,
      end,
      participant: [],
      contained: [
        { resourceType: 'Slot', status: 'busy', schedule: { reference: 'Schedule/s' }, start, end },
        ...(bufferBefore
          ? [
              {
                resourceType: 'Slot' as const,
                status: 'busy-unavailable' as const,
                schedule: { reference: 'Schedule/s' },
                start: bufferBefore,
                end: start,
              },
            ]
          : []),
      ],
    };
  }

  function expand(first: Appointment, occurrenceCount: number): Appointment[] {
    const pathed = withPath(
      { ...first, extension: [weeklyTemplate(first.start as string, occurrenceCount, 'America/New_York')] },
      'Parameters.appointment'
    );
    const template = readWeeklyTemplate(pathed);
    if (!template) {
      throw new Error('expected a template');
    }
    return expandWeeklySeries(pathed, template);
  }

  test('keeps local time week to week, and every Slot its offset from the start', () => {
    // 9am EST with a 15 minute buffer before, then the same local times in EDT.
    const [first, second] = expand(
      occurrence('2026-03-02T14:00:00.000Z', '2026-03-02T15:00:00.000Z', '2026-03-02T13:45:00.000Z'),
      2
    );
    expect(first.start).toBe('2026-03-02T14:00:00.000Z');
    expect(second).toMatchObject({
      start: '2026-03-09T13:00:00.000Z',
      end: '2026-03-09T14:00:00.000Z',
      contained: [
        { status: 'busy', start: '2026-03-09T13:00:00.000Z', end: '2026-03-09T14:00:00.000Z' },
        { status: 'busy-unavailable', start: '2026-03-09T12:45:00.000Z', end: '2026-03-09T13:00:00.000Z' },
      ],
    });
  });

  test('proposes as many occurrences as the template says, in order', () => {
    const occurrences = expand(occurrence('2026-03-09T13:00:00.000Z', '2026-03-09T14:00:00.000Z'), 3);
    expect(occurrences.map((o) => o.start)).toEqual([
      '2026-03-09T13:00:00.000Z',
      '2026-03-16T13:00:00.000Z',
      '2026-03-23T13:00:00.000Z',
    ]);
  });

  test("refuses a series whose local time doesn't exist in a later week", () => {
    // 2:15am EST on Sunday 2026-03-01; 2:15am doesn't exist on 2026-03-08.
    expect(() => expand(occurrence('2026-03-01T07:15:00.000Z', '2026-03-01T08:15:00.000Z'), 2)).toThrow(
      "Occurrence 2 of the series falls at a local time that doesn't exist in America/New_York"
    );
  });

  test('refuses a series without a start', () => {
    const template = withPath(
      { occurrenceCount: 2, weekday: 'monday' as const, timezone: 'America/New_York' },
      'Parameters.appointment.extension[0]'
    );
    const first = withPath(
      { ...occurrence('2026-03-09T13:00:00.000Z', '2026-03-09T14:00:00.000Z'), start: undefined },
      'Parameters.appointment'
    );
    expect(() => expandWeeklySeries(first, template)).toThrow('A recurring series must have a start');
  });
});

describe('markOccurrenceChanged', () => {
  const occurrence: Appointment = {
    resourceType: 'Appointment',
    status: 'booked',
    participant: [],
    extension: [{ url: RecurrenceIdExtensionURI, valuePositiveInt: 2 }],
  };

  test('flags an occurrence of a series only once, however often it moves', () => {
    const marked = markOccurrenceChanged(markOccurrenceChanged(occurrence));
    expect(marked.extension).toStrictEqual([
      { url: RecurrenceIdExtensionURI, valuePositiveInt: 2 },
      { url: OccurrenceChangedExtensionURI, valueBoolean: true },
    ]);
  });

  test('leaves an Appointment in no series unchanged', () => {
    const standalone: Appointment = { resourceType: 'Appointment', status: 'booked', participant: [] };
    expect(markOccurrenceChanged(standalone)).toBe(standalone);
  });
});
