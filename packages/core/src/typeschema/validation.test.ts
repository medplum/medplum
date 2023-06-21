import { Bundle, Observation, Patient, StructureDefinition } from '@medplum/fhirtypes';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { validateResource } from './validation';
import { indexStructureDefinitionBundle } from '../types';
import { readJson } from '@medplum/definitions';
import { loadDataTypes } from './types';

describe('FHIR resource validation', () => {
  let observationProfile: StructureDefinition;

  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-medplum.json') as Bundle);
    loadDataTypes(readJson('fhir/r4/profiles-types.json') as Bundle<StructureDefinition>);
    loadDataTypes(readJson('fhir/r4/profiles-resources.json') as Bundle<StructureDefinition>);

    observationProfile = JSON.parse(
      readFileSync(resolve(__dirname, '__test__', 'us-core-blood-pressure.json'), 'utf8')
    );
  });

  test('Invalid resource', () => {
    expect(() => {
      validateResource(undefined as unknown as Patient);
    }).toThrow();
    expect(() => {
      validateResource({} as unknown as Patient);
    }).toThrow();
  });

  test('Valid base resource', () => {
    const patient: Patient = {
      resourceType: 'Patient',
      gender: 'unknown',
      birthDate: '1949-08-14',
    };
    expect(() => {
      validateResource(patient);
    }).not.toThrow();
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
    expect(() => {
      validateResource(invalidMultiple);
    }).toThrow();
    expect(() => {
      validateResource(invalidSingle);
    }).toThrow();
  });

  test('Invalid value type', () => {
    const invalidType: Patient = {
      resourceType: 'Patient',
      birthDate: Date.parse('1949-08-14'),
    } as unknown as Patient;
    expect(() => {
      validateResource(invalidType);
    }).toThrow();
  });

  test('Invalid string format', () => {
    const invalidFormat: Patient = {
      resourceType: 'Patient',
      birthDate: 'Aug 14, 1949',
    };
    expect(() => {
      validateResource(invalidFormat);
    }).toThrow();
  });

  test('Invalid numeric value', () => {
    const patientExtension: Patient = {
      resourceType: 'Patient',
      multipleBirthInteger: 4.2,
    };
    expect(() => {
      validateResource(patientExtension);
    }).toThrow();
  });

  test('Invalid extraneous property', () => {
    const invalidFormat = {
      resourceType: 'Patient',
      foo: 'bar',
    } as unknown as Patient;
    expect(() => {
      validateResource(invalidFormat);
    }).toThrow();
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
    expect(() => {
      validateResource(primitiveExtension);
    }).not.toThrow();
    expect(() => {
      validateResource(choiceType);
    }).not.toThrow();
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

  test('Valid resource under constraining profile', () => {
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
        {
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

    expect(() => {
      validateResource(observation, observationProfile);
    }).not.toThrow();
  });

  test('StructureDefinition', () => {
    const structureDefinition = readJson('fhir/r4/profiles-resources.json') as Bundle;
    expect(() => {
      validateResource(structureDefinition);
    }).not.toThrow();
  });
});
