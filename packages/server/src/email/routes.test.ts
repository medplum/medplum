// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { ContentType } from '@medplum/core';
import type { AwsClientStub } from 'aws-sdk-client-mock';
import { mockClient } from 'aws-sdk-client-mock';
import express from 'express';
import { simpleParser } from 'mailparser';
import dns from 'node:dns';
import request from 'supertest';
import { onTestFinished, vi } from 'vitest';
import { initApp, shutdownApp } from '../app';
import { getConfig, loadTestConfig } from '../config/loader';
import { initTestAuth } from '../test.setup';

const { mockCreateTransport, mockSendMail } = vi.hoisted(() => {
  const mockSendMail = vi.fn().mockResolvedValue({ messageId: '123' });
  const mockCreateTransport = vi.fn(() => ({ sendMail: mockSendMail }));
  return { mockCreateTransport, mockSendMail };
});

vi.mock('nodemailer', () => ({
  createTransport: mockCreateTransport,
  default: { createTransport: mockCreateTransport },
}));

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
    expect(res).toHaveStatus(401);
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
    expect(res).toHaveStatus(403);
    expect(res.body.issue[0].details.text).toBe('Only project administrators can send emails');
  });

  test('Email feature not enabled for project', async () => {
    const accessToken = await initTestAuth({
      project: { features: [] },
      membership: { admin: true },
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
    expect(res).toHaveStatus(400);
    expect(res.body.issue[0].details.text).toBe('Email feature is not enabled for this project');
  });

  test('Email not configured on server', async () => {
    // Save original config values
    const config = getConfig();
    const originalEmailProvider = config.emailProvider;
    const originalSmtp = config.smtp;

    // Clear email configuration
    config.emailProvider = '' as never;
    config.smtp = undefined;

    try {
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
      expect(res).toHaveStatus(400);
      expect(res.body.issue[0].details.text).toBe('Email is not configured on this server. Set up SMTP or AWS SES.');
    } finally {
      // Restore config
      config.emailProvider = originalEmailProvider;
      config.smtp = originalSmtp;
    }
  });

  test('Wrong content type', async () => {
    const accessToken = await initTestAuth({ membership: { admin: true } });
    const res = await request(app)
      .post(`/email/v1/send`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.TEXT)
      .send('hello');
    expect(res).toHaveStatus(400);
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
    expect(res).toHaveStatus(200);

    expect(mockSESv2Client.send.callCount).toBe(1);
    expect(mockSESv2Client.commandCalls(SendEmailCommand)).toHaveLength(1);

    const args = mockSESv2Client.commandCalls(SendEmailCommand)[0].args[0].input;
    expect(args.Destination?.ToAddresses?.[0]).toBe('alice@example.com');

    const parsed = await simpleParser(args.Content?.Raw?.Data as Buffer);
    expect(parsed.subject).toBe('Subject');
    expect(parsed.text).toBe('Body\n');
  });

  test('Send email with supported options', async () => {
    const accessToken = await initTestAuth({ membership: { admin: true } });
    const res = await request(app)
      .post(`/email/v1/send`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({
        to: 'alice@example.com',
        cc: 'bob@example.com',
        bcc: 'carol@example.com',
        replyTo: 'dave@example.com',
        subject: 'Subject',
        text: 'Body',
        html: '<p>Body</p><img src="cid:logo">',
        attachments: [
          { filename: 'hello.txt', content: 'aGVsbG8=', encoding: 'base64', contentType: 'text/plain' },
          { filename: 'logo.png', content: 'iVBORw0KGgo=', encoding: 'base64', cid: 'logo', contentType: 'image/png' },
        ],
        icalEvent: { method: 'REQUEST', content: 'BEGIN:VCALENDAR\r\nEND:VCALENDAR' },
      });
    expect(res).toHaveStatus(200);

    const args = mockSESv2Client.commandCalls(SendEmailCommand)[0].args[0].input;
    expect(args.Destination?.CcAddresses).toStrictEqual(['bob@example.com']);
    expect(args.Destination?.BccAddresses).toStrictEqual(['carol@example.com']);
    expect(args.ReplyToAddresses).toStrictEqual(['dave@example.com']);

    const parsed = await simpleParser(args.Content?.Raw?.Data as Buffer);
    expect(parsed.text?.trim()).toBe('Body');
    expect(parsed.html).toContain('<p>Body</p>');
    expect(parsed.attachments.find((a) => a.filename === 'hello.txt')?.content.toString()).toBe('hello');
    expect(parsed.attachments.find((a) => a.filename === 'logo.png')?.cid).toBe('logo');
    expect(parsed.attachments.find((a) => a.contentType === 'application/ics')).toBeDefined();
  });

  test.each([
    ['envelope', { text: 'Body', envelope: { from: 'other@example.com', to: ['bob@example.com'] } }],
    ['raw message', { raw: 'From: other@example.com\r\nTo: bob@example.com\r\nSubject: Hello\r\n\r\nBody\r\n' }],
    ['raw attachment', { attachments: [{ raw: 'From: other@example.com\r\n\r\nBody' }] }],
    ['raw alternative', { alternatives: [{ raw: 'From: other@example.com\r\n\r\nBody' }] }],
    ['custom headers', { text: 'Body', headers: { From: 'other@example.com', 'X-Test': 'test' } }],
    [
      'prepared header',
      { text: 'Body', headers: { 'X-Test': { prepared: true, value: 'x\r\nFrom: other@example.com' } } },
    ],
    ['header name', { text: 'Body', headers: { 'From: other@example.com (': 'x' } }],
    ['attachment headers', { attachments: [{ content: 'x', headers: { 'X-Test': 'test' } }] }],
  ])('Ignore unsupported option: %s', async (_, options) => {
    const accessToken = await initTestAuth({ membership: { admin: true } });
    const res = await request(app)
      .post(`/email/v1/send`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({ to: 'alice@example.com', subject: 'Subject', ...options });
    expect(res).toHaveStatus(200);

    expect(mockSESv2Client.commandCalls(SendEmailCommand)).toHaveLength(1);
    const args = mockSESv2Client.commandCalls(SendEmailCommand)[0].args[0].input;
    expect(args.FromEmailAddress).toBe(getConfig().supportEmail);
    expect(args.Destination?.ToAddresses).toStrictEqual(['alice@example.com']);

    const raw = (args.Content?.Raw?.Data as Buffer).toString();
    expect(raw).not.toContain('other@example.com');
    expect(raw).not.toMatch(/^X-Test:/im);

    const parsed = await simpleParser(args.Content?.Raw?.Data as Buffer);
    expect(parsed.from?.text).toBe(getConfig().supportEmail);
    expect(parsed.headerLines.filter((h) => h.key === 'from')).toHaveLength(1);
    expect(parsed.subject).toBe('Subject');
  });

  test.each([
    ['text object', { text: { raw: 'From: other@example.com\r\n\r\nBody' } }],
    ['html object', { html: { path: 'https://example.com/index.html' } }],
    ['subject object', { text: 'Body', subject: { prepared: true, value: 'x\r\nFrom: other@example.com' } }],
    ['attachments object', { text: 'Body', attachments: { raw: 'From: other@example.com\r\n\r\nBody' } }],
    ['attachment string', { text: 'Body', attachments: ['attachment.txt'] }],
    ['attachment content object', { text: 'Body', attachments: [{ content: { href: 'https://example.com/' } }] }],
    ['attachment path object', { text: 'Body', attachments: [{ path: { href: 'https://example.com/' } }] }],
    ['icalEvent href', { text: 'Body', icalEvent: { href: 'https://example.com/event.ics' } }],
    ['icalEvent content object', { text: 'Body', icalEvent: { content: { path: 'attachment.txt' } } }],
  ])('Reject invalid option: %s', async (_, options) => {
    const accessToken = await initTestAuth({ membership: { admin: true } });
    const res = await request(app)
      .post(`/email/v1/send`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({ to: 'alice@example.com', subject: 'Subject', ...options });
    expect(res).toHaveStatus(400);
    expect(mockSESv2Client.send.callCount).toBe(0);
  });

  test('Send email via server SMTP only passes supported options', async () => {
    mockCreateTransport.mockClear();
    mockSendMail.mockClear();

    const config = getConfig();
    const originalSmtp = config.smtp;
    config.smtp = { host: 'smtp.example.com', port: 587, username: 'user', password: 'pass' };

    try {
      const accessToken = await initTestAuth({ membership: { admin: true } });
      const res = await request(app)
        .post(`/email/v1/send`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.JSON)
        .send(
          // Raw JSON so that "__proto__" arrives as an own property of the parsed body
          JSON.stringify({
            to: 'alice@example.com',
            subject: 'Subject',
            text: 'Body',
            from: 'other@example.com',
            envelope: { from: 'other@example.com', to: ['bob@example.com'] },
            raw: 'From: other@example.com\r\n\r\nBody',
            headers: { From: 'other@example.com' },
            dkim: { domainName: 'example.com', keySelector: 's', privateKey: 'x', cacheDir: '/tmp', cacheTreshold: 1 },
            auth: { type: 'OAuth2', accessUrl: 'http://127.0.0.1/' },
            disableFileAccess: false,
            disableUrlAccess: false,
          }).replace(/}$/, ',"__proto__":{"raw":"x","envelope":{"to":["bob@example.com"]}}}')
        );
      expect(res).toHaveStatus(200);

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const options = mockSendMail.mock.calls[0][0];
      expect(options.from).toBe(config.supportEmail);
      expect(options.sender).toBe(config.supportEmail);
      expect(options.disableFileAccess).toBe(true);
      for (const key of ['envelope', 'raw', 'headers', 'dkim', 'auth', 'disableUrlAccess']) {
        expect(options[key]).toBeUndefined();
      }
      expect(mockSESv2Client.send.callCount).toBe(0);
    } finally {
      config.smtp = originalSmtp;
    }
  });

  test('Send email via project SMTP', async () => {
    const lookupSpy = vi
      .spyOn(dns.promises, 'lookup')
      .mockResolvedValue([{ address: '93.184.215.14', family: 4 }] as never);
    onTestFinished(() => lookupSpy.mockRestore());
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
    expect(res).toHaveStatus(200);

    expect(mockCreateTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: '93.184.215.14', port: 587, secure: false })
    );
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockSendMail.mock.calls[0][0].from).toBe('support@project.example.com');
    expect(mockSESv2Client.send.callCount).toBe(0);
    expect(mockSESv2Client.commandCalls(SendEmailCommand)).toHaveLength(0);
  });

  test('Misconfigured project SMTP returns bad request', async () => {
    mockCreateTransport.mockClear();
    mockSendMail.mockClear();

    const accessToken = await initTestAuth({
      membership: { admin: true },
      project: {
        secret: [
          { name: 'smtpHost', valueString: 'smtp.project.example.com' },
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

    expect(res).toHaveStatus(400);
    expect(res.body.issue[0].details.text).toBe('Project SMTP configuration is incomplete or invalid');
    expect(mockCreateTransport).not.toHaveBeenCalled();
    expect(mockSendMail).not.toHaveBeenCalled();
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
    expect(res).toHaveStatus(400);
    expect(res.body.issue[0].details.text).toBe('Error sending email: BadRequestException: Illegal address');
  });
});
