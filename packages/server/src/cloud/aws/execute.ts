// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { InvokeCommand, InvokeWithResponseStreamCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { Hl7Message, createReference, getIdentifier, normalizeErrorString } from '@medplum/core';
import type { Bot } from '@medplum/fhirtypes';
import { TextDecoder, TextEncoder } from 'node:util';
import type { BotExecutionContext, BotExecutionResult, BotStreamingResult } from '../../bots/types';
import { getConfig } from '../../config/loader';
import { getAuthenticatedContext } from '../../context';

let client: LambdaClient;

/**
 * Executes a Bot in an AWS Lambda.
 * @param request - The bot request.
 * @returns The bot execution result.
 */
export async function runInLambda(request: BotExecutionContext): Promise<BotExecutionResult> {
  const { bot, accessToken, requester, secrets, input, contentType, traceId, headers } = request;
  const config = getConfig();
  if (!client) {
    client = new LambdaClient({ region: config.awsRegion });
  }
  const name = getLambdaFunctionName(bot);
  const payload = {
    bot: createReference(bot),
    baseUrl: config.baseUrl,
    requester,
    accessToken,
    input: input instanceof Hl7Message ? input.toString() : input,
    contentType,
    secrets,
    traceId,
    headers,
  };

  // Build the command
  const encoder = new TextEncoder();
  const command = new InvokeCommand({
    FunctionName: name,
    InvocationType: 'RequestResponse',
    LogType: 'Tail',
    Payload: encoder.encode(JSON.stringify(payload)),
  });

  // Execute the command
  try {
    const response = await client.send(command);
    const responseStr = response.Payload ? new TextDecoder().decode(response.Payload) : undefined;

    // Parse the streamed response format from awslambda.streamifyResponse
    // The response contains newline-separated JSON objects, with the last one being __medplum_result__ or __medplum_error__
    const returnValue = responseStr ? parseLambdaStreamResponse(responseStr) : undefined;

    return {
      success: !response.FunctionError && !returnValue?.__medplum_error__,
      logResult: parseLambdaLog(response.LogResult as string),
      returnValue: returnValue?.__medplum_result__ ?? returnValue?.__medplum_error__,
    };
  } catch (err) {
    return {
      success: false,
      logResult: normalizeErrorString(err),
    };
  }
}

/**
 * Parses the Lambda response from awslambda.streamifyResponse.
 * The response contains newline-separated JSON objects.
 * Supports both the new streaming format with __medplum_result__/__medplum_error__
 * and the legacy format with raw return values for backwards compatibility.
 * @param responseStr - The raw response string from Lambda.
 * @returns The parsed result object containing __medplum_result__ or __medplum_error__.
 */
function parseLambdaStreamResponse(responseStr: string): { __medplum_result__?: any; __medplum_error__?: string } {
  const lines = responseStr.split('\n').filter((line) => line.trim());
  for (const line of lines.reverse()) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.__medplum_result__ !== undefined || parsed.__medplum_error__ !== undefined) {
        return parsed;
      }
    } catch {
      // Skip malformed lines
    }
  }
  // Backwards compatibility: if no __medplum_result__ wrapper found,
  // treat the entire response as the raw return value (legacy format)
  try {
    const parsed = JSON.parse(responseStr);
    return { __medplum_result__: parsed };
  } catch {
    // If it's not valid JSON, return the raw string
    return { __medplum_result__: responseStr };
  }
}

/**
 * Returns the AWS Lambda function name for the given bot.
 * By default, the function name is based on the bot ID.
 * If the bot has a custom function, and the server allows it, then that is used instead.
 * @param bot - The Bot resource.
 * @returns The AWS Lambda function name.
 */
export function getLambdaFunctionName(bot: Bot): string {
  if (getConfig().botCustomFunctionsEnabled) {
    const customFunction = getIdentifier(bot, 'https://medplum.com/bot-external-function-id');
    if (customFunction) {
      return customFunction;
    }
  }

  // By default, use the bot ID as the Lambda function name
  return `medplum-bot-lambda-${bot.id}`;
}

/**
 * Parses the AWS Lambda log result.
 *
 * The raw logs include markup metadata such as timestamps and billing information.
 *
 * We only want to include the actual log contents in the AuditEvent,
 * so we attempt to scrub away all of that extra metadata.
 *
 * See: https://docs.aws.amazon.com/lambda/latest/dg/nodejs-logging.html
 * @param logResult - The raw log result from the AWS lambda event.
 * @returns The parsed log result.
 */
function parseLambdaLog(logResult: string): string {
  const logBuffer = Buffer.from(logResult, 'base64');
  const log = logBuffer.toString('ascii');
  const lines = log.split('\n');
  const result = [];
  for (const line of lines) {
    if (line.startsWith('START RequestId: ')) {
      // Ignore start line
      continue;
    }
    if (line.startsWith('END RequestId: ') || line.startsWith('REPORT RequestId: ')) {
      // Stop at end lines
      break;
    }
    result.push(line);
  }
  return result.join('\n').trim();
}

/**
 * Executes a Bot in an AWS Lambda with streaming support.
 * @param request - The bot request with streaming callback.
 * @returns The bot streaming execution result.
 */
export async function runInLambdaStreaming(request: BotExecutionContext): Promise<BotStreamingResult> {
  const { bot, accessToken, requester, secrets, input, contentType, traceId, headers, streamingCallback } = request;
  const config = getConfig();
  if (!client) {
    client = new LambdaClient({ region: config.awsRegion });
  }
  const name = getLambdaFunctionName(bot);
  const payload = {
    bot: createReference(bot),
    baseUrl: config.baseUrl,
    requester,
    accessToken,
    input: input instanceof Hl7Message ? input.toString() : input,
    contentType,
    secrets,
    traceId,
    headers,
    streaming: true, // Indicate streaming mode
  };
  const ctx = getAuthenticatedContext();

  // Build the streaming command
  const encoder = new TextEncoder();
  const command = new InvokeWithResponseStreamCommand({
    FunctionName: name,
    Payload: encoder.encode(JSON.stringify(payload)),
  });

  // Execute the command
  try {
    const response = await client.send(command);

    if (!response.EventStream) {
      throw new Error('No event stream in response');
    }

    let logResult = '';
    let buffer = '';

    // Create a ReadableStream from the EventStream and pipe through TextDecoderStream
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of response.EventStream ?? []) {
            if (event.PayloadChunk?.Payload) {
              controller.enqueue(event.PayloadChunk.Payload);
            }
            if (event.InvokeComplete) {
              if (event.InvokeComplete.ErrorCode) {
                controller.error(new Error(event.InvokeComplete.ErrorDetails || 'Lambda execution failed'));
              } else {
                logResult = event.InvokeComplete.LogResult ? parseLambdaLog(event.InvokeComplete.LogResult) : '';
              }
              controller.close();
              break;
            }
          }
        } catch (err) {
          controller.error(err);
        }
      },
    });

    const reader = readableStream.pipeThrough(new TextDecoderStream()).getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += value;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) {
            continue;
          }

          try {
            const parsed = JSON.parse(line);
            // Check if this is a chunk marker from our wrapper
            if (parsed.__medplum_chunk__) {
              if (streamingCallback) {
                await streamingCallback(parsed.__medplum_chunk__);
              }
            } else if (streamingCallback) {
              // Regular payload chunk
              await streamingCallback(parsed);
            }
          } catch (err) {
            ctx.logger.error('Error parsing stream chunk', { error: err });
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return {
      streaming: true,
      success: true,
      logResult,
    };
  } catch (err) {
    return {
      streaming: true,
      success: false,
      logResult: normalizeErrorString(err),
    };
  }
}
