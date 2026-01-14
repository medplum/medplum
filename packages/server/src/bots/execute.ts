// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { runInLambda, runInLambdaStreaming } from '../cloud/aws/execute';
import { executeFissionBot } from '../cloud/fission/execute';
import { recordHistogramValue } from '../otel/otel';
import { AuditEventOutcome, createBotAuditEvent } from '../util/auditevent';
import type { BotExecutionContext, BotExecutionRequest, BotExecutionResult, BotStreamingResult, StreamingCallback } from './types';
import { getBotAccessToken, getBotSecrets, isBotEnabled, writeBotInputToStorage } from './utils';
import { runInVmContext, runInVmContextStreaming } from './vmcontext';

/**
 * Executes a Bot.
 * This method ensures the bot is valid and enabled.
 * This method dispatches to the appropriate execution method.
 * @param request - The bot request.
 * @returns The bot execution result.
 */
export async function executeBot(request: BotExecutionRequest): Promise<BotExecutionResult> {
  const { bot, runAs } = request;
  const startTime = request.requestTime ?? new Date().toISOString();

  let result: BotExecutionResult;

  const execStart = process.hrtime.bigint();
  if (await isBotEnabled(bot)) {
    await writeBotInputToStorage(request);

    const context: BotExecutionContext = {
      ...request,
      accessToken: await getBotAccessToken(runAs),
      secrets: await getBotSecrets(bot, runAs),
    };

    if (bot.runtimeVersion === 'awslambda') {
      result = await runInLambda(context);
    } else if (bot.runtimeVersion === 'vmcontext') {
      result = await runInVmContext(context);
    } else if (bot.runtimeVersion === 'fission') {
      result = await executeFissionBot(context);
    } else {
      result = { success: false, logResult: 'Unsupported bot runtime' };
    }
  } else {
    result = { success: false, logResult: 'Bots not enabled' };
  }
  const executionTime = Number(process.hrtime.bigint() - execStart) / 1e9; // Report duration in seconds

  const attributes = { project: bot.meta?.project, bot: bot.id, outcome: result.success ? 'success' : 'failure' };
  recordHistogramValue('medplum.bot.execute.time', executionTime, { attributes });

  await createBotAuditEvent(
    request,
    startTime,
    result.success ? AuditEventOutcome.Success : AuditEventOutcome.MinorFailure,
    result.logResult
  );
  return result;
}

/**
 * Executes a Bot with streaming support.
 * This method ensures the bot is valid and enabled.
 * This method dispatches to the appropriate streaming execution method.
 * @param request - The bot request.
 * @param streamingCallback - Callback function to handle streamed chunks.
 * @returns The bot streaming execution result.
 */
export async function executeBotStreaming(
  request: BotExecutionRequest,
  streamingCallback: StreamingCallback
): Promise<BotStreamingResult> {
  const { bot, runAs } = request;
  const startTime = request.requestTime ?? new Date().toISOString();

  let result: BotStreamingResult;

  const execStart = process.hrtime.bigint();
  if (!(await isBotEnabled(bot))) {
    result = { streaming: true, success: false, logResult: 'Bots not enabled' };
  } else {
    await writeBotInputToStorage(request);

    const context: BotExecutionContext = {
      ...request,
      accessToken: await getBotAccessToken(runAs),
      secrets: await getBotSecrets(bot, runAs),
      streamingCallback,
    };

    if (bot.runtimeVersion === 'awslambda') {
      result = await runInLambdaStreaming(context);
    } else if (bot.runtimeVersion === 'vmcontext') {
      result = await runInVmContextStreaming(context);
    } else if (bot.runtimeVersion === 'fission') {
      result = { streaming: true, success: false, logResult: 'Fission runtime does not support streaming' };
    } else {
      result = { streaming: true, success: false, logResult: 'Unsupported bot runtime' };
    }
  }
  const executionTime = Number(process.hrtime.bigint() - execStart) / 1e9; // Report duration in seconds

  const attributes = { project: bot.meta?.project, bot: bot.id, outcome: result.success ? 'success' : 'failure' };
  recordHistogramValue('medplum.bot.execute.time', executionTime, { attributes });

  await createBotAuditEvent(
    request,
    startTime,
    result.success ? AuditEventOutcome.Success : AuditEventOutcome.MinorFailure,
    result.logResult
  );

  return result;
}
