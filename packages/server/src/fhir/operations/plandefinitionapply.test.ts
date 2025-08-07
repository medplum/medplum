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

  describe('Task elements extension', () => {
    test('Task elements extension - static assignment', async () => {
      // Create ActivityDefinition with static task-elements extension
      const res1 = await request(app)
        .post(`/fhir/R4/ActivityDefinition`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'ActivityDefinition',
          status: 'active',
          kind: 'ServiceRequest',
          title: 'Blood Pressure Check',
          extension: [
            {
              url: 'http://medplum.com/fhir/StructureDefinition/task-elements',
              extension: [
                {
                  url: 'performerType',
                  valueCodeableConcept: {
                    coding: [
                      {
                        system: 'http://snomed.info/sct',
                        code: '309343006',
                        display: 'Physician',
                      },
                    ],
                  },
                },
                {
                  url: 'priority',
                  valueCode: 'urgent',
                },
                {
                  url: 'description',
                  valueString: 'Check patient blood pressure',
                },
              ],
            },
          ],
        });
      expect(res1.status).toBe(201);

      const res2 = await request(app)
        .post(`/fhir/R4/PlanDefinition`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'PlanDefinition',
          title: 'Blood Pressure Plan',
          status: 'active',
          action: [
            {
              title: 'BP Check',
              definitionCanonical: getReferenceString(res1.body),
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
          name: [{ given: ['John'], family: 'Doe' }],
          gender: 'male',
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

      // Verify the Task has the static values applied
      const res5 = await request(app)
        .get(`/fhir/R4/${(res4.body as RequestGroup).action?.[0]?.resource?.reference}`)
        .set('Authorization', 'Bearer ' + accessToken);
      expect(res5.status).toBe(200);

      const resultTask = res5.body as Task;
      expect(resultTask.performerType).toHaveLength(1);
      expect(resultTask.performerType?.[0]?.coding?.[0]?.code).toBe('309343006');
      expect(resultTask.performerType?.[0]?.coding?.[0]?.display).toBe('Physician');
      expect(resultTask.priority).toBe('urgent');
      expect(resultTask.description).toBe('Check patient blood pressure');
    });

    test('Task elements extension - dynamic assignment with FHIRPath', async () => {
      // Create ActivityDefinition with dynamic task-elements extension using %practitioner and %subject
      const res1 = await request(app)
        .post(`/fhir/R4/ActivityDefinition`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'ActivityDefinition',
          status: 'active',
          kind: 'CommunicationRequest',
          title: 'Patient Education Materials',
          extension: [
            {
              url: 'http://medplum.com/fhir/StructureDefinition/task-elements',
              extension: [
                {
                  url: 'owner',
                  valueExpression: {
                    language: 'text/fhirpath',
                    expression: '%practitioner',
                  },
                },
                {
                  url: 'description',
                  valueExpression: {
                    language: 'text/fhirpath',
                    expression: "'Education materials for ' + %subject.name.first().given.first()",
                  },
                },
              ],
            },
          ],
        });
      expect(res1.status).toBe(201);

      const res2 = await request(app)
        .post(`/fhir/R4/PlanDefinition`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'PlanDefinition',
          title: 'Education Plan',
          status: 'active',
          action: [
            {
              title: 'Patient Education',
              definitionCanonical: getReferenceString(res1.body),
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
          name: [{ given: ['Alice'], family: 'Smith' }],
          gender: 'female',
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

      // Verify the Task has the dynamic values applied
      const res5 = await request(app)
        .get(`/fhir/R4/${(res4.body as RequestGroup).action?.[0]?.resource?.reference}`)
        .set('Authorization', 'Bearer ' + accessToken);
      expect(res5.status).toBe(200);

      const resultTask = res5.body as Task;
      // Owner should be set to the practitioner (context variable)
      expect(resultTask.owner?.reference).toBeDefined();
      expect(resultTask.description).toBe('Education materials for Alice');
    });

    test('Task elements extension - context variable usage', async () => {
      // Create ActivityDefinition using %context variable to reference itself
      const res1 = await request(app)
        .post(`/fhir/R4/ActivityDefinition`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'ActivityDefinition',
          status: 'active',
          kind: 'ServiceRequest',
          title: 'Lab Test Order',
          extension: [
            {
              url: 'http://medplum.com/fhir/StructureDefinition/task-elements',
              extension: [
                {
                  url: 'description',
                  valueExpression: {
                    language: 'text/fhirpath',
                    expression: "'Task based on: ' + %context.title",
                  },
                },
              ],
            },
          ],
        });
      expect(res1.status).toBe(201);

      const res2 = await request(app)
        .post(`/fhir/R4/PlanDefinition`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'PlanDefinition',
          title: 'Context Test Plan',
          status: 'active',
          action: [
            {
              title: 'Lab Order',
              definitionCanonical: getReferenceString(res1.body),
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
          name: [{ given: ['Test'], family: 'Patient' }],
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

      // Verify the Task description uses the ActivityDefinition title via %context
      const res5 = await request(app)
        .get(`/fhir/R4/${(res4.body as RequestGroup).action?.[0]?.resource?.reference}`)
        .set('Authorization', 'Bearer ' + accessToken);
      expect(res5.status).toBe(200);

      const resultTask = res5.body as Task;
      expect(resultTask.description).toBe('Task based on: Lab Test Order');
    });

    test('Task elements extension - mixed static and dynamic assignment', async () => {
      // Create ActivityDefinition with mixed task-elements extension
      const res1 = await request(app)
        .post(`/fhir/R4/ActivityDefinition`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'ActivityDefinition',
          status: 'active',
          kind: 'Appointment',
          title: 'Follow-up Appointment',
          extension: [
            {
              url: 'http://medplum.com/fhir/StructureDefinition/task-elements',
              extension: [
                {
                  url: 'owner',
                  valueExpression: {
                    language: 'text/fhirpath',
                    expression: '%subject',
                  },
                },
                {
                  url: 'performerType',
                  valueCodeableConcept: {
                    coding: [
                      {
                        code: '1251542004',
                        system: 'http://snomed.info/sct',
                        display: 'Medical Coder',
                      },
                    ],
                  },
                },
                {
                  url: 'priority',
                  valueCode: 'routine',
                },
                {
                  url: 'description',
                  valueExpression: {
                    language: 'text/fhirpath',
                    expression: "'Schedule follow-up for ' + %subject.name.first().given.first()",
                  },
                },
              ],
            },
          ],
        });
      expect(res1.status).toBe(201);

      const res2 = await request(app)
        .post(`/fhir/R4/PlanDefinition`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'PlanDefinition',
          title: 'Follow-up Plan',
          status: 'active',
          action: [
            {
              title: 'Schedule Follow-up',
              definitionCanonical: getReferenceString(res1.body),
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
          name: [{ given: ['Bob'], family: 'Johnson' }],
          gender: 'male',
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

      // Verify the Task has both static and dynamic values applied
      const res5 = await request(app)
        .get(`/fhir/R4/${(res4.body as RequestGroup).action?.[0]?.resource?.reference}`)
        .set('Authorization', 'Bearer ' + accessToken);
      expect(res5.status).toBe(200);

      const resultTask = res5.body as Task;
      expect(resultTask.owner?.reference).toBe(getReferenceString(res3.body as Patient));
      expect(resultTask.performerType).toHaveLength(1);
      expect(resultTask.performerType?.[0]?.coding?.[0]?.code).toBe('1251542004');
      expect(resultTask.performerType?.[0]?.coding?.[0]?.display).toBe('Medical Coder');
      expect(resultTask.priority).toBe('routine');
      expect(resultTask.description).toBe('Schedule follow-up for Bob');
    });

    test('Task elements extension - conditional FHIRPath based on patient context', async () => {
      // Create ActivityDefinition with conditional task-elements extension
      const res1 = await request(app)
        .post(`/fhir/R4/ActivityDefinition`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'ActivityDefinition',
          status: 'active',
          kind: 'ServiceRequest',
          title: 'Specialist Referral',
          extension: [
            {
              url: 'http://medplum.com/fhir/StructureDefinition/task-elements',
              extension: [
                {
                  url: 'performerType',
                  valueExpression: {
                    language: 'text/fhirpath',
                    expression:
                      "iif(%subject.gender = 'female', { 'coding': [{ 'system': 'http://snomed.info/sct', 'code': '309367003', 'display': 'Gynecologist' }] }, { 'coding': [{ 'system': 'http://snomed.info/sct', 'code': '309343006', 'display': 'Physician' }] })",
                  },
                },
              ],
            },
          ],
        });
      expect(res1.status).toBe(201);

      const res2 = await request(app)
        .post(`/fhir/R4/PlanDefinition`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'PlanDefinition',
          title: 'Referral Plan',
          status: 'active',
          action: [
            {
              title: 'Specialist Referral',
              definitionCanonical: getReferenceString(res1.body),
            },
          ],
        });
      expect(res2.status).toBe(201);

      // Test with female patient
      const res3a = await request(app)
        .post(`/fhir/R4/Patient`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'Patient',
          name: [{ given: ['Jane'], family: 'Doe' }],
          gender: 'female',
        });
      expect(res3a.status).toBe(201);

      const res4a = await request(app)
        .post(`/fhir/R4/PlanDefinition/${res2.body.id}/$apply`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'Parameters',
          parameter: [
            {
              name: 'subject',
              valueString: getReferenceString(res3a.body as Patient),
            },
          ],
        });
      expect(res4a.status).toBe(200);

      // Verify female patient gets Gynecologist
      const res5a = await request(app)
        .get(`/fhir/R4/${(res4a.body as RequestGroup).action?.[0]?.resource?.reference}`)
        .set('Authorization', 'Bearer ' + accessToken);
      expect(res5a.status).toBe(200);

      const femaleTask = res5a.body as Task;
      expect(femaleTask.performerType).toHaveLength(1);
      expect(femaleTask.performerType?.[0]?.coding?.[0]?.code).toBe('309367003');
      expect(femaleTask.performerType?.[0]?.coding?.[0]?.display).toBe('Gynecologist');

      // Test with male patient
      const res3b = await request(app)
        .post(`/fhir/R4/Patient`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'Patient',
          name: [{ given: ['John'], family: 'Smith' }],
          gender: 'male',
        });
      expect(res3b.status).toBe(201);

      const res4b = await request(app)
        .post(`/fhir/R4/PlanDefinition/${res2.body.id}/$apply`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'Parameters',
          parameter: [
            {
              name: 'subject',
              valueString: getReferenceString(res3b.body as Patient),
            },
          ],
        });
      expect(res4b.status).toBe(200);

      // Verify male patient gets Physician
      const res5b = await request(app)
        .get(`/fhir/R4/${(res4b.body as RequestGroup).action?.[0]?.resource?.reference}`)
        .set('Authorization', 'Bearer ' + accessToken);
      expect(res5b.status).toBe(200);

      const maleTask = res5b.body as Task;
      expect(maleTask.performerType).toHaveLength(1);
      expect(maleTask.performerType?.[0]?.coding?.[0]?.code).toBe('309343006');
      expect(maleTask.performerType?.[0]?.coding?.[0]?.display).toBe('Physician');
    });

    test('Task elements extension - multiple ActivityDefinitions in single PlanDefinition', async () => {
      // Create first ActivityDefinition with task-elements
      const res1a = await request(app)
        .post(`/fhir/R4/ActivityDefinition`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'ActivityDefinition',
          status: 'active',
          kind: 'ServiceRequest',
          title: 'Lab Work',
          extension: [
            {
              url: 'http://medplum.com/fhir/StructureDefinition/task-elements',
              extension: [
                {
                  url: 'priority',
                  valueCode: 'urgent',
                },
                {
                  url: 'performerType',
                  valueCodeableConcept: {
                    coding: [
                      {
                        system: 'http://snomed.info/sct',
                        code: '159016003',
                        display: 'Medical laboratory scientist',
                      },
                    ],
                  },
                },
              ],
            },
          ],
        });
      expect(res1a.status).toBe(201);

      // Create second ActivityDefinition with different task-elements
      const res1b = await request(app)
        .post(`/fhir/R4/ActivityDefinition`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'ActivityDefinition',
          status: 'active',
          kind: 'CommunicationRequest',
          title: 'Follow-up Call',
          extension: [
            {
              url: 'http://medplum.com/fhir/StructureDefinition/task-elements',
              extension: [
                {
                  url: 'priority',
                  valueCode: 'routine',
                },
                {
                  url: 'description',
                  valueExpression: {
                    language: 'text/fhirpath',
                    expression: "'Call patient ' + %subject.name.first().given.first() + ' for follow-up'",
                  },
                },
              ],
            },
          ],
        });
      expect(res1b.status).toBe(201);

      const res2 = await request(app)
        .post(`/fhir/R4/PlanDefinition`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'PlanDefinition',
          title: 'Multi-Action Plan',
          status: 'active',
          action: [
            {
              title: 'Lab Work',
              definitionCanonical: getReferenceString(res1a.body),
            },
            {
              title: 'Follow-up',
              definitionCanonical: getReferenceString(res1b.body),
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
          name: [{ given: ['Charlie'], family: 'Brown' }],
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
      expect((res4.body as RequestGroup).action).toHaveLength(2);

      // Verify first Task (Lab Work)
      const res5a = await request(app)
        .get(`/fhir/R4/${(res4.body as RequestGroup).action?.[0]?.resource?.reference}`)
        .set('Authorization', 'Bearer ' + accessToken);
      expect(res5a.status).toBe(200);

      const labTask = res5a.body as Task;
      expect(labTask.priority).toBe('urgent');
      expect(labTask.performerType).toHaveLength(1);
      expect(labTask.performerType?.[0]?.coding?.[0]?.code).toBe('159016003');
      expect(labTask.performerType?.[0]?.coding?.[0]?.display).toBe('Medical laboratory scientist');

      // Verify second Task (Follow-up Call)
      const res5b = await request(app)
        .get(`/fhir/R4/${(res4.body as RequestGroup).action?.[1]?.resource?.reference}`)
        .set('Authorization', 'Bearer ' + accessToken);
      expect(res5b.status).toBe(200);

      const followupTask = res5b.body as Task;
      expect(followupTask.priority).toBe('routine');
      expect(followupTask.description).toBe('Call patient Charlie for follow-up');
    });

    test('Task elements extension - no extension should not affect existing behavior', async () => {
      // Create ActivityDefinition without task-elements extension
      const res1 = await request(app)
        .post(`/fhir/R4/ActivityDefinition`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'ActivityDefinition',
          status: 'active',
          kind: 'ServiceRequest',
          title: 'Standard Order',
        });
      expect(res1.status).toBe(201);

      const res2 = await request(app)
        .post(`/fhir/R4/PlanDefinition`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'PlanDefinition',
          title: 'Standard Plan',
          status: 'active',
          action: [
            {
              title: 'Standard Action',
              definitionCanonical: getReferenceString(res1.body),
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
          name: [{ given: ['Standard'], family: 'Patient' }],
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

      // Verify the Task has default behavior (no custom fields set by extension)
      const res5 = await request(app)
        .get(`/fhir/R4/${(res4.body as RequestGroup).action?.[0]?.resource?.reference}`)
        .set('Authorization', 'Bearer ' + accessToken);
      expect(res5.status).toBe(200);

      const resultTask = res5.body as Task;
      // These fields should be undefined or default values since no extension was used
      expect(resultTask.owner).toBeUndefined();
      expect(resultTask.performerType).toBeUndefined();
      // Priority might have a default value, but it shouldn't be modified by our extension
      expect(resultTask.description).toBeUndefined();
    });
  });
});
