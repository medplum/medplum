// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { BotEvent, MedplumClient } from '@medplum/core';
import type { Parameters, Reference } from '@medplum/fhirtypes';

const SYSTEM_PROMPT_IDENTIFIER = 'http://medplum.com/ai-spaces|ai-fhir-request-tools';

interface SystemPrompts {
  systemPrompt: string;
  profileContextTemplate: string;
}

async function fetchSystemPrompts(medplum: MedplumClient): Promise<SystemPrompts> {
  const communication = await medplum.searchOne('Communication', {
    identifier: SYSTEM_PROMPT_IDENTIFIER,
  });

  const systemPrompt = communication?.payload?.[0]?.contentString;
  if (!systemPrompt) {
    throw new Error('ai-fhir-request-tools system prompt is not available');
  }

  const profileContextTemplate = communication?.payload?.[1]?.contentString;
  if (!profileContextTemplate) {
    throw new Error('ai-fhir-request-tools profile context template is not available');
  }

  return { systemPrompt, profileContextTemplate };
}

function buildProfileContext(template: string, profile: Reference): string {
  return template.replaceAll('{{ref}}', profile.reference ?? '');
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | null;
  tool_calls?: any[];
  tool_call_id?: string;
}

const FHIR_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'fhir_request',
      description:
        'REQUIRED for all FHIR operations. Make a FHIR request to the Medplum server. You MUST use this tool - you cannot execute FHIR requests yourself. For updates: first GET the resource, then PUT with the modified full resource.',
      parameters: {
        type: 'object',
        properties: {
          method: {
            type: 'string',
            enum: ['GET', 'POST', 'PUT', 'DELETE'],
            description:
              'HTTP method: GET for search/read, POST for create, PUT for update (requires full resource), DELETE for remove',
          },
          path: {
            type: 'string',
            description: 'FHIR resource path, e.g., "Patient/123" or "Patient?name=John"',
          },
          body: {
            type: 'object',
            description:
              'Request body. For PUT: complete FHIR resource with all fields. For POST: full FHIR resource to create. Not used for GET/DELETE.',
          },
          visualize: {
            type: 'boolean',
            description:
              'Set to true if the results should be displayed as a chart/graph (e.g., growth charts, lab trends, vitals over time). Default is false.',
          },
        },
        required: ['method', 'path'],
        additionalProperties: false,
      },
    },
  },
];

export async function handler(medplum: MedplumClient, event: BotEvent<Parameters>): Promise<Parameters> {
  if (!event.secrets['OPENAI_API_KEY']?.valueString) {
    throw new Error('OPENAI_API_KEY is required in project secrets');
  }

  const apiKey = event.secrets['OPENAI_API_KEY'].valueString;
  const input = event.input;

  const messagesParam = input.parameter?.find((p) => p.name === 'messages');
  const modelParam = input.parameter?.find((p) => p.name === 'model');

  if (!messagesParam?.valueString) {
    throw new Error('messages parameter is required');
  }

  const userMessages: ChatMessage[] = JSON.parse(messagesParam.valueString);
  const model = modelParam?.valueString || 'gpt-4';

  const { systemPrompt, profileContextTemplate } = await fetchSystemPrompts(medplum);
  let systemContent = systemPrompt;
  if (event.requester) {
    systemContent += buildProfileContext(profileContextTemplate, event.requester);
  }

  const systemMessage: ChatMessage = { role: 'system', content: systemContent };

  const messages = [systemMessage, ...userMessages];

  const normalizedMessages = messages.map((msg) => {
    if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
      return {
        ...msg,
        tool_calls: msg.tool_calls.map((toolCall) => ({
          ...toolCall,
          function: {
            ...toolCall.function,
            arguments:
              typeof toolCall.function.arguments === 'string'
                ? toolCall.function.arguments
                : JSON.stringify(toolCall.function.arguments),
          },
        })),
      };
    }
    return msg;
  });

  const aiParameters: Parameters = {
    resourceType: 'Parameters',
    parameter: [
      {
        name: 'messages',
        valueString: JSON.stringify(normalizedMessages),
      },
      {
        name: 'apiKey',
        valueString: apiKey,
      },
      {
        name: 'model',
        valueString: model,
      },
      {
        name: 'tools',
        valueString: JSON.stringify(FHIR_TOOLS),
      },
      {
        name: 'temperature',
        valueString: '0.3',
      },
    ],
  };

  const response: Parameters = await medplum.post(medplum.fhirUrl('$ai'), aiParameters);

  // Extract visualize flag from tool calls if present
  const toolCallsParam = response.parameter?.find((p) => p.name === 'tool_calls');
  let visualize = false;

  if (toolCallsParam?.valueString) {
    try {
      const toolCalls = JSON.parse(toolCallsParam.valueString);
      for (const toolCall of toolCalls) {
        if (toolCall.function?.name === 'fhir_request') {
          const args =
            typeof toolCall.function.arguments === 'string'
              ? JSON.parse(toolCall.function.arguments)
              : toolCall.function.arguments;
          if (args.visualize === true) {
            visualize = true;
            break;
          }
        }
      }
    } catch {
      // Ignore parse errors
    }
  }

  return {
    ...response,
    parameter: [...(response.parameter || []), { name: 'visualize', valueBoolean: visualize }],
  };
}
