import { getReferenceString, isUUID, Operator } from '@medplum/core';
import {
  BundleEntry,
  ClientApplication,
  Login,
  Observation,
  Patient,
  Project,
  ProjectMembership,
  Reference,
  User,
} from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import { pwnedPassword } from 'hibp';
import fetch from 'node-fetch';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { createProject } from '../../auth/newproject';
import { loadTestConfig } from '../../config';
import { createTestProject, initTestAuth, setupPwnedPasswordMock, setupRecaptchaMock } from '../../test.setup';
import { systemRepo } from '../repo';

jest.mock('node-fetch');
jest.mock('hibp');

const app = express();

describe('Project clone', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    (fetch as unknown as jest.Mock).mockClear();
    (pwnedPassword as unknown as jest.Mock).mockClear();
    setupPwnedPasswordMock(pwnedPassword as unknown as jest.Mock, 0);
    setupRecaptchaMock(fetch as unknown as jest.Mock, true);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Forbidden', async () => {
    const accessToken = await initTestAuth();
    const res = await request(app)
      .post(`/fhir/R4/Project/${randomUUID()}/$clone`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send({});
    expect(res.status).toBe(403);
  });

  test('Success', async () => {
    const { project } = await createTestProject();
    expect(project).toBeDefined();

    const patient = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      meta: { project: project.id },
      name: [{ given: ['Alice'], family: 'Smith' }],
    });
    expect(patient).toBeDefined();

    const obs = await systemRepo.createResource<Observation>({
      resourceType: 'Observation',
      meta: { project: project.id },
      status: 'final',
      code: { coding: [{ system: 'http://loinc.org', code: '12345-6' }] },
      subject: { reference: 'Patient/' + patient.id },
    });
    expect(obs).toBeDefined();

    const superAdminAccessToken = await initTestAuth({ superAdmin: true });
    expect(superAdminAccessToken).toBeDefined();

    const res = await request(app)
      .post(`/fhir/R4/Project/${project.id}/$clone`)
      .set('Authorization', 'Bearer ' + superAdminAccessToken)
      .set('Content-Type', 'application/fhir+json')
      .set('X-Medplum', 'extended')
      .send({});
    expect(res.status).toBe(201);

    const newProjectId = res.body.id;
    expect(newProjectId).toBeDefined();
    expect(isUUID(newProjectId)).toBe(true);
    expect(newProjectId).not.toEqual(project.id);

    const newProject = await systemRepo.readResource<Project>('Project', newProjectId);
    expect(newProject).toBeDefined();

    const patientBundle = await systemRepo.search({
      resourceType: 'Patient',
      filters: [{ code: '_project', operator: Operator.EQUALS, value: newProjectId }],
    });
    expect(patientBundle).toBeDefined();
    expect(patientBundle.entry).toHaveLength(1);

    const obsBundle = await systemRepo.search({
      resourceType: 'Observation',
      filters: [{ code: '_project', operator: Operator.EQUALS, value: newProjectId }],
    });
    expect(obsBundle).toBeDefined();
    expect(obsBundle.entry).toHaveLength(1);
    expect((obsBundle.entry?.[0]?.resource as Observation).subject?.reference).toEqual(
      getReferenceString(patientBundle.entry?.[0]?.resource as Patient)
    );
  });

  test('Success with project name in body', async () => {
    const { project } = await createTestProject();
    const newProjectName = 'A New Name for cloned project';
    expect(project).toBeDefined();

    const superAdminAccessToken = await initTestAuth({ superAdmin: true });
    expect(superAdminAccessToken).toBeDefined();

    const res = await request(app)
      .post(`/fhir/R4/Project/${project.id}/$clone`)
      .set('Authorization', 'Bearer ' + superAdminAccessToken)
      .set('Content-Type', 'application/fhir+json')
      .set('X-Medplum', 'extended')
      .send({ name: newProjectName });
    expect(res.status).toBe(201);

    const newProjectId = res.body.id;
    const newProject = await systemRepo.readResource<Project>('Project', newProjectId);
    expect(newProject).toBeDefined();
    expect(newProject.name).toBe(newProjectName);

    const ProjectMembershipBundle = await systemRepo.search({
      resourceType: 'ProjectMembership',
      filters: [{ code: '_project', operator: Operator.EQUALS, value: newProjectId }],
    });
    expect(ProjectMembershipBundle).toBeDefined();
    expect(ProjectMembershipBundle.entry?.length).toBeGreaterThanOrEqual(1);

    for (const entry of ProjectMembershipBundle.entry as BundleEntry[]) {
      const resource = entry.resource as ProjectMembership;

      expect(resource?.project?.display).toBe(newProjectName);
    }

    const ClientApplicationBundle = await systemRepo.search({
      resourceType: 'ClientApplication',
      filters: [{ code: '_project', operator: Operator.EQUALS, value: newProjectId }],
    });
    expect(ClientApplicationBundle).toBeDefined();
    expect(ClientApplicationBundle.entry).toHaveLength(1);
    for (const entry of ClientApplicationBundle.entry as BundleEntry[]) {
      const resource = entry.resource as ClientApplication;

      expect(resource?.name).not.toContain(newProjectName);
    }
  });

  test('Success with project name in body and has project name + Default Client in ClientApplication.name', async () => {
    const res1 = await request(app)
      .post('/auth/newuser')
      .type('json')
      .send({
        firstName: 'Alexander',
        lastName: 'Hamilton',
        email: `alex${randomUUID()}@example.com`,
        password: 'password!@#',
        recaptchaToken: 'xyz',
        codeChallenge: 'xyz',
        codeChallengeMethod: 'plain',
      });
    const login = await systemRepo.readResource<Login>('Login', res1.body.login);
    const user = await systemRepo.readReference<User>(login.user as Reference<User>);
    const { firstName, lastName } = user;

    expect(res1.status).toBe(200);
    const { project } = await createProject(login, 'Test Project Name', firstName as string, lastName as string);
    const newProjectName = 'A New Name for a cloned project';
    expect(project).toBeDefined();

    const superAdminAccessToken = await initTestAuth({ superAdmin: true });
    expect(superAdminAccessToken).toBeDefined();

    const res = await request(app)
      .post(`/fhir/R4/Project/${project.id}/$clone`)
      .set('Authorization', 'Bearer ' + superAdminAccessToken)
      .set('Content-Type', 'application/fhir+json')
      .set('X-Medplum', 'extended')
      .send({ name: newProjectName });
    expect(res.status).toBe(201);

    const ClientApplicationBundle = await systemRepo.search({
      resourceType: 'ClientApplication',
      filters: [{ code: '_project', operator: Operator.EQUALS, value: res.body.id }],
    });
    expect(ClientApplicationBundle).toBeDefined();
    expect(ClientApplicationBundle.entry).toHaveLength(1);
    for (const entry of ClientApplicationBundle.entry as BundleEntry[]) {
      const resource = entry.resource as ClientApplication;

      expect(resource?.name).toContain(newProjectName);
      expect(resource?.description).toContain(newProjectName);
    }
  });

  test('Success with resource type in body', async () => {
    const { project } = await createTestProject();
    const resourceTypes = ['ProjectMembership'];
    expect(project).toBeDefined();

    const superAdminAccessToken = await initTestAuth({ superAdmin: true });
    expect(superAdminAccessToken).toBeDefined();

    const res = await request(app)
      .post(`/fhir/R4/Project/${project.id}/$clone`)
      .set('Authorization', 'Bearer ' + superAdminAccessToken)
      .set('Content-Type', 'application/fhir+json')
      .set('X-Medplum', 'extended')
      .send({ resourceTypes });
    expect(res.status).toBe(201);

    const newProjectId = res.body.id;
    const newProject = await systemRepo.readResource<Project>('Project', newProjectId);
    expect(newProject).toBeDefined();
    expect(newProject.name).toBeDefined();

    const ProjectMembershipBundle = await systemRepo.search({
      resourceType: 'ProjectMembership',
      filters: [{ code: '_project', operator: Operator.EQUALS, value: newProjectId }],
    });
    expect(ProjectMembershipBundle).toBeDefined();
    expect(ProjectMembershipBundle.entry?.length).toBeGreaterThanOrEqual(1);

    const ClientApplicationBundle = await systemRepo.search({
      resourceType: 'ClientApplication',
      filters: [{ code: '_project', operator: Operator.EQUALS, value: newProjectId }],
    });
    expect(ClientApplicationBundle).toBeDefined();
    expect(ClientApplicationBundle.entry).toHaveLength(0);
  });

  test('Success with includeIds in body', async () => {
    const { project, membership, client } = await createTestProject();
    const includeIds = [membership.id, client.id];
    expect(project).toBeDefined();

    const superAdminAccessToken = await initTestAuth({ superAdmin: true });
    expect(superAdminAccessToken).toBeDefined();

    const res = await request(app)
      .post(`/fhir/R4/Project/${project.id}/$clone`)
      .set('Authorization', 'Bearer ' + superAdminAccessToken)
      .set('Content-Type', 'application/fhir+json')
      .set('X-Medplum', 'extended')
      .send({ includeIds });
    expect(res.status).toBe(201);

    const newProjectId = res.body.id;
    const newProject = await systemRepo.readResource<Project>('Project', newProjectId);
    expect(newProject).toBeDefined();
    expect(newProject.name).toBeDefined();

    const ProjectMembershipBundle = await systemRepo.search({
      resourceType: 'ProjectMembership',
      filters: [{ code: '_project', operator: Operator.EQUALS, value: newProjectId }],
    });
    expect(ProjectMembershipBundle).toBeDefined();
    expect(ProjectMembershipBundle.entry?.length).toBeGreaterThanOrEqual(1);

    const ClientApplicationBundle = await systemRepo.search({
      resourceType: 'ClientApplication',
      filters: [{ code: '_project', operator: Operator.EQUALS, value: newProjectId }],
    });
    expect(ClientApplicationBundle).toBeDefined();
    expect(ClientApplicationBundle.entry).toHaveLength(1);
  });
});
