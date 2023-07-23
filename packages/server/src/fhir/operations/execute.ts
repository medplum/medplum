import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import {
  allOk,
  badRequest,
  createReference,
  getIdentifier,
  Hl7Message,
  MedplumClient,
  Operator,
  resolveId,
} from '@medplum/core';
import {
  AuditEvent,
  Binary,
  Bot,
  Login,
  Organization,
  Project,
  ProjectMembership,
  Reference,
} from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import fetch from 'node-fetch';
import { Readable } from 'node:stream';
import vm from 'node:vm';
import { TextDecoder, TextEncoder } from 'util';
import { asyncWrap } from '../../async';
import { getConfig } from '../../config';
import { generateAccessToken } from '../../oauth/keys';
import { AuditEventOutcome } from '../../util/auditevent';
import { MockConsole } from '../../util/console';
import { sendOutcome } from '../outcomes';
import { Repository, systemRepo } from '../repo';
import { getBinaryStorage } from '../storage';

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
  // First read the bot as the user to verify access
  const userBot = await getBotForRequest(req, res);
  if (!userBot) {
    sendOutcome(res, badRequest('Must specify bot ID or identifier.'));
    return;
  }

  // Then read the bot as system user to load extended metadata
  const bot = await systemRepo.readResource<Bot>('Bot', userBot.id as string);

  // Execute the bot
  // If the request is HTTP POST, then the body is the input
  // If the request is HTTP GET, then the query string is the input
  const result = await executeBot({
    bot,
    runAs: res.locals.membership as ProjectMembership,
    input: req.method === 'POST' ? req.body : req.query,
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
    .send(result.returnValue ?? (result.success ? allOk : badRequest(result.logResult)));
});

/**
 * Returns the Bot for the execute request.
 * If using "/Bot/:id/$execute", then the bot ID is read from the path parameter.
 * If using "/Bot/$execute?identifier=...", then the bot is searched by identifier.
 * Otherwise, returns undefined.
 * @param req The HTTP request.
 * @param res The HTTP response.
 * @returns The bot, or undefined if not found.
 */
async function getBotForRequest(req: Request, res: Response): Promise<Bot | undefined> {
  const repo = res.locals.repo as Repository;

  // Prefer to search by ID from path parameter
  const { id } = req.params;
  if (id) {
    return repo.readResource<Bot>('Bot', id);
  }

  // Otherwise, search by identifier
  const { identifier } = req.query;
  if (identifier && typeof identifier === 'string') {
    return repo.searchOne<Bot>({
      resourceType: 'Bot',
      filters: [{ code: 'identifier', operator: Operator.EXACT, value: identifier }],
    });
  }

  // If no bot ID or identifier, return undefined
  return undefined;
}

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

  if (bot.runtimeVersion === 'awslambda') {
    return runInLambda(request);
  } else if (bot.runtimeVersion === 'vmcontext') {
    return runInVmContext(request);
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
  const accessToken = await getBotAccessToken(runAs);
  const secrets = await getBotSecrets(bot);

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
 * @param logResult The raw log result from the AWS lambda event.
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
  return result.join('\n');
}

/**
 * Executes a Bot in an AWS Lambda.
 * @param request The bot request.
 * @returns The bot execution result.
 */
async function runInVmContext(request: BotExecutionRequest): Promise<BotExecutionResult> {
  const { bot, runAs, input, contentType } = request;
  const config = getConfig();
  const accessToken = await getBotAccessToken(runAs);
  const secrets = await getBotSecrets(bot);
  const botConsole = new MockConsole();

  const codeUrl = bot.executableCode?.url;
  if (!codeUrl) {
    return { success: false, logResult: 'No executable code' };
  }
  if (!codeUrl.startsWith('Binary/')) {
    return { success: false, logResult: 'Executable code is not a Binary' };
  }

  // const binary = await systemRepo.readResource<Binary>('Binary', resolveId(bot.executableCode.url) as string);
  const binary = await systemRepo.readReference<Binary>({ reference: codeUrl } as Reference<Binary>);
  const stream = await getBinaryStorage().readBinary(binary);
  const code = await readStreamToString(stream);

  const sandbox = {
    Hl7Message,
    MedplumClient,
    fetch,
    console: botConsole,
    event: {
      baseUrl: config.baseUrl,
      accessToken,
      input: input instanceof Hl7Message ? input.toString() : input,
      contentType,
      secrets,
    },
  };

  const options: vm.RunningScriptOptions = {
    timeout: 10000,
  };

  // Wrap code in an async block for top-level await support
  const wrappedCode = `
  const exports = {};

  // Start user code
  ${code}
  // End user code

  (async () => {
    const { baseUrl, accessToken, input, contentType, secrets } = event;
    const medplum = new MedplumClient({
      baseUrl,
      fetch,
    });
    medplum.setAccessToken(accessToken);
    try {
      return await exports.handler(medplum, {
        input:
          contentType === "x-application/hl7-v2+er7"
            ? Hl7Message.parse(input)
            : input,
        contentType,
        secrets,
      });
    } catch (err) {
      if (err instanceof Error) {
        console.log("Unhandled error: " + err.message + "\\n" + err.stack);
      } else if (typeof err === "object") {
        console.log("Unhandled error: " + JSON.stringify(err, undefined, 2));
      } else {
        console.log("Unhandled error: " + err);
      }
      throw err;
    }
  })();
  `;

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

async function getBotAccessToken(runAs: ProjectMembership): Promise<string> {
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

  return accessToken;
}

async function getBotSecrets(bot: Bot): Promise<Record<string, string>> {
  const project = await systemRepo.readResource<Project>('Project', bot.meta?.project as string);
  const secrets = Object.fromEntries(project.secret?.map((secret) => [secret.name, secret]) || []);
  return secrets;
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

async function readStreamToString(stream: Readable): Promise<string> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}
