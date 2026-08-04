// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest, forbidden, isOk, normalizeErrorString, OperationOutcomeError } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { ParametersParameter } from '@medplum/fhirtypes';
import type { Response as ExpressResponse, Request } from 'express';
import type { AiContext, AiResult } from '../../ai/openai';
import { callOpenAi, streamOpenAi } from '../../ai/openai';
import { getAuthenticatedContext } from '../../context';
import { getLogger } from '../../logger';
import { sendOutcome } from '../outcomes';
import { sendFhirResponse } from '../response';
import { makeOperationDefinition } from './definitions';
import { parseInputParameters } from './utils/parameters';

const operation = makeOperationDefinition(
  { scope: 'system' },
  {
    id: 'ai',
    url: 'https://medplum.com/fhir/OperationDefinition/ai',
    name: 'ai',
    code: 'ai',
    parameter: [
      {
        name: 'messages',
        use: 'in',
        min: 1,
        max: '1',
        type: 'string',
        documentation: 'JSON string containing the conversation messages array',
      },
      {
        name: 'model',
        use: 'in',
        min: 1,
        max: '1',
        type: 'string',
        documentation:
          'Model to use (e.g., gpt-4, gpt-3.5-turbo). Any OpenAI-compatible model name is accepted when LLM_BASE_URL points to a LiteLLM proxy.',
      },
      {
        name: 'tools',
        use: 'in',
        min: 0,
        max: '1',
        type: 'string',
        documentation: 'JSON string containing the tools array (optional)',
      },
      {
        name: 'temperature',
        use: 'in',
        min: 0,
        max: '1',
        type: 'decimal',
        documentation: 'Sampling temperature (optional)',
      },
      {
        name: 'content',
        use: 'out',
        min: 0,
        max: '1',
        type: 'string',
        documentation: 'AI response content',
      },
      {
        name: 'tool_calls',
        use: 'out',
        min: 0,
        max: '1',
        type: 'string',
        documentation: 'JSON string containing tool calls array',
      },
    ],
  }
);

type AIOperationParameters = {
  messages: string;
  model: string;
  tools?: string;
  temperature?: number;
};

export const aiOperationHandler = async (req: Request, res: ExpressResponse): Promise<void> => {
  const fhirRequest: FhirRequest = {
    method: 'POST',
    url: req.url,
    pathname: '',
    params: {},
    query: Object.create(null),
    body: req.body ?? {},
    headers: req.headers,
  };
  const acceptsStreaming = req.header('Accept')?.includes('text/event-stream');
  const result = await aiOperation(fhirRequest, res, acceptsStreaming);

  // If streaming, response already sent
  if (!result) {
    return;
  }

  // Non-streaming response
  if (result.length === 1) {
    if (!isOk(result[0])) {
      throw new OperationOutcomeError(result[0]);
    }
    sendOutcome(res, result[0]);
    return;
  }

  await sendFhirResponse(req, res, result[0], result[1], result[2]);
};

/**
 * Implements FHIR AI operation.
 * Supports both regular and streaming responses based on Accept header.
 * @param req - The incoming request.
 * @param res - Optional Express response for streaming support.
 * @param acceptsStreaming - Whether the client accepts streaming.
 * @returns The server response. For streaming, returns undefined after response is sent.
 */
export async function aiOperation(
  req: FhirRequest,
  res?: ExpressResponse,
  acceptsStreaming: boolean = false
): Promise<FhirResponse | undefined> {
  const ctx = getAuthenticatedContext();
  if (!ctx.project.features?.includes('ai')) {
    return [forbidden];
  }

  const apiKey = ctx.project.secret?.find((s) => s.name === 'OPENAI_API_KEY')?.valueString;
  if (!apiKey) {
    return [badRequest('OpenAI API key not configured in project secrets')];
  }

  let baseUrl = ctx.project.secret?.find((s) => s.name === 'LLM_BASE_URL')?.valueString ?? 'https://api.openai.com/v1';
  // Strip any trailing slashes without a regex to avoid backtracking concerns
  while (baseUrl.endsWith('/')) {
    baseUrl = baseUrl.slice(0, -1);
  }

  const params = parseInputParameters<AIOperationParameters>(operation, req);
  let messages: any[];
  try {
    messages = JSON.parse(params.messages);
  } catch (error) {
    return [badRequest(normalizeErrorString(error))];
  }

  if (!Array.isArray(messages)) {
    return [badRequest('Messages must be an array')];
  }

  let tools: any[] | undefined;
  if (params.tools) {
    try {
      tools = JSON.parse(params.tools);
    } catch (error) {
      return [badRequest(normalizeErrorString(error))];
    }
  }

  const context: AiContext = {
    messages,
    model: params.model,
    tools,
    temperature: params.temperature,
    apiKey,
    baseUrl,
  };

  if (acceptsStreaming) {
    if (!res) {
      return [badRequest('Streaming requires Express response object')];
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    await streamToClient(context, res);
    res.end();

    // Return undefined for streaming - response already sent
    return undefined;
  }

  try {
    return buildParametersResponse(await callOpenAi(context));
  } catch (error) {
    return [badRequest('Failed to call AI API: ' + (error as Error).message)];
  }
}

/**
 * Writes a streamed AI response to the client as SSE.
 *
 * Owns the wire contract the client reads — `{ content }` frames as text arrives, then at most
 * one `{ tool_calls }` frame, then `[DONE]`. The provider decides what events occur; this
 * decides how they are framed, so a second provider needs no knowledge of either SSE or Express.
 *
 * Never throws. The 200 and the SSE headers are already on the wire by the time this runs, so a
 * failure cannot become an HTTP error status — letting one escape would leave the client waiting
 * on a stream that never terminates. Failures are reported in-band as an `{ error }` frame and
 * the stream is always closed with `[DONE]`.
 * @param context - The request and its credentials
 * @param res - Express response to write SSE data to
 */
async function streamToClient(context: AiContext, res: ExpressResponse): Promise<void> {
  try {
    await streamOpenAi(context, (event) => {
      if (event.type === 'content') {
        res.write(`data: ${JSON.stringify({ content: event.text })}\n\n`);
      } else {
        res.write(`data: ${JSON.stringify({ tool_calls: event.toolCalls })}\n\n`);
      }
      res.flush();
    });
  } catch (error) {
    getLogger().error('AI streaming failed', { error });
    res.write(`data: ${JSON.stringify({ error: normalizeErrorString(error) })}\n\n`);
  }
  res.write('data: [DONE]\n\n');
  res.flush();
}

/**
 * Builds a FHIR Parameters response from an AI result.
 * @param result - The AI response, with tool call arguments already parsed
 * @returns FHIR response
 */
function buildParametersResponse(result: AiResult): FhirResponse {
  const parameters: ParametersParameter[] = [];

  if (result.content) {
    parameters.push({
      name: 'content',
      valueString: result.content,
    });
  }

  if (result.toolCalls.length > 0) {
    parameters.push({
      name: 'tool_calls',
      valueString: JSON.stringify(result.toolCalls),
    });
  }

  return [
    allOk,
    {
      resourceType: 'Parameters',
      parameter: parameters,
    },
  ];
}
