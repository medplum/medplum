import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { simpleParser } from 'mailparser';
import Mail from 'nodemailer/lib/mailer';
import { mockClient, AwsClientStub } from 'aws-sdk-client-mock';
import { Readable } from 'stream';
import 'aws-sdk-client-mock-jest';

import { loadTestConfig } from '../config';
import { sendEmail } from './email';

describe('Email', () => {
  let mockSESv2Client: AwsClientStub<SESv2Client>;

  beforeAll(async () => {
    await loadTestConfig();
  });

  beforeEach(() => {
    mockSESv2Client = mockClient(SESv2Client);
    mockSESv2Client.on(SendEmailCommand).resolves({ MessageId: 'ID_TEST_123' });
  });

  afterEach(() => {
    mockSESv2Client.restore();
  });

  test('Send text email', async () => {
    const toAddresses = 'alice@example.com';
    await sendEmail({
      to: toAddresses,
      cc: 'bob@example.com',
      subject: 'Hello',
      text: 'Hello Alice',
    });

    expect(mockSESv2Client.send.callCount).toBe(1);
    expect(mockSESv2Client).toHaveReceivedCommandTimes(SendEmailCommand, 1);

    const inputArgs = mockSESv2Client.commandCalls(SendEmailCommand)[0].args[0].input;

    expect(inputArgs?.Destination?.ToAddresses?.[0] ?? '').toBe('alice@example.com');
    expect(inputArgs?.Destination?.CcAddresses?.[0] ?? '').toBe('bob@example.com');

    const parsed = await simpleParser(Readable.from(inputArgs?.Content?.Raw?.Data ?? ''));
    expect(parsed.subject).toBe('Hello');
    expect(parsed.text).toBe('Hello Alice\n');
  });

  test('Send with attachments', async () => {
    await sendEmail({
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
    await sendEmail({
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
    await sendEmail({
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
});
