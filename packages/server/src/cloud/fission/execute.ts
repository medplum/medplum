// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Hl7Message, createReference, normalizeErrorString } from '@medplum/core';
import type { BotExecutionContext, BotExecutionResult } from '../../bots/types';
import { getConfig } from '../../config/loader';
import { executeFissionFunction } from './utils';

/**
 * Executes a Bot with Fission.
 * @param request - The bot request.
 * @returns The bot execution result.
 */
export async function executeFissionBot(request: BotExecutionContext): Promise<BotExecutionResult> {
  const { bot, accessToken, secrets, requester, input, contentType, traceId, headers } = request;
  const config = getConfig();
  const payload = {
    bot: createReference(bot),
    baseUrl: config.baseUrl,
    accessToken,
    requester,
    input: input instanceof Hl7Message ? input.toString() : input,
    contentType,
    secrets,
    traceId,
    headers,
  };

  try {
    const body = JSON.stringify(payload);
    const response = await executeFissionFunction(bot.id, body);
    const responseBody = parseFissionResponseBody(response.body);
    return {
      success: response.ok && responseBody?.success !== false,
      logResult:
        responseBody?.logResult ??
        (response.ok ? '' : `HTTP error! Status: ${response.status}, Message: ${response.body}`),
      returnValue: responseBody?.returnValue,
    };
  } catch (err) {
    return {
      success: false,
      logResult: normalizeErrorString(err),
    };
  }
}

function parseFissionResponseBody(body: string): { success?: boolean; logResult?: string; returnValue?: unknown } | undefined {
  if (!body) {
    return undefined;
  }
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}
