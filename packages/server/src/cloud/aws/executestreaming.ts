// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { InvokeWithResponseStreamCommand } from '@aws-sdk/client-lambda';
import { normalizeErrorString } from '@medplum/core';
import { TextDecoder, TextEncoder } from 'node:util';
import type { BotExecutionContext, BotExecutionResult } from '../../bots/types';
import { getLogger } from '../../logger';
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

    if (!responseStream) {
      return { success: false, logResult: 'No response stream provided for streaming invocation' };
    }

    return await processEventStream(response.EventStream, responseStream);
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
  let preambleParsed = false;
  let buffer = '';
  let logResult = '';
  let responseChunks: string[] | undefined;

  for await (const event of eventStream) {
    if (event.PayloadChunk?.Payload) {
      const chunk = decoder.decode(event.PayloadChunk.Payload);

      // A JSON-encoded preamble containing the statusCode and headers and other metadata
      // to be used in the responseStream must be the first line of the stream delimited by a newline
      // buffer and attempt to process chunks until the preamble is fully received and parsed.
      if (!preambleParsed) {
        const result = processStreamingPreamble(buffer + chunk);
        if (result.error) {
          return { success: false, logResult: sanitizeLogResult(result.error) };
        }
        if (result.preambleParsed) {
          preambleParsed = true;
          const statusCode = result.preamble.statusCode || 200;
          if (result.preamble.nonStreamingResponse) {
            // nonStreamingResponse true means that streaming was not used in the user's handler
            // response body can also be parsed and included in the BotExecutionResult.returnValue
            responseChunks = [result.buffer];
          }

          responseStream.startStreaming(statusCode, result.preamble.headers || {});
          if (result.buffer) {
            responseStream.write(result.buffer);
          }
          buffer = '';
        } else {
          buffer = result.buffer;
        }
      } else {
        responseStream.write(chunk);
        // Flush to ensure data is sent immediately to client
        if (typeof (responseStream as any).flush === 'function') {
          (responseStream as any).flush();
        }
        if (responseChunks) {
          responseChunks.push(chunk);
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

  // make a best effort to parse the response body, but it's possible that streaming response was not JSON
  // or that the stream was not used correctly, so handle errors gracefully
  let returnValue: BotExecutionResult['returnValue'];
  if (responseChunks && responseChunks.length > 0) {
    try {
      returnValue = JSON.parse(responseChunks.join(''));
    } catch {
      getLogger().error('Failed to parse streaming response body');
    }
  }
  return { success: true, logResult, returnValue };
}

const MAX_HEADER_SIZE = 65536; // 64KB

type UnparsedResult = {
  preambleParsed: false;
  buffer: string;
  error?: string;
};
type ParsedResult = {
  preambleParsed: true;
  buffer: string;
  preamble: { statusCode?: number; headers?: Record<string, string>; nonStreamingResponse?: boolean };
  error?: undefined;
};
function processStreamingPreamble(buffer: string): ParsedResult | UnparsedResult {
  if (buffer.length > MAX_HEADER_SIZE) {
    return {
      preambleParsed: false,
      buffer: '',
      error: `Streaming headers exceeded maximum size of ${MAX_HEADER_SIZE} bytes`,
    };
  }

  const newlineIndex = buffer.indexOf('\n');
  if (newlineIndex === -1) {
    return { preambleParsed: false, buffer };
  }

  const headersLine = buffer.substring(0, newlineIndex);
  const remainingBuffer = buffer.substring(newlineIndex + 1);

  try {
    const preamble = JSON.parse(headersLine);
    return { preambleParsed: true, buffer: remainingBuffer, preamble };
  } catch (err) {
    return {
      preambleParsed: false,
      buffer: '',
      error: `Failed to parse streaming headers: ${headersLine} - ${String(err)}`,
    };
  }
}
