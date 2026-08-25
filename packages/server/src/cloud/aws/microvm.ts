// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { GetMicrovmResponse, RunMicrovmResponse } from '@aws-sdk/client-lambda-microvms';
import {
  CreateMicrovmImageCommand,
  GetMicrovmCommand,
  GetMicrovmImageCommand,
  LambdaMicrovmsClient,
  RunMicrovmCommand,
  TerminateMicrovmCommand,
} from '@aws-sdk/client-lambda-microvms';
import type { WithId } from '@medplum/core';
import { createReference, normalizeErrorString, sleep } from '@medplum/core';
import type { AsyncJob, Bot, Parameters } from '@medplum/fhirtypes';
import type { BotExecutionContext, BotExecutionResult } from '../../bots/types';
import { getConfig } from '../../config/loader';
import type { Repository } from '../../fhir/repo';
import { getProjectSystemRepo } from '../../fhir/repo';
import { normalizeBinaryUrl } from '../../fhir/rewrite';
import { getLogger } from '../../logger';
import { getBinaryStorageKey } from '../../storage/base';
import { getBinaryStorage } from '../../storage/loader';
import { buildLambdaPayload } from './execute';
import { S3Storage } from './storage';

/** The `AsyncJob.type` used for MicroVM bot invocations. */
export const MICROVM_ASYNC_JOB_TYPE = 'aws-lambda-microvm';

export function getBotMicrovmName(bot: WithId<Bot>): string {
  return `bot-${bot.id}-image`;
}

export async function deployBotMicrovmImage(bot: WithId<Bot>): Promise<string> {
  const config = getConfig();

  const baseImageArn = config.awsLambdaMicrovmBaseImageArn;
  if (!baseImageArn) {
    throw new Error('Missing AWS Lambda MicroVM base image ARN in configuration');
  }

  const buildRoleArn = config.awsLambdaMicrovmBuildRoleArn;
  if (!buildRoleArn) {
    throw new Error('Missing AWS Lambda MicroVM build role ARN in configuration');
  }

  const executableCode = bot.executableCode;
  if (!executableCode?.url) {
    throw new Error('Bot does not have executable code');
  }

  const binaryParts = normalizeBinaryUrl(executableCode.url);
  if (!binaryParts.id || !binaryParts.versionId) {
    throw new Error('Bot executable code URL is not a valid S3 URL');
  }

  const storage = getBinaryStorage();
  if (!(storage instanceof S3Storage)) {
    throw new Error('AWS Lambda MicroVM requires S3 storage');
  }

  const name = getBotMicrovmName(bot);
  const bucket = storage.bucket;
  const key = getBinaryStorageKey(binaryParts.id, binaryParts.versionId);

  const client = getMicrovmClient();

  await client.send(
    new CreateMicrovmImageCommand({
      name,
      codeArtifact: { uri: `s3://${bucket}/${key}` },
      baseImageArn,
      buildRoleArn,
    })
  );

  for (;;) {
    const image = await client.send(
      new GetMicrovmImageCommand({
        imageIdentifier: name,
      })
    );

    switch (image.state) {
      case 'CREATED':
        return image.imageArn as string;

      case 'CREATE_FAILED':
        throw new Error('MicroVM image build failed');

      default:
        await sleep(2000);
    }
  }
}

let client: LambdaMicrovmsClient | undefined;

export function getMicrovmClient(): LambdaMicrovmsClient {
  client ??= new LambdaMicrovmsClient({ region: getConfig().awsRegion });
  return client;
}

/**
 * Starts a MicroVM for a Bot and returns an `AsyncJob` handle for it.
 *
 * MicroVMs can run for hours, so this never waits for the run to finish. The `AsyncJob`
 * is the handle used to check on the run ({@link reconcileMicrovmJob}) and to stop it
 * ({@link terminateMicrovm}). The agent inside the MicroVM is expected to close out the
 * `AsyncJob` itself when it finishes.
 * @param context - The bot execution context.
 * @returns The bot execution result, carrying the `AsyncJob` handle.
 */
export async function executeMicrovmBot(context: BotExecutionContext): Promise<BotExecutionResult> {
  const { bot } = context;
  const config = getConfig();
  const region = config.awsRegion;
  const client = getMicrovmClient();

  const image = await client.send(new GetMicrovmImageCommand({ imageIdentifier: getBotMicrovmName(bot) }));
  if (!image.imageArn) {
    return { success: false, logResult: 'MicroVM image is not deployed' };
  }

  // Create the handle before starting the MicroVM, so that the AsyncJob ID can double as the
  // RunMicrovm idempotency token, and so that a failed start still leaves a record behind.
  const repo = await getProjectSystemRepo(bot.meta?.project as string);
  const asyncJob = await repo.createResource<AsyncJob>({
    resourceType: 'AsyncJob',
    type: MICROVM_ASYNC_JOB_TYPE,
    status: 'accepted',
    request: `${config.baseUrl}fhir/R4/Bot/${bot.id}/$execute`,
    requestTime: new Date().toISOString(),
    meta: { project: bot.meta?.project },
  });

  try {
    const microvm = await client.send(
      new RunMicrovmCommand({
        imageIdentifier: image.imageArn,
        clientToken: asyncJob.id,
        maximumDurationInSeconds: bot.timeout,
        runHookPayload: JSON.stringify({ ...buildLambdaPayload(context), asyncJob: createReference(asyncJob) }),
        ingressNetworkConnectors: [`arn:aws:lambda:${region}:aws:network-connector:aws-network-connector:ALL_INGRESS`],
        egressNetworkConnectors: [
          `arn:aws:lambda:${region}:aws:network-connector:aws-network-connector:INTERNET_EGRESS`,
        ],
        idlePolicy: {
          autoResumeEnabled: true,
          maxIdleDurationSeconds: 900,
          suspendedDurationSeconds: 300,
        },
      })
    );

    return {
      success: true,
      logResult: `MicroVM ${microvm.microvmId} started`,
      asyncJob: await repo.updateResource<AsyncJob>({
        ...asyncJob,
        status: 'active',
        output: microvmOutput(microvm),
      }),
    };
  } catch (err) {
    await repo.updateResource<AsyncJob>({
      ...asyncJob,
      status: 'error',
      transactionTime: new Date().toISOString(),
      output: { resourceType: 'Parameters', parameter: [{ name: 'error', valueString: normalizeErrorString(err) }] },
    });
    return { success: false, logResult: normalizeErrorString(err) };
  }
}

/**
 * Refreshes a MicroVM `AsyncJob` from the live state of its MicroVM.
 *
 * Nothing on the server polls MicroVMs, so the handle is brought up to date lazily whenever
 * someone reads it. A MicroVM that has terminated while its `AsyncJob` is still open means the
 * agent died without reporting a result, which is recorded as an error.
 * @param repo - The repository used to update the AsyncJob.
 * @param asyncJob - The AsyncJob handle to refresh.
 * @returns The refreshed AsyncJob, or the original if nothing changed.
 */
export async function reconcileMicrovmJob(repo: Repository, asyncJob: WithId<AsyncJob>): Promise<WithId<AsyncJob>> {
  const microvmId = getMicrovmId(asyncJob);
  if (!microvmId) {
    return asyncJob;
  }

  let microvm: GetMicrovmResponse;
  try {
    microvm = await getMicrovmClient().send(new GetMicrovmCommand({ microvmIdentifier: microvmId }));
  } catch (err) {
    getLogger().warn('Failed to read MicroVM state', {
      asyncJob: asyncJob.id,
      microvmId,
      error: normalizeErrorString(err),
    });
    return asyncJob;
  }

  const terminated = microvm.state === 'TERMINATED';
  if (!terminated && microvm.state === getOutputValue(asyncJob, 'state')) {
    // Avoid writing a new version of the AsyncJob on every status poll
    return asyncJob;
  }

  return repo.updateResource<AsyncJob>({
    ...asyncJob,
    status: terminated ? 'error' : 'active',
    transactionTime: terminated ? new Date().toISOString() : undefined,
    output: microvmOutput(microvm),
  });
}

/**
 * Terminates the MicroVM behind an `AsyncJob` handle, if it still has one.
 * @param asyncJob - The AsyncJob handle.
 */
export async function terminateMicrovm(asyncJob: AsyncJob): Promise<void> {
  const microvmId = getMicrovmId(asyncJob);
  if (microvmId) {
    await getMicrovmClient().send(new TerminateMicrovmCommand({ microvmIdentifier: microvmId }));
  }
}

export function getMicrovmId(asyncJob: AsyncJob): string | undefined {
  return getOutputValue(asyncJob, 'microvmId');
}

function getOutputValue(asyncJob: AsyncJob, name: string): string | undefined {
  return asyncJob.output?.parameter?.find((p) => p.name === name)?.valueString;
}

function microvmOutput(microvm: RunMicrovmResponse | GetMicrovmResponse): Parameters {
  const values: Record<string, string | undefined> = {
    microvmId: microvm.microvmId,
    state: microvm.state,
    endpoint: microvm.endpoint,
    stateReason: microvm.stateReason,
  };
  return {
    resourceType: 'Parameters',
    parameter: Object.entries(values)
      .filter(([, value]) => value !== undefined)
      .map(([name, value]) => ({ name, valueString: value })),
  };
}
