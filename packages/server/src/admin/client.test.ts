import { getReferenceString, resolveId } from '@medplum/core';
import type { BundleEntry, ClientApplication, ProjectMembership } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { registerNew } from '../auth/register';
import { loadTestConfig } from '../config';
import { createTestProject, initTestAuth, withTestContext } from '../test.setup';

const app = express();

describe('Client admin', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await withTestContext(() => initApp(app, config));
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Create new client', async () => {
    // First, Alice creates a project
    const { project, accessToken } = await withTestContext(() =>
      registerNew({
        firstName: 'Alice',
        lastName: 'Smith',
        projectName: 'Alice Project',
        email: `alice${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );

    // Next, Alice creates a client
    const res2 = await request(app)
      .post('/admin/projects/' + project.id + '/client')
      .set('Authorization', 'Bearer ' + accessToken)
      .type('json')
      .send({
        name: 'Alice personal client',
        description: 'Alice client description',
      });
    expect(res2.status).toBe(201);
    expect(res2.body.resourceType).toBe('ClientApplication');
    expect(res2.body.id).toBeDefined();
    expect(res2.body.secret).toBeDefined();
    expect(res2.body.secret).toHaveLength(64);

    // Read the client
    const res3 = await request(app)
      .get('/fhir/R4/ClientApplication/' + res2.body.id)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res3.status).toBe(200);
    expect(res3.body.resourceType).toBe('ClientApplication');
    expect(res3.body.id).toBe(res2.body.id);

    // Create client with invalid name (should fail)
    const res4 = await request(app)
      .post('/admin/projects/' + project.id + '/client')
      .set('Authorization', 'Bearer ' + accessToken)
      .type('json')
      .send({ foo: 'bar' });
    expect(res4.status).toBe(400);
  });

  test('Create client as superadmin - verify projectID', async () => {
    const { project } = await createTestProject();

    // As a superadmin, create a new client
    const superAdminAccessToken = await initTestAuth({ superAdmin: true });
    const res = await request(app)
      .post('/admin/projects/' + project.id + '/client')
      .set('Authorization', 'Bearer ' + superAdminAccessToken)
      .send({
        name: "Super Admin's test client",
        description: 'A client for testing creating a client with superadmin privileges.',
      });

    expect(res.status).toBe(201);
    expect((res.body as ClientApplication).resourceType).toBe('ClientApplication');
    expect((res.body as ClientApplication).id).toBeDefined();

    // Get the client membership
    const res2 = await request(app)
      .get('/fhir/R4/ProjectMembership?profile=' + getReferenceString(res.body as ClientApplication))
      .set('Authorization', 'Bearer ' + superAdminAccessToken);
    expect(res2.status).toBe(200);
    expect(res2.body.resourceType).toBe('Bundle');

    // Find the membership
    const clientMembership = res2.body.entry.find(
      (e: BundleEntry<ProjectMembership>) =>
        e.resource?.profile?.reference === getReferenceString(res.body as ClientApplication)
    )?.resource;
    expect(clientMembership).toBeDefined();
    expect(clientMembership.resourceType).toBe('ProjectMembership');

    // Get the id of the project attached to this membership
    const projectId = resolveId(clientMembership.project);

    expect(projectId).toBe(project.id);
  });
});
