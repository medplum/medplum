// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Schedule } from '@medplum/fhirtypes';
import { createTestProject } from '../../../test.setup';
import { loadSchedulingParameters } from './scheduling';

describe('Scheduling Utilities', () => {
  // Cycle 2.1: Load Scheduling Parameters Utility
  describe('loadSchedulingParameters', () => {
    test('Extract scheduling-parameters extension from Schedule resource', async () => {
      const { repo } = await createTestProject({ withRepo: true });

      const schedule: Schedule = {
        resourceType: 'Schedule',
        active: true,
        actor: [{ reference: 'Practitioner/test' }],
        extension: [
          {
            url: 'http://medplum.com/fhir/StructureDefinition/scheduling-parameters',
            extension: [
              {
                url: 'availability',
                valueTiming: {
                  repeat: {
                    dayOfWeek: ['mon', 'tue', 'wed'],
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

      const params = await loadSchedulingParameters(schedule, undefined, repo);
      expect(params.availability).toBeDefined();
      expect(params.availability?.repeat?.dayOfWeek).toEqual(['mon', 'tue', 'wed']);
    });

    test('Handle missing extension (return empty params)', async () => {
      const { repo } = await createTestProject({ withRepo: true });

      const schedule: Schedule = {
        resourceType: 'Schedule',
        active: true,
        actor: [{ reference: 'Practitioner/test' }],
      };

      const params = await loadSchedulingParameters(schedule, undefined, repo);
      expect(params).toBeDefined();
      expect(params.availability).toBeUndefined();
    });
  });
});

