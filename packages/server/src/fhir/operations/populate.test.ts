// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type {
  Encounter,
  OperationOutcome,
  OperationOutcomeIssue,
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
import type { Repository } from '../repo';

const launchContextExtension = 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-launchContext';
const initialExpressionExtension = 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-initialExpression';
const itemPopulationContextExtension =
  'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-itemPopulationContext';

describe('Questionnaire/$populate', () => {
  const app = express();
  let accessToken: string;
  let repo: Repository;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    ({ accessToken, repo } = await createTestProject({ withAccessToken: true, withRepo: true }));
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Basic population with initialExpression', async () => {
    const patient = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['John'], family: 'Doe' }],
      birthDate: '1990-01-15',
      gender: 'male',
    });

    const questionnaire = await repo.createResource<Questionnaire>({
      resourceType: 'Questionnaire',
      status: 'active',
      url: 'http://example.com/questionnaire/patient-info',
      extension: [
        {
          url: launchContextExtension,
          extension: [
            { url: 'name', valueCoding: { code: 'patient', system: 'http://hl7.org/fhir/uv/sdc/CodeSystem/launchContext' } },
            { url: 'type', valueCode: 'Patient' },
          ],
        },
      ],
      item: [
        {
          linkId: 'patient-name',
          text: 'Patient Name',
          type: 'string',
          extension: [
            {
              url: initialExpressionExtension,
              valueExpression: {
                language: 'text/fhirpath',
                expression: "%patient.name.first().given.first() + ' ' + %patient.name.first().family",
              },
            },
          ],
        },
        {
          linkId: 'birth-date',
          text: 'Date of Birth',
          type: 'date',
          extension: [
            {
              url: initialExpressionExtension,
              valueExpression: {
                language: 'text/fhirpath',
                expression: '%patient.birthDate',
              },
            },
          ],
        },
        {
          linkId: 'gender',
          text: 'Gender',
          type: 'string',
          extension: [
            {
              url: initialExpressionExtension,
              valueExpression: {
                language: 'text/fhirpath',
                expression: '%patient.gender',
              },
            },
          ],
        },
      ],
    });

    const res = await request(app)
      .post(`/fhir/R4/Questionnaire/${questionnaire.id}/$populate`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'subject', valueReference: { reference: `Patient/${patient.id}` } },
          {
            name: 'context',
            part: [
              { name: 'name', valueString: 'patient' },
              { name: 'content', resource: patient },
            ],
          },
        ],
      } satisfies Parameters);

    expect(res.status).toBe(200);
    expect(res.body.resourceType).toBe('Parameters');

    const responseParam = res.body.parameter?.find((p: any) => p.name === 'response');
    expect(responseParam).toBeDefined();

    const qr = responseParam.resource as QuestionnaireResponse;
    expect(qr.resourceType).toBe('QuestionnaireResponse');
    expect(qr.status).toBe('in-progress');
    expect(qr.subject?.reference).toBe(`Patient/${patient.id}`);

    const nameItem = qr.item?.find((i) => i.linkId === 'patient-name');
    expect(nameItem?.answer?.[0]?.valueString).toBe('John Doe');

    const dobItem = qr.item?.find((i) => i.linkId === 'birth-date');
    expect(dobItem?.answer?.[0]?.valueDate).toBe('1990-01-15');

    const genderItem = qr.item?.find((i) => i.linkId === 'gender');
    expect(genderItem?.answer?.[0]?.valueString).toBe('male');
  });

  test('Instance-level operation with id', async () => {
    const questionnaire = await repo.createResource<Questionnaire>({
      resourceType: 'Questionnaire',
      status: 'active',
      url: 'http://example.com/questionnaire/simple',
      item: [
        {
          linkId: 'default-item',
          text: 'Default Item',
          type: 'string',
          initial: [{ valueString: 'Default Value' }],
        },
      ],
    });

    const res = await request(app)
      .get(`/fhir/R4/Questionnaire/${questionnaire.id}/$populate`)
      .set('Authorization', 'Bearer ' + accessToken);

    expect(res.status).toBe(200);

    const responseParam = res.body.parameter?.find((p: any) => p.name === 'response');
    const qr = responseParam?.resource as QuestionnaireResponse;
    expect(qr.questionnaire).toBe('http://example.com/questionnaire/simple');
    expect(qr.item?.[0]?.answer?.[0]?.valueString).toBe('Default Value');
  });

  test('Type-level operation with inline Questionnaire', async () => {
    const patient = await repo.createResource<Patient>({
      resourceType: 'Patient',
      telecom: [{ system: 'phone', value: '555-1234' }],
    });

    const res = await request(app)
      .post(`/fhir/R4/Questionnaire/$populate`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'questionnaire',
            resource: {
              resourceType: 'Questionnaire',
              status: 'active',
              extension: [
                {
                  url: launchContextExtension,
                  extension: [
                    { url: 'name', valueCoding: { code: 'patient' } },
                    { url: 'type', valueCode: 'Patient' },
                  ],
                },
              ],
              item: [
                {
                  linkId: 'phone',
                  text: 'Phone',
                  type: 'string',
                  extension: [
                    {
                      url: initialExpressionExtension,
                      valueExpression: {
                        language: 'text/fhirpath',
                        expression: "%patient.telecom.where(system='phone').value.first()",
                      },
                    },
                  ],
                },
              ],
            } satisfies Questionnaire,
          },
          {
            name: 'context',
            part: [
              { name: 'name', valueString: 'patient' },
              { name: 'content', resource: patient },
            ],
          },
        ],
      } satisfies Parameters);

    expect(res.status).toBe(200);

    const responseParam = res.body.parameter?.find((p: any) => p.name === 'response');
    const qr = responseParam?.resource as QuestionnaireResponse;
    const phoneItem = qr.item?.find((i) => i.linkId === 'phone');
    expect(phoneItem?.answer?.[0]?.valueString).toBe('555-1234');
  });

  test('Population with itemPopulationContext for repeating groups', async () => {
    const patient = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [
        { given: ['John'], family: 'Doe', use: 'official' },
        { given: ['Johnny'], family: 'Doe', use: 'nickname' },
      ],
    });

    const questionnaire = await repo.createResource<Questionnaire>({
      resourceType: 'Questionnaire',
      status: 'active',
      url: 'http://example.com/questionnaire/names',
      extension: [
        {
          url: launchContextExtension,
          extension: [
            { url: 'name', valueCoding: { code: 'patient' } },
            { url: 'type', valueCode: 'Patient' },
          ],
        },
      ],
      item: [
        {
          linkId: 'name-group',
          text: 'Names',
          type: 'group',
          repeats: true,
          extension: [
            {
              url: itemPopulationContextExtension,
              valueExpression: {
                language: 'text/fhirpath',
                expression: '%patient.name',
              },
            },
          ],
          item: [
            {
              linkId: 'given-name',
              text: 'Given Name',
              type: 'string',
              extension: [
                {
                  url: initialExpressionExtension,
                  valueExpression: {
                    language: 'text/fhirpath',
                    expression: '%context.given.first()',
                  },
                },
              ],
            },
            {
              linkId: 'family-name',
              text: 'Family Name',
              type: 'string',
              extension: [
                {
                  url: initialExpressionExtension,
                  valueExpression: {
                    language: 'text/fhirpath',
                    expression: '%context.family',
                  },
                },
              ],
            },
          ],
        },
      ],
    });

    const res = await request(app)
      .post(`/fhir/R4/Questionnaire/${questionnaire.id}/$populate`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'context',
            part: [
              { name: 'name', valueString: 'patient' },
              { name: 'content', resource: patient },
            ],
          },
        ],
      } satisfies Parameters);

    expect(res.status).toBe(200);

    const responseParam = res.body.parameter?.find((p: any) => p.name === 'response');
    const qr = responseParam?.resource as QuestionnaireResponse;

    // Should have 2 name groups
    const nameGroups = qr.item?.filter((i) => i.linkId === 'name-group');
    expect(nameGroups).toHaveLength(2);

    // Check first name group
    const firstGroup = nameGroups?.[0];
    const firstGiven = firstGroup?.item?.find((i) => i.linkId === 'given-name');
    expect(firstGiven?.answer?.[0]?.valueString).toBe('John');

    // Check second name group
    const secondGroup = nameGroups?.[1];
    const secondGiven = secondGroup?.item?.find((i) => i.linkId === 'given-name');
    expect(secondGiven?.answer?.[0]?.valueString).toBe('Johnny');
  });

  test('Population with default initial values', async () => {
    const questionnaire = await repo.createResource<Questionnaire>({
      resourceType: 'Questionnaire',
      status: 'active',
      url: 'http://example.com/questionnaire/defaults',
      item: [
        {
          linkId: 'default-string',
          text: 'Default String',
          type: 'string',
          initial: [{ valueString: 'Default Value' }],
        },
        {
          linkId: 'default-boolean',
          text: 'Default Boolean',
          type: 'boolean',
          initial: [{ valueBoolean: true }],
        },
        {
          linkId: 'default-integer',
          text: 'Default Integer',
          type: 'integer',
          initial: [{ valueInteger: 42 }],
        },
        {
          linkId: 'default-choice',
          text: 'Default Choice',
          type: 'choice',
          initial: [{ valueCoding: { system: 'http://example.com', code: 'default', display: 'Default Option' } }],
        },
      ],
    });

    const res = await request(app)
      .post(`/fhir/R4/Questionnaire/${questionnaire.id}/$populate`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Parameters',
        parameter: [],
      } satisfies Parameters);

    expect(res.status).toBe(200);

    const responseParam = res.body.parameter?.find((p: any) => p.name === 'response');
    const qr = responseParam?.resource as QuestionnaireResponse;

    const stringItem = qr.item?.find((i) => i.linkId === 'default-string');
    expect(stringItem?.answer?.[0]?.valueString).toBe('Default Value');

    const boolItem = qr.item?.find((i) => i.linkId === 'default-boolean');
    expect(boolItem?.answer?.[0]?.valueBoolean).toBe(true);

    const intItem = qr.item?.find((i) => i.linkId === 'default-integer');
    expect(intItem?.answer?.[0]?.valueInteger).toBe(42);

    const choiceItem = qr.item?.find((i) => i.linkId === 'default-choice');
    expect(choiceItem?.answer?.[0]?.valueCoding).toEqual({
      system: 'http://example.com',
      code: 'default',
      display: 'Default Option',
    });
  });

  test('Mixed population sources - expression overrides initial', async () => {
    const patient = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Actual'], family: 'Name' }],
    });

    const questionnaire = await repo.createResource<Questionnaire>({
      resourceType: 'Questionnaire',
      status: 'active',
      url: 'http://example.com/questionnaire/mixed',
      extension: [
        {
          url: launchContextExtension,
          extension: [
            { url: 'name', valueCoding: { code: 'patient' } },
            { url: 'type', valueCode: 'Patient' },
          ],
        },
      ],
      item: [
        {
          linkId: 'name-with-expression',
          text: 'Name (from expression)',
          type: 'string',
          initial: [{ valueString: 'Default Name' }],
          extension: [
            {
              url: initialExpressionExtension,
              valueExpression: {
                language: 'text/fhirpath',
                expression: '%patient.name.first().family',
              },
            },
          ],
        },
        {
          linkId: 'name-without-expression',
          text: 'Name (default only)',
          type: 'string',
          initial: [{ valueString: 'Default Name' }],
        },
      ],
    });

    const res = await request(app)
      .post(`/fhir/R4/Questionnaire/${questionnaire.id}/$populate`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'context',
            part: [
              { name: 'name', valueString: 'patient' },
              { name: 'content', resource: patient },
            ],
          },
        ],
      } satisfies Parameters);

    expect(res.status).toBe(200);

    const responseParam = res.body.parameter?.find((p: any) => p.name === 'response');
    const qr = responseParam?.resource as QuestionnaireResponse;

    // Expression should override initial
    const withExpr = qr.item?.find((i) => i.linkId === 'name-with-expression');
    expect(withExpr?.answer?.[0]?.valueString).toBe('Name');

    // Without expression, should use initial
    const withoutExpr = qr.item?.find((i) => i.linkId === 'name-without-expression');
    expect(withoutExpr?.answer?.[0]?.valueString).toBe('Default Name');
  });

  test('Population with multiple context resources', async () => {
    const patient = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Test'], family: 'Patient' }],
    });

    const encounter = await repo.createResource<Encounter>({
      resourceType: 'Encounter',
      status: 'finished',
      class: { code: 'AMB', display: 'Ambulatory' },
    });

    const questionnaire = await repo.createResource<Questionnaire>({
      resourceType: 'Questionnaire',
      status: 'active',
      url: 'http://example.com/questionnaire/multi-context',
      extension: [
        {
          url: launchContextExtension,
          extension: [
            { url: 'name', valueCoding: { code: 'patient' } },
            { url: 'type', valueCode: 'Patient' },
          ],
        },
        {
          url: launchContextExtension,
          extension: [
            { url: 'name', valueCoding: { code: 'encounter' } },
            { url: 'type', valueCode: 'Encounter' },
          ],
        },
      ],
      item: [
        {
          linkId: 'patient-name',
          text: 'Patient Name',
          type: 'string',
          extension: [
            {
              url: initialExpressionExtension,
              valueExpression: {
                language: 'text/fhirpath',
                expression: '%patient.name.first().family',
              },
            },
          ],
        },
        {
          linkId: 'encounter-status',
          text: 'Encounter Status',
          type: 'string',
          extension: [
            {
              url: initialExpressionExtension,
              valueExpression: {
                language: 'text/fhirpath',
                expression: '%encounter.status',
              },
            },
          ],
        },
      ],
    });

    const res = await request(app)
      .post(`/fhir/R4/Questionnaire/${questionnaire.id}/$populate`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'context',
            part: [
              { name: 'name', valueString: 'patient' },
              { name: 'content', resource: patient },
            ],
          },
          {
            name: 'context',
            part: [
              { name: 'name', valueString: 'encounter' },
              { name: 'content', resource: encounter },
            ],
          },
        ],
      } satisfies Parameters);

    expect(res.status).toBe(200);

    const responseParam = res.body.parameter?.find((p: any) => p.name === 'response');
    const qr = responseParam?.resource as QuestionnaireResponse;

    const patientItem = qr.item?.find((i) => i.linkId === 'patient-name');
    expect(patientItem?.answer?.[0]?.valueString).toBe('Patient');

    const encounterItem = qr.item?.find((i) => i.linkId === 'encounter-status');
    expect(encounterItem?.answer?.[0]?.valueString).toBe('finished');
  });

  test('Error - Missing required Questionnaire', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Questionnaire/$populate`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Parameters',
        parameter: [],
      } satisfies Parameters);

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject<OperationOutcome>({
      resourceType: 'OperationOutcome',
      issue: [
        expect.objectContaining<OperationOutcomeIssue>({
          severity: 'error',
          code: 'invalid',
          details: { text: expect.stringContaining('Questionnaire must be specified') },
        }),
      ],
    });
  });

  test('Error - Questionnaire not found by canonical URL', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Questionnaire/$populate`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'canonical', valueUri: 'http://example.com/nonexistent-questionnaire' }],
      } satisfies Parameters);

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject<OperationOutcome>({
      resourceType: 'OperationOutcome',
      issue: [
        expect.objectContaining<OperationOutcomeIssue>({
          severity: 'error',
          code: 'invalid',
          details: { text: expect.stringContaining('not found') },
        }),
      ],
    });
  });

  test('Population with different answer types', async () => {
    const patient = await repo.createResource<Patient>({
      resourceType: 'Patient',
      birthDate: '1990-05-15',
      deceasedBoolean: false,
      multipleBirthInteger: 2,
    });

    const questionnaire = await repo.createResource<Questionnaire>({
      resourceType: 'Questionnaire',
      status: 'active',
      url: 'http://example.com/questionnaire/types',
      extension: [
        {
          url: launchContextExtension,
          extension: [
            { url: 'name', valueCoding: { code: 'patient' } },
            { url: 'type', valueCode: 'Patient' },
          ],
        },
      ],
      item: [
        {
          linkId: 'date-item',
          text: 'Date',
          type: 'date',
          extension: [
            {
              url: initialExpressionExtension,
              valueExpression: {
                language: 'text/fhirpath',
                expression: '%patient.birthDate',
              },
            },
          ],
        },
        {
          linkId: 'boolean-item',
          text: 'Boolean',
          type: 'boolean',
          extension: [
            {
              url: initialExpressionExtension,
              valueExpression: {
                language: 'text/fhirpath',
                expression: '%patient.deceased',
              },
            },
          ],
        },
        {
          linkId: 'integer-item',
          text: 'Integer',
          type: 'integer',
          extension: [
            {
              url: initialExpressionExtension,
              valueExpression: {
                language: 'text/fhirpath',
                expression: '%patient.multipleBirth',
              },
            },
          ],
        },
      ],
    });

    const res = await request(app)
      .post(`/fhir/R4/Questionnaire/${questionnaire.id}/$populate`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'context',
            part: [
              { name: 'name', valueString: 'patient' },
              { name: 'content', resource: patient },
            ],
          },
        ],
      } satisfies Parameters);

    expect(res.status).toBe(200);

    const responseParam = res.body.parameter?.find((p: any) => p.name === 'response');
    const qr = responseParam?.resource as QuestionnaireResponse;

    const dateItem = qr.item?.find((i) => i.linkId === 'date-item');
    expect(dateItem?.answer?.[0]?.valueDate).toBe('1990-05-15');

    const boolItem = qr.item?.find((i) => i.linkId === 'boolean-item');
    expect(boolItem?.answer?.[0]?.valueBoolean).toBe(false);

    const intItem = qr.item?.find((i) => i.linkId === 'integer-item');
    expect(intItem?.answer?.[0]?.valueInteger).toBe(2);
  });

  test('Population with nested groups', async () => {
    const patient = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Test'], family: 'Patient' }],
      address: [{ city: 'Boston', state: 'MA' }],
    });

    const questionnaire = await repo.createResource<Questionnaire>({
      resourceType: 'Questionnaire',
      status: 'active',
      url: 'http://example.com/questionnaire/nested',
      extension: [
        {
          url: launchContextExtension,
          extension: [
            { url: 'name', valueCoding: { code: 'patient' } },
            { url: 'type', valueCode: 'Patient' },
          ],
        },
      ],
      item: [
        {
          linkId: 'demographics',
          text: 'Demographics',
          type: 'group',
          item: [
            {
              linkId: 'name-group',
              text: 'Name',
              type: 'group',
              item: [
                {
                  linkId: 'given',
                  text: 'Given',
                  type: 'string',
                  extension: [
                    {
                      url: initialExpressionExtension,
                      valueExpression: {
                        language: 'text/fhirpath',
                        expression: '%patient.name.first().given.first()',
                      },
                    },
                  ],
                },
                {
                  linkId: 'family',
                  text: 'Family',
                  type: 'string',
                  extension: [
                    {
                      url: initialExpressionExtension,
                      valueExpression: {
                        language: 'text/fhirpath',
                        expression: '%patient.name.first().family',
                      },
                    },
                  ],
                },
              ],
            },
            {
              linkId: 'address-group',
              text: 'Address',
              type: 'group',
              item: [
                {
                  linkId: 'city',
                  text: 'City',
                  type: 'string',
                  extension: [
                    {
                      url: initialExpressionExtension,
                      valueExpression: {
                        language: 'text/fhirpath',
                        expression: '%patient.address.first().city',
                      },
                    },
                  ],
                },
                {
                  linkId: 'state',
                  text: 'State',
                  type: 'string',
                  extension: [
                    {
                      url: initialExpressionExtension,
                      valueExpression: {
                        language: 'text/fhirpath',
                        expression: '%patient.address.first().state',
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    const res = await request(app)
      .post(`/fhir/R4/Questionnaire/${questionnaire.id}/$populate`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'context',
            part: [
              { name: 'name', valueString: 'patient' },
              { name: 'content', resource: patient },
            ],
          },
        ],
      } satisfies Parameters);

    expect(res.status).toBe(200);

    const responseParam = res.body.parameter?.find((p: any) => p.name === 'response');
    const qr = responseParam?.resource as QuestionnaireResponse;

    const demographics = qr.item?.find((i) => i.linkId === 'demographics');
    expect(demographics).toBeDefined();

    const nameGroup = demographics?.item?.find((i) => i.linkId === 'name-group');
    const givenItem = nameGroup?.item?.find((i) => i.linkId === 'given');
    expect(givenItem?.answer?.[0]?.valueString).toBe('Test');

    const familyItem = nameGroup?.item?.find((i) => i.linkId === 'family');
    expect(familyItem?.answer?.[0]?.valueString).toBe('Patient');

    const addressGroup = demographics?.item?.find((i) => i.linkId === 'address-group');
    const cityItem = addressGroup?.item?.find((i) => i.linkId === 'city');
    expect(cityItem?.answer?.[0]?.valueString).toBe('Boston');

    const stateItem = addressGroup?.item?.find((i) => i.linkId === 'state');
    expect(stateItem?.answer?.[0]?.valueString).toBe('MA');
  });

  test('Population with inline resource in context', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Questionnaire/$populate`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'questionnaire',
            resource: {
              resourceType: 'Questionnaire',
              status: 'active',
              extension: [
                {
                  url: launchContextExtension,
                  extension: [
                    { url: 'name', valueCoding: { code: 'patient' } },
                    { url: 'type', valueCode: 'Patient' },
                  ],
                },
              ],
              item: [
                {
                  linkId: 'name',
                  text: 'Name',
                  type: 'string',
                  extension: [
                    {
                      url: initialExpressionExtension,
                      valueExpression: {
                        language: 'text/fhirpath',
                        expression: '%patient.name.first().family',
                      },
                    },
                  ],
                },
              ],
            } satisfies Questionnaire,
          },
          {
            name: 'context',
            part: [
              { name: 'name', valueString: 'patient' },
              {
                name: 'content',
                resource: {
                  resourceType: 'Patient',
                  name: [{ family: 'InlinePatient' }],
                } satisfies Patient,
              },
            ],
          },
        ],
      } satisfies Parameters);

    expect(res.status).toBe(200);

    const responseParam = res.body.parameter?.find((p: any) => p.name === 'response');
    const qr = responseParam?.resource as QuestionnaireResponse;

    const nameItem = qr.item?.find((i) => i.linkId === 'name');
    expect(nameItem?.answer?.[0]?.valueString).toBe('InlinePatient');
  });

  test('GET request with query parameters', async () => {
    const questionnaire = await repo.createResource<Questionnaire>({
      resourceType: 'Questionnaire',
      status: 'active',
      url: 'http://example.com/questionnaire/get-test',
      item: [
        {
          linkId: 'item1',
          text: 'Item 1',
          type: 'string',
          initial: [{ valueString: 'Initial Value' }],
        },
      ],
    });

    const res = await request(app)
      .get(`/fhir/R4/Questionnaire/${questionnaire.id}/$populate`)
      .set('Authorization', 'Bearer ' + accessToken);

    expect(res.status).toBe(200);

    const responseParam = res.body.parameter?.find((p: any) => p.name === 'response');
    const qr = responseParam?.resource as QuestionnaireResponse;
    expect(qr.status).toBe('in-progress');

    const item = qr.item?.find((i) => i.linkId === 'item1');
    expect(item?.answer?.[0]?.valueString).toBe('Initial Value');
  });

  test('Handles invalid FHIRPath expression gracefully', async () => {
    const questionnaire = await repo.createResource<Questionnaire>({
      resourceType: 'Questionnaire',
      status: 'active',
      url: 'http://example.com/questionnaire/invalid-expr',
      item: [
        {
          linkId: 'item1',
          text: 'Item 1',
          type: 'string',
          extension: [
            {
              url: initialExpressionExtension,
              valueExpression: {
                language: 'text/fhirpath',
                expression: '%nonexistent.invalid.path',
              },
            },
          ],
        },
        {
          linkId: 'item2',
          text: 'Item 2',
          type: 'string',
          initial: [{ valueString: 'Should still work' }],
        },
      ],
    });

    const res = await request(app)
      .post(`/fhir/R4/Questionnaire/${questionnaire.id}/$populate`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Parameters',
        parameter: [],
      } satisfies Parameters);

    // Should still return 200, just skip the invalid expression
    expect(res.status).toBe(200);

    const responseParam = res.body.parameter?.find((p: any) => p.name === 'response');
    const qr = responseParam?.resource as QuestionnaireResponse;

    // Item with valid initial should still work
    const item2 = qr.item?.find((i) => i.linkId === 'item2');
    expect(item2?.answer?.[0]?.valueString).toBe('Should still work');
  });
});
