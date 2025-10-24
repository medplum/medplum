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

  try {
    const result = await callAI(messages, params.apiKey, params.model, tools);
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
  } catch (error) {
    return [badRequest(`AI operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`)];
  }
}

export async function callAI(
  messages: any[],
  apiKey: string,
  model: string,
  tools?: any[]
): Promise<{ content: string | null; tool_calls: any[] }> {
  const requestBody: any = {
    model: model,
    messages: messages,
  };

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

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      `OpenAI API error: ${response.status} ${response.statusText} - ${errorData?.error?.message || 'Unknown error'}`
    );
  }

  const completion = await response.json();
  const message = completion.choices[0].message;

  return {
    content: message.content,
    tool_calls: message.tool_calls || [],
  };
}
