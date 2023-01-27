import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { badRequest, createReference, getIdentifier, Hl7Message, resolveId } from '@medplum/core';
import { AuditEvent, Bot, Login, Organization, Project, ProjectMembership, Reference } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { TextDecoder, TextEncoder } from 'util';
import { asyncWrap } from '../../async';
import { getConfig } from '../../config';
import { generateAccessToken } from '../../oauth/keys';
import { AuditEventOutcome } from '../../util/auditevent';
import { Repository, systemRepo } from '../repo';

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
  readonly contentType: string;
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

  // First read the bot as the user to verify access
  await repo.readResource<Bot>('Bot', id);

  // Then read the bot as system user to load extended metadata
  const bot = await systemRepo.readResource<Bot>('Bot', id);

  // Execute the bot
  const result = await executeBot({
    bot,
    runAs: res.locals.membership as ProjectMembership,
    input: req.body,
    contentType: req.header('content-type') as string,
  });

  // Create the audit event
  await createAuditEvent(
    bot,
    result.success ? AuditEventOutcome.Success : AuditEventOutcome.MinorFailure,
    result.logResult
  );

  // Send the response
  res
    .status(result.success ? 200 : 400)
    .type(getResponseContentType(req))
    .send(result.returnValue || badRequest(result.logResult));
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

  if (!(await isBotEnabled(bot))) {
    return { success: false, logResult: 'Bots not enabled' };
  }

  if (!bot.code) {
    return { success: false, logResult: 'Ignore bots with no code' };
  }

  if (bot.runtimeVersion === 'awslambda') {
    return runInLambda(request);
  } else {
    return { success: false, logResult: 'Unsupported bot runtime' };
  }
}

/**
 * Returns true if the bot is enabled and bots are enabled for the project.
 * @param bot The bot resource.
 * @returns True if the bot is enabled.
 */
export async function isBotEnabled(bot: Bot): Promise<boolean> {
  const project = await systemRepo.readResource<Project>('Project', bot.meta?.project as string);
  return !!project.features?.includes('bots');
}

/**
 * Executes a Bot in an AWS Lambda.
 * @param request The bot request.
 * @returns The bot execution result.
 */
async function runInLambda(request: BotExecutionRequest): Promise<BotExecutionResult> {
  const { bot, runAs, input, contentType } = request;
  const config = getConfig();

  // Create the Login resource
  const login = await systemRepo.createResource<Login>({
    resourceType: 'Login',
    authMethod: 'execute',
    user: runAs.user,
    membership: createReference(runAs),
    authTime: new Date().toISOString(),
    scope: 'openid',
  });

  // Create the access token
  const accessToken = await generateAccessToken({
    login_id: login.id as string,
    sub: resolveId(runAs.user?.reference as Reference) as string,
    username: resolveId(runAs.user?.reference as Reference) as string,
    profile: runAs.profile?.reference as string,
    scope: 'openid',
  });

  // Get the project secrets
  const project = await systemRepo.readResource<Project>('Project', bot.meta?.project as string);
  const secrets = Object.fromEntries(project.secret?.map((secret) => [secret.name, secret]) || []);

  const client = new LambdaClient({ region: config.awsRegion });
  const name = getLambdaFunctionName(bot);
  const payload = {
    baseUrl: config.baseUrl,
    accessToken,
    input: input instanceof Hl7Message ? input.toString() : input,
    contentType,
    secrets,
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
    const returnValue = responseStr && isJsonContentType(contentType) ? JSON.parse(responseStr) : responseStr;
    return {
      success: !response.FunctionError,
      logResult: parseLambdaLog(response.LogResult as string),
      returnValue,
    };
  } catch (err) {
    return {
      success: false,
      logResult: (err as Error).message,
    };
  }
}

/**
 * Returns the AWS Lambda function name for the given bot.
 * By default, the function name is based on the bot ID.
 * If the bot has a custom function, and the server allows it, then that is used instead.
 * @param bot The Bot resource.
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
 *
 * @param logResult The raw log result from the AWS lambda event.
 * @returns The parsed log result.
 */
function parseLambdaLog(logResult: string): string {
  const logBuffer = Buffer.from(logResult, 'base64');
  const log = logBuffer.toString('ascii');
  if (!log.startsWith('START RequestId: ')) {
    return log;
  }
  const lines = log.split('\n');
  const requestId = lines[0].split(' ')[2];
  const requestRegex = new RegExp(`${requestId}\\s+\\w+`);
  const result = [];
  for (const line of lines) {
    if (
      line.startsWith(`START RequestId: ${requestId}`) ||
      line.startsWith(`END RequestId: ${requestId}`) ||
      line.startsWith(`REPORT RequestId: ${requestId}`)
    ) {
      // Ignore the metadata lines
      continue;
    }
    const match = requestRegex.exec(line);
    if (match) {
      const trimmed = line.substring(match.index + match[0].length).trimStart();
      if (!trimmed.startsWith('Invoke Error')) {
        result.push(trimmed);
      }
    } else {
      result.push(line);
    }
  }
  return result.join('\n');
}

function getResponseContentType(req: Request): string {
  const requestContentType = req.get('Content-Type');
  if (requestContentType && EXECUTE_CONTENT_TYPES.includes(requestContentType)) {
    return requestContentType;
  }

  // Default to FHIR
  return 'application/fhir+json';
}

function isJsonContentType(contentType: string): boolean {
  return contentType === 'application/json' || contentType === 'application/fhir+json';
}

/**
 * Creates an AuditEvent for a subscription attempt.
 * @param bot The bot that produced the audit event.
 * @param outcome The outcome code.
 * @param outcomeDesc The outcome description text.
 */
async function createAuditEvent(bot: Bot, outcome: AuditEventOutcome, outcomeDesc: string): Promise<void> {
  const maxDescLength = 10 * 1024;
  if (outcomeDesc.length > maxDescLength) {
    outcomeDesc = outcomeDesc.substring(outcomeDesc.length - maxDescLength);
  }

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
      observer: createReference(bot) as Reference as Reference<Organization>,
    },
    entity: [
      {
        what: createReference(bot),
        role: { code: '9', display: 'Subscriber' },
      },
    ],
    outcome,
    outcomeDesc,
  });
}
