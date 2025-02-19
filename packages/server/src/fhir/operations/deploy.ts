import { ContentType, allOk, badRequest, getReferenceString, normalizeOperationOutcome } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { Attachment, Binary, Bot } from '@medplum/fhirtypes';
import { Readable } from 'node:stream';
import { deployLambda, getLambdaTimeoutForBot } from '../../cloud/aws/deploy';
import { getAuthenticatedContext } from '../../context';
import { readStreamToString } from '../../util/streams';
import { getSystemRepo } from '../repo';
import { getBinaryStorage } from '../storage';
import { isBotEnabled } from './execute';

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
  if (!code && !bot.executableCode?.url) {
    return [badRequest('Bot missing executable code')];
  }

  if (!(await isBotEnabled(bot))) {
    return [badRequest('Bots not enabled')];
  }

  try {
    let updatedBot: Bot | undefined;

    let codeToDeploy = code;
    if (code) {
      const filename = req.body.filename ?? 'index.js';
      const contentType = ContentType.JAVASCRIPT;

      // Create a Binary for the executable code
      const binary = await ctx.repo.createResource<Binary>({
        resourceType: 'Binary',
        contentType,
      });
      await getBinaryStorage().writeBinary(binary, filename, contentType, Readable.from(code));

      // Update the bot
      updatedBot = await ctx.repo.updateResource<Bot>({
        ...bot,
        executableCode: {
          contentType,
          url: getReferenceString(binary),
          title: filename,
        },
      });
    } else {
      const binary = await systemRepo.readReference<Binary>({
        reference: (bot.executableCode as Attachment).url as string,
      });
      const stream = await getBinaryStorage().readBinary(binary);
      codeToDeploy = await readStreamToString(stream);
    }

    let latestBot = updatedBot ?? bot;

    // Deploy the bot
    if (latestBot.runtimeVersion === 'awslambda') {
      if (latestBot.timeout === undefined) {
        latestBot = await ctx.repo.updateResource<Bot>({
          ...latestBot,
          timeout: await getLambdaTimeoutForBot(latestBot),
        });
      }
      await deployLambda(latestBot, codeToDeploy as string);
    }

    return [allOk];
  } catch (err) {
    return [normalizeOperationOutcome(err)];
  }
}
