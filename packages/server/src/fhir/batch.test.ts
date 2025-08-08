// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType, createReference, getReferenceString, WithId } from '@medplum/core';
import {
  Bundle,
  BundleEntry,
  BundleEntryResponse,
  CareTeam,
  Observation,
  OperationOutcome,
  OperationOutcomeIssue,
  Parameters,
  Patient,
  Practitioner,
  RelatedPerson,
  Task,
} from '@medplum/fhirtypes';
import { Job } from 'bullmq';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { createTestProject, initTestAuth, waitForAsyncJob } from '../test.setup';
import { BatchJobData, execBatchJob, getBatchQueue } from '../workers/batch';

describe('Batch and Transaction processing', () => {
  const app = express();
  let accessToken: string;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    accessToken = await initTestAuth({ project: { features: ['transaction-bundles'] }, membership: { admin: true } });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Batch success', async () => {
    const id1 = randomUUID();
    const id2 = randomUUID();
    const idSystem = 'http://example.com/uuid';

    const res1 = await request(app)
      .post(`/fhir/R4/Practitioner`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ resourceType: 'Practitioner' });
    expect(res1.status).toStrictEqual(201);
    expect(res1.body.resourceType).toStrictEqual('Practitioner');
    const practitioner = res1.body as WithId<Practitioner>;

    const res2 = await request(app)
      .post(`/fhir/R4/Patient`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ resourceType: 'Patient' });
    expect(res2.status).toStrictEqual(201);
    expect(res2.body.resourceType).toStrictEqual('Patient');
    const toDelete = res2.body as WithId<Patient>;

    const batch: Bundle = {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          request: {
            method: 'POST',
            url: 'Patient',
          },
          resource: {
            resourceType: 'Patient',
            identifier: [{ system: idSystem, value: id1 }],
          },
        },
        {
          request: {
            method: 'GET',
            url: 'Patient?identifier=http://example.com/uuid|' + randomUUID(),
          },
        },
        {
          request: {
            method: 'POST',
            url: 'Patient',
          },
          resource: {
            resourceType: 'Patient',
            identifier: [{ system: idSystem, value: id2 }],
          },
        },
        {
          request: {
            method: 'DELETE',
            url: getReferenceString(toDelete),
          },
        },
        {
          request: {
            method: 'PUT',
            url: getReferenceString(practitioner),
          },
          resource: {
            ...practitioner,
            gender: 'unknown',
          },
        },
        {
          // Will produce a 404 error in the batch response, but shouldn't fail the entire batch
          request: {
            method: 'GET',
            url: 'Practitioner/does-not-exist',
          },
        },
      ],
    };
    const res = await request(app)
      .post(`/fhir/R4/`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(batch);
    expect(res.status).toBe(200);
    expect(res.body.resourceType).toStrictEqual('Bundle');

    const results = res.body as Bundle;
    expect(results.type).toStrictEqual('batch-response');
    expect(results.entry).toHaveLength(6);

    expect(results.entry?.[0]?.response?.status).toStrictEqual('201');
    expect(results.entry?.[0]?.resource).toMatchObject<Partial<Patient>>({
      resourceType: 'Patient',
      identifier: [{ system: idSystem, value: id1 }],
    });

    expect(results.entry?.[1]?.response?.status).toStrictEqual('200');
    expect(results.entry?.[1]?.resource).toMatchObject<Partial<Bundle>>({
      resourceType: 'Bundle',
      type: 'searchset',
    });
    expect((results.entry?.[1]?.resource as Partial<Bundle>).entry).toBeUndefined();

    expect(results.entry?.[2]?.response?.status).toStrictEqual('201');
    expect(results.entry?.[2]?.resource).toMatchObject<Partial<Patient>>({
      resourceType: 'Patient',
      identifier: [{ system: idSystem, value: id2 }],
    });

    expect(results.entry?.[3]?.response?.status).toStrictEqual('200');
    expect(results.entry?.[3]?.resource).toBeUndefined();

    expect(results.entry?.[4]?.response?.status).toStrictEqual('200');
    expect(results.entry?.[4]?.resource).toMatchObject<Partial<Practitioner>>({
      resourceType: 'Practitioner',
      gender: 'unknown',
    });

    expect(results.entry?.[5]?.response?.status).toStrictEqual('404');
    expect(results.entry?.[5]?.resource).toBeUndefined();
  });

  test('Transaction success', async () => {
    const id1 = randomUUID();
    const id2 = randomUUID();
    const idSystem = 'http://example.com/uuid';

    const res1 = await request(app)
      .post(`/fhir/R4/Practitioner`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ resourceType: 'Practitioner' });
    expect(res1.status).toStrictEqual(201);
    expect(res1.body.resourceType).toStrictEqual('Practitioner');
    const practitioner = res1.body as WithId<Practitioner>;

    const res2 = await request(app)
      .post(`/fhir/R4/Patient`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ resourceType: 'Patient' });
    expect(res2.status).toStrictEqual(201);
    expect(res2.body.resourceType).toStrictEqual('Patient');
    const toDelete = res2.body as WithId<Patient>;

    const res3 = await request(app)
      .post(`/fhir/R4/RelatedPerson`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'RelatedPerson',
        patient: { reference: getReferenceString(toDelete) },
      });
    expect(res3.status).toStrictEqual(201);
    expect(res3.body.resourceType).toStrictEqual('RelatedPerson');
    const relatedPerson = res3.body as WithId<RelatedPerson>;

    const createdPatientIdentity = 'urn:uuid:c5db5c3b-bd41-4c39-aa8e-2d2a9a038167';
    const transaction: Bundle = {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: [
        {
          fullUrl: createdPatientIdentity,
          request: {
            method: 'POST',
            url: 'Patient',
          },
          resource: {
            resourceType: 'Patient',
            identifier: [{ system: idSystem, value: id1 }],
          },
        },
        {
          request: {
            method: 'GET',
            url: 'Patient?identifier=http://example.com/uuid|' + randomUUID(),
          },
        },
        {
          request: {
            method: 'POST',
            url: 'Patient',
          },
          resource: {
            resourceType: 'Patient',
            identifier: [{ system: idSystem, value: id2 }],
          },
        },
        {
          request: {
            method: 'DELETE',
            url: getReferenceString(toDelete),
          },
        },
        {
          request: {
            method: 'PUT',
            url: getReferenceString(practitioner),
          },
          resource: {
            ...practitioner,
            gender: 'unknown',
          },
        },
        {
          request: {
            method: 'GET',
            url: 'RelatedPerson',
          },
        },
        {
          request: {
            method: 'PUT',
            url: 'RelatedPerson?patient=' + getReferenceString(toDelete),
          },
          resource: { ...relatedPerson, patient: { reference: createdPatientIdentity } },
        },
      ],
    };
    const res = await request(app)
      .post(`/fhir/R4/`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(transaction);
    expect(res.status).toBe(200);
    expect(res.body.resourceType).toStrictEqual('Bundle');

    const results = res.body as Bundle;
    expect(results.entry).toHaveLength(7);
    expect(results.type).toStrictEqual('transaction-response');

    expect(results.entry?.[0]?.response?.status).toStrictEqual('201');
    const createdPatient = results.entry?.[0]?.resource as WithId<Patient>;
    expect(createdPatient).toMatchObject<Patient>({
      resourceType: 'Patient',
      identifier: [{ system: idSystem, value: id1 }],
    });

    expect(results.entry?.[1]?.response?.status).toStrictEqual('200');
    expect(results.entry?.[1]?.resource).toMatchObject<Partial<Bundle>>({
      resourceType: 'Bundle',
      type: 'searchset',
    });
    expect((results.entry?.[1]?.resource as Partial<Bundle>).entry).toBeUndefined();

    expect(results.entry?.[2]?.response?.status).toStrictEqual('201');
    expect(results.entry?.[2]?.resource).toMatchObject<Patient>({
      resourceType: 'Patient',
      identifier: [{ system: idSystem, value: id2 }],
    });

    expect(results.entry?.[3]?.response?.status).toStrictEqual('200');
    expect(results.entry?.[3]?.resource).toBeUndefined();

    expect(results.entry?.[4]?.response?.status).toStrictEqual('200');
    expect(results.entry?.[4]?.resource).toMatchObject<Practitioner>({
      resourceType: 'Practitioner',
      gender: 'unknown',
    });

    expect(results.entry?.[5]?.response?.status).toStrictEqual('200');
    expect(results.entry?.[5]?.resource).toMatchObject<Bundle<RelatedPerson>>({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [
        expect.objectContaining({
          resource: expect.objectContaining({ resourceType: 'RelatedPerson' }),
        }),
      ],
    });

    expect(results.entry?.[6]?.response?.status).toStrictEqual('200');
    expect(results.entry?.[6]?.resource).toMatchObject<Partial<RelatedPerson>>({
      resourceType: 'RelatedPerson',
      patient: { reference: getReferenceString(createdPatient) },
    });
  });

  test('Transaction rollback', async () => {
    const id1 = randomUUID();
    const id2 = randomUUID();
    const idSystem = 'http://example.com/uuid';

    const res1 = await request(app)
      .post(`/fhir/R4/Practitioner`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ resourceType: 'Practitioner' });
    expect(res1.status).toStrictEqual(201);
    expect(res1.body.resourceType).toStrictEqual('Practitioner');
    const practitioner = res1.body as WithId<Practitioner>;

    const res2 = await request(app)
      .post(`/fhir/R4/Patient`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ resourceType: 'Patient' });
    expect(res2.status).toStrictEqual(201);
    expect(res2.body.resourceType).toStrictEqual('Patient');
    const toDelete = res2.body as WithId<Patient>;

    const transaction: Bundle = {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: [
        {
          request: {
            method: 'POST',
            url: 'Patient',
          },
          resource: {
            resourceType: 'Patient',
            identifier: [{ system: idSystem, value: id1 }],
          },
        },
        {
          request: {
            method: 'GET',
            url: 'Patient?identifier=http://example.com/uuid|' + randomUUID(),
          },
        },
        {
          request: {
            method: 'POST',
            url: 'Patient',
          },
          resource: {
            resourceType: 'Patient',
            identifier: [{ system: idSystem, value: id2 }],
          },
        },
        {
          request: {
            method: 'DELETE',
            url: getReferenceString(toDelete),
          },
        },
        {
          request: {
            method: 'PUT',
            url: getReferenceString(practitioner),
          },
          resource: {
            ...practitioner,
            gender: 'unknown',
          },
        },
        {
          request: {
            method: 'POST',
            url: 'Practitioner',
          },
          // Invalid resource — should cause the transaction to be rolled back
          resource: { ...practitioner, gender: ['male', 'female'] as any },
        },
      ],
    };
    const res = await request(app)
      .post(`/fhir/R4/`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(transaction);
    expect(res.status).toBe(400);
    expect(res.body.resourceType).toStrictEqual('OperationOutcome');

    const res3 = await request(app)
      .get(`/fhir/R4/${getReferenceString(toDelete)}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ resourceType: 'Patient' });
    // Although DELETE was processed before the failed POST in the transaction,
    // rollback means the resource should still exist after the transaction fails
    expect(res3.status).toStrictEqual(200);
    expect(res3.body).toMatchObject<Patient>({
      resourceType: 'Patient',
      id: toDelete.id,
    });
  });

  test('Create batch wrong content type', async () => {
    const res = await request(app)
      .post(`/fhir/R4/`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.TEXT)
      .send('hello');
    expect(res.status).toBe(400);
  });

  test('Conditional create in transaction', async () => {
    const patientIdentifier = randomUUID();
    const encounterIdentifier = randomUUID();
    const conditionIdentifier = randomUUID();
    const practitionerIdentifier = randomUUID();

    const createdPractitioner = await request(app)
      .post('/fhir/R4/Practitioner')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Practitioner',
        identifier: [{ system: 'http://hl7.org.fhir/sid/us-npi', value: practitionerIdentifier }],
      });
    expect(createdPractitioner.status).toStrictEqual(201);
    const practitionerReference = {
      reference: 'Practitioner?identifier=http://hl7.org.fhir/sid/us-npi|' + practitionerIdentifier,
    };

    const patientCreateCondition = 'identifier=http://example.com|' + patientIdentifier;

    const tx: Bundle = {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: [
        {
          fullUrl: 'urn:uuid:' + patientIdentifier,
          request: {
            method: 'POST',
            url: 'Patient',
            ifNoneExist: patientCreateCondition,
          },
          resource: {
            resourceType: 'Patient',
            name: [{ given: ['Bobby' + patientIdentifier], family: 'Tables' }],
            gender: 'unknown',
            identifier: [{ system: 'http://example.com', value: patientIdentifier }],
          },
        },
        {
          fullUrl: 'urn:uuid:' + encounterIdentifier,
          request: {
            method: 'POST',
            url: 'Encounter',
          },
          resource: {
            resourceType: 'Encounter',
            status: 'finished',
            class: {
              system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
              code: 'AMB',
            },
            subject: { reference: 'urn:uuid:' + patientIdentifier },
            diagnosis: [{ condition: { reference: 'urn:uuid:' + conditionIdentifier } }],
          },
        },
        {
          fullUrl: 'urn:uuid:' + conditionIdentifier,
          request: {
            method: 'POST',
            url: 'Condition',
          },
          resource: {
            resourceType: 'Condition',
            verificationStatus: {
              coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status', code: 'confirmed' }],
            },
            subject: { reference: 'urn:uuid:' + patientIdentifier },
            encounter: { reference: 'urn:uuid:' + encounterIdentifier },
            asserter: practitionerReference,
            code: {
              coding: [{ system: 'http://snomed.info/sct', code: '83157008' }],
              text: 'FFI',
            },
          },
        },
        {
          request: {
            method: 'POST',
            url: 'Observation',
          },
          resource: {
            resourceType: 'Observation',
            status: 'final',
            code: {
              coding: [{ system: 'http://loinc.org', code: '31989-7' }],
              text: 'Prion test',
            },
            subject: { reference: 'urn:uuid:' + patientIdentifier },
            valueCodeableConcept: {
              coding: [{ system: 'http://loinc.org', code: 'LA6576-8', display: 'Positive' }],
            },
          },
        },
        {
          request: {
            method: 'POST',
            url: 'Task',
          },
          resource: {
            resourceType: 'Task',
            status: 'requested',
            intent: 'plan',
            encounter: { reference: 'urn:uuid:' + encounterIdentifier },
            owner: practitionerReference,
            description: 'Follow up with B. Tables regarding prognosis',
          },
        },
      ],
    };

    const res = await request(app)
      .post(`/fhir/R4/`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(tx);

    expect(res.status).toStrictEqual(200);
    const ccreateResult = res.body.entry[0].response as BundleEntryResponse;
    expect(ccreateResult.status).toStrictEqual('201');
  });

  test('Conditional update in transaction', async () => {
    const patientIdentifier = randomUUID();

    const createdPatient = await request(app)
      .post('/fhir/R4/Patient')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ resourceType: 'Patient', identifier: [{ value: patientIdentifier }] });
    expect(createdPatient.status).toStrictEqual(201);
    const patient = createdPatient.body;

    const tx: Bundle = {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: [
        {
          fullUrl: 'urn:uuid:' + patientIdentifier,
          request: {
            method: 'PUT',
            url: 'Patient?identifier=' + patientIdentifier,
          },
          resource: patient,
        },
      ],
    };

    const res = await request(app)
      .post(`/fhir/R4/`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(tx);

    expect(res.status).toStrictEqual(200);
    const updateResult = res.body.entry[0].response as BundleEntryResponse;
    expect(updateResult.status).toStrictEqual('200');
  });

  test('Conditional update (create-as-update) in transaction', async () => {
    const careTeamIdentifier = randomUUID();
    const encounterIdentifier = randomUUID();
    const conditionIdentifier = randomUUID();
    const practitionerIdentifier = randomUUID();

    const createdPractitioner = await request(app)
      .post('/fhir/R4/Practitioner')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Practitioner',
        identifier: [{ system: 'http://hl7.org.fhir/sid/us-npi', value: practitionerIdentifier }],
      });
    expect(createdPractitioner.status).toStrictEqual(201);
    const practitionerReference = {
      reference: 'Practitioner?identifier=http://hl7.org.fhir/sid/us-npi|' + practitionerIdentifier,
    };

    const createdPatient = await request(app)
      .post('/fhir/R4/Patient')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ resourceType: 'Patient' });
    expect(createdPatient.status).toStrictEqual(201);
    const patient = createdPatient.body;
    const patientReference = createReference(patient);
    const careTeamCondition = 'CareTeam?subject=' + patientReference.reference;

    const tx: Bundle = {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: [
        {
          fullUrl: 'urn:uuid:' + careTeamIdentifier,
          request: {
            method: 'PUT',
            url: careTeamCondition,
          },
          resource: {
            resourceType: 'CareTeam',
            status: 'active',
            category: [
              {
                coding: [{ system: 'http://loinc.org', code: 'LA28865-6' }],
                text: 'Holistic Wellness Squad',
              },
            ],
            subject: patientReference,
            participant: [{ member: practitionerReference }],
          },
        },
        {
          fullUrl: 'urn:uuid:' + encounterIdentifier,
          request: {
            method: 'POST',
            url: 'Encounter',
          },
          resource: {
            resourceType: 'Encounter',
            status: 'finished',
            class: {
              system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
              code: 'AMB',
            },
            subject: patientReference,
            diagnosis: [{ condition: { reference: 'urn:uuid:' + conditionIdentifier } }],
          },
        },
        {
          fullUrl: 'urn:uuid:' + conditionIdentifier,
          request: {
            method: 'POST',
            url: 'Condition',
          },
          resource: {
            resourceType: 'Condition',
            verificationStatus: {
              coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status', code: 'confirmed' }],
            },
            subject: patientReference,
            encounter: { reference: 'urn:uuid:' + encounterIdentifier },
            asserter: practitionerReference,
            code: {
              coding: [{ system: 'http://snomed.info/sct', code: '83157008' }],
              text: 'FFI',
            },
          },
        },
        {
          request: {
            method: 'POST',
            url: 'Observation',
          },
          resource: {
            resourceType: 'Observation',
            status: 'final',
            code: {
              coding: [{ system: 'http://loinc.org', code: '31989-7' }],
              text: 'Prion test',
            },
            subject: patientReference,
            valueCodeableConcept: {
              coding: [{ system: 'http://loinc.org', code: 'LA6576-8', display: 'Positive' }],
            },
          },
        },
        {
          request: {
            method: 'POST',
            url: 'Task',
          },
          resource: {
            resourceType: 'Task',
            status: 'requested',
            intent: 'plan',
            encounter: { reference: 'urn:uuid:' + encounterIdentifier },
            owner: { reference: 'urn:uuid:' + careTeamIdentifier },
            description: 'Follow up with B. Tables regarding prognosis',
          },
        },
      ],
    };

    const res = await request(app)
      .post(`/fhir/R4/`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(tx);

    expect(res.status).toStrictEqual(200);
    const ccreateResult = res.body.entry[0].response as BundleEntryResponse;
    expect(ccreateResult.status).toStrictEqual('201');

    // Ensure that ID replacement was performed correctly
    const createdCareTeam = res.body.entry[0].resource as CareTeam;
    const createdTask = res.body.entry[(tx.entry as BundleEntry[]).length - 1].resource as Task;
    expect(createdTask.owner?.reference).toStrictEqual(getReferenceString(createdCareTeam));
  });

  test('Resolved intra-Bundle reference cycle with referential integrity validation', async () => {
    const identity1 = 'urn:uuid:c5db5c3b-bd41-4c39-aa8e-2d2a9a038167';
    const identity2 = 'urn:uuid:f897f22a-c8d0-4e47-911b-1bb82bfbdae6';
    const transaction: Bundle<Patient> = {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: [
        {
          fullUrl: identity1,
          request: {
            method: 'POST',
            url: 'Patient',
          },
          resource: {
            resourceType: 'Patient',
            link: [{ other: { reference: identity2 }, type: 'seealso' }],
          },
        },
        {
          fullUrl: identity2,
          request: {
            method: 'POST',
            url: 'Patient',
          },
          resource: {
            resourceType: 'Patient',
            link: [{ other: { reference: identity1 }, type: 'seealso' }],
          },
        },
      ],
    };

    const accessToken = await initTestAuth({ project: { checkReferencesOnWrite: true } });
    const res = await request(app)
      .post(`/fhir/R4/`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(transaction);
    expect(res.status).toBe(200);
    expect(res.body.resourceType).toStrictEqual('Bundle');
  });

  test('Failed referential integrity check in transaction Bundle', async () => {
    const identity1 = 'urn:uuid:c5db5c3b-bd41-4c39-aa8e-2d2a9a038167';
    const identity2 = 'urn:uuid:f897f22a-c8d0-4e47-911b-1bb82bfbdae6';
    const transaction: Bundle<Patient> = {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: [
        {
          fullUrl: identity1,
          request: {
            method: 'POST',
            url: 'Patient',
          },
          resource: {
            resourceType: 'Patient',
            identifier: [{ system: 'http://example.com/test-identity', value: identity1 }],
            link: [{ other: { reference: identity2 }, type: 'seealso' }],
          },
        },
        {
          fullUrl: identity2,
          request: {
            method: 'POST',
            url: 'Patient',
          },
          resource: {
            resourceType: 'Patient',
            link: [
              { other: { reference: identity1 }, type: 'seealso' },
              { other: { reference: 'Patient/missing' }, type: 'replaced-by' },
            ],
          },
        },
      ],
    };

    const accessToken = await initTestAuth({
      project: { checkReferencesOnWrite: true, features: ['transaction-bundles'] },
    });
    const res = await request(app)
      .post(`/fhir/R4/`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(transaction);
    expect(res.status).toBe(400);
    expect(res.body.resourceType).toStrictEqual('OperationOutcome');

    const res2 = await request(app)
      .get(`/fhir/R4/Patient?identifier=http://example.com/test-identity|${identity1}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send();
    expect(res2.status).toBe(200);
    expect(res2.body.entry).toBeUndefined();
  });

  test('Conditional reference resolution', async () => {
    const accessToken = await initTestAuth({ project: { checkReferencesOnWrite: true } });
    const practitionerIdentifier = randomUUID();

    const createdPractitioner = await request(app)
      .post('/fhir/R4/Practitioner')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Practitioner',
        identifier: [{ system: 'http://hl7.org.fhir/sid/us-npi', value: practitionerIdentifier }],
      });
    expect(createdPractitioner.status).toStrictEqual(201);
    const practitionerReference = {
      reference: 'Practitioner?identifier=http://hl7.org.fhir/sid/us-npi|' + practitionerIdentifier,
    };

    const transaction: Bundle<Patient> = {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: [
        {
          request: {
            method: 'POST',
            url: 'Patient',
          },
          resource: {
            resourceType: 'Patient',
            generalPractitioner: [practitionerReference],
          },
        },
      ],
    };

    const res = await request(app)
      .post(`/fhir/R4/`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(transaction);
    expect(res.status).toBe(200);
    expect(res.body.resourceType).toStrictEqual('Bundle');

    const patient = (res.body as Bundle).entry?.[0]?.resource as WithId<Patient>;
    expect(patient.generalPractitioner?.[0].reference).toStrictEqual(getReferenceString(createdPractitioner.body));
  });

  test('Process batch create ifNoneExist invalid resource type', async () => {
    const identifier = randomUUID();

    const res = await request(app)
      .post(`/fhir/R4/`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Bundle',
        type: 'batch',
        entry: [
          {
            request: {
              method: 'POST',
              url: 'XXX',
              ifNoneExist: 'identifier=' + identifier,
            },
            resource: {
              resourceType: 'XXX',
            } as any,
          },
        ],
      });
    expect(res.status).toStrictEqual(200);
    const bundle = res.body as Bundle;
    expect(bundle.entry).toHaveLength(1);
    expect(bundle.entry?.[0]?.response?.status).toStrictEqual('400');
  });

  test('Repeated batch of related upserts', async () => {
    const bundle = {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          fullUrl: 'urn:uuid:889474c7-551f-49cb-88d9-548ab1fcdcac',
          request: { method: 'PUT', url: 'Patient?identifier=126229' },
          resource: {
            resourceType: 'Patient',
            identifier: [{ value: '126229' }],
            active: true,
            meta: {
              profile: [
                'https://medplum.com/profiles/integrations/health-gorilla/StructureDefinition/MedplumHealthGorillaPatient',
              ],
            },
          },
        },
        {
          fullUrl: 'urn:uuid:726c6c4f-4ca8-425e-870e-e43e569d0c4e',
          request: {
            method: 'PUT',
            url: 'RelatedPerson?patient.identifier=126229',
          },
          resource: {
            resourceType: 'RelatedPerson',
            relationship: [
              {
                coding: [
                  {
                    system: 'http://terminology.hl7.org/CodeSystem/subscriber-relationship',
                    code: 'spouse',
                    display: 'Spouse',
                  },
                ],
              },
            ],
            patient: { reference: 'urn:uuid:889474c7-551f-49cb-88d9-548ab1fcdcac' },
          },
        },
        {
          fullUrl: 'urn:uuid:f65055bc-5de2-45f5-9f59-ed6adbe77ae0',
          request: {
            method: 'PUT',
            url: 'Coverage?beneficiary.identifier=126229',
          },
          resource: {
            resourceType: 'Coverage',
            status: 'active',
            identifier: [{ value: '1' }],
            subscriberId: '1',
            subscriber: { reference: 'urn:uuid:726c6c4f-4ca8-425e-870e-e43e569d0c4e' },
            relationship: {
              coding: [
                {
                  system: 'http://terminology.hl7.org/CodeSystem/subscriber-relationship',
                  code: 'spouse',
                  display: 'Spouse',
                },
              ],
            },
            beneficiary: { reference: 'urn:uuid:889474c7-551f-49cb-88d9-548ab1fcdcac' },
            payor: [{ reference: 'Organization/091065a4-070b-4482-a863-76507b61e23a' }],
          },
        },
      ],
    };

    const res = await request(app)
      .post(`/fhir/R4/`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(bundle);
    expect(res.status).toStrictEqual(200);
    const result = res.body as Bundle;
    expect(result.entry).toHaveLength(3);
    expect(result.entry?.map((e) => e.response?.status)).toStrictEqual(['201', '201', '201']);

    const res2 = await request(app)
      .post(`/fhir/R4/`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(bundle);
    expect(res.status).toStrictEqual(200);
    const result2 = res2.body as Bundle;
    expect(result2.entry).toHaveLength(3);
    expect(result2.entry?.map((e) => e.response?.status)).toStrictEqual(['200', '200', '200']);
  });

  test('Async batch', async () => {
    const queue = getBatchQueue() as any;
    queue.add.mockClear();

    const bundle: Bundle = {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          request: {
            method: 'POST',
            url: 'Observation',
          },
          resource: {
            resourceType: 'Observation',
          } as Observation,
        },
      ],
    };

    const res = await await request(app)
      .post(`/fhir/R4/`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Prefer', 'respond-async')
      .send(bundle);
    expect(res.status).toStrictEqual(202);
    const outcome = res.body as OperationOutcome;
    expect(outcome.issue[0].diagnostics).toMatch('http://');

    // Manually push through BullMQ job
    expect(queue.add).toHaveBeenCalledWith(
      'BatchJobData',
      expect.objectContaining<Partial<BatchJobData>>({
        bundle,
      })
    );

    const job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;
    queue.add.mockClear();

    await expect(execBatchJob(job)).resolves.toBe(undefined);

    const jobUrl = outcome.issue[0].diagnostics as string;
    const asyncJob = await waitForAsyncJob(jobUrl, app, accessToken);
    expect(asyncJob.output).toMatchObject<Parameters>({
      resourceType: 'Parameters',
      parameter: [{ name: 'results', valueReference: { reference: expect.stringMatching(/^Binary\//) } }],
    });

    const resultsReference = asyncJob.output?.parameter?.find((p) => p.name === 'results')?.valueReference?.reference;
    const res2 = await request(app)
      .get(`/fhir/R4/${resultsReference}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send();
    expect(res2.status).toStrictEqual(200);
    expect(res2.body).toMatchObject<Partial<Bundle>>({
      resourceType: 'Bundle',
      type: 'batch-response',
    });
  });

  test('Async batch does not retry on failure', async () => {
    const queue = getBatchQueue() as any;
    queue.add.mockClear();

    const bundle: Bundle = {
      resourceType: 'Bundle',
      type: 'pergola' as Bundle['type'], // Invalid batch type, with no entries -> error
    };

    const res = await await request(app)
      .post(`/fhir/R4/`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Prefer', 'respond-async')
      .send(bundle);
    expect(res.status).toStrictEqual(202);
    const outcome = res.body as OperationOutcome;
    expect(outcome.issue[0].diagnostics).toMatch('http://');

    // Manually push through BullMQ job
    expect(queue.add).toHaveBeenCalledWith(
      'BatchJobData',
      expect.objectContaining<Partial<BatchJobData>>({
        bundle,
      })
    );

    const job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;
    queue.add.mockClear();

    await expect(execBatchJob(job)).resolves.toBe(undefined);

    const jobUrl = outcome.issue[0].diagnostics as string;
    const asyncJob = await waitForAsyncJob(jobUrl, app, accessToken);
    expect(asyncJob.output).toMatchObject<Parameters>({
      resourceType: 'Parameters',
      parameter: [
        {
          name: 'outcome',
          resource: expect.objectContaining({
            issue: [
              expect.objectContaining<OperationOutcomeIssue>({
                code: 'invalid',
                severity: 'error',
                details: { text: expect.stringContaining('pergola') },
              }),
            ],
          }),
        },
      ],
    });

    expect(queue.add).not.toHaveBeenCalled();
  });

  test('Transaction bundle account propagation', async () => {
    const transaction: Bundle = {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: [
        {
          fullUrl: 'urn:uuid:b27e3483-3048-4943-b67f-0ca3579078e3',
          request: {
            method: 'POST',
            url: 'Patient',
          },
          resource: {
            resourceType: 'Patient',
            name: [{ family: 'test', given: ['test'] }],
            meta: {
              accounts: [{ reference: 'Organization/4640af05-8f7b-4abb-905d-ee56b0aef229' }],
            },
          },
        },
        {
          request: {
            method: 'POST',
            url: 'Coverage',
          },
          resource: {
            resourceType: 'Coverage',
            status: 'draft',
            beneficiary: { reference: 'urn:uuid:b27e3483-3048-4943-b67f-0ca3579078e3' },
            payor: [{ reference: 'Organization/7b05cee4-20cc-45b0-a56b-e0a731ec5b0f' }],
          },
        },
      ],
    };

    const res = await request(app)
      .post(`/fhir/R4/`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send(transaction);
    expect(res.status).toBe(200);
    expect(res.body.resourceType).toStrictEqual('Bundle');

    const response = res.body as Bundle;
    expect(response.entry?.[0].resource?.meta?.accounts).toStrictEqual([
      { reference: 'Organization/4640af05-8f7b-4abb-905d-ee56b0aef229' },
    ]);
    expect(response.entry?.[1].resource?.meta?.compartment).toContainEqual({
      reference: 'Organization/4640af05-8f7b-4abb-905d-ee56b0aef229',
    });
  });

  test('_include regression test', async () => {
    const transaction: Bundle = {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: [
        {
          request: {
            method: 'POST',
            url: 'Observation',
          },
          resource: {
            resourceType: 'Observation',
            status: 'final',
            subject: { display: 'Mr. Patient' },
            code: { coding: [{ system: 'http://snomed.info/sct', code: '1234567890' }] },
          },
        },
      ],
    };
    const res = await request(app)
      .post(`/fhir/R4/`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(transaction);
    expect(res.status).toBe(200);
    expect(res.body.resourceType).toStrictEqual('Bundle');

    const results = res.body as Bundle;
    expect(results.entry).toHaveLength(1);
    expect(results.type).toStrictEqual('transaction-response');

    const query = await request(app)
      .get(`/fhir/R4/Observation?_id=${results.entry?.[0].resource?.id}&_include=Observation:subject`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send();

    expect(query.status).toBe(200);
    expect(query.body.entry).toHaveLength(1);
  });

  test('Rate limited during batch execution', async () => {
    const { accessToken } = await createTestProject({
      withAccessToken: true,
      project: {
        systemSetting: [
          { name: 'userFhirQuota', valueInteger: 100 },
          { name: 'enableFhirQuota', valueBoolean: true },
        ],
      },
    });

    const batch: Bundle = {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          request: { method: 'POST', url: 'Patient' },
          resource: { resourceType: 'Patient' },
        },
        {
          request: { method: 'POST', url: 'Patient' },
          resource: { resourceType: 'Patient' },
        },
        {
          request: { method: 'POST', url: 'Patient' },
          resource: { resourceType: 'Patient' },
        },
        {
          request: { method: 'POST', url: 'Patient' },
          resource: { resourceType: 'Patient' },
        },
      ],
    };

    const res = await request(app)
      .post(`/fhir/R4/`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(batch);
    expect(res.status).toBe(200);
    expect(res.body.resourceType).toStrictEqual('Bundle');

    const results = res.body as Bundle;
    expect(results.entry).toHaveLength(4);
    expect(results.type).toStrictEqual('batch-response');
    expect(results.entry?.map((e) => parseInt(e.response?.status ?? '', 10))).toStrictEqual([201, 429, 429, 429]);
  });
});
