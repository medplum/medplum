// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { ContentType, createReference, isUUID } from '@medplum/core';
import type { AccessPolicy, Practitioner, Project, Reference } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { vi } from 'vitest';
import { initApp, shutdownApp } from '../../app';
import { createUser } from '../../auth/newuser';
import { loadTestConfig } from '../../config/loader';
import type { MedplumServerConfig } from '../../config/types';
import { initTestAuth, setupRecaptchaMock, withTestContext } from '../../test.setup';
import { getGlobalSystemRepo } from '../repo';
import { PRACTITIONER_READONLY_RESOURCE_TYPES } from './projectinit';

const fetchMock = vi.spyOn(globalThis, 'fetch');
const app = express();

describe('Project $init', () => {
  let config: MedplumServerConfig;

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
    const superAdminAccessToken = await initTestAuth({ superAdmin: true });

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

    // Verify default patient access policy was created and set on the project
    const updatedProject = await withTestContext(() =>
      getGlobalSystemRepo().readResource<Project>('Project', project.id)
    );
    expect(updatedProject.defaultPatientAccessPolicy).toBeDefined();
    expect(updatedProject.defaultPatientAccessPolicy?.reference).toMatch(/^AccessPolicy\//);

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
    // Read access to everything via a readonly wildcard
    expect(practitionerPolicy.resource).toContainEqual({ resourceType: '*', readonly: true });
    // Writable clinical resource types are granted explicitly
    expect(practitionerPolicy.resource).toContainEqual({ resourceType: 'Patient' });
    expect(practitionerPolicy.resource).toContainEqual({ resourceType: 'Observation' });
    // Read-only resource types are NOT writable (only the readonly wildcard covers them)
    for (const readonlyType of PRACTITIONER_READONLY_RESOURCE_TYPES) {
      expect(practitionerPolicy.resource).not.toContainEqual({ resourceType: readonlyType });
    }
  });

  test('Requires project name', async () => {
    const superAdminAccessToken = await initTestAuth({ superAdmin: true });

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
    const superAdminClientToken = await initTestAuth({ superAdmin: true });
    expect(superAdminClientToken).toBeDefined();

    const doc = await withTestContext(() =>
      getGlobalSystemRepo().createResource<Practitioner>({ resourceType: 'Practitioner' })
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
});
