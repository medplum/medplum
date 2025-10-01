// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import OpenAI from 'openai';
import { ChatCompletionTool } from 'openai/resources/chat/completions/completions.js';

export const fhirTools: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'fhir_request',
      description: 'Make a FHIR request to the Medplum server. Use this to search, read, create, update, or delete FHIR resources.',
      parameters: {
        type: 'object',
        properties: {
          method: {
            type: 'string',
            enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
            description: 'HTTP method for the FHIR request'
          },
          path: {
            type: 'string',
            description: 'FHIR path (e.g., "Patient?phone=718-564-9483" or "Patient/123")'
          },
          body: {
            type: 'object',
            description: 'Request body for POST, PUT, PATCH requests (optional for GET)'
          }
        },
        required: ['method', 'path']
      }
    }
  }
] as const;

export async function callAI(
  messages: any[],
  apiKey: string,
  model: string
): Promise<{ content: string | null; tool_calls: any[] }> {
  const openai = new OpenAI({
    apiKey: apiKey
  });

  const completion = await openai.chat.completions.create({
    model: model,
    messages: messages,
    tools: fhirTools,
    tool_choice: 'auto',
  });

  const response = completion.choices[0].message;

  return {
    content: response.content,
    tool_calls: response.tool_calls || []
  };
}