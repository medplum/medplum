import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp } from '../app';
import { loadTestConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { initKeys } from '../oauth';
import { seedDatabase } from '../seed';

jest.mock('@aws-sdk/client-sesv2');

const app = express();

describe('Reset Password', () => {

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initDatabase(config.database);
    await seedDatabase();
    await initApp(app);
    await initKeys(config);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  beforeEach(() => {
    (SESv2Client as any).mockClear();
    (SendEmailCommand as any).mockClear();
  });

  test('User not found', async () => {
    const res = await request(app)
      .post('/auth/resetpassword')
      .type('json')
      .send({
        email: `alex${randomUUID()}@example.com`
      });
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toBe('User not found');
    expect(res.body.issue[0].expression[0]).toBe('email');
  });

  test('Success', async () => {
    const email = `george${randomUUID()}@example.com`;

    const res = await request(app)
      .post('/auth/register')
      .type('json')
      .send({
        firstName: 'George',
        lastName: 'Washington',
        projectName: 'Washington Project',
        email,
        password: 'password!@#'
      })
    expect(res.status).toBe(200);
    expect(res.body.profile).toBeDefined();

    const res2 = await request(app)
      .post('/auth/resetpassword')
      .type('json')
      .send({
        email
      });
    expect(res2.status).toBe(200);
    expect(SESv2Client).toHaveBeenCalledTimes(1);
    expect(SendEmailCommand).toHaveBeenCalledTimes(1);

    const args = (SendEmailCommand as any).mock.calls[0][0];
    expect(args).toMatchObject({
      Destination: {
        ToAddresses: [email]
      },
      Content: {
        Simple: {
          Subject: {
            Data: 'Medplum Password Reset'
          }
        }
      }
    });
  });

});
