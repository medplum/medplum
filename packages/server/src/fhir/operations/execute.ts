import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { assertOk, createReference, resolveId } from '@medplum/core';
import { AuditEvent, Bot, Login, Project, ProjectMembership, Reference } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import fetch from 'node-fetch';
import Mail from 'nodemailer/lib/mailer';
import { TextDecoder, TextEncoder } from 'util';
import vm from 'vm';
import { asyncWrap } from '../../async';
import { sendEmail } from '../../email';
import { generateAccessToken } from '../../oauth';
import { AuditEventOutcome } from '../../util/auditevent';
import { MockConsole } from '../../util/console';
import { createPdf } from '../../util/pdf';
import { getRepoForMembership, Repository, systemRepo } from '../repo';
import { rewriteAttachments, RewriteMode } from '../rewrite';

export const EXECUTE_CONTENT_TYPES = [
  'application/json',
  'application/fhir+json',
  'text/plain',
  'x-application/hl7-v2+er7',
];

export interface BotExecutionRequest {
  readonly bot: Bot;
  readonly runAs: ProjectMembership;
  readonly input: any;
}

export interface BotExecutionResult {
  readonly success: boolean;
  readonly logResult: string;
  readonly returnValue?: any;
}

/**
 * Handles HTTP requests for the execute operation.
 * First reads the bot and makes sure it is valid and the user has access to it.
 * Then executes the bot.
 * Returns the outcome of the bot execution.
 * Assumes that input content-type is output content-type.
 */
export const executeHandler = asyncWrap(async (req: Request, res: Response) => {
  const { id } = req.params;
  const repo = res.locals.repo as Repository;
  const [outcome, bot] = await repo.readResource<Bot>('Bot', id);
  assertOk(outcome, bot);

  // Execute the bot
  const result = await executeBot({
    bot,
    runAs: res.locals.membership as ProjectMembership,
    input: req.body,
  });

  // Create the audit event
  createAuditEvent(bot, result.success ? AuditEventOutcome.Success : AuditEventOutcome.MinorFailure, result.logResult);

  // Send the response
  res
    .status(result.success ? 200 : 400)
    .type(getResponseContentType(req))
    .send(result.returnValue);
});

/**
 * Executes a Bot.
 * This method ensures the bot is valid and enabled.
 * This method dispatches to the appropriate execution method.
 * @param request The bot request.
 * @returns The bot execution result.
 */
export async function executeBot(request: BotExecutionRequest): Promise<BotExecutionResult> {
  const { bot } = request;
  if (!bot.code) {
    return { success: false, logResult: 'Ignore bots with no code' };
  }

  if (!(await isBotEnabled(bot))) {
    return { success: false, logResult: 'Bots not enabled' };
  }

  if (bot.runtimeVersion === 'awslambda') {
    return runInLambda(request);
  } else {
    return runInVmContext(request);
  }
}

/**
 * Returns true if the bot is enabled and bots are enabled for the project.
 * @param bot The bot resource.
 * @returns True if the bot is enabled.
 */
async function isBotEnabled(bot: Bot): Promise<boolean> {
  const [projectOutcome, project] = await systemRepo.readResource<Project>('Project', bot.meta?.project as string);
  assertOk(projectOutcome, project);
  return !!project.features?.includes('bots');
}

/**
 * Executes a Bot in an AWS Lambda.
 * @param request The bot request.
 * @returns The bot execution result.
 */
async function runInLambda(request: BotExecutionRequest): Promise<BotExecutionResult> {
  const { bot, runAs, input } = request;

  // Create the Login resource
  const [loginOutcome, login] = await systemRepo.createResource<Login>({
    resourceType: 'Login',
    membership: createReference(runAs),
    authTime: new Date().toISOString(),
    scope: 'openid',
  });
  assertOk(loginOutcome, login);

  // Create the access token
  const accessToken = await generateAccessToken({
    login_id: login.id as string,
    sub: resolveId(runAs.user?.reference as Reference) as string,
    username: resolveId(runAs.user?.reference as Reference) as string,
    profile: runAs.profile?.reference as string,
    scope: 'openid',
  });

  const client = new LambdaClient({ region: 'us-east-1' });
  const name = `medplum-bot-lambda-${bot.id}`;
  const payload = {
    accessToken,
    input,
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
    const logBuffer = Buffer.from(response.LogResult as string, 'base64');
    return {
      success: true,
      logResult: logBuffer.toString('ascii'),
      returnValue: response.Payload ? JSON.parse(new TextDecoder().decode(response.Payload)) : undefined,
    };
  } catch (err) {
    return {
      success: false,
      logResult: (err as Error).message,
    };
  }
}

/**
 * Executes a Bot in a VM sandbox.
 * @param request The bot request.
 * @returns The bot execution result.
 */
async function runInVmContext(request: BotExecutionRequest): Promise<BotExecutionResult> {
  const { bot, runAs, input } = request;
  const botRepo = await getRepoForMembership(runAs);
  const botConsole = new MockConsole();

  const sandbox = {
    input,
    resource: input,
    repo: botRepo,
    console: botConsole,
    fetch,
    assertOk,
    createReference,
    createPdf,
    sendEmail: async (args: Mail.Options) => {
      await sendEmail(await rewriteAttachments(RewriteMode.PRESIGNED_URL, botRepo, args));
    },
  };

  const options: vm.RunningScriptOptions = {
    timeout: 100,
  };

  // Wrap code in an async block for top-level await support
  const wrappedCode = '(async () => {' + bot.code + '})();';

  // Return the result of the code execution
  try {
    const returnValue = (await vm.runInNewContext(wrappedCode, sandbox, options)) as any;
    return {
      success: true,
      logResult: botConsole.toString(),
      returnValue,
    };
  } catch (err) {
    botConsole.log('Error', (err as Error).message);
    return {
      success: false,
      logResult: botConsole.toString(),
    };
  }
}

function getResponseContentType(req: Request): string {
  const requestContentType = req.get('Content-Type');
  if (requestContentType && EXECUTE_CONTENT_TYPES.includes(requestContentType)) {
    return requestContentType;
  }

  // Default to FHIR
  return 'application/fhir+json';
}

/**
 * Creates an AuditEvent for a subscription attempt.
 * @param subscription The rest-hook subscription.
 * @param resource The resource that triggered the subscription.
 * @param outcome The outcome code.
 * @param outcomeDesc The outcome description text.
 */
async function createAuditEvent(bot: Bot, outcome: AuditEventOutcome, outcomeDesc: string): Promise<void> {
  await systemRepo.createResource<AuditEvent>({
    resourceType: 'AuditEvent',
    meta: {
      project: bot.meta?.project,
      account: bot.meta?.account,
    },
    recorded: new Date().toISOString(),
    type: {
      code: 'execute',
    },
    agent: [
      {
        type: {
          text: 'bot',
        },
        requestor: false,
      },
    ],
    source: {
      // Observer cannot be a Bot resource
      // observer: createReference(bot)
    },
    entity: [
      {
        what: createReference(bot),
      },
    ],
    outcome,
    outcomeDesc,
  });
}
