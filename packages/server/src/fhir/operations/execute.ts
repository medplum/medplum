// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import {
  allOk,
  badRequest,
  getStatus,
  isOk,
  isOperationOutcome,
  isResource,
  normalizeErrorString,
  notFound,
  OperationOutcomeError,
  Operator,
  singularize,
} from '@medplum/core';
import type { Bot, OperationOutcome } from '@medplum/fhirtypes';
import type { Request, Response } from 'express';
import { executeBot, executeBotStreaming } from '../../bots/execute';
import type { BotExecutionResult, StreamingCallback, StreamingChunk } from '../../bots/types';
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
 * @param req - The request object
 * @param res - The response object
 */
export const executeHandler = async (req: Request, res: Response): Promise<void> => {
  // Check if client accepts streaming
  const acceptsStreaming = req.header('Accept')?.includes('text/event-stream');

  if (acceptsStreaming) {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    await executeOperationStreaming(req, res);
    res.end();
    return;
  }

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
};

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
    requester: ctx.membership.profile,
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
 * @returns The bot, or undefined if no ID or identifier is provided.
 */
async function getBotForRequest(req: Request): Promise<WithId<Bot> | undefined> {
  const ctx = getAuthenticatedContext();
  // Prefer to search by ID from path parameter
  const id = singularize(req.params.id);
  if (id) {
    return ctx.repo.readResource<Bot>('Bot', id);
  }

  // Otherwise, search by identifier
  const { identifier } = req.query;
  if (identifier && typeof identifier === 'string') {
    const bot = await ctx.repo.searchOne<Bot>({
      resourceType: 'Bot',
      filters: [{ code: 'identifier', operator: Operator.EXACT, value: identifier }],
    });

    if (!bot) {
      throw new OperationOutcomeError(notFound);
    }

    return bot;
  }

  // If no bot ID or identifier, return undefined
  return undefined;
}

/**
 * Handles streaming execution of a bot operation.
 * @param req - The HTTP request.
 * @param res - The HTTP response.
 */
async function executeOperationStreaming(req: Request, res: Response): Promise<void> {
  const ctx = getAuthenticatedContext();

  // First read the bot as the user to verify access
  const userBot = await getBotForRequest(req);
  if (!userBot) {
    res.write('data: {"error": true, "message": "Must specify bot ID or identifier"}\n\n');
    return;
  }

  // Then read the bot as system user to load extended metadata
  const systemRepo = getSystemRepo();
  const bot = await systemRepo.readResource<Bot>('Bot', userBot.id);

  // Create streaming callback
  const streamingCallback: StreamingCallback = async (chunk: StreamingChunk) => {
    try {
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      if (typeof (res as any).flush === 'function') {
        (res as any).flush();
      }
    } catch (err) {
      ctx.logger.error('Error writing stream chunk', { error: err });
    }
  };

  try {
    // Execute the bot with streaming
    const result = await executeBotStreaming(
      {
        bot,
        runAs: await getBotProjectMembership(ctx, bot),
        requester: ctx.membership.profile,
        input: req.method === 'POST' ? req.body : req.query,
        contentType: req.header('content-type') as string,
        headers: req.headers,
        traceId: ctx.traceId,
        defaultHeaders: getBotDefaultHeaders(req, bot),
      },
      streamingCallback
    );

    // Check if execution failed and send error event
    if (!result.success) {
      res.write(
        `data: ${JSON.stringify({
          error: true,
          message: result.logResult,
        })}\n\n`
      );
      return;
    }

    // Send completion event
    res.write('data: [DONE]\n\n');
  } catch (err) {
    // Send error event
    res.write(
      `data: ${JSON.stringify({
        error: true,
        message: normalizeErrorString(err),
      })}\n\n`
    );
  }
}
