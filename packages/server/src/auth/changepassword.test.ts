// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { badRequest, Logger } from '@medplum/core';
import type { User } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import { pwnedPassword } from 'hibp';
import request from 'supertest';
import type { Mock } from 'vitest';
import { vi } from 'vitest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { getGlobalSystemRepo, Repository } from '../fhir/repo';
import { initTestAuth, setupPwnedPasswordMock, setupRecaptchaMock, withTestContext } from '../test.setup';
import { registerNew } from './register';
import { resetPassword } from './resetpassword';
import { setPassword } from './setpassword';

const fetchMock = vi.spyOn(globalThis, 'fetch');
const app = express();

describe('Change Password', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  beforeEach(() => {
    fetchMock.mockClear();
    (pwnedPassword as unknown as Mock).mockClear();
    setupPwnedPasswordMock(pwnedPassword as unknown as Mock, 0);
    setupRecaptchaMock(true);
  });

  test('Success', async () => {
    const { accessToken } = await withTestContext(() =>
      registerNew({
        firstName: 'John',
        lastName: 'Adams',
        projectName: 'Adams Project',
        email: `john${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );

    const res2 = await request(app)
      .post('/auth/changepassword')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        oldPassword: 'password!@#',
        newPassword: 'password!@#123',
      });

    expect(res2).toHaveStatus(200);
  });

  test('Missing old password', async () => {
    const { accessToken } = await withTestContext(() =>
      registerNew({
        firstName: 'Thomas',
        lastName: 'Jefferson',
        projectName: 'Jefferson Project',
        email: `thomas${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );

    const res2 = await request(app)
      .post('/auth/changepassword')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        oldPassword: '',
        newPassword: 'password!@#123',
      });

    expect(res2).toHaveStatus(400);
  });

  test('ClientApplication cannot change password', async () => {
    // This creates a ClientApplication user
    const accessToken = await initTestAuth();

    const res2 = await request(app)
      .post('/auth/changepassword')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        oldPassword: 'foobarbang',
        newPassword: 'password!@#123',
      });

    expect(res2).toHaveStatus(403);
  });

  test('Incorrect old password', async () => {
    const { accessToken } = await withTestContext(() =>
      registerNew({
        firstName: 'Thomas',
        lastName: 'Jefferson',
        projectName: 'Jefferson Project',
        email: `thomas${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );

    const res2 = await request(app)
      .post('/auth/changepassword')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        oldPassword: 'foobarbang',
        newPassword: 'password!@#123',
      });

    expect(res2).toHaveStatus(400);
    expect(res2.body).toMatchObject(badRequest('Incorrect password', 'oldPassword'));
  });

  test('Breached password', async () => {
    const { accessToken } = await withTestContext(() =>
      registerNew({
        firstName: 'Thomas',
        lastName: 'Jefferson',
        projectName: 'Jefferson Project',
        email: `thomas${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );

    // Mock the pwnedPassword function to return "1", meaning the password is breached.
    setupPwnedPasswordMock(pwnedPassword as unknown as Mock, 1);

    const res2 = await request(app)
      .post('/auth/changepassword')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        oldPassword: 'password!@#',
        newPassword: 'breached',
      });

    expect(res2).toHaveStatus(400);
    expect(res2.body).toMatchObject(badRequest('Password found in breach database'));
  });

  describe('Password replaced after the old password was verified', () => {
    async function register(): Promise<{ email: string; user: WithId<User>; accessToken: string }> {
      const email = `james${randomUUID()}@example.com`;
      const { user, accessToken } = await withTestContext(() =>
        registerNew({
          firstName: 'James',
          lastName: 'Monroe',
          projectName: 'Monroe Project',
          email,
          password: 'password!@#',
        })
      );
      return { email, user, accessToken };
    }

    function changePassword(accessToken: string, newPassword: string): request.Test {
      return request(app)
        .post('/auth/changepassword')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({ oldPassword: 'password!@#', newPassword });
    }

    async function loginStatus(email: string, password: string): Promise<number> {
      const res = await request(app).post('/auth/login').send({ email, password, scope: 'openid' });
      return res.status;
    }

    test('Reset link redeemed during the change is kept', async () => {
      const { email, user, accessToken } = await register();
      const url = await withTestContext(() => resetPassword(getGlobalSystemRepo(), user, 'reset'));
      const [id, secret] = url.split('/').slice(-2);

      // The breach check runs after the old password is verified and before the new one is written
      let resetStatus: number | undefined;
      (pwnedPassword as unknown as Mock).mockImplementationOnce(async () => {
        const res = await request(app).post('/auth/setpassword').send({ id, secret, password: 'password!@#reset' });
        resetStatus = res.status;
        return 0;
      });
      const warnSpy = vi.spyOn(Logger.prototype, 'warn');

      const res = await changePassword(accessToken, 'password!@#123');
      expect(resetStatus).toBe(200);
      expect(res).toHaveStatus(400);
      expect(res.body).toMatchObject(badRequest('Incorrect password', 'oldPassword'));
      expect(warnSpy).toHaveBeenCalledWith('Password change rejected because the password changed during the request', {
        userId: user.id,
      });
      warnSpy.mockRestore();

      expect(await loginStatus(email, 'password!@#123')).toBe(400);
      expect(await loginStatus(email, 'password!@#reset')).toBe(200);
    });

    test('Password set by an admin during the change is kept', async () => {
      const { email, user, accessToken } = await register();

      (pwnedPassword as unknown as Mock).mockImplementationOnce(async () => {
        await setPassword(getGlobalSystemRepo(), user, 'password!@#admin');
        return 0;
      });

      const res = await changePassword(accessToken, 'password!@#123');
      expect(res).toHaveStatus(400);
      expect(res.body).toMatchObject(badRequest('Incorrect password', 'oldPassword'));

      expect(await loginStatus(email, 'password!@#123')).toBe(400);
      expect(await loginStatus(email, 'password!@#admin')).toBe(200);
    });

    test('Password set between the check and the write in the transaction is kept', async () => {
      const { email, user, accessToken } = await register();

      // Commit the admin change right after the change request's in-transaction read of the User
      let armed = false;
      (pwnedPassword as unknown as Mock).mockImplementationOnce(async () => {
        armed = true;
        return 0;
      });
      const readResource = Repository.prototype.readResource;
      const readSpy = vi.spyOn(Repository.prototype, 'readResource').mockImplementation(async function (
        this: Repository,
        ...args
      ) {
        const result = await readResource.apply(this, args);
        if (armed && args[0] === 'User' && args[1] === user.id) {
          armed = false;
          await setPassword(getGlobalSystemRepo(), user, 'password!@#admin');
        }
        return result;
      });
      try {
        const res = await changePassword(accessToken, 'password!@#123');
        expect(res).toHaveStatus(400);
        expect(res.body).toMatchObject(badRequest('Incorrect password', 'oldPassword'));
      } finally {
        readSpy.mockRestore();
      }

      expect(await loginStatus(email, 'password!@#123')).toBe(400);
      expect(await loginStatus(email, 'password!@#admin')).toBe(200);
    });

    test('Overlapping change requests keep the password applied first', async () => {
      const { email, accessToken } = await register();

      let firstStatus: number | undefined;
      (pwnedPassword as unknown as Mock).mockImplementationOnce(async () => {
        firstStatus = (await changePassword(accessToken, 'password!@#first')).status;
        return 0;
      });

      const res = await changePassword(accessToken, 'password!@#second');
      expect(firstStatus).toBe(200);
      expect(res).toHaveStatus(400);
      expect(res.body).toMatchObject(badRequest('Incorrect password', 'oldPassword'));

      expect(await loginStatus(email, 'password!@#first')).toBe(200);
      expect(await loginStatus(email, 'password!@#second')).toBe(400);
    });
  });
});
