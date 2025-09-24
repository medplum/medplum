// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  allOk,
  badRequest,
  ContentType,
  getReferenceString,
  normalizeOperationOutcome,
  OperationOutcomeError,
  WithId,
} from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { Attachment, Binary, Bot } from '@medplum/fhirtypes';
import { Readable } from 'node:stream';
import { isBotEnabled } from '../../bots/utils';
import { deployLambda, getLambdaTimeoutForBot } from '../../cloud/aws/deploy';
import { deployFissionBot } from '../../cloud/fission/deploy';
import { getAuthenticatedContext } from '../../context';
import { getBinaryStorage } from '../../storage/loader';
import { readStreamToString } from '../../util/streams';
import { getSystemRepo, Repository } from '../repo';

export async function deployHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  const { id } = req.params;

  // First read the bot as the user to verify access
  await ctx.repo.readResource<Bot>('Bot', id);

  // Then read the bot as system user to load extended metadata
  const systemRepo = getSystemRepo();
  const bot = await systemRepo.readResource<Bot>('Bot', id);

  // Validate that the request body has a code property
  // Or that the Bot already has executable code attached
  const code = req.body.code as string | undefined;
  const filename = req.body.filename ?? 'index.js';

  try {
    await deployBot(ctx.repo, bot, code, filename);
    return [allOk];
  } catch (err) {
    return [normalizeOperationOutcome(err)];
  }
}

/**
 * Deploys a bot to the cloud.
 * @param repo - The repository to use to read/write the bot.
 * @param bot - The bot to deploy.
 * @param code - The code to deploy. If not provided, the existing code will be used.
 * @param filename - The filename to use for the code. If not provided, 'index.js' will be used.
 */
export async function deployBot(repo: Repository, bot: WithId<Bot>, code?: string, filename?: string): Promise<void> {
  if (!code && !bot.executableCode?.url) {
    throw new OperationOutcomeError(badRequest('Bot missing executable code'));
  }

  if (!(await isBotEnabled(bot))) {
    throw new OperationOutcomeError(badRequest('Bots not enabled'));
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
      reference: (bot.executableCode as Attachment).url as string,
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
    await deployLambda(latestBot, codeToDeploy as string);
  } else if (latestBot.runtimeVersion === 'fission') {
    await deployFissionBot(latestBot, codeToDeploy as string);
  }
}
