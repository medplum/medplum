// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getStatus, normalizeErrorString } from '@medplum/core';
import type { OperationOutcome } from '@medplum/fhirtypes';
import type { NextFunction, Request, Response } from 'express';
import { json, Router } from 'express';
import { BedrockAnthropicProvider } from '../../cloud/aws/bedrock';
import { getConfig } from '../../config/loader';
import { closeRequestContext, getAuthenticatedContext } from '../../context';
import { getLogger } from '../../logger';
import { authenticateRequest } from '../../oauth/middleware';
import {
  AuditEventOutcome,
  createAuditEvent,
  logAuditEvent,
  OperationInteraction,
  RestfulOperationType,
} from '../../util/auditevent';
import { isSupportedAiCaller } from '../access';
import type { AnthropicError, AnthropicMessagesProvider } from './types';
import { anthropicErrorType } from './types';

export const ANTHROPIC_GATEWAY_PATHS = [
  '/ai/anthropic',
  '/api/ai/anthropic',
  '/projects/:projectId/ai/anthropic',
  '/api/projects/:projectId/ai/anthropic',
];

/** The status recorded when the client closes the connection before the response completes. */
const CLIENT_CLOSED_REQUEST = 499;

/** Token usage reported by the model. */
interface Usage {
  inputTokens?: number;
  outputTokens?: number;
}

/**
 * Lets clients that send their Medplum access token as `x-api-key`, the Anthropic SDK default,
 * authenticate like a Bearer token. Must run before the request context is attached.
 * @param req - The incoming request.
 * @param _res - The response.
 * @param next - The next handler.
 */
export function apiKeyAsBearer(req: Request, _res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'];
  if (!req.headers.authorization && typeof apiKey === 'string' && apiKey) {
    req.headers.authorization = `Bearer ${apiKey}`;
  }
  next();
}

/**
 * Creates the Anthropic Messages front door of the AI gateway.
 * @returns The router.
 */
export function createAnthropicGatewayRouter(): Router {
  const provider = new BedrockAnthropicProvider(getConfig().awsRegion);
  const router = Router().use(authenticateRequest);
  router.use(json({ limit: '20mb' }));
  router.post('/v1/messages', (req, res) => handleMessages(provider, req, res));
  router.use(gatewayErrorHandler);
  return router;
}

/**
 * Returns authentication and body parsing errors in the Anthropic error shape.
 * Other errors are left to the global error handler.
 * @param err - The error.
 * @param _req - The request.
 * @param res - The response.
 * @param next - The next handler.
 */
function gatewayErrorHandler(err: unknown, _req: Request, res: Response, next: NextFunction): void {
  const e = err as { outcome?: OperationOutcome; type?: string };
  let status: number | undefined;
  let message = '';
  if (e.outcome) {
    status = getStatus(e.outcome);
    message = normalizeErrorString(e.outcome);
  } else if (e.type === 'entity.parse.failed') {
    status = 400;
    message = 'Content could not be parsed';
  } else if (e.type === 'entity.too.large') {
    status = 413;
    message = 'Request body too large';
  }
  if (status === undefined || status >= 500 || res.headersSent) {
    next(err);
    return;
  }
  closeRequestContext();
  sendError(res, status, message);
}

async function handleMessages(provider: AnthropicMessagesProvider, req: Request, res: Response): Promise<void> {
  const ctx = getAuthenticatedContext();
  if (!ctx.project.features?.includes('ai-gateway') || !isSupportedAiCaller(ctx.profile.reference, ctx.login)) {
    sendError(res, 403, 'The AI gateway is not enabled for this account');
    return;
  }

  const body = req.body as Record<string, unknown> | undefined;
  const model = body?.model;
  if (!body || typeof model !== 'string') {
    sendError(res, 400, 'model is required');
    return;
  }
  if (!provider.isModelSupported(model)) {
    sendError(res, 400, `Model not available: ${model}`);
    return;
  }

  const startTime = Date.now();
  const stream = body.stream === true;
  const abortController = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished) {
      abortController.abort();
    }
  });

  const { model: _model, stream: _stream, ...params } = body;
  const betas = (req.get('anthropic-beta') ?? '')
    .split(',')
    .map((b) => b.trim())
    .filter(Boolean);

  let status = 200;
  let usage: Usage = {};
  try {
    if (stream) {
      const events = await provider.streamMessage(model, params, betas, abortController.signal);
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();
      usage = await streamToClient(events, res);
    } else {
      const text = await provider.createMessage(model, params, betas, abortController.signal);
      usage = readUsage(JSON.parse(text));
      res.status(200).type('application/json').send(text);
    }
  } catch (err) {
    if (abortController.signal.aborted) {
      status = CLIENT_CLOSED_REQUEST;
    } else {
      const error = provider.toError(err);
      status = error.status;
      if (error.misconfigured) {
        getLogger().error('AI gateway misconfigured', { model, status, error: err });
      } else {
        getLogger().warn('AI gateway request failed', { model, status, error: err });
      }
      if (res.headersSent) {
        writeEvent(res, 'error', JSON.stringify(error.body));
        res.end();
      } else {
        res.status(status).json(error.body);
      }
    }
  }

  const durationMs = Date.now() - startTime;
  getLogger().info('AI gateway request', { model, stream, status, durationMs, ...usage });
  logAuditEvent(
    createAuditEvent(
      RestfulOperationType,
      OperationInteraction,
      ctx.project,
      ctx.profile,
      req.ip,
      status === 200 ? AuditEventOutcome.Success : AuditEventOutcome.MinorFailure,
      { description: `AI gateway messages ${model}`, durationMs }
    )
  );
}

/**
 * Writes Anthropic stream events as server-sent events.
 * The `type` of each event is the SSE event name.
 * @param events - The Anthropic stream events as JSON text.
 * @param res - The response to write to.
 * @returns The token usage reported in the stream.
 */
async function streamToClient(events: AsyncIterable<string>, res: Response): Promise<Usage> {
  const usage: Usage = {};
  for await (const data of events) {
    const parsed = JSON.parse(data) as { type: string; message?: unknown; usage?: unknown };
    if (parsed.type === 'message_start') {
      usage.inputTokens = readUsage(parsed.message).inputTokens;
    } else if (parsed.type === 'message_delta') {
      usage.outputTokens = readUsage(parsed).outputTokens;
    }
    writeEvent(res, parsed.type, data);
  }
  res.end();
  return usage;
}

function writeEvent(res: Response, event: string, data: string): void {
  res.write(`event: ${event}\ndata: ${data}\n\n`);
  res.flush();
}

function readUsage(message: unknown): Usage {
  const usage = (message as { usage?: { input_tokens?: number; output_tokens?: number } } | undefined)?.usage;
  return { inputTokens: usage?.input_tokens, outputTokens: usage?.output_tokens };
}

function sendError(res: Response, status: number, message: string): void {
  const body: AnthropicError = { type: 'error', error: { type: anthropicErrorType(status), message } };
  res.status(status).json(body);
}
