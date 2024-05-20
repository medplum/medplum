import { readJson } from '@medplum/definitions';
import { Bundle, Observation, StructureDefinition } from '@medplum/fhirtypes';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { LOINC } from '../constants';
import { TypedValue } from '../types';
import {
  InternalSchemaElement,
  InternalTypeSchema,
  SlicingRules,
  getDataType,
  indexStructureDefinitionBundle,
  isProfileLoaded,
  parseStructureDefinition,
  subsetResource,
  tryGetDataType,
  tryGetProfile,
} from './types';

describe('FHIR resource and data type representations', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
  });

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

    expect(profile.name).toBe('USCoreBloodPressureProfile');
    expect(profile.constraints?.map((c) => c.key).sort()).toEqual([
      'dom-2',
      'dom-3',
      'dom-4',
      'dom-5',
      'dom-6',
      'obs-6',
      'obs-7',
      'vs-2',
    ]);
    expect(profile.elements['status'].binding?.valueSet).toEqual(
      'http://hl7.org/fhir/ValueSet/observation-status|4.0.1'
    );
    expect(profile.elements['code'].pattern).toMatchObject<TypedValue>({
      type: 'CodeableConcept',
      value: {
        coding: [
          {
            code: '85354-9',
            system: LOINC,
          },
        ],
      },
    });
    expect(profile.elements['category'].slicing).toMatchObject<SlicingRules>({
      discriminator: [
        { type: 'value', path: 'coding.code' },
        { type: 'value', path: 'coding.system' },
      ],
      slices: [
        {
          name: 'VSCat',
          path: 'Observation.category',
          elements: {
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
          description: 'A code that classifies the general type of observation being made.',
          type: [{ code: 'CodeableConcept' }],
        },
      ],
      ordered: false,
    });
    expect(profile.elements['component']).toMatchObject<Partial<InternalSchemaElement>>({
      min: 2,
      max: Number.POSITIVE_INFINITY,
    });
    expect(profile.elements['component'].constraints?.map((c) => c.key).sort()).toEqual(['ele-1', 'vs-3']);
    expect(profile.elements['component'].slicing).toMatchObject<SlicingRules>({
      discriminator: [{ type: 'pattern', path: 'code' }],
      slices: [
        {
          name: 'systolic',
          path: 'Observation.component',
          elements: {
            code: expect.objectContaining({
              pattern: {
                type: 'CodeableConcept',
                value: {
                  coding: [
                    {
                      code: '8480-6',
                      system: LOINC,
                    },
                  ],
                },
              },
            }),
          },
          min: 1,
          max: 1,
          description: 'Used when reporting component observation such as systolic and diastolic blood pressure.',
          type: [{ code: 'ObservationComponent' }],
        },
        {
          name: 'diastolic',
          path: 'Observation.component',
          elements: {
            code: expect.objectContaining({
              pattern: {
                type: 'CodeableConcept',
                value: {
                  coding: [
                    {
                      code: '8462-4',
                      system: LOINC,
                    },
                  ],
                },
              },
            }),
          },
          min: 1,
          max: 1,
          description: 'Used when reporting component observation such as systolic and diastolic blood pressure.',
          type: [{ code: 'ObservationComponent' }],
        },
      ],
      ordered: false,
    });
    expect(profile.innerTypes).toHaveLength(2);
    const [refRange, component] = profile.innerTypes;
    expect(refRange).toMatchObject<Partial<InternalTypeSchema>>({
      name: 'ObservationReferenceRange',
      elements: {
        id: expect.objectContaining({}),
        low: expect.objectContaining({}),
        high: expect.objectContaining({}),
      },
    });
    expect(component).toMatchObject<Partial<InternalTypeSchema>>({
      name: 'ObservationComponent',
      elements: {
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

    // http://hl7.org/fhir/StructureDefinition/structuredefinition-fhir-type
    // 'http://hl7.org/fhirpath/System.String' transformed into 'id'
    expect(profile.elements['id'].type[0].code).toEqual('id');
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
    const restProperties = Object.keys(rest?.elements ?? {});
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
    expect(rest?.elements['interaction']).toMatchObject<Partial<InternalSchemaElement>>({
      type: [{ code: 'CapabilityStatementRestInteraction' }],
    });
    expect(rest?.elements['searchParam']).toMatchObject<Partial<InternalSchemaElement>>({
      type: [{ code: 'CapabilityStatementRestResourceSearchParam' }],
    });
    expect(rest?.elements['operation']).toMatchObject<Partial<InternalSchemaElement>>({
      type: [{ code: 'CapabilityStatementRestResourceOperation' }],
    });
  });

  test('Base spec profiles', () => {
    const bodyWeightProfile = readFileSync(resolve(__dirname, '__test__/body-weight-profile.json'), 'utf8');
    expect(parseStructureDefinition(JSON.parse(bodyWeightProfile) as StructureDefinition)).toBeDefined();
  });

  test('subsetResource', () => {
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
            system: LOINC,
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
                system: LOINC,
              },
            ],
          },
          code: {
            coding: [
              {
                code: '8480-6',
                system: LOINC,
              },
            ],
          },
        },
        {
          dataAbsentReason: {
            coding: [
              {
                code: '8480-6',
                system: LOINC,
              },
            ],
          },
          code: {
            coding: [
              {
                code: '8462-4',
                system: LOINC,
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

  test('Deeply nested content reference', () => {
    // Make sure we can handle contentReference more than 2 layers down
    const structureMapGroupRuleType = getDataType('StructureMapGroupRule');
    expect(structureMapGroupRuleType).toBeDefined();
    expect(structureMapGroupRuleType.elements['rule']).toBeDefined();
  });

  test('Indexing structure definitions related to a profile', () => {
    const profileUrl = 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-blood-pressure';
    const profileName = 'USCoreBloodPressureProfile';

    expect(isProfileLoaded(profileUrl)).toBe(false);
    expect(tryGetProfile(profileUrl)).toBeUndefined();
    expect(tryGetDataType(profileName)).toBeUndefined();
    expect(tryGetDataType(profileName, profileUrl)).toBeUndefined();

    const sd = JSON.parse(readFileSync(resolve(__dirname, '__test__', 'us-core-blood-pressure.json'), 'utf8'));
    expect(sd.url).toEqual(profileUrl);
    expect(sd.name).toEqual(profileName);
    indexStructureDefinitionBundle([sd], profileUrl);

    expect(isProfileLoaded(profileUrl)).toBe(true);
    expect(tryGetProfile(profileUrl)).toBeDefined();
    expect(tryGetDataType(profileName)).toBeUndefined(); // expect undefined since profileUrl argument not provided
    expect(tryGetDataType(profileName, profileUrl)).toBeDefined();
  });
});
