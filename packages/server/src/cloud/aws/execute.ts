// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { InvokeCommand, InvokeWithResponseStreamCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { Hl7Message, createReference, getIdentifier, normalizeErrorString } from '@medplum/core';
import type { Bot } from '@medplum/fhirtypes';
import { TextDecoder, TextEncoder } from 'node:util';
import type { BotExecutionContext, BotExecutionResult } from '../../bots/types';
import { getConfig } from '../../config/loader';

let client: LambdaClient;

/**
 * Executes a Bot in an AWS Lambda.
 * Automatically uses streaming if responseStream is provided in the context.
 * @param request - The bot request.
 * @returns The bot execution result.
 */
export async function runInLambda(request: BotExecutionContext): Promise<BotExecutionResult> {
  const { bot, accessToken, requester, secrets, input, contentType, traceId, headers, responseStream } = request;
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
    streaming: !!responseStream,
  };

  const encoder = new TextEncoder();

  if (responseStream) {
    // Streaming mode: use InvokeWithResponseStreamCommand
    const command = new InvokeWithResponseStreamCommand({
      FunctionName: name,
      InvocationType: 'RequestResponse',
      Payload: encoder.encode(JSON.stringify(payload)),
    });

    const decoder = new TextDecoder();
    let headersParsed = false;
    let buffer = '';
    let logResult = '';

    try {
      const response = await client.send(command);

      if (!response.EventStream) {
        return { success: false, logResult: 'No event stream in response' };
      }

      for await (const event of response.EventStream) {
        if (event.PayloadChunk?.Payload) {
          const chunk = decoder.decode(event.PayloadChunk.Payload);

          if (!headersParsed) {
            // Buffer data until we find the headers line
            buffer += chunk;
            const newlineIndex = buffer.indexOf('\n');
            if (newlineIndex !== -1) {
              // Parse headers from first line
              const headersLine = buffer.substring(0, newlineIndex);
              const remainingData = buffer.substring(newlineIndex + 1);
              buffer = '';

              try {
                const headersJson = JSON.parse(headersLine);
                responseStream.startStreaming(headersJson.statusCode || 200, headersJson.headers || {});
                headersParsed = true;

                // Write any remaining data after the headers line
                if (remainingData) {
                  responseStream.write(remainingData);
                }
              } catch {
                // If headers parsing fails, treat entire response as error
                return { success: false, logResult: 'Failed to parse streaming headers: ' + headersLine };
              }
            }
          } else {
            // After headers are parsed, pipe data directly to response stream
            responseStream.write(chunk);
          }
        }

        if (event.InvokeComplete) {
          if (event.InvokeComplete.ErrorCode) {
            logResult = `Lambda error: ${event.InvokeComplete.ErrorCode} - ${event.InvokeComplete.ErrorDetails}`;
            return { success: false, logResult };
          }
          // Extract log result if available
          if (event.InvokeComplete.LogResult) {
            logResult = parseLambdaLog(event.InvokeComplete.LogResult);
          }
        }
      }

      // End the response stream
      responseStream.end();

      return { success: true, logResult };
    } catch (err) {
      return {
        success: false,
        logResult: normalizeErrorString(err),
      };
    }
  }

  // Non-streaming mode: use InvokeCommand
  const command = new InvokeCommand({
    FunctionName: name,
    InvocationType: 'RequestResponse',
    LogType: 'Tail',
    Payload: encoder.encode(JSON.stringify(payload)),
  });

  try {
    const response = await client.send(command);
    const responseStr = response.Payload ? new TextDecoder().decode(response.Payload) : undefined;

    // The response from AWS Lambda is always JSON, even if the function returns a string
    // Therefore we always use JSON.parse to get the return value
    // See: https://stackoverflow.com/a/49951946/2051724
    const returnValue = responseStr ? JSON.parse(responseStr) : undefined;

    return {
      success: !response.FunctionError,
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
