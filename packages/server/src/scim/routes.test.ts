// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType, createReference } from '@medplum/core';
import type { AccessPolicy, ProjectMembership } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { registerNew } from '../auth/register';
import { loadTestConfig } from '../config/loader';
import type { SystemRepository } from '../fhir/repo';
import { getProjectSystemRepo } from '../fhir/repo';
import { addTestUser, withTestContext } from '../test.setup';

describe('SCIM Routes', () => {
  const app = express();
  let accessToken: string;
  let systemRepo: SystemRepository;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);

    // First, Alice creates a project
    const registration = await registerNew({
      firstName: 'Alice',
      lastName: 'Smith',
      projectName: 'Alice Project',
      email: `alice${randomUUID()}@example.com`,
      password: 'password!@#',
    });
    accessToken = registration.accessToken;
    systemRepo = await getProjectSystemRepo(registration.project);

    // Create default access policy
    const accessPolicy = await systemRepo.createResource<AccessPolicy>({
      resourceType: 'AccessPolicy',
      resource: [{ resourceType: 'Patient' }],
    });

    // Update project with default access policy
    await systemRepo.updateResource({
      ...registration.project,
      defaultPatientAccessPolicy: createReference(accessPolicy),
    });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Search users', async () => {
    const res = await request(app)
      .get(`/scim/v2/Users`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);

    const result = res.body;
    expect(result.totalResults).toBeDefined();
    expect(result.Resources).toBeDefined();
  });

  test('Create and update user', async () => {
    const res1 = await request(app)
      .post(`/scim/v2/Users`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.SCIM_JSON)
      .send({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        userType: 'Patient',
        name: {
          givenName: 'SCIM',
          familyName: 'User',
        },
        emails: [{ value: randomUUID() + '@example.com' }],
      });
    expect(res1.status).toBe(201);

    const readResponse = await request(app)
      .get(`/scim/v2/Users/${res1.body.id}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(readResponse.status).toBe(200);
    expect(readResponse.body.id).toBe(res1.body.id);

    const searchResponse = await request(app)
      .get(`/scim/v2/Users`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(searchResponse.status).toBe(200);

    const searchCheck = searchResponse.body.Resources.find((user: any) => user.id === res1.body.id);
    expect(searchCheck).toBeDefined();

    const updateResponse = await request(app)
      .put(`/scim/v2/Users/${res1.body.id}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.SCIM_JSON)
      .send({
        ...res1.body,
        externalId: randomUUID(),
      });
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.externalId).toBeDefined();

    const deleteResponse = await request(app)
      .delete(`/scim/v2/Users/${res1.body.id}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(deleteResponse.status).toBe(204);

    const searchResponse2 = await request(app)
      .get(`/scim/v2/Users`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(searchResponse2.status).toBe(200);

    const searchCheck2 = searchResponse2.body.Resources.find((user: any) => user.id === res1.body.id);
    expect(searchCheck2).toBeUndefined();
  });

  test('Create and patch user', async () => {
    const res1 = await request(app)
      .post(`/scim/v2/Users`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.SCIM_JSON)
      .send({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        userType: 'Patient',
        name: {
          givenName: 'SCIM',
          familyName: 'User',
        },
        emails: [{ value: randomUUID() + '@example.com' }],
      });
    expect(res1.status).toBe(201);

    const readResponse = await request(app)
      .get(`/scim/v2/Users/${res1.body.id}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(readResponse.status).toBe(200);
    expect(readResponse.body.id).toBe(res1.body.id);
    expect(readResponse.body.active).toBe(true);

    const searchResponse = await request(app)
      .get(`/scim/v2/Users`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(searchResponse.status).toBe(200);

    const searchCheck = searchResponse.body.Resources.find((user: any) => user.id === res1.body.id);
    expect(searchCheck).toBeDefined();

    const patchResponse = await request(app)
      .patch(`/scim/v2/Users/${res1.body.id}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.SCIM_JSON)
      .send({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
        Operations: [
          {
            op: 'replace',
            value: {
              active: false,
            },
          },
        ],
      });
    expect(patchResponse.status).toBe(200);
    expect(patchResponse.body.active).toBe(false);
  });

  test('Create, missing medplum user type, creates a Practitioner', async () => {
    const res = await request(app)
      .post(`/scim/v2/Users`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.SCIM_JSON)
      .send({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        name: {
          givenName: 'SCIM',
          familyName: 'User',
        },
        emails: [{ value: randomUUID() + '@example.com' }],
      });
    expect(res.status).toBe(201);
    expect(res.body.userType).toBe('Practitioner');
  });

  // ---------------------------------------------------------------------------
  // Group tests
  // ---------------------------------------------------------------------------

  test('Search groups (empty)', async () => {
    const res = await request(app)
      .get('/scim/v2/Groups')
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
    expect(res.body.schemas).toContain('urn:ietf:params:scim:api:messages:2.0:ListResponse');
    expect(Array.isArray(res.body.Resources)).toBe(true);
  });

  test('Create group (no members)', async () => {
    const res = await request(app)
      .post('/scim/v2/Groups')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.SCIM_JSON)
      .send({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
        displayName: 'Test Group',
        externalId: randomUUID(),
      });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.displayName).toBe('Test Group');
    expect(res.body.members).toEqual([]);
  });

  test('Create group, read group, search groups', async () => {
    const externalId = randomUUID();
    const createRes = await request(app)
      .post('/scim/v2/Groups')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.SCIM_JSON)
      .send({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
        displayName: 'Read Group',
        externalId,
      });
    expect(createRes.status).toBe(201);
    const groupId = createRes.body.id;

    // Read by ID
    const readRes = await request(app)
      .get(`/scim/v2/Groups/${groupId}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(readRes.status).toBe(200);
    expect(readRes.body.id).toBe(groupId);
    expect(readRes.body.externalId).toBe(externalId);
    expect(readRes.body.displayName).toBe('Read Group');

    // Search
    const searchRes = await request(app)
      .get('/scim/v2/Groups')
      .set('Authorization', 'Bearer ' + accessToken);
    expect(searchRes.status).toBe(200);
    const found = searchRes.body.Resources.find((g: any) => g.id === groupId);
    expect(found).toBeDefined();
  });

  test('Create group with members + matching AccessPolicy assigns access', async () => {
    const systemRepo = getSystemRepo();

    // Create a user to be a group member
    const userRes = await request(app)
      .post('/scim/v2/Users')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.SCIM_JSON)
      .send({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        userType: 'Practitioner',
        name: { givenName: 'Group', familyName: 'Member' },
        emails: [{ value: randomUUID() + '@example.com' }],
      });
    expect(userRes.status).toBe(201);
    const membershipId = userRes.body.id;

    // Create an AccessPolicy with identifier matching the externalId
    const externalId = randomUUID();
    const policy = await systemRepo.createResource<AccessPolicy>({
      resourceType: 'AccessPolicy',
      name: 'Group Policy',
      identifier: [{ system: 'https://medplum.com/scim/group', value: externalId }],
      resource: [{ resourceType: 'Practitioner' }],
    });

    // Create group with the member
    const groupRes = await request(app)
      .post('/scim/v2/Groups')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.SCIM_JSON)
      .send({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
        displayName: 'Policy Group',
        externalId,
        members: [{ value: membershipId }],
      });
    expect(groupRes.status).toBe(201);
    expect(groupRes.body.members).toHaveLength(1);
    expect(groupRes.body.members[0].value).toBe(membershipId);

    // Verify that the membership now has the policy in access[]
    const membership = await systemRepo.readResource<ProjectMembership>('ProjectMembership', membershipId);
    const hasPolicy = membership.access?.some((a) => a.policy?.reference === `AccessPolicy/${policy.id}`);
    expect(hasPolicy).toBe(true);
  });

  test('Create group with no matching AccessPolicy succeeds without error', async () => {
    const externalId = randomUUID(); // No policy with this externalId

    const userRes = await request(app)
      .post('/scim/v2/Users')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.SCIM_JSON)
      .send({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        userType: 'Practitioner',
        name: { givenName: 'No', familyName: 'Policy' },
        emails: [{ value: randomUUID() + '@example.com' }],
      });
    expect(userRes.status).toBe(201);

    const groupRes = await request(app)
      .post('/scim/v2/Groups')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.SCIM_JSON)
      .send({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
        displayName: 'No Policy Group',
        externalId,
        members: [{ value: userRes.body.id }],
      });
    expect(groupRes.status).toBe(201);
    expect(groupRes.body.members).toHaveLength(1);
  });

  test('PATCH add member to group', async () => {
    const systemRepo = getSystemRepo();

    // Create group
    const externalId = randomUUID();
    const policy = await systemRepo.createResource<AccessPolicy>({
      resourceType: 'AccessPolicy',
      name: 'Patch Policy',
      identifier: [{ system: 'https://medplum.com/scim/group', value: externalId }],
      resource: [{ resourceType: 'Practitioner' }],
    });

    const groupRes = await request(app)
      .post('/scim/v2/Groups')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.SCIM_JSON)
      .send({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
        displayName: 'Patch Group',
        externalId,
      });
    expect(groupRes.status).toBe(201);
    const groupId = groupRes.body.id;

    // Create a user to add
    const userRes = await request(app)
      .post('/scim/v2/Users')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.SCIM_JSON)
      .send({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        userType: 'Practitioner',
        name: { givenName: 'Patch', familyName: 'Add' },
        emails: [{ value: randomUUID() + '@example.com' }],
      });
    expect(userRes.status).toBe(201);
    const membershipId = userRes.body.id;

    // PATCH add member
    const patchRes = await request(app)
      .patch(`/scim/v2/Groups/${groupId}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.SCIM_JSON)
      .send({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
        Operations: [{ op: 'add', path: 'members', value: [{ value: membershipId }] }],
      });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.members).toHaveLength(1);
    expect(patchRes.body.members[0].value).toBe(membershipId);

    // Verify access assigned
    const membership = await systemRepo.readResource<ProjectMembership>('ProjectMembership', membershipId);
    const hasPolicy = membership.access?.some((a) => a.policy?.reference === `AccessPolicy/${policy.id}`);
    expect(hasPolicy).toBe(true);
  });

  test('PATCH remove member from group (filter syntax)', async () => {
    const systemRepo = getSystemRepo();

    // Create group with a member
    const externalId = randomUUID();
    const policy = await systemRepo.createResource<AccessPolicy>({
      resourceType: 'AccessPolicy',
      name: 'Remove Policy',
      identifier: [{ system: 'https://medplum.com/scim/group', value: externalId }],
      resource: [{ resourceType: 'Practitioner' }],
    });

    const userRes = await request(app)
      .post('/scim/v2/Users')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.SCIM_JSON)
      .send({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        userType: 'Practitioner',
        name: { givenName: 'Remove', familyName: 'Member' },
        emails: [{ value: randomUUID() + '@example.com' }],
      });
    expect(userRes.status).toBe(201);
    const membershipId = userRes.body.id;

    const groupRes = await request(app)
      .post('/scim/v2/Groups')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.SCIM_JSON)
      .send({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
        displayName: 'Remove Group',
        externalId,
        members: [{ value: membershipId }],
      });
    expect(groupRes.status).toBe(201);
    const groupId = groupRes.body.id;

    // Verify access was assigned
    const membershipBefore = await systemRepo.readResource<ProjectMembership>('ProjectMembership', membershipId);
    expect(membershipBefore.access?.some((a) => a.policy?.reference === `AccessPolicy/${policy.id}`)).toBe(true);

    // PATCH remove member
    const patchRes = await request(app)
      .patch(`/scim/v2/Groups/${groupId}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.SCIM_JSON)
      .send({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
        Operations: [{ op: 'remove', path: `members[value eq "${membershipId}"]` }],
      });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.members).toHaveLength(0);

    // Verify access was removed
    const membershipAfter = await systemRepo.readResource<ProjectMembership>('ProjectMembership', membershipId);
    expect(membershipAfter.access?.some((a) => a.policy?.reference === `AccessPolicy/${policy.id}`)).toBeFalsy();
  });

  test('PATCH replace members', async () => {
    // Create two users
    const user1Res = await request(app)
      .post('/scim/v2/Users')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.SCIM_JSON)
      .send({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        userType: 'Practitioner',
        name: { givenName: 'Replace', familyName: 'One' },
        emails: [{ value: randomUUID() + '@example.com' }],
      });
    const user2Res = await request(app)
      .post('/scim/v2/Users')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.SCIM_JSON)
      .send({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        userType: 'Practitioner',
        name: { givenName: 'Replace', familyName: 'Two' },
        emails: [{ value: randomUUID() + '@example.com' }],
      });
    const membershipId1 = user1Res.body.id;
    const membershipId2 = user2Res.body.id;

    // Create group with user1
    const externalId = randomUUID();
    const groupRes = await request(app)
      .post('/scim/v2/Groups')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.SCIM_JSON)
      .send({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
        displayName: 'Replace Group',
        externalId,
        members: [{ value: membershipId1 }],
      });
    const groupId = groupRes.body.id;

    // PATCH replace members with user2
    const patchRes = await request(app)
      .patch(`/scim/v2/Groups/${groupId}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.SCIM_JSON)
      .send({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
        Operations: [{ op: 'replace', path: 'members', value: [{ value: membershipId2 }] }],
      });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.members).toHaveLength(1);
    expect(patchRes.body.members[0].value).toBe(membershipId2);
  });

  test('PATCH update displayName', async () => {
    const groupRes = await request(app)
      .post('/scim/v2/Groups')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.SCIM_JSON)
      .send({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
        displayName: 'Original Name',
        externalId: randomUUID(),
      });
    expect(groupRes.status).toBe(201);
    const groupId = groupRes.body.id;

    const patchRes = await request(app)
      .patch(`/scim/v2/Groups/${groupId}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.SCIM_JSON)
      .send({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
        Operations: [{ op: 'replace', path: 'displayName', value: 'Updated Name' }],
      });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.displayName).toBe('Updated Name');
  });

  test('PUT replace group (full update)', async () => {
    const systemRepo = getSystemRepo();

    // Create two users
    const user1Res = await request(app)
      .post('/scim/v2/Users')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.SCIM_JSON)
      .send({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        userType: 'Practitioner',
        name: { givenName: 'Put', familyName: 'One' },
        emails: [{ value: randomUUID() + '@example.com' }],
      });
    const user2Res = await request(app)
      .post('/scim/v2/Users')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.SCIM_JSON)
      .send({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        userType: 'Practitioner',
        name: { givenName: 'Put', familyName: 'Two' },
        emails: [{ value: randomUUID() + '@example.com' }],
      });
    const membershipId1 = user1Res.body.id;
    const membershipId2 = user2Res.body.id;

    const externalId = randomUUID();
    const policy = await systemRepo.createResource<AccessPolicy>({
      resourceType: 'AccessPolicy',
      name: 'Put Policy',
      identifier: [{ system: 'https://medplum.com/scim/group', value: externalId }],
      resource: [{ resourceType: 'Practitioner' }],
    });

    // Create with user1
    const createRes = await request(app)
      .post('/scim/v2/Groups')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.SCIM_JSON)
      .send({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
        displayName: 'Put Group',
        externalId,
        members: [{ value: membershipId1 }],
      });
    expect(createRes.status).toBe(201);
    const groupId = createRes.body.id;

    // PUT with user2 instead
    const putRes = await request(app)
      .put(`/scim/v2/Groups/${groupId}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.SCIM_JSON)
      .send({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
        id: groupId,
        displayName: 'Put Group Updated',
        externalId,
        members: [{ value: membershipId2 }],
      });
    expect(putRes.status).toBe(200);
    expect(putRes.body.displayName).toBe('Put Group Updated');
    expect(putRes.body.members).toHaveLength(1);
    expect(putRes.body.members[0].value).toBe(membershipId2);

    // user1 should have policy removed, user2 should have policy added
    const m1After = await systemRepo.readResource<ProjectMembership>('ProjectMembership', membershipId1);
    expect(m1After.access?.some((a) => a.policy?.reference === `AccessPolicy/${policy.id}`)).toBeFalsy();

    const m2After = await systemRepo.readResource<ProjectMembership>('ProjectMembership', membershipId2);
    expect(m2After.access?.some((a) => a.policy?.reference === `AccessPolicy/${policy.id}`)).toBe(true);
  });

  test('Delete group removes access from all members', async () => {
    const systemRepo = getSystemRepo();

    const externalId = randomUUID();
    const policy = await systemRepo.createResource<AccessPolicy>({
      resourceType: 'AccessPolicy',
      name: 'Delete Policy',
      identifier: [{ system: 'https://medplum.com/scim/group', value: externalId }],
      resource: [{ resourceType: 'Practitioner' }],
    });

    const userRes = await request(app)
      .post('/scim/v2/Users')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.SCIM_JSON)
      .send({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        userType: 'Practitioner',
        name: { givenName: 'Delete', familyName: 'Member' },
        emails: [{ value: randomUUID() + '@example.com' }],
      });
    const membershipId = userRes.body.id;

    const groupRes = await request(app)
      .post('/scim/v2/Groups')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.SCIM_JSON)
      .send({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
        displayName: 'Delete Group',
        externalId,
        members: [{ value: membershipId }],
      });
    expect(groupRes.status).toBe(201);
    const groupId = groupRes.body.id;

    // Verify access assigned
    const mBefore = await systemRepo.readResource<ProjectMembership>('ProjectMembership', membershipId);
    expect(mBefore.access?.some((a) => a.policy?.reference === `AccessPolicy/${policy.id}`)).toBe(true);

    // DELETE the group
    const deleteRes = await request(app)
      .delete(`/scim/v2/Groups/${groupId}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(deleteRes.status).toBe(204);

    // Verify access removed
    const mAfter = await systemRepo.readResource<ProjectMembership>('ProjectMembership', membershipId);
    expect(mAfter.access?.some((a) => a.policy?.reference === `AccessPolicy/${policy.id}`)).toBeFalsy();

    // Verify group is gone
    const readRes = await request(app)
      .get(`/scim/v2/Groups/${groupId}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(readRes.status).toBe(404);
  });

  test('Search users as super admin', async () => {
    // Create new project
    const registration = await withTestContext(async () => {
      const reg = await registerNew({
        firstName: 'Alice',
        lastName: 'Smith',
        projectName: 'Alice Project',
        email: `alice${randomUUID()}@example.com`,
        password: 'password!@#',
      });

      // Make the project super admin
      const systemRepo = await getProjectSystemRepo(reg.project);
      await systemRepo.updateResource({
        ...reg.project,
        superAdmin: true,
      });
      return reg;
    });

    // Add another user
    // This user is a super admin
    // This user is not a project admin
    // They should still be allowed to use SCIM
    const { accessToken } = await addTestUser(registration.project);

    const res = await request(app)
      .get(`/scim/v2/Users`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);

    const result = res.body;
    expect(result.totalResults).toBeDefined();
    expect(result.Resources).toBeDefined();
  });
});
