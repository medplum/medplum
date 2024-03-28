import { createReference, resolveId } from '@medplum/core';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config';
import { addTestUser, createTestProject, withTestContext } from '../test.setup';
import { Repository, getSystemRepo } from '../fhir/repo';
import { User, UserSecurityRequest } from '@medplum/fhirtypes';
import { generateSecret } from '../oauth/keys';

const app = express();

export async function createUserSecurityRequest(
  repo: Repository,
  user: User,
  type: UserSecurityRequest['type']
): Promise<UserSecurityRequest> {
  return repo.createResource<UserSecurityRequest>({
    resourceType: 'UserSecurityRequest',
    meta: {
      project: resolveId(user.project),
    },
    type,
    user: createReference(user),
    secret: generateSecret(16),
  });
}

describe('Verify email', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  let user: User;

  beforeEach(async () => {
    const { project } = await createTestProject({
      membership: { admin: true },
    });

    const addUserResult = await addTestUser(project);
    user = addUserResult.user;

    expect(user.emailVerified).not.toEqual(true);
  });

  test('Success', async () =>
    withTestContext(async () => {
      const systemRepo = getSystemRepo();
      const usr = await createUserSecurityRequest(systemRepo, user, 'verify-email');

      // Attempt verification with incorrect secret
      const res1 = await request(app)
        .post('/auth/verifyemail')
        .type('json')
        .send({
          id: usr.id,
          secret: usr.secret.slice(0, -1),
        });
      expect(res1.status).toBe(400);

      // Successfully verify email
      const res2 = await request(app).post('/auth/verifyemail').type('json').send({
        id: usr.id,
        secret: usr.secret,
      });
      expect(res2.status).toBe(200);

      // Check that the security request was marked as used
      const afterVerifyResult = await systemRepo.readResource<UserSecurityRequest>(
        'UserSecurityRequest',
        usr.id as string
      );
      expect(afterVerifyResult.used).toBe(true);

      // Check that the user was updated
      const userAfter = await systemRepo.readResource<User>('User', user.id as string);
      expect(userAfter.emailVerified).toBe(true);

      // Should not be able to verify again with the same UserSecurityRequest
      const res3 = await request(app).post('/auth/verifyemail').type('json').send({
        id: usr.id,
        secret: usr.secret,
      });
      expect(res3.status).toBe(400);
    }));

  test('Incorrect UserSecurityRequest.type', async () => {
    const systemRepo = getSystemRepo();
    const invite = await createUserSecurityRequest(systemRepo, user, 'invite');
    const res1 = await request(app).post('/auth/verifyemail').type('json').send({
      id: invite.id,
      secret: invite.secret,
    });
    expect(res1.status).toBe(400);

    const reset = await createUserSecurityRequest(systemRepo, user, 'reset');
    const res2 = await request(app).post('/auth/verifyemail').type('json').send({
      id: reset.id,
      secret: reset.secret,
    });
    expect(res2.status).toBe(400);
  });
});
