// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { createReference, generateId } from '@medplum/core';
import type { Practitioner, Project, Schedule } from '@medplum/fhirtypes';
import { parseSchedulingParametersExtensions } from './scheduling-parameters';

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
          url: 'http://medplum.com/fhir/StructureDefinition/scheduling-parameters',
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
        serviceTypes: [],
        wildcard: true,
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
          url: 'http://medplum.com/fhir/StructureDefinition/scheduling-parameters',
          extension: [
            { url: 'alignmentInterval', valueDuration: { unit: 'min', value: 30 } },
            { url: 'alignmentOffset', valueDuration: { unit: 'min', value: 5 } },
            { url: 'bufferAfter', valueDuration: { unit: 'min', value: 15 } },
            { url: 'bufferBefore', valueDuration: { unit: 'min', value: 10 } },
            { url: 'serviceType', valueCoding: { code: 'new-patient' } },
            { url: 'serviceType', valueCoding: { code: 'office-visit' } },
            { url: 'duration', valueDuration: { unit: 'h', value: 2 } },
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
        serviceTypes: ['new-patient', 'office-visit'],
        wildcard: false,
      },
    ]);
  });
});
