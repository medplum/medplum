// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { Hl7Message, createReference, getIdentifier, normalizeErrorString } from '@medplum/core';
import type { Bot } from '@medplum/fhirtypes';
import { TextDecoder, TextEncoder } from 'node:util';
import type { BotExecutionContext, BotExecutionResult } from '../../bots/types';
import { getConfig } from '../../config/loader';

let client: LambdaClient;

/**
 * Returns the shared LambdaClient singleton, creating it if necessary.
 * @returns The LambdaClient instance.
 */
export function getExecuteLambdaClient(): LambdaClient {
  if (!client) {
    client = new LambdaClient({ region: getConfig().awsRegion });
  }
  return client;
}

/**
 * Builds the common Lambda invocation payload from a bot execution request.
 * @param request - The bot execution context.
 * @returns The payload object to send to the Lambda function.
 */
export function buildLambdaPayload(
  request: BotExecutionContext
): Record<string, unknown> {
  const { bot, accessToken, requester, secrets, input, contentType, traceId, headers } = request;
  const config = getConfig();
  return {
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
}

/**
 * Executes a Bot in an AWS Lambda.
 * @param request - The bot request.
 * @returns The bot execution result.
 */
export async function runInLambda(request: BotExecutionContext): Promise<BotExecutionResult> {
  const name = getLambdaFunctionName(request.bot);
  const payload = buildLambdaPayload(request);

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
    const response = await getExecuteLambdaClient().send(command);
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
export function parseLambdaLog(logResult: string): string {
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
export function sanitizeLogResult(str: string): string {
  // Replace invalid control characters (0x00-0x08, 0x0B, 0x0C, 0x0E-0x1F) with empty string
  // Keep valid characters: \t (0x09), \n (0x0A), \r (0x0D), and \u0020-\uFFFF
  // eslint-disable-next-line no-control-regex
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}
