import { allOk, badRequest, getStatus, isOperationOutcome } from '@medplum/core';
import { Bot, OperationOutcome, ProjectMembership, Reference } from '@medplum/fhirtypes';
import { Request, Response, Router } from 'express';
import { asyncWrap } from '../async';
import { executeBot } from '../fhir/operations/execute';
import { getSystemRepo } from '../fhir/repo';

/**
 * Allowed signature headers are:
 *
 *   - `X-Signature` - standard generic signature header
 *   - `X-HMAC-Signature` - standard HMAC signature header
 *      - See: https://consensus.stoplight.io/docs/fax-services/1c4979f1d8ca0-fax-inbound-notification
 *   - `X-Cal-Signature-256` - Cal.com specific signature header
 *      - See: https://cal.com/docs/developing/guides/automation/webhooks
 *   - `X-Twilio-Email-Event-Webhook-Signature` - Twilio specific signature header
 *     - See: https://www.twilio.com/docs/sendgrid/for-developers/tracking-events/getting-started-event-webhook-security-features
 */
const SIGNATURE_HEADERS = [
  'x-signature',
  'x-hmac-signature',
  'x-cal-signature-256',
  'x-twilio-email-event-webhook-signature',
];

/**
 * Handles HTTP requests for anonymous webhooks.
 */
export const webhookHandler = asyncWrap(async (req: Request, res: Response) => {
  // At least one of the allowed signature headers must be present
  const hasSignatureHeader = SIGNATURE_HEADERS.some((header) => req.header(header));
  if (!hasSignatureHeader) {
    res.status(400).send('Missing required signature header');
    return;
  }

  const systemRepo = getSystemRepo();
  const id = req.params.id;
  const runAs = await systemRepo.readResource<ProjectMembership>('ProjectMembership', id);

  // The ProjectMembership must be for a Bot resource
  if (!runAs.profile.reference?.startsWith('Bot/')) {
    res.status(400).send('ProjectMembership must be for a Bot resource');
    return;
  }

  const bot = await systemRepo.readReference<Bot>(runAs.profile as Reference<Bot>);
  const defaultHeaders = req.headers as Record<string, string>;

  // Execute the bot
  // If the request is HTTP POST, then the body is the input
  // If the request is HTTP GET, then the query string is the input
  const result = await executeBot({
    bot,
    runAs,
    input: req.method === 'POST' ? req.body : req.query,
    contentType: req.header('content-type') as string,
    defaultHeaders,
  });

  // Unlike normal Bot $execute operations, we don't want to return the result
  // This is an unauthenticated webhook, so we just return a 200 OK response
  let outcome: OperationOutcome;
  if (isOperationOutcome(result)) {
    outcome = result;
  } else if (result.success) {
    outcome = allOk;
  } else {
    outcome = badRequest(result.logResult);
  }
  res.sendStatus(getStatus(outcome));
});

export const webhookRouter = Router();
webhookRouter.get('/:id', webhookHandler);
webhookRouter.post('/:id', webhookHandler);
