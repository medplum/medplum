import { createReference, getReferenceString } from '@medplum/core';
import { Encounter, Patient, ServiceRequest } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp } from '../app';
import { loadTestConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { initTestAuth } from '../test.setup';
import { initKeys } from '../oauth';
import { seedDatabase } from '../seed';

const app = express();
let accessToken: string;
let patient: Patient;
let serviceRequest: ServiceRequest;
let encounter1: Encounter;
let encounter2: Encounter;

describe('GraphQL', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initDatabase(config.database);
    await seedDatabase();
    await initApp(app);
    await initKeys(config);
    accessToken = await initTestAuth();

    // Creat a simple patient
    const res1 = await request(app)
      .post(`/fhir/R4/Patient`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send({
        resourceType: 'Patient',
        name: [
          {
            given: ['Alice'],
            family: 'Smith',
          },
        ],
      });
    expect(res1.status).toBe(201);
    patient = res1.body as Patient;

    // Create a service request
    const res2 = await request(app)
      .post(`/fhir/R4/ServiceRequest`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send({
        resourceType: 'ServiceRequest',
        code: {
          text: 'Chest CT',
        },
        subject: createReference(patient),
      } as ServiceRequest);
    expect(res2.status).toBe(201);
    serviceRequest = res2.body as ServiceRequest;

    // Create an encounter referring to the patient
    const res3 = await request(app)
      .post(`/fhir/R4/Encounter`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send({
        resourceType: 'Encounter',
        class: {
          code: 'HH',
        },
        subject: createReference(patient),
        basedOn: [createReference(serviceRequest)],
      });
    expect(res3.status).toBe(201);
    encounter1 = res3.body as Encounter;

    // Create an encounter referring to missing patient
    const res4 = await request(app)
      .post(`/fhir/R4/Encounter`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send({
        resourceType: 'Encounter',
        class: {
          code: 'HH',
        },
        subject: {
          reference: 'Patient/' + randomUUID(),
        },
      });
    expect(res4.status).toBe(201);
    encounter2 = res4.body as Encounter;
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test('Get schema', async () => {
    const res = await request(app)
      .post('/fhir/R4/$graphql')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/json')
      .send({
        operationName: 'IntrospectionQuery',
        query: `
      query IntrospectionQuery {
        __schema {
          queryType { name }
          mutationType { name }
          subscriptionType { name }
          types {
            ...FullType
          }
          directives {
            name
            description
            locations
            args {
              ...InputValue
            }
          }
        }
      }
      fragment FullType on __Type {
        kind
        name
        description
        fields(includeDeprecated: true) {
          name
          description
          args {
            ...InputValue
          }
          type {
            ...TypeRef
          }
          isDeprecated
          deprecationReason
        }
        inputFields {
          ...InputValue
        }
        interfaces {
          ...TypeRef
        }
        enumValues(includeDeprecated: true) {
          name
          description
          isDeprecated
          deprecationReason
        }
        possibleTypes {
          ...TypeRef
        }
      }
      fragment InputValue on __InputValue {
        name
        description
        type { ...TypeRef }
        defaultValue
      }
      fragment TypeRef on __Type {
        kind
        name
        ofType {
          kind
          name
          ofType {
            kind
            name
            ofType {
              kind
              name
              ofType {
                kind
                name
                ofType {
                  kind
                  name
                  ofType {
                    kind
                    name
                    ofType {
                      kind
                      name
                    }
                  }
                }
              }
            }
          }
        }
      }
    `,
      });
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/_count/);
    expect(res.text).toMatch(/_sort/);
    expect(res.text).toMatch(/_lastUpdated/);
  });

  test('Read by ID', async () => {
    const res = await request(app)
      .post('/fhir/R4/$graphql')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/json')
      .send({
        query: `
      {
        Patient(id: "${patient.id}") {
          id
          name { given }
        }
      }
    `,
      });
    expect(res.status).toBe(200);
    expect(res.body.data.Patient).toBeDefined();
  });

  test('Read by ID not found', async () => {
    const res = await request(app)
      .post('/fhir/R4/$graphql')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/json')
      .send({
        query: `
      {
        Patient(id: "${randomUUID()}") {
          id
          name { given }
        }
      }
    `,
      });
    expect(res.status).toBe(200);
    expect(res.body.data.Patient).toBeNull();
    expect(res.body.errors[0].message).toEqual('Not found');
  });

  test('Search', async () => {
    const res = await request(app)
      .post('/fhir/R4/$graphql')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/json')
      .send({
        query: `
      {
        PatientList(name: "Smith") {
          id
          name { given }
        }
      }
    `,
      });
    expect(res.status).toBe(200);
    expect(res.body.data.PatientList).toBeDefined();
  });

  test('Search with _id', async () => {
    const res = await request(app)
      .post('/fhir/R4/$graphql')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/json')
      .send({
        query: `
      {
        PatientList(_id: "${patient.id}") {
          id
        }
      }
    `,
      });
    expect(res.status).toBe(200);
    expect(res.body.data.PatientList).toBeDefined();
    expect(res.body.data.PatientList.length).toBe(1);
  });

  test('Search with _count', async () => {
    const res = await request(app)
      .post('/fhir/R4/$graphql')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/json')
      .send({
        query: `
      {
        EncounterList(_count: 1) {
          id
        }
      }
    `,
      });
    expect(res.status).toBe(200);
    expect(res.body.data.EncounterList).toBeDefined();
    expect(res.body.data.EncounterList.length).toBe(1);
  });

  test('Search with based-on', async () => {
    const res = await request(app)
      .post('/fhir/R4/$graphql')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/json')
      .send({
        query: `
      {
        EncounterList(based_on: "${getReferenceString(serviceRequest)}") {
          id
        }
      }
    `,
      });
    expect(res.status).toBe(200);
    expect(res.body.data.EncounterList).toBeDefined();
    expect(res.body.data.EncounterList.length).toBe(1);
  });

  test('Sort by _lastUpdated asc', async () => {
    const res = await request(app)
      .post('/fhir/R4/$graphql')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/json')
      .send({
        query: `
      {
        EncounterList(_sort: "_lastUpdated") {
          id
          meta { lastUpdated }
        }
      }
    `,
      });
    expect(res.status).toBe(200);
    expect(res.body.data.EncounterList).toBeDefined();
    expect(res.body.data.EncounterList.length >= 2).toBe(true);

    const e1 = res.body.data.EncounterList[0];
    const e2 = res.body.data.EncounterList[1];
    expect(e1.meta.lastUpdated.localeCompare(e2.meta.lastUpdated)).toBeLessThanOrEqual(0);
  });

  test('Sort by _lastUpdated desc', async () => {
    const res = await request(app)
      .post('/fhir/R4/$graphql')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/json')
      .send({
        query: `
      {
        EncounterList(_sort: "-_lastUpdated") {
          id
          meta { lastUpdated }
        }
      }
    `,
      });
    expect(res.status).toBe(200);
    expect(res.body.data.EncounterList).toBeDefined();
    expect(res.body.data.EncounterList.length >= 2).toBe(true);

    const e1 = res.body.data.EncounterList[0];
    const e2 = res.body.data.EncounterList[1];
    expect(e1.meta.lastUpdated.localeCompare(e2.meta.lastUpdated)).toBeGreaterThanOrEqual(0);
  });

  test('Read resource by reference', async () => {
    const res = await request(app)
      .post('/fhir/R4/$graphql')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/json')
      .send({
        query: `
        {
          Encounter(id: "${encounter1.id}") {
            id
            meta {
              lastUpdated
            }
            subject {
              id
              reference
              resource {
                __typename
                ... on Patient {
                  name {
                    given
                    family
                  }
                }
              }
            }
          }
        }
    `,
      });
    expect(res.status).toBe(200);
    expect(res.body.data.Encounter).toBeDefined();
  });

  test('Read resource by reference not found', async () => {
    const res = await request(app)
      .post('/fhir/R4/$graphql')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/json')
      .send({
        query: `
        {
          Encounter(id: "${encounter2.id}") {
            id
            meta {
              lastUpdated
            }
            subject {
              id
              reference
              resource {
                __typename
                ... on Patient {
                  name {
                    given
                    family
                  }
                }
              }
            }
          }
        }
    `,
      });
    expect(res.status).toBe(200);
    expect(res.body.data.Encounter).toBeDefined();
    expect(res.body.data.Encounter.subject.resource).toBeNull();
  });

  test('Reverse lookup with _reference', async () => {
    const res = await request(app)
      .post('/fhir/R4/$graphql')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/json')
      .send({
        query: `
      {
        PatientList(_count: 1) {
          id
          ObservationList(_reference: subject) {
            id
            status
            code {
              text
            }
          }
        }
      }
    `,
      });
    expect(res.status).toBe(200);
    expect(res.body.data.PatientList).toBeDefined();
    expect(res.body.data.PatientList[0].ObservationList).toBeDefined();
  });

  test('Reverse lookup without _reference', async () => {
    const res = await request(app)
      .post('/fhir/R4/$graphql')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/json')
      .send({
        query: `
      {
        PatientList(_count: 1) {
          id
          ObservationList(subject: "xyz") {
            id
            status
            code {
              text
            }
          }
        }
      }
    `,
      });
    expect(res.status).toBe(400);
  });
});
