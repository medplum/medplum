// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import {
  CreateMicrovmImageCommand,
  GetMicrovmCommand,
  GetMicrovmImageCommand,
  LambdaMicrovmsClient,
  RunMicrovmCommand,
} from '@aws-sdk/client-lambda-microvms';
import type { WithId } from '@medplum/core';
import { sleep } from '@medplum/core';
import type { Bot } from '@medplum/fhirtypes';
import type { BotExecutionContext, BotExecutionResult } from '../../bots/types';
import { getConfig } from '../../config/loader';
import { normalizeBinaryUrl } from '../../fhir/rewrite';
import { getBinaryStorageKey } from '../../storage/base';
import { getBinaryStorage } from '../../storage/loader';
import { S3Storage } from './storage';

export function getBotMicrovmName(bot: WithId<Bot>): string {
  return `bot-${bot.id}-image`;
}

export async function deployBotMicrovmImage(bot: WithId<Bot>): Promise<string> {
  const config = getConfig();
  const region = config.awsRegion;

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

  const client = new LambdaMicrovmsClient({
    region,
  });

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

export async function executeMicrovmBot(context: BotExecutionContext): Promise<BotExecutionResult> {
  const { bot, input } = context;
  const config = getConfig();
  const region = config.awsRegion;
  const name = getBotMicrovmName(bot);

  const client = new LambdaMicrovmsClient({
    region,
  });

  const image = await client.send(
    new GetMicrovmImageCommand({
      imageIdentifier: name,
    })
  );

  const imageArn = image.imageArn;
  if (!imageArn) {
    throw new Error('MicroVM image ARN is missing');
  }

  const result = await client.send(
    new RunMicrovmCommand({
      imageIdentifier: imageArn,
      runHookPayload: JSON.stringify(input),
      ingressNetworkConnectors: [`arn:aws:lambda:${region}:aws:network-connector:aws-network-connector:ALL_INGRESS`],
      egressNetworkConnectors: [`arn:aws:lambda:${region}:aws:network-connector:aws-network-connector:INTERNET_EGRESS`],
      idlePolicy: {
        autoResumeEnabled: true,
        maxIdleDurationSeconds: 900,
        suspendedDurationSeconds: 300,
      },
    })
  );

  const microvmId = result.microvmId;
  if (!microvmId) {
    throw new Error('Failed to run MicroVM');
  }

  for (;;) {
    const microvm = await client.send(
      new GetMicrovmCommand({
        microvmIdentifier: microvmId,
      })
    );

    switch (microvm.state) {
      case 'RUNNING':
        return { success: true, logResult: `MicroVM running at ${microvm.endpoint}` };

      case 'TERMINATED':
        throw new Error(`MicroVM terminated while starting: ${microvm.stateReason ?? 'unknown reason'}`);

      default:
        await sleep(2000);
    }
  }
}
