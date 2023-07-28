import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { ContentType } from '@medplum/core';
import express from 'express';
import { simpleParser } from 'mailparser';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config';
import { initTestAuth } from '../test.setup';

jest.mock('@aws-sdk/client-sesv2');

const app = express();
let accessToken: string;

describe('Email API Routes', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    accessToken = await initTestAuth();
  });

  beforeEach(() => {
    (SESv2Client as unknown as jest.Mock).mockClear();
    (SendEmailCommand as unknown as jest.Mock).mockClear();
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Unauthenticated', async () => {
    const res = await request(app).post(`/email/v1/send`).set('Content-Type', ContentType.JSON).send({
      to: 'alice@example.com',
      subject: 'Subject',
      text: 'Body',
    });
    expect(res.status).toBe(401);
    expect(SESv2Client).toHaveBeenCalledTimes(0);
    expect(SendEmailCommand).toHaveBeenCalledTimes(0);
  });

  test('Wrong content type', async () => {
    const res = await request(app)
      .post(`/email/v1/send`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.TEXT)
      .send('hello');
    expect(res.status).toBe(400);
  });

  test('Send email', async () => {
    const res = await request(app)
      .post(`/email/v1/send`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({
        to: 'alice@example.com',
        subject: 'Subject',
        text: 'Body',
      });
    expect(res.status).toBe(200);

    expect(SESv2Client).toHaveBeenCalledTimes(1);
    expect(SendEmailCommand).toHaveBeenCalledTimes(1);

    const args = (SendEmailCommand as unknown as jest.Mock).mock.calls[0][0];
    expect(args.Destination.ToAddresses[0]).toBe('alice@example.com');

    const parsed = await simpleParser(args.Content.Raw.Data);
    expect(parsed.subject).toBe('Subject');
    expect(parsed.text).toBe('Body\n');
  });
});
