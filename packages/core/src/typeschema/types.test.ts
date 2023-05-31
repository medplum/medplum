import { readFileSync } from 'fs';
import { ElementValidator, SlicingRules, parseStructureDefinition } from './types';
import { resolve } from 'path';

describe('FHIR resource and data type representations', () => {
  test('Basic parsing', () => {
    const sd = JSON.parse(readFileSync(resolve(__dirname, '__test__', 'us-core-blood-pressure.json'), 'utf8'));
    const profile = parseStructureDefinition(sd);

    expect(profile.name).toBe('Observation');
    expect(profile.constraints.map((c) => c.key).sort()).toEqual([
      'dom-2',
      'dom-3',
      'dom-4',
      'dom-5',
      'dom-6',
      'obs-6',
      'obs-7',
      'vs-2',
    ]);
    expect(profile.fields['Observation.status'].binding).toEqual(
      'http://hl7.org/fhir/ValueSet/observation-status|4.0.1'
    );
    expect(profile.fields['Observation.category'].slicing).toMatchObject<SlicingRules>({
      discriminator: [
        { type: 'value', path: 'coding.code' },
        { type: 'value', path: 'coding.system' },
      ],
      slices: [
        {
          name: 'VSCat',
          fields: {
            'coding.code': expect.objectContaining({
              fixed: {
                type: 'code',
                value: 'vital-signs',
              },
            }),
            'coding.system': expect.objectContaining({
              fixed: {
                type: 'uri',
                value: 'http://terminology.hl7.org/CodeSystem/observation-category',
              },
            }),
          },
          min: 1,
          max: 1,
        },
      ],
      ordered: false,
    });
    expect(profile.fields['Observation.component']).toMatchObject<Partial<ElementValidator>>({
      min: 2,
      max: Number.POSITIVE_INFINITY,
    });
    expect(profile.fields['Observation.component'].constraints.map((c) => c.key).sort()).toEqual(['ele-1', 'vs-3']);
    expect(profile.fields['Observation.component'].slicing).toMatchObject<SlicingRules>({
      discriminator: [{ type: 'pattern', path: 'code' }],
      slices: [
        {
          name: 'systolic',
          fields: {
            code: expect.objectContaining({
              pattern: {
                type: 'CodeableConcept',
                value: {
                  coding: [
                    {
                      code: '8480-6',
                      system: 'http://loinc.org',
                    },
                  ],
                },
              },
            }),
          },
          min: 1,
          max: 1,
        },
        {
          name: 'diastolic',
          fields: {
            code: expect.objectContaining({
              pattern: {
                type: 'CodeableConcept',
                value: {
                  coding: [
                    {
                      code: '8462-4',
                      system: 'http://loinc.org',
                    },
                  ],
                },
              },
            }),
          },
          min: 1,
          max: 1,
        },
      ],
      ordered: false,
    });
  });
});
