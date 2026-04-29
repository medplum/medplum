// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { isOperationOutcome, singularize } from '@medplum/core';
import type { Bot, ProjectMembership, Reference } from '@medplum/fhirtypes';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { executeBot } from '../bots/execute';
import { sendBotResponse } from '../bots/utils';
import { sendOutcome } from '../fhir/outcomes';
import { getGlobalSystemRepo, getProjectSystemRepo } from '../fhir/repo';

/**
 * Handles HTTP requests for anonymous webhooks.
 * @param req - The request object
 * @param res - The response object
 */
export const webhookHandler = async (req: Request, res: Response): Promise<void> => {
  const globalSystemRepo = getGlobalSystemRepo();
  const membershipId = singularize(req.params.id) ?? '';
  const runAs = await globalSystemRepo.readResource<ProjectMembership>('ProjectMembership', membershipId);

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

  const systemRepo = await getProjectSystemRepo(runAs.project);
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

  await sendBotResponse(req, res, result);
};

export const webhookRouter = Router();
webhookRouter.post('/:id', webhookHandler);
