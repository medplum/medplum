// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Hl7Message, createReference, normalizeErrorString } from '@medplum/core';
import { BotExecutionContext, BotExecutionResult } from '../../bots/types';
import { getConfig } from '../../config/loader';
import { executeFissionFunction } from './utils';

/**
 * Executes a Bot with Fission.
 * @param request - The bot request.
 * @returns The bot execution result.
 */
export async function executeFissionBot(request: BotExecutionContext): Promise<BotExecutionResult> {
  const { bot, accessToken, secrets, input, contentType, traceId, headers } = request;
  const config = getConfig();
  const payload = {
    bot: createReference(bot),
    baseUrl: config.baseUrl,
    accessToken,
    input: input instanceof Hl7Message ? input.toString() : input,
    contentType,
    secrets,
    traceId,
    headers,
  };

  try {
    const body = JSON.stringify(payload);
    const response = await executeFissionFunction(bot.id, body);
    const responseBody = response ? JSON.parse(response) : undefined;
    return {
      success: true,
      logResult: responseBody?.logResult ?? '',
      returnValue: responseBody?.returnValue,
    };
  } catch (err) {
    return {
      success: false,
      logResult: normalizeErrorString(err),
    };
  }
}
