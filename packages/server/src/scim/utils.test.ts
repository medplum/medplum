// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { createReference, OperationOutcomeError } from '@medplum/core';
import type { AccessPolicy, Project, User } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { initAppServices, shutdownApp } from '../app';
import { registerNew } from '../auth/register';
import { loadTestConfig } from '../config/loader';
import type { SystemRepository } from '../fhir/repo';
import { getProjectSystemRepo } from '../fhir/repo';
import { convertScimToJsonPatch, createScimUser } from './utils';

describe('convertScimToJsonPatch', () => {
  test('Okta example', () => {
    // See https://developer.okta.com/docs/api/openapi/okta-scim/guides/scim-20/#update-a-specific-user-patch
    expect(
      convertScimToJsonPatch({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
        Operations: [
          {
            op: 'replace',
            value: {
              active: false,
            },
          },
        ],
      })
    ).toEqual([
      {
        op: 'replace',
        path: '/active',
        value: false,
      },
    ]);
  });

  test('Valid operation passthrough', () => {
    expect(
      convertScimToJsonPatch({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
        Operations: [
          {
            op: 'add',
            path: 'active',
            value: true,
          },
        ],
      })
    ).toMatchObject([
      {
        op: 'add',
        path: '/active',
        value: true,
      },
    ]);
  });

  test('Invalid schema', () => {
    expect(() =>
      convertScimToJsonPatch({
        schemas: ['invalid'],
        Operations: [
          {
            op: 'add',
            path: 'active',
            value: true,
          },
        ],
      })
    ).toThrow('Invalid SCIM patch: missing required schema');
  });

  test('Invalid path prefix', () => {
    expect(() =>
      convertScimToJsonPatch({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
        Operations: [
          {
            op: 'add',
            path: '/active',
            value: true,
          },
        ],
      })
    ).toThrow('Invalid SCIM patch: path must not start with "/"');
  });

  test('Invalid operation', () => {
    expect(() =>
      convertScimToJsonPatch({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
        Operations: [
          {
            op: 'invalid',
            path: 'x',
            value: 'x',
          },
        ],
      })
    ).toThrow('Invalid SCIM patch: unsupported operation');
  });

  test('Remove op requires path', () => {
    expect(() =>
      convertScimToJsonPatch({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
        Operations: [
          {
            op: 'remove',
          },
        ],
      })
    ).toThrow('Invalid SCIM patch: missing required path');
  });

  test('Add op without path must be object', () => {
    expect(() =>
      convertScimToJsonPatch({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
        Operations: [
          {
            op: 'add',
            value: 'x',
          },
        ],
      })
    ).toThrow('Invalid SCIM patch: value must be an object if path is missing');
  });
});

describe('createScimUser', () => {
  let user: WithId<User>;
  let project: WithId<Project>;
  let systemRepo: SystemRepository;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);
    const registration = await registerNew({
      firstName: 'Alice',
      lastName: 'Smith',
      projectName: 'Alice Project',
      email: `alice${randomUUID()}@example.com`,
      password: 'password!@#',
    });
    user = registration.user;
    project = registration.project;
    systemRepo = getProjectSystemRepo(project);
  });
  afterAll(shutdownApp);

  test('Creates a Practitioner', async () => {
    const result = await createScimUser(createReference(user), project, {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
      name: {
        givenName: 'SCIM',
        familyName: 'User',
      },
      emails: [{ value: randomUUID() + '@example.com' }],
    });
    expect(result).toHaveProperty('userType', 'Practitioner');
  });

  test('Creating a Patient fails without a defaultPatientAccessPolicy', async () => {
    await expect(
      createScimUser(createReference(user), project, {
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        userType: 'Patient',
        name: {
          givenName: 'SCIM',
          familyName: 'User',
        },
        emails: [{ value: randomUUID() + '@example.com' }],
      })
    ).rejects.toThrow(OperationOutcomeError);
  });

  test('Creating a Patient applies the defaultPatientAccessPolicy', async () => {
    // Create default access policy
    const accessPolicy = await systemRepo.createResource<AccessPolicy>({
      resourceType: 'AccessPolicy',
      resource: [{ resourceType: 'Patient' }],
    });
    const projectWithPolicy = { ...project, defaultPatientAccessPolicy: createReference(accessPolicy) };

    await expect(
      createScimUser(createReference(user), projectWithPolicy, {
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        userType: 'Patient',
        name: {
          givenName: 'SCIM',
          familyName: 'User',
        },
        emails: [{ value: randomUUID() + '@example.com' }],
      })
    ).resolves.toHaveProperty('userType', 'Patient');
  });
});
