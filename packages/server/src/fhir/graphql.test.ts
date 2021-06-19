import express from 'express';
import request from 'supertest';
import { initApp } from '../app';
import { loadConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { initTestAuth } from '../jest.setup';
import { initKeys } from '../oauth';

const app = express();
let accessToken: string;

beforeAll(async () => {
  const config = await loadConfig('file:medplum.config.json');
  await initDatabase({ client: 'sqlite3' });
  await initApp(app);
  await initKeys(config);
  accessToken = await initTestAuth();
});

afterAll(async () => {
  await closeDatabase();
});

test('GraphQL schema', (done) => {
  request(app)
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
    })
    .expect(200, done);
});

test('GraphQL read by ID', (done) => {
  request(app)
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
    })
    .expect(200)
    .end((err: any, res: any) => {
      expect(res.body.Patient).not.toBeNull();
      done();
    });
});

test('GraphQL search', (done) => {
  request(app)
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
    })
    .expect(200)
    .end((err: any, res: any) => {
      expect(res.body.PatientList).not.toBeNull();
      done();
    });
});
