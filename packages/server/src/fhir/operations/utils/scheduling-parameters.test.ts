// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { createReference, generateId } from '@medplum/core';
import type { HealthcareService, Practitioner, Project, Schedule } from '@medplum/fhirtypes';
import { toCodeableReferenceLike } from '../../../util/servicetype';
import { withPath } from '../../../util/withpath';
import { getHealthcareServiceSchedulingParameters, getScheduleSchedulingParameters } from './scheduling-parameters';

describe('getHealthcareServiceSchedulingParameters', () => {
  const project = {
    resourceType: 'Project',
    id: generateId(),
  } satisfies Project;

  const baseService = {
    resourceType: 'HealthcareService',
    id: 'hs-12345',
    meta: { project: project.id },
  } satisfies HealthcareService;

  test('with no extension returns default values', () => {
    const service = withPath(baseService, 'Path.HealthcareService');
    expect(getHealthcareServiceSchedulingParameters(service)).toMatchObject({
      availability: [
        {
          dayOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
          availableStartTime: '00:00:00',
          availableEndTime: '00:00:00',
        },
      ],
      bufferBefore: 0,
      bufferAfter: 0,
      alignmentInterval: 60,
      alignmentOffset: 0,
      service: { reference: 'HealthcareService/hs-12345' },
    });
  });

  test('minimally specified extension sets default values', () => {
    const service = withPath(
      {
        ...baseService,
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
            extension: [{ url: 'duration', valueDuration: { unit: 'h', value: 2 } }],
          },
        ],
      },
      'Path.HealthcareService'
    );

    expect(getHealthcareServiceSchedulingParameters(service)).toMatchObject({
      availability: [
        {
          dayOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
          availableStartTime: '00:00:00',
          availableEndTime: '00:00:00',
        },
      ],
      bufferBefore: 0,
      bufferAfter: 0,
      alignmentInterval: 60,
      alignmentOffset: 0,
      duration: 120,
      service: { reference: 'HealthcareService/hs-12345' },
      timezone: undefined,
    });
  });

  test('maximally specified extension sets appropriate values', () => {
    const service = withPath(
      {
        ...baseService,
        availableTime: [
          {
            daysOfWeek: ['mon', 'tue'],
            availableStartTime: '09:00:00',
            availableEndTime: '17:00:00',
          },
          {
            daysOfWeek: ['thu'],
            allDay: true,
          },
        ],
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
            extension: [
              { url: 'duration', valueDuration: { unit: 'h', value: 2 } },
              { url: 'bufferBefore', valueDuration: { unit: 'min', value: 10 } },
              { url: 'bufferAfter', valueDuration: { unit: 'min', value: 20 } },
              { url: 'alignmentInterval', valueDuration: { unit: 'min', value: 30 } },
              { url: 'alignmentOffset', valueDuration: { unit: 'min', value: 15 } },
              { url: 'timezone', valueCode: 'America/Phoenix' },
            ],
          },
        ],
      } satisfies HealthcareService,
      'Path.HealthcareService'
    );

    expect(getHealthcareServiceSchedulingParameters(service)).toMatchObject({
      availability: [
        {
          dayOfWeek: ['mon', 'tue'],
          availableStartTime: '09:00:00',
          availableEndTime: '17:00:00',
        },
        {
          dayOfWeek: ['thu'],
          availableStartTime: '00:00:00',
          availableEndTime: '00:00:00',
        },
      ],
      bufferBefore: 10,
      bufferAfter: 20,
      alignmentInterval: 30,
      alignmentOffset: 15,
      duration: 120,
      service: { reference: 'HealthcareService/hs-12345' },
      timezone: 'America/Phoenix',
    });
  });

  test('"availability" subextension is not allowed', () => {
    const service = withPath(
      {
        ...baseService,
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
            extension: [
              { url: 'duration', valueDuration: { unit: 'h', value: 2 } },
              { url: 'availability', extension: [] },
            ],
          },
        ],
      } satisfies HealthcareService,
      'Path.HealthcareService'
    );
    expect(() => getHealthcareServiceSchedulingParameters(service)).toThrow(
      "Scheduling parameter attribute 'availability' is not allowed on HealthcareService"
    );
  });

  test('"service" subextension is not allowed', () => {
    const service = withPath(
      {
        ...baseService,
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
            extension: [
              { url: 'duration', valueDuration: { unit: 'h', value: 2 } },
              { url: 'service', valueReference: createReference(baseService) },
            ],
          },
        ],
      } satisfies HealthcareService,
      'Path.HealthcareService'
    );
    expect(() => getHealthcareServiceSchedulingParameters(service)).toThrow(
      "Scheduling parameter attribute 'service' is not allowed on HealthcareService"
    );
  });

  test('with an ambiguous duration unit throws', () => {
    const service = withPath(
      {
        ...baseService,
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
            extension: [{ url: 'duration', valueDuration: { unit: 'mo', value: 2 } }],
          },
        ],
      } satisfies HealthcareService,
      'Path.HealthcareService'
    );
    expect(() => getHealthcareServiceSchedulingParameters(service)).toThrow('Got unhandled duration unit "mo"');
  });

  test('ignores invalid availability entries', () => {
    // check missing endTime: entry is dropped
    const serviceWithMissingEnd = withPath(
      {
        ...baseService,
        availableTime: [
          { daysOfWeek: ['mon'], availableStartTime: '09:00:00' },
          { daysOfWeek: ['tue'], availableStartTime: '09:00:00', availableEndTime: '17:00:00' },
        ],
      } satisfies HealthcareService,
      'Path.HealthcareService'
    );
    expect(getHealthcareServiceSchedulingParameters(serviceWithMissingEnd).availability).toMatchObject([
      { dayOfWeek: ['tue'], availableStartTime: '09:00:00', availableEndTime: '17:00:00' },
    ]);

    // check missing startTime: entry is dropped
    const serviceWithMissingStart = withPath(
      {
        ...baseService,
        availableTime: [
          { daysOfWeek: ['mon'], availableEndTime: '17:00:00' },
          { daysOfWeek: ['tue'], availableStartTime: '09:00:00', availableEndTime: '17:00:00' },
        ],
      } satisfies HealthcareService,
      'Path.HealthcareService'
    );
    expect(getHealthcareServiceSchedulingParameters(serviceWithMissingStart).availability).toMatchObject([
      { dayOfWeek: ['tue'], availableStartTime: '09:00:00', availableEndTime: '17:00:00' },
    ]);

    // check missing daysOfWeek: entry is included with empty dayOfWeek
    const serviceWithMissingDays = withPath(
      {
        ...baseService,
        availableTime: [{ availableStartTime: '09:00:00', availableEndTime: '17:00:00' }],
      } satisfies HealthcareService,
      'Path.HealthcareService'
    );
    expect(getHealthcareServiceSchedulingParameters(serviceWithMissingDays).availability).toMatchObject([
      { dayOfWeek: [], availableStartTime: '09:00:00', availableEndTime: '17:00:00' },
    ]);
  });

  test.each(['duration', 'bufferBefore', 'bufferAfter', 'alignmentInterval', 'alignmentOffset'])(
    'Multiple subextensions of url "%s"',
    (attribute) => {
      const service = withPath(
        {
          ...baseService,
          availableTime: [
            {
              daysOfWeek: ['mon', 'tue'],
              availableStartTime: '09:00:00',
              availableEndTime: '17:00:00',
            },
            {
              daysOfWeek: ['thu'],
              allDay: true,
            },
          ],
          extension: [
            {
              url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
              extension: [
                { url: 'duration', valueDuration: { unit: 'h', value: 2 } },
                { url: attribute, valueDuration: { unit: 'min', value: 10 } },
                { url: attribute, valueDuration: { unit: 'min', value: 20 } },
              ],
            },
          ],
        } satisfies HealthcareService,
        'Path.HealthcareService'
      );

      expect(() => getHealthcareServiceSchedulingParameters(service)).toThrow(
        `Scheduling parameter attribute '${attribute}' has too many values`
      );
    }
  );
});

describe('getScheduleSchedulingParameters', () => {
  const project = {
    resourceType: 'Project',
    id: generateId(),
  } satisfies Project;

  const practitioner: Practitioner = {
    resourceType: 'Practitioner',
    id: generateId(),
    meta: { project: project.id },
  };

  const baseService = {
    resourceType: 'HealthcareService',
    id: 'hs-12345',
    meta: { project: project.id },
  } satisfies HealthcareService;

  const baseSchedule = {
    resourceType: 'Schedule',
    actor: [createReference(practitioner)],
    serviceType: toCodeableReferenceLike(baseService),
  } satisfies Schedule;

  test('with no extension', () => {
    const service = withPath(baseService, 'Path.HealthcareService');
    const schedule = withPath(baseSchedule, 'Path.Schedule');
    expect(() => getScheduleSchedulingParameters(schedule, service)).toThrow();
  });

  test('minimally specified extension sets default values', () => {
    const service = withPath(
      {
        ...baseService,
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
            extension: [{ url: 'duration', valueDuration: { unit: 'h', value: 2 } }],
          },
        ],
      },
      'Path.HealthcareService'
    );
    const schedule = withPath(baseSchedule, 'Path.Schedule');

    expect(getScheduleSchedulingParameters(schedule, service)).toMatchObject({
      availability: [
        {
          dayOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
          availableStartTime: '00:00:00',
          availableEndTime: '00:00:00',
        },
      ],
      bufferBefore: 0,
      bufferAfter: 0,
      alignmentInterval: 60,
      alignmentOffset: 0,
      duration: 120,
      service: { reference: 'HealthcareService/hs-12345' },
      timezone: undefined,
    });
  });

  test('maximally specified extension in service gets inherited', () => {
    const service = withPath(
      {
        ...baseService,
        availableTime: [
          {
            daysOfWeek: ['mon', 'tue'],
            availableStartTime: '09:00:00',
            availableEndTime: '17:00:00',
          },
        ],
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
            extension: [
              { url: 'duration', valueDuration: { unit: 'h', value: 2 } },
              { url: 'bufferBefore', valueDuration: { unit: 'min', value: 10 } },
              { url: 'bufferAfter', valueDuration: { unit: 'min', value: 20 } },
              { url: 'alignmentInterval', valueDuration: { unit: 'min', value: 30 } },
              { url: 'alignmentOffset', valueDuration: { unit: 'min', value: 15 } },
              { url: 'timezone', valueCode: 'America/Phoenix' },
            ],
          },
        ],
      } satisfies HealthcareService,
      'Path.HealthcareService'
    );
    const schedule = withPath(baseSchedule, 'Path.Schedule');

    expect(getScheduleSchedulingParameters(schedule, service)).toMatchObject({
      availability: [
        {
          dayOfWeek: ['mon', 'tue'],
          availableStartTime: '09:00:00',
          availableEndTime: '17:00:00',
        },
      ],
      bufferBefore: 10,
      bufferAfter: 20,
      alignmentInterval: 30,
      alignmentOffset: 15,
      duration: 120,
      service: { reference: 'HealthcareService/hs-12345' },
      timezone: 'America/Phoenix',
    });
  });

  test('maximally specified extension in schedule overrides service settings', () => {
    const service = withPath(
      {
        ...baseService,
        availableTime: [
          {
            daysOfWeek: ['mon', 'tue'],
            availableStartTime: '09:00:00',
            availableEndTime: '17:00:00',
          },
        ],
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
            extension: [
              { url: 'duration', valueDuration: { unit: 'h', value: 2 } },
              { url: 'bufferBefore', valueDuration: { unit: 'min', value: 10 } },
              { url: 'bufferAfter', valueDuration: { unit: 'min', value: 20 } },
              { url: 'alignmentInterval', valueDuration: { unit: 'min', value: 30 } },
              { url: 'alignmentOffset', valueDuration: { unit: 'min', value: 15 } },
              { url: 'timezone', valueCode: 'America/Phoenix' },
            ],
          },
        ],
      } satisfies HealthcareService,
      'Path.HealthcareService'
    );
    const schedule = withPath(
      {
        ...baseSchedule,
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
            extension: [
              { url: 'service', valueReference: createReference(service) },
              { url: 'duration', valueDuration: { unit: 'h', value: 3 } },
              { url: 'bufferBefore', valueDuration: { unit: 'min', value: 12 } },
              { url: 'bufferAfter', valueDuration: { unit: 'min', value: 24 } },
              { url: 'alignmentInterval', valueDuration: { unit: 'min', value: 45 } },
              { url: 'alignmentOffset', valueDuration: { unit: 'min', value: 5 } },
              { url: 'timezone', valueCode: 'America/New_York' },
              {
                url: 'availability',
                extension: [
                  {
                    url: 'availableTime',
                    extension: [
                      { url: 'daysOfWeek', valueCode: 'wed' },
                      { url: 'availableStartTime', valueTime: '08:00:00' },
                      { url: 'availableEndTime', valueTime: '16:00:00' },
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
      },
      'Path.Schedule'
    );

    expect(getScheduleSchedulingParameters(schedule, service)).toMatchObject({
      availability: [
        {
          dayOfWeek: ['wed'],
          availableStartTime: '08:00:00',
          availableEndTime: '16:00:00',
        },
        {
          dayOfWeek: ['thu', 'fri'],
          availableStartTime: '00:00:00',
          availableEndTime: '00:00:00',
        },
      ],
      bufferBefore: 12,
      bufferAfter: 24,
      alignmentInterval: 45,
      alignmentOffset: 5,
      duration: 180,
      service: { reference: 'HealthcareService/hs-12345' },
      timezone: 'America/New_York',
    });
  });
});
