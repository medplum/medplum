// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { OperationDefinition } from '@medplum/fhirtypes';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';

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
  messages?: string;
  apiKey?: string;
  model?: string;
};

/**
 * Implements FHIR AI operation.
 * @param req - The incoming request.
 * @returns The server response.
 */
export async function aiOperation(req: FhirRequest): Promise<FhirResponse> {
  const params = parseInputParameters<AIOperationParameters>(operation, req);

  if (!params.apiKey) {
    return [badRequest('API key is required')];
  }

  if (!params.model) {
    return [badRequest('Model is required')];
  }

  if (!params.messages) {
    return [badRequest('Messages are required')];
  }

  const messages = JSON.parse(params.messages);

  if (!Array.isArray(messages)) {
    return [badRequest('Messages must be an array')];
  }

  try {
    const result = await callAI(messages, params.apiKey, params.model);

    const output: Record<string, any> = {
      tool_calls: result.tool_calls ? JSON.stringify(result.tool_calls) : '[]',
    };

    if (result.content !== null) {
      output.content = result.content;
    }

    return [allOk, buildOutputParameters(operation, output)];
  } catch (error) {
    return [badRequest(`AI operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`)];
  }
}

const fhirTools = [
  {
    type: 'function',
    function: {
      name: 'fhir_request',
      description:
        'Make a FHIR request to the Medplum server. Use this to search, read, create, update, or delete FHIR resources.',
      parameters: {
        type: 'object',
        properties: {
          method: {
            type: 'string',
            enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
            description: 'HTTP method for the FHIR request',
          },
          path: {
            type: 'string',
            description: 'FHIR path (e.g., "Patient?phone=718-564-9483" or "Patient/123")',
          },
          body: {
            type: 'object',
            description: 'Request body for POST, PUT, PATCH requests (optional for GET)',
          },
        },
        required: ['method', 'path'],
      },
    },
  },
];

export async function callAI(
  messages: any[],
  apiKey: string,
  model: string
): Promise<{ content: string | null; tool_calls: any[] }> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: model,
      messages: messages,
      tools: fhirTools,
      tool_choice: 'auto',
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      `OpenAI API error: ${response.status} ${response.statusText} - ${errorData.error?.message || 'Unknown error'}`
    );
  }

  const completion = await response.json();
  const message = completion.choices[0].message;

  return {
    content: message.content,
    tool_calls: message.tool_calls || [],
  };
}
