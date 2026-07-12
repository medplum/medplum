// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ProfileResource, WithId } from '@medplum/core';
import { encodeBase64Url, getReferenceString } from '@medplum/core';
import type { Practitioner, Project, ProjectMembership } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import request from 'supertest';
import { vi } from 'vitest';
import { inviteUser } from '../admin/invite';
import { initApp, shutdownApp } from '../app';
import { getConfig, loadTestConfig } from '../config/loader';
import type { MedplumExternalAuthConfig } from '../config/types';
import type { SystemRepository } from '../fhir/repo';
import { getProjectSystemRepo } from '../fhir/repo';
import { createTestProject } from '../test.setup';
import { mockFetchJson } from '../test.setup.fetch';

// RFC 7662 - External auth

const fetchMock = vi.spyOn(globalThis, 'fetch');
describe('External auth', () => {
  const app = express();
  const npi = randomUUID();
  const externalSub = randomUUID();
  const email = `external-${randomUUID()}@example.com`;
  let testProject: WithId<Project>;
  let practitioner: WithId<ProfileResource>;
  let systemRepo: SystemRepository;

  beforeAll(async () => {
    const config = await loadTestConfig();
    config.externalAuthProviders = [
      {
        issuer: 'https://external-auth.example.com',
        userInfoUrl: 'https://external-auth.example.com/oauth2/userinfo',
      },
    ];

    // Initialize the app with the test config
    await initApp(app, config);

    // Create a test project
    const { project } = await createTestProject();
    testProject = project;

    // Invite a normal Practitioner user to the project
    const inviteResult = await inviteUser({
      project,
      resourceType: 'Practitioner',
      firstName: 'Test',
      lastName: 'Person',
    });
    systemRepo = await getProjectSystemRepo(project);

    // Add NPI identifier to the practitioner
    practitioner = await systemRepo.updateResource<ProfileResource>({
      ...inviteResult.profile,
      identifier: [{ system: 'npi', value: npi }],
    });

    // Invite a Practitioner with externalId for sub claim tests
    await inviteUser({
      project,
      resourceType: 'Practitioner',
      firstName: 'External',
      lastName: 'User',
      externalId: externalSub,
    });

    await inviteUser({
      project,
      resourceType: 'Practitioner',
      firstName: 'Email',
      lastName: 'User',
      email,
      sendEmail: false,
    });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Not a JWT', async () => {
    const res = await request(app).get(`/oauth2/userinfo`).set('Authorization', 'Bearer opaque_string');
    expect(res.status).toBe(401);
  });

  test('Missing issuer', async () => {
    const jwt = createFakeJwt({ foo: 'bar' });
    const res = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + jwt);
    expect(res.status).toBe(401);
  });

  test('Unknown issuer', async () => {
    const jwt = createFakeJwt({ iss: 'https://unknown-issuer.example.com' });
    const res = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + jwt);
    expect(res.status).toBe(401);
  });

  test('Missing fhirUser and sub', async () => {
    const jwt = createFakeJwt({ iss: 'https://external-auth.example.com' });
    const res = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + jwt);
    expect(res.status).toBe(401);
  });

  test('Remote call to userinfo fails', async () => {
    fetchMock.mockImplementationOnce(() => mockFetchJson({ ok: false }, { status: 401 }));

    const jwt = createFakeJwt({
      iss: 'https://external-auth.example.com',
      fhirUser: getReferenceString(practitioner),
    });
    const res = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + jwt);
    expect(res.status).toBe(401);
  });

  test('Profile not found', async () => {
    fetchMock.mockImplementationOnce(() => mockFetchJson({ ok: true }));

    const jwt = createFakeJwt({
      iss: 'https://external-auth.example.com',
      fhirUser: 'Patient/123',
    });
    const res = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + jwt);
    expect(res.status).toBe(401);
  });

  test('Profile without membership', async () => {
    fetchMock.mockImplementationOnce(() => mockFetchJson({ ok: true }));

    // Create a Practitioner profile that is not a member of the project
    const p2 = await systemRepo.createResource<Practitioner>({ resourceType: 'Practitioner' });
    const jwt = createFakeJwt({
      iss: 'https://external-auth.example.com',
      fhirUser: getReferenceString(p2),
    });
    const res = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + jwt);
    expect(res.status).toBe(401);
  });

  test('Success by reference', async () => {
    fetchMock.mockImplementationOnce(() => mockFetchJson({ ok: true }));

    const jwt = createFakeJwt({
      iss: 'https://external-auth.example.com',
      fhirUser: getReferenceString(practitioner),
      scope: 'openid profile',
      nonce: randomUUID(),
    });
    const res = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + jwt);
    expect(res.status).toBe(200);

    // Call it again to ensure caching works
    const res2 = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + jwt);
    expect(res2.status).toBe(200);
  });

  test('Success by search string', async () => {
    fetchMock.mockImplementationOnce(() => mockFetchJson({ ok: true }));

    const jwt = createFakeJwt({
      iss: 'https://external-auth.example.com',
      fhirUser: `Practitioner?identifier=${npi}`,
    });
    const res = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + jwt);
    expect(res.status).toBe(200);
  });

  test('Success by absolute URL', async () => {
    fetchMock.mockImplementationOnce(() => mockFetchJson({ ok: true }));

    const jwt = createFakeJwt({
      iss: 'https://external-auth.example.com',
      fhirUser: `https://external.idp/fhir/Practitioner?identifier=${npi}`,
    });
    const res = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + jwt);
    expect(res.status).toBe(200);
  });

  test('Success by ext.fhirUser', async () => {
    fetchMock.mockImplementationOnce(() => mockFetchJson({ ok: true }));

    const jwt = createFakeJwt({
      iss: 'https://external-auth.example.com',
      ext: { fhirUser: getReferenceString(practitioner) },
    });
    const res = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + jwt);
    expect(res.status).toBe(200);
  });

  test('Success by sub claim', async () => {
    fetchMock.mockImplementationOnce(() => mockFetchJson({ ok: true }));

    const jwt = createFakeJwt({
      iss: 'https://external-auth.example.com',
      sub: externalSub,
      scope: 'openid profile',
      nonce: randomUUID(),
    });
    const res = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + jwt);
    expect(res.status).toBe(200);
  });

  test('Success by JWKS verification', async () => {
    const keyPair = await generateKeyPair('ES256');
    const publicJwk = await exportJWK(keyPair.publicKey);
    const jwksUrl = 'https://external-auth.example.com/.well-known/jwks.json';

    await withExternalAuthProviders(
      [
        {
          issuer: 'https://external-auth.example.com',
          identityProvider: {
            issuer: 'https://external-auth.example.com',
            audience: ['external-api'],
            jwksUrl,
            tokenVerificationMethod: 'jwks',
          },
        },
      ],
      async () => {
        fetchMock.mockImplementationOnce(() => mockFetchJson({ keys: [publicJwk] }));

        const jwt = await new SignJWT({
          nonce: randomUUID(),
        })
          .setProtectedHeader({ alg: 'ES256' })
          .setIssuer('https://external-auth.example.com')
          .setSubject(externalSub)
          .setAudience('external-api')
          .setIssuedAt()
          .setExpirationTime('2h')
          .sign(keyPair.privateKey);

        const res = await request(app)
          .get(`/oauth2/userinfo`)
          .set('Authorization', 'Bearer ' + jwt);
        expect(res.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledWith(jwksUrl, expect.anything());
      }
    );
  });

  test.each([
    {
      name: 'string audience match succeeds',
      expectedAudience: ['external-api'],
      actualAudience: 'external-api',
      status: 200,
    },
    {
      name: 'array audience match succeeds',
      expectedAudience: ['external-api', 'alternate-api'],
      actualAudience: ['wrong-api', 'alternate-api'],
      status: 200,
    },
    {
      name: 'audience mismatch is rejected',
      expectedAudience: ['external-api'],
      actualAudience: 'wrong-api',
      status: 401,
    },
    {
      name: 'missing audience is rejected when expected audience is configured',
      expectedAudience: ['external-api'],
      actualAudience: undefined,
      status: 401,
    },
  ])('$name', async ({ expectedAudience, actualAudience, status }) => {
    await withExternalAuthProviders(
      [
        {
          issuer: 'https://external-auth.example.com',
          identityProvider: {
            audience: expectedAudience,
            userInfoUrl: 'https://external-auth.example.com/oauth2/userinfo',
          },
        },
      ],
      async () => {
        if (status === 200) {
          fetchMock.mockImplementationOnce(() => mockFetchJson({ ok: true }));
        }

        const jwt = createFakeJwt({
          iss: 'https://external-auth.example.com',
          aud: actualAudience,
          sub: externalSub,
          nonce: randomUUID(),
        });
        const res = await request(app)
          .get(`/oauth2/userinfo`)
          .set('Authorization', 'Bearer ' + jwt);
        expect(res.status).toBe(status);
      }
    );
  });

  test.each([
    {
      name: 'email to user membership',
      identitySource: 'email' as const,
      identityMappingMode: 'user-email' as const,
      userInfo: () => ({ email, email_verified: true }),
    },
    {
      name: 'subject to membership externalId',
      identitySource: 'subject' as const,
      identityMappingMode: 'project-membership-external-id' as const,
      userInfo: () => ({ sub: externalSub }),
    },
    {
      name: 'fhirUser to profile membership',
      identitySource: 'fhir-user' as const,
      identityMappingMode: 'project-membership-profile' as const,
      userInfo: () => ({ fhirUser: getReferenceString(practitioner) }),
    },
  ])('Identity provider config maps $name', async ({ identitySource, identityMappingMode, userInfo }) => {
    await withExternalAuthProviders(
      [
        {
          issuer: 'https://external-auth.example.com',
          identityProvider: {
            authorizeUrl: 'https://external-auth.example.com/oauth2/authorize',
            tokenUrl: 'https://external-auth.example.com/oauth2/token',
            userInfoUrl: 'https://external-auth.example.com/oauth2/userinfo',
            clientId: 'external-client',
            clientSecret: 'external-secret',
            identitySource,
            identityMappingMode,
          },
        },
      ],
      async () => {
        fetchMock.mockImplementationOnce(() => mockFetchJson(userInfo()));

        const jwt = createFakeJwt({
          iss: 'https://external-auth.example.com',
          nonce: randomUUID(),
        });
        const res = await request(app)
          .get(`/oauth2/userinfo`)
          .set('Authorization', 'Bearer ' + jwt);
        expect(res.status).toBe(200);
      }
    );
  });

  test('Identity provider legacy useSubject maps verified subject', async () => {
    await withExternalAuthProviders(
      [
        {
          issuer: 'https://external-auth.example.com',
          identityProvider: {
            userInfoUrl: 'https://external-auth.example.com/oauth2/userinfo',
            useSubject: true,
          },
        },
      ],
      async () => {
        fetchMock.mockImplementationOnce(() => mockFetchJson({ sub: externalSub }));

        const jwt = createFakeJwt({
          iss: 'https://external-auth.example.com',
          nonce: randomUUID(),
        });
        const res = await request(app)
          .get(`/oauth2/userinfo`)
          .set('Authorization', 'Bearer ' + jwt);
        expect(res.status).toBe(200);
      }
    );
  });

  test.each([
    {
      name: 'unverified email',
      userInfo: { email, email_verified: false },
    },
    {
      name: 'missing email_verified',
      userInfo: { email },
    },
  ])('Identity provider email mapping rejects $name', async ({ userInfo }) => {
    await withExternalAuthProviders(
      [
        {
          issuer: 'https://external-auth.example.com',
          identityProvider: {
            userInfoUrl: 'https://external-auth.example.com/oauth2/userinfo',
            identitySource: 'email',
            identityMappingMode: 'user-email',
          },
        },
      ],
      async () => {
        fetchMock.mockImplementationOnce(() => mockFetchJson(userInfo));

        const jwt = createFakeJwt({
          iss: 'https://external-auth.example.com',
          nonce: randomUUID(),
        });
        const res = await request(app)
          .get(`/oauth2/userinfo`)
          .set('Authorization', 'Bearer ' + jwt);
        expect(res.status).toBe(401);
      }
    );
  });

  test('Identity provider without bearer mapping uses JWT claims', async () => {
    await withExternalAuthProviders(
      [
        {
          issuer: 'https://external-auth.example.com',
          identityProvider: {
            authorizeUrl: 'https://external-auth.example.com/oauth2/authorize',
            tokenUrl: 'https://external-auth.example.com/oauth2/token',
            userInfoUrl: 'https://external-auth.example.com/oauth2/userinfo',
            clientId: 'external-client',
            clientSecret: 'external-secret',
          },
        },
      ],
      async () => {
        fetchMock.mockImplementationOnce(() => mockFetchJson({ email: `wrong-${email}` }));

        const jwt = createFakeJwt({
          iss: 'https://external-auth.example.com',
          fhirUser: getReferenceString(practitioner),
          nonce: randomUUID(),
        });
        const res = await request(app)
          .get(`/oauth2/userinfo`)
          .set('Authorization', 'Bearer ' + jwt);
        expect(res.status).toBe(200);
      }
    );
  });

  test('Sub claim with caching', async () => {
    fetchMock.mockImplementationOnce(() => mockFetchJson({ ok: true }));

    const jwt = createFakeJwt({
      iss: 'https://external-auth.example.com',
      sub: externalSub,
    });
    const res = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + jwt);
    expect(res.status).toBe(200);

    // Call again - should use cache (no second fetch mock needed)
    const res2 = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + jwt);
    expect(res2.status).toBe(200);
  });

  test('Expired token is rejected before cache lookup', async () => {
    fetchMock.mockClear();

    const jwt = createFakeJwt({
      iss: 'https://external-auth.example.com',
      sub: externalSub,
      exp: Math.floor(Date.now() / 1000) - 1,
    });
    const res = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + jwt);
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('Sub claim with unknown externalId', async () => {
    fetchMock.mockImplementationOnce(() => mockFetchJson({ ok: true }));

    const jwt = createFakeJwt({
      iss: 'https://external-auth.example.com',
      sub: 'nonexistent-' + randomUUID(),
    });
    const res = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + jwt);
    expect(res.status).toBe(401);
  });

  test('Sub claim with remote userinfo failure', async () => {
    fetchMock.mockImplementationOnce(() => mockFetchJson({ ok: false }, { status: 401 }));

    // Use a unique nonce to avoid cache hits from prior tests
    const jwt = createFakeJwt({
      iss: 'https://external-auth.example.com',
      sub: externalSub,
      nonce: randomUUID(),
    });
    const res = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + jwt);
    expect(res.status).toBe(401);
  });

  test('fhirUser takes precedence over sub', async () => {
    fetchMock.mockImplementationOnce(() => mockFetchJson({ ok: true }));

    // JWT has both fhirUser and sub; fhirUser should be used
    // Use a unique nonce to avoid cache hits from prior tests
    const jwt = createFakeJwt({
      iss: 'https://external-auth.example.com',
      fhirUser: getReferenceString(practitioner),
      sub: externalSub,
      nonce: randomUUID(),
    });
    const res = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + jwt);
    expect(res.status).toBe(200);
  });

  test('Sub claim with inactive membership', async () => {
    const inactiveSub = randomUUID();
    const { membership: inactiveMembership } = await inviteUser({
      project: testProject,
      resourceType: 'Practitioner',
      firstName: 'Inactive',
      lastName: 'User',
      externalId: inactiveSub,
    });
    await systemRepo.updateResource<ProjectMembership>({
      ...inactiveMembership,
      active: false,
    });

    fetchMock.mockImplementationOnce(() => mockFetchJson({ ok: true }));

    const jwt = createFakeJwt({
      iss: 'https://external-auth.example.com',
      sub: inactiveSub,
    });
    const res = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + jwt);
    expect(res.status).toBe(401);
  });

  test('Sub claim with duplicate externalId returns 401', async () => {
    const duplicateSub = randomUUID();

    // Create two memberships with the same externalId in different projects
    const { project: project2 } = await createTestProject();
    await inviteUser({
      project: testProject,
      resourceType: 'Practitioner',
      firstName: 'Dup',
      lastName: 'One',
      externalId: duplicateSub,
    });
    await inviteUser({
      project: project2,
      resourceType: 'Practitioner',
      firstName: 'Dup',
      lastName: 'Two',
      externalId: duplicateSub,
    });

    fetchMock.mockImplementationOnce(() => mockFetchJson({ ok: true }));

    const jwt = createFakeJwt({
      iss: 'https://external-auth.example.com',
      sub: duplicateSub,
    });
    const res = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + jwt);
    expect(res.status).toBe(401);
  });
});

function createFakeJwt(claims: Record<string, unknown>): string {
  return `header.${encodeBase64Url(JSON.stringify(claims))}.signature`;
}

async function withExternalAuthProviders(
  externalAuthProviders: MedplumExternalAuthConfig[],
  fn: () => Promise<void>
): Promise<void> {
  const savedExternalAuthProviders = getConfig().externalAuthProviders;
  getConfig().externalAuthProviders = externalAuthProviders;

  try {
    await fn();
  } finally {
    getConfig().externalAuthProviders = savedExternalAuthProviders;
  }
}
