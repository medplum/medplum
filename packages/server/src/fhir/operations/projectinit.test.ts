// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { ContentType, createReference, getReferenceString, isUUID } from '@medplum/core';
import type {
  AccessPolicy,
  Bot,
  ClientApplication,
  Practitioner,
  Project,
  ProjectMembership,
  Reference,
} from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { vi } from 'vitest';
import { initApp, shutdownApp } from '../../app';
import { createUser } from '../../auth/newuser';
import { loadTestConfig } from '../../config/loader';
import type { ServerConfig } from '../../config/utils';
import {
  addTestUser,
  getSuperAdminAccessToken,
  getSuperAdminTestProject,
  initTestAuth,
  setupRecaptchaMock,
  withTestContext,
} from '../../test.setup';
import { getGlobalSystemRepo } from '../repo';
import { createProject, PRACTITIONER_READONLY_RESOURCE_TYPES } from './projectinit';

const fetchMock = vi.spyOn(globalThis, 'fetch');
const app = express();

describe('Project $init', () => {
  let config: ServerConfig;

  beforeAll(async () => {
    config = await loadTestConfig();
    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  beforeEach(() => {
    fetchMock.mockClear();
    setupRecaptchaMock(true);
  });

  test('Success', async () => {
    const superAdminAccessToken = await getSuperAdminAccessToken();

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
            valueReference: createReference(owner),
          },
        ],
      });
    expect(res).toHaveStatus(201);

    const project = res.body as WithId<Project>;
    expect(project.id).toBeDefined();
    expect(isUUID(project.id)).toBe(true);
    expect(project.owner).toStrictEqual(createReference(owner));

    // Open patient registration is disabled by default
    const updatedProject = await withTestContext(() =>
      getGlobalSystemRepo().readResource<Project>('Project', project.id)
    );
    expect(updatedProject.defaultPatientAccessPolicy).toBeUndefined();

    // Verify defaultAccessPolicies array is provisioned with Patient, RelatedPerson, Admin, and Practitioner entries
    expect(updatedProject.defaultAccessPolicies).toHaveLength(4);
    const patientEntry = updatedProject.defaultAccessPolicies?.find((p) => p.profileType === 'Patient');
    const relatedPersonEntry = updatedProject.defaultAccessPolicies?.find((p) => p.profileType === 'RelatedPerson');
    const adminEntry = updatedProject.defaultAccessPolicies?.find((p) => p.profileType === 'Admin');
    const practitionerEntry = updatedProject.defaultAccessPolicies?.find((p) => p.profileType === 'Practitioner');
    expect(patientEntry?.accessPolicy.reference).toMatch(/^AccessPolicy\//);
    expect(relatedPersonEntry?.accessPolicy.reference).toMatch(/^AccessPolicy\//);
    expect(adminEntry?.accessPolicy.reference).toMatch(/^AccessPolicy\//);
    expect(practitionerEntry?.accessPolicy.reference).toMatch(/^AccessPolicy\//);
    // Each role gets a separate policy instance
    const references = [
      patientEntry?.accessPolicy.reference,
      relatedPersonEntry?.accessPolicy.reference,
      adminEntry?.accessPolicy.reference,
      practitionerEntry?.accessPolicy.reference,
    ];
    expect(new Set(references).size).toBe(4);

    // Verify the Admin default policy grants full read/write to everything
    const adminPolicy = await withTestContext(() =>
      getGlobalSystemRepo().readReference<AccessPolicy>(adminEntry?.accessPolicy as Reference<AccessPolicy>)
    );
    expect(adminPolicy.resource).toStrictEqual([{ resourceType: '*' }]);

    // Verify the Practitioner default policy is read-all + write-all-except-knowledge-resources
    const practitionerPolicy = await withTestContext(() =>
      getGlobalSystemRepo().readReference<AccessPolicy>(practitionerEntry?.accessPolicy as Reference<AccessPolicy>)
    );
    // ClientApplication secrets are hidden; this entry must precede the readonly wildcard,
    // since the first matching entry decides which fields are hidden
    expect(practitionerPolicy.resource?.[0]).toStrictEqual({
      resourceType: 'ClientApplication',
      hiddenFields: ['secret', 'retiringSecret'],
    });
    // Read access to everything via a readonly wildcard
    expect(practitionerPolicy.resource?.[1]).toStrictEqual({ resourceType: '*', readonly: true });
    // Writable clinical resource types are granted explicitly
    expect(practitionerPolicy.resource).toContainEqual({ resourceType: 'Patient' });
    expect(practitionerPolicy.resource).toContainEqual({ resourceType: 'Observation' });
    // Read-only resource types are NOT writable (only the readonly wildcard covers them)
    for (const readonlyType of PRACTITIONER_READONLY_RESOURCE_TYPES) {
      expect(practitionerPolicy.resource).not.toContainEqual({ resourceType: readonlyType });
    }
    // Non-admin Practitioners can read (and therefore execute) Bots, but not save or deploy them
    expect(PRACTITIONER_READONLY_RESOURCE_TYPES).toContain('Bot');
    expect(practitionerPolicy.resource).not.toContainEqual({ resourceType: 'Bot' });
  });

  test('Requires project name', async () => {
    const superAdminAccessToken = await getSuperAdminAccessToken();

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
            valueReference: createReference(owner),
          },
        ],
      });
    expect(res).toHaveStatus(400);
  });

  test('Requires owner to be User', async () => {
    const { repo: superAdminRepo, accessToken: superAdminClientToken } = await getSuperAdminTestProject();
    const doc = await withTestContext(() =>
      superAdminRepo.createResource<Practitioner>({ resourceType: 'Practitioner' })
    );

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
          {
            name: 'owner',
            valueReference: createReference(doc),
          },
        ],
      });
    expect(res).toHaveStatus(400);
  });

  test('Requires server User', async () => {
    const accessToken = await initTestAuth();

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
            valueReference: createReference(owner),
          },
        ],
      });
    expect(res).toHaveStatus(400);
  });

  test('Looks up existing user by email', async () => {
    const accessToken = await initTestAuth();

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
    expect(res).toHaveStatus(201);

    const project = res.body as Project;
    expect(project.owner).toStrictEqual(createReference(owner));
  });

  test('Creates new owner User from email', async () => {
    const accessToken = await initTestAuth();

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
    expect(res).toHaveStatus(201);
  });

  test('Defaults to no owner if unspecified', async () => {
    const accessToken = await initTestAuth();

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
        ],
      });
    expect(res).toHaveStatus(201);
    const project = res.body as Project;
    expect(project.owner).toBeUndefined();
  });

  test('Specify defaultProjectSystemSetting', async () => {
    const originalDefaultProjectSystemSetting = config.defaultProjectSystemSetting;
    config.defaultProjectSystemSetting = [{ name: 'searchTokenColumns', valueBoolean: true }];

    const accessToken = await initTestAuth();
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
        ],
      });
    expect(res).toHaveStatus(201);
    const project = res.body as Project;
    expect(project.owner).toBeUndefined();
    expect(project.systemSetting).toStrictEqual(config.defaultProjectSystemSetting);

    config.defaultProjectSystemSetting = originalDefaultProjectSystemSetting;
  });

  test('New project registration disabled', async () => {
    config.newProjectRegistrationEnabled = false;
    try {
      const body = {
        resourceType: 'Parameters',
        parameter: [{ name: 'name', valueString: 'Test Init Project ' + randomUUID() }],
      };

      const accessToken = await initTestAuth();
      const res1 = await request(app)
        .post(`/fhir/R4/Project/$init`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send(body);
      expect(res1).toHaveStatus(400);
      expect(res1.body.issue[0].details.text).toBe('New project registration is disabled');

      // Super admins can still provision projects
      const superAdminAccessToken = await getSuperAdminAccessToken();
      const res2 = await request(app)
        .post(`/fhir/R4/Project/$init`)
        .set('Authorization', 'Bearer ' + superAdminAccessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send(body);
      expect(res2).toHaveStatus(201);
    } finally {
      config.newProjectRegistrationEnabled = undefined;
    }
  });

  test('Default Practitioner policy restricts project administration', async () => {
    const owner = await createUser({
      email: randomUUID() + '@example.com',
      password: randomUUID(),
      firstName: 'The',
      lastName: 'Admin',
    });
    const { project, client } = await withTestContext(() => createProject('Practitioner Policy Project', owner));
    const systemRepo = getGlobalSystemRepo();
    const bot = await withTestContext(() =>
      systemRepo.createResource<Bot>({ resourceType: 'Bot', meta: { project: project.id }, name: 'Test Bot' })
    );
    const accessPolicy = await withTestContext(() =>
      systemRepo.readReference<AccessPolicy>(
        project.defaultAccessPolicies?.find((p) => p.profileType === 'Practitioner')
          ?.accessPolicy as Reference<AccessPolicy>
      )
    );

    // Invited without an explicit policy, so the member gets the Practitioner default
    const { accessToken, membership } = await withTestContext(() => addTestUser(project));
    expect(membership.accessPolicy?.reference).toBe(getReferenceString(accessPolicy));
    const auth = 'Bearer ' + accessToken;

    // ClientApplication secrets are hidden on read...
    const res1 = await request(app).get(`/fhir/R4/ClientApplication/${client.id}`).set('Authorization', auth);
    expect(res1).toHaveStatus(200);
    expect(res1.body.name).toBe(client.name);
    expect(res1.body.secret).toBeUndefined();
    expect(res1.body.retiringSecret).toBeUndefined();

    // ...and cannot be changed, by update or by $rotate-secret
    const res2 = await request(app)
      .put(`/fhir/R4/ClientApplication/${client.id}`)
      .set('Authorization', auth)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ ...res1.body, description: 'Updated', secret: 'new-secret' } satisfies ClientApplication);
    expect(res2).toHaveStatus(200);
    const updatedClient = await withTestContext(() =>
      systemRepo.readResource<ClientApplication>('ClientApplication', client.id)
    );
    expect(updatedClient.description).toBe('Updated');
    expect(updatedClient.secret).toBe(client.secret);

    const res3 = await request(app)
      .post(`/fhir/R4/ClientApplication/${client.id}/$rotate-secret`)
      .set('Authorization', auth)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ resourceType: 'Parameters', parameter: [{ name: 'secret', valueString: client.secret }] });
    expect(res3).toHaveStatus(403);

    // Cannot create ProjectMemberships or invite users
    const res4 = await request(app)
      .post(`/fhir/R4/ProjectMembership`)
      .set('Authorization', auth)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'ProjectMembership',
        project: createReference(project),
        user: createReference(owner),
        profile: { reference: 'Practitioner/' + randomUUID() },
      } satisfies ProjectMembership);
    expect(res4).toHaveStatus(403);

    const res5 = await request(app)
      .post(`/admin/projects/${project.id}/invite`)
      .set('Authorization', auth)
      .send({ resourceType: 'Practitioner', firstName: 'New', lastName: 'User', email: randomUUID() + '@example.com' });
    expect(res5).toHaveStatus(403);

    // Cannot edit the Project
    const res6 = await request(app)
      .put(`/fhir/R4/Project/${project.id}`)
      .set('Authorization', auth)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ ...project, name: 'Renamed' } satisfies Project);
    expect(res6.status).toBeGreaterThanOrEqual(400);
    const unchangedProject = await withTestContext(() => systemRepo.readResource<Project>('Project', project.id));
    expect(unchangedProject.name).toBe(project.name);

    // Can read AccessPolicies, but not create or edit them
    const res7 = await request(app).get(`/fhir/R4/AccessPolicy/${accessPolicy.id}`).set('Authorization', auth);
    expect(res7).toHaveStatus(200);

    const res8 = await request(app)
      .put(`/fhir/R4/AccessPolicy/${accessPolicy.id}`)
      .set('Authorization', auth)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ ...accessPolicy, resource: [{ resourceType: '*' }] } satisfies AccessPolicy);
    expect(res8).toHaveStatus(403);

    const res9 = await request(app)
      .post(`/fhir/R4/AccessPolicy`)
      .set('Authorization', auth)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'AccessPolicy',
        name: 'Escalate',
        resource: [{ resourceType: '*' }],
      } satisfies AccessPolicy);
    expect(res9).toHaveStatus(403);

    // Can read Bots, but not save them
    const res10 = await request(app).get(`/fhir/R4/Bot/${bot.id}`).set('Authorization', auth);
    expect(res10).toHaveStatus(200);

    const res11 = await request(app)
      .put(`/fhir/R4/Bot/${bot.id}`)
      .set('Authorization', auth)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ ...res10.body, name: 'Renamed Bot' } satisfies Bot);
    expect(res11).toHaveStatus(403);
  });
});
