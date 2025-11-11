// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { OperationDefinition, ParametersParameter } from '@medplum/fhirtypes';
import type { Response as ExpressResponse } from 'express';
import { parseInputParameters } from './utils/parameters';

const operation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  id: 'ai',
  url: 'https://medplum.com/fhir/OperationDefinition/ai',
  name: 'ai',
  status: 'active',
  kind: 'operation',
  code: 'ai',
  resource: ['Parameters'],
  system: false,
  type: false,
  instance: false,
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
      name: 'apiKey',
      use: 'in',
      min: 1,
      max: '1',
      type: 'string',
      documentation: 'OpenAI API key',
    },
    {
      name: 'model',
      use: 'in',
      min: 1,
      max: '1',
      type: 'string',
      documentation: 'OpenAI model to use (e.g., gpt-4, gpt-3.5-turbo)',
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
      name: 'stream',
      use: 'in',
      min: 0,
      max: '1',
      type: 'boolean',
      documentation: 'Enable streaming responses via Server-Sent Events (optional)',
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
};

type AIOperationParameters = {
  messages: string;
  apiKey: string;
  model: string;
  tools?: string;
  stream?: boolean;
};

/**
 * Implements FHIR AI operation.
 * @param req - The incoming request.
 * @param res - Optional Express response for streaming support.
 * @returns The server response. For streaming, returns undefined after response is sent.
 */
export async function aiOperation(
  req: FhirRequest, 
  res?: ExpressResponse
): Promise<FhirResponse | undefined> {
  // const ctx = getAuthenticatedContext();
  // if (!ctx.project.features?.includes('ai')) {
  //   return [forbidden];
  // }

  const params = parseInputParameters<AIOperationParameters>(operation, req);
  const messages = JSON.parse(params.messages);

  if (!Array.isArray(messages)) {
    return [badRequest('Messages must be an array')];
  }

  const tools = params.tools ? JSON.parse(params.tools) : undefined;

  if (params.stream) {
    if (!res) {
      return [badRequest('Streaming requires Express response object')];
    }
    
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    await streamAIToClient(messages, params.apiKey, params.model, tools, res);
    res.end();
    
    // Return undefined for streaming - response already sent
    return undefined;
  }

  try {
    const result = await callAI(messages, params.apiKey, params.model, tools) as { content: string | null; tool_calls: any[] };
    return buildParametersResponse(result);
  } catch (error) {
    return [badRequest('Failed to call OpenAI API: ' + (error as Error).message)];
  }
}

/**
 * Streams AI response from OpenAI directly to the client via SSE.
 * This function bridges the OpenAI stream to the Express response without collecting.
 * Note: Tool calls are not supported in streaming mode.
 * @param messages - The conversation messages
 * @param apiKey - OpenAI API key
 * @param model - Model to use
 * @param tools - Optional tools array (ignored in streaming mode)
 * @param res - Express response to write SSE data to
 */
export async function streamAIToClient(
  messages: any[],
  apiKey: string,
  model: string,
  tools: any[] | undefined,
  res: ExpressResponse
): Promise<void> {
  const response = await callAI(messages, apiKey, model, tools, true) as Response;
  if (!response.body) {
    throw new Error('No response body available for streaming');
  }

  // Stream OpenAI response directly to client
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        res.write('data: [DONE]\n\n');
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();

          if (data === '[DONE]') {
            continue;
          }

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices[0]?.delta;

            if (!delta?.content) {
              continue;
            }

            // Forward content chunks to client
            res.write(`data: ${JSON.stringify({ content: delta.content })}\n\n`);
          } catch (e) {
            // Skip malformed JSON
            console.error('Error parsing SSE data:', e);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Builds a FHIR Parameters response from AI result.
 * @param result - The AI response
 * @param result.content - The text content from the AI
 * @param result.tool_calls - Array of tool calls from the AI
 * @returns FHIR response
 */
function buildParametersResponse(result: {
  content: string | null;
  tool_calls: any[];
}): FhirResponse {
  const parameters: ParametersParameter[] = [];

  if (result.content) {
    parameters.push({
      name: 'content',
      valueString: result.content,
    });
  }

  if (result.tool_calls?.length) {
    const toolCallsWithParsedArgs = result.tool_calls.map((tc) => ({
      id: tc.id,
      type: tc.type,
      function: {
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments),
      },
    }));

    parameters.push({
      name: 'tool_calls',
      valueString: JSON.stringify(toolCallsWithParsedArgs),
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

/**
 * Calls OpenAI API with optional streaming support.
 * @param messages - The conversation messages
 * @param apiKey - OpenAI API key
 * @param model - Model to use
 * @param tools - Optional tools array
 * @param stream - Whether to enable streaming
 * @returns For non-streaming: parsed response with content and tool calls. For streaming: raw Response object.
 */
export async function callAI(
  messages: any[],
  apiKey: string,
  model: string,
  tools?: any[],
  stream = false
): Promise<{ content: string | null; tool_calls: any[] } | Response> {
  const requestBody: any = {
    model: model,
    messages: messages,
  };

  if (stream) {
    requestBody.stream = true;
    // Don't include tools in streaming mode - tool calls not supported
  } else if (tools && tools.length > 0) {
    requestBody.tools = tools;
    requestBody.tool_choice = 'auto';
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  // For streaming, return raw response
  if (stream) {
    return response;
  }

  // For non-streaming, parse and return structured data
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const error: any = new Error(
      `OpenAI API error: ${response.status} ${response.statusText} - ${errorData?.error?.message || 'Unknown error'}`
    );
    error.statusCode = response.status;
    throw error;
  }

  const completion = await response.json();
  const message = completion.choices[0].message;

  return {
    content: message.content,
    tool_calls: message.tool_calls || [],
  };
}