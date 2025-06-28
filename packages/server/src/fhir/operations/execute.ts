import {
  allOk,
  badRequest,
  getStatus,
  isOk,
  isOperationOutcome,
  isResource,
  OperationOutcomeError,
  Operator,
  WithId,
} from '@medplum/core';
import { Bot, OperationOutcome } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { asyncWrap } from '../../async';
import { executeBot } from '../../bots/execute';
import { BotExecutionResult } from '../../bots/types';
import {
  getBotDefaultHeaders,
  getBotProjectMembership,
  getOutParametersFromResult,
  getResponseBodyFromResult,
  getResponseContentType,
} from '../../bots/utils';
import { getAuthenticatedContext } from '../../context';
import { sendOutcome } from '../outcomes';
import { getSystemRepo } from '../repo';
import { sendFhirResponse } from '../response';
import { sendAsyncResponse } from './utils/asyncjobexecutor';

export const DEFAULT_VM_CONTEXT_TIMEOUT = 10000;

/**
 * Handles HTTP requests for the execute operation.
 * First reads the bot and makes sure it is valid and the user has access to it.
 * Then executes the bot.
 * Returns the outcome of the bot execution.
 * Assumes that input content-type is output content-type.
 */
export const executeHandler = asyncWrap(async (req: Request, res: Response) => {
  if (req.header('Prefer') === 'respond-async') {
    await sendAsyncResponse(req, res, async () => {
      const result = await executeOperation(req);
      if (isOperationOutcome(result) && !isOk(result)) {
        throw new OperationOutcomeError(result);
      }
      return getOutParametersFromResult(result);
    });
  } else {
    const result = await executeOperation(req);
    if (isOperationOutcome(result)) {
      sendOutcome(res, result);
      return;
    }

    const responseBody = getResponseBodyFromResult(result);
    const outcome = result.success ? allOk : badRequest(result.logResult);

    if (isResource(responseBody, 'Binary')) {
      await sendFhirResponse(req, res, outcome, responseBody);
      return;
    }

    // Send the response
    // The body parameter can be a Buffer object, a String, an object, Boolean, or an Array.
    res.status(getStatus(outcome)).type(getResponseContentType(req)).send(responseBody);
  }
});

async function executeOperation(req: Request): Promise<OperationOutcome | BotExecutionResult> {
  const ctx = getAuthenticatedContext();
  // First read the bot as the user to verify access
  const userBot = await getBotForRequest(req);
  if (!userBot) {
    return badRequest('Must specify bot ID or identifier.');
  }

  // Then read the bot as system user to load extended metadata
  const systemRepo = getSystemRepo();
  const bot = await systemRepo.readResource<Bot>('Bot', userBot.id);

  // Execute the bot
  // If the request is HTTP POST, then the body is the input
  // If the request is HTTP GET, then the query string is the input
  const result = await executeBot({
    bot,
    runAs: await getBotProjectMembership(ctx, bot),
    input: req.method === 'POST' ? req.body : req.query,
    contentType: req.header('content-type') as string,
    headers: req.headers,
    traceId: ctx.traceId,
    defaultHeaders: getBotDefaultHeaders(req, bot),
  });

  return result;
}

/**
 * Returns the Bot for the execute request.
 * If using "/Bot/:id/$execute", then the bot ID is read from the path parameter.
 * If using "/Bot/$execute?identifier=...", then the bot is searched by identifier.
 * Otherwise, returns undefined.
 * @param req - The HTTP request.
 * @returns The bot, or undefined if not found.
 */
async function getBotForRequest(req: Request): Promise<WithId<Bot> | undefined> {
  const ctx = getAuthenticatedContext();
  // Prefer to search by ID from path parameter
  const { id } = req.params;
  if (id) {
    return ctx.repo.readResource<Bot>('Bot', id);
  }

  // Otherwise, search by identifier
  const { identifier } = req.query;
  if (identifier && typeof identifier === 'string') {
    return ctx.repo.searchOne<Bot>({
      resourceType: 'Bot',
      filters: [{ code: 'identifier', operator: Operator.EXACT, value: identifier }],
    });
  }

  // If no bot ID or identifier, return undefined
  return undefined;
}
