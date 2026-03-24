// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { Readable } from 'stream';
import type { BotEvent, MedplumClient } from '@medplum/core';
import type { OperationOutcome, Parameters } from '@medplum/fhirtypes';

const SYSTEM_PROMPT_IDENTIFIER = 'http://medplum.com/ai-spaces|ai-component-generator-sse';

async function fetchSystemPrompt(medplum: MedplumClient): Promise<string> {
  const communication = await medplum.searchOne('Communication', {
    identifier: SYSTEM_PROMPT_IDENTIFIER,
  });

  const systemPrompt = communication?.payload?.[0]?.contentString;
  if (!systemPrompt) {
    throw new Error('ai-component-generator-sse system prompt is not available');
  }

  return systemPrompt;
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

interface ToolCall {
  id: string;
  type: string;
  function: {
    name: string;
    arguments: string;
  };
}

function normalizeMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((msg) => {
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
}

function buildMessages(systemPrompt: string, userMessages: ChatMessage[], fhirData: unknown[]): ChatMessage[] {
  return [
    { role: 'system', content: systemPrompt },
    ...userMessages,
    {
      role: 'user',
      content: `Here is the FHIR data to visualize:

\`\`\`json
${JSON.stringify(fhirData, null, 2)}
\`\`\`

Generate a WORKING React component. Remember:
- NO imports
- Use NUMERIC values for chart dataKey (aggregate counts if needed)
- Wrap charts in ResponsiveContainer
- Use function Chart() syntax
- Return code in \`\`\`jsx block`,
    },
  ];
}

function makeOutcome(text: string): OperationOutcome {
  return {
    resourceType: 'OperationOutcome',
    issue: [{ severity: 'error', code: 'exception', details: { text } }],
  };
}

export async function handler(
  medplum: MedplumClient,
  event: BotEvent<Parameters>
): Promise<Parameters | OperationOutcome | undefined> {
  const { input, secrets, responseStream } = event;

  const apiKey = secrets['OPENAI_API_KEY']?.valueString;
  if (!apiKey) {
    console.error('OPENAI_API_KEY is missing from secrets');
    if (responseStream) {
      responseStream.startStreaming(200, { 'Content-Type': 'text/event-stream' });
      responseStream.write('data: {"error":"OPENAI_API_KEY missing"}\n\n');
      responseStream.end();
      return undefined;
    }
    return {
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', code: 'invalid', details: { text: 'OPENAI_API_KEY is required' } }],
    };
  }

  const messagesParam = input.parameter?.find((p) => p.name === 'messages');
  if (!messagesParam?.valueString) {
    return {
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', code: 'invalid', details: { text: 'messages parameter is required' } }],
    };
  }

  const userMessages: ChatMessage[] = JSON.parse(messagesParam.valueString);
  const model = input.parameter?.find((p) => p.name === 'model')?.valueString ?? 'gpt-4o';
  const fhirDataRaw = input.parameter?.find((p) => p.name === 'fhirData')?.valueString;
  const fhirData: unknown[] = fhirDataRaw ? JSON.parse(fhirDataRaw) : [];

  const systemPrompt = await fetchSystemPrompt(medplum);
  const messages = normalizeMessages(buildMessages(systemPrompt, userMessages, fhirData));

  const aiParameters: Parameters = {
    resourceType: 'Parameters',
    parameter: [
      { name: 'messages', valueString: JSON.stringify(messages) },
      { name: 'apiKey', valueString: apiKey },
      { name: 'model', valueString: model },
    ],
  };

  if (responseStream) {
    try {
      const response = await fetch(medplum.fhirUrl('$ai').toString(), {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + medplum.getAccessToken(),
          'Content-Type': 'application/fhir+json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify(aiParameters),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('AI error:', errText);
        return makeOutcome('AI request failed: ' + errText);
      }

      responseStream.startStreaming(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      const nodeStream = Readable.fromWeb(response.body as any);
      nodeStream.pipe(responseStream as any);

      return await new Promise<undefined>((resolve, reject) => {
        nodeStream.on('end', () => resolve(undefined));
        nodeStream.on('error', reject);
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('Streaming error:', err);
      return makeOutcome('Streaming error: ' + errMsg);
    }
  }

  // Non-streaming fallback
  const response = await medplum.post(medplum.fhirUrl('$ai'), aiParameters);
  return response as Parameters;
}
