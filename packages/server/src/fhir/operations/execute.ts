// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { BotResponseStream, WithId } from '@medplum/core';
import {
  badRequest,
  isOk,
  isOperationOutcome,
  notFound,
  OperationOutcomeError,
  Operator,
  singularize,
} from '@medplum/core';
import type { Bot, OperationOutcome } from '@medplum/fhirtypes';
import type { Request, Response } from 'express';
import { executeBot } from '../../bots/execute';
import type { BotExecutionResult } from '../../bots/types';
import {
  getBotDefaultHeaders,
  getBotProjectMembership,
  getOutParametersFromResult,
  sendBotResponse,
} from '../../bots/utils';
import { getAuthenticatedContext } from '../../context';
import { searchUnique } from '../searchunique';
import { sendAsyncResponse } from './utils/asyncjobexecutor';

export const DEFAULT_VM_CONTEXT_TIMEOUT = 10000;

/**
 * Response headers that describe the connection or where the message ends.
 * These belong to the server: a streaming bot only supplies a body of unknown length.
 * If a bot could declare the end of its own response (i.e., "Content-Length: 0") and keep writing,
 * those bytes would be read as the response to the next request on a connection reused by a reverse proxy.
 */
const SERVER_CONTROLLED_HEADERS = new Set([
  'connection',
  'content-length',
  'keep-alive',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

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
  if (req.header('Prefer') === 'respond-async') {
    await sendAsyncResponse(req, res, async () => {
      const result = await executeOperation(req, res);
      if (isOperationOutcome(result) && !isOk(result)) {
        throw new OperationOutcomeError(result);
      }
      return getOutParametersFromResult(result);
    });
  } else {
    const result = await executeOperation(req, res);

    // If a response has already started (e.g. SSE streaming), we do not control the response, clean up and return.
    if (res.headersSent) {
      if (!res.writableEnded) {
        res.end();
      }
      return;
    }

    await sendBotResponse(req, res, result);
  }
};

async function executeOperation(req: Request, res: Response): Promise<OperationOutcome | BotExecutionResult> {
  const ctx = getAuthenticatedContext();

  // First read the bot as the user to verify access
  const userBot = await getBotForRequest(req);
  if (!userBot) {
    return badRequest('Must specify bot ID or identifier.');
  }

  // Then read the bot as system user to load extended metadata
  const bot = await ctx.systemRepo.readResource<Bot>('Bot', userBot.id);

  // Check if client accepts streaming and bot supports it
  const acceptsStreaming = bot.streamingEnabled && req.header('Accept')?.includes('text/event-stream');
  let responseStream: BotResponseStream | undefined = undefined;
  if (acceptsStreaming) {
    // Create a BotResponseStream that wraps the Express response.
    // Bot must call startStreaming() before write() to commit headers.
    responseStream = Object.assign(res, {
      startStreaming: (statusCode: number, headers: Record<string, string>): void => {
        if (!res.headersSent) {
          // Only final status codes: a 1xx response is not the end of the HTTP exchange
          if (!Number.isInteger(statusCode) || statusCode < 200 || statusCode > 599) {
            throw new OperationOutcomeError(badRequest(`Invalid streaming status code: ${statusCode}`));
          }
          res.status(statusCode);
          for (const [key, value] of Object.entries(headers)) {
            if (!SERVER_CONTROLLED_HEADERS.has(key.toLowerCase())) {
              res.setHeader(key, value);
            }
          }
          res.flushHeaders();
        }
      },
    }) as BotResponseStream;
  }

  // Execute the bot
  // If the request is HTTP POST, then the body is the input (the raw body, when Bot.rawBody is
  // set and available - see the matching json() middleware in app.ts)
  // If the request is HTTP GET, then the query string is the input
  let input: unknown = req.query;
  if (req.method === 'POST') {
    const rawBody = (req as any).rawBody as Buffer | undefined;
    input = bot.rawBody && rawBody ? rawBody.toString('utf8') : req.body;
  }

  const result = await executeBot({
    bot,
    runAs: await getBotProjectMembership(ctx, bot),
    runAsProject: ctx.project,
    requester: ctx.membership.profile,
    input,
    contentType: req.header('content-type') as string,
    headers: req.headers,
    traceId: ctx.traceId,
    defaultHeaders: getBotDefaultHeaders(req, bot),
    responseStream,
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
    const bot = await searchUnique<Bot>(
      ctx.repo,
      { resourceType: 'Bot', filters: [{ code: 'identifier', operator: Operator.EXACT, value: identifier }] },
      'Execute Bot by identifier'
    );

    if (!bot) {
      throw new OperationOutcomeError(notFound);
    }

    return bot;
  }

  // If no bot ID or identifier, return undefined
  return undefined;
}
