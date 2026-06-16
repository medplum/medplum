// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { InvokeWithResponseStreamCommand } from '@aws-sdk/client-lambda';
import { isOperationOutcome, normalizeErrorString } from '@medplum/core';
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
  let headersParsed = false;
  let bufferingWrapperResponse = false;
  let buffer = '';
  let logResult = '';
  let wrapperStatusCode = 200;
  let wrapperHeaders: Record<string, string> | undefined = undefined;
  let wrapperBody = '';

  for await (const event of eventStream) {
    if (event.PayloadChunk?.Payload) {
      const chunk = decoder.decode(event.PayloadChunk.Payload);
      if (!headersParsed) {
        const result = processStreamingHeaders(buffer + chunk);
        if (result.error) {
          return { success: false, logResult: sanitizeLogResult(result.error) };
        }
        headersParsed = result.headersParsed;
        if (headersParsed && result.headers) {
          wrapperStatusCode = result.headers.statusCode || 200;
          if (result.headers.nonStreamingResponse) {
            bufferingWrapperResponse = true;
            wrapperHeaders = result.headers.headers;
            wrapperBody += result.buffer;
          } else {
            responseStream.startStreaming(wrapperStatusCode, result.headers.headers || {});
            if (result.buffer) {
              responseStream.write(result.buffer);
            }
          }
          buffer = '';
        } else {
          buffer = result.buffer;
        }
      } else if (bufferingWrapperResponse) {
        wrapperBody += chunk;
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

  if (bufferingWrapperResponse) {
    const result = parseWrapperJsonResponse(wrapperStatusCode, wrapperBody, logResult);
    if (result) {
      return result;
    }
    responseStream.startStreaming(wrapperStatusCode, wrapperHeaders || {});
    if (wrapperBody) {
      responseStream.write(wrapperBody);
    }
    responseStream.end();
    return { success: wrapperStatusCode >= 200 && wrapperStatusCode < 400, logResult };
  }

  responseStream.end();
  return { success: true, logResult };
}

const MAX_HEADER_SIZE = 65536; // 64KB

function processStreamingHeaders(
  buffer: string
): {
  headersParsed: boolean;
  buffer: string;
  headers?: { statusCode?: number; headers?: Record<string, string>; nonStreamingResponse?: boolean };
  error?: string;
} {
  if (buffer.length > MAX_HEADER_SIZE) {
    return {
      headersParsed: false,
      buffer: '',
      error: `Streaming headers exceeded maximum size of ${MAX_HEADER_SIZE} bytes`,
    };
  }

  const newlineIndex = buffer.indexOf('\n');
  if (newlineIndex === -1) {
    return { headersParsed: false, buffer };
  }

  const headersLine = buffer.substring(0, newlineIndex);
  const remainingData = buffer.substring(newlineIndex + 1);

  try {
    const headersJson = JSON.parse(headersLine);
    return { headersParsed: true, buffer: remainingData, headers: headersJson };
  } catch (err) {
    return {
      headersParsed: false,
      buffer: '',
      error: `Failed to parse streaming headers: ${headersLine} - ${String(err)}`,
    };
  }
}

function parseWrapperJsonResponse(statusCode: number, body: string, logResult: string): BotExecutionResult | undefined {
  let returnValue: unknown;
  try {
    returnValue = body ? JSON.parse(body) : undefined;
  } catch {
    return undefined;
  }

  if (!isOperationOutcome(returnValue)) {
    return undefined;
  }

  return {
    success: statusCode >= 200 && statusCode < 300,
    logResult,
    returnValue,
  };
}
