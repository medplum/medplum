import { runInLambda } from '../cloud/aws/execute';
import { recordHistogramValue } from '../otel/otel';
import { AuditEventOutcome } from '../util/auditevent';
import { BotExecutionContext, BotExecutionRequest, BotExecutionResult } from './types';
import { createAuditEvent, getBotAccessToken, getBotSecrets, isBotEnabled, writeBotInputToStorage } from './utils';
import { runInVmContext } from './vmcontext';

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
  if (!(await isBotEnabled(bot))) {
    result = { success: false, logResult: 'Bots not enabled' };
  } else {
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
    } else {
      result = { success: false, logResult: 'Unsupported bot runtime' };
    }
  }
  const executionTime = Number(process.hrtime.bigint() - execStart) / 1e9; // Report duration in seconds

  const attributes = { project: bot.meta?.project, bot: bot.id, outcome: result.success ? 'success' : 'failure' };
  recordHistogramValue('medplum.bot.execute.time', executionTime, { attributes });

  await createAuditEvent(
    request,
    startTime,
    result.success ? AuditEventOutcome.Success : AuditEventOutcome.MinorFailure,
    result.logResult
  );

  return result;
}
