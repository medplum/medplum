// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference } from '@medplum/core';
import { Bundle, BundleEntry, Patient, Questionnaire, QuestionnaireResponse, RelatedPerson } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { createTestProject } from '../../test.setup';
import { Repository } from '../repo';

describe('Expand', () => {
  const app = express();
  let accessToken: string;
  let repo: Repository;

  let questionnaire: Questionnaire;
  let response: QuestionnaireResponse;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    ({ accessToken, repo } = await createTestProject({ withAccessToken: true, withRepo: true }));

    questionnaire = await repo.createResource({
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
            _reference: {
              extension: [
                {
                  url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue',
                  valueString: `%NewPatientId`,
                },
              ],
            },
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
                  valueString: '(answer.value * 2.54).round()',
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
            _reference: {
              extension: [
                {
                  url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue',
                  valueString: `%NewPatientId`,
                },
              ],
            },
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
                  valueString: '(answer.value * 0.454).round(1)',
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
                  valueString: `%NewPatientId`,
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
              text: 'What is your current height (in)',
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
              text: 'What is your current weight (lb)',
              type: 'decimal',
            },
          ],
        },
      ],
    } as unknown as Questionnaire);

    response = await repo.createResource<QuestionnaireResponse>({
      resourceType: 'QuestionnaireResponse',
      status: 'completed',
      questionnaire: questionnaire.url as string,
      author: { reference: 'Practitioner/author' },
      authored: '2025-09-16T12:34:56.000-07:00',
      item: [
        {
          linkId: 'patient',
          item: [
            {
              linkId: 'name',
              item: [
                { linkId: 'given', answer: [{ valueString: 'John' }, { valueString: 'Jacob' }] },
                { linkId: 'family', answer: [{ valueString: 'Jingleheimer-Schmidt' }] },
              ],
            },
            {
              linkId: 'name',
              item: [
                { linkId: 'given', answer: [{ valueString: 'Johnny' }] },
                { linkId: 'family', answer: [{ valueString: 'Appleseed' }] },
              ],
            },
            {
              linkId: 'gender',
              answer: [{ valueCoding: { system: 'http://hl7.org/fhir/administrative-gender', code: 'male' } }],
            },
            {
              linkId: 'dob',
              answer: [{ valueDate: '1832-01-23' }],
            },
            {
              linkId: 'ihi',
              answer: [{ valueString: '012345' }],
            },
            {
              linkId: 'mobile-phone',
              answer: [{ valueString: '555-555-5555' }],
            },
          ],
        },
        {
          linkId: 'contacts',
          item: [
            {
              linkId: 'contact-name',
              answer: [{ valueString: 'Bureau of Land Management' }],
            },
            {
              linkId: 'relationship',
              answer: [{ valueCoding: { system: 'http://terminology.hl7.org/CodeSystem/v2-0131', code: 'F' } }],
            },
          ],
        },
        {
          linkId: 'contacts',
          item: [
            {
              linkId: 'contact-name',
              answer: [{ valueString: 'Nathaniel Cooley Chapman' }],
            },
            {
              linkId: 'relationship',
              answer: [{ valueCoding: { system: 'http://terminology.hl7.org/CodeSystem/v2-0131', code: 'N' } }],
            },
            {
              linkId: 'phone',
              answer: [{ valueString: '123-456-7890' }],
            },
          ],
        },
        {
          linkId: 'obs',
          item: [
            {
              linkId: 'height',
              answer: [{ valueDecimal: 66 }],
            },
            {
              linkId: 'weight',
              answer: [{ valueDecimal: 134 }],
            },
          ],
        },
      ],
    });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Success', async () => {
    const res = await request(app)
      .get(`/fhir/R4/QuestionnaireResponse/${response.id}/$extract`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
    expect(res.body.resourceType).toBe('Bundle');
    const batch = res.body as Bundle;

    expect(batch.type).toBe('transaction');
    expect(batch.entry).toHaveLength(5);
    const [patientEntry, agencyEntry, contactEntry, heightEntry, weightEntry] = batch.entry as BundleEntry[];

    expect(patientEntry).toMatchObject<BundleEntry>({
      fullUrl: expect.stringMatching(/urn:uuid:\w{8}-\w{4}-\w{4}-\w{4}-\w{12}/),
      request: { method: 'POST', url: 'Patient' },
      resource: expect.objectContaining<Patient>({
        resourceType: 'Patient',
        identifier: [
          {
            extension: [{ url: 'http://example.com/other/identifier', valueString: 'foo/bar/baz/quux' }],
            type: { text: 'National Identifier (IHI)' },
            system: 'http://example.org/nhio',
            value: '012345',
          },
        ],
        name: [
          { given: ['John', 'Jacob'], family: 'Jingleheimer-Schmidt', text: 'John Jacob Jingleheimer-Schmidt' },
          { given: ['Johnny'], family: 'Appleseed', text: 'Johnny Appleseed' },
        ],
        telecom: [{ system: 'phone', use: 'mobile', value: '555-555-5555' }],
        gender: 'male',
      }),
    });
    const patientRef = patientEntry.fullUrl;

    expect(contactEntry).toMatchObject<BundleEntry>({
      fullUrl: expect.stringMatching(/urn:uuid:\w{8}-\w{4}-\w{4}-\w{4}-\w{12}/),
      request: { method: 'POST', url: 'RelatedPerson' },
      resource: expect.objectContaining<RelatedPerson>({
        resourceType: 'RelatedPerson',
        patient: { reference: patientRef },
        relationship: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0131', code: 'N' }] }],
        name: [{ text: 'Nathaniel Cooley Chapman' }],
        telecom: [{ system: 'phone', use: 'mobile', value: '123-456-7890' }],
      }),
    });

    expect(agencyEntry).toMatchObject<BundleEntry>({
      fullUrl: expect.stringMatching(/urn:uuid:\w{8}-\w{4}-\w{4}-\w{4}-\w{12}/),
      request: { method: 'POST', url: 'RelatedPerson' },
      resource: expect.objectContaining<RelatedPerson>({
        resourceType: 'RelatedPerson',
        patient: { reference: patientRef },
        relationship: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0131', code: 'F' }] }],
        name: [{ text: 'Bureau of Land Management' }],
      }),
    });

    expect(heightEntry).toMatchObject<BundleEntry>({
      fullUrl: expect.stringMatching(/urn:uuid:\w{8}-\w{4}-\w{4}-\w{4}-\w{12}/),
      request: { method: 'POST', url: 'Observation' },
      resource: {
        resourceType: 'Observation',
        status: 'final',
        category: [
          { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' }] },
        ],
        code: { coding: [{ system: 'http://loinc.org', code: '8302-2', display: 'Body height' }] },
        subject: { reference: patientRef },
        effectiveDateTime: '2025-09-16T12:34:56.000-07:00',
        performer: [{ reference: 'Practitioner/author' }],
        valueQuantity: { value: 168, unit: 'cm', system: 'http://unitsofmeasure.org', code: 'cm' },
        derivedFrom: [createReference(response)],
        issued: '2025-09-16T12:34:56.000-07:00',
      },
    });

    expect(weightEntry).toMatchObject<BundleEntry>({
      fullUrl: expect.stringMatching(/urn:uuid:\w{8}-\w{4}-\w{4}-\w{4}-\w{12}/),
      request: { method: 'POST', url: 'Observation' },
      resource: {
        resourceType: 'Observation',
        status: 'final',
        category: [
          { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' }] },
        ],
        code: { coding: [{ system: 'http://loinc.org', code: '29463-7', display: 'Weight' }] },
        subject: { reference: patientRef },
        effectiveDateTime: '2025-09-16T12:34:56.000-07:00',
        performer: [{ reference: 'Practitioner/author' }],
        valueQuantity: { value: 60.8, unit: 'kg', system: 'http://unitsofmeasure.org', code: 'kg' },
        derivedFrom: [createReference(response)],
        issued: '2025-09-16T12:34:56.000-07:00',
      },
    });
  });
});
