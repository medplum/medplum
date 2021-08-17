import express from 'express';
import request from 'supertest';
import { initApp } from '../app';
import { loadTestConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { initTestAuth } from '../jest.setup';
import { initKeys } from '../oauth';
import { repo } from './repo';

const app = express();
let accessToken: string;

describe('GraphQL', () => {

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initDatabase(config.database);
    await initApp(app);
    await initKeys(config);
    accessToken = await initTestAuth();

    await repo.updateResource({
      resourceType: 'Patient',
      id: '8a54c7db-654b-4c3d-ba85-e0909f51c12b',
      name: [{
        given: ['Alice'],
        family: 'Smith'
      }]
    });
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
    `
      });
    expect(res.status).toBe(200);
  });

  test('Read by ID', async () => {
    const res = await request(app)
      .post('/fhir/R4/$graphql')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/json')
      .send({
        query: `
      {
        Patient(id: "8a54c7db-654b-4c3d-ba85-e0909f51c12b") {
          id
          name { given }
        }
      }
    `
      });
    expect(res.status).toBe(200);
    expect(res.body.Patient).not.toBeNull();
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
    `
      });
    expect(res.status).toBe(200);
    expect(res.body.PatientList).not.toBeNull();
  });

});
