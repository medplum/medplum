// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
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
 * Handles HTTP requests for anonymous webhooks.
 */
export const webhookHandler = asyncWrap(async (req: Request, res: Response) => {
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
