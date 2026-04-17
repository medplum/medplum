// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { readJson } from '@medplum/definitions';
import type { Attachment, Bundle, Coding, Observation, Patient, StructureDefinition } from '@medplum/fhirtypes';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LOINC } from '../constants';
import { toTypedValue } from '../fhirpath/utils';
import { arrayify, sleep } from '../utils';
import { crawlTypedValue, crawlTypedValueAsync, pathToJSONPointer } from './crawler';
import type { InternalTypeSchema } from './types';
import { indexStructureDefinitionBundle, parseStructureDefinition } from './types';

describe('ResourceCrawler', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
  });

  test('Simple case', () => {
    let enteredObject = false;
    let exitedObject = false;
    let enteredResource = false;
    let exitedResource = false;

    crawlTypedValue(toTypedValue({ resourceType: 'Patient' }), {
      onEnterObject: () => (enteredObject = true),
      onExitObject: () => (exitedObject = true),
      onEnterResource: () => (enteredResource = true),
      onExitResource: () => (exitedResource = true),
      visitProperty: () => {},
    });

    expect(enteredObject).toBe(true);
    expect(exitedObject).toBe(true);
    expect(enteredResource).toBe(true);
    expect(exitedResource).toBe(true);
  });

  test('Attachment finder', () => {
    const patient: Patient = {
      resourceType: 'Patient',
      photo: [
        {
          contentType: 'image/png',
          url: 'https://example.com/photo.png',
        },
        {
          contentType: 'image/png',
          data: 'base64data',
        },
      ],
    };

    const attachments: Attachment[] = [];
    const paths: string[] = [];
    crawlTypedValue(toTypedValue(patient), {
      visitProperty: (_parent, _key, _path, propertyValues) => {
        for (const propertyValue of propertyValues) {
          for (const value of arrayify(propertyValue)) {
            if (value.type === 'Attachment') {
              attachments.push(value.value as Attachment);
              paths.push(value.path);
            }
          }
        }
      },
    });

    expect(attachments).toHaveLength(2);
    expect(paths).toEqual(['Patient.photo[0]', 'Patient.photo[1]']);
  });

  test('Async crawler over only existing properties', async () => {
    const patient: Patient = {
      resourceType: 'Patient',
      photo: [
        {
          contentType: 'image/png',
          url: 'https://example.com/photo.png',
        },
        {
          contentType: 'image/png',
          data: 'base64data',
        },
      ],
    };

    const paths: string[] = [];
    await crawlTypedValueAsync(
      toTypedValue(patient),
      {
        visitPropertyAsync: async (_parent, _key, path, _propertyValues) => {
          await sleep(5);
          paths.push(path);
        },
      },
      { skipMissingProperties: true }
    );

    expect(paths).toContain('Patient.photo.contentType');
    expect(paths).not.toContain('Patient.gender');
  });

  test('New sync signature', () => {
    const obs: Observation = {
      resourceType: 'Observation',
      status: 'final',
      code: {
        coding: [{ system: LOINC, code: '85354-9' }],
      },
      component: [
        {
          code: {
            coding: [{ system: LOINC, code: '8480-6' }],
          },
          valueQuantity: { value: 120, code: 'mm[Hg]' },
        },
        {
          code: {
            coding: [{ system: LOINC, code: '8462-4' }],
          },
          valueQuantity: { value: 80, code: 'mm[Hg]' },
        },
      ],
    };

    const resultCodes: Coding[] = [];
    crawlTypedValue(
      toTypedValue(obs),
      {
        visitProperty: (_parent, _key, _path, propertyValues) => {
          for (const propertyValue of propertyValues) {
            for (const value of arrayify(propertyValue)) {
              if (value.type === 'Coding') {
                resultCodes.push(value.value);
              }
            }
          }
        },
      },
      { initialPath: 'component' }
    );

    expect(resultCodes).toStrictEqual(
      expect.arrayContaining<Coding>([
        { system: LOINC, code: '8480-6' },
        { system: LOINC, code: '8462-4' },
      ])
    );
  });

  test('New async signature', async () => {
    const obs: Observation = {
      resourceType: 'Observation',
      status: 'final',
      code: {
        coding: [{ system: LOINC, code: '85354-9' }],
      },
      component: [
        {
          code: {
            coding: [{ system: LOINC, code: '8480-6' }],
          },
          valueQuantity: { value: 120, code: 'mm[Hg]' },
        },
        {
          code: {
            coding: [{ system: LOINC, code: '8462-4' }],
          },
          valueQuantity: { value: 80, code: 'mm[Hg]' },
        },
      ],
    };

    const resultCodes: Coding[] = [];
    await crawlTypedValueAsync(
      toTypedValue(obs),
      {
        visitPropertyAsync: async (_parent, _key, _path, propertyValue) => {
          for (const value of arrayify(propertyValue)) {
            if (value.type === 'Coding') {
              await sleep(1); // Simulate validating the coding
              resultCodes.push(value.value);
            }
          }
        },
      },
      { initialPath: 'component' }
    );

    expect(resultCodes).toStrictEqual(
      expect.arrayContaining<Coding>([
        { system: LOINC, code: '8480-6' },
        { system: LOINC, code: '8462-4' },
      ])
    );
  });

  // An important aspect of US Core Patient profile is that it changes a nested property (Patient.communication.language)
  // to use a different ValueSet than the base FHIR definition. Nested properties are more complex to handle in the crawler,
  // since they must fetch an intermediate type schema. if this is done in a way that forgets to consider the profile,
  // then the base FHIR definition will be used instead of the profile definition.
  describe('crawling patient profile', () => {
    let usCorePatientSD: StructureDefinition;
    let usCorePatientProfile: InternalTypeSchema;

    beforeAll(() => {
      usCorePatientSD = JSON.parse(readFileSync(resolve(__dirname, '__test__', 'us-core-patient.json'), 'utf8'));
      usCorePatientProfile = parseStructureDefinition(usCorePatientSD);
    });

    test.each([
      ['no profile', () => undefined, 'http://hl7.org/fhir/ValueSet/languages'],
      ['US Core patient profile', () => usCorePatientProfile, 'http://hl7.org/fhir/us/core/ValueSet/simple-language'],
    ])('with %s', async (_, getProfile, expectedValueSet) => {
      const patient: Patient = {
        resourceType: 'Patient',
        communication: [{ language: { coding: [{ system: 'urn:ietf:bcp:47', code: 'en' }] } }],
      };

      let visitedSync = false;
      function checker(key: string, path: string, schema: InternalTypeSchema): boolean {
        let visitedLang = false;
        if (path === 'Patient.communication.language') {
          visitedLang = true;
          expect(schema.elements[key].binding?.valueSet).toBe(expectedValueSet);
        }
        return visitedLang;
      }

      crawlTypedValue(
        toTypedValue(patient),
        {
          visitProperty: (_parent, key, path, _propertyValues, schema) => {
            visitedSync ||= checker(key, path, schema);
          },
        },
        { schema: getProfile() }
      );
      expect(visitedSync).toBe(true);

      let visitedAsync = false;
      await crawlTypedValueAsync(
        toTypedValue(patient),
        {
          visitPropertyAsync: async (_parent, key, path, _propertyValues, schema) => {
            visitedAsync ||= checker(key, path, schema);
          },
        },
        { schema: getProfile() }
      );
      expect(visitedAsync).toBe(true);
    });
  });

  describe('crawling Observation profile', () => {
    let smokingStatusSD: StructureDefinition;
    let smokingStatusProfile: InternalTypeSchema;

    beforeAll(() => {
      smokingStatusSD = JSON.parse(readFileSync(resolve(__dirname, '__test__', 'us-core-smoking-status.json'), 'utf8'));
      smokingStatusProfile = parseStructureDefinition(smokingStatusSD);
    });

    test.each([
      ['no profile', () => undefined, 'http://hl7.org/fhir/ValueSet/observation-status|4.0.1'],
      [
        'US Core Smoking Status profile',
        () => smokingStatusProfile,
        'http://hl7.org/fhir/us/core/ValueSet/us-core-observation-smoking-status-status',
      ],
    ])('with %s', async (_, getProfile, expectedValueSet) => {
      const obs: Observation = {
        resourceType: 'Observation',
        status: 'final',
        code: {
          coding: [{ system: LOINC, code: '72166-2' }],
        },
        valueCodeableConcept: {
          coding: [{ system: 'http://snomed.info/sct', code: '266919005' }],
        },
      };

      function checker(key: string, path: string, schema: InternalTypeSchema): boolean {
        let visitedLang = false;
        if (path === 'Observation.status') {
          visitedLang = true;
          expect(schema.elements[key].binding?.valueSet).toBe(expectedValueSet);
        }
        return visitedLang;
      }

      let visitedSync = false;
      crawlTypedValue(
        toTypedValue(obs),
        {
          visitProperty: (_parent, key, path, _propertyValues, schema) => {
            visitedSync ||= checker(key, path, schema);
          },
        },
        { schema: getProfile() }
      );
      expect(visitedSync).toBe(true);

      let visitedAsync = false;
      await crawlTypedValueAsync(
        toTypedValue(obs),
        {
          visitPropertyAsync: async (_parent, key, path, _propertyValues, schema) => {
            visitedAsync ||= checker(key, path, schema);
          },
        },
        { schema: getProfile() }
      );
      expect(visitedAsync).toBe(true);
    });
  });
});

describe('pathToJSONPointer', () => {
  test('simple path', () => {
    expect(pathToJSONPointer('Patient.name')).toEqual('/name');
  });

  test('array indexing', () => {
    expect(pathToJSONPointer('Patient.identifier[0]')).toEqual('/identifier/0');
    expect(pathToJSONPointer('Patient.identifier[1]')).toEqual('/identifier/1');
  });

  test('deep nesting', () => {
    expect(pathToJSONPointer('Patient.contact[2].additionalName[0].given')).toEqual(
      '/contact/2/additionalName/0/given'
    );
  });
});
