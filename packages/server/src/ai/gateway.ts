// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { InvokeModelCommand, InvokeModelWithResponseStreamCommand } from '@aws-sdk/client-bedrock-runtime';
import type { NextFunction, Request, Response } from 'express';
import { json, Router } from 'express';
import { getAuthenticatedContext } from '../context';
import { getLogger } from '../logger';
import { authenticateRequest } from '../oauth/middleware';
import {
  AuditEventOutcome,
  createAuditEvent,
  logAuditEvent,
  OperationInteraction,
  RestfulOperationType,
} from '../util/auditevent';
import { isSupportedAiCaller } from './access';
import type { AnthropicError } from './bedrock';
import { anthropicErrorType, getBedrockClient, toAnthropicError, toBedrockBody } from './bedrock';

export const ANTHROPIC_GATEWAY_PATHS = [
  '/ai/anthropic',
  '/api/ai/anthropic',
  '/projects/:projectId/ai/anthropic',
  '/api/projects/:projectId/ai/anthropic',
];

/** An Anthropic model ID on Bedrock, optionally with a cross-region inference profile prefix. */
const BEDROCK_ANTHROPIC_MODEL = /^((us|eu|apac|global)\.)?anthropic\.claude-[a-z0-9.:-]+$/;

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
 * Creates the Anthropic Messages front door of the AI gateway, served by AWS Bedrock.
 * @param region - The AWS region to call Bedrock in.
 * @returns The router.
 */
export function createAnthropicGatewayRouter(region: string): Router {
  const router = Router().use(authenticateRequest);
  router.use(json({ limit: '20mb' }));
  router.post('/v1/messages', (req, res) => handleMessages(region, req, res));
  return router;
}

async function handleMessages(region: string, req: Request, res: Response): Promise<void> {
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
  if (!BEDROCK_ANTHROPIC_MODEL.test(model)) {
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

  const command = {
    modelId: model,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(toBedrockBody(body, req.get('anthropic-beta'))),
  };

  let status = 200;
  let usage: Usage = {};
  try {
    const client = getBedrockClient(region);
    if (stream) {
      const output = await client.send(new InvokeModelWithResponseStreamCommand(command), {
        abortSignal: abortController.signal,
      });
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();
      usage = await streamToClient(output.body, res);
    } else {
      const output = await client.send(new InvokeModelCommand(command), { abortSignal: abortController.signal });
      const text = output.body.transformToString();
      usage = readUsage(JSON.parse(text));
      res.status(200).type('application/json').send(text);
    }
  } catch (err) {
    const error = toAnthropicError(err);
    status = error.status;
    getLogger().warn('AI gateway request failed', { model, status, error: err });
    if (res.headersSent) {
      writeEvent(res, 'error', JSON.stringify(error.body));
      res.end();
    } else {
      res.status(status).json(error.body);
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
 * Re-encodes a Bedrock response stream as Anthropic server-sent events.
 * Each Bedrock chunk is one Anthropic stream event whose `type` is the SSE event name.
 * @param body - The Bedrock response stream.
 * @param res - The response to write to.
 * @returns The token usage reported in the stream.
 */
async function streamToClient(
  body: AsyncIterable<{ chunk?: { bytes?: Uint8Array } }> | undefined,
  res: Response
): Promise<Usage> {
  const decoder = new TextDecoder();
  const usage: Usage = {};
  for await (const event of body ?? []) {
    if (!event.chunk?.bytes) {
      continue;
    }
    const data = decoder.decode(event.chunk.bytes);
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
