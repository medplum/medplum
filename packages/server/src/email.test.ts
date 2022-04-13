import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { simpleParser } from 'mailparser';
import { loadTestConfig } from './config';
import { sendEmail } from './email';

jest.mock('@aws-sdk/client-sesv2');

describe('Email', () => {
  beforeAll(async () => {
    await loadTestConfig();
  });

  beforeEach(() => {
    (SESv2Client as unknown as jest.Mock).mockClear();
    (SendEmailCommand as unknown as jest.Mock).mockClear();
  });

  test('Send text email', async () => {
    await sendEmail({
      to: 'alice@example.com',
      subject: 'Hello',
      text: 'Hello Alice',
    });
    expect(SESv2Client).toHaveBeenCalledTimes(1);
    expect(SendEmailCommand).toHaveBeenCalledTimes(1);

    const args = (SendEmailCommand as unknown as jest.Mock).mock.calls[0][0];
    expect(args.Destination.ToAddresses[0]).toBe('alice@example.com');

    const parsed = await simpleParser(args.Content.Raw.Data);
    expect(parsed.subject).toBe('Hello');
    expect(parsed.text).toBe('Hello Alice\n');
  });

  test('Array of addresses', async () => {
    await sendEmail({
      to: ['alice@example.com', { name: 'Bob', address: 'bob@example.com' }],
      subject: 'Hello',
      text: 'Hello Alice',
    });
    expect(SESv2Client).toHaveBeenCalledTimes(1);
    expect(SendEmailCommand).toHaveBeenCalledTimes(1);

    const args = (SendEmailCommand as unknown as jest.Mock).mock.calls[0][0];
    expect(args.Destination.ToAddresses[0]).toBe('alice@example.com');
    expect(args.Destination.ToAddresses[1]).toBe('bob@example.com');

    const parsed = await simpleParser(args.Content.Raw.Data);
    expect(parsed.subject).toBe('Hello');
    expect(parsed.text).toBe('Hello Alice\n');
  });

  test('Handle null addresses', async () => {
    await sendEmail({
      to: 'alice@example.com',
      cc: null as unknown as string,
      bcc: [null as unknown as string],
      subject: 'Hello',
      text: 'Hello Alice',
    });
    expect(SESv2Client).toHaveBeenCalledTimes(1);
    expect(SendEmailCommand).toHaveBeenCalledTimes(1);

    const args = (SendEmailCommand as unknown as jest.Mock).mock.calls[0][0];
    expect(args.Destination.ToAddresses[0]).toBe('alice@example.com');

    const parsed = await simpleParser(args.Content.Raw.Data);
    expect(parsed.subject).toBe('Hello');
    expect(parsed.text).toBe('Hello Alice\n');
  });
});
