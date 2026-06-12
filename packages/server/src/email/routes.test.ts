// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { ContentType } from '@medplum/core';
import type { AwsClientStub } from 'aws-sdk-client-mock';
import { mockClient } from 'aws-sdk-client-mock';
import express from 'express';
import { simpleParser } from 'mailparser';
import request from 'supertest';
import { vi } from 'vitest';

const { mockCreateTransport, mockSendMail } = vi.hoisted(() => {
  const mockSendMail = vi.fn().mockResolvedValue({ messageId: '123' });
  const mockCreateTransport = vi.fn(() => ({ sendMail: mockSendMail }));
  return { mockCreateTransport, mockSendMail };
});

vi.mock('nodemailer', () => ({
  createTransport: mockCreateTransport,
  default: { createTransport: mockCreateTransport },
}));
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { initTestAuth } from '../test.setup';

const app = express();

describe('Email API Routes', () => {
  let mockSESv2Client: AwsClientStub<SESv2Client>;

  beforeAll(async () => {
    const config = await loadTestConfig();
    config.emailProvider = 'awsses';
    await initApp(app, config);
  });

  beforeEach(() => {
    mockSESv2Client = mockClient(SESv2Client);
    mockSESv2Client.on(SendEmailCommand).resolves({ MessageId: 'ID_TEST_123' });
  });

  afterEach(() => {
    mockSESv2Client.restore();
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
    expect(mockSESv2Client.send.callCount).toBe(0);
  });

  test('Forbidden for non project admin', async () => {
    const accessToken = await initTestAuth({ membership: { admin: false } });
    const res = await request(app)
      .post(`/email/v1/send`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({
        to: 'alice@example.com',
        subject: 'Subject',
        text: 'Body',
      });
    expect(res.status).toBe(403);
  });

  test('Wrong content type', async () => {
    const accessToken = await initTestAuth({ membership: { admin: true } });
    const res = await request(app)
      .post(`/email/v1/send`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.TEXT)
      .send('hello');
    expect(res.status).toBe(400);
  });

  test('Send email as project admin', async () => {
    const accessToken = await initTestAuth({ membership: { admin: true } });
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

    expect(mockSESv2Client.send.callCount).toBe(1);
    expect(mockSESv2Client.commandCalls(SendEmailCommand)).toHaveLength(1);

    const args = mockSESv2Client.commandCalls(SendEmailCommand)[0].args[0].input;
    expect(args.Destination?.ToAddresses?.[0]).toBe('alice@example.com');

    const parsed = await simpleParser(args.Content?.Raw?.Data as Buffer);
    expect(parsed.subject).toBe('Subject');
    expect(parsed.text).toBe('Body\n');
  });

  test('Send email via project SMTP', async () => {
    mockCreateTransport.mockClear();
    mockSendMail.mockClear();

    const accessToken = await initTestAuth({
        membership: { admin: true },
        project: {
          secret: [
            { name: 'smtpHost', valueString: 'smtp.project.example.com' },
            { name: 'smtpPort', valueInteger: 587 },
            { name: 'smtpUsername', valueString: 'projectuser' },
            { name: 'smtpPassword', valueString: 'projectpass' },
            { name: 'smtpFromAddress', valueString: 'support@project.example.com' },
          ],
        },
      });
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

    expect(mockCreateTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'smtp.project.example.com', port: 587, secure: false })
    );
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockSendMail.mock.calls[0][0].from).toBe('support@project.example.com');
    expect(mockSESv2Client.send.callCount).toBe(0);
    expect(mockSESv2Client.commandCalls(SendEmailCommand)).toHaveLength(0);
  });

  test('Handle SES error', async () => {
    mockSESv2Client.on(SendEmailCommand).rejects(new Error('BadRequestException: Illegal address'));

    const accessToken = await initTestAuth({ membership: { admin: true } });
    const res = await request(app)
      .post(`/email/v1/send`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({
        to: 'alice@example.com',
        subject: 'Subject',
        text: 'Body',
      });
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toBe('Error sending email: BadRequestException: Illegal address');
  });
});
