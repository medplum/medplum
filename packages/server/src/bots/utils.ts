// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  allOk,
  badRequest,
  ContentType,
  createReference,
  Hl7Message,
  isOperationOutcome,
  normalizeErrorString,
  OperationOutcomeError,
  resolveId,
  serverError,
  WithId,
} from '@medplum/core';
import { FhirRequest } from '@medplum/fhir-router';
import {
  AuditEvent,
  Bot,
  Login,
  OperationOutcome,
  Organization,
  Parameters,
  Project,
  ProjectMembership,
  ProjectSetting,
  Reference,
} from '@medplum/fhirtypes';
import { Request } from 'express';
import { randomUUID } from 'node:crypto';
import { getConfig } from '../config/loader';
import { AuthenticatedRequestContext, buildTracingExtension } from '../context';
import { getSystemRepo, Repository } from '../fhir/repo';
import { getLogger } from '../logger';
import { generateAccessToken } from '../oauth/keys';
import { getBinaryStorage } from '../storage/loader';
import { AuditEventOutcome, logAuditEvent } from '../util/auditevent';
import { createAuditEventEntities, findProjectMembership } from '../workers/utils';
import { BotExecutionRequest, BotExecutionResult } from './types';

/**
 * Returns the bot's project membership.
 * If the bot is configured to run as the user, then use the current user's membership.
 * Otherwise, use the bot's project membership
 * @param ctx - The authenticated request context.
 * @param bot - The bot resource.
 * @returns The project membership for the bot.
 */
export async function getBotProjectMembership(
  ctx: AuthenticatedRequestContext,
  bot: WithId<Bot>
): Promise<ProjectMembership> {
  if (bot.runAsUser) {
    // If the bot is configured to run as the user, then use the current user's membership
    return ctx.membership;
  }
  // Otherwise, use the bot's project membership
  const project = bot.meta?.project as string;
  return (await findProjectMembership(project, createReference(bot))) ?? ctx.membership;
}

/**
 * Returns the default headers to add to the MedplumClient.
 * If the bot is configured to run as the user, then include the HTTP cookies from the request.
 * Otherwise, no default headers are added.
 * @param req - The HTTP request.
 * @param bot - The bot resource.
 * @returns The default headers to add to the MedplumClient.
 */
export function getBotDefaultHeaders(req: Request | FhirRequest, bot: WithId<Bot>): Record<string, string> | undefined {
  let defaultHeaders: Record<string, string> | undefined;
  if (bot.runAsUser) {
    defaultHeaders = {
      Cookie: req.headers?.cookie as string,
    };
  }
  return defaultHeaders;
}
export function getResponseBodyFromResult(
  result: BotExecutionResult
): string | { [key: string]: any } | any[] | boolean {
  let responseBody = result.returnValue;
  if (responseBody === undefined) {
    // If the bot did not return a value, then return an OperationOutcome
    responseBody = result.success ? allOk : badRequest(result.logResult);
  } else if (typeof responseBody === 'number') {
    // If the bot returned a number, then we must convert it to a string
    // Otherwise, express will interpret it as an HTTP status code
    responseBody = responseBody.toString();
  }

  return responseBody;
}

export function getOutParametersFromResult(result: OperationOutcome | BotExecutionResult): Parameters {
  const responseBody = isOperationOutcome(result) ? result : getResponseBodyFromResult(result);
  switch (typeof responseBody) {
    case 'string':
      return {
        resourceType: 'Parameters',
        parameter: [{ name: 'responseBody', valueString: responseBody }],
      };
    case 'object':
      if (isOperationOutcome(responseBody)) {
        return {
          resourceType: 'Parameters',
          parameter: [{ name: 'outcome', resource: responseBody }],
        };
      }
      return {
        resourceType: 'Parameters',
        parameter: [{ name: 'responseBody', valueString: JSON.stringify(responseBody) }],
      };
    case 'boolean':
      return {
        resourceType: 'Parameters',
        parameter: [{ name: 'responseBody', valueBoolean: responseBody }],
      };
    default:
      throw new OperationOutcomeError(serverError(new Error('Bot returned response.returnVal with an invalid type')));
  }
}

/**
 * Returns true if the bot is enabled and bots are enabled for the project.
 * @param bot - The bot resource.
 * @returns True if the bot is enabled.
 */
export async function isBotEnabled(bot: Bot): Promise<boolean> {
  const systemRepo = getSystemRepo();
  const project = await systemRepo.readResource<Project>('Project', bot.meta?.project as string);
  return !!project.features?.includes('bots');
}

/**
 * Writes the bot input to storage.
 * This is used both by AWS Lambda bots and VM context bots.
 *
 * There are 3 main reasons we do this:
 * 1. To ensure that the bot input is available for debugging.
 * 2. In the future, to support replaying bot executions.
 * 3. To support analytics on bot input.
 *
 * For the analytics use case, we align with Amazon guidelines for AWS Athena:
 * 1. Creating tables in Athena: https://docs.aws.amazon.com/athena/latest/ug/creating-tables.html
 * 2. Partitioning data in Athena: https://docs.aws.amazon.com/athena/latest/ug/partitions.html
 *
 * @param request - The bot request.
 */
export async function writeBotInputToStorage(request: BotExecutionRequest): Promise<void> {
  const { bot, contentType, input } = request;
  const now = new Date();
  const today = now.toISOString().substring(0, 10).replaceAll('-', '/');
  const key = `bot/${bot.meta?.project}/${today}/${now.getTime()}-${randomUUID()}.json`;
  const row: Record<string, unknown> = {
    contentType,
    input,
    botId: bot.id,
    projectId: bot.meta?.project,
    accountId: bot.meta?.account,
    subscriptionId: request.subscription?.id,
    agentId: request.agent?.id,
    deviceId: request.device?.id,
    remoteAddress: request.remoteAddress,
    forwardedFor: request.forwardedFor,
  };

  if (contentType === ContentType.HL7_V2) {
    let hl7Message: Hl7Message | undefined = undefined;

    if (input instanceof Hl7Message) {
      hl7Message = request.input;
    } else if (typeof input === 'string') {
      try {
        hl7Message = Hl7Message.parse(request.input);
      } catch (err) {
        getLogger().debug(`Failed to parse HL7 message: ${normalizeErrorString(err)}`);
      }
    }

    if (hl7Message) {
      const msh = hl7Message.header;
      row.input = hl7Message.toString();
      row.hl7SendingApplication = msh.getComponent(3, 1);
      row.hl7SendingFacility = msh.getComponent(4, 1);
      row.hl7ReceivingApplication = msh.getComponent(5, 1);
      row.hl7ReceivingFacility = msh.getComponent(6, 1);
      row.hl7MessageType = msh.getComponent(9, 1);
      row.hl7Version = msh.getComponent(12, 1);

      const pid = hl7Message.getSegment('PID');
      row.hl7PidId = pid?.getComponent(2, 1);
      row.hl7PidMrn = pid?.getComponent(3, 1);

      const obx = hl7Message.getSegment('OBX');
      row.hl7ObxId = obx?.getComponent(3, 1);
      row.hl7ObxAccession = obx?.getComponent(18, 1);
    }
  }

  await getBinaryStorage().writeFile(key, ContentType.JSON, JSON.stringify(row));
}

export async function getBotAccessToken(runAs: ProjectMembership): Promise<string> {
  const systemRepo = getSystemRepo();

  // Create the Login resource
  const login = await systemRepo.createResource<Login>({
    resourceType: 'Login',
    authMethod: 'execute',
    user: runAs.user,
    membership: createReference(runAs),
    authTime: new Date().toISOString(),
    scope: 'openid',
    granted: true,
  });

  // Create the access token
  const accessToken = await generateAccessToken({
    login_id: login.id,
    sub: resolveId(runAs.user?.reference as Reference) as string,
    username: resolveId(runAs.user?.reference as Reference) as string,
    profile: runAs.profile?.reference as string,
    scope: 'openid',
  });

  return accessToken;
}

/**
 * Returns a collection of secrets for the bot.
 *
 * Secrets can come from 1-4 different sources. Order is important. The operating principles are:
 *
 *   1. Most specific beats more general - the runAs project secrets override the bot project secrets
 *   2. Defer to local control" - project admin secrets override system secrets
 *
 * From lowest to highest priority:
 *
 *   1. Bot project system secrets (if bot.system is true)
 *   2. Bot project secrets
 *   3. RunAs project system secrets (if bot.system is true and running in a different linked project)
 *   4. RunAs project secrets (if running in a different linked project)
 *
 * @param bot - The bot to get secrets for.
 * @param runAs - The project membership to get secrets for.
 * @returns The collection of secrets.
 */
export async function getBotSecrets(bot: Bot, runAs: ProjectMembership): Promise<Record<string, ProjectSetting>> {
  const systemRepo = getSystemRepo();
  const botProjectId = bot.meta?.project as string;
  const runAsProjectId = resolveId(runAs.project) as string;
  const system = !!bot.system;
  const secrets: ProjectSetting[] = [];
  if (botProjectId !== runAsProjectId) {
    await addBotSecrets(systemRepo, botProjectId, system, secrets);
  }
  await addBotSecrets(systemRepo, runAsProjectId, system, secrets);
  return Object.fromEntries(secrets.map((s) => [s.name, s]));
}

async function addBotSecrets(
  systemRepo: Repository,
  projectId: string,
  system: boolean,
  out: ProjectSetting[]
): Promise<void> {
  const project = await systemRepo.readResource<Project>('Project', projectId);
  if (system && project.systemSecret) {
    out.push(...project.systemSecret);
  }
  if (project.secret) {
    out.push(...project.secret);
  }
}

const MIRRORED_CONTENT_TYPES: string[] = [ContentType.TEXT, ContentType.HL7_V2];

export function getResponseContentType(req: Request): string {
  const requestContentType = req.get('Content-Type');
  if (requestContentType && MIRRORED_CONTENT_TYPES.includes(requestContentType)) {
    return requestContentType;
  }

  // Default to JSON
  return ContentType.JSON;
}

/**
 * Creates an AuditEvent for a subscription attempt.
 * @param request - The bot request.
 * @param startTime - The time the execution attempt started.
 * @param outcome - The outcome code.
 * @param outcomeDesc - The outcome description text.
 */
export async function createAuditEvent(
  request: BotExecutionRequest,
  startTime: string,
  outcome: AuditEventOutcome,
  outcomeDesc: string
): Promise<void> {
  const { bot, runAs } = request;
  const trigger = bot.auditEventTrigger ?? 'always';
  if (
    trigger === 'never' ||
    (trigger === 'on-error' && outcome === AuditEventOutcome.Success) ||
    (trigger === 'on-output' && outcomeDesc.length === 0)
  ) {
    return;
  }

  const auditEvent: AuditEvent = {
    resourceType: 'AuditEvent',
    meta: {
      project: resolveId(runAs.project) as string,
      account: bot.meta?.account,
    },
    period: {
      start: startTime,
      end: new Date().toISOString(),
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
    entity: createAuditEventEntities(bot, request.input, request.subscription, request.agent, request.device),
    outcome,
    extension: buildTracingExtension(),
  };

  const config = getConfig();
  const destination = bot.auditEventDestination ?? ['resource'];
  if (destination.includes('resource')) {
    const systemRepo = getSystemRepo();
    const maxDescLength = config.maxBotLogLengthForResource ?? 10 * 1024;
    await systemRepo.createResource<AuditEvent>({
      ...auditEvent,
      outcomeDesc: outcomeDesc.substring(outcomeDesc.length - maxDescLength),
    });
  }
  if (destination.includes('log')) {
    const maxDescLength = config.maxBotLogLengthForLogs ?? 10 * 1024;
    logAuditEvent({
      ...auditEvent,
      outcomeDesc: outcomeDesc.substring(outcomeDesc.length - maxDescLength),
    });
  }
}
