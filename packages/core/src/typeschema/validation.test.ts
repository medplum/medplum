import { readJson } from '@medplum/definitions';
import {
  Account,
  Address,
  Appointment,
  AppointmentParticipant,
  Binary,
  Bundle,
  CarePlan,
  CodeSystem,
  Condition,
  Consent,
  DiagnosticReport,
  DocumentReference,
  ElementDefinition,
  Encounter,
  Extension,
  HumanName,
  ImplementationGuide,
  Media,
  MedicationRequest,
  Observation,
  ObservationComponent,
  Patient,
  Questionnaire,
  QuestionnaireItem,
  Resource,
  StructureDefinition,
  StructureDefinitionSnapshot,
  SubstanceProtein,
  ValueSet,
} from '@medplum/fhirtypes';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { HTTP_HL7_ORG, LOINC, RXNORM, SNOMED, UCUM } from '../constants';
import { ContentType } from '../contenttype';
import { OperationOutcomeError } from '../outcomes';
import { createReference, deepClone } from '../utils';
import { indexStructureDefinitionBundle } from './types';
import { validateResource, validateTypedValue } from './validation';

describe('FHIR resource validation', () => {
  let typesBundle: Bundle;
  let resourcesBundle: Bundle;
  let medplumBundle: Bundle;
  let observationProfile: StructureDefinition;
  let patientProfile: StructureDefinition;

  beforeAll(() => {
    console.log = jest.fn();

    typesBundle = readJson('fhir/r4/profiles-types.json') as Bundle;
    resourcesBundle = readJson('fhir/r4/profiles-resources.json') as Bundle;
    medplumBundle = readJson('fhir/r4/profiles-medplum.json') as Bundle;

    indexStructureDefinitionBundle(typesBundle);
    indexStructureDefinitionBundle(resourcesBundle);
    indexStructureDefinitionBundle(medplumBundle);

    observationProfile = JSON.parse(
      readFileSync(resolve(__dirname, '__test__', 'us-core-blood-pressure.json'), 'utf8')
    );
    patientProfile = JSON.parse(readFileSync(resolve(__dirname, '__test__', 'us-core-patient.json'), 'utf8'));
  });

  test('Invalid resource', () => {
    expect(() => validateResource(undefined as unknown as Patient)).toThrow();
    expect(() => validateResource({} as unknown as Patient)).toThrow();
  });

  test('Valid base resource', () => {
    const patient: Patient = {
      resourceType: 'Patient',
      gender: 'unknown',
      birthDate: '1949-08-14',
    };
    expect(() => validateResource(patient)).not.toThrow();
  });

  test('Invalid cardinality', () => {
    const invalidMultiple: Patient = {
      resourceType: 'Patient',
      gender: ['male', 'female'],
      birthDate: '1949-08-14',
    } as unknown as Patient;
    const invalidSingle: Patient = {
      resourceType: 'Patient',
      identifier: {
        system: 'http://example.com',
        value: 'I12345',
      },
    } as unknown as Patient;
    expect(() => validateResource(invalidMultiple)).toThrow();
    expect(() => validateResource(invalidSingle)).toThrow();
  });

  test('Invalid value type', () => {
    const invalidType: Patient = {
      resourceType: 'Patient',
      birthDate: Date.parse('1949-08-14'),
    } as unknown as Patient;
    expect(() => validateResource(invalidType)).toThrow();
  });

  test('Invalid string format', () => {
    const invalidFormat: Patient = {
      resourceType: 'Patient',
      birthDate: 'Aug 14, 1949',
    };
    expect(() => validateResource(invalidFormat)).toThrow();
  });

  test('Invalid numeric value', () => {
    const patientExtension: Patient = {
      resourceType: 'Patient',
      multipleBirthInteger: 4.2,
    };
    expect(() => validateResource(patientExtension)).toThrow();
  });

  test('Valid property name special cases', () => {
    const primitiveExtension = {
      resourceType: 'Patient',
      _birthDate: {
        extension: [
          {
            url: 'http://example.com/data-missing-reason',
            valueString: 'Forgot to ask patient at check-in',
          },
        ],
      },
    } as unknown as Patient;
    const choiceType: Patient = {
      resourceType: 'Patient',
      deceasedBoolean: false,
    };
    const choiceTypeExtension: Patient = {
      resourceType: 'Patient',
      deceasedBoolean: false,
      _deceasedBoolean: {
        id: '1',
      },
    } as unknown as Patient;
    expect(() => validateResource(primitiveExtension)).not.toThrow();
    expect(() => validateResource(choiceType)).not.toThrow();
    expect(() => validateResource(choiceTypeExtension)).not.toThrow();
  });

  test('Valid resource with extension', () => {
    const patientExtension: Patient = {
      resourceType: 'Patient',
      extension: [
        {
          url: 'http://example.com/ext',
          valuePositiveInt: 1,
        },
      ],
    };
    expect(() => {
      validateResource(patientExtension);
    }).not.toThrow();
  });

  describe('US Core Blood Pressure profile', () => {
    const VALID_BP: Observation = {
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
    test('Valid resource under constraining profile', () => {
      const observation: Observation = deepClone(VALID_BP);
      expect(() => validateResource(observation, { profile: observationProfile })).not.toThrow();
    });

    test('Valid resource under constraining profile with additional non-constrained fields', () => {
      const observation = deepClone(VALID_BP);
      (observation as any).component[0].code.coding[0].display = 'this is not constrained';
      expect(() => validateResource(observation, { profile: observationProfile })).not.toThrow();
    });

    test('Invalid cardinality', () => {
      const observation: Observation = deepClone(VALID_BP);
      observation.component?.splice(0, 1);
      expect(() => validateResource(observation, { profile: observationProfile })).toThrow(
        'Invalid number of values: expected 2..*, but found 1 (Observation.component)'
      );
    });

    test('Extra component missing required properties', () => {
      const observation: Observation = deepClone(VALID_BP);
      observation.component?.push({
        dataAbsentReason: {
          coding: [
            {
              system: 'https://terminology.hl7.org/CodeSystem/data-absent-reason',
              code: 'unknown',
            },
          ],
        },
      } as ObservationComponent);

      try {
        validateResource(observation, { profile: observationProfile });
        fail('Expected error');
      } catch (err) {
        const outcome = (err as OperationOutcomeError).outcome;
        expect(outcome.issue?.[0]?.details?.text).toEqual('Missing required property');
        expect(outcome.issue?.[0]?.expression).toEqual(['Observation.component[2].code']);
      }
    });

    test('Invalid resource under pattern fields profile', () => {
      const observation: Observation = deepClone(VALID_BP);
      (observation as any).code.coding[0].system = 'http://incorrect.system';

      try {
        validateResource(observation, { profile: observationProfile });
        fail('Expected error');
      } catch (err) {
        const outcome = (err as OperationOutcomeError).outcome;
        expect(outcome.issue?.[0]?.details?.text).toEqual('Value did not match expected pattern');
        expect(outcome.issue?.[0]?.expression).toEqual(['Observation.code']);
      }
    });

    test('Invalid slice contents', () => {
      const observation: Observation = deepClone(VALID_BP);
      (observation as any).component[1].code.coding[0].code = 'wrong code';

      expect(() => {
        validateResource(observation, { profile: observationProfile });
      }).toThrow(
        `Incorrect number of values provided for slice 'diastolic': expected 1..1, but found 0 (Observation.component)`
      );
    });
  });

  test('StructureDefinition', () => {
    expect(() => validateResource(typesBundle)).not.toThrow();
    expect(() => validateResource(resourcesBundle)).not.toThrow();
    expect(() => validateResource(medplumBundle)).not.toThrow();
  });

  test('Profile with restriction on base type field', () => {
    const patient: Patient = {
      resourceType: 'Patient',
      identifier: [
        {
          system: 'http://example.com',
          value: 'foo',
        },
      ],
      telecom: [
        {
          // Missing system property
          value: '555-555-5555',
        },
        {
          system: 'email',
          value: 'patient@example.com',
        },
      ],
      gender: 'unknown',
      name: [
        {
          given: ['Test'],
          family: 'Patient',
        },
      ],
    };
    expect(() => validateResource(patient, { profile: patientProfile })).toThrow(
      new Error('Missing required property (Patient.telecom[0].system)')
    );
  });

  test('Profile with restriction on base type field', () => {
    const patient: Patient = {
      resourceType: 'Patient',
      extension: [
        {
          url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-race',
          extension: [
            {
              url: 'ombCategory',
              valueCoding: {
                system: 'urn:oid:2.16.840.1.113883.6.238',
                code: '2106-3',
                display: 'White',
              },
            },
            {
              url: 'detailed',
              valueCoding: {
                system: 'urn:oid:2.16.840.1.113883.6.238',
                code: '1006-6',
                display: 'Abenaki',
              },
            },
            {
              url: 'detailed',
              valueCoding: {
                system: 'urn:oid:2.16.840.1.113883.6.238',
                code: '1053-8',
                display: 'California Tribes',
              },
            },
            {
              url: 'text',
              valueString: 'This is text',
            },
          ],
        },
        {
          url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-genderIdentity',
          valueCodeableConcept: {
            coding: [
              {
                system: 'http://snomed.info/sct',
                code: '446151000124109',
                display: 'Identifies as male gender (finding)',
              },
            ],
          },
        },
      ],
      identifier: [
        {
          system: 'http://example.com',
          value: 'foo',
        },
      ],
      telecom: [
        {
          system: 'email',
          value: 'patient@example.com',
        },
        {
          system: 'email',
          value: 'two@example.com',
        },
      ],
      gender: 'unknown',
      name: [
        {
          given: ['Test'],
          family: 'Patient',
        },
      ],
    };
    expect(() => validateResource(patient, { profile: patientProfile })).not.toThrow();
  });

  // This test is failing because we do not recursively validate extensions. In this case,
  // US Core Race requires the `text` extension, so not having it should fail validation.
  test.failing('Nested extensions are not yet validated', () => {
    const patient: Patient = {
      resourceType: 'Patient',
      name: [{ given: ['New'], family: 'User' }],
      identifier: [{ system: 'http://names.io', value: 'new-user' }],
      gender: 'male',
      extension: [
        {
          url: HTTP_HL7_ORG + '/fhir/us/core/StructureDefinition/us-core-race',
          extension: [
            {
              url: 'ombCategory',
              valueCoding: { system: 'urn:oid:2.16.840.1.113883.6.238', code: '2106-3', display: 'White' },
            },
            //{
            // url: 'text',
            // valueString: 'This should be required',
            //},
          ],
        },
      ],
    };
    expect(() => validateResource(patient, { profile: patientProfile })).toThrow();
  });

  test('Valid resource with nulls in primitive extension', () => {
    expect(() => {
      validateResource({
        resourceType: 'Patient',
        name: [
          {
            given: ['John', null],
            _given: [null, { extension: [{ url: 'http://example.com', valueString: 'foo' }] }],
          },
        ],
      } as unknown as Patient);
    }).not.toThrow();
  });

  test('Valid ValueSet (content reference with altered cardinality', () => {
    const valueSet: ValueSet = {
      resourceType: 'ValueSet',
      id: 'observation-status',
      meta: {
        lastUpdated: '2019-11-01T09:29:23.356+11:00',
        profile: ['http://hl7.org/fhir/StructureDefinition/shareablevalueset'],
      },
      url: 'http://hl7.org/fhir/ValueSet/observation-status',
      identifier: [
        {
          system: 'urn:ietf:rfc:3986',
          value: 'urn:oid:2.16.840.1.113883.4.642.3.400',
        },
      ],
      version: '4.0.1',
      name: 'ObservationStatus',
      title: 'ObservationStatus',
      status: 'active',
      experimental: false,
      date: '2019-11-01T09:29:23+11:00',
      publisher: 'HL7 (FHIR Project)',
      contact: [
        {
          telecom: [
            {
              system: 'url',
              value: 'http://hl7.org/fhir',
            },
            {
              system: 'email',
              value: 'fhir@lists.hl7.org',
            },
          ],
        },
      ],
      description: 'Codes providing the status of an observation.',
      immutable: true,
      compose: {
        include: [
          {
            system: 'http://hl7.org/fhir/observation-status',
          },
        ],
      },
    };
    expect(() => validateResource(valueSet)).not.toThrow();
  });

  test('ValueSet compose invariant', () => {
    const vs: ValueSet = {
      resourceType: 'ValueSet',
      url: 'http://terminology.hl7.org/ValueSet/v3-ProvenanceEventCurrentState',
      identifier: [
        {
          system: 'urn:ietf:rfc:3986',
          value: 'urn:oid:2.16.840.1.113883.1.11.20547',
        },
      ],
      version: '2014-08-07',
      name: 'v3.ProvenanceEventCurrentState',
      title: 'V3 Value SetProvenanceEventCurrentState',
      status: 'active',
      experimental: false,
      publisher: 'HL7 v3',
      contact: [
        {
          telecom: [
            {
              system: 'url',
              value: 'http://www.hl7.org',
            },
          ],
        },
      ],
      immutable: false,
      compose: {
        include: [
          {
            valueSet: ['http://terminology.hl7.org/ValueSet/v3-ProvenanceEventCurrentState-AS'],
          },
          {
            valueSet: ['http://terminology.hl7.org/ValueSet/v3-ProvenanceEventCurrentState-DC'],
          },
        ],
      },
    };

    expect(() => validateResource(vs)).not.toThrow();
  });

  test('Timing invariant', () => {
    const prescription: MedicationRequest = {
      resourceType: 'MedicationRequest',
      status: 'stopped',
      intent: 'order',
      medicationCodeableConcept: {
        coding: [
          {
            system: RXNORM,
            code: '105078',
            display: 'Penicillin G 375 MG/ML Injectable Solution',
          },
        ],
        text: 'Penicillin G 375 MG/ML Injectable Solution',
      },
      subject: {
        reference: 'Patient/1c9f7759-dcc2-4aed-9beb-d7f8a2bfb4f6',
      },
      encounter: {
        reference: 'Encounter/82bec000-a6e4-4352-bea4-b7f0af7c246b',
      },
      authoredOn: '1947-11-01T00:11:45-05:00',
      requester: {
        reference: 'Practitioner/4b823444-df09-40a9-8de8-cf1e6f044b9a',
        display: 'Dr. Willena258 Oberbrunner298',
      },
      dosageInstruction: [
        {
          sequence: 1,
          text: 'Take at regular intervals. Complete the prescribed course unless otherwise directed.\n',
          additionalInstruction: [
            {
              coding: [
                {
                  system: SNOMED,
                  code: '418577003',
                  display: 'Take at regular intervals. Complete the prescribed course unless otherwise directed.',
                },
              ],
              text: 'Take at regular intervals. Complete the prescribed course unless otherwise directed.',
            },
          ],
          timing: {
            repeat: {
              frequency: 4,
              period: 1,
              periodUnit: 'd',
            },
          },
          asNeededBoolean: false,
          doseAndRate: [
            {
              type: {
                coding: [
                  {
                    system: 'http://terminology.hl7.org/CodeSystem/dose-rate-type',
                    code: 'ordered',
                    display: 'Ordered',
                  },
                ],
              },
              doseQuantity: {
                value: 1,
              },
            },
          ],
        },
      ],
    };
    expect(() => validateResource(prescription)).not.toThrow();
  });

  test('Primitive extension for required property', () => {
    const observation: Observation = {
      resourceType: 'Observation',
      _status: {
        extension: [
          {
            url: 'http://example.com/data-absent',
            valueBoolean: true,
          },
        ],
      },
      code: {
        coding: [
          {
            system: 'http://example.com/',
            code: '1',
          },
        ],
      },
      valueBoolean: true,
    } as unknown as Observation;

    expect(() => validateResource(observation)).not.toThrow();
  });

  test('Protects against prototype pollution', () => {
    const patient = JSON.parse(`{
      "resourceType": "Patient",
      "birthDate": "1988-11-18",
      "_birthDate": {
        "id": "foo",
        "__proto__": { "valueOf": "bad", "trim": "news" },
        "constructor": {
          "prototype": { "valueOf": "bad", "trim": "news" }
        }
      }
    }`) as Patient;
    expect(() => validateResource(patient)).not.toThrow();
    expect('hi'.trim()).toEqual('hi');
  });

  test('Slice on value type', () => {
    const bodyWeightProfile = JSON.parse(readFileSync(resolve(__dirname, '__test__/body-weight-profile.json'), 'utf8'));
    const observation: Observation = {
      resourceType: 'Observation',
      status: 'final',
      code: {
        coding: [
          {
            system: LOINC,
            code: '29463-7',
          },
        ],
      },
      category: [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/observation-category',
              code: 'vital-signs',
            },
          ],
        },
      ],
      subject: {
        reference: 'Patient/example',
      },
      effectiveDateTime: '2023-08-04T12:34:56Z',
      valueQuantity: {
        system: UCUM,
        code: '[lb_av]',
        unit: 'pounds',
        value: 130,
      },
    };
    expect(() => validateResource(observation, { profile: bodyWeightProfile as StructureDefinition })).not.toThrow();
  });

  describe('Slice with pattern on $this', () => {
    const healthConcernsProfile = JSON.parse(
      readFileSync(resolve(__dirname, '__test__/us-core-condition-problems-health-concerns.json'), 'utf8')
    ) as StructureDefinition;

    const baseCondition: Condition = {
      resourceType: 'Condition',
      code: {
        coding: [
          {
            system: 'http://snomed.info/sct',
            code: '102263004',
            display: 'Eggs',
          },
        ],
      },
      meta: {
        profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-condition-problems-health-concerns'],
      },
      subject: {
        reference: 'Patient/6de16ccc-3ae2-49e0-b2d0-178a6c6de872',
      },
    };

    test('Missing Condition.category', () => {
      const conditionNoCategory = deepClone(baseCondition);
      conditionNoCategory.category = undefined;
      expect(() => validateResource(conditionNoCategory, { profile: healthConcernsProfile })).toThrow();
    });

    // Slicing by ValueSet not supported without async validation. Ideally validating this resource would fail,
    // but it must pass for now to make it possible to save resources against profiles using ValueSet slicing
    // like https://hl7.org/fhir/us/core/STU5.0.1/StructureDefinition-us-core-condition-problems-health-concerns.html
    test.failing('Populated but missing required Condition.category', () => {
      const conditionWrongCategory = deepClone(baseCondition);
      conditionWrongCategory.category = [
        {
          coding: [
            {
              system: 'http://hl7.org/fhir/us/core/CodeSystem/us-core-tags',
              code: 'sdoh',
              display: 'SDOH',
            },
          ],
          text: 'Social Determinants Of Health',
        },
      ];
      expect(() => validateResource(conditionWrongCategory, { profile: healthConcernsProfile })).toThrow();
    });

    test('Populated with valid Condition.category', () => {
      const validCondition: Condition = deepClone(baseCondition);
      validCondition.category = [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/condition-category',
              code: 'problem-list-item',
              display: 'Problem List Item',
            },
          ],
          text: 'Problem List Item',
        },
      ];
      expect(() => validateResource(validCondition, { profile: healthConcernsProfile })).not.toThrow();
    });
  });

  test('validateResource', () => {
    expect(() => validateResource(null as unknown as Resource)).toThrow();
    expect(() => validateResource({} as unknown as Resource)).toThrow();
    expect(() => validateResource({ resourceType: 'FakeResource' } as unknown as Resource)).toThrow();
    expect(() => validateResource({ resourceType: 'Patient' })).not.toThrow();
  });

  test('Array properties', () => {
    expect(() => validateResource({ resourceType: 'Patient', name: [{ given: ['Homer'] }] })).not.toThrow();

    try {
      validateResource({ resourceType: 'Patient', name: 'Homer' } as unknown as Resource);
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.severity).toEqual('error');
      expect(outcome.issue?.[0]?.expression?.[0]).toEqual('Patient.name');
    }
  });

  test('Additional properties', () => {
    expect(() => validateResource({ resourceType: 'Patient', name: [{ given: ['Homer'] }], meta: {} })).not.toThrow();
    expect(() => validateResource({ resourceType: 'Patient', fakeProperty: 'test' } as unknown as Patient)).toThrow(
      new Error('Invalid additional property "fakeProperty" (Patient.fakeProperty)')
    );
  });

  test('Required properties', () => {
    try {
      validateResource({ resourceType: 'DiagnosticReport' } as unknown as DiagnosticReport);
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue).toHaveLength(2);
      expect(outcome.issue?.[0]?.severity).toEqual('error');
      expect(outcome.issue?.[0]?.expression?.[0]).toEqual('DiagnosticReport.status');
      expect(outcome.issue?.[1]?.severity).toEqual('error');
      expect(outcome.issue?.[1]?.expression?.[0]).toEqual('DiagnosticReport.code');
    }
  });

  test('Null value', () => {
    try {
      validateResource({ resourceType: 'Patient', name: null } as unknown as Patient);
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.severity).toEqual('error');
      expect(outcome.issue?.[0]?.expression?.[0]).toEqual('Patient.name');
    }
  });

  test('Null array element', () => {
    try {
      validateResource({ resourceType: 'Patient', name: [null] } as unknown as Patient);
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.severity).toEqual('error');
      expect(outcome.issue?.[0]?.expression?.[0]).toEqual('Patient.name[0]');
    }
  });

  test('Undefined array element', () => {
    try {
      validateResource({ resourceType: 'Patient', name: [{ given: [undefined] }] } as unknown as Patient);
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.severity).toEqual('error');
      expect(outcome.issue?.[0]?.expression?.[0]).toEqual('Patient.name[0].given[0]');
    }
  });

  test('Nested null array element', () => {
    try {
      validateResource({
        resourceType: 'Patient',
        identifier: [
          {
            system: null,
          },
        ],
        name: [
          {
            given: ['Alice'],
            family: 'Smith',
          },
          {
            given: ['Alice', null],
            family: 'Smith',
          },
        ],
      } as unknown as Patient);
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.length).toBe(2);
      expect(outcome.issue?.[0]?.severity).toEqual('error');
      expect(outcome.issue?.[0]?.expression?.[0]).toEqual('Patient.identifier[0].system');
      expect(outcome.issue?.[1]?.severity).toEqual('error');
      expect(outcome.issue?.[1]?.expression?.[0]).toEqual('Patient.name[1].given[1]');
    }
  });

  test('Deep nested null array element', () => {
    try {
      validateResource({
        resourceType: 'Questionnaire',
        status: 'active',
        item: [
          {
            linkId: '1',
            type: 'group',
            item: [
              {
                linkId: '1.1',
                type: 'group',
                item: [
                  {
                    linkId: '1.1.1',
                    type: 'group',
                    item: [
                      {
                        linkId: '1.1.1.1',
                        type: 'group',
                        item: null,
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      } as unknown as Questionnaire);
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.length).toEqual(2);
      expect(outcome.issue?.[0]?.severity).toEqual('error');
      expect(outcome.issue?.[0]?.details?.text).toEqual('Invalid null value');
      expect(outcome.issue?.[0]?.expression?.[0]).toEqual('Questionnaire.item[0].item[0].item[0].item[0].item');
      expect(outcome.issue?.[1]?.severity).toEqual('error');
      expect(outcome.issue?.[1]?.code).toEqual('invariant');
    }
  });

  test('Primitive types', () => {
    try {
      validateResource({
        resourceType: 'Slot',
        schedule: { reference: 'Schedule/1' },
        status: 'free',
        start: 'x',
        end: 'x',
      });
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue).toHaveLength(2);
      expect(outcome.issue?.[0]?.severity).toEqual('error');
      expect(outcome.issue?.[0]?.expression?.[0]).toEqual('Slot.start');
      expect(outcome.issue?.[1]?.severity).toEqual('error');
      expect(outcome.issue?.[1]?.expression?.[0]).toEqual('Slot.end');
    }
  });

  test('base64Binary', () => {
    const binary: Binary = { resourceType: 'Binary', contentType: ContentType.TEXT };

    binary.data = 123 as unknown as string;
    expect(() => validateResource(binary)).toThrow('Invalid JSON type: expected string, but got number (Binary.data)');

    binary.data = '===';
    expect(() => validateResource(binary)).toThrow('Invalid base64Binary format');

    binary.data = 'aGVsbG8=';
    expect(() => validateResource(binary)).not.toThrow();
  });

  test('boolean', () => {
    const patient: Patient = { resourceType: 'Patient' };

    patient.active = 123 as unknown as boolean;
    expect(() => validateResource(patient)).toThrow(
      'Invalid JSON type: expected boolean, but got number (Patient.active)'
    );

    patient.active = true;
    expect(() => validateResource(patient)).not.toThrow();

    patient.active = false;
    expect(() => validateResource(patient)).not.toThrow();
  });

  test('date', () => {
    const patient: Patient = { resourceType: 'Patient' };

    patient.birthDate = 123 as unknown as string;
    expect(() => validateResource(patient)).toThrow(
      'Invalid JSON type: expected string, but got number (Patient.birthDate)'
    );

    patient.birthDate = 'x';
    expect(() => validateResource(patient)).toThrow('Invalid date format');

    patient.birthDate = '2000-01-01';
    expect(() => validateResource(patient)).not.toThrow();
  });

  test('dateTime', () => {
    const condition: Condition = { resourceType: 'Condition', subject: { reference: 'Patient/1' } };

    condition.recordedDate = 123 as unknown as string;
    expect(() => validateResource(condition)).toThrow(
      'Invalid JSON type: expected string, but got number (Condition.recordedDate)'
    );

    condition.recordedDate = 'x';
    expect(() => validateResource(condition)).toThrow('Invalid dateTime format');

    condition.recordedDate = '2022-02-02';
    expect(() => validateResource(condition)).not.toThrow();

    condition.recordedDate = '2022-02-02T12:00:00-04:00';
    expect(() => validateResource(condition)).not.toThrow();

    condition.recordedDate = '2022-02-02T12:00:00Z';
    expect(() => validateResource(condition)).not.toThrow();
  });

  test('decimal', () => {
    const media: Media = { resourceType: 'Media', status: 'completed', content: { title: 'x' } };

    media.duration = 'x' as unknown as number;
    expect(() => validateResource(media)).toThrow(
      'Invalid JSON type: expected number, but got string (Media.duration)'
    );

    media.duration = NaN;
    expect(() => validateResource(media)).toThrow('Invalid numeric value (Media.duration)');

    media.duration = Infinity;
    expect(() => validateResource(media)).toThrow('Invalid numeric value (Media.duration)');

    media.duration = 123.5;
    expect(() => validateResource(media)).not.toThrow();
  });

  test('id', () => {
    const ig = {
      resourceType: 'ImplementationGuide',
      name: 'x',
      status: 'active',
      fhirVersion: ['4.0.1'],
      url: 'https://example.com',
    } as ImplementationGuide;

    ig.packageId = 123 as unknown as string;
    expect(() => validateResource(ig)).toThrow(
      'Invalid JSON type: expected string, but got number (ImplementationGuide.packageId)'
    );

    ig.packageId = '$';
    expect(() => validateResource(ig)).toThrow('Invalid id format');

    ig.packageId = 'foo';
    expect(() => validateResource(ig)).not.toThrow();
  });

  test('instant', () => {
    const obs: Observation = { resourceType: 'Observation', status: 'final', code: { text: 'x' } };

    obs.issued = 123 as unknown as string;
    expect(() => validateResource(obs)).toThrow(
      'Invalid JSON type: expected string, but got number (Observation.issued)'
    );

    obs.issued = 'x';
    expect(() => validateResource(obs)).toThrow('Invalid instant format');

    obs.issued = '2022-02-02';
    expect(() => validateResource(obs)).toThrow('Invalid instant format');

    obs.issued = '2022-02-02T12:00:00-04:00';
    expect(() => validateResource(obs)).not.toThrow();

    obs.issued = '2022-02-02T12:00:00Z';
    expect(() => validateResource(obs)).not.toThrow();
  });

  test('integer', () => {
    const sp: SubstanceProtein = { resourceType: 'SubstanceProtein' };

    sp.numberOfSubunits = 'x' as unknown as number;
    expect(() => validateResource(sp)).toThrow(
      'Invalid JSON type: expected number, but got string (SubstanceProtein.numberOfSubunits)'
    );

    sp.numberOfSubunits = NaN;
    expect(() => validateResource(sp)).toThrow('Invalid numeric value (SubstanceProtein.numberOfSubunits)');

    sp.numberOfSubunits = Infinity;
    expect(() => validateResource(sp)).toThrow('Invalid numeric value (SubstanceProtein.numberOfSubunits)');

    sp.numberOfSubunits = 123.5;
    expect(() => validateResource(sp)).toThrow('Expected number to be an integer (SubstanceProtein.numberOfSubunits)');

    sp.numberOfSubunits = 10;
    expect(() => validateResource(sp)).not.toThrow();
  });

  test('string', () => {
    const acct: Account = { resourceType: 'Account', status: 'active' };

    acct.name = 123 as unknown as string;
    expect(() => validateResource(acct)).toThrow('Invalid JSON type: expected string, but got number (Account.name)');

    acct.name = '    ';
    expect(() => validateResource(acct)).toThrow('String must contain non-whitespace content (Account.name)');

    acct.name = 'test';
    expect(() => validateResource(acct)).not.toThrow();
  });

  test('positiveInt', () => {
    const patient: Patient = { resourceType: 'Patient' };
    const patientReference = createReference(patient);
    const appt: Appointment = {
      resourceType: 'Appointment',
      status: 'booked',
      start: '2022-02-02T12:00:00Z',
      end: '2022-02-02T12:30:00Z',
      participant: [{ status: 'accepted', actor: patientReference }],
    };

    appt.minutesDuration = 'x' as unknown as number;
    expect(() => validateResource(appt)).toThrow(
      'Invalid JSON type: expected number, but got string (Appointment.minutesDuration)'
    );

    appt.minutesDuration = NaN;
    expect(() => validateResource(appt)).toThrow('Invalid numeric value (Appointment.minutesDuration)');

    appt.minutesDuration = Infinity;
    expect(() => validateResource(appt)).toThrow('Invalid numeric value (Appointment.minutesDuration)');

    appt.minutesDuration = 123.5;
    expect(() => validateResource(appt)).toThrow('Expected number to be an integer (Appointment.minutesDuration)');

    appt.minutesDuration = -1;
    expect(() => validateResource(appt)).toThrow('Expected number to be positive (Appointment.minutesDuration)');

    appt.minutesDuration = 0;
    expect(() => validateResource(appt)).toThrow('Expected number to be positive (Appointment.minutesDuration)');

    appt.minutesDuration = 10;
    expect(() => validateResource(appt)).not.toThrow();
  });

  test('unsignedInt', () => {
    const patient: Patient = { resourceType: 'Patient' };
    const patientReference = createReference(patient);
    const appt: Appointment = {
      resourceType: 'Appointment',
      status: 'booked',
      start: '2022-02-02T12:00:00Z',
      end: '2022-02-02T12:30:00Z',
      participant: [{ status: 'accepted', actor: patientReference }],
    };

    appt.priority = 'x' as unknown as number;
    expect(() => validateResource(appt)).toThrow(
      'Invalid JSON type: expected number, but got string (Appointment.priority)'
    );

    appt.priority = NaN;
    expect(() => validateResource(appt)).toThrow('Invalid numeric value (Appointment.priority)');

    appt.priority = Infinity;
    expect(() => validateResource(appt)).toThrow('Invalid numeric value (Appointment.priority)');

    appt.priority = 123.5;
    expect(() => validateResource(appt)).toThrow('Expected number to be an integer (Appointment.priority)');

    appt.priority = -1;
    expect(() => validateResource(appt)).toThrow('Expected number to be non-negative (Appointment.priority)');

    appt.priority = 0;
    expect(() => validateResource(appt)).not.toThrow();

    appt.priority = 10;
    expect(() => validateResource(appt)).not.toThrow();
  });

  test('BackboneElement', () => {
    try {
      validateResource({
        resourceType: 'Appointment',
        status: 'booked',
        participant: [{ type: [{ text: 'x' }] } as AppointmentParticipant], // "status" is required
      });
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue).toHaveLength(2);

      expect(outcome.issue?.[0]?.severity).toEqual('error');
      expect(outcome.issue?.[0]?.details?.text).toEqual(
        'Constraint app-3 not met: Only proposed or cancelled appointments can be missing start/end dates'
      );
      expect(outcome.issue?.[0]?.expression?.[0]).toEqual('Appointment');

      expect(outcome.issue?.[1]?.severity).toEqual('error');
      expect(outcome.issue?.[1]?.details?.text).toEqual('Missing required property');
      expect(outcome.issue?.[1]?.expression?.[0]).toEqual('Appointment.participant[0].status');
    }
  });

  test('Choice of type', () => {
    // Observation.value[x]
    expect(() =>
      validateResource({ resourceType: 'Observation', status: 'final', code: { text: 'x' }, valueString: 'xyz' })
    ).not.toThrow();
    expect(() =>
      validateResource({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'x' },
        valueDateTime: '2020-01-01T00:00:00Z',
      })
    ).not.toThrow();
    expect(() =>
      validateResource({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'x' },
        valueXyz: 'xyz',
      } as unknown as Observation)
    ).toThrow();

    // Patient.multipleBirth[x] is a choice of boolean or integer
    expect(() => validateResource({ resourceType: 'Patient', multipleBirthBoolean: true })).not.toThrow();
    expect(() => validateResource({ resourceType: 'Patient', multipleBirthInteger: 2 })).not.toThrow();
    expect(() =>
      validateResource({ resourceType: 'Patient', multipleBirthString: 'xyz' } as unknown as Patient)
    ).toThrow();
  });

  test('Primitive element', () => {
    expect(() =>
      validateResource({
        resourceType: 'Patient',
        birthDate: '1990-01-01',
        _birthDate: { id: 'foo' },
      } as unknown as Patient)
    ).not.toThrow();
    expect(() =>
      validateResource({
        resourceType: 'Patient',
        _birthDate: '1990-01-01',
      } as unknown as Patient)
    ).toThrow();
    expect(() => {
      return validateResource({ resourceType: 'Patient', _birthDate: { id: 'foo' } } as unknown as Patient);
    }).not.toThrow();
    expect(() => validateResource({ resourceType: 'Patient', _xyz: {} } as unknown as Patient)).toThrow();
    expect(() =>
      validateResource({
        resourceType: 'Questionnaire',
        status: 'active',
        item: [
          { linkId: 'test', type: 'string', text: 'test', _text: { extension: [] } } as unknown as QuestionnaireItem,
        ],
      })
    ).not.toThrow();
  });

  test('Array mismatch', () => {
    // Send an array for a single value property
    expect(() => validateResource({ resourceType: 'Patient', birthDate: ['1990-01-01'] as unknown as string })).toThrow(
      'Expected single value for property (Patient.birthDate)'
    );

    // Send a single value for an array property
    expect(() =>
      validateResource({ resourceType: 'Patient', name: { family: 'foo' } as unknown as HumanName[] })
    ).toThrow('Expected array of values for property (Patient.name)');
  });

  test('Primitive and extension', () => {
    const resource: CodeSystem = {
      resourceType: 'CodeSystem',
      status: 'active',
      content: 'complete',
      concept: [
        {
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/codesystem-concept-comments',
              _valueString: {
                extension: [
                  {
                    extension: [
                      {
                        url: 'lang',
                        valueCode: 'nl',
                      },
                      {
                        url: 'content',
                        valueString: 'Zo spoedig mogelijk',
                      },
                    ],
                    url: 'http://hl7.org/fhir/StructureDefinition/translation',
                  },
                ],
              },
            } as unknown as Extension,
          ],
          code: 'A',
          display: 'ASAP',
          designation: [
            {
              language: 'nl',
              use: {
                system: 'http://terminology.hl7.org/CodeSystem/designation-usage',
                code: 'display',
              },
              value: 'ZSM',
            },
          ],
        },
      ],
    };

    expect(() => validateResource(resource)).not.toThrow();
  });

  test('where identifier exists', () => {
    const original = resourcesBundle.entry?.find((e) => e.resource?.id === 'Encounter')
      ?.resource as StructureDefinition;

    expect(original).toBeDefined();

    const profile = deepClone(original);

    const rootElement = (profile.snapshot as StructureDefinitionSnapshot).element?.find(
      (e) => e.id === 'Encounter'
    ) as ElementDefinition;
    rootElement.constraint = [
      {
        key: 'where-identifier-exists',
        expression: "identifier.where(system='http://example.com' and value='123').exists()",
        severity: 'error',
        human: 'Identifier must exist',
      },
    ];

    const identifierElement = (profile.snapshot as StructureDefinitionSnapshot).element?.find(
      (e) => e.id === 'Encounter.identifier'
    ) as ElementDefinition;
    identifierElement.min = 1;
    identifierElement.constraint = [
      {
        key: 'where-identifier-exists',
        expression: "where(system='http://example.com' and value='123').exists()",
        severity: 'error',
        human: 'Identifier must exist',
      },
    ];

    const e1: Encounter = {
      resourceType: 'Encounter',
      status: 'finished',
      class: { code: 'foo' },
    };
    expect(() => validateResource(e1, { profile })).toThrow();

    const e2: Encounter = {
      resourceType: 'Encounter',
      status: 'finished',
      class: { code: 'foo' },
      identifier: [{ system: 'http://example.com', value: '123' }],
    };
    expect(() => validateResource(e2, { profile })).not.toThrow();

    const e3: Encounter = {
      resourceType: 'Encounter',
      status: 'finished',
      class: { code: 'foo' },
      identifier: [{ system: 'http://example.com', value: '456' }],
    };
    expect(() => validateResource(e3, { profile })).toThrow();
  });

  // TODO: Change this check from warning to error
  // Duplicate entries for choice-of-type property is currently a warning
  // We need to first log and track this, and notify customers of breaking changes
  function expectOneWarning(resource: Resource, textContains: string): void {
    const issues = validateResource(resource);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].details?.text).toContain(textContains);
  }

  const DUPLICATE_CHOICE_OF_TYPE_PROPERTY = 'Duplicate choice of type property';
  const PRIMITIVE_EXTENSION_TYPE_MISMATCH = 'Type of primitive extension does not match the type of property';

  test('Multiple values for choice of type property', () => {
    const carePlan: CarePlan = {
      resourceType: 'CarePlan',
      subject: {
        reference: 'Patient/fdf33a83-08b0-4475-ae99-f5b6fec2f0f1',
        display: 'Homer Simpson',
      },
      status: 'active',
      intent: 'order',
      activity: [
        {
          detail: {
            status: 'in-progress',
            scheduledPeriod: {
              start: '2024-02-29T16:52:20.825Z',
            },
            scheduledTiming: {
              repeat: {
                period: 1,
                periodUnit: 'd',
              },
            },
          },
        },
      ],
    };

    expectOneWarning(carePlan, DUPLICATE_CHOICE_OF_TYPE_PROPERTY);
  });

  test('Valid choice of type properties with primitive extensions', () => {
    expect(
      validateResource({
        resourceType: 'Patient',
        multipleBirthInteger: 2,
      } as Patient)
    ).toHaveLength(0);

    expect(
      validateResource({
        resourceType: 'Patient',
        _multipleBirthInteger: {
          extension: [],
        },
      } as Patient)
    ).toHaveLength(0);

    // check both orders of the properties
    expect(
      validateResource({
        resourceType: 'Patient',
        multipleBirthInteger: 2,
        _multipleBirthInteger: {
          extension: [],
        },
      } as Patient)
    ).toHaveLength(0);
    expect(
      validateResource({
        resourceType: 'Patient',
        multipleBirthInteger: 2,
        _multipleBirthInteger: {
          extension: [],
        },
      } as Patient)
    ).toHaveLength(0);
  });

  test('Invalid choice of type properties with primitive extensions', () => {
    expectOneWarning(
      {
        resourceType: 'Patient',
        multipleBirthBoolean: true,
        multipleBirthInteger: 2,
      } as Patient,
      DUPLICATE_CHOICE_OF_TYPE_PROPERTY
    );

    expectOneWarning(
      {
        resourceType: 'Patient',
        _multipleBirthInteger: {
          extension: [],
        },
        _multipleBirthBoolean: {
          extension: [],
        },
      } as Patient,
      DUPLICATE_CHOICE_OF_TYPE_PROPERTY
    );

    // Primitive extension type mismatch, check both orders of the properties
    expectOneWarning(
      {
        resourceType: 'Patient',
        multipleBirthInteger: 2,
        _multipleBirthBoolean: {
          extension: [],
        },
      } as Patient,
      PRIMITIVE_EXTENSION_TYPE_MISMATCH
    );
    expectOneWarning(
      {
        resourceType: 'Patient',
        _multipleBirthBoolean: {
          extension: [],
        },
        multipleBirthInteger: 2,
      } as Patient,
      PRIMITIVE_EXTENSION_TYPE_MISMATCH
    );
  });

  test('Reference type check', () => {
    const docRef: DocumentReference = {
      resourceType: 'DocumentReference',
      status: 'current',
      content: [{ attachment: { data: 'aGVsbG8gd29ybGQ=' } }],

      // Note that "relatesTo.target" must be a Reference to a DocumentReference
      // This reference to a Patient is invalid
      relatesTo: [{ code: 'appends', target: { reference: 'Patient/123' } }],
    };

    // TODO: Change this check from warning to error
    // Duplicate entries for choice-of-type property is currently a warning
    // We need to first log and track this, and notify customers of breaking changes
    const issues = validateResource(docRef);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].details?.text).toContain('Invalid reference for');
  });

  test('Nested recursive properties', () => {
    const consent: Consent = {
      resourceType: 'Consent',
      status: 'active',
      scope: { text: 'test' },
      category: [{ text: 'test' }],
      policyRule: { text: 'test' },
      provision: {
        type: 'permit',
        provision: [{ type: 'permit' }],
      },
    };
    expect(() => validateResource(consent)).not.toThrow();
  });

  test('Validate BackboneElement', () => {
    const address: Address = {
      use: 'home',
      type: 'both',
      text: '123 Main St',
      line: ['123 Main St'],
      city: 'Springfield',
      district: 'Springfield',
      state: 'IL',
      postalCode: '62704',
      country: 'USA',
    };
    expect(() => validateTypedValue({ type: 'Address', value: address })).not.toThrow();

    expect(() => validateTypedValue({ type: 'Address', value: { foo: 'bar' } })).toThrow(
      'Invalid additional property "foo" (Address.foo)'
    );
  });
});

function fail(reason: string): never {
  throw new Error(reason);
}
