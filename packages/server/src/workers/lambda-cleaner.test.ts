// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  DeleteFunctionCommand,
  LambdaClient,
  ListAliasesCommand,
  ListFunctionsCommand,
  ListVersionsByFunctionCommand,
  ResourceConflictException,
  ResourceNotFoundException,
} from '@aws-sdk/client-lambda';
import type { AwsClientStub } from 'aws-sdk-client-mock';
import { mockClient } from 'aws-sdk-client-mock';
import type { Job } from 'bullmq';
import assert from 'node:assert';
import { initAppServices, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { AsyncJobExecutor } from '../fhir/operations/utils/asyncjobexecutor';
import { getShardSystemRepo } from '../fhir/repo';
import { PLACEHOLDER_SHARD_ID } from '../fhir/sharding';
import type { LambdaCleanerJobData } from './lambda-cleaner';
import { execLambdaCleanerJob, lambdaCleanerJobProcessor } from './lambda-cleaner';

describe('Lambda version cleanup worker', () => {
  let mockLambdaClient: AwsClientStub<LambdaClient>;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);
  });
  afterAll(async () => {
    await shutdownApp();
  });

  beforeEach(() => {
    mockLambdaClient = mockClient(LambdaClient);
  });

  afterEach(() => {
    mockLambdaClient.restore();
  });

  test('cleanupLambdaVersions deletes old matching function versions', async () => {
    mockLambdaClient.on(ListFunctionsCommand).resolves({
      Functions: [
        { FunctionName: 'medplum-bot-lambda-a' },
        { FunctionName: 'other-function' },
        { FunctionName: 'medplum-bot-lambda-b' },
      ],
    });
    mockLambdaClient.on(ListVersionsByFunctionCommand).callsFake(({ FunctionName }) => {
      if (FunctionName === 'medplum-bot-lambda-a') {
        return {
          Versions: [{ Version: '$LATEST' }, { Version: '1' }, { Version: '2' }, { Version: '3' }, { Version: '4' }],
        };
      }
      if (FunctionName === 'medplum-bot-lambda-b') {
        return {
          Versions: [{ Version: '$LATEST' }, { Version: '1' }, { Version: '2' }],
        };
      }
      throw new Error(`Unexpected function: ${FunctionName}`);
    });
    mockLambdaClient.on(ListAliasesCommand).callsFake(({ FunctionName }) => {
      if (FunctionName === 'medplum-bot-lambda-a') {
        return {
          Aliases: [
            {
              Name: 'prod',
              FunctionVersion: '3',
              RoutingConfig: { AdditionalVersionWeights: { '2': 0.1 } },
            },
          ],
        };
      }
      return { Aliases: [] };
    });
    // mockLambdaClient.on(DeleteFunctionCommand).resolves({});
    mockLambdaClient.on(DeleteFunctionCommand).callsFake(({ FunctionName, Qualifier }) => {
      if (FunctionName === 'medplum-bot-lambda-a' && Qualifier === '2') {
        throw new ResourceConflictException({ $metadata: {}, message: 'Version has an alias' });
      }
      if (FunctionName === 'medplum-bot-lambda-b' && Qualifier === '1') {
        throw new ResourceNotFoundException({ $metadata: {}, message: 'Version not found' });
      }
      return {};
    });

    const systemRepo = getShardSystemRepo(PLACEHOLDER_SHARD_ID);
    const exec = new AsyncJobExecutor(systemRepo);
    const asyncJob = await exec.init('/some-url');
    const job = {
      data: {
        asyncJob,
        options: { nameRegex: '^medplum-bot-lambda-*', keepLatest: 1, deleteConcurrency: 2, dryRun: false },
      },
    } as unknown as Job<LambdaCleanerJobData>;
    const updatedAsyncJob = await lambdaCleanerJobProcessor(job);

    const output = updatedAsyncJob.output;
    assert(output);
    expect(output.parameter?.find((p) => p.name === 'versionsDeleted')?.valueInteger).toBe(2);
    expect(output.parameter?.find((p) => p.name === 'versionsNotFound')?.valueInteger).toBe(1);
    expect(output.parameter?.find((p) => p.name === 'versionsHasAlias')?.valueInteger).toBe(1);

    expect(mockLambdaClient.commandCalls(ListAliasesCommand)).toHaveLength(0);
    expect(mockLambdaClient.commandCalls(DeleteFunctionCommand)).toHaveLength(4);
    expect(
      mockLambdaClient.commandCalls(DeleteFunctionCommand, {
        FunctionName: 'medplum-bot-lambda-a',
        Qualifier: '1',
      })
    ).toHaveLength(1);
    expect(
      mockLambdaClient.commandCalls(DeleteFunctionCommand, {
        FunctionName: 'medplum-bot-lambda-b',
        Qualifier: '1',
      })
    ).toHaveLength(1);
  });

  test('cleanupLambdaVersions dry run does not delete', async () => {
    mockLambdaClient.on(ListFunctionsCommand).resolves({
      Functions: [{ FunctionName: 'medplum-bot-lambda-a' }],
    });
    mockLambdaClient.on(ListVersionsByFunctionCommand).resolves({
      Versions: [{ Version: '$LATEST' }, { Version: '1' }, { Version: '2' }],
    });
    mockLambdaClient.on(ListAliasesCommand).resolves({ Aliases: [] });
    mockLambdaClient.on(DeleteFunctionCommand).resolves({});

    const summary = await execLambdaCleanerJob(
      {
        nameRegex: '^medplum-bot-lambda-[a-z]$',
        keepLatest: 1,
        dryRun: true,
      },
      new LambdaClient({ region: 'us-east-1' })
    );

    expect(summary).toStrictEqual({
      options: {
        nameRegex: '^medplum-bot-lambda-[a-z]$',
        keepLatest: 1,
        dryRun: true,
        deleteConcurrency: 1,
      },
      publishedVersionsScanned: 2,
      functionsScanned: 1,
      functionsWithDeleteCandidates: 1,
      functionsMatched: 1,
      versionsPlanned: 1,
      versionsDeleted: 0,
      versionsNotFound: 0,
      versionsHasAlias: 0,
      durationMs: expect.any(Number),
    });

    // expect(summary.versionsPlanned).toBe(1);
    // expect(summary.versionsDeleted).toBe(0);
    expect(mockLambdaClient.commandCalls(DeleteFunctionCommand)).toHaveLength(0);
  });
});
