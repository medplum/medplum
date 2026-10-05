// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getReferenceString, resolveId } from '@medplum/core';
import type { BundleEntry, ClientApplication, ProjectMembership } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { registerNew } from '../auth/register';
import { loadTestConfig } from '../config/loader';
import { createTestProject, getSuperAdminAccessToken, withTestContext } from '../test.setup';

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
    expect(res2).toHaveStatus(201);
    expect(res2.body.resourceType).toBe('ClientApplication');
    expect(res2.body.id).toBeDefined();
    expect(res2.body.secret).toHaveLength(64);

    // Read the client
    const res3 = await request(app)
      .get('/fhir/R4/ClientApplication/' + res2.body.id)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res3).toHaveStatus(200);
    expect(res3.body.resourceType).toBe('ClientApplication');
    expect(res3.body.id).toBe(res2.body.id);

    // Create client with invalid name (should fail)
    const res4 = await request(app)
      .post('/admin/projects/' + project.id + '/client')
      .set('Authorization', 'Bearer ' + accessToken)
      .type('json')
      .send({ foo: 'bar' });
    expect(res4).toHaveStatus(400);
  });

  test('Create client as superadmin - verify projectID', async () => {
    const { project } = await createTestProject();

    // As a superadmin, create a new client
    const superAdminAccessToken = await getSuperAdminAccessToken();
    const res = await request(app)
      .post('/admin/projects/' + project.id + '/client')
      .set('Authorization', 'Bearer ' + superAdminAccessToken)
      .send({
        name: "Super Admin's test client",
        description: 'A client for testing creating a client with superadmin privileges.',
      });

    expect(res).toHaveStatus(201);
    expect((res.body as ClientApplication).resourceType).toBe('ClientApplication');
    expect((res.body as ClientApplication).id).toBeDefined();

    // Get the client membership
    const res2 = await request(app)
      .get('/fhir/R4/ProjectMembership?profile=' + getReferenceString(res.body as ClientApplication))
      .set('Authorization', 'Bearer ' + superAdminAccessToken);
    expect(res2).toHaveStatus(200);
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

  test('Cannot override server-controlled fields', async () => {
    const { project, accessToken } = await withTestContext(() =>
      registerNew({
        firstName: 'Bob',
        lastName: 'Jones',
        projectName: 'Bob Project',
        email: `bob${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );

    // Attempt to override "meta" and "resourceType" via the request body
    const otherProjectId = randomUUID();
    const res = await request(app)
      .post('/admin/projects/' + project.id + '/client')
      .set('Authorization', 'Bearer ' + accessToken)
      .type('json')
      .send({
        name: 'Bob client',
        resourceType: 'Patient',
        meta: {
          project: otherProjectId,
          tag: [{ system: 'http://example.com', code: 'test' }],
        },
      });
    expect(res).toHaveStatus(201);
    expect(res.body.resourceType).toBe('ClientApplication');
    expect(res.body.secret).toHaveLength(64);

    // The client stays in the caller's project, and the caller-supplied tag is preserved
    expect(res.body.meta.project).toBe(project.id);
    expect(res.body.meta.tag).toStrictEqual([{ system: 'http://example.com', code: 'test' }]);

    // The project admin can still read the client
    const res2 = await request(app)
      .get('/fhir/R4/ClientApplication/' + res.body.id)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res2).toHaveStatus(200);
    expect(res2.body.id).toBe(res.body.id);

    // ...and still find it by search
    const res3 = await request(app)
      .get('/fhir/R4/ClientApplication?name=Bob client')
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res3).toHaveStatus(200);
    expect(res3.body.entry?.map((e: BundleEntry<ClientApplication>) => e.resource?.id)).toContain(res.body.id);
  });

  test('Create client with caller-supplied secret', async () => {
    const { project, accessToken } = await withTestContext(() =>
      registerNew({
        firstName: 'Dave',
        lastName: 'Jones',
        projectName: 'Dave Project',
        email: `dave${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );

    const res = await request(app)
      .post('/admin/projects/' + project.id + '/client')
      .set('Authorization', 'Bearer ' + accessToken)
      .type('json')
      .send({ name: 'Dave client', secret: 'dave-client-secret' });
    expect(res).toHaveStatus(201);
    expect(res.body.secret).toBe('dave-client-secret');
    expect(res.body.meta.project).toBe(project.id);
  });
});
