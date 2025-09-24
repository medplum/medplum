// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  getReferenceString,
  indexSearchParameterBundle,
  indexStructureDefinitionBundle,
  unauthorized,
} from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import { Binary, Bundle, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { validateRequest } from 'twilio/lib/webhooks/webhooks';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { handler } from './voice-webhook';

// Mock the Twilio validateRequest function
vi.mock('twilio/lib/webhooks/webhooks', () => ({
  validateRequest: vi.fn(),
}));

describe('Twilio Voice Webhook', () => {
  let medplum: MockClient;
  let bot: any;
  let projectMembership: any;

  const secrets = {
    TWILIO_AUTH_TOKEN: { name: 'TWILIO_AUTH_TOKEN', valueString: 'test-auth-token' },
    TWILIO_NUMBER: { name: 'TWILIO_NUMBER', valueString: '+15551234567' },
  };

  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-medplum.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    medplum = new MockClient();

    // Create a bot
    bot = await medplum.createResource({
      resourceType: 'Bot',
      name: 'Test Voice Bot',
      code: 'test-code',
    });

    // Create a project membership for the bot
    projectMembership = await medplum.createResource({
      resourceType: 'ProjectMembership',
      profile: getReferenceString(bot),
      project: { reference: 'Project/test-project' },
      user: { reference: 'User/test-user' },
    } as any);
  });

  test('should return unauthorized when Twilio validation fails', async () => {
    // Mock validateRequest to return false (invalid signature)
    vi.mocked(validateRequest).mockReturnValue(false);

    const input = {
      From: '+15559876543',
      To: '+15551234567',
      CallSid: 'CA1234567890',
    };

    const event = {
      bot: { reference: getReferenceString(bot) },
      input,
      headers: {
        'x-twilio-signature': 'invalid-signature',
      },
      secrets,
      contentType: 'application/x-www-form-urlencoded',
    };

    const result = await handler(medplum, event);

    expect(result).toEqual(unauthorized);

    expect(validateRequest).toHaveBeenCalledWith(
      'test-auth-token',
      'invalid-signature',
      `${medplum.getBaseUrl()}/webhook/${projectMembership.id}`,
      input
    );
  });

  test('should throw error when bot membership is not found', async () => {
    // Create a bot without membership
    const orphanBot = await medplum.createResource({
      resourceType: 'Bot',
      name: 'Orphan Bot',
      code: 'orphan-code',
    });

    const input = {
      From: '+15559876543',
      To: '+15551234567',
      CallSid: 'CA1234567890',
    };

    const event = {
      bot: { reference: getReferenceString(orphanBot) },
      input,
      headers: {
        'x-twilio-signature': 'test-signature',
      },
      secrets,
      contentType: 'application/x-www-form-urlencoded',
    };

    await expect(handler(medplum, event)).rejects.toThrow('Could not find the bot membership');
  });

  test('should handle inbound call successfully', async () => {
    // Mock validateRequest to return true (valid signature)
    vi.mocked(validateRequest).mockReturnValue(true);

    const input = {
      From: '+15559876543',
      To: '+15551234567', // Same as TWILIO_NUMBER (inbound)
      CallSid: 'CA1234567890',
    };

    const event = {
      bot: { reference: getReferenceString(bot) },
      input,
      headers: {
        'x-twilio-signature': 'valid-signature',
      },
      secrets,
      contentType: 'application/x-www-form-urlencoded',
    };

    const result = await handler(medplum, event);

    expect(result).toBeDefined();
    expect(result.resourceType).toBe('Binary');

    // Type assertion for Binary result
    const binaryResult = result as Binary;
    expect(binaryResult.contentType).toBe('application/xml');
    expect(binaryResult.data).toBeDefined();

    // Decode the base64 data to check TwiML content
    const twimlContent = Buffer.from(binaryResult.data as string, 'base64').toString('utf-8');
    expect(twimlContent).toContain('<Response>');
    expect(twimlContent).toContain('<Say>Thanks for calling Medplum. Please hold while we connect you.</Say>');
    expect(twimlContent).toContain('<Dial>');
    expect(twimlContent).toContain(`<Client>${secrets.TWILIO_NUMBER.valueString}</Client>`);
    expect(twimlContent).toContain('</Dial>');
    expect(twimlContent).toContain('</Response>');
  });

  test('should handle outbound call successfully', async () => {
    // Mock validateRequest to return true (valid signature)
    vi.mocked(validateRequest).mockReturnValue(true);

    const input = {
      From: '+15551234567', // Same as TWILIO_NUMBER
      To: '+15559876543', // Different from TWILIO_NUMBER (outbound)
      CallSid: 'CA1234567890',
    };

    const event = {
      bot: { reference: getReferenceString(bot) },
      input,
      headers: {
        'x-twilio-signature': 'valid-signature',
      },
      secrets,
      contentType: 'application/x-www-form-urlencoded',
    };

    const result = await handler(medplum, event);

    expect(result).toBeDefined();
    expect(result.resourceType).toBe('Binary');

    // Type assertion for Binary result
    const binaryResult = result as Binary;
    expect(binaryResult.contentType).toBe('application/xml');
    expect(binaryResult.data).toBeDefined();

    // Decode the base64 data to check TwiML content
    const twimlContent = Buffer.from(binaryResult.data as string, 'base64').toString('utf-8');
    expect(twimlContent).toContain('<Response>');
    expect(twimlContent).toContain('<Dial');
    expect(twimlContent).toContain(`callerId="${secrets.TWILIO_NUMBER.valueString}"`);
    expect(twimlContent).toContain('<Number>+15559876543</Number>');
    expect(twimlContent).toContain('</Dial>');
    expect(twimlContent).toContain('</Response>');
  });
});
