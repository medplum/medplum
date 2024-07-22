import { ContentType, createReference, getReferenceString } from '@medplum/core';
import { Binary, Encounter, Patient, Practitioner, ServiceRequest } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { registerNew } from '../../auth/register';
import { loadTestConfig } from '../../config';
import { addTestUser, createTestProject, withTestContext } from '../../test.setup';
import { Repository } from '../repo';

const app = express();
let practitioner: Practitioner;
let accessToken: string;
let binary: Binary;
let patient: Patient;
let serviceRequest: ServiceRequest;
let encounter1: Encounter;
let encounter2: Encounter;
let bobAccessToken: string;

describe('GraphQL', () => {
  beforeAll(() =>
    withTestContext(async () => {
      const config = await loadTestConfig();
      await initApp(app, config);

      // Setup a new project
      const aliceRegistration = await registerNew({
        firstName: 'Alice',
        lastName: 'Smith',
        projectName: 'Alice Project',
        email: `alice${randomUUID()}@example.com`,
        password: 'password!@#',
      });
      accessToken = aliceRegistration.accessToken;
      practitioner = aliceRegistration.profile as Practitioner;

      const aliceRepo = new Repository({
        author: createReference(aliceRegistration.profile),
        projects: [aliceRegistration.project.id as string],
      });

      // Create a profile picture
      binary = await aliceRepo.createResource<Binary>({ resourceType: 'Binary' } as Binary);

      // Creat a simple patient
      patient = await aliceRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [
          {
            given: ['Alice'],
            family: 'Smith',
          },
        ],
        photo: [
          {
            contentType: 'image/jpeg',
            url: getReferenceString(binary),
          },
        ],
        telecom: [
          {
            system: 'email',
            value: 'alice@example.com',
          },
        ],
        generalPractitioner: [createReference(aliceRegistration.profile as Practitioner)],
      });

      // Create a service request
      serviceRequest = await aliceRepo.createResource<ServiceRequest>({
        resourceType: 'ServiceRequest',
        status: 'active',
        intent: 'order',
        code: {
          text: 'Chest CT',
        },
        subject: createReference(patient),
      });

      // Create an encounter referring to the patient
      encounter1 = await aliceRepo.createResource<Encounter>({
        resourceType: 'Encounter',
        status: 'in-progress',
        class: {
          code: 'HH',
        },
        subject: createReference(patient),
        basedOn: [createReference(serviceRequest)],
      });

      // Create an encounter referring to missing patient
      encounter2 = await aliceRepo.createResource<Encounter>({
        resourceType: 'Encounter',
        status: 'in-progress',
        class: {
          code: 'HH',
        },
        subject: { reference: 'Patient/' + randomUUID() },
      });

      // Invite Bob with the access policy
      const bobRegistration = await addTestUser(aliceRegistration.project, {
        resourceType: 'AccessPolicy',
        resource: [
          {
            resourceType: 'Encounter',
          },
          {
            resourceType: 'Patient',
            hiddenFields: ['telecom'],
          },
          {
            resourceType: 'ServiceRequest',
            criteria: 'ServiceRequest?status=completed',
          },
        ],
      });
      bobAccessToken = bobRegistration.accessToken;
    })
  );

  afterAll(async () => {
    await shutdownApp();
  });

  test.skip('IntrospectionQuery', async () => {
    const introspectionRequest = {
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
    };

    const res1 = await request(app)
      .post('/fhir/R4/$graphql')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send(introspectionRequest);
    expect(res1.status).toBe(200);
    expect(res1.headers['cache-control']).toBe('public, max-age=31536000');
    expect(res1.text).toMatch(/_count/);
    expect(res1.text).toMatch(/_sort/);
    expect(res1.text).toMatch(/_lastUpdated/);

    const res2 = await request(app)
      .post('/fhir/R4/$graphql')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send(introspectionRequest);
    expect(res2.status).toBe(200);
    expect(res2.text).toEqual(res1.text);
  });

  test.skip('Get __schema', async () => {
    // https://graphql.org/learn/introspection/
    const res = await request(app)
      .post('/fhir/R4/$graphql')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({
        query: `{
          __schema {
            types {
              name
            }
          }
        }`,
      });
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=31536000');
  });

  test('Get __type', async () => {
    // https://graphql.org/learn/introspection/
    const res = await request(app)
      .post('/fhir/R4/$graphql')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({
        query: `{
          __type(name: "Patient") {
            name
            kind
          }
        }`,
      });
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store, no-cache, must-revalidate');
  });

  test('Read by ID', async () => {
    const res = await request(app)
      .post('/fhir/R4/$graphql')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({
        query: `
      {
        Patient(id: "${patient.id}") {
          id
          name { given }
          photo { url }
        }
      }
    `,
      });
    expect(res.status).toBe(200);
    expect(res.body.data.Patient).toBeDefined();
    expect(res.body.data.Patient.photo[0].url).toBeDefined();
    expect(res.body.data.Patient.photo[0].url).toMatch(/^http/);
  });

  test('Read by ID not found', async () => {
    const res = await request(app)
      .post('/fhir/R4/$graphql')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
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
      .set('Content-Type', ContentType.JSON)
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
      .set('Content-Type', ContentType.JSON)
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

  test('Search with _filter', async () => {
    const res = await request(app)
      .post('/fhir/R4/$graphql')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/json')
      .send({
        query: `
      {
        PatientList(_filter: "name eq smith") {
          id
          name { given }
        }
      }
    `,
      });
    expect(res.status).toBe(200);
    expect(res.body.data.PatientList).toBeDefined();
  });

  test('Search with _count', async () => {
    const res = await request(app)
      .post('/fhir/R4/$graphql')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
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
      .set('Content-Type', ContentType.JSON)
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
      .set('Content-Type', ContentType.JSON)
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
      .set('Content-Type', ContentType.JSON)
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
      .set('Content-Type', ContentType.JSON)
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
      .set('Content-Type', ContentType.JSON)
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
      .set('Content-Type', ContentType.JSON)
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
      .set('Content-Type', ContentType.JSON)
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

  test('Max depth', async () => {
    // The definition of "depth" is a little abstract in GraphQL
    // We use "selection", which, in a well formatted query, is the level of indentation

    // 8 levels of depth is ok
    const res1 = await request(app)
      .post('/fhir/R4/$graphql')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({
        query: `
        {
          ServiceRequestList {
            id
            basedOn {
              resource {
                ...on ServiceRequest {
                  id
                  basedOn {
                    resource {
                      ...on ServiceRequest {
                        id
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
    expect(res1.status).toBe(200);

    // 10 levels of nesting is too much
    const res2 = await request(app)
      .post('/fhir/R4/$graphql')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({
        query: `
        {
          ServiceRequestList {
            id
            basedOn {
              resource {
                ...on ServiceRequest {
                  id
                  basedOn {
                    resource {
                      ...on ServiceRequest {
                        id
                        basedOn {
                          resource {
                            ...on ServiceRequest {
                              id
                              basedOn {
                                resource {
                                  ...on ServiceRequest {
                                    id
                                    basedOn {
                                      resource {
                                        ...on ServiceRequest {
                                          id
                                          basedOn {
                                            resource {
                                              ...on ServiceRequest {
                                                id
                                              }
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
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
    expect(res2.status).toBe(400);
    expect(res2.body.issue[0].details.text).toEqual('Field "id" exceeds max depth (depth=14, max=12)');
  });

  test('Hidden fields in nested lookups', async () => {
    // Bob does not have access to Patient.telecom
    const res = await request(app)
      .post('/fhir/R4/$graphql')
      .set('Authorization', 'Bearer ' + bobAccessToken)
      .set('Content-Type', ContentType.JSON)
      .send({
        query: `
        {
          EncounterList {
            id
            meta {
              lastUpdated
            }
            subject {
              id
              reference
              resource {
                ... on Patient {
                  name {
                    given
                    family
                  }
                  telecom {
                    system
                    value
                  }
                }
              }
            }
          }
        }
    `,
      });
    expect(res.status).toBe(200);
    expect(res.body.data.EncounterList).toBeDefined();
    expect(res.body.data.EncounterList).toHaveLength(2);

    for (const e of res.body.data.EncounterList) {
      expect(e.subject.resource?.telecom).not.toBeTruthy();
    }
  });

  test('Cannot read resource type', async () => {
    // Bob does not have access to Practitioner resources
    const res = await request(app)
      .post('/fhir/R4/$graphql')
      .set('Authorization', 'Bearer ' + bobAccessToken)
      .set('Content-Type', ContentType.JSON)
      .send({
        query: `
      {
        Practitioner(id: "${practitioner.id}") {
          id
        }
      }
    `,
      });
    expect(res.status).toBe(200);
    expect(res.body.data.Practitioner).toBeNull();
  });

  test('Cannot read resource type in nested lookups', async () => {
    // Bob does not have access to Practitioner resources
    const res = await request(app)
      .post('/fhir/R4/$graphql')
      .set('Authorization', 'Bearer ' + bobAccessToken)
      .set('Content-Type', ContentType.JSON)
      .send({
        query: `
      {
        Patient(id: "${patient.id}") {
          id
          generalPractitioner {
            resource {
              ... on Practitioner {
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
    expect(res.body.data.Patient).toBeDefined();
    expect(res.body.data.Patient.generalPractitioner[0].resource).toBeNull();
  });

  test('Access policy criteria', async () => {
    // Bob can only access ServiceRequest in completed status
    const res = await request(app)
      .post('/fhir/R4/$graphql')
      .set('Authorization', 'Bearer ' + bobAccessToken)
      .set('Content-Type', ContentType.JSON)
      .send({
        query: `
      {
        ServiceRequest(id: "${serviceRequest.id}") {
          id
        }
      }
    `,
      });
    expect(res.status).toBe(200);
    expect(res.body.data.ServiceRequest).toBeNull();
  });

  test('Access policy criteria in nested lookups', async () => {
    // Bob can only access ServiceRequest in completed status
    const res = await request(app)
      .post('/fhir/R4/$graphql')
      .set('Authorization', 'Bearer ' + bobAccessToken)
      .set('Content-Type', ContentType.JSON)
      .send({
        query: `
      {
        Encounter(id: "${encounter1.id}") {
          id
          basedOn {
            resource {
              ... on ServiceRequest {
                id
                status
              }
            }
          }
        }
      }
    `,
      });
    expect(res.status).toBe(200);
    expect(res.body.data.Encounter).toBeDefined();
    expect(res.body.data.Encounter.basedOn[0].resource).toBeNull();
  });

  test('Max searches exceeded', async () => {
    const { accessToken } = await createTestProject({
      withAccessToken: true,
      project: {
        systemSetting: [{ name: 'graphqlMaxSearches', valueInteger: 1 }],
      },
    });

    // Create a patient
    const res1 = await request(app)
      .post('/fhir/R4/Patient')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });
    expect(res1.status).toBe(201);

    // GraphQL request with one search is ok
    const res2 = await request(app)
      .post('/fhir/R4/$graphql')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({
        query: `
        {
          PatientList {
            id
          }
        }
    `,
      });
    expect(res2.status).toBe(200);
    expect(res2.body.data.PatientList).toHaveLength(1);

    // GraphQL request with nested search is not ok
    // This should exceed the max searches limit
    const res3 = await request(app)
      .post('/fhir/R4/$graphql')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({
        query: `
        {
          PatientList {
            id
            encounters: EncounterList(_reference: patient) {
              resourceType
              id
            }
          }
        }
    `,
      });
    expect(res3.status).toBe(200);
    expect(res3.body.data.PatientList).toHaveLength(1);
    expect(res3.body.data.PatientList[0].encounters).toBeNull();
    expect(res3.body.errors).toHaveLength(1);
    expect(res3.body.errors[0].message).toEqual('Maximum number of searches exceeded');
  });
});
