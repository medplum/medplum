// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { WithId } from '@medplum/core';
import { createReference, generateId } from '@medplum/core';
import type { HealthcareService, Practitioner, Project, Schedule } from '@medplum/fhirtypes';
import { toCodeableReferenceLike } from '../../../util/servicetype';
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
    const service: WithId<HealthcareService> = {
      resourceType: 'HealthcareService',
      id: 'hs-12345',
    };

    const schedule: Schedule = {
      resourceType: 'Schedule',
      meta: { project: project.id },
      actor: [createReference(practitioner)],
      serviceType: toCodeableReferenceLike(service),
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
          extension: [
            // `duration` is required to have exactly one entry
            { url: 'duration', valueDuration: { unit: 'h', value: 2 } },
            // `service` is required to have exactly one entry
            { url: 'service', valueReference: createReference(service) },
            // `availability` is required to have at least one entry
            {
              url: 'availability',
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

    expect(parseSchedulingParametersExtensions(schedule)).toMatchObject([
      {
        availability: [
          {
            dayOfWeek: ['mon'],
            availableStartTime: '09:00:00',
            availableEndTime: '17:00:00',
          },
        ],
        bufferBefore: 0,
        bufferAfter: 0,
        alignmentInterval: 60,
        alignmentOffset: 0,
        duration: 120,
        service: { reference: 'HealthcareService/hs-12345' },
        timezone: undefined,
      },
    ]);
  });

  test('with all the options', () => {
    const service: WithId<HealthcareService> = {
      resourceType: 'HealthcareService',
      id: 'hs-12345',
    };

    const schedule: Schedule = {
      resourceType: 'Schedule',
      meta: { project: project.id },
      actor: [createReference(practitioner)],
      serviceType: toCodeableReferenceLike(service),
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
          extension: [
            { url: 'alignmentInterval', valueDuration: { unit: 'min', value: 30 } },
            { url: 'alignmentOffset', valueDuration: { unit: 'min', value: 5 } },
            { url: 'bufferAfter', valueDuration: { unit: 'min', value: 15 } },
            { url: 'bufferBefore', valueDuration: { unit: 'min', value: 10 } },
            { url: 'service', valueReference: createReference(service) },
            { url: 'duration', valueDuration: { unit: 'h', value: 2 } },
            { url: 'timezone', valueCode: 'America/Phoenix' },
            {
              url: 'availability',
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
            {
              url: 'availability',
              extension: [
                {
                  url: 'availableTime',
                  extension: [
                    { url: 'daysOfWeek', valueCode: 'tue' },
                    { url: 'daysOfWeek', valueCode: 'thu' },
                    { url: 'availableStartTime', valueTime: '12:00:00' },
                    { url: 'availableEndTime', valueTime: '13:30:00' },
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
          {
            dayOfWeek: ['mon'],
            availableStartTime: '09:00:00',
            availableEndTime: '17:00:00',
          },
          {
            dayOfWeek: ['tue', 'thu'],
            availableStartTime: '12:00:00',
            availableEndTime: '13:30:00',
          },
        ],
        bufferBefore: 10,
        bufferAfter: 15,
        alignmentInterval: 30,
        alignmentOffset: 5,
        duration: 120,
        service: { reference: `HealthcareService/${service.id}` },
        timezone: 'America/Phoenix',
      },
    ]);
  });

  describe('with availability extension', () => {
    const service: WithId<HealthcareService> = {
      resourceType: 'HealthcareService',
      id: 'hs-12345',
    };

    test('basic start/end time pair parses to correct availability', () => {
      const schedule: Schedule = {
        resourceType: 'Schedule',
        meta: { project: project.id },
        actor: [createReference(practitioner)],
        serviceType: toCodeableReferenceLike(service),
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
            extension: [
              { url: 'duration', valueDuration: { unit: 'h', value: 1 } },
              { url: 'service', valueReference: createReference(service) },
              {
                url: 'availability',
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
          availability: [{ dayOfWeek: ['mon', 'wed'], availableStartTime: '09:00:00', availableEndTime: '17:00:00' }],
          duration: 60,
          service: { reference: `HealthcareService/${service.id}` },
        },
      ]);
    });

    test('allDay: true produces full-day availability', () => {
      const hs: WithId<HealthcareService> = {
        resourceType: 'HealthcareService',
        id: 'hs-12345',
        type: [{ coding: [{ code: 'consult', system: 'http://example.com' }] }],
      };

      const schedule: Schedule = {
        resourceType: 'Schedule',
        meta: { project: project.id },
        actor: [createReference(practitioner)],
        serviceType: toCodeableReferenceLike(hs),
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
            extension: [
              { url: 'duration', valueDuration: { unit: 'min', value: 30 } },
              { url: 'service', valueReference: createReference(hs) },
              {
                url: 'availability',
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
          availability: [
            {
              dayOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri'],
              availableStartTime: '00:00:00',
              availableEndTime: '00:00:00',
            },
          ],
        },
      ]);
    });

    test('notAvailableTime is accepted without error and does not affect parsed availability', () => {
      const hs: WithId<HealthcareService> = {
        resourceType: 'HealthcareService',
        id: 'hs-12345',
        type: [{ coding: [{ code: 'consult', system: 'http://example.com' }] }],
      };

      const schedule: Schedule = {
        resourceType: 'Schedule',
        meta: { project: project.id },
        actor: [createReference(practitioner)],
        serviceType: toCodeableReferenceLike(hs),
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
            extension: [
              { url: 'duration', valueDuration: { unit: 'min', value: 30 } },
              { url: 'service', valueReference: createReference(hs) },
              {
                url: 'availability',
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
        { availability: [{ dayOfWeek: ['mon'], availableStartTime: '09:00:00', availableEndTime: '17:00:00' }] },
      ]);
    });

    test('availableTime missing both allDay and start/end is filtered out', () => {
      const hs: WithId<HealthcareService> = {
        resourceType: 'HealthcareService',
        id: 'hs-12345',
        type: [{ coding: [{ code: 'consult', system: 'http://example.com' }] }],
      };

      const schedule: Schedule = {
        resourceType: 'Schedule',
        meta: { project: project.id },
        actor: [createReference(practitioner)],
        serviceType: toCodeableReferenceLike(hs),
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
            extension: [
              { url: 'duration', valueDuration: { unit: 'min', value: 30 } },
              { url: 'service', valueReference: createReference(hs) },
              {
                url: 'availability',
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

    test('"availability" is not allowed in HealthcareService extension', () => {
      const hs: HealthcareService = {
        resourceType: 'HealthcareService',
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
            extension: [
              { url: 'duration', valueDuration: { unit: 'min', value: 30 } },
              {
                url: 'availability',
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
        "Scheduling parameter attribute 'availability' is not allowed on HealthcareService"
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
              extension: [
                {
                  url: 'availableTime',
                  extension: [
                    { url: 'daysOfWeek', valueCode: 'tue' },
                    { url: 'daysOfWeek', valueCode: 'thu' },
                    { url: 'availableStartTime', valueTime: '12:00:00' },
                    { url: 'availableEndTime', valueTime: '13:30:00' },
                  ],
                },
              ],
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
                extension: [
                  {
                    url: 'availableTime',
                    extension: [
                      { url: 'daysOfWeek', valueCode: 'tue' },
                      { url: 'daysOfWeek', valueCode: 'thu' },
                      { url: 'availableStartTime', valueTime: '12:00:00' },
                      { url: 'availableEndTime', valueTime: '13:30:00' },
                    ],
                  },
                ],
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
    const hs: WithId<HealthcareService> = {
      resourceType: 'HealthcareService',
      id: 'hs-12345',
      type: [{ coding: [{ code: 'consult', system: 'http://example.com' }] }],
    };

    const unit = 'm'; // 'm' is "month" which is ambiguous (anywhere from 28 - 31 days)
    const schedule: Schedule = {
      resourceType: 'Schedule',
      meta: { project: project.id },
      actor: [createReference(practitioner)],
      serviceType: toCodeableReferenceLike(hs),
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
          extension: [
            { url: 'duration', valueDuration: { unit, value: 1 } },
            { url: 'service', valueReference: createReference(hs) },
            {
              url: 'availability',
              extension: [
                {
                  url: 'availableTime',
                  extension: [
                    { url: 'daysOfWeek', valueCode: 'tue' },
                    { url: 'daysOfWeek', valueCode: 'thu' },
                    { url: 'availableStartTime', valueTime: '12:00:00' },
                    { url: 'availableEndTime', valueTime: '13:30:00' },
                  ],
                },
              ],
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
        id: 'hs-12345',
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
          service: { reference: `HealthcareService/${hs.id}` },
          availability: [{ dayOfWeek: ['mon', 'tue'], availableStartTime: '09:00:00', availableEndTime: '17:00:00' }],
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
          availability: [
            {
              dayOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri'],
              availableStartTime: '00:00:00',
              availableEndTime: '00:00:00',
            },
          ],
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
        { availability: [{ dayOfWeek: [], availableStartTime: '00:00:00', availableEndTime: '00:00:00' }] },
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
        id: 'hs-123',
        extension: [
          { url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters', extension: [durationExt] },
        ],
      };

      expect(() => parseSchedulingParametersExtensions(hs)).not.toThrow();
      expect(parseSchedulingParametersExtensions(hs)).toMatchObject([
        {
          availability: [],
          service: { reference: 'HealthcareService/hs-123' },
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
            { dayOfWeek: ['mon'], availableStartTime: '09:00:00', availableEndTime: '12:00:00' },
            { dayOfWeek: ['wed'], availableStartTime: '13:00:00', availableEndTime: '17:00:00' },
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
        "Scheduling parameter attribute 'availability' is not allowed on HealthcareService"
      );
    });

    test('"service" is not allowed in HealthcareService extension', () => {
      const hs: HealthcareService = {
        resourceType: 'HealthcareService',
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
            extension: [durationExt, { url: 'service', valueReference: { reference: 'HealthcareService/123' } }],
          },
        ],
      };

      expect(() => parseSchedulingParametersExtensions(hs)).toThrow(
        "Scheduling parameter attribute 'service' is not allowed on HealthcareService"
      );
    });
  });
});

describe('chooseSchedulingParameters', () => {
  const consultType = { coding: [{ system: 'http://example.com', code: 'consult' }] };
  const yogaType = { coding: [{ code: 'yoga' }] };

  // Reusable availability extension for Schedule resources (required on Schedule, not on HealthcareService)
  const mondayAvailability = {
    url: 'availability',
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
  };

  test('returns undefined when neither Schedule nor HealthcareService have the SchedulingParameters extension', () => {
    const service: WithId<HealthcareService> = {
      resourceType: 'HealthcareService',
      type: [consultType],
      id: 'hcs-100',
      availableTime: [{ daysOfWeek: ['mon', 'tue'], availableStartTime: '09:00:00', availableEndTime: '17:00:00' }],
    };

    const schedule: Schedule = {
      resourceType: 'Schedule',
      serviceType: toCodeableReferenceLike(service),
      actor: [{ reference: 'Practitioner/test' }],
    };

    expect(chooseSchedulingParameters(schedule, service)).toEqual(undefined);
  });

  test('returns undefined when the Schedule has no SchedulingParameters matching HealthcareService.type', () => {
    const service1: WithId<HealthcareService> = {
      resourceType: 'HealthcareService',
      type: [consultType],
      id: 'hcs-100',
    };

    const service2: WithId<HealthcareService> = {
      resourceType: 'HealthcareService',
      type: [yogaType],
      id: 'hcs-123',
    };

    // Linked to service1 in serviceType, but only has scheduling parameters set for service2.
    const schedule: Schedule = {
      resourceType: 'Schedule',
      serviceType: toCodeableReferenceLike(service1),
      actor: [{ reference: 'Practitioner/test' }],
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
          extension: [
            { url: 'duration', valueDuration: { unit: 'min', value: 30 } },
            { url: 'service', valueReference: createReference(service2) },
            mondayAvailability,
          ],
        },
      ],
    };

    expect(chooseSchedulingParameters(schedule, service1)).toEqual(undefined);
  });

  test('falls back to HealthcareService when Schedule has no SchedulingParameters extension', () => {
    const service: WithId<HealthcareService> = {
      resourceType: 'HealthcareService',
      type: [consultType],
      id: 'hcs-100',
      availableTime: [{ daysOfWeek: ['mon', 'tue'], availableStartTime: '09:00:00', availableEndTime: '17:00:00' }],
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
          extension: [{ url: 'duration', valueDuration: { unit: 'min', value: 30 } }],
        },
      ],
    };

    const schedule: Schedule = {
      resourceType: 'Schedule',
      serviceType: toCodeableReferenceLike(service),
      actor: [{ reference: 'Practitioner/test' }],
    };

    const result = chooseSchedulingParameters(schedule, service);
    expect(result?.duration).toBe(30);
  });

  test('falls back to HealthcareService when Schedule has no matching parameters', () => {
    // Schedule has two extensions — each points at a different service.
    // We query with a third service that has its own parameters. Neither Schedule
    // extension matches, so chooseSchedulingParameters should fall through to
    // the HealthcareService's own parameters.
    const service1: WithId<HealthcareService> = { resourceType: 'HealthcareService', id: 'hcs-1' };
    const service2: WithId<HealthcareService> = { resourceType: 'HealthcareService', id: 'hcs-2' };
    const targetService: WithId<HealthcareService> = {
      resourceType: 'HealthcareService',
      id: 'hcs-target',
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
          extension: [{ url: 'duration', valueDuration: { unit: 'min', value: 45 } }],
        },
      ],
    };

    const schedule: Schedule = {
      resourceType: 'Schedule',
      actor: [{ reference: 'Practitioner/test' }],
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
          extension: [
            { url: 'duration', valueDuration: { unit: 'min', value: 30 } },
            { url: 'service', valueReference: createReference(service1) },
            mondayAvailability,
          ],
        },
        {
          url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
          extension: [
            { url: 'duration', valueDuration: { unit: 'min', value: 60 } },
            { url: 'service', valueReference: createReference(service2) },
            mondayAvailability,
          ],
        },
      ],
    };

    const result = chooseSchedulingParameters(schedule, targetService);
    expect(result?.duration).toBe(45);
  });

  test('Schedule-specific parameters take priority over HealthcareService', () => {
    const service: WithId<HealthcareService> = {
      resourceType: 'HealthcareService',
      type: [consultType],
      id: 'hcs-100',
      availableTime: [{ daysOfWeek: ['mon', 'tue'], availableStartTime: '09:00:00', availableEndTime: '17:00:00' }],
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
          extension: [{ url: 'duration', valueDuration: { unit: 'min', value: 30 } }],
        },
      ],
    };

    const schedule: Schedule = {
      resourceType: 'Schedule',
      serviceType: toCodeableReferenceLike(service),
      actor: [{ reference: 'Practitioner/test' }],
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
          extension: [
            { url: 'duration', valueDuration: { unit: 'min', value: 60 } },
            mondayAvailability,
            { url: 'service', valueReference: createReference(service) },
          ],
        },
      ],
    };

    // HealthcareService says 30 min — Schedule's 60 min should win
    const result = chooseSchedulingParameters(schedule, service);
    expect(result?.duration).toBe(60);
  });

  test('only the matching Schedule entry is returned when multiple extensions exist', () => {
    const service1: WithId<HealthcareService> = {
      resourceType: 'HealthcareService',
      type: [consultType],
      id: 'hcs-100',
    };

    const service2: WithId<HealthcareService> = {
      resourceType: 'HealthcareService',
      type: [yogaType],
      id: 'hcs-123',
    };

    const schedule: Schedule = {
      resourceType: 'Schedule',
      serviceType: [...toCodeableReferenceLike(service1), ...toCodeableReferenceLike(service2)],
      actor: [{ reference: 'Practitioner/test' }],
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
          extension: [
            { url: 'duration', valueDuration: { unit: 'min', value: 60 } },
            { url: 'service', valueReference: createReference(service1) },
            mondayAvailability,
          ],
        },
        {
          url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
          extension: [
            { url: 'duration', valueDuration: { unit: 'min', value: 45 } },
            { url: 'service', valueReference: createReference(service2) },
            mondayAvailability,
          ],
        },
      ],
    };

    const result = chooseSchedulingParameters(schedule, service1);
    expect(result?.duration).toBe(60);
  });
});
