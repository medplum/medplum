// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference } from '@medplum/core';
import {
  Bundle,
  BundleEntry,
  Expression,
  OperationOutcome,
  OperationOutcomeIssue,
  Organization,
  Parameters,
  Patient,
  Questionnaire,
  QuestionnaireResponse,
} from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { createTestProject } from '../../test.setup';
import { Repository } from '../repo';

const extractExtension = 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtract';
const allocIdExtension = 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-extractAllocateId';
const contextExtension = 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractContext';
const valueExtension = 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue';

describe('QuestionnaireResponse/$extract', () => {
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
                { url: contextExtension, valueString: "item.where(linkId = 'ihi').answer.value" },
                { url: 'http://example.com/other/identifier', valueString: 'foo/bar/baz/quux' },
              ],
              type: { text: 'National Identifier (IHI)' },
              system: 'http://example.org/nhio',
              _value: {
                extension: [{ url: valueExtension, valueString: 'first()' }],
              },
            },
          ],
          name: [
            {
              extension: [{ url: contextExtension, valueString: "item.where(linkId = 'name')" }],
              _text: {
                extension: [
                  {
                    url: valueExtension,
                    valueString: "item.where(linkId='given' or linkId='family').answer.value.join(' ')",
                  },
                ],
              },
              _family: {
                extension: [{ url: valueExtension, valueString: "item.where(linkId = 'family').answer.value.first()" }],
              },
              _given: [
                {
                  extension: [{ url: valueExtension, valueString: "item.where(linkId = 'given').answer.value" }],
                },
              ],
            },
          ],
          telecom: [
            {
              extension: [{ url: contextExtension, valueString: "item.where(linkId = 'mobile-phone').answer.value" }],
              system: 'phone',
              _value: { extension: [{ url: valueExtension, valueString: 'first()' }] },
              use: 'mobile',
            },
            {
              extension: [{ url: contextExtension, valueString: "item.where(linkId = 'email').answer.value" }],
              system: 'email',
              _value: { extension: [{ url: valueExtension, valueString: 'first()' }] },
              use: 'home',
            },
          ],
          gender: 'unknown',
          _gender: {
            extension: [
              { url: valueExtension, valueString: "item.where(linkId = 'gender').answer.value.first().code" },
            ],
          },
        },
        {
          resourceType: 'RelatedPerson',
          id: 'rpTemplate',
          patient: {
            _reference: { extension: [{ url: valueExtension, valueString: '%NewPatientId' }] },
          },
          relationship: [
            {
              coding: [
                {
                  extension: [
                    { url: valueExtension, valueString: "item.where(linkId = 'relationship').answer.value.first()" },
                  ],
                },
              ],
            },
          ],
          name: [
            {
              _text: {
                extension: [
                  { url: valueExtension, valueString: "item.where(linkId = 'contact-name').answer.value.first()" },
                ],
              },
            },
          ],
          telecom: [
            {
              extension: [{ url: contextExtension, valueString: "item.where(linkId = 'phone').answer.value" }],
              system: 'phone',
              _value: { extension: [{ url: valueExtension, valueString: 'first()' }] },
              use: 'mobile',
            },
          ],
        },
        {
          resourceType: 'Observation',
          id: 'obsTemplateHeight',
          status: 'final',
          category: [
            { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' }] },
          ],
          code: { coding: [{ system: 'http://loinc.org', code: '8302-2', display: 'Body height' }] },
          subject: {
            _reference: { extension: [{ url: valueExtension, valueString: `%NewPatientId` }] },
          },
          effectiveDateTime: '1900-01-01',
          _effectiveDateTime: { extension: [{ url: valueExtension, valueString: '%resource.authored' }] },
          _issued: { extension: [{ url: valueExtension, valueString: '%resource.authored' }] },
          performer: [{ extension: [{ url: valueExtension, valueString: '%resource.author' }] }],
          valueQuantity: {
            _value: { extension: [{ url: valueExtension, valueString: '(answer.value * 2.54).round()' }] },
            unit: 'cm',
            system: 'http://unitsofmeasure.org',
            code: 'cm',
          },
          derivedFrom: [
            {
              extension: [{ url: contextExtension, valueString: '%resource.id' }],
              _reference: {
                extension: [{ url: valueExtension, valueString: "'QuestionnaireResponse/' + %resource.id" }],
              },
            },
          ],
        },
        {
          resourceType: 'Observation',
          id: 'obsTemplateWeight',
          status: 'final',
          category: [
            { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' }] },
          ],
          code: { coding: [{ system: 'http://loinc.org', code: '29463-7', display: 'Weight' }] },
          subject: { _reference: { extension: [{ url: valueExtension, valueString: `%NewPatientId` }] } },
          effectiveDateTime: '1900-01-01',
          _effectiveDateTime: { extension: [{ url: valueExtension, valueString: '%resource.authored' }] },
          _issued: { extension: [{ url: valueExtension, valueString: '%resource.authored' }] },
          performer: [{ extension: [{ url: valueExtension, valueString: '%resource.author' }] }],
          valueQuantity: {
            _value: { extension: [{ url: valueExtension, valueString: '(answer.value * 0.454).round(1)' }] },
            unit: 'kg',
            system: 'http://unitsofmeasure.org',
            code: 'kg',
          },
          derivedFrom: [
            {
              extension: [{ url: contextExtension, valueString: '%resource.id' }],
              _reference: {
                extension: [{ url: valueExtension, valueString: "'QuestionnaireResponse/' + %resource.id" }],
              },
            },
          ],
        },
      ],
      extension: [{ url: allocIdExtension, valueString: 'NewPatientId' }],
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
              url: extractExtension,
              extension: [
                { url: 'template', valueReference: { reference: '#patTemplate' } },
                { url: 'fullUrl', valueString: `%NewPatientId` },
              ],
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
            { url: extractExtension, extension: [{ url: 'template', valueReference: { reference: '#rpTemplate' } }] },
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
                  url: extractExtension,
                  extension: [{ url: 'template', valueReference: { reference: '#obsTemplateHeight' } }],
                },
              ],
              linkId: 'height',
              text: 'What is your current height (in)',
              type: 'decimal',
            },
            {
              extension: [
                {
                  url: extractExtension,
                  extension: [{ url: 'template', valueReference: { reference: '#obsTemplateWeight' } }],
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
            { linkId: 'dob', answer: [{ valueDate: '1832-01-23' }] },
            { linkId: 'ihi', answer: [{ valueString: '012345' }] },
            { linkId: 'mobile-phone', answer: [{ valueString: '555-555-5555' }] },
          ],
        },
        {
          linkId: 'contacts',
          item: [
            { linkId: 'contact-name', answer: [{ valueString: 'Bureau of Land Management' }] },
            {
              linkId: 'relationship',
              answer: [{ valueCoding: { system: 'http://terminology.hl7.org/CodeSystem/v2-0131', code: 'F' } }],
            },
          ],
        },
        {
          linkId: 'contacts',
          item: [
            { linkId: 'contact-name', answer: [{ valueString: 'Nathaniel Cooley Chapman' }] },
            {
              linkId: 'relationship',
              answer: [{ valueCoding: { system: 'http://terminology.hl7.org/CodeSystem/v2-0131', code: 'N' } }],
            },
            { linkId: 'phone', answer: [{ valueString: '123-456-7890' }] },
          ],
        },
        {
          linkId: 'obs',
          item: [
            { linkId: 'height', answer: [{ valueDecimal: 66 }] },
            { linkId: 'weight', answer: [{ valueDecimal: 134 }] },
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
      .set('Authorization', 'Bearer ' + accessToken)
      .send();
    expect(res.status).toBe(200);
    expect(res.body.resourceType).toBe('Bundle');
    const batch = res.body as Bundle;

    expect(batch.type).toBe('transaction');
    expect(batch.entry).toHaveLength(5);
    const [patientEntry, agencyEntry, contactEntry, heightEntry, weightEntry] = batch.entry as BundleEntry[];

    expect(patientEntry).toMatchObject<BundleEntry>({
      fullUrl: expect.stringMatching(/urn:uuid:\w{8}-\w{4}-\w{4}-\w{4}-\w{12}/),
      request: { method: 'POST', url: 'Patient' },
      resource: {
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
      },
    });
    const patientRef = patientEntry.fullUrl;

    expect(contactEntry).toMatchObject<BundleEntry>({
      fullUrl: expect.stringMatching(/urn:uuid:\w{8}-\w{4}-\w{4}-\w{4}-\w{12}/),
      request: { method: 'POST', url: 'RelatedPerson' },
      resource: {
        resourceType: 'RelatedPerson',
        patient: { reference: patientRef },
        relationship: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0131', code: 'N' }] }],
        name: [{ text: 'Nathaniel Cooley Chapman' }],
        telecom: [{ system: 'phone', use: 'mobile', value: '123-456-7890' }],
      },
    });

    expect(agencyEntry).toMatchObject<BundleEntry>({
      fullUrl: expect.stringMatching(/urn:uuid:\w{8}-\w{4}-\w{4}-\w{4}-\w{12}/),
      request: { method: 'POST', url: 'RelatedPerson' },
      resource: {
        resourceType: 'RelatedPerson',
        patient: { reference: patientRef },
        relationship: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0131', code: 'F' }] }],
        name: [{ text: 'Bureau of Land Management' }],
      },
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

  test('Success at type level with passed in resources', async () => {
    const res = await request(app)
      .post(`/fhir/R4/QuestionnaireResponse/$extract`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'questionnaire', resource: questionnaire },
          { name: 'questionnaire-response', resource: { ...response, questionnaire: undefined } },
        ],
      } satisfies Parameters);
    expect(res.status).toBe(200);
    expect(res.body.resourceType).toBe('Bundle');
    const batch = res.body as Bundle;

    expect(batch.type).toBe('transaction');
    expect(batch.entry).toHaveLength(5);
    expect(batch.entry?.map((e) => e.request)).toStrictEqual([
      { method: 'POST', url: 'Patient' },
      { method: 'POST', url: 'RelatedPerson' },
      { method: 'POST', url: 'RelatedPerson' },
      { method: 'POST', url: 'Observation' },
      { method: 'POST', url: 'Observation' },
    ]);
  });

  test('QuestionnaireResponse must be specified', async () => {
    const res = await request(app)
      .post(`/fhir/R4/QuestionnaireResponse/$extract`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'questionnaire', resource: questionnaire }],
      } satisfies Parameters);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject<OperationOutcome>({
      resourceType: 'OperationOutcome',
      issue: [
        expect.objectContaining<OperationOutcomeIssue>({
          severity: 'error',
          code: 'invalid',
          details: { text: expect.stringContaining('QuestionnaireResponse') },
        }),
      ],
    });
  });

  test('Questionnaire must be specified', async () => {
    // Questionnaire must be present
    const res = await request(app)
      .post(`/fhir/R4/QuestionnaireResponse/$extract`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'questionnaire-response', resource: { ...response, questionnaire: undefined } }],
      } satisfies Parameters);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject<OperationOutcome>({
      resourceType: 'OperationOutcome',
      issue: [
        expect.objectContaining<OperationOutcomeIssue>({
          severity: 'error',
          code: 'invalid',
          expression: ['QuestionnaireResponse.questionnaire'],
        }),
      ],
    });

    // Specified Questionnaire must be valid
    const res2 = await request(app)
      .post(`/fhir/R4/QuestionnaireResponse/$extract`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'questionnaire-response',
            resource: { ...response, questionnaire: 'http://example.com/survey/fake' },
          },
        ],
      } satisfies Parameters);
    expect(res2.status).toBe(400);
    expect(res2.body).toMatchObject<OperationOutcome>({
      resourceType: 'OperationOutcome',
      issue: [
        expect.objectContaining<OperationOutcomeIssue>({
          severity: 'error',
          code: 'invalid',
          expression: ['QuestionnaireResponse.questionnaire'],
        }),
      ],
    });
  });

  test.each<[Expression | undefined, string]>([
    // Non-FHIRPath expression is rejected
    [{ expression: 'Patient?status=active', language: 'application/x-fhir-query' }, 'requires FHIRPath'],
    // Expression must be present
    [{ language: 'text/fhirpath' }, 'requires FHIRPath'],
    // Invalid type should be rejected
    [undefined, 'Invalid extraction context'],
  ])('Context extensions must contain valid FHIRPath expressions', async (valueExpression, errorMsg) => {
    const invalidQuestionnaire: Questionnaire = {
      resourceType: 'Questionnaire',
      status: 'unknown',
      item: [
        {
          linkId: 'invalid',
          type: 'string',
          extension: [{ url: contextExtension, valueExpression, valueBoolean: true }],
        },
      ],
    };
    const response: QuestionnaireResponse = {
      resourceType: 'QuestionnaireResponse',
      status: 'completed',
      item: [{ linkId: 'invalid', answer: [{ valueString: 'hi' }] }],
    };

    const res = await request(app)
      .post(`/fhir/R4/QuestionnaireResponse/$extract`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'questionnaire', resource: invalidQuestionnaire },
          { name: 'questionnaire-response', resource: response },
        ],
      } satisfies Parameters);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject<OperationOutcome>({
      resourceType: 'OperationOutcome',
      issue: [
        expect.objectContaining<OperationOutcomeIssue>({
          severity: 'error',
          code: 'invalid',
          expression: ['Questionnaire.item[0].extension[0]'],
          details: { text: expect.stringContaining(errorMsg) },
        }),
      ],
    });
  });

  test('Named expression is stored as context variable', async () => {
    const questionnaire: Questionnaire = {
      resourceType: 'Questionnaire',
      status: 'unknown',
      extension: [
        { url: contextExtension, valueExpression: { language: 'text/fhirpath', expression: `'bar'`, name: 'foo' } },
        { url: extractExtension, extension: [{ url: 'template', valueReference: { reference: '#org' } }] },
      ],
      contained: [
        {
          resourceType: 'Organization',
          id: 'org',
          _name: { extension: [{ url: valueExtension, valueString: '%foo' }] },
        } as unknown as Organization,
      ],
    };
    const response: QuestionnaireResponse = { resourceType: 'QuestionnaireResponse', status: 'completed' };

    const res = await request(app)
      .post(`/fhir/R4/QuestionnaireResponse/$extract`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'questionnaire', resource: questionnaire },
          { name: 'questionnaire-response', resource: response },
        ],
      } satisfies Parameters);
    expect(res.status).toBe(200);
    expect(res.body.resourceType).toBe('Bundle');
    const batch = res.body as Bundle;

    expect(batch.type).toBe('transaction');
    expect(batch.entry).toHaveLength(1);
    const entry = batch.entry?.[0] as BundleEntry;

    expect(entry.resource).toMatchObject<Organization>({ resourceType: 'Organization', name: 'bar' });
  });

  test('Extraction cannot begin on incorrect element', async () => {
    const questionnaire: Questionnaire = {
      resourceType: 'Questionnaire',
      status: 'unknown',
      identifier: [
        {
          system: 'http://example.com/id',
          value: 'extractable',
          extension: [
            { url: extractExtension, extension: [{ url: 'template', valueReference: { reference: '#org' } }] },
          ],
        },
      ],
      contained: [{ resourceType: 'Organization', id: 'org' }],
    };
    const response: QuestionnaireResponse = { resourceType: 'QuestionnaireResponse', status: 'completed' };

    const res = await request(app)
      .post(`/fhir/R4/QuestionnaireResponse/$extract`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'questionnaire', resource: questionnaire },
          { name: 'questionnaire-response', resource: response },
        ],
      } satisfies Parameters);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject<OperationOutcome>({
      resourceType: 'OperationOutcome',
      issue: [
        expect.objectContaining<OperationOutcomeIssue>({
          severity: 'error',
          code: 'invalid',
          expression: ['Questionnaire.identifier[0]'],
          details: { text: 'Extraction cannot begin on element of type Identifier' },
        }),
      ],
    });
  });

  test('Requires template resource', async () => {
    const questionnaire: Questionnaire = {
      resourceType: 'Questionnaire',
      status: 'unknown',
      extension: [
        { url: extractExtension, extension: [{ url: 'template', valueReference: { reference: '#wrongId' } }] },
      ],
      contained: [{ resourceType: 'Organization', id: 'org' }],
    };
    const response: QuestionnaireResponse = { resourceType: 'QuestionnaireResponse', status: 'completed' };

    const res = await request(app)
      .post(`/fhir/R4/QuestionnaireResponse/$extract`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'questionnaire', resource: questionnaire },
          { name: 'questionnaire-response', resource: response },
        ],
      } satisfies Parameters);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject<OperationOutcome>({
      resourceType: 'OperationOutcome',
      issue: [
        expect.objectContaining<OperationOutcomeIssue>({
          severity: 'error',
          code: 'invalid',
          expression: ['Questionnaire.extension[0]'],
          details: { text: expect.stringContaining('Missing template resource') },
        }),
      ],
    });
  });

  test('Honors resourceId field', async () => {
    const { id } = await repo.createResource<Patient>({ resourceType: 'Patient' });
    const questionnaire: Questionnaire = {
      resourceType: 'Questionnaire',
      status: 'unknown',
      extension: [
        {
          url: extractExtension,
          extension: [
            { url: 'template', valueReference: { reference: '#patient' } },
            { url: 'resourceId', valueString: `'${id}'` },
          ],
        },
      ],
      contained: [{ resourceType: 'Patient', id: 'patient', gender: 'unknown' }],
    };
    const response: QuestionnaireResponse = { resourceType: 'QuestionnaireResponse', status: 'completed' };

    const res = await request(app)
      .post(`/fhir/R4/QuestionnaireResponse/$extract`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'questionnaire', resource: questionnaire },
          { name: 'questionnaire-response', resource: response },
        ],
      } satisfies Parameters);
    expect(res.status).toBe(200);
    expect(res.body.resourceType).toBe('Bundle');
    const batch = res.body as Bundle;

    expect(batch.type).toBe('transaction');
    expect(batch.entry).toHaveLength(1);

    // Actually send the batch to ensure it correctly updates the intended resource
    const res2 = await request(app)
      .post(`/fhir/R4/`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send(batch);
    expect(res2.status).toBe(200);

    const patient = await repo.readResource<Patient>('Patient', id);
    expect(patient.gender).toBe('unknown');
  });
});
