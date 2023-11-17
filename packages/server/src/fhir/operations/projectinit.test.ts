import express from 'express';
import { loadTestConfig } from '../../config';
import { initApp, shutdownApp } from '../../app';
import { initTestAuth } from '../../test.setup';
import request from 'supertest';
import { ContentType, createReference, isUUID } from '@medplum/core';
import { randomUUID } from 'crypto';
import { createUser } from '../../auth/newuser';
import { Project } from '@medplum/fhirtypes';

const app = express();

describe('Project $init', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Success', async () => {
    const superAdminAccessToken = await initTestAuth({ superAdmin: true });
    expect(superAdminAccessToken).toBeDefined();

    const projectName = 'Test Init Project ' + randomUUID();
    const owner = await createUser({
      email: randomUUID() + '@example.com',
      password: 'iaudhbrglkjhabdfligubhaedrg',
      firstName: projectName,
      lastName: 'Admin',
    });

    const res = await request(app)
      .post(`/fhir/R4/Project/$init`)
      .set('Authorization', 'Bearer ' + superAdminAccessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'name',
            valueString: projectName,
          },
          {
            name: 'owner',
            valueString: createReference(owner).reference,
          },
        ],
      });
    expect(res.status).toBe(201);

    const project = res.body as Project;
    expect(project.id).toBeDefined();
    expect(isUUID(project.id as string)).toBe(true);
    expect(project.owner).toEqual(createReference(owner));
  });

  test('Requires project name', async () => {
    const superAdminAccessToken = await initTestAuth({ superAdmin: true });
    expect(superAdminAccessToken).toBeDefined();

    const owner = await createUser({
      email: randomUUID() + '@example.com',
      password: 'iaudhbrglkjhabdfligubhaedrg',
      firstName: 'The',
      lastName: 'Admin',
    });

    const res = await request(app)
      .post(`/fhir/R4/Project/$init`)
      .set('Authorization', 'Bearer ' + superAdminAccessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'owner',
            valueString: createReference(owner).reference,
          },
        ],
      });
    expect(res.status).toBe(400);
  });

  test('Requires owner to be User', async () => {
    const superAdminClientToken = await initTestAuth({ superAdmin: true });
    expect(superAdminClientToken).toBeDefined();

    const projectName = 'Test Init Project ' + randomUUID();
    const res = await request(app)
      .post(`/fhir/R4/Project/$init`)
      .set('Authorization', 'Bearer ' + superAdminClientToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'name',
            valueString: projectName,
          },
        ],
      });
    expect(res.status).toBe(400);
  });

  test('Requires server User', async () => {
    const accessToken = await initTestAuth();
    expect(accessToken).toBeDefined();

    const projectName = 'Test Init Project ' + randomUUID();
    const owner = await createUser({
      email: randomUUID() + '@example.com',
      password: 'iaudhbrglkjhabdfligubhaedrg',
      firstName: 'Other Project',
      lastName: 'Member',
      projectId: randomUUID(),
    });

    const res = await request(app)
      .post(`/fhir/R4/Project/$init`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'name',
            valueString: projectName,
          },
          {
            name: 'owner',
            valueString: createReference(owner).reference,
          },
        ],
      });
    expect(res.status).toBe(400);
  });

  test('Looks up existing user by email', async () => {
    const accessToken = await initTestAuth();
    expect(accessToken).toBeDefined();

    const ownerEmail = randomUUID() + '@example.com';
    const projectName = 'Test Init Project ' + randomUUID();
    const owner = await createUser({
      email: ownerEmail,
      password: 'iaudhbrglkjhabdfligubhaedrg',
      firstName: 'Server',
      lastName: 'User',
    });

    const res = await request(app)
      .post(`/fhir/R4/Project/$init`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'name',
            valueString: projectName,
          },
          {
            name: 'ownerEmail',
            valueString: ownerEmail,
          },
        ],
      });
    expect(res.status).toBe(201);

    const project = res.body as Project;
    expect(project.owner).toEqual(createReference(owner));
  });

  test('Creates new owner User from email', async () => {
    const accessToken = await initTestAuth();
    expect(accessToken).toBeDefined();

    const ownerEmail = randomUUID() + '@example.com';
    const projectName = 'Test Init Project ' + randomUUID();

    const res = await request(app)
      .post(`/fhir/R4/Project/$init`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'name',
            valueString: projectName,
          },
          {
            name: 'ownerEmail',
            valueString: ownerEmail,
          },
        ],
      });
    expect(res.status).toBe(201);
  });
});
