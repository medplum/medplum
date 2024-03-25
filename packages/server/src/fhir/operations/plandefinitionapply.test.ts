import { ContentType, createReference, getReferenceString } from '@medplum/core';
import { OperationOutcome, Patient, Questionnaire, RequestGroup, Task } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config';
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
    expect(res4.body.resourceType).toEqual('RequestGroup');
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
    expect(res6.body.resourceType).toEqual('Task');

    const resultTask = res6.body as Task;
    expect(resultTask.for).toMatchObject(createReference(res3.body as Patient));
    expect(resultTask.focus).toMatchObject(createReference(res1.body as Questionnaire));
    expect(resultTask.input).toHaveLength(1);
    expect(resultTask.input?.[0]?.valueReference?.reference).toEqual(getReferenceString(res1.body as Questionnaire));
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
    expect((res4.body as OperationOutcome).issue?.[0]?.details?.text).toEqual(
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
    expect((res4.body as OperationOutcome).issue?.[0]?.details?.text).toEqual(
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
    expect((res4.body as OperationOutcome).issue?.[0]?.details?.text).toEqual(
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
});
