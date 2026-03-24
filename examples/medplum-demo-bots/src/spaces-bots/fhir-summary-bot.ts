// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { Readable } from 'stream';
import type { BotEvent, MedplumClient } from '@medplum/core';
import type { OperationOutcome, Parameters } from '@medplum/fhirtypes';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | null;
  tool_calls?: any[];
  tool_call_id?: string;
}

const SUMMARY_SYSTEM_MESSAGE: ChatMessage = {
  role: 'system',
  content: `You are a helpful healthcare assistant that summarizes FHIR data responses.
CRITICAL INSTRUCTIONS (ABSOLUTELY NO EXCEPTIONS):
1. **YOUR ONLY OUTPUT** must be a description of the FHIR response.
3. **NEVER** attempt to execute the FHIR request yourself or provide a mock response.

Your role is to:
1. Analyze the FHIR response data from the Medplum server
2. Present the information in a clear, human-readable format
3. Highlight key information relevant to the user's original question
4. Use plain language while maintaining medical accuracy
5. If there are multiple resources, organize them logically
6. If the response is an error, explain it clearly and suggest next steps

Format guidelines:
- Use natural language, not technical jargon unless necessary
- For patient data: present demographics, identifiers, and key attributes
- For observations: highlight values, dates, and significance
- For searches: summarize the count and key details of results
- For errors: explain what went wrong and possible solutions
- If bundle is empty, provide a message that the request was successful but there are no results.
- Just summarize the bundle, do not attempt to execute any FHIR requests.

DO NOT PROVIDE THE BUNDLE IN THE RESPONSE. JUST SUMMARIZE THE BUNDLE.

**Verbosity rule**: If any fhir_request tool call in the conversation has "visualize": true in its arguments, a chart/component will be shown alongside your summary. In that case, keep your summary to 1-2 sentences maximum — the visual already conveys the detail. Otherwise, be concise but informative.`,
};

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
  const messages = [SUMMARY_SYSTEM_MESSAGE, ...userMessages];

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
