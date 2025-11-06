// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest, forbidden } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { OperationDefinition, ParametersParameter } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
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
 * @returns The server response.
 */
export async function aiOperation(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  if (!ctx.project.features?.includes('ai')) {
    return [forbidden];
  }

  const params = parseInputParameters<AIOperationParameters>(operation, req);
  const messages = JSON.parse(params.messages);

  if (!Array.isArray(messages)) {
    return [badRequest('Messages must be an array')];
  }

  const tools = params.tools ? JSON.parse(params.tools) : undefined;

  if (params.stream) {
    const result = await collectStreamedResponse(messages, params.apiKey, params.model, tools);
    return buildParametersResponse(result);
  } else {
    const result = await callAI(messages, params.apiKey, params.model, tools);
    return buildParametersResponse(result);
  }
}

/**
 * Builds a FHIR Parameters response from AI result.
 * @param result - The AI response
 * @param result.content - The text content from the AI
 * @param result.tool_calls - Array of tool calls from the AI
 * @returns FHIR response
 */
function buildParametersResponse(result: { content: string | null; tool_calls: any[] }): FhirResponse {
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
 * Collects a streamed response from OpenAI API.
 * This function uses streaming internally but collects the full response before returning.
 * Note: Tool calls are not supported in streaming mode - use non-streaming for tool calls.
 * @param messages - The conversation messages
 * @param apiKey - OpenAI API key
 * @param model - Model to use
 * @param tools - Optional tools array (ignored in streaming mode)
 * @returns The collected AI response (content only, tool_calls will be empty)
 */
export async function collectStreamedResponse(
  messages: any[],
  apiKey: string,
  model: string,
  tools?: any[]
): Promise<{ content: string | null; tool_calls: any[] }> {
  const response = await fetchOpenAI(messages, apiKey, model, tools, true);

  if (!response.body) {
    throw new Error('No response body available for streaming');
  }

  // Read and accumulate the stream (content only, tool calls not supported in streaming)
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let buffer = '';
  let contentAccumulator = '';

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
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

            if (!delta) {
              continue;
            }

            // Handle content chunks
            if (delta.content) {
              contentAccumulator += delta.content;
            }
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

  return {
    content: contentAccumulator || null,
    tool_calls: [],
  };
}

export async function callAI(
  messages: any[],
  apiKey: string,
  model: string,
  tools?: any[]
): Promise<{ content: string | null; tool_calls: any[] }> {
  const response = await fetchOpenAI(messages, apiKey, model, tools, false);
  const completion = await response.json();
  const message = completion.choices[0].message;

  return {
    content: message.content,
    tool_calls: message.tool_calls || [],
  };
}

/**
 * Makes a request to OpenAI API.
 * @param messages - The conversation messages
 * @param apiKey - OpenAI API key
 * @param model - Model to use
 * @param tools - Optional tools array
 * @param stream - Whether to enable streaming
 * @returns The fetch Response object
 */
async function fetchOpenAI(
  messages: any[],
  apiKey: string,
  model: string,
  tools?: any[],
  stream = false
): Promise<Response> {
  const requestBody: any = {
    model: model,
    messages: messages,
  };

  if (stream) {
    requestBody.stream = true;
  }

  if (tools && tools.length > 0) {
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

  return response;
}
