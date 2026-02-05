// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { InvokeCommand, InvokeWithResponseStreamCommand, LambdaClient } from '@aws-sdk/client-lambda';
import type { BotResponseStream } from '@medplum/core';
import { Hl7Message, createReference, getIdentifier, normalizeErrorString } from '@medplum/core';
import type { Bot, Reference } from '@medplum/fhirtypes';
import { TextDecoder, TextEncoder } from 'node:util';
import type { BotExecutionContext, BotExecutionResult } from '../../bots/types';
import { getConfig } from '../../config/loader';
import { getLogger } from '../../logger';

interface LambdaPayload extends Pick<
  BotExecutionContext,
  'requester' | 'accessToken' | 'input' | 'contentType' | 'secrets' | 'traceId' | 'headers'
> {
  bot: Reference<Bot>;
  baseUrl: string;
  streaming: boolean;
}

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
  const payload: LambdaPayload = {
    bot: createReference(bot),
    baseUrl: config.baseUrl,
    requester,
    accessToken,
    input: input instanceof Hl7Message ? input.toString() : input,
    contentType,
    secrets,
    traceId,
    headers,
    streaming: !!request.responseStream,
  }; 

  if (request.responseStream) {
    return runInLambdaStreaming(client, name, payload, request.responseStream);
  }

  return runInLambdaNonStreaming(client, name, payload);
}

async function runInLambdaNonStreaming(
  client: LambdaClient,
  name: string,
  payload: LambdaPayload
): Promise<BotExecutionResult> {
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

    // Need to support two different response types:
    // 1. Legacy lambdas that return one response
    // 2. Streaming-compatible lambdas that return { statusCode, headers, body } for HTTP compatibility
    const lines = responseStr ? responseStr.split('\n') : [];
    let success: boolean = true;
    let returnValueLine: string | undefined;

    if (lines.length >= 2) {
      try {
        const firstLine = JSON.parse(lines[0]);
        if (firstLine.statusCode && firstLine.headers) {
          success = firstLine.statusCode >= 200 && firstLine.statusCode < 300;
          returnValueLine = lines[1];
        }
      } catch (err) {
        getLogger().warn('runInLambdaNonStreaming parse error', { responseStr, err });
      }
    } else {
      // Legacy response
      success = !response.FunctionError;
      returnValueLine = responseStr;
    }

    // The response from AWS Lambda is always JSON, even if the function returns a string
    // Therefore we always use JSON.parse to get the return value
    // See: https://stackoverflow.com/a/49951946/2051724
    const returnValue = returnValueLine ? JSON.parse(returnValueLine) : undefined;

    return {
      success,
      logResult: parseLambdaLog(response.LogResult as string),
      returnValue,
    };
  } catch (err) {
    return {
      success: false,
      logResult: normalizeErrorString(err),
    };
  }
}

async function runInLambdaStreaming(
  client: LambdaClient,
  name: string,
  payload: LambdaPayload,
  responseStream: BotResponseStream
): Promise<BotExecutionResult> {
  const command = new InvokeWithResponseStreamCommand({
    FunctionName: name,
    InvocationType: 'RequestResponse',
    Payload: new TextEncoder().encode(JSON.stringify(payload)),
  });

  try {
    const response = await client.send(command);
    if (!response.EventStream) {
      return { success: false, logResult: 'No event stream in response' };
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
  const log = logBuffer.toString('utf-8');
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
  return sanitizeLogResult(result.join('\n').trim());
}

/**
 * Sanitizes a log result string to ensure it's valid for FHIR string fields.
 * FHIR strings only allow: \r, \n, \t, and characters from \u0020 to \uFFFF.
 * This removes or replaces control characters that would cause validation errors.
 * @param str - The string to sanitize.
 * @returns The sanitized string.
 */
function sanitizeLogResult(str: string): string {
  // Replace invalid control characters (0x00-0x08, 0x0B, 0x0C, 0x0E-0x1F) with empty string
  // Keep valid characters: \t (0x09), \n (0x0A), \r (0x0D), and \u0020-\uFFFF
  // eslint-disable-next-line no-control-regex
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}
