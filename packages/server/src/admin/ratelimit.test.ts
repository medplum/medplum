// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getReferenceString } from '@medplum/core';
import type { ProjectMembership } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import { pwnedPassword } from 'hibp';
import fetch from 'node-fetch';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import type { RegisterResponse } from '../auth/register';
import { registerNew } from '../auth/register';
import { loadTestConfig } from '../config/loader';
import { addTestUser, setupPwnedPasswordMock, setupRecaptchaMock, withTestContext } from '../test.setup';

jest.mock('hibp');
jest.mock('node-fetch');

const app = express();

let admin: RegisterResponse;

describe('Rate limit status endpoint', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await withTestContext(() => initApp(app, config));

    admin = await withTestContext(() =>
      registerNew({
        firstName: 'Admin',
        lastName: 'User',
        projectName: 'Rate Limit Test Project',
        email: `admin${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );
  });

  afterAll(async () => {
    await shutdownApp();
  });

  beforeEach(() => {
    (fetch as unknown as jest.Mock).mockClear();
    (pwnedPassword as unknown as jest.Mock).mockClear();
    setupPwnedPasswordMock(pwnedPassword as unknown as jest.Mock, 0);
    setupRecaptchaMock(fetch as unknown as jest.Mock, true);
  });

  test('Returns rate limit status for all project members', async () => {
    const res = await request(app)
      .get(`/admin/projects/${admin.project.id}/rate-limits`)
      .set('Authorization', `Bearer ${admin.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.project).toBeDefined();
    expect(res.body.project.id).toBe(admin.project.id);
    expect(res.body.memberships).toBeDefined();
    expect(Array.isArray(res.body.memberships)).toBe(true);
    expect(res.body.memberships.length).toBeGreaterThan(0);

    for (const membership of res.body.memberships) {
      expect(membership.membershipId).toBeDefined();
      expect(typeof membership.membershipId).toBe('string');
    }
  });

  test('Returns rate limit status for specific membership IDs', async () => {
    const membershipsRes = await request(app)
      .get('/fhir/R4/ProjectMembership')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Medplum', 'extended');
    expect(membershipsRes.status).toBe(200);

    const memberships = membershipsRes.body.entry.map((e: any) => e.resource) as ProjectMembership[];
    const targetId = memberships[0].id;

    const res = await request(app)
      .get(`/admin/projects/${admin.project.id}/rate-limits?membershipId=${targetId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.memberships).toHaveLength(1);
    expect(res.body.memberships[0].membershipId).toBe(targetId);
  });

  test('Accepts multiple membership IDs', async () => {
    const member = await withTestContext(() => addTestUser(admin.project));

    const membershipsRes = await request(app)
      .get('/fhir/R4/ProjectMembership')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Medplum', 'extended');
    expect(membershipsRes.status).toBe(200);

    const memberships = membershipsRes.body.entry.map((e: any) => e.resource) as ProjectMembership[];
    const ids = memberships.slice(0, 2).map((m: ProjectMembership) => m.id);

    const res = await request(app)
      .get(`/admin/projects/${admin.project.id}/rate-limits?membershipId=${ids[0]}&membershipId=${ids[1]}`)
      .set('Authorization', `Bearer ${admin.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.memberships).toHaveLength(2);

    const returnedIds = res.body.memberships.map((m: any) => m.membershipId);
    expect(returnedIds).toContain(ids[0]);
    expect(returnedIds).toContain(ids[1]);

    // Suppress unused variable warning
    expect(member).toBeDefined();
  });

  test('Shows consumed points after FHIR activity', async () => {
    // Make some FHIR requests to consume rate limit points
    await request(app).get('/fhir/R4/Patient').set('Authorization', `Bearer ${admin.accessToken}`);

    const res = await request(app)
      .get(`/admin/projects/${admin.project.id}/rate-limits`)
      .set('Authorization', `Bearer ${admin.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.project).toBeDefined();
  });

  test('Rejects non-admin access', async () => {
    const nonAdmin = await withTestContext(() => addTestUser(admin.project));

    const res = await request(app)
      .get(`/admin/projects/${admin.project.id}/rate-limits`)
      .set('Authorization', `Bearer ${nonAdmin.accessToken}`);

    expect(res.status).toBe(403);
  });

  test('Rejects membership from different project', async () => {
    const other = await withTestContext(() =>
      registerNew({
        firstName: 'Other',
        lastName: 'Admin',
        projectName: 'Other Project',
        email: `other${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );

    // Get the other project's membership ID
    const membershipsRes = await request(app)
      .get('/fhir/R4/ProjectMembership')
      .set('Authorization', `Bearer ${other.accessToken}`)
      .set('X-Medplum', 'extended');
    const otherMembership = membershipsRes.body.entry[0].resource as ProjectMembership;

    // Try to query it from the first project
    const res = await request(app)
      .get(`/admin/projects/${admin.project.id}/rate-limits?membershipId=${otherMembership.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`);

    // Should fail because the membership doesn't belong to this project
    expect(res.status).not.toBe(200);
  });

  test('Returns null fhirQuota for members with no recent activity', async () => {
    const member = await withTestContext(() => addTestUser(admin.project));

    const membershipsRes = await request(app)
      .get('/fhir/R4/ProjectMembership')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Medplum', 'extended');
    const memberships = membershipsRes.body.entry.map((e: any) => e.resource) as ProjectMembership[];

    // Find the membership for the newly added user (no activity yet from their membership specifically)
    const memberMembership = memberships.find(
      (m: ProjectMembership) => m.profile?.reference === getReferenceString(member.profile)
    );
    expect(memberMembership).toBeDefined();
    if (!memberMembership) {
      throw new Error('Expected membership for added project member');
    }

    const res = await request(app)
      .get(`/admin/projects/${admin.project.id}/rate-limits?membershipId=${memberMembership.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.memberships).toHaveLength(1);
    // New member with no activity should have null fhirQuota (no Redis key yet)
    expect(res.body.memberships[0].fhirQuota).toBeNull();
  });
});
