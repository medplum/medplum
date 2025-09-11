// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { readJson } from '@medplum/definitions';
import { Attachment, Bundle, Coding, Observation, Patient, Questionnaire } from '@medplum/fhirtypes';
import { LOINC } from '../constants';
import { toTypedValue } from '../fhirpath/utils';
import { TypedValue } from '../types';
import { arrayify, sleep } from '../utils';
import { crawlTypedValue, crawlTypedValueAsync } from './crawler';
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
    crawlTypedValue(toTypedValue(patient), {
      visitProperty: (_parent, _key, _path, propertyValues) => {
        for (const propertyValue of propertyValues) {
          if (propertyValue) {
            for (const value of arrayify(propertyValue) as TypedValue[]) {
              if (value.type === 'Attachment') {
                attachments.push(value.value as Attachment);
              }
            }
          }
        }
      },
    });

    expect(attachments).toHaveLength(2);
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
            if (propertyValue) {
              for (const value of arrayify(propertyValue) as TypedValue[]) {
                if (value.type === 'Coding') {
                  resultCodes.push(value.value);
                }
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
          if (propertyValue) {
            for (const value of arrayify(propertyValue) as TypedValue[]) {
              if (value.type === 'Coding') {
                await sleep(1); // Simulate validating the coding
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

  test('SDC extensions in contained resources', async () => {
    const questionnaire: Questionnaire = {
      resourceType: 'Questionnaire',
      contained: [
        {
          resourceType: 'Patient',
          id: 'patTemplate',
          identifier: [
            {
              extension: [
                {
                  url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractContext',
                  valueString: "item.where(linkId = 'ihi').answer.value",
                },
                { url: 'http://example.com/other/identifier', valueString: 'foo/bar/baz/quux' },
              ],
              type: {
                text: 'National Identifier (IHI)',
              },
              system: 'http://example.org/nhio',
              _value: {
                extension: [
                  {
                    url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue',
                    valueString: 'first()',
                  },
                ],
              },
            },
          ],
          name: [
            {
              extension: [
                {
                  url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractContext',
                  valueString: "item.where(linkId = 'name')",
                },
              ],
              _text: {
                extension: [
                  {
                    url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue',
                    valueString: "item.where(linkId='given' or linkId='family').answer.value.join(' ')",
                  },
                ],
              },
              _family: {
                extension: [
                  {
                    url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue',
                    valueString: "item.where(linkId = 'family').answer.value.first()",
                  },
                ],
              },
              _given: [
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue',
                      valueString: "item.where(linkId = 'given').answer.value",
                    },
                  ],
                },
              ],
            },
          ],
          telecom: [
            {
              extension: [
                {
                  url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractContext',
                  valueString: "item.where(linkId = 'mobile-phone').answer.value",
                },
              ],
              system: 'phone',
              _value: {
                extension: [
                  {
                    url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue',
                    valueString: 'first()',
                  },
                ],
              },
              use: 'mobile',
            },
            {
              extension: [
                {
                  url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractContext',
                  valueString: "item.where(linkId = 'email').answer.value",
                },
              ],
              system: 'email',
              _value: {
                extension: [
                  {
                    url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue',
                    valueString: 'first()',
                  },
                ],
              },
              use: 'home',
            },
          ],
          gender: 'unknown',
          _gender: {
            extension: [
              {
                url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue',
                valueString: "item.where(linkId = 'gender').answer.value.first().code",
              },
            ],
          },
        },
        {
          resourceType: 'RelatedPerson',
          id: 'rpTemplate',
          patient: {
            _reference: {
              extension: [
                {
                  url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue',
                  valueString: '%NewPatientId',
                },
              ],
            },
          },
          relationship: [
            {
              coding: [
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue',
                      valueString: "item.where(linkId = 'relationship').answer.value.first()",
                    },
                  ],
                },
              ],
            },
          ],
          name: [
            {
              _text: {
                extension: [
                  {
                    url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue',
                    valueString: "item.where(linkId = 'contact-name').answer.value.first()",
                  },
                ],
              },
            },
          ],
          telecom: [
            {
              extension: [
                {
                  url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractContext',
                  valueString: "item.where(linkId = 'phone').answer.value",
                },
              ],
              system: 'phone',
              _value: {
                extension: [
                  {
                    url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue',
                    valueString: 'first()',
                  },
                ],
              },
              use: 'mobile',
            },
          ],
        },
        {
          resourceType: 'Observation',
          id: 'obsTemplateHeight',
          status: 'final',
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
          code: { coding: [{ system: 'http://loinc.org', code: '8302-2', display: 'Body height' }] },
          subject: {
            extension: [
              {
                url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue',
                valueString: '%NewPatientId',
              },
            ],
          },
          effectiveDateTime: '1900-01-01',
          _effectiveDateTime: {
            extension: [
              {
                url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue',
                valueString: '%resource.authored',
              },
            ],
          },
          _issued: {
            extension: [
              {
                url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue',
                valueString: '%resource.authored',
              },
            ],
          },
          performer: [
            {
              extension: [
                {
                  url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue',
                  valueString: '%resource.author',
                },
              ],
            },
          ],
          valueQuantity: {
            _value: {
              extension: [
                {
                  url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue',
                  valueString: 'answer.value * 100',
                },
              ],
            },
            unit: 'cm',
            system: 'http://unitsofmeasure.org',
            code: 'cm',
          },
          derivedFrom: [
            {
              extension: [
                {
                  url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractContext',
                  valueString: '%resource.id',
                },
              ],
              _reference: {
                extension: [
                  {
                    url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue',
                    valueString: "'QuestionnaireResponse/' + %resource.id",
                  },
                ],
              },
            },
          ],
        },
        {
          resourceType: 'Observation',
          id: 'obsTemplateWeight',
          status: 'final',
          category: [
            {
              coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' }],
            },
          ],
          code: { coding: [{ system: 'http://loinc.org', code: '29463-7', display: 'Weight' }] },
          subject: {
            extension: [
              {
                url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue',
                valueString: '%NewPatientId',
              },
            ],
          },
          effectiveDateTime: '1900-01-01',
          _effectiveDateTime: {
            extension: [
              {
                url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue',
                valueString: '%resource.authored',
              },
            ],
          },
          _issued: {
            extension: [
              {
                url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue',
                valueString: '%resource.authored',
              },
            ],
          },
          performer: [
            {
              extension: [
                {
                  url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue',
                  valueString: '%resource.author',
                },
              ],
            },
          ],
          valueQuantity: {
            _value: {
              extension: [
                {
                  url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue',
                  valueString: 'answer.value',
                },
              ],
            },
            unit: 'kg',
            system: 'http://unitsofmeasure.org',
            code: 'kg',
          },
          derivedFrom: [
            {
              extension: [
                {
                  url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractContext',
                  valueString: '%resource.id',
                },
              ],
              _reference: {
                extension: [
                  {
                    url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue',
                    valueString: "'QuestionnaireResponse/' + %resource.id",
                  },
                ],
              },
            },
          ],
        },
      ],
      extension: [
        {
          url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-extractAllocateId',
          valueString: 'NewPatientId',
        },
      ],
      url: 'http://hl7.org/fhir/uv/sdc/Questionnaire/extract-complex-template',
      version: '4.0.0',
      name: 'ExtractComplexTemplate',
      title: 'Complex Extract Demonstration - Template',
      status: 'draft',
      experimental: true,
      date: '2025-09-04T17:57:37+00:00',
      publisher: 'HL7 International / FHIR Infrastructure',
      description: 'Complex template-based extraction example',
      item: [
        {
          extension: [
            {
              extension: [
                {
                  url: 'template',
                  valueReference: { reference: '#patTemplate' },
                },
                {
                  url: 'fullUrl',
                  valueString: '%NewPatientId',
                },
              ],
              url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtract',
            },
          ],
          linkId: 'patient',
          text: 'Patient Information',
          type: 'group',
          item: [
            {
              linkId: 'name',
              text: 'Name',
              type: 'group',
              repeats: true,
              item: [
                { linkId: 'given', text: 'Given Name(s)', type: 'string', repeats: true },
                { linkId: 'family', text: 'Family/Surname', type: 'string' },
              ],
            },
            {
              linkId: 'gender',
              text: 'Gender',
              type: 'choice',
              answerValueSet: 'http://hl7.org/fhir/ValueSet/administrative-gender',
            },
            { linkId: 'dob', text: 'Date of Birth', type: 'date' },
            { linkId: 'ihi', text: 'National Identifier (IHI)', type: 'string' },
            { linkId: 'mobile-phone', text: 'Mobile Phone number', type: 'string' },
            { linkId: 'email', text: 'Email address', type: 'string' },
          ],
        },
        {
          extension: [
            {
              extension: [{ url: 'template', valueReference: { reference: '#rpTemplate' } }],
              url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtract',
            },
          ],
          linkId: 'contacts',
          text: 'Contacts',
          type: 'group',
          repeats: true,
          item: [
            { linkId: 'contact-name', text: 'Name', type: 'string' },
            {
              linkId: 'relationship',
              text: 'Relationship',
              type: 'choice',
              answerValueSet: 'http://hl7.org/fhir/ValueSet/patient-contactrelationship',
            },
            { linkId: 'phone', text: 'Phone', type: 'string' },
          ],
        },
        {
          linkId: 'obs',
          text: 'Observations',
          type: 'group',
          item: [
            {
              extension: [
                {
                  url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtract',
                  extension: [
                    {
                      url: 'template',
                      valueReference: { reference: '#obsTemplateHeight' },
                    },
                  ],
                },
              ],
              linkId: 'height',
              text: 'What is your current height (m)',
              type: 'decimal',
            },
            {
              extension: [
                {
                  url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtract',
                  extension: [
                    {
                      url: 'template',
                      valueReference: { reference: '#obsTemplateWeight' },
                    },
                  ],
                },
              ],
              linkId: 'weight',
              text: 'What is your current weight (kg)',
              type: 'decimal',
            },
          ],
        },
      ],
    } as unknown as Questionnaire;

    crawlTypedValue(
      toTypedValue(questionnaire.contained?.[0]),
      // toTypedValue({ ...questionnaire, contained: undefined }),
      {
        visitProperty(parent, key, path, propertyValues, _schema) {
          if (
            Array.isArray(propertyValues[0]) &&
            path.endsWith('.extension') &&
            !path.endsWith('.extension.extension')
          ) {
            console.log(path, JSON.stringify(propertyValues[0], null, 2), parent);
          }
        },
      },
      { skipMissingProperties: true }
    );
  });
});
