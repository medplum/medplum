import { allOk, badRequest, getStatus, isOperationOutcome } from '@medplum/core';
import { Binary, Bot, ProjectMembership, Reference } from '@medplum/fhirtypes';
import { Request, Response, Router } from 'express';
import { asyncWrap } from '../async';
import { executeBot } from '../bots/execute';
import { getResponseBodyFromResult, getResponseContentType } from '../bots/utils';
import { sendOutcome } from '../fhir/outcomes';
import { getSystemRepo } from '../fhir/repo';
import { sendBinaryResponse } from '../fhir/response';

/**
 * Allowed signature headers are:
 *
 *   - `X-Signature` - standard generic signature header
 *   - `X-HMAC-Signature` - standard HMAC signature header
 *      - See: https://consensus.stoplight.io/docs/fax-services/1c4979f1d8ca0-fax-inbound-notification
 *   - `X-Cal-Signature-256` - Cal.com specific signature header
 *      - See: https://cal.com/docs/developing/guides/automation/webhooks
 *   - `X-Twilio-Email-Event-Webhook-Signature` - Twilio SendGrid specific signature header
 *     - See: https://www.twilio.com/docs/sendgrid/for-developers/tracking-events/getting-started-event-webhook-security-features
 *   - `X-Twilio-Signature` - Twilio specific signature header
 *     - See: https://www.twilio.com/docs/usage/webhooks/webhooks-security
 */
const SIGNATURE_HEADERS = [
  'x-signature',
  'x-hmac-signature',
  'x-cal-signature-256',
  'x-twilio-email-event-webhook-signature',
  'x-twilio-signature',
];

/**
 * Handles HTTP requests for anonymous webhooks.
 */
export const webhookHandler = asyncWrap(async (req: Request, res: Response) => {
  // At least one of the allowed signature headers must be present
  const hasSignatureHeader = SIGNATURE_HEADERS.some((header) => req.header(header));
  if (!hasSignatureHeader) {
    res.status(403).send('Missing required signature header');
    return;
  }

  const systemRepo = getSystemRepo();
  const id = req.params.id;
  const runAs = await systemRepo.readResource<ProjectMembership>('ProjectMembership', id);

  // The ProjectMembership must be for a Bot resource
  if (!runAs.profile.reference?.startsWith('Bot/')) {
    res.status(403).send('ProjectMembership must be for a Bot resource');
    return;
  }

  // The ProjectMembership must have an Access Policy
  if (!runAs.access && !runAs.accessPolicy) {
    res.status(403).send('ProjectMembership must have an Access Policy');
    return;
  }

  const bot = await systemRepo.readReference<Bot>(runAs.profile as Reference<Bot>);

  // The Bot must have a publicWebhook flag set to true
  if (!bot.publicWebhook) {
    res.status(403).send('Bot is not configured for public webhook access');
    return;
  }

  const headers = req.headers as Record<string, string>;

  // Execute the bot
  // If the request is HTTP POST, then the body is the input
  // If the request is HTTP GET, then the query string is the input
  const result = await executeBot({
    bot,
    runAs,
    input: req.method === 'POST' ? req.body : req.query,
    contentType: req.header('content-type') as string,
    headers,
  });

  if (isOperationOutcome(result)) {
    sendOutcome(res, result);
    return;
  }

  const responseBody = getResponseBodyFromResult(result);
  const outcome = result.success ? allOk : badRequest(result.logResult);

  if (result.returnValue?.resourceType === 'Binary') {
    await sendBinaryResponse(res, result.returnValue as Binary);
  } else {
    res.status(getStatus(outcome)).contentType(getResponseContentType(req)).send(responseBody);
  }
});

export const webhookRouter = Router();
webhookRouter.post('/:id', webhookHandler);
