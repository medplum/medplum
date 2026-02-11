// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { InvokeWithResponseStreamCommand } from '@aws-sdk/client-lambda';
import type { BotResponseStream } from '@medplum/core';
import { normalizeErrorString } from '@medplum/core';
import { TextDecoder, TextEncoder } from 'node:util';
import type { BotExecutionContext, BotExecutionResult } from '../../bots/types';
import {
  buildLambdaPayload,
  getExecuteLambdaClient,
  getLambdaFunctionName,
  parseLambdaLog,
  sanitizeLogResult,
} from './execute';

/**
 * Executes a Bot in an AWS Lambda.
 * @param request - The bot request.
 * @returns The bot execution result.
 */
export async function runInLambdaStreaming(request: BotExecutionContext): Promise<BotExecutionResult> {
  const { bot, responseStream } = request;
  const name = getLambdaFunctionName(bot);
  const payload = { ...buildLambdaPayload(request), streaming: true };

  const command = new InvokeWithResponseStreamCommand({
    FunctionName: name,
    InvocationType: 'RequestResponse',
    Payload: new TextEncoder().encode(JSON.stringify(payload)),
  });

  try {
    const response = await getExecuteLambdaClient().send(command);
    if (!response.EventStream) {
      return { success: false, logResult: 'No event stream in response' };
    }

    return await processEventStream(response.EventStream, responseStream as BotResponseStream);
  } catch (err) {
    return { success: false, logResult: normalizeErrorString(err) };
  }
}

async function processEventStream(
  eventStream: AsyncIterable<{
    PayloadChunk?: { Payload?: Uint8Array };
    InvokeComplete?: { ErrorCode?: string; ErrorDetails?: string; LogResult?: string };
  }>,
  responseStream: NonNullable<BotExecutionContext['responseStream']>
): Promise<BotExecutionResult> {
  const decoder = new TextDecoder();
  let headersParsed = false;
  let buffer = '';
  let logResult = '';

  for await (const event of eventStream) {
    if (event.PayloadChunk?.Payload) {
      const chunk = decoder.decode(event.PayloadChunk.Payload);
      if (!headersParsed) {
        const result = processStreamingHeaders(buffer + chunk, responseStream);
        if (result.error) {
          return { success: false, logResult: sanitizeLogResult(result.error) };
        }
        headersParsed = result.headersParsed;
        buffer = result.buffer;
      } else {
        responseStream.write(chunk);
        // Flush to ensure data is sent immediately to client
        if (typeof (responseStream as any).flush === 'function') {
          (responseStream as any).flush();
        }
      }
    }

    if (event.InvokeComplete) {
      if (event.InvokeComplete.ErrorCode) {
        return {
          success: false,
          logResult: sanitizeLogResult(
            `Lambda error: ${event.InvokeComplete.ErrorCode} - ${event.InvokeComplete.ErrorDetails}`
          ),
        };
      }
      if (event.InvokeComplete.LogResult) {
        logResult = parseLambdaLog(event.InvokeComplete.LogResult);
      }
    }
  }

  responseStream.end();
  return { success: true, logResult };
}

function processStreamingHeaders(
  buffer: string,
  responseStream: NonNullable<BotExecutionContext['responseStream']>
): { headersParsed: boolean; buffer: string; error?: string } {
  const newlineIndex = buffer.indexOf('\n');
  if (newlineIndex === -1) {
    return { headersParsed: false, buffer };
  }

  const headersLine = buffer.substring(0, newlineIndex);
  const remainingData = buffer.substring(newlineIndex + 1);

  try {
    const headersJson = JSON.parse(headersLine);
    responseStream.startStreaming(headersJson.statusCode || 200, headersJson.headers || {});

    if (remainingData) {
      responseStream.write(remainingData);
    }

    return { headersParsed: true, buffer: '' };
  } catch {
    return { headersParsed: false, buffer: '', error: 'Failed to parse streaming headers: ' + headersLine };
  }
}
