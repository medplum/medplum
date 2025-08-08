// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType, createReference, getReferenceString } from '@medplum/core';
import {
  Encounter,
  OperationOutcome,
  Patient,
  PlanDefinition,
  Questionnaire,
  RequestGroup,
  Task,
} from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { initTestAuth } from '../../test.setup';

const app = express();
let accessToken: string;

describe('PlanDefinition apply', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    accessToken = await initTestAuth();
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Happy path', async () => {
    // 1. Create a Questionnaire
    // 2. Create a PlanDefinition
    // 3. Create a Patient
    // 4. Apply the PlanDefinition to create the Task and RequestGroup
    // 5. Verify the RequestGroup
    // 6. Verify the Task

    // 1. Create a Questionnaire
    const res1 = await request(app)
      .post(`/fhir/R4/Questionnaire`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Questionnaire',
        status: 'active',
        name: 'Patient Registration',
        title: 'Patient Registration',
        subjectType: ['Patient'],
        item: [
          {
            linkId: '1',
            text: 'First question',
            type: 'string',
          },
        ],
      });
    expect(res1.status).toBe(201);

    // 2. Create a PlanDefinition
    const res2 = await request(app)
      .post(`/fhir/R4/PlanDefinition`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'PlanDefinition',
        title: 'Example Plan Definition',
        status: 'active',
        action: [
          {
            title: res1.body.title,
            definitionCanonical: getReferenceString(res1.body as Questionnaire),
          },
        ],
      });
    expect(res2.status).toBe(201);

    // 3. Create a Patient
    const res3 = await request(app)
      .post(`/fhir/R4/Patient`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Patient',
        name: [{ given: ['Workflow'], family: 'Demo' }],
      });
    expect(res3.status).toBe(201);

    // 4. Apply the PlanDefinition to create the Task and RequestGroup
    const res4 = await request(app)
      .post(`/fhir/R4/PlanDefinition/${res2.body.id}/$apply`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'subject',
            valueString: getReferenceString(res3.body as Patient),
          },
        ],
      });
    expect(res4.status).toBe(200);
    expect(res4.body.resourceType).toStrictEqual('RequestGroup');
    expect((res4.body as RequestGroup).action).toHaveLength(1);
    expect((res4.body as RequestGroup).action?.[0]?.resource?.reference).toBeDefined();

    // 5. Verify the RequestGroup
    const res5 = await request(app)
      .get(`/fhir/R4/RequestGroup/${res4.body.id}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res5.status).toBe(200);

    // 6. Verify the Task
    const res6 = await request(app)
      .get(`/fhir/R4/${(res4.body as RequestGroup).action?.[0]?.resource?.reference}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res6.status).toBe(200);
    expect(res6.body.resourceType).toStrictEqual('Task');
    expect(res6.body.code.text).toStrictEqual(res1.body.title);

    const resultTask = res6.body as Task;
    expect(resultTask.for).toMatchObject(createReference(res3.body as Patient));
    expect(resultTask.focus).toMatchObject(createReference(res1.body as Questionnaire));
    expect(resultTask.input).toHaveLength(1);
    expect(resultTask.input?.[0]?.valueReference?.reference).toStrictEqual(
      getReferenceString(res1.body as Questionnaire)
    );
  });

  test('Happy path - Encounter', async () => {
    // 1. Create a Questionnaire
    // 2. Create a PlanDefinition
    // 3. Create a Patient
    // 4. Create an Encounter
    // 5. Apply the PlanDefinition to create the Task and RequestGroup
    // 6. Verify the Task

    // 1. Create a Questionnaire
    const res1 = await request(app)
      .post(`/fhir/R4/Questionnaire`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Questionnaire',
        status: 'active',
        name: 'Patient Registration',
        title: 'Patient Registration',
        subjectType: ['Patient'],
        item: [
          {
            linkId: '1',
            text: 'First question',
            type: 'string',
          },
        ],
      });
    expect(res1.status).toBe(201);

    // 2. Create a PlanDefinition
    const res2 = await request(app)
      .post(`/fhir/R4/PlanDefinition`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'PlanDefinition',
        title: 'Example Plan Definition',
        status: 'active',
        action: [
          {
            title: res1.body.title,
            definitionCanonical: getReferenceString(res1.body as Questionnaire),
          },
        ],
      });
    expect(res2.status).toBe(201);

    // 3. Create a Patient
    const res3 = await request(app)
      .post(`/fhir/R4/Patient`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Patient',
        name: [{ given: ['Workflow'], family: 'Test' }],
      });
    expect(res3.status).toBe(201);

    // 4. Create an Encounter
    const res4 = await request(app)
      .post(`/fhir/R4/Encounter`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Encounter',
        status: 'active',
        class: {
          system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
          code: 'EMER',
          display: 'emergency',
        },
      });
    expect(res4.status).toBe(201);

    // 5. Apply the PlanDefinition to create the Task and RequestGroup
    const res5 = await request(app)
      .post(`/fhir/R4/PlanDefinition/${res2.body.id}/$apply`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'subject',
            valueString: getReferenceString(res3.body as Patient),
          },
          {
            name: 'encounter',
            valueString: getReferenceString(res4.body as Encounter),
          },
        ],
      });
    expect(res5.status).toBe(200);
    expect(res5.body.resourceType).toStrictEqual('RequestGroup');
    expect((res5.body as RequestGroup).action).toHaveLength(1);
    expect((res5.body as RequestGroup).action?.[0]?.resource?.reference).toBeDefined();

    // 6. Verify the Task
    const res6 = await request(app)
      .get(`/fhir/R4/${(res5.body as RequestGroup).action?.[0]?.resource?.reference}`)
      .set('Authorization', 'Bearer ' + accessToken);

    const resultTask = res6.body as Task;
    expect(resultTask.for).toMatchObject(createReference(res3.body as Patient));
    expect(resultTask.focus).toMatchObject(createReference(res1.body as Questionnaire));
    expect(resultTask.encounter).toMatchObject(createReference(res4.body as Encounter));
    expect(resultTask.input).toHaveLength(1);
    expect(resultTask.input?.[0]?.valueReference?.reference).toStrictEqual(
      getReferenceString(res1.body as Questionnaire)
    );
    expect(resultTask.basedOn).toHaveLength(1);
    expect(resultTask.basedOn?.[0]?.reference).toStrictEqual(getReferenceString(res2.body as PlanDefinition));

    // 7. Verify the encounter was updated
    const res7 = await request(app)
      .get(`/fhir/R4/Encounter/${res4.body.id}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res7.status).toBe(200);
    expect(res7.body.basedOn).toHaveLength(1);
    expect(res7.body.basedOn?.[0]?.reference).toStrictEqual(getReferenceString(res2.body as PlanDefinition));
  });

  test('Unsupported content type', async () => {
    const res2 = await request(app)
      .post(`/fhir/R4/PlanDefinition`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'PlanDefinition',
        title: 'Example Plan Definition',
        status: 'active',
      });
    expect(res2.status).toBe(201);

    const res4 = await request(app)
      .post(`/fhir/R4/PlanDefinition/${res2.body.id}/$apply`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.TEXT)
      .send('hello');
    expect(res4.status).toBe(400);
    expect((res4.body as OperationOutcome).issue?.[0]?.details?.text).toStrictEqual(
      "Expected at least 1 value(s) for required input parameter 'subject'"
    );
  });

  test('Incorrect parameters type', async () => {
    const res2 = await request(app)
      .post(`/fhir/R4/PlanDefinition`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'PlanDefinition',
        title: 'Example Plan Definition',
        status: 'active',
      });
    expect(res2.status).toBe(201);

    const res4 = await request(app)
      .post(`/fhir/R4/PlanDefinition/${res2.body.id}/$apply`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Patient',
      });
    expect(res4.status).toBe(400);
    expect((res4.body as OperationOutcome).issue?.[0]?.details?.text).toStrictEqual(
      "Expected at least 1 value(s) for required input parameter 'subject'"
    );
  });

  test('Missing subject', async () => {
    const res2 = await request(app)
      .post(`/fhir/R4/PlanDefinition`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'PlanDefinition',
        title: 'Example Plan Definition',
        status: 'active',
      });
    expect(res2.status).toBe(201);

    const res4 = await request(app)
      .post(`/fhir/R4/PlanDefinition/${res2.body.id}/$apply`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [],
      });
    expect(res4.status).toBe(400);
    expect((res4.body as OperationOutcome).issue?.[0]?.details?.text).toStrictEqual(
      'Expected 1..NaN value(s) for input parameter subject, but 0 provided'
    );
  });

  test('General task', async () => {
    const res2 = await request(app)
      .post(`/fhir/R4/PlanDefinition`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'PlanDefinition',
        title: 'Example Plan Definition',
        status: 'active',
        action: [
          {
            description: 'do the thing',
          },
        ],
      });
    expect(res2.status).toBe(201);

    const res3 = await request(app)
      .post(`/fhir/R4/Patient`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Patient',
        name: [{ given: ['Workflow'], family: 'Demo' }],
      });
    expect(res3.status).toBe(201);

    const res4 = await request(app)
      .post(`/fhir/R4/PlanDefinition/${res2.body.id}/$apply`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'subject',
            valueString: getReferenceString(res3.body as Patient),
          },
        ],
      });
    expect(res4.status).toBe(200);
  });

  test('ActivityDefinition ServiceRequest', async () => {
    const res1 = await request(app)
      .post(`/fhir/R4/ActivityDefinition`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'ActivityDefinition',
        status: 'active',
        kind: 'ServiceRequest',
        name: 'CompleteBloodCountOrder',
        title: 'Complete Blood Count Order',
        description: 'Order for a complete blood count',
        code: {
          coding: [
            {
              system: 'http://snomed.info/sct',
              code: '26604007',
              display: 'Complete blood count',
            },
            {
              system: 'http://www.ama-assn.org/go/cpt',
              code: '85025',
              display: 'Complete CBC with automated differential WBC',
            },
          ],
        },
        intent: 'order',
        priority: 'routine',
        participant: [
          {
            type: 'practitioner',
            role: {
              coding: [
                {
                  system: 'http://terminology.hl7.org/CodeSystem/practitioner-role',
                  code: 'doctor',
                  display: 'Doctor',
                },
              ],
            },
          },
        ],
      });
    expect(res1.status).toBe(201);
    expect(res1.body.resourceType).toBe('ActivityDefinition');

    const res2 = await request(app)
      .post(`/fhir/R4/PlanDefinition`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'PlanDefinition',
        title: 'Example Plan Definition',
        status: 'active',
        action: [
          {
            title: 'Order a CBC',
            definitionCanonical: getReferenceString(res1.body),
          },
        ],
      });

    expect(res2.status).toBe(201);
    expect(res2.body.resourceType).toBe('PlanDefinition');
    expect(res2.body.id).toBeDefined();

    const res3 = await request(app)
      .post(`/fhir/R4/Patient`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Patient',
        name: [{ given: ['Workflow'], family: 'Demo' }],
      });
    expect(res3.status).toBe(201);

    const res4 = await request(app)
      .post(`/fhir/R4/PlanDefinition/${res2.body.id}/$apply`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'subject',
            valueString: getReferenceString(res3.body as Patient),
          },
        ],
      });

    expect(res4.status).toBe(200);

    const res5 = await request(app)
      .get(`/fhir/R4/RequestGroup/${res4.body.id}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res5.status).toBe(200);
    expect(res5.body.resourceType).toBe('RequestGroup');

    const res6 = await request(app)
      .get(`/fhir/R4/${(res5.body as RequestGroup).action?.[0]?.resource?.reference}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res6.status).toBe(200);

    const resultTask = res6.body as Task;
    const res7 = await request(app)
      .get(`/fhir/R4/${resultTask.focus?.reference}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res7.status).toBe(200);
    expect(res7.body.resourceType).toBe('ServiceRequest');
  });

  test('Dynamic and static assigned owner and performerType', async () => {
    // 1. Create an ActivityDefinition
    // 2. Create a PlanDefinition
    // 3. Create a Patient
    // 4. Create a Practitioner
    // 5. Create an Organization
    // 6. Create an Encounter
    // 7. Apply the PlanDefinition with all parameters
    // 8. Verify the Task includes all references

    // 1. Create an ActivityDefinition
    const res1 = await request(app)
      .post(`/fhir/R4/ActivityDefinition`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'ActivityDefinition',
        status: 'active',
        kind: 'ServiceRequest',
        name: 'BloodPressureCheck',
        title: 'Blood Pressure Check',
        description: 'Check patient blood pressure',
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/task-elements',
            extension: [
              {
                url: 'owner',
                valueExpression: {
                  language: 'text/fhirpath',
                  expression: '%practitioner',
                },
              },
              {
                url: 'performerType',
                valueCodeableConcept: {
                  coding: [
                    {
                      system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType',
                      code: 'ATND',
                      display: 'attender',
                    },
                  ],
                },
              },
            ],
          },
        ],
        code: {
          coding: [
            {
              system: 'http://snomed.info/sct',
              code: '75367002',
              display: 'Blood pressure monitoring',
            },
          ],
        },
        intent: 'order',
        priority: 'routine',
      });
    expect(res1.status).toBe(201);

    // 2. Create a PlanDefinition
    const res2 = await request(app)
      .post(`/fhir/R4/PlanDefinition`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'PlanDefinition',
        title: 'Example Plan Definition with ActivityDefinition',
        status: 'active',
        action: [
          {
            title: res1.body.title,
            definitionCanonical: getReferenceString(res1.body),
          },
        ],
      });
    expect(res2.status).toBe(201);

    // 3. Create a Patient
    const res3 = await request(app)
      .post(`/fhir/R4/Patient`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
        gender: 'female',
        birthDate: '1990-01-01',
      });
    expect(res3.status).toBe(201);

    // 4. Create a Practitioner
    const res4 = await request(app)
      .post(`/fhir/R4/Practitioner`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Practitioner',
        name: [{ given: ['Dr. John'], family: 'Doe' }],
        identifier: [
          {
            system: 'http://example.org/practitioner-ids',
            value: 'PRACT001',
          },
        ],
        qualification: [
          {
            code: {
              coding: [
                {
                  system: 'http://terminology.hl7.org/CodeSystem/v2-0360',
                  code: 'MD',
                  display: 'Doctor of Medicine',
                },
              ],
            },
          },
        ],
      });
    expect(res4.status).toBe(201);

    // 5. Create an Organization
    const res5 = await request(app)
      .post(`/fhir/R4/Organization`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Organization',
        name: 'Example Healthcare Organization',
        identifier: [
          {
            system: 'http://example.org/organization-ids',
            value: 'ORG001',
          },
        ],
        type: [
          {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/organization-type',
                code: 'prov',
                display: 'Healthcare Provider',
              },
            ],
          },
        ],
      });
    expect(res5.status).toBe(201);

    // 6. Create an Encounter
    const res6 = await request(app)
      .post(`/fhir/R4/Encounter`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Encounter',
        status: 'active',
        class: {
          system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
          code: 'AMB',
          display: 'ambulatory',
        },
        subject: createReference(res3.body as Patient),
        serviceProvider: createReference(res5.body),
        participant: [
          {
            individual: createReference(res4.body),
            type: [
              {
                coding: [
                  {
                    system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType',
                    code: 'ATND',
                    display: 'attender',
                  },
                ],
              },
            ],
          },
        ],
      });
    expect(res6.status).toBe(201);

    // 7. Apply the PlanDefinition with all parameters
    const res7 = await request(app)
      .post(`/fhir/R4/PlanDefinition/${res2.body.id}/$apply`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'subject',
            valueString: getReferenceString(res3.body as Patient),
          },
          {
            name: 'practitioner',
            valueString: getReferenceString(res4.body),
          },
          {
            name: 'organization',
            valueString: getReferenceString(res5.body),
          },
          {
            name: 'encounter',
            valueString: getReferenceString(res6.body),
          },
        ],
      });
    expect(res7.status).toBe(200);
    expect(res7.body.resourceType).toStrictEqual('RequestGroup');
    expect((res7.body as RequestGroup).action).toHaveLength(1);
    expect((res7.body as RequestGroup).action?.[0]?.resource?.reference).toBeDefined();

    // 8. Verify the Task includes all references
    const res8 = await request(app)
      .get(`/fhir/R4/${(res7.body as RequestGroup).action?.[0]?.resource?.reference}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res8.status).toBe(200);
    expect(res8.body.resourceType).toStrictEqual('Task');

    const resultTask = res8.body as Task;
    expect(resultTask.for).toMatchObject(createReference(res3.body as Patient));
    expect(resultTask.encounter).toMatchObject(createReference(res6.body));
    expect(resultTask.input).toHaveLength(1);
    expect(resultTask.input?.[0]?.type?.text).toStrictEqual('ServiceRequest');
    expect(resultTask.basedOn).toHaveLength(1);
    expect(resultTask.basedOn?.[0]?.reference).toStrictEqual(getReferenceString(res2.body as PlanDefinition));
    expect(resultTask.owner).toMatchObject(createReference(res4.body));
    expect(resultTask.performerType).toHaveLength(1);
    expect(resultTask.performerType?.[0]?.coding?.[0]?.code).toStrictEqual('ATND');

    // 9. Verify the ServiceRequest was created
    const serviceRequestRef = resultTask.focus?.reference;
    expect(serviceRequestRef).toBeDefined();
    const res9 = await request(app)
      .get(`/fhir/R4/${serviceRequestRef}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res9.status).toBe(200);
    expect(res9.body.resourceType).toBe('ServiceRequest');
    expect(res9.body.subject).toMatchObject(createReference(res3.body as Patient));
    expect(res9.body.encounter).toMatchObject(createReference(res6.body));

    // 10. Verify the encounter was updated with the plan definition reference
    const res10 = await request(app)
      .get(`/fhir/R4/Encounter/${res6.body.id}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res10.status).toBe(200);
    expect(res10.body.basedOn).toHaveLength(1);
    expect(res10.body.basedOn?.[0]?.reference).toStrictEqual(getReferenceString(res2.body as PlanDefinition));
  });
});
