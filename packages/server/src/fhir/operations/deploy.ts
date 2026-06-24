// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import {
  allOk,
  badRequest,
  ContentType,
  createReference,
  getReferenceString,
  normalizeOperationOutcome,
  OperationOutcomeError,
} from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Attachment, Binary, Bot, OperationOutcome } from '@medplum/fhirtypes';
import { Readable } from 'node:stream';
import { isBotEnabled } from '../../bots/utils';
import { deployLambda, getLambdaTimeoutForBot } from '../../cloud/aws/deploy';
import { deployLambdaStreaming } from '../../cloud/aws/deploystreaming';
import { deployFissionBot } from '../../cloud/fission/deploy';
import { getAuthenticatedContext } from '../../context';
import { getLogger } from '../../logger';
import { getBinaryStorage } from '../../storage/loader';
import { readStreamToString } from '../../util/streams';
import { findProjectMembership } from '../../workers/utils';
import type { Repository } from '../repo';

export async function deployHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  const { id } = req.params;

  // First read the bot as the user to verify access
  await ctx.repo.readResource<Bot>('Bot', id);

  // Then read the bot as system user to load extended metadata
  const bot = await ctx.systemRepo.readResource<Bot>('Bot', id);

  // Validate that the request body has a code property
  // Or that the Bot already has executable code attached
  const code = req.body.code as string | undefined;
  const filename = req.body.filename ?? 'index.js';

  try {
    const { warning } = await deployBot(ctx.repo, bot, code, filename);
    if (warning) {
      const outcome: OperationOutcome = {
        ...allOk,
        issue: [
          ...allOk.issue,
          {
            severity: 'warning',
            code: 'business-rule',
            details: { text: warning },
          },
        ],
      };
      return [outcome];
    }
    return [allOk];
  } catch (err) {
    return [normalizeOperationOutcome(err)];
  }
}

const MISSING_PROJECT_WARNING = 'Could not determine Project for Bot';
const MISSING_MEMBERSHIP_WARNING = 'Could not find ProjectMembership for Bot';

/**
 * The result of deploying a bot.
 */
export type DeployResult = {
  /** A warning message surfaced to the caller, if any (e.g. a missing ProjectMembership). */
  warning?: string;
};

/**
 * Deploys a bot to the cloud.
 * @param repo - The repository to use to read/write the bot.
 * @param bot - The bot to deploy.
 * @param code - The code to deploy. If not provided, the existing code will be used.
 * @param filename - The filename to use for the code. If not provided, 'index.js' will be used.
 * @returns A result containing a warning message if the bot is missing a Project or ProjectMembership.
 */
export async function deployBot(
  repo: Repository,
  bot: WithId<Bot>,
  code?: string,
  filename?: string
): Promise<DeployResult> {
  if (!code && !bot.executableCode?.url) {
    throw new OperationOutcomeError(badRequest('Bot missing executable code'));
  }

  if (!(await isBotEnabled(bot))) {
    throw new OperationOutcomeError(badRequest('Bots not enabled'));
  }

  const result: DeployResult = {};
  if (!bot.runAsUser) {
    const botProject = bot.meta?.project;
    if (!botProject) {
      result.warning = MISSING_PROJECT_WARNING;
      getLogger().warn(MISSING_PROJECT_WARNING, { botId: bot.id });
    } else {
      const membership = await findProjectMembership(botProject, createReference(bot));
      if (!membership) {
        result.warning = MISSING_MEMBERSHIP_WARNING;
        getLogger().warn(MISSING_MEMBERSHIP_WARNING, { botId: bot.id, botProject });
      }
    }
  }

  let updatedBot: WithId<Bot> | undefined;

  let codeToDeploy = code;
  if (code) {
    const contentType = ContentType.JAVASCRIPT;

    // Create a Binary for the executable code
    const binary = await repo.createResource<Binary>({
      resourceType: 'Binary',
      contentType,
    });
    await getBinaryStorage().writeBinary(binary, filename, contentType, Readable.from(code));

    // Update the bot
    updatedBot = await repo.updateResource<Bot>({
      ...bot,
      executableCode: {
        contentType,
        url: getReferenceString(binary),
        title: filename,
      },
    });
  } else {
    const binary = await repo.readReference<Binary>({
      reference: (bot.executableCode as Attachment).url,
    });
    const stream = await getBinaryStorage().readBinary(binary);
    codeToDeploy = await readStreamToString(stream);
  }

  let latestBot = updatedBot ?? bot;

  // Deploy the bot
  if (latestBot.runtimeVersion === 'awslambda') {
    if (latestBot.timeout === undefined) {
      latestBot = await repo.updateResource<Bot>({
        ...latestBot,
        timeout: await getLambdaTimeoutForBot(latestBot),
      });
    }

    if (latestBot.streamingEnabled) {
      await deployLambdaStreaming(latestBot, codeToDeploy as string);
    } else {
      await deployLambda(latestBot, codeToDeploy as string);
    }
  } else if (latestBot.runtimeVersion === 'fission') {
    await deployFissionBot(latestBot, codeToDeploy as string);
  }

  return result;
}
