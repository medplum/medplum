// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { readJson } from '@medplum/definitions';
import type { Attachment, Bundle, Coding, Observation, Patient } from '@medplum/fhirtypes';
import { LOINC } from '../constants';
import { toTypedValue } from '../fhirpath/utils';
import { arrayify, sleep } from '../utils';
import { crawlTypedValue, crawlTypedValueAsync, pathToJSONPointer } from './crawler';
import { indexStructureDefinitionBundle } from './types';

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
});

describe('pathToJSONPointer', () => {
  test('simple path', () => {
    expect(pathToJSONPointer('Patient.name')).toEqual('/Patient/name');
  });

  test('array indexing', () => {
    expect(pathToJSONPointer('Patient.identifier[0]')).toEqual('/Patient/identifier/0');
    expect(pathToJSONPointer('Patient.identifier[1]')).toEqual('/Patient/identifier/1');
  });

  test('deep nesting', () => {
    expect(pathToJSONPointer('Patient.contact[2].additionalName[0].given')).toEqual(
      '/Patient/contact/2/additionalName/0/given'
    );
  });
});
