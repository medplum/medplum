import express from 'express';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config';
import { initTestAuth } from '../test.setup';
import request from 'supertest';
import { ContentType, createReference, getReferenceString } from '@medplum/core';
import { Bundle, BundleEntryResponse, Patient, Practitioner, RelatedPerson } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';

describe('Batch and Transaction processing', () => {
  const app = express();
  let accessToken: string;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    accessToken = await initTestAuth();
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
    expect(res1.status).toEqual(201);
    expect(res1.body.resourceType).toEqual('Practitioner');
    const practitioner = res1.body as Practitioner;

    const res2 = await request(app)
      .post(`/fhir/R4/Patient`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ resourceType: 'Patient' });
    expect(res2.status).toEqual(201);
    expect(res2.body.resourceType).toEqual('Patient');
    const toDelete = res2.body as Patient;

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
    expect(res.body.resourceType).toEqual('Bundle');

    const results = res.body as Bundle;
    expect(results.type).toEqual('batch-response');
    expect(results.entry).toHaveLength(6);

    expect(results.entry?.[0]?.response?.status).toEqual('201');
    expect(results.entry?.[0]?.resource).toMatchObject<Partial<Patient>>({
      resourceType: 'Patient',
      identifier: [{ system: idSystem, value: id1 }],
    });

    expect(results.entry?.[1]?.response?.status).toEqual('200');
    expect(results.entry?.[1]?.resource).toMatchObject<Partial<Bundle>>({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [],
    });

    expect(results.entry?.[2]?.response?.status).toEqual('201');
    expect(results.entry?.[2]?.resource).toMatchObject<Partial<Patient>>({
      resourceType: 'Patient',
      identifier: [{ system: idSystem, value: id2 }],
    });

    expect(results.entry?.[3]?.response?.status).toEqual('200');
    expect(results.entry?.[3]?.resource).toBeUndefined();

    expect(results.entry?.[4]?.response?.status).toEqual('200');
    expect(results.entry?.[4]?.resource).toMatchObject<Partial<Practitioner>>({
      resourceType: 'Practitioner',
      gender: 'unknown',
    });

    expect(results.entry?.[5]?.response?.status).toEqual('404');
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
    expect(res1.status).toEqual(201);
    expect(res1.body.resourceType).toEqual('Practitioner');
    const practitioner = res1.body as Practitioner;

    const res2 = await request(app)
      .post(`/fhir/R4/Patient`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ resourceType: 'Patient' });
    expect(res2.status).toEqual(201);
    expect(res2.body.resourceType).toEqual('Patient');
    const toDelete = res2.body as Patient;

    const res3 = await request(app)
      .post(`/fhir/R4/RelatedPerson`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'RelatedPerson',
        patient: { reference: getReferenceString(toDelete) },
      });
    expect(res3.status).toEqual(201);
    expect(res3.body.resourceType).toEqual('RelatedPerson');
    const relatedPerson = res3.body as RelatedPerson;

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
    expect(res.body.resourceType).toEqual('Bundle');

    const results = res.body as Bundle;
    expect(results.entry).toHaveLength(7);
    expect(results.type).toEqual('transaction-response');

    expect(results.entry?.[0]?.response?.status).toEqual('201');
    const createdPatient = results.entry?.[0]?.resource as Patient;
    expect(createdPatient).toMatchObject<Patient>({
      resourceType: 'Patient',
      identifier: [{ system: idSystem, value: id1 }],
    });

    expect(results.entry?.[1]?.response?.status).toEqual('200');
    expect(results.entry?.[1]?.resource).toMatchObject<Partial<Bundle>>({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [],
    });

    expect(results.entry?.[2]?.response?.status).toEqual('201');
    expect(results.entry?.[2]?.resource).toMatchObject<Patient>({
      resourceType: 'Patient',
      identifier: [{ system: idSystem, value: id2 }],
    });

    expect(results.entry?.[3]?.response?.status).toEqual('200');
    expect(results.entry?.[3]?.resource).toBeUndefined();

    expect(results.entry?.[4]?.response?.status).toEqual('200');
    expect(results.entry?.[4]?.resource).toMatchObject<Practitioner>({
      resourceType: 'Practitioner',
      gender: 'unknown',
    });

    expect(results.entry?.[5]?.response?.status).toEqual('200');
    expect(results.entry?.[5]?.resource).toMatchObject<Bundle<RelatedPerson>>({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [
        expect.objectContaining({
          resource: expect.objectContaining({ resourceType: 'RelatedPerson' }),
        }),
      ],
    });

    expect(results.entry?.[6]?.response?.status).toEqual('200');
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
    expect(res1.status).toEqual(201);
    expect(res1.body.resourceType).toEqual('Practitioner');
    const practitioner = res1.body as Practitioner;

    const res2 = await request(app)
      .post(`/fhir/R4/Patient`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ resourceType: 'Patient' });
    expect(res2.status).toEqual(201);
    expect(res2.body.resourceType).toEqual('Patient');
    const toDelete = res2.body as Patient;

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
    expect(res.body.resourceType).toEqual('OperationOutcome');

    const res3 = await request(app)
      .get(`/fhir/R4/${getReferenceString(toDelete)}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ resourceType: 'Patient' });
    // Although DELETE was processed before the failed POST in the transaction,
    // rollback means the resource should still exist after the transaction fails
    expect(res3.status).toEqual(200);
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

  test('Concurrent conditional create in transactions', async () => {
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
    expect(createdPractitioner.status).toEqual(201);
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

    // Issue several identical transaction requests, essentially in parallel
    const requests = new Array(8);
    for (let i = 0; i < requests.length; i++) {
      requests[i] = request(app)
        .post(`/fhir/R4/`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send(tx)
        .then((res) => res); // Force send request
    }

    const results = await Promise.all(requests);
    const statusCounts = Object.create(null);
    for (let i = 0; i < requests.length; i++) {
      expect(results[i].status).toEqual(200);
      const ccreateResult = results[i].body.entry[0].response as BundleEntryResponse;
      statusCounts[ccreateResult.status] = (statusCounts[ccreateResult.status] ?? 0) + 1;
    }
    // Only one transaction should report that it created the resource
    expect(statusCounts[201]).toEqual(1);
    expect(statusCounts[200]).toEqual(requests.length - 1);

    // Ensure that only one copy of the resource was actually created
    const createdResources = await request(app)
      .get('/fhir/R4/Patient?' + patientCreateCondition)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(tx);
    expect(createdResources.status).toEqual(200);
    expect(createdResources.body.entry).toHaveLength(1);
  });

  test('Concurrent conditional update in transactions', async () => {
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
    expect(createdPractitioner.status).toEqual(201);
    const practitionerReference = {
      reference: 'Practitioner?identifier=http://hl7.org.fhir/sid/us-npi|' + practitionerIdentifier,
    };

    const createdPatient = await request(app)
      .post('/fhir/R4/Patient')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ resourceType: 'Patient' });
    expect(createdPatient.status).toEqual(201);
    const patient = createdPatient.body;
    const patientReference = createReference(patient);
    const careTeamCondition = 'CareTeam?subject=' + patientReference.reference;

    const tx: Bundle = {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: [
        {
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
            owner: practitionerReference,
            description: 'Follow up with B. Tables regarding prognosis',
          },
        },
      ],
    };

    // Issue several identical transaction requests, essentially in parallel
    const requests = new Array(8);
    for (let i = 0; i < requests.length; i++) {
      requests[i] = request(app)
        .post(`/fhir/R4/`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send(tx)
        .then((res) => res); // Force send request
    }

    const results = await Promise.all(requests);
    const statusCounts = Object.create(null);
    for (let i = 0; i < requests.length; i++) {
      expect(results[i].status).toEqual(200);
      const ccreateResult = results[i].body.entry[0].response as BundleEntryResponse;
      statusCounts[ccreateResult.status] = (statusCounts[ccreateResult.status] ?? 0) + 1;
    }
    // Only one transaction should report that it created the resource
    expect(statusCounts[201]).toEqual(1);
    expect(statusCounts[200]).toEqual(requests.length - 1);

    // Ensure that only one copy of the resource was actually created
    const createdResources = await request(app)
      .get('/fhir/R4/' + careTeamCondition)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(tx);
    expect(createdResources.status).toEqual(200);
    expect(createdResources.body.entry).toHaveLength(1);
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
    expect(res.body.resourceType).toEqual('Bundle');
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

    const accessToken = await initTestAuth({ project: { checkReferencesOnWrite: true } });
    const res = await request(app)
      .post(`/fhir/R4/`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(transaction);
    expect(res.status).toBe(400);
    expect(res.body.resourceType).toEqual('OperationOutcome');

    const res2 = await request(app)
      .get(`/fhir/R4/Patient?identifier=http://example.com/test-identity|${identity1}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send();
    expect(res2.status).toBe(200);
    expect(res2.body.entry).toHaveLength(0);
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
    expect(createdPractitioner.status).toEqual(201);
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
    expect(res.body.resourceType).toEqual('Bundle');

    const patient = (res.body as Bundle).entry?.[0]?.resource as Patient;
    expect(patient.generalPractitioner?.[0].reference).toEqual(getReferenceString(createdPractitioner.body));
  });
});
