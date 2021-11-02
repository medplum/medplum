import { ClientApplication, Patient } from '@medplum/core';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp } from '../app';
import { loadTestConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { generateSecret, initKeys } from '../oauth';
import { seedDatabase } from '../seed';

const app = express();

describe('Register', () => {

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initDatabase(config.database);
    await seedDatabase();
    await initApp(app);
    await initKeys(config);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test('Success', async () => {
    const res = await request(app)
      .post('/auth/register')
      .type('json')
      .send({
        firstName: 'Alexander',
        lastName: 'Hamilton',
        projectName: 'Hamilton Project',
        email: `alex${randomUUID()}@example.com`,
        password: 'password!@#'
      });

    expect(res.status).toBe(200);
    expect(res.body.profile).not.toBeUndefined();
    expect(res.body.idToken).not.toBeUndefined();
    expect(res.body.accessToken).not.toBeUndefined();
    expect(res.body.refreshToken).not.toBeUndefined();
  });

  test('Email already registered', async () => {
    const registerRequest = {
      firstName: 'George',
      lastName: 'Washington',
      projectName: 'Washington Project',
      email: `george${randomUUID()}@example.com`,
      password: 'password!@#'
    };

    const res = await request(app)
      .post('/auth/register')
      .type('json')
      .send(registerRequest);

    expect(res.status).toBe(200);
    expect(res.body.profile).not.toBeUndefined();

    const res2 = await request(app)
      .post('/auth/register')
      .type('json')
      .send(registerRequest);

    expect(res2.status).toBe(400);
    expect(res2.body.issue[0].details.text).toBe('Email already registered');
    expect(res2.body.issue[0].expression[0]).toBe('email');
  });

  test('Cannot access Project resource', async () => {
    const res = await request(app)
      .post('/auth/register')
      .type('json')
      .send({
        firstName: 'Alexander',
        lastName: 'Hamilton',
        projectName: 'Hamilton Project',
        email: `alex${randomUUID()}@example.com`,
        password: 'password!@#'
      });

    expect(res.status).toBe(200);
    expect(res.body.project).not.toBeUndefined();

    const res2 = await request(app)
      .get(`/fhir/R4/Project/${res.body.project.id}`)
      .set('Authorization', 'Bearer ' + res.body.accessToken);

    expect(res2.status).toBe(404);
  });

  test('Can access Practitioner resource', async () => {
    const res = await request(app)
      .post('/auth/register')
      .type('json')
      .send({
        firstName: 'Alexander',
        lastName: 'Hamilton',
        projectName: 'Hamilton Project',
        email: `alex${randomUUID()}@example.com`,
        password: 'password!@#'
      });

    expect(res.status).toBe(200);
    expect(res.body.profile).not.toBeUndefined();

    const res2 = await request(app)
      .get(`/fhir/R4/Practitioner/${res.body.profile.id}`)
      .set('Authorization', 'Bearer ' + res.body.accessToken);

    expect(res2.status).toBe(200);
  });

  test('Can create a ClientApplication', async () => {
    const res = await request(app)
      .post('/auth/register')
      .type('json')
      .send({
        firstName: 'Alexander',
        lastName: 'Hamilton',
        projectName: 'Hamilton Project',
        email: `alex${randomUUID()}@example.com`,
        password: 'password!@#'
      });

    expect(res.status).toBe(200);
    expect(res.body.profile).not.toBeUndefined();

    const client: ClientApplication = {
      resourceType: 'ClientApplication',
      name: 'Test App',
      secret: generateSecret(48),
      redirectUri: 'https://example.com'
    };

    const res2 = await request(app)
      .post(`/fhir/R4/ClientApplication`)
      .set('Authorization', 'Bearer ' + res.body.accessToken)
      .type('json')
      .send(client);

    expect(res2.status).toBe(201);
  });

  test('ClientApplication is restricted to project', async () => {
    // User1 registers
    // User1 creates a patient
    // User2 registers
    // User2 creates a client
    // Client should not be able to see User1 patients
    // Client should not see User1 patients in search
    const res = await request(app)
      .post('/auth/register')
      .type('json')
      .send({
        firstName: 'User1',
        lastName: 'User1',
        projectName: 'User1 Project',
        email: `user1-${randomUUID()}@example.com`,
        password: 'password!@#'
      });

    expect(res.status).toBe(200);
    expect(res.body.profile).not.toBeUndefined();

    const patient: Patient = {
      resourceType: 'Patient',
      name: [{
        given: ['Patient1'],
        family: 'Patient1'
      }]
    };

    const res2 = await request(app)
      .post(`/fhir/R4/Patient`)
      .set('Authorization', 'Bearer ' + res.body.accessToken)
      .type('json')
      .send(patient);

    expect(res2.status).toBe(201);

    const res3 = await request(app)
      .post('/auth/register')
      .type('json')
      .send({
        firstName: 'User2',
        lastName: 'User2',
        projectName: 'User2 Project',
        email: `user2-${randomUUID()}@example.com`,
        password: 'password!@#'
      });

    expect(res3.status).toBe(200);
    expect(res3.body.profile).not.toBeUndefined();

    // Try to access User1 patient using User2 directly
    // This should fail
    const res4 = await request(app)
      .get(`/fhir/R4/Patient/${res2.body.id}`)
      .set('Authorization', 'Bearer ' + res3.body.accessToken);
    expect(res4.status).toBe(404);

    // Create a client application
    const client: ClientApplication = {
      resourceType: 'ClientApplication',
      name: 'User2 Client',
      secret: generateSecret(48),
      redirectUri: 'https://example.com'
    };

    const res5 = await request(app)
      .post(`/fhir/R4/ClientApplication`)
      .set('Authorization', 'Bearer ' + res3.body.accessToken)
      .type('json')
      .send(client);

    expect(res5.status).toBe(201);

    // Get a token using the client
    const res6 = await request(app)
      .post('/oauth2/token')
      .type('form')
      .send({
        grant_type: 'client_credentials',
        client_id: res5.body.id,
        client_secret: res5.body.secret
      });
    expect(res6.status).toBe(200);
    expect(res6.body.error).toBeUndefined();
    expect(res6.body.access_token).not.toBeUndefined();

    // Try to access User1 patient using User2 directly
    // This should fail
    const res7 = await request(app)
      .get(`/fhir/R4/Patient/${res2.body.id}`)
      .set('Authorization', 'Bearer ' + res6.body.access_token);
    expect(res7.status).toBe(404);

    // Try to search for patients using User2 client
    // This should return empty set
    const res8 = await request(app)
      .get(`/fhir/R4/Patient`)
      .set('Authorization', 'Bearer ' + res6.body.access_token);
    expect(res8.status).toBe(200);
    expect(res8.body.entry.length).toEqual(0);
  });

  test('GraphQL is restricted to project', async () => {
    // User1 registers
    // User1 creates a patient
    // User2 registers
    // User2 should not see User1 patients in search
    // User2 should not be able to see User1 patients by GraphQL
    const res = await request(app)
      .post('/auth/register')
      .type('json')
      .send({
        firstName: 'User1',
        lastName: 'User1',
        projectName: 'User1 Project',
        email: `user1-${randomUUID()}@example.com`,
        password: 'password!@#'
      });

    expect(res.status).toBe(200);
    expect(res.body.profile).not.toBeUndefined();

    const patient: Patient = {
      resourceType: 'Patient',
      name: [{
        given: ['Patient1'],
        family: 'Patient1'
      }]
    };

    const res2 = await request(app)
      .post(`/fhir/R4/Patient`)
      .set('Authorization', 'Bearer ' + res.body.accessToken)
      .type('json')
      .send(patient);

    expect(res2.status).toBe(201);

    const res3 = await request(app)
      .post('/auth/register')
      .type('json')
      .send({
        firstName: 'User2',
        lastName: 'User2',
        projectName: 'User2 Project',
        email: `user2-${randomUUID()}@example.com`,
        password: 'password!@#'
      });

    expect(res3.status).toBe(200);
    expect(res3.body.profile).not.toBeUndefined();

    // Try to access User1 patient using User2 directly
    // This should fail
    const res4 = await request(app)
      .get(`/fhir/R4/Patient/${res2.body.id}`)
      .set('Authorization', 'Bearer ' + res3.body.accessToken);
    expect(res4.status).toBe(404);

    // Try to access User1 patient using User2 graphql
    // This should fail
    const res5 = await request(app)
      .post(`/fhir/R4/$graphql`)
      .set('Authorization', 'Bearer ' + res3.body.accessToken)
      .type('json')
      .send({
        query: `{
          PatientList(name:"Patient1") {
            name {
              family
            }
          }
        }`
      });
    expect(res5.status).toBe(200);
    expect(res5.body.data).not.toBeUndefined();
    expect(res5.body.data.PatientList).not.toBeUndefined();
    expect(res5.body.data.PatientList.length).toEqual(0);
  });

});
