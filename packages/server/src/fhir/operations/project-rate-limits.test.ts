// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getReferenceString } from '@medplum/core';
import type { Parameters, ProjectMembership } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import { pwnedPassword } from 'hibp';
import fetch from 'node-fetch';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import type { RegisterResponse } from '../../auth/register';
import { registerNew } from '../../auth/register';
import { loadTestConfig } from '../../config/loader';
import { addTestUser, setupPwnedPasswordMock, setupRecaptchaMock, withTestContext } from '../../test.setup';

jest.mock('hibp');
jest.mock('node-fetch');

const app = express();

let admin: RegisterResponse;

function getParametersByName(params: Parameters, name: string): NonNullable<Parameters['parameter']> {
  return params.parameter?.filter((p) => p.name === name) ?? [];
}

function getPartValue(
  parts: NonNullable<Parameters['parameter']>[number] | undefined,
  name: string
): string | number | undefined {
  const part = parts?.part?.find((p) => p.name === name);
  return part?.valueString ?? part?.valueInteger;
}

describe('Project $rate-limits operation', () => {
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

  test('Returns only active consumers when no membershipId specified', async () => {
    // Generate FHIR activity so the admin membership is tracked as active
    await request(app).get('/fhir/R4/Patient').set('Authorization', `Bearer ${admin.accessToken}`);

    const res = await request(app)
      .get(`/fhir/R4/Project/${admin.project.id}/$rate-limits`)
      .set('Authorization', `Bearer ${admin.accessToken}`);

    expect(res.status).toBe(200);
    const body = res.body as Parameters;
    expect(body.resourceType).toBe('Parameters');

    const projectParams = getParametersByName(body, 'project');
    expect(projectParams).toHaveLength(1);
    expect(getPartValue(projectParams[0], 'id')).toBe(admin.project.id);

    const membershipParams = getParametersByName(body, 'membership');
    expect(membershipParams.length).toBeGreaterThan(0);

    expect(membershipParams.map((p) => getPartValue(p, 'membershipId')).every((id) => id !== undefined)).toBe(true);

    const profiles = membershipParams.map((p) => p.part?.find((part) => part.name === 'profile')?.valueReference);
    expect(profiles.every((profile) => profile?.reference && profile?.display)).toBe(true);
  });

  test('Returns only the caller when no other active consumers', async () => {
    // Create a fresh project — the only FHIR activity will be the $rate-limits call itself
    const fresh = await withTestContext(() =>
      registerNew({
        firstName: 'Fresh',
        lastName: 'Admin',
        projectName: 'No Activity Project',
        email: `fresh${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );

    const res = await request(app)
      .get(`/fhir/R4/Project/${fresh.project.id}/$rate-limits`)
      .set('Authorization', `Bearer ${fresh.accessToken}`);

    expect(res.status).toBe(200);
    const body = res.body as Parameters;
    const membershipParams = getParametersByName(body, 'membership');
    // The $rate-limits call itself consumes quota (recordSearch), so the caller appears as an active consumer
    expect(membershipParams).toHaveLength(1);
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
      .get(`/fhir/R4/Project/${admin.project.id}/$rate-limits?membershipId=${targetId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`);

    expect(res.status).toBe(200);
    const body = res.body as Parameters;
    const membershipParams = getParametersByName(body, 'membership');
    expect(membershipParams).toHaveLength(1);
    expect(getPartValue(membershipParams[0], 'membershipId')).toBe(targetId);
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
      .get(`/fhir/R4/Project/${admin.project.id}/$rate-limits?membershipId=${ids[0]}&membershipId=${ids[1]}`)
      .set('Authorization', `Bearer ${admin.accessToken}`);

    expect(res.status).toBe(200);
    const body = res.body as Parameters;
    const membershipParams = getParametersByName(body, 'membership');
    expect(membershipParams).toHaveLength(2);

    const returnedIds = membershipParams.map((p) => getPartValue(p, 'membershipId'));
    expect(returnedIds).toContain(ids[0]);
    expect(returnedIds).toContain(ids[1]);

    expect(member).toBeDefined();
  });

  test('Shows consumed points after FHIR activity', async () => {
    await request(app).get('/fhir/R4/Patient').set('Authorization', `Bearer ${admin.accessToken}`);

    const res = await request(app)
      .get(`/fhir/R4/Project/${admin.project.id}/$rate-limits`)
      .set('Authorization', `Bearer ${admin.accessToken}`);

    expect(res.status).toBe(200);
    const body = res.body as Parameters;
    expect(getParametersByName(body, 'project')).toHaveLength(1);
  });

  test('Rejects non-admin access', async () => {
    const nonAdmin = await withTestContext(() => addTestUser(admin.project));

    const res = await request(app)
      .get(`/fhir/R4/Project/${admin.project.id}/$rate-limits`)
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

    const membershipsRes = await request(app)
      .get('/fhir/R4/ProjectMembership')
      .set('Authorization', `Bearer ${other.accessToken}`)
      .set('X-Medplum', 'extended');
    const otherMembership = membershipsRes.body.entry[0].resource as ProjectMembership;

    const res = await request(app)
      .get(`/fhir/R4/Project/${admin.project.id}/$rate-limits?membershipId=${otherMembership.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`);

    expect(res.status).not.toBe(200);
  });

  test('Returns no quota parts for members with no recent activity', async () => {
    const member = await withTestContext(() => addTestUser(admin.project));

    const membershipsRes = await request(app)
      .get('/fhir/R4/ProjectMembership')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Medplum', 'extended');
    const memberships = membershipsRes.body.entry.map((e: any) => e.resource) as ProjectMembership[];

    const memberMembership = memberships.find(
      (m: ProjectMembership) => m.profile?.reference === getReferenceString(member.profile)
    );
    expect(memberMembership).toBeDefined();
    if (!memberMembership) {
      throw new Error('Expected membership for added project member');
    }

    const res = await request(app)
      .get(`/fhir/R4/Project/${admin.project.id}/$rate-limits?membershipId=${memberMembership.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`);

    expect(res.status).toBe(200);
    const body = res.body as Parameters;
    const membershipParams = getParametersByName(body, 'membership');
    expect(membershipParams).toHaveLength(1);
    expect(getPartValue(membershipParams[0], 'membershipId')).toBe(memberMembership.id);
    // No consumedPoints part for members with no activity
    expect(getPartValue(membershipParams[0], 'consumedPoints')).toBeUndefined();
  });
});
