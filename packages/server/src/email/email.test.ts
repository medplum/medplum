import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { ContentType, getReferenceString, normalizeOperationOutcome, notFound } from '@medplum/core';
import { AwsClientStub, mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { randomUUID } from 'crypto';
import { Request } from 'express';
import { simpleParser } from 'mailparser';
import nodemailer, { Transporter } from 'nodemailer';
import Mail from 'nodemailer/lib/mailer';
import { Readable } from 'stream';
import { initAppServices, shutdownApp } from '../app';
import { getConfig, loadTestConfig } from '../config';
import { getSystemRepo } from '../fhir/repo';
import { getBinaryStorage } from '../fhir/storage';
import { withTestContext } from '../test.setup';
import { sendEmail } from './email';

describe('Email', () => {
  const systemRepo = getSystemRepo();
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
    expect(mockSESv2Client).toHaveReceivedCommandTimes(SendEmailCommand, 1);

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
    expect(mockSESv2Client).toHaveReceivedCommandTimes(SendEmailCommand, 1);

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
    expect(mockSESv2Client).toHaveReceivedCommandTimes(SendEmailCommand, 1);

    const inputArgs = mockSESv2Client.commandCalls(SendEmailCommand)[0].args[0].input;

    expect(inputArgs?.Destination?.ToAddresses?.[0] ?? '').toBe('alice@example.com');

    const parsed = await simpleParser(Readable.from(inputArgs?.Content?.Raw?.Data ?? ''));
    expect(parsed.subject).toBe('Hello');
    expect(parsed.text).toBe('Hello Alice');
    expect(parsed.attachments).toHaveLength(1);
    expect(parsed.attachments[0].filename).toBe('text1.txt');
  });

  test('Array of addresses', async () => {
    await sendEmail(systemRepo, {
      to: ['alice@example.com', { name: 'Bob', address: 'bob@example.com' }],
      subject: 'Hello',
      text: 'Hello Alice',
    });

    expect(mockSESv2Client.send.callCount).toBe(1);
    expect(mockSESv2Client).toHaveReceivedCommandTimes(SendEmailCommand, 1);

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
    expect(mockSESv2Client).toHaveReceivedCommandTimes(SendEmailCommand, 1);

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
    await getBinaryStorage().writeBinary(binary, 'hello.txt', ContentType.TEXT, req as Request);

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
    expect(mockSESv2Client).toHaveReceivedCommandTimes(SendEmailCommand, 1);

    const inputArgs = mockSESv2Client.commandCalls(SendEmailCommand)[0].args[0].input;

    expect(inputArgs?.Destination?.ToAddresses?.[0] ?? '').toBe('alice@example.com');

    const parsed = await simpleParser(Readable.from(inputArgs?.Content?.Raw?.Data ?? ''));
    expect(parsed.subject).toBe('Hello');
    expect(parsed.text).toBe('Hello Alice');
    expect(parsed.attachments).toHaveLength(1);
    expect(parsed.attachments[0].filename).toBe('text1.txt');
  });

  test('Block invalid binary', async () => {
    try {
      await sendEmail(systemRepo, {
        to: 'alice@example.com',
        subject: 'Hello',
        text: 'Hello Alice',
        attachments: [
          {
            filename: 'text1.txt',
            path: `Binary/${randomUUID()}`,
          },
        ],
      });

      throw new Error('Expected to throw');
    } catch (err) {
      const outcome = normalizeOperationOutcome(err);
      expect(outcome).toMatchObject(notFound);
    }

    expect(mockSESv2Client.send.callCount).toBe(0);
    expect(mockSESv2Client).toHaveReceivedCommandTimes(SendEmailCommand, 0);
  });

  test('Block file path', async () => {
    try {
      await sendEmail(systemRepo, {
        to: 'alice@example.com',
        subject: 'Hello',
        text: 'Hello Alice',
        attachments: [
          {
            filename: 'text1.txt',
            path: './package.json',
          },
        ],
      });

      throw new Error('Expected to throw');
    } catch (err) {
      const outcome = normalizeOperationOutcome(err);
      expect(outcome.issue?.[0]?.code).toEqual('invalid');
      expect(outcome.issue?.[0]?.details?.text).toEqual(
        'Invalid email options: File access rejected for ./package.json'
      );
    }

    expect(mockSESv2Client.send.callCount).toBe(0);
    expect(mockSESv2Client).toHaveReceivedCommandTimes(SendEmailCommand, 0);
  });

  test('Catch invalid options', async () => {
    try {
      await sendEmail(systemRepo, {
        to: 'alice@example.com',
        subject: 'Hello',
        text: 'Hello Alice',
        attachments: [
          {
            filename: 'text1.txt',
            content: { foo: 'bar' } as unknown as Readable, // Invalid content
          },
        ],
      });

      throw new Error('Expected to throw');
    } catch (err) {
      const outcome = normalizeOperationOutcome(err);
      expect(outcome.issue?.[0]?.code).toEqual('invalid');
      expect(outcome.issue?.[0]?.details?.text).toEqual('Invalid email options: ERR_INVALID_ARG_TYPE');
    }

    expect(mockSESv2Client.send.callCount).toBe(0);
    expect(mockSESv2Client).toHaveReceivedCommandTimes(SendEmailCommand, 0);
  });

  test('Send via SMTP', async () => {
    const config = getConfig();
    config.smtp = {
      host: 'smtp.example.com',
      port: 587,
      username: 'user',
      password: 'pass',
    };

    const sendMail = jest.fn().mockResolvedValue({ messageId: '123' });
    const createTransportSpy = jest.spyOn(nodemailer, 'createTransport');
    createTransportSpy.mockReturnValue({ sendMail } as unknown as Transporter);

    const toAddresses = 'alice@example.com';
    await sendEmail(systemRepo, {
      to: toAddresses,
      cc: 'bob@example.com',
      subject: 'Hello',
      text: 'Hello Alice',
    });

    expect(createTransportSpy).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(mockSESv2Client.send.callCount).toBe(0);

    config.smtp = undefined;
  });
});
