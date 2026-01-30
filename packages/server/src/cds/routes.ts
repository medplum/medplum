// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest, ContentType, getStatus, Operator } from '@medplum/core';
import type { Bot } from '@medplum/fhirtypes';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { executeBot } from '../bots/execute';
import { getBotDefaultHeaders, getResponseBodyFromResult } from '../bots/utils';
import { getAuthenticatedContext } from '../context';
import { authenticateRequest } from '../oauth/middleware';

// CDS Hooks
// https://cds-hooks.hl7.org/

export const cdsRouter = Router().use(authenticateRequest);

// Discovery: https://cds-hooks.hl7.org/#discovery
cdsRouter.get('/', async (req: Request, res: Response) => {
  const { repo } = getAuthenticatedContext();

  // The CDS Hooks spec does not define pagination for discovery
  // Most servers will have under 10 CDS services, so we set a high max count.
  const maxCount = 100;

  const bots = await repo.searchResources<Bot>({
    resourceType: 'Bot',
    filters: [{ code: 'cds-hook', operator: Operator.MISSING, value: 'false' }],
    count: maxCount,
  });

  // All bots will have a cdsService defined due to the search filter
  const response = {
    services: bots.map((bot) => ({
      id: bot.id,
      hook: bot.cdsService?.hook,
      title: bot.cdsService?.title,
      description: bot.cdsService?.description,
      usageRequirements: bot.cdsService?.usageRequirements,
      prefetch: bot.cdsService?.prefetch
        ? Object.fromEntries(bot.cdsService.prefetch.map(({ key, query }) => [key, query]))
        : undefined,
    })),
  };

  res.status(200).json(response);
});

// Calling a CDS Service: https://cds-hooks.hl7.org/#calling-a-cds-service
cdsRouter.post('/:id', async (req: Request, res: Response) => {
  const ctx = getAuthenticatedContext();
  const { id } = req.params as { id: string };

  // Read the bot by ID
  // The `repo.readResource` method can throw on "Not Found", "Gone", "Forbidden", etc.
  // We rely on existing middleware to handle those errors appropriately.
  const userBot = await ctx.repo.readResource<Bot>('Bot', id);
  if (!userBot.cdsService) {
    res.sendStatus(404);
    return;
  }

  // Read the bot again as system repo to get full bot details
  const bot = await ctx.systemRepo.readResource<Bot>('Bot', id);

  // Execute the bot
  // This also handles logging, auditing, etc.
  const result = await executeBot({
    bot,
    runAs: ctx.membership,
    requester: ctx.membership.profile,
    input: req.body,
    contentType: ContentType.JSON,
    headers: req.headers,
    traceId: ctx.traceId,
    defaultHeaders: getBotDefaultHeaders(req, bot),
  });

  const responseBody = getResponseBodyFromResult(result);
  const outcome = result.success ? allOk : badRequest(result.logResult);
  res.status(getStatus(outcome)).type(ContentType.JSON).send(responseBody);
});
