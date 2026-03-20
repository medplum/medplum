// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { createReference, generateId } from '@medplum/core';
import type { HealthcareService, Practitioner, Project, Schedule } from '@medplum/fhirtypes';
import { chooseSchedulingParameters, parseSchedulingParametersExtensions } from './scheduling-parameters';

describe('parseSchedulingParametersExtensions', () => {
  const project: Project = {
    resourceType: 'Project',
    id: generateId(),
  };

  const practitioner: Practitioner = {
    resourceType: 'Practitioner',
    id: generateId(),
    meta: { project: project.id },
  };

  test('minimally specified extension sets default values', () => {
    const schedule: Schedule = {
      resourceType: 'Schedule',
      meta: { project: project.id },
      actor: [createReference(practitioner)],
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
          extension: [
            // duration is required to have exactly one entry
            { url: 'duration', valueDuration: { unit: 'h', value: 2 } },
            // availability is required to have at least one entry
            {
              url: 'availability',
              valueTiming: {
                repeat: {
                  dayOfWeek: ['mon'],
                  timeOfDay: ['09:00:00'],
                  duration: 8,
                  durationUnit: 'h',
                },
              },
            },
          ],
        },
      ],
    };

    expect(parseSchedulingParametersExtensions(schedule)).toMatchObject([
      {
        availability: [
          {
            dayOfWeek: ['mon'],
            timeOfDay: ['09:00:00'],
            duration: 480,
          },
        ],
        bufferBefore: 0,
        bufferAfter: 0,
        alignmentInterval: 60,
        alignmentOffset: 0,
        duration: 120,
        serviceType: [],
        timezone: undefined,
      },
    ]);
  });

  test('with all the options', () => {
    const schedule: Schedule = {
      resourceType: 'Schedule',
      meta: { project: project.id },
      actor: [createReference(practitioner)],
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
          extension: [
            { url: 'alignmentInterval', valueDuration: { unit: 'min', value: 30 } },
            { url: 'alignmentOffset', valueDuration: { unit: 'min', value: 5 } },
            { url: 'bufferAfter', valueDuration: { unit: 'min', value: 15 } },
            { url: 'bufferBefore', valueDuration: { unit: 'min', value: 10 } },
            {
              url: 'serviceType',
              valueCodeableConcept: { coding: [{ code: 'new-patient', system: 'http://example.com' }] },
            },
            {
              url: 'serviceType',
              valueCodeableConcept: { coding: [{ code: 'office-visit', system: 'http://example.com' }] },
            },
            { url: 'duration', valueDuration: { unit: 'h', value: 2 } },
            { url: 'timezone', valueCode: 'America/Phoenix' },
            {
              url: 'availability',
              valueTiming: {
                repeat: {
                  dayOfWeek: ['mon'],
                  timeOfDay: ['09:00:00'],
                  duration: 8,
                  durationUnit: 'h',
                },
              },
            },
            {
              url: 'availability',
              valueTiming: {
                repeat: {
                  dayOfWeek: ['tue', 'thu'],
                  timeOfDay: ['12:00:00'],
                  duration: 90,
                  durationUnit: 'min',
                },
              },
            },
          ],
        },
      ],
    };

    expect(parseSchedulingParametersExtensions(schedule)).toMatchObject([
      {
        availability: [
          {
            dayOfWeek: ['mon'],
            timeOfDay: ['09:00:00'],
            duration: 480,
          },
          {
            dayOfWeek: ['tue', 'thu'],
            timeOfDay: ['12:00:00'],
            duration: 90,
          },
        ],
        bufferBefore: 10,
        bufferAfter: 15,
        alignmentInterval: 30,
        alignmentOffset: 5,
        duration: 120,
        serviceType: [
          { coding: [{ code: 'new-patient', system: 'http://example.com' }] },
          { coding: [{ code: 'office-visit', system: 'http://example.com' }] },
        ],
        timezone: 'America/Phoenix',
      },
    ]);
  });

  describe('with availability.r4 extension', () => {
    test('basic start/end time pair parses to correct availability', () => {
      const schedule: Schedule = {
        resourceType: 'Schedule',
        meta: { project: project.id },
        actor: [createReference(practitioner)],
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
            extension: [
              { url: 'duration', valueDuration: { unit: 'h', value: 1 } },
              {
                url: 'availability.r4',
                extension: [
                  {
                    url: 'availableTime',
                    extension: [
                      { url: 'daysOfWeek', valueCode: 'mon' },
                      { url: 'daysOfWeek', valueCode: 'wed' },
                      { url: 'availableStartTime', valueTime: '09:00:00' },
                      { url: 'availableEndTime', valueTime: '17:00:00' },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      expect(parseSchedulingParametersExtensions(schedule)).toMatchObject([
        {
          availability: [{ dayOfWeek: ['mon', 'wed'], timeOfDay: ['09:00:00'], duration: 480 }],
          duration: 60,
        },
      ]);
    });

    test('allDay: true produces full-day availability', () => {
      const schedule: Schedule = {
        resourceType: 'Schedule',
        meta: { project: project.id },
        actor: [createReference(practitioner)],
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
            extension: [
              { url: 'duration', valueDuration: { unit: 'min', value: 30 } },
              {
                url: 'availability.r4',
                extension: [
                  {
                    url: 'availableTime',
                    extension: [
                      { url: 'daysOfWeek', valueCode: 'mon' },
                      { url: 'daysOfWeek', valueCode: 'tue' },
                      { url: 'daysOfWeek', valueCode: 'wed' },
                      { url: 'daysOfWeek', valueCode: 'thu' },
                      { url: 'daysOfWeek', valueCode: 'fri' },
                      { url: 'allDay', valueBoolean: true },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      expect(parseSchedulingParametersExtensions(schedule)).toMatchObject([
        {
          availability: [{ dayOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri'], timeOfDay: ['00:00:00'], duration: 1440 }],
        },
      ]);
    });

    test('notAvailableTime is accepted without error and does not affect parsed availability', () => {
      const schedule: Schedule = {
        resourceType: 'Schedule',
        meta: { project: project.id },
        actor: [createReference(practitioner)],
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
            extension: [
              { url: 'duration', valueDuration: { unit: 'min', value: 30 } },
              {
                url: 'availability.r4',
                extension: [
                  {
                    url: 'availableTime',
                    extension: [
                      { url: 'daysOfWeek', valueCode: 'mon' },
                      { url: 'availableStartTime', valueTime: '09:00:00' },
                      { url: 'availableEndTime', valueTime: '17:00:00' },
                    ],
                  },
                  {
                    url: 'notAvailableTime',
                    extension: [
                      { url: 'description', valueString: 'Holiday closure' },
                      { url: 'during', valuePeriod: { start: '2025-12-25', end: '2025-12-26' } },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      expect(() => parseSchedulingParametersExtensions(schedule)).not.toThrow();
      expect(parseSchedulingParametersExtensions(schedule)).toMatchObject([
        { availability: [{ dayOfWeek: ['mon'], timeOfDay: ['09:00:00'], duration: 480 }] },
      ]);
    });

    test('availableTime missing both allDay and start/end is filtered out', () => {
      const schedule: Schedule = {
        resourceType: 'Schedule',
        meta: { project: project.id },
        actor: [createReference(practitioner)],
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
            extension: [
              { url: 'duration', valueDuration: { unit: 'min', value: 30 } },
              {
                url: 'availability.r4',
                extension: [
                  {
                    url: 'availableTime',
                    extension: [{ url: 'daysOfWeek', valueCode: 'mon' }],
                  },
                ],
              },
            ],
          },
        ],
      };

      // Filtered out, so availability is empty — but does not throw
      expect(() => parseSchedulingParametersExtensions(schedule)).not.toThrow();
      expect(parseSchedulingParametersExtensions(schedule)).toMatchObject([{ availability: [] }]);
    });

    test('availability.r4 and availability (Timing) both contribute windows', () => {
      const schedule: Schedule = {
        resourceType: 'Schedule',
        meta: { project: project.id },
        actor: [createReference(practitioner)],
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
            extension: [
              { url: 'duration', valueDuration: { unit: 'min', value: 30 } },
              {
                url: 'availability',
                valueTiming: {
                  repeat: { dayOfWeek: ['mon'], timeOfDay: ['09:00:00'], duration: 8, durationUnit: 'h' },
                },
              },
              {
                url: 'availability.r4',
                extension: [
                  {
                    url: 'availableTime',
                    extension: [
                      { url: 'daysOfWeek', valueCode: 'fri' },
                      { url: 'availableStartTime', valueTime: '13:00:00' },
                      { url: 'availableEndTime', valueTime: '17:00:00' },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      expect(parseSchedulingParametersExtensions(schedule)).toMatchObject([
        {
          availability: [
            { dayOfWeek: ['mon'], timeOfDay: ['09:00:00'], duration: 480 },
            { dayOfWeek: ['fri'], timeOfDay: ['13:00:00'], duration: 240 },
          ],
        },
      ]);
    });

    test('"availability.r4" is not allowed in HealthcareService extension', () => {
      const hs: HealthcareService = {
        resourceType: 'HealthcareService',
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
            extension: [
              { url: 'duration', valueDuration: { unit: 'min', value: 30 } },
              {
                url: 'availability.r4',
                extension: [
                  {
                    url: 'availableTime',
                    extension: [
                      { url: 'daysOfWeek', valueCode: 'mon' },
                      { url: 'availableStartTime', valueTime: '09:00:00' },
                      { url: 'availableEndTime', valueTime: '17:00:00' },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      expect(() => parseSchedulingParametersExtensions(hs)).toThrow(
        "Scheduling parameter attribute 'availability.r4' is not allowed on HealthcareService"
      );
    });
  });

  test('missing required availability', () => {
    const schedule: Schedule = {
      resourceType: 'Schedule',
      meta: { project: project.id },
      actor: [createReference(practitioner)],
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
          extension: [{ url: 'duration', valueDuration: { unit: 'h', value: 2 } }],
        },
      ],
    };

    expect(() => parseSchedulingParametersExtensions(schedule)).toThrow(
      "Required scheduling parameter attribute 'availability' is missing"
    );
  });

  test('missing required duration', () => {
    const schedule: Schedule = {
      resourceType: 'Schedule',
      meta: { project: project.id },
      actor: [createReference(practitioner)],
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
          extension: [
            {
              url: 'availability',
              valueTiming: {
                repeat: {
                  dayOfWeek: ['tue', 'thu'],
                  timeOfDay: ['12:00:00'],
                  duration: 90,
                  durationUnit: 'min',
                },
              },
            },
          ],
        },
      ],
    };

    expect(() => parseSchedulingParametersExtensions(schedule)).toThrow(
      "Required scheduling parameter attribute 'duration' is missing"
    );
  });

  test.each(['duration', 'bufferBefore', 'bufferAfter', 'alignmentInterval', 'alignmentOffset'])(
    'Multiple extension parameters of type "%s"',
    (attribute) => {
      const schedule: Schedule = {
        resourceType: 'Schedule',
        meta: { project: project.id },
        actor: [createReference(practitioner)],
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
            extension: [
              { url: attribute, valueDuration: { unit: 'min', value: 10 } },
              { url: attribute, valueDuration: { unit: 'min', value: 10 } },
              { url: 'duration', valueDuration: { unit: 'h', value: 2 } },
              {
                url: 'availability',
                valueTiming: {
                  repeat: {
                    dayOfWeek: ['tue', 'thu'],
                    timeOfDay: ['12:00:00'],
                    duration: 90,
                    durationUnit: 'min',
                  },
                },
              },
            ],
          },
        ],
      };

      expect(() => parseSchedulingParametersExtensions(schedule)).toThrow(
        `Scheduling parameter attribute '${attribute}' has too many values`
      );
    }
  );

  test('with an ambiguous duration unit', () => {
    const unit = 'm'; // 'm' is "month" which is ambiguous (anywhere from 28 - 31 days)
    const schedule: Schedule = {
      resourceType: 'Schedule',
      meta: { project: project.id },
      actor: [createReference(practitioner)],
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
          extension: [
            { url: 'duration', valueDuration: { unit, value: 1 } },
            {
              url: 'availability',
              valueTiming: {
                repeat: {
                  dayOfWeek: ['tue', 'thu'],
                  timeOfDay: ['12:00:00'],
                  duration: 90,
                  durationUnit: 'min',
                },
              },
            },
          ],
        },
      ],
    };

    expect(() => parseSchedulingParametersExtensions(schedule)).toThrow(`Got unhandled unit "m"`);
  });

  describe('for a HealthcareService', () => {
    const durationExt = { url: 'duration', valueDuration: { unit: 'min' as const, value: 30 } };

    test('derives serviceType from HealthcareService.type and availability from availableTime', () => {
      const hs: HealthcareService = {
        resourceType: 'HealthcareService',
        type: [{ coding: [{ code: 'consult', system: 'http://example.com' }] }],
        availableTime: [{ daysOfWeek: ['mon', 'tue'], availableStartTime: '09:00:00', availableEndTime: '17:00:00' }],
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
            extension: [durationExt],
          },
        ],
      };

      expect(parseSchedulingParametersExtensions(hs)).toMatchObject([
        {
          serviceType: [{ coding: [{ code: 'consult', system: 'http://example.com' }] }],
          availability: [{ dayOfWeek: ['mon', 'tue'], timeOfDay: ['09:00:00'], duration: 480 }],
          duration: 30,
          bufferBefore: 0,
          bufferAfter: 0,
          alignmentInterval: 60,
          alignmentOffset: 0,
        },
      ]);
    });

    test('allDay: true produces full-day availability', () => {
      const hs: HealthcareService = {
        resourceType: 'HealthcareService',
        availableTime: [{ daysOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri'], allDay: true }],
        extension: [
          { url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters', extension: [durationExt] },
        ],
      };

      expect(parseSchedulingParametersExtensions(hs)).toMatchObject([
        {
          availability: [{ dayOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri'], timeOfDay: ['00:00:00'], duration: 1440 }],
        },
      ]);
    });

    test('allDay: true with no daysOfWeek defaults dayOfWeek to []', () => {
      const hs: HealthcareService = {
        resourceType: 'HealthcareService',
        availableTime: [{ allDay: true }],
        extension: [
          { url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters', extension: [durationExt] },
        ],
      };

      expect(parseSchedulingParametersExtensions(hs)).toMatchObject([
        { availability: [{ dayOfWeek: [], timeOfDay: ['00:00:00'], duration: 1440 }] },
      ]);
    });

    test('availableTime with only startTime (no endTime) is filtered out', () => {
      const hs: HealthcareService = {
        resourceType: 'HealthcareService',
        availableTime: [{ daysOfWeek: ['mon'], availableStartTime: '09:00:00' }],
        extension: [
          { url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters', extension: [durationExt] },
        ],
      };

      expect(parseSchedulingParametersExtensions(hs)).toMatchObject([{ availability: [] }]);
    });

    test('availableTime with neither allDay nor start+end is filtered out', () => {
      const hs: HealthcareService = {
        resourceType: 'HealthcareService',
        availableTime: [{ daysOfWeek: ['mon'] }],
        extension: [
          { url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters', extension: [durationExt] },
        ],
      };

      expect(parseSchedulingParametersExtensions(hs)).toMatchObject([{ availability: [] }]);
    });

    test('availability is not required on HealthcareService', () => {
      // No availableTime on resource, no availability in extension — should not throw
      const hs: HealthcareService = {
        resourceType: 'HealthcareService',
        extension: [
          { url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters', extension: [durationExt] },
        ],
      };

      expect(() => parseSchedulingParametersExtensions(hs)).not.toThrow();
      expect(parseSchedulingParametersExtensions(hs)).toMatchObject([
        {
          availability: [],
          serviceType: [],
          duration: 30,
        },
      ]);
    });

    test('multiple availableTime entries all contribute to availability', () => {
      const hs: HealthcareService = {
        resourceType: 'HealthcareService',
        availableTime: [
          { daysOfWeek: ['mon'], availableStartTime: '09:00:00', availableEndTime: '12:00:00' },
          { daysOfWeek: ['wed'], availableStartTime: '13:00:00', availableEndTime: '17:00:00' },
        ],
        extension: [
          { url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters', extension: [durationExt] },
        ],
      };

      expect(parseSchedulingParametersExtensions(hs)).toMatchObject([
        {
          availability: [
            { dayOfWeek: ['mon'], timeOfDay: ['09:00:00'], duration: 180 },
            { dayOfWeek: ['wed'], timeOfDay: ['13:00:00'], duration: 240 },
          ],
        },
      ]);
    });

    test('"availability" is not allowed in HealthcareService extension', () => {
      const hs: HealthcareService = {
        resourceType: 'HealthcareService',
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
            extension: [
              durationExt,
              {
                url: 'availability',
                valueTiming: {
                  repeat: {
                    dayOfWeek: ['mon'],
                    timeOfDay: ['09:00:00'],
                    duration: 8,
                    durationUnit: 'h',
                  },
                },
              },
            ],
          },
        ],
      };

      expect(() => parseSchedulingParametersExtensions(hs)).toThrow(
        "Scheduling parameter attribute 'availability' is not allowed on HealthcareService"
      );
    });

    test('"serviceType" is not allowed in HealthcareService extension', () => {
      const hs: HealthcareService = {
        resourceType: 'HealthcareService',
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
            extension: [durationExt, { url: 'serviceType', valueCodeableConcept: {} }],
          },
        ],
      };

      expect(() => parseSchedulingParametersExtensions(hs)).toThrow(
        "Scheduling parameter attribute 'serviceType' is not allowed on HealthcareService"
      );
    });
  });
});

describe('chooseSchedulingParameters', () => {
  const consultType = { coding: [{ system: 'http://example.com', code: 'consult' }] };
  const consultToken = 'http://example.com|consult';

  // Reusable availability extension for Schedule resources (required on Schedule, not on HealthcareService)
  const mondayAvailability = {
    url: 'availability',
    valueTiming: {
      repeat: {
        dayOfWeek: ['mon' as const],
        timeOfDay: ['09:00:00' as const],
        duration: 8,
        durationUnit: 'h' as const,
      },
    },
  };

  function makeSchedule(extensions?: Schedule['extension']): Schedule {
    return {
      resourceType: 'Schedule',
      actor: [{ reference: 'Practitioner/test' }],
      extension: extensions,
    };
  }

  function makeHealthcareService(duration: number): HealthcareService {
    return {
      resourceType: 'HealthcareService',
      type: [consultType],
      availableTime: [{ daysOfWeek: ['mon', 'tue'], availableStartTime: '09:00:00', availableEndTime: '17:00:00' }],
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
          extension: [{ url: 'duration', valueDuration: { unit: 'min', value: duration } }],
        },
      ],
    };
  }

  test('returns [] when neither Schedule nor HealthcareService match the token', () => {
    expect(chooseSchedulingParameters(makeSchedule(), [], ['http://example.com|no-match'])).toEqual([]);
  });

  test('returns [] when no service type tokens are given', () => {
    expect(chooseSchedulingParameters(makeSchedule(), [makeHealthcareService(30)], [])).toEqual([]);
  });

  test('falls back to HealthcareService when Schedule has no matching parameters', () => {
    const result = chooseSchedulingParameters(makeSchedule(), [makeHealthcareService(30)], [consultToken]);

    expect(result).toHaveLength(1);
    expect(result[0][0].duration).toBe(30);
    expect(result[0][1]).toMatchObject(consultType);
  });

  test('Schedule-specific parameters take priority over HealthcareService', () => {
    const schedule = makeSchedule([
      {
        url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
        extension: [
          { url: 'duration', valueDuration: { unit: 'min', value: 60 } },
          mondayAvailability,
          { url: 'serviceType', valueCodeableConcept: consultType },
        ],
      },
    ]);
    // HealthcareService says 30 min — Schedule's 60 min should win
    const result = chooseSchedulingParameters(schedule, [makeHealthcareService(30)], [consultToken]);

    expect(result).toHaveLength(1);
    expect(result[0][0].duration).toBe(60);
  });

  test('multiple HealthcareServices each contribute when they match the token', () => {
    const result = chooseSchedulingParameters(
      makeSchedule(),
      [makeHealthcareService(30), makeHealthcareService(60)],
      [consultToken]
    );

    expect(result).toHaveLength(2);
    expect(result.map((r) => r[0].duration)).toEqual(expect.arrayContaining([30, 60]));
  });

  test('only the matching Schedule entry is returned when multiple extensions exist', () => {
    const yogaType = { coding: [{ system: 'http://example.com', code: 'yoga' }] };
    const schedule = makeSchedule([
      {
        url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
        extension: [
          { url: 'duration', valueDuration: { unit: 'min', value: 60 } },
          mondayAvailability,
          { url: 'serviceType', valueCodeableConcept: consultType },
        ],
      },
      {
        url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
        extension: [
          { url: 'duration', valueDuration: { unit: 'min', value: 45 } },
          mondayAvailability,
          { url: 'serviceType', valueCodeableConcept: yogaType },
        ],
      },
    ]);

    const result = chooseSchedulingParameters(schedule, [], [consultToken]);

    expect(result).toHaveLength(1);
    expect(result[0][0].duration).toBe(60);
    expect(result[0][1]).toMatchObject(consultType);
  });
});
