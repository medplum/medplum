// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * This is a simple example of a voice webhook that can be used to make and receive calls
 *
 * For more information, see https://www.twilio.com/en-us/blog/make-receive-phone-calls-browser-twilio-programmable-voice-python-javascript
 */

import { getReferenceString, resolveId, unauthorized } from '@medplum/core';
import type { BotEvent, MedplumClient } from '@medplum/core';
import type { Binary, OperationOutcome } from '@medplum/fhirtypes';
import VoiceResponse from 'twilio/lib/twiml/VoiceResponse';
import { validateRequest } from 'twilio/lib/webhooks/webhooks';

async function isValidTwilioRequest(medplum: MedplumClient, event: BotEvent<any>): Promise<boolean> {
  const membership = await medplum.searchOne('ProjectMembership', {
    profile: getReferenceString(event.bot),
  });

  if (!membership) {
    throw new Error('Could not find the bot membership');
  }

  // The webhook URL is the URL of the bot's webhook endpoint
  const webhookURL = `${medplum.getBaseUrl()}/webhook/${resolveId(membership)}`;

  // Twilio sends a signature in the headers of the request that can be used to verify
  // that the request is actually coming from Twilio
  const twilioRequestSignature = event.headers?.['x-twilio-signature'] as string;

  // Use secrets to store a Twilio auth token that will be used to validate the request
  // For more information, see https://help.twilio.com/articles/223136027-Auth-Tokens-and-How-to-Change-Them
  const twilioAuthToken = event.secrets['TWILIO_AUTH_TOKEN']?.valueString as string;

  // Convert the request body to a plain object
  const params = Object.fromEntries(Object.entries(event.input));

  // Validate the request using the Twilio SDK
  return validateRequest(twilioAuthToken, twilioRequestSignature, webhookURL, params);
}

export async function handler(medplum: MedplumClient, event: BotEvent<any>): Promise<Binary | OperationOutcome> {
  // Since this webhook is not authenticated, it's essential for security
  // that we validate that the request is coming from Twilio
  if (!(await isValidTwilioRequest(medplum, event))) {
    console.log('Unauthorized request');
    return unauthorized;
  }

  // This is the phone number (purchased from Twilio) that you will be using to make and receive calls
  const systemNumber = event.secrets['TWILIO_NUMBER']?.valueString;
  const params = Object.fromEntries(Object.entries(event.input));

  const twiml = new VoiceResponse();

  if (params.To !== systemNumber) {
    // This is an outbound call
    const dial = twiml.dial({
      callerId: systemNumber,
    });
    dial.number(params.To as string);
  } else {
    // This is an inbound call
    twiml.say('Thanks for calling Medplum. Please hold while we connect you.');
    const dial = twiml.dial();
    dial.client(systemNumber);
  }

  // By returning a Binary resource we can control the content type of the response and return a TwiML response
  return {
    resourceType: 'Binary',
    contentType: 'application/xml',
    data: Buffer.from(twiml.toString(), 'utf-8').toString('base64'),
  };
}
