import { readFileSync } from 'fs';
import {
  ElementValidator,
  InternalTypeSchema,
  SlicingRules,
  loadDataTypes,
  parseStructureDefinition,
  subsetResource,
} from './types';
import { resolve } from 'path';
import { TypedValue } from '../types';
import { Observation, StructureDefinition } from '@medplum/fhirtypes';
import { readJson } from '@medplum/definitions';

describe('FHIR resource and data type representations', () => {
  test('Base resource parsing', () => {
    const sd = JSON.parse(readFileSync(resolve(__dirname, '__test__', 'base-patient.json'), 'utf8'));
    const profile = parseStructureDefinition(sd);

    expect(profile.name).toBe('Patient');
    expect(profile.innerTypes.map((t) => t.name).sort()).toEqual([
      'PatientCommunication',
      'PatientContact',
      'PatientLink',
    ]);
  });

  test('Constraining profile parsing', () => {
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
    expect(profile.fields['status'].binding).toEqual('http://hl7.org/fhir/ValueSet/observation-status|4.0.1');
    expect(profile.fields['code'].pattern).toMatchObject<TypedValue>({
      type: 'CodeableConcept',
      value: {
        coding: [
          {
            code: '85354-9',
            system: 'http://loinc.org',
          },
        ],
      },
    });
    expect(profile.fields['category'].slicing).toMatchObject<SlicingRules>({
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
    expect(profile.fields['component']).toMatchObject<Partial<ElementValidator>>({
      min: 2,
      max: Number.POSITIVE_INFINITY,
    });
    expect(profile.fields['component'].constraints.map((c) => c.key).sort()).toEqual(['ele-1', 'vs-3']);
    expect(profile.fields['component'].slicing).toMatchObject<SlicingRules>({
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
    expect(profile.innerTypes).toHaveLength(2);
    const [refRange, component] = profile.innerTypes;
    expect(refRange).toMatchObject<Partial<InternalTypeSchema>>({
      name: 'ObservationReferenceRange',
      fields: {
        id: expect.objectContaining({}),
        low: expect.objectContaining({}),
        high: expect.objectContaining({}),
      },
    });
    expect(component).toMatchObject<Partial<InternalTypeSchema>>({
      name: 'ObservationComponent',
      fields: {
        id: expect.objectContaining({}),
        code: expect.objectContaining({}),
        'value[x]': expect.objectContaining({}),
      },
    });
    expect([...(profile.summaryProperties as Set<string>)].sort()).toEqual([
      'basedOn',
      'code',
      'component',
      'derivedFrom',
      'effective',
      'encounter',
      'focus',
      'hasMember',
      'id',
      'identifier',
      'implicitRules',
      'issued',
      'meta',
      'partOf',
      'performer',
      'status',
      'subject',
      'value',
    ]);
  });

  test('Nested BackboneElement parsing', () => {
    const sd = JSON.parse(readFileSync(resolve(__dirname, '__test__', 'capability-statement.json'), 'utf8'));
    const profile = parseStructureDefinition(sd);

    expect(profile.innerTypes.map((t) => t.name).sort()).toEqual([
      'CapabilityStatementDocument',
      'CapabilityStatementImplementation',
      'CapabilityStatementMessaging',
      'CapabilityStatementMessagingEndpoint',
      'CapabilityStatementMessagingSupportedMessage',
      'CapabilityStatementRest',
      'CapabilityStatementRestInteraction',
      'CapabilityStatementRestResource',
      'CapabilityStatementRestResourceInteraction',
      'CapabilityStatementRestResourceOperation',
      'CapabilityStatementRestResourceSearchParam',
      'CapabilityStatementRestSecurity',
      'CapabilityStatementSoftware',
    ]);

    const rest = profile.innerTypes.find((t) => t.name === 'CapabilityStatementRest');
    const restProperties = Object.keys(rest?.fields ?? {});
    expect(restProperties.sort()).toEqual([
      'compartment',
      'documentation',
      'extension',
      'id',
      'interaction',
      'mode',
      'modifierExtension',
      'operation',
      'resource',
      'searchParam',
      'security',
    ]);
    expect(rest?.fields['interaction']).toMatchObject<Partial<ElementValidator>>({
      type: [{ code: 'CapabilityStatementRestInteraction', targetProfile: [] }],
    });
    expect(rest?.fields['searchParam']).toMatchObject<Partial<ElementValidator>>({
      type: [{ code: 'CapabilityStatementRestResourceSearchParam', targetProfile: [] }],
    });
    expect(rest?.fields['operation']).toMatchObject<Partial<ElementValidator>>({
      type: [{ code: 'CapabilityStatementRestResourceOperation', targetProfile: [] }],
    });
  });

  test('Base spec profiles', () => {
    const bodyWeightProfile = readFileSync(resolve(__dirname, '__test__/body-weight-profile.json'), 'utf8');
    expect(parseStructureDefinition(JSON.parse(bodyWeightProfile) as StructureDefinition)).toBeDefined();
  });

  test('subsetResource', () => {
    loadDataTypes(readJson('fhir/r4/profiles-resources.json'));
    const observation: Observation = {
      resourceType: 'Observation',
      id: 'example',
      meta: {
        profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-blood-pressure'],
        tag: [{ system: 'http://example.com/foo', code: 'bar' }],
      },
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
          dataAbsentReason: {
            coding: [
              {
                code: '8480-6',
                system: 'http://loinc.org',
              },
            ],
          },
          code: {
            coding: [
              {
                code: '8480-6',
                system: 'http://loinc.org',
              },
            ],
          },
        },
        {
          dataAbsentReason: {
            coding: [
              {
                code: '8480-6',
                system: 'http://loinc.org',
              },
            ],
          },
          code: {
            coding: [
              {
                code: '8462-4',
                system: 'http://loinc.org',
              },
            ],
          },
        },
      ],
    };

    expect(subsetResource(observation, ['subject', 'category'])).toEqual<Partial<Observation>>({
      resourceType: 'Observation',
      id: 'example',
      meta: {
        profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-blood-pressure'],
        tag: [
          { system: 'http://example.com/foo', code: 'bar' },
          { system: 'http://hl7.org/fhir/v3/ObservationValue', code: 'SUBSETTED' },
        ],
      },
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
      subject: {
        reference: 'Patient/example',
      },
    });
  });
});
