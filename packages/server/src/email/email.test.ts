// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import type { WithId } from '@medplum/core';
import { ContentType, getReferenceString } from '@medplum/core';
import type { Project, ProjectSetting } from '@medplum/fhirtypes';
import type { AwsClientStub } from 'aws-sdk-client-mock';
import { mockClient } from 'aws-sdk-client-mock';
import { randomUUID } from 'crypto';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import type Mail from 'nodemailer/lib/mailer';
import { Readable } from 'stream';
import type { Mock, MockInstance } from 'vitest';
import { vi } from 'vitest';
import { initAppServices, shutdownApp } from '../app';
import { getConfig, loadTestConfig } from '../config/loader';
import { getGlobalSystemRepo } from '../fhir/repo';
import { globalLogger } from '../logger';
import { getBinaryStorage } from '../storage/loader';
import { withTestContext } from '../test.setup';

const { mockCreateTransport, mockSendMail } = vi.hoisted(() => {
  const sendMail = vi.fn().mockResolvedValue({ messageId: '123' });
  return {
    mockSendMail: sendMail,
    mockCreateTransport: vi.fn(() => ({ sendMail })),
  };
});

vi.mock('nodemailer', () => ({
  createTransport: mockCreateTransport,
  default: { createTransport: mockCreateTransport },
}));

const { sendEmail } = await import('./email');

describe('Email', () => {
  const systemRepo = getGlobalSystemRepo();
  let mockSESv2Client: AwsClientStub<SESv2Client>;

  beforeAll(async () => {
    const config = await loadTestConfig();
    config.emailProvider = 'awsses';
    config.storageBaseUrl = 'https://storage.example.com/';
    await initAppServices(config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  beforeEach(() => {
    mockSESv2Client = mockClient(SESv2Client);
    mockSESv2Client.on(SendEmailCommand).resolves({ MessageId: 'ID_TEST_123' });
  });

  afterEach(() => {
    mockSESv2Client.restore();
  });

  test('Send text email', async () => {
    const fromAddress = 'gibberish@example.com';
    const toAddresses = 'alice@example.com';
    await sendEmail(systemRepo, {
      from: fromAddress,
      to: toAddresses,
      cc: 'bob@example.com',
      subject: 'Hello',
      text: 'Hello Alice',
    });

    expect(mockSESv2Client.send.callCount).toBe(1);
    expect(mockSESv2Client.commandCalls(SendEmailCommand)).toHaveLength(1);

    const inputArgs = mockSESv2Client.commandCalls(SendEmailCommand)[0].args[0].input;

    expect(inputArgs?.FromEmailAddress).toBe(getConfig().supportEmail);
    expect(inputArgs?.Destination?.ToAddresses?.[0] ?? '').toBe('alice@example.com');
    expect(inputArgs?.Destination?.CcAddresses?.[0] ?? '').toBe('bob@example.com');

    const parsed = await simpleParser(Readable.from(inputArgs?.Content?.Raw?.Data ?? ''));
    expect(parsed.subject).toBe('Hello');
    expect(parsed.text).toBe('Hello Alice\n');
  });

  test('Send text email from approved sender', async () => {
    const fromAddress = 'no-reply@example.com';
    const toAddresses = 'alice@example.com';
    await sendEmail(systemRepo, {
      from: fromAddress,
      to: toAddresses,
      cc: 'bob@example.com',
      subject: 'Hello',
      text: 'Hello Alice',
    });

    expect(mockSESv2Client.send.callCount).toBe(1);
    expect(mockSESv2Client.commandCalls(SendEmailCommand)).toHaveLength(1);

    const inputArgs = mockSESv2Client.commandCalls(SendEmailCommand)[0].args[0].input;

    expect(inputArgs?.FromEmailAddress).toBe(fromAddress);
    expect(inputArgs?.Destination?.ToAddresses?.[0] ?? '').toBe('alice@example.com');
    expect(inputArgs?.Destination?.CcAddresses?.[0] ?? '').toBe('bob@example.com');

    const parsed = await simpleParser(Readable.from(inputArgs?.Content?.Raw?.Data ?? ''));
    expect(parsed.subject).toBe('Hello');
    expect(parsed.text).toBe('Hello Alice\n');
  });

  test('Send with display string', async () => {
    const fromAddress = 'Display Test <no-reply@example.com>';
    const toAddresses = 'alice@example.com';
    await sendEmail(systemRepo, {
      from: fromAddress,
      to: toAddresses,
      cc: 'bob@example.com',
      subject: 'Hello',
      text: 'Hello Alice',
    });

    expect(mockSESv2Client.send.callCount).toBe(1);
    expect(mockSESv2Client.commandCalls(SendEmailCommand)).toHaveLength(1);

    const inputArgs = mockSESv2Client.commandCalls(SendEmailCommand)[0].args[0].input;

    expect(inputArgs?.FromEmailAddress).toBe(fromAddress);
    expect(inputArgs?.Destination?.ToAddresses?.[0] ?? '').toBe('alice@example.com');
    expect(inputArgs?.Destination?.CcAddresses?.[0] ?? '').toBe('bob@example.com');

    const parsed = await simpleParser(Readable.from(inputArgs?.Content?.Raw?.Data ?? ''));
    expect(parsed.subject).toBe('Hello');
    expect(parsed.text).toBe('Hello Alice\n');
  });

  test('Send with attachments', async () => {
    await sendEmail(systemRepo, {
      to: 'alice@example.com',
      subject: 'Hello',
      text: 'Hello Alice',
      attachments: [
        {
          filename: 'text1.txt',
          content: 'hello world!',
        },
      ],
    });
    expect(mockSESv2Client.send.callCount).toBe(1);
    expect(mockSESv2Client.commandCalls(SendEmailCommand)).toHaveLength(1);

    const inputArgs = mockSESv2Client.commandCalls(SendEmailCommand)[0].args[0].input;

    expect(inputArgs?.Destination?.ToAddresses?.[0] ?? '').toBe('alice@example.com');

    const parsed = await simpleParser(Readable.from(inputArgs?.Content?.Raw?.Data ?? ''));
    expect(parsed.subject).toBe('Hello');
    expect(parsed.text).toBe('Hello Alice');
    expect(parsed.attachments).toHaveLength(1);
    expect(parsed.attachments[0].filename).toBe('text1.txt');
  });

  test('Send with replyTo', async () => {
    const fromAddress = 'gibberish@example.com';
    const toAddresses = 'alice@example.com';
    const replyToAddress = 'reply-test@example.com';
    await sendEmail(systemRepo, {
      from: fromAddress,
      to: toAddresses,
      replyTo: replyToAddress,
      subject: 'Hello',
      text: 'Hello Alice',
    });

    expect(mockSESv2Client.send.callCount).toBe(1);
    expect(mockSESv2Client.commandCalls(SendEmailCommand)).toHaveLength(1);

    const inputArgs = mockSESv2Client.commandCalls(SendEmailCommand)[0].args[0].input;

    expect(inputArgs?.FromEmailAddress).toBe(getConfig().supportEmail);
    expect(inputArgs?.Destination?.ToAddresses?.[0] ?? '').toBe('alice@example.com');
    expect(inputArgs?.ReplyToAddresses?.[0] ?? '').toBe(replyToAddress);
  });

  test('Array of addresses', async () => {
    await sendEmail(systemRepo, {
      to: ['alice@example.com', { name: 'Bob', address: 'bob@example.com' }],
      subject: 'Hello',
      text: 'Hello Alice',
    });

    expect(mockSESv2Client.send.callCount).toBe(1);
    expect(mockSESv2Client.commandCalls(SendEmailCommand)).toHaveLength(1);

    const inputArgs = mockSESv2Client.commandCalls(SendEmailCommand)[0].args[0].input;

    expect(inputArgs?.Destination?.ToAddresses?.[0] ?? '').toBe('alice@example.com');
    expect(inputArgs?.Destination?.ToAddresses?.[1] ?? '').toBe('bob@example.com');

    const parsed = await simpleParser(Readable.from(inputArgs?.Content?.Raw?.Data ?? ''));
    expect(parsed.subject).toBe('Hello');
    expect(parsed.text).toBe('Hello Alice\n');
  });

  test('Handle null addresses', async () => {
    await sendEmail(systemRepo, {
      to: 'alice@example.com',
      cc: null as unknown as string,
      bcc: [null as unknown as string, {} as unknown as Mail.Address],
      subject: 'Hello',
      text: 'Hello Alice',
    });
    expect(mockSESv2Client.send.callCount).toBe(1);
    expect(mockSESv2Client.commandCalls(SendEmailCommand)).toHaveLength(1);

    const inputArgs = mockSESv2Client.commandCalls(SendEmailCommand)[0].args[0].input;

    expect(inputArgs?.Destination?.ToAddresses?.[0] ?? '').toBe('alice@example.com');

    const parsed = await simpleParser(Readable.from(inputArgs?.Content?.Raw?.Data ?? ''));

    expect(parsed.subject).toBe('Hello');
    expect(parsed.text).toBe('Hello Alice\n');
  });

  test('Attach binary', async () => {
    // Create a binary
    const binary = await withTestContext(() =>
      systemRepo.createResource({
        resourceType: 'Binary',
        contentType: ContentType.TEXT,
      })
    );

    // Emulate upload
    const req = new Readable();
    req.push('hello world');
    req.push(null);
    (req as any).headers = {};
    await getBinaryStorage().writeBinary(binary, 'hello.txt', ContentType.TEXT, req);

    await sendEmail(systemRepo, {
      to: 'alice@example.com',
      subject: 'Hello',
      text: 'Hello Alice',
      attachments: [
        {
          filename: 'text1.txt',
          path: getReferenceString(binary),
        },
      ],
    });
    expect(mockSESv2Client.send.callCount).toBe(1);
    expect(mockSESv2Client.commandCalls(SendEmailCommand)).toHaveLength(1);

    const inputArgs = mockSESv2Client.commandCalls(SendEmailCommand)[0].args[0].input;

    expect(inputArgs?.Destination?.ToAddresses?.[0] ?? '').toBe('alice@example.com');

    const parsed = await simpleParser(Readable.from(inputArgs?.Content?.Raw?.Data ?? ''));
    expect(parsed.subject).toBe('Hello');
    expect(parsed.text).toBe('Hello Alice');
    expect(parsed.attachments).toHaveLength(1);
    expect(parsed.attachments[0].filename).toBe('text1.txt');
  });

  test('Block invalid binary', async () => {
    await expect(
      sendEmail(systemRepo, {
        to: 'alice@example.com',
        subject: 'Hello',
        text: 'Hello Alice',
        attachments: [
          {
            filename: 'text1.txt',
            path: `Binary/${randomUUID()}`,
          },
        ],
      })
    ).rejects.toThrow('Not found');

    expect(mockSESv2Client.send.callCount).toBe(0);
    expect(mockSESv2Client.commandCalls(SendEmailCommand)).toHaveLength(0);
  });

  test('Block file path', async () => {
    await expect(
      sendEmail(systemRepo, {
        to: 'alice@example.com',
        subject: 'Hello',
        text: 'Hello Alice',
        attachments: [
          {
            filename: 'text1.txt',
            path: './package.json',
          },
        ],
      })
    ).rejects.toThrow('Invalid email options: File access rejected for ./package.json');

    expect(mockSESv2Client.send.callCount).toBe(0);
    expect(mockSESv2Client.commandCalls(SendEmailCommand)).toHaveLength(0);
  });

  test('Catch invalid options', async () => {
    await expect(
      sendEmail(systemRepo, {
        to: 'alice@example.com',
        subject: 'Hello',
        text: 'Hello Alice',
        attachments: [
          {
            filename: 'text1.txt',
            content: { foo: 'bar' } as unknown as Readable, // Invalid content
          },
        ],
      })
    ).rejects.toThrow(/Invalid email options/);

    expect(mockSESv2Client.send.callCount).toBe(0);
    expect(mockSESv2Client.commandCalls(SendEmailCommand)).toHaveLength(0);
  });

  test('Send via SMTP', async () => {
    const config = getConfig();
    config.smtp = {
      host: 'smtp.example.com',
      port: 587,
      username: 'user',
      password: 'pass',
    };

    mockCreateTransport.mockClear();
    mockSendMail.mockClear();

    const toAddresses = 'alice@example.com';
    await sendEmail(systemRepo, {
      to: toAddresses,
      cc: 'bob@example.com',
      subject: 'Hello',
      text: 'Hello Alice',
    });

    expect(mockCreateTransport).toHaveBeenCalledTimes(1);
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockSESv2Client.send.callCount).toBe(0);

    config.smtp = undefined;
  });

  describe('Project SMTP', () => {
    let sendMail: Mock;
    let createTransportSpy: MockInstance;

    function makeProject(secrets: ProjectSetting[]): WithId<Project> {
      return { resourceType: 'Project', id: randomUUID(), secret: secrets };
    }

    const baseSecrets: ProjectSetting[] = [
      { name: 'smtpHost', valueString: 'smtp.project.example.com' },
      { name: 'smtpPort', valueInteger: 587 },
      { name: 'smtpUsername', valueString: 'projectuser' },
      { name: 'smtpPassword', valueString: 'projectpass' },
      { name: 'smtpFromAddress', valueString: 'noreply@project.example.com' },
    ];

    beforeEach(() => {
      sendMail = vi.fn().mockResolvedValue({ messageId: '123' });
      createTransportSpy = vi.spyOn(nodemailer, 'createTransport');
      createTransportSpy.mockClear();
      createTransportSpy.mockReturnValue({ sendMail });
    });

    afterEach(() => {
      createTransportSpy.mockRestore();
      getConfig().allowProjectSmtp = undefined;
      getConfig().smtp = undefined;
    });

    test('Uses project SMTP transport when configured', async () => {
      const project = makeProject(baseSecrets);
      await sendEmail(systemRepo, { to: 'alice@example.com', subject: 'Hello', text: 'Hello Alice' }, project);

      expect(createTransportSpy).toHaveBeenCalledTimes(1);
      expect(createTransportSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'smtp.project.example.com',
          port: 587,
          secure: false,
          auth: { user: 'projectuser', pass: 'projectpass' },
        })
      );
      expect(sendMail).toHaveBeenCalledTimes(1);
      expect(mockSESv2Client.send.callCount).toBe(0);
    });

    test('Infers secure for port 465', async () => {
      const project = makeProject([
        { name: 'smtpHost', valueString: 'smtp.project.example.com' },
        { name: 'smtpPort', valueInteger: 465 },
        { name: 'smtpUsername', valueString: 'projectuser' },
        { name: 'smtpPassword', valueString: 'projectpass' },
        { name: 'smtpFromAddress', valueString: 'noreply@project.example.com' },
      ]);
      await sendEmail(systemRepo, { to: 'alice@example.com', subject: 'Hello', text: 'Hello Alice' }, project);

      expect(createTransportSpy).toHaveBeenCalledWith(expect.objectContaining({ port: 465, secure: true }));
    });

    test('Explicit smtpSecure overrides port inference', async () => {
      const project = makeProject([
        { name: 'smtpHost', valueString: 'smtp.project.example.com' },
        { name: 'smtpPort', valueInteger: 465 },
        { name: 'smtpUsername', valueString: 'projectuser' },
        { name: 'smtpPassword', valueString: 'projectpass' },
        { name: 'smtpFromAddress', valueString: 'noreply@project.example.com' },
        { name: 'smtpSecure', valueBoolean: false },
      ]);
      await sendEmail(systemRepo, { to: 'alice@example.com', subject: 'Hello', text: 'Hello Alice' }, project);

      expect(createTransportSpy).toHaveBeenCalledWith(expect.objectContaining({ port: 465, secure: false }));
    });

    test('From address approved by project sender list', async () => {
      const project = makeProject([
        { name: 'smtpHost', valueString: 'smtp.project.example.com' },
        { name: 'smtpPort', valueInteger: 587 },
        { name: 'smtpUsername', valueString: 'projectuser' },
        { name: 'smtpPassword', valueString: 'projectpass' },
        { name: 'smtpFromAddress', valueString: 'default@project.example.com' },
        { name: 'smtpApprovedSenders', valueString: 'sender@project.example.com' },
      ]);
      await sendEmail(
        systemRepo,
        { from: 'sender@project.example.com', to: 'alice@example.com', subject: 'Hello', text: 'Hello Alice' },
        project
      );

      expect(sendMail).toHaveBeenCalledTimes(1);
      expect(sendMail.mock.calls[0][0].from).toBe('sender@project.example.com');
    });

    test('Server-approved sender not accepted under project list', async () => {
      const project = makeProject([
        { name: 'smtpHost', valueString: 'smtp.project.example.com' },
        { name: 'smtpPort', valueInteger: 587 },
        { name: 'smtpUsername', valueString: 'projectuser' },
        { name: 'smtpPassword', valueString: 'projectpass' },
        { name: 'smtpFromAddress', valueString: 'default@project.example.com' },
        { name: 'smtpApprovedSenders', valueString: 'sender@project.example.com' },
      ]);
      // 'no-reply@example.com' is the server-approved sender, but not in the project list
      await sendEmail(
        systemRepo,
        { from: 'no-reply@example.com', to: 'alice@example.com', subject: 'Hello', text: 'Hello Alice' },
        project
      );

      expect(sendMail).toHaveBeenCalledTimes(1);
      expect(sendMail.mock.calls[0][0].from).toBe('default@project.example.com');
    });

    test('Missing smtpFromAddress fails loudly', async () => {
      const project = makeProject([
        { name: 'smtpHost', valueString: 'smtp.project.example.com' },
        { name: 'smtpPort', valueInteger: 587 },
        { name: 'smtpUsername', valueString: 'projectuser' },
        { name: 'smtpPassword', valueString: 'projectpass' },
      ]);
      await expect(
        sendEmail(systemRepo, { to: 'alice@example.com', subject: 'Hello', text: 'Hello Alice' }, project)
      ).rejects.toThrow('Project SMTP configuration is incomplete or invalid');

      expect(sendMail).not.toHaveBeenCalled();
      expect(mockSESv2Client.send.callCount).toBe(0);
    });

    test('Falls back to server transport when project SMTP not configured', async () => {
      getConfig().smtp = {
        host: 'smtp.server.example.com',
        port: 587,
        username: 'serveruser',
        password: 'serverpass',
      };
      const project = makeProject([{ name: 'OPENAI_API_KEY', valueString: 'unrelated' }]);
      await sendEmail(systemRepo, { to: 'alice@example.com', subject: 'Hello', text: 'Hello Alice' }, project);

      expect(createTransportSpy).toHaveBeenCalledWith(expect.objectContaining({ host: 'smtp.server.example.com' }));
      expect(mockSESv2Client.send.callCount).toBe(0);
    });

    test('Misconfigured project SMTP fails loudly', async () => {
      const project = makeProject([
        { name: 'smtpHost', valueString: 'smtp.project.example.com' },
        { name: 'smtpPort', valueInteger: 587 },
        { name: 'smtpUsername', valueString: 'projectuser' },
        { name: 'smtpFromAddress', valueString: 'noreply@project.example.com' },
        // Missing smtpPassword
      ]);
      await expect(
        sendEmail(systemRepo, { to: 'alice@example.com', subject: 'Hello', text: 'Hello Alice' }, project)
      ).rejects.toThrow('Project SMTP configuration is incomplete or invalid');

      expect(sendMail).not.toHaveBeenCalled();
      expect(mockSESv2Client.send.callCount).toBe(0);
    });

    test('Logs and rethrows on project SMTP send failure', async () => {
      const loggerErrorSpy = vi.spyOn(globalLogger, 'error').mockImplementation(() => undefined);
      sendMail.mockRejectedValue(new Error('Connection refused'));
      const project = makeProject(baseSecrets);

      try {
        await expect(
          sendEmail(systemRepo, { to: 'alice@example.com', subject: 'Hello', text: 'Hello Alice' }, project)
        ).rejects.toThrow('Connection refused');

        expect(loggerErrorSpy).toHaveBeenCalledWith(
          'Project SMTP send failed',
          expect.objectContaining({
            projectId: project.id,
            host: 'smtp.project.example.com',
            port: 587,
            err: 'Connection refused',
          })
        );
      } finally {
        loggerErrorSpy.mockRestore();
      }
    });

    test('Kill-switch disables project SMTP', async () => {
      getConfig().allowProjectSmtp = false;
      const project = makeProject(baseSecrets);
      await sendEmail(systemRepo, { to: 'alice@example.com', subject: 'Hello', text: 'Hello Alice' }, project);

      // Falls through to AWS SES (the configured emailProvider)
      expect(sendMail).not.toHaveBeenCalled();
      expect(mockSESv2Client.send.callCount).toBe(1);
    });
  });
});
