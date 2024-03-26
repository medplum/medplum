import { Operator, SearchRequest } from '@medplum/core';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config';
import { addTestUser, createTestProject, withTestContext } from '../test.setup';
import { getSystemRepo } from '../fhir/repo';
import { PasswordChangeRequest, User } from '@medplum/fhirtypes';
import { createVerifyEmailRequest } from './verifyemail';

const app = express();

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
      const searchRequest: SearchRequest<PasswordChangeRequest> = {
        resourceType: 'PasswordChangeRequest',
        filters: [{ code: 'user', operator: Operator.EQUALS, value: `User/${user.id}` }],
        fields: ['id', 'type'],
      };

      const beforeResult = await systemRepo.searchResources(searchRequest);
      expect(beforeResult.length).toBe(1);
      expect(beforeResult[0].type).toBe('invite');

      // TODO - this is the hand-wavy part right now; how should this PasswordChangeRequest actually be
      // created? Does there need to be a new endpoint for making a PCR(type = 'verify-email')? Or should
      // one be created as part of the /auth/newpatient?
      const verifyUrl = await createVerifyEmailRequest(user, 'http://example.com/verify-email-redirect');
      expect(verifyUrl).toBeDefined();

      const afterCreateResult = await systemRepo.searchResources(searchRequest);
      const verifyEmailPCRs = afterCreateResult.filter((pcr) => pcr.type === 'verify-email');
      expect(verifyEmailPCRs.length).toBe(1);
      const pcr = verifyEmailPCRs[0] as PasswordChangeRequest;

      // http://localhost:3000/verify-email/6dc1d389-2066-480b-bcc4-dbf0115eba32/fd82acd3384220f163f6356dbe40a26a
      // console.log('Verify URL:', verifyUrl);
      const paths = verifyUrl.split('/');
      const id = paths[paths.length - 2];
      const secret = paths[paths.length - 1];
      expect(pcr.id).toEqual(id);
      expect(pcr.secret).toEqual(secret);

      const res = await request(app).post('/auth/verifyemail').type('json').send({
        id,
        secret,
      });
      expect(res.status).toBe(200);

      const afterVerifyResult = await systemRepo.readResource<PasswordChangeRequest>('PasswordChangeRequest', id);
      expect(afterVerifyResult.used).toBe(true);

      const userAfter = await systemRepo.readResource<User>('User', user.id);
      expect(userAfter.emailVerified).toBe(true);
    }));
});
