// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest, ContentType, getStatus, Operator } from '@medplum/core';
import type { Bot } from '@medplum/fhirtypes';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { executeBot } from '../bots/execute';
import { getBotDefaultHeaders, getResponseBodyFromResult, getResponseContentType } from '../bots/utils';
import { getAuthenticatedContext } from '../context';
import { authenticateRequest } from '../oauth/middleware';

// CDS Hooks
// https://cds-hooks.hl7.org/

export const cdsRouter = Router().use(authenticateRequest);

// Discovery: https://cds-hooks.hl7.org/#discovery
cdsRouter.get('/', async (_req: Request, res: Response) => {
  const { repo } = getAuthenticatedContext();
  repo.setExtendedMode(true);

  const bots = await repo.searchResources<Bot>({
    resourceType: 'Bot',
    filters: [{ code: 'cds-hook', operator: Operator.PRESENT, value: 'true' }],
    count: 1000, // The CDS Hooks spec does not define pagination for discovery
  });

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
  const { id } = req.params as { id: string };

  const ctx = getAuthenticatedContext();
  ctx.repo.setExtendedMode(true); // Need extended mode for meta.project

  const bot = await ctx.repo.readResource<Bot>('Bot', id);

  if (!bot.cdsService) {
    res.sendStatus(404);
    return;
  }

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
  res.status(getStatus(outcome)).type(getResponseContentType(req)).send(responseBody);
});
