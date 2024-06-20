import { ContentType, allOk, badRequest, getReferenceString, normalizeOperationOutcome } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { Binary, Bot } from '@medplum/fhirtypes';
import { Readable } from 'stream';
import { deployLambda } from '../../cloud/aws/deploy';
import { getAuthenticatedContext } from '../../context';
import { getSystemRepo } from '../repo';
import { getBinaryStorage } from '../storage';
import { isBotEnabled } from './execute';

export async function deployHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  const { id } = req.params;

  // Validate that the request body has a code property
  const code = req.body.code as string | undefined;
  if (!code) {
    return [badRequest('Missing code')];
  }

  // First read the bot as the user to verify access
  await ctx.repo.readResource<Bot>('Bot', id);

  // Then read the bot as system user to load extended metadata
  const systemRepo = getSystemRepo();
  const bot = await systemRepo.readResource<Bot>('Bot', id);

  if (!(await isBotEnabled(bot))) {
    return [badRequest('Bots not enabled')];
  }

  try {
    const filename = req.body.filename ?? 'index.js';
    const contentType = ContentType.JAVASCRIPT;

    // Create a Binary for the executable code
    const binary = await ctx.repo.createResource<Binary>({
      resourceType: 'Binary',
      contentType,
    });
    await getBinaryStorage().writeBinary(binary, filename, contentType, Readable.from(code));

    // Update the bot
    const updatedBot = await ctx.repo.updateResource<Bot>({
      ...bot,
      executableCode: {
        contentType,
        url: getReferenceString(binary),
        title: filename,
      },
    });

    // Deploy the bot
    if (updatedBot.runtimeVersion === 'awslambda') {
      await deployLambda(updatedBot, code);
    }

    return [allOk];
  } catch (err) {
    return [normalizeOperationOutcome(err)];
  }
}
