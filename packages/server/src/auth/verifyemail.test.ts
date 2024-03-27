import { Operator, SearchRequest, createReference, resolveId } from '@medplum/core';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config';
import { addTestUser, createTestProject, withTestContext } from '../test.setup';
import { Repository, getSystemRepo } from '../fhir/repo';
import { User, UserSecurityRequest } from '@medplum/fhirtypes';
import { generateSecret } from '../oauth/keys';

const app = express();

export async function createVerifyEmailRequest(
  repo: Repository,
  user: User,
  redirectUri?: string
): Promise<UserSecurityRequest> {
  return repo.createResource<UserSecurityRequest>({
    resourceType: 'UserSecurityRequest',
    meta: {
      project: resolveId(user.project),
    },
    type: 'verify-email',
    user: createReference(user),
    secret: generateSecret(16),
    redirectUri,
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

  test('Success', async () =>
    withTestContext(async () => {
      const { project } = await createTestProject({
        membership: { admin: true },
      });

      const { user } = await addTestUser(project);
      if (user.id === undefined) {
        fail('User ID is undefined');
      }

      expect(user.emailVerified).not.toEqual(true);

      const systemRepo = getSystemRepo();
      const searchRequest: SearchRequest<UserSecurityRequest> = {
        resourceType: 'UserSecurityRequest',
        filters: [{ code: 'user', operator: Operator.EQUALS, value: `User/${user.id}` }],
        fields: ['id', 'type'],
      };

      const beforeResult = await systemRepo.searchResources(searchRequest);
      expect(beforeResult.filter((pcr) => pcr.type === 'verify-email').length).toBe(0);

      const usr = await createVerifyEmailRequest(systemRepo, user, 'http://example.com/verify-email-redirect');

      const afterCreateResult = await systemRepo.searchResources(searchRequest);
      expect(afterCreateResult.filter((pcr) => pcr.type === 'verify-email').length).toBe(1);

      const res = await request(app).post('/auth/verifyemail').type('json').send({
        id: usr.id,
        secret: usr.secret,
      });
      expect(res.status).toBe(200);

      const afterVerifyResult = await systemRepo.readResource<UserSecurityRequest>(
        'UserSecurityRequest',
        usr.id as string
      );
      expect(afterVerifyResult.used).toBe(true);

      const userAfter = await systemRepo.readResource<User>('User', user.id);
      expect(userAfter.emailVerified).toBe(true);
    }));
});
