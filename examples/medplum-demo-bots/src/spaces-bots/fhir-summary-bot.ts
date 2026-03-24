// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { Readable } from 'stream';
import type { BotEvent, MedplumClient } from '@medplum/core';
import type { OperationOutcome, Parameters } from '@medplum/fhirtypes';

const SYSTEM_PROMPT_IDENTIFIER = 'http://medplum.com/ai-spaces|ai-resource-summary-sse';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | null;
  tool_calls?: any[];
  tool_call_id?: string;
}

async function fetchSystemPrompt(medplum: MedplumClient): Promise<string> {
  const communication = await medplum.searchOne('Communication', {
    identifier: SYSTEM_PROMPT_IDENTIFIER,
  });

  const systemPrompt = communication?.payload?.[0]?.contentString;
  if (!systemPrompt) {
    throw new Error('ai-resource-summary-sse system prompt is not available');
  }

  return systemPrompt;
}

export async function handler(
  medplum: MedplumClient,
  event: BotEvent<Parameters>
): Promise<Parameters | OperationOutcome | undefined> {
  const { input, secrets, responseStream } = event;

  if (!secrets['OPENAI_API_KEY']?.valueString) {
    return {
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', code: 'invalid', details: { text: 'OPENAI_API_KEY is required' } }],
    };
  }

  const apiKey = secrets['OPENAI_API_KEY'].valueString;
  const messagesParam = input.parameter?.find((p) => p.name === 'messages');
  const modelParam = input.parameter?.find((p) => p.name === 'model');

  if (!messagesParam?.valueString) {
    return {
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', code: 'invalid', details: { text: 'messages parameter is required' } }],
    };
  }

  const userMessages: ChatMessage[] = JSON.parse(messagesParam.valueString);
  const model = modelParam?.valueString || 'gpt-4';
  const systemPrompt = await fetchSystemPrompt(medplum);
  const systemMessage: ChatMessage = { role: 'system', content: systemPrompt };
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
      { name: 'messages', valueString: JSON.stringify(normalizedMessages) },
      { name: 'apiKey', valueString: apiKey },
      { name: 'model', valueString: model },
      { name: 'temperature', valueString: '0.3' },
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
        return {
          resourceType: 'OperationOutcome',
          issue: [{ severity: 'error', code: 'exception', details: { text: 'AI request failed: ' + errText } }],
        };
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
      return {
        resourceType: 'OperationOutcome',
        issue: [{ severity: 'error', code: 'exception', details: { text: 'Streaming error: ' + errMsg } }],
      };
    }
  }

  // Non-streaming fallback
  const response = await medplum.post(medplum.fhirUrl('$ai'), aiParameters);
  return response as Parameters;
}
