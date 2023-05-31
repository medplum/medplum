import { Bundle, Observation, StructureDefinition } from '@medplum/fhirtypes';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { validateResource } from './validation';
import { indexStructureDefinitionBundle } from '../types';
import { readJson } from '@medplum/definitions';
import { loadDataTypes } from './types';

describe('FHIR resource validation', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-medplum.json') as Bundle);
    loadDataTypes(readJson('fhir/r4/profiles-types.json') as Bundle<StructureDefinition>);
  });

  test('Basic validation', () => {
    const profile = JSON.parse(readFileSync(resolve(__dirname, '__test__', 'us-core-blood-pressure.json'), 'utf8'));
    const observation: Observation = {
      resourceType: 'Observation',
      status: 'final',
      category: [
        {
          coding: [
            {
              code: 'vital-signs',
              system: 'http://terminology.hl7.org/CodeSystem/observation-category',
            },
          ],
        },
      ],
      code: {
        coding: [
          {
            code: '85354-9',
            system: 'http://loinc.org',
          },
        ],
      },
      subject: {
        reference: 'Patient/example',
      },
      effectiveDateTime: '2023-05-31T17:03:45-07:00',
      component: [
        {
          code: {
            coding: [
              {
                code: '8480-6',
                system: 'http://loinc.org',
              },
            ],
          },
        },
      ],
    };

    expect(() => {
      validateResource(observation, profile);
    }).not.toThrow();
  });
});
