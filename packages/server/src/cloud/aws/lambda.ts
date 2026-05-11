// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  DeleteFunctionCommand,
  LambdaClient,
  ListAliasesCommand,
  ListVersionsByFunctionCommand,
  ResourceNotFoundException,
} from '@aws-sdk/client-lambda';
import { ConfiguredRetryStrategy } from '@smithy/util-retry';
import { getConfig } from '../../config/loader';
import { getLogger } from '../../logger';

/**
 * Creates a new AWS Lambda client with a custom retry strategy.
 * @returns A configured LambdaClient.
 */
export function createLambdaClient(): LambdaClient {
  return new LambdaClient({
    region: getConfig().awsRegion,
    retryStrategy: new ConfiguredRetryStrategy(
      5, // max attempts
      (attempt: number) => 500 * 2 ** attempt // Exponential backoff
    ),
  });
}

export interface DeleteLambdaVersionOptions {
  readonly dryRun: boolean;
  readonly keepLatest?: number;
  readonly deleteConcurrency?: number;
}

export interface DeleteOldLambdaVersionStats {
  functionsWithDeleteCandidates: number;
  publishedVersionsScanned: number;
  aliasProtectedVersions: number;
  versionsPlanned: number;
  versionsDeleted: number;
  versionsNotFound: number;
}

/**
 * Deletes old published versions of an AWS Lambda function.
 * @param client - The AWS Lambda client.
 * @param functionName - The name of the function to delete versions for.
 * @param options - The options for the delete.
 * @param stats - (Optional) If provided, the stats object will be updated with the results of the delete.
 */
export async function deleteOldLambdaVersions(
  client: LambdaClient,
  functionName: string,
  options: DeleteLambdaVersionOptions,
  stats?: DeleteOldLambdaVersionStats
): Promise<void> {
  const keepLatest = options.keepLatest ?? 1;
  const deleteConcurrency = options.deleteConcurrency ?? 2;

  if (keepLatest < 1) {
    throw new Error('keepLatest must be at least 1');
  }

  const aliasVersions = await listAliasVersions(client, functionName);
  const keepVersions = new Set<string>(aliasVersions);

  const versions = await listPublishedVersions(client, functionName);
  for (let i = 0; i < keepLatest; i++) {
    keepVersions.add(versions[i]);
  }

  const deleteCandidates = versions.filter((v) => !keepVersions.has(v));
  if (stats) {
    stats.publishedVersionsScanned += versions.length;
    stats.aliasProtectedVersions += aliasVersions.size;
    stats.versionsPlanned += deleteCandidates.length;
  }

  if (deleteCandidates.length === 0) {
    return;
  }

  if (stats) {
    stats.functionsWithDeleteCandidates++;
  }

  if (options.dryRun) {
    for (const version of deleteCandidates) {
      getLogger().info('Would delete Lambda function version', { functionName, version });
    }
    return;
  }

  await runWithConcurrency(deleteCandidates, deleteConcurrency, async (version) => {
    const result = await deleteLambdaVersion(client, functionName, version);
    if (stats) {
      if (result === 'deleted') {
        stats.versionsDeleted++;
      } else {
        stats.versionsNotFound++;
      }
    }
  });
}

/**
 * Lists all published versions of a Lambda function.
 * @param client - The AWS Lambda client.
 * @param functionName - The name of the function to list versions for.
 * @returns A list of published version numbers sorted in descending order.
 */
async function listPublishedVersions(client: LambdaClient, functionName: string): Promise<string[]> {
  const versions: string[] = [];
  let marker: string | undefined;

  do {
    const response = await client.send(
      new ListVersionsByFunctionCommand({ FunctionName: functionName, Marker: marker })
    );
    marker = response.NextMarker;

    for (const version of response.Versions ?? []) {
      if (version.Version && version.Version !== '$LATEST') {
        versions.push(version.Version);
      }
    }
  } while (marker);

  return versions.sort((a, b) => Number(b) - Number(a));
}

const SKIP_ALIAS_VERSIONS = true;
const EMPTY_SET = new Set<string>();
async function listAliasVersions(client: LambdaClient, functionName: string): Promise<Set<string>> {
  if (SKIP_ALIAS_VERSIONS) {
    return EMPTY_SET;
  }

  const versions = new Set<string>();
  let marker: string | undefined;

  do {
    const response = await client.send(new ListAliasesCommand({ FunctionName: functionName, Marker: marker }));
    marker = response.NextMarker;

    for (const alias of response.Aliases ?? []) {
      if (alias.FunctionVersion) {
        versions.add(alias.FunctionVersion);
      }
      for (const version of Object.keys(alias.RoutingConfig?.AdditionalVersionWeights ?? {})) {
        versions.add(version);
      }
    }
  } while (marker);

  return versions;
}

async function deleteLambdaVersion(
  client: LambdaClient,
  functionName: string,
  version: string
): Promise<'deleted' | 'not-found'> {
  try {
    await client.send(new DeleteFunctionCommand({ FunctionName: functionName, Qualifier: version }));
    getLogger().info('Deleted Lambda function version', { functionName, version });
    return 'deleted';
  } catch (err) {
    if (err instanceof ResourceNotFoundException) {
      getLogger().info('Lambda function version already deleted', { functionName, version });
      return 'not-found';
    }

    throw err;
  }
}

async function runWithConcurrency<T>(
  jobs: T[],
  concurrency: number,
  callback: (job: T) => Promise<void>
): Promise<void> {
  let nextIndex = 0;
  const workerCount = Math.min(jobs.length, concurrency);

  // invoke and wait for `workerCount` while loop workers to complete
  // each worker processes items off the `items` queue one at a time until the queue is empty
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < jobs.length) {
        const job = jobs[nextIndex++];
        await callback(job);
      }
    })
  );
}
