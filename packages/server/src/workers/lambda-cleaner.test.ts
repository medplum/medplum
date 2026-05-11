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
import 'aws-sdk-client-mock-jest';
import { loadTestConfig } from '../config/loader';
import { execLambdaCleanerJob } from './lambda-cleaner';

describe('Lambda version cleanup worker', () => {
  let mockLambdaClient: AwsClientStub<LambdaClient>;

  beforeAll(async () => {
    await loadTestConfig();
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

    const summary = await execLambdaCleanerJob(
      {
        nameRegex: '^medplum-bot-lambda-*',
        keepLatest: 1,
        deleteConcurrency: 2,
        dryRun: false,
      },
      new LambdaClient({ region: 'us-east-1' })
    );

    expect(summary).toMatchObject({
      options: {
        nameRegex: '^medplum-bot-lambda-*',
        keepLatest: 1,
        deleteConcurrency: 2,
        dryRun: false,
      },
      functionsScanned: 3,
      functionsMatched: 2,
      functionsWithDeleteCandidates: 2,
      publishedVersionsScanned: 6,
      versionsPlanned: 4,
      versionsDeleted: 2,
      versionsNotFound: 1,
      versionsHasAlias: 1,
      durationMs: expect.any(Number),
    });

    expect(mockLambdaClient).toHaveReceivedCommandTimes(ListAliasesCommand, 0);
    expect(mockLambdaClient).toHaveReceivedCommandTimes(DeleteFunctionCommand, 4);
    expect(mockLambdaClient).toHaveReceivedCommandWith(DeleteFunctionCommand, {
      FunctionName: 'medplum-bot-lambda-a',
      Qualifier: '1',
    });
    expect(mockLambdaClient).toHaveReceivedCommandWith(DeleteFunctionCommand, {
      FunctionName: 'medplum-bot-lambda-b',
      Qualifier: '1',
    });
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

    expect(summary.versionsPlanned).toBe(1);
    expect(summary.versionsDeleted).toBe(0);
    expect(mockLambdaClient).toHaveReceivedCommandTimes(DeleteFunctionCommand, 0);
  });
});
