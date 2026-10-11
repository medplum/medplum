// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  CreateMicrovmImageCommand,
  GetMicrovmCommand,
  GetMicrovmImageCommand,
  LambdaMicrovmsClient,
  RunMicrovmCommand,
  TerminateMicrovmCommand,
} from '@aws-sdk/client-lambda-microvms';
import { CopyObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { WithId } from '@medplum/core';
import { badRequest, OperationOutcomeError, preconditionFailed } from '@medplum/core';
import type { AsyncJob, Binary, Bot, ProjectMembership } from '@medplum/fhirtypes';
import type { AwsClientStub } from 'aws-sdk-client-mock';
import { mockClient } from 'aws-sdk-client-mock';
import { vi } from 'vitest';
import type { BotExecutionContext } from '../../bots/types';
import { getConfig, loadTestConfig } from '../../config/loader';
import type * as RepoModule from '../../fhir/repo';
import { initBinaryStorage } from '../../storage/loader';
import {
  deployBotMicrovmImage,
  executeMicrovmBot,
  getMicrovmId,
  MICROVM_ASYNC_JOB_TYPE,
  reconcileMicrovmJob,
  terminateMicrovm,
} from './microvm';

const repoMocks = vi.hoisted(() => ({ getProjectSystemRepo: vi.fn() }));

vi.mock('../../fhir/repo', async (importOriginal) => ({
  ...(await importOriginal<typeof RepoModule>()),
  getProjectSystemRepo: repoMocks.getProjectSystemRepo,
}));

describe('MicroVM', () => {
  const bot = {
    resourceType: 'Bot',
    id: 'bot-123',
    meta: { project: 'project-1' },
    timeout: 3600,
  } as WithId<Bot>;
  const binary = { resourceType: 'Binary', id: 'bin-456', meta: { versionId: 'v1' } } as WithId<Binary>;

  const activeJob: WithId<AsyncJob> = {
    resourceType: 'AsyncJob',
    id: 'job-1',
    meta: { versionId: 'v1' },
    type: MICROVM_ASYNC_JOB_TYPE,
    status: 'active',
    request: 'Bot/bot-123/$execute',
    requestTime: '2026-10-11T00:00:00.000Z',
    output: {
      resourceType: 'Parameters',
      parameter: [
        { name: 'microvmId', valueString: 'vm-1' },
        { name: 'state', valueString: 'RUNNING' },
      ],
    },
  };

  let mockS3Client: AwsClientStub<S3Client>;
  let mockMicrovmClient: AwsClientStub<LambdaMicrovmsClient>;

  beforeAll(async () => {
    await loadTestConfig();
  });

  beforeEach(() => {
    const config = getConfig();
    config.awsRegion = 'us-east-1';
    config.awsLambdaMicrovmBaseImageArn = 'arn:base-image';
    config.awsLambdaMicrovmBuildRoleArn = 'arn:build-role';
    config.sseCustomerKey = undefined;
    initBinaryStorage('s3:my-bucket');

    mockS3Client = mockClient(S3Client);
    mockS3Client.on(CopyObjectCommand).resolves({});
    mockMicrovmClient = mockClient(LambdaMicrovmsClient);
    mockMicrovmClient.on(CreateMicrovmImageCommand).resolves({ imageArn: 'arn:image' });
  });

  afterEach(() => {
    mockS3Client.restore();
    mockMicrovmClient.restore();
    vi.clearAllMocks();
  });

  describe('deployBotMicrovmImage', () => {
    test('Builds from a copy in the artifact prefix', async () => {
      await expect(deployBotMicrovmImage(bot, binary)).resolves.toBe('arn:image');

      expect(mockS3Client.commandCalls(CopyObjectCommand)[0].args[0].input).toMatchObject({
        CopySource: 'my-bucket/binary/bin-456/v1',
        Bucket: 'my-bucket',
        Key: 'bot-microvm/bot-123/bin-456/v1',
      });
      expect(mockMicrovmClient.commandCalls(CreateMicrovmImageCommand)[0].args[0].input).toMatchObject({
        name: 'medplum-bot-microvm-bot-123',
        baseImageArn: 'arn:base-image',
        buildRoleArn: 'arn:build-role',
        codeArtifact: { uri: 's3://my-bucket/bot-microvm/bot-123/bin-456/v1' },
        logging: { cloudWatch: { logGroup: '/aws/lambda-microvms/medplum-bot-bot-123' } },
      });
    });

    test('Requires a base image ARN', async () => {
      getConfig().awsLambdaMicrovmBaseImageArn = undefined;
      await expect(deployBotMicrovmImage(bot, binary)).rejects.toThrow('Missing AWS Lambda MicroVM base image ARN');
      expect(mockMicrovmClient.commandCalls(CreateMicrovmImageCommand)).toHaveLength(0);
    });

    test('Requires a build role ARN', async () => {
      getConfig().awsLambdaMicrovmBuildRoleArn = undefined;
      await expect(deployBotMicrovmImage(bot, binary)).rejects.toThrow('Missing AWS Lambda MicroVM build role ARN');
      expect(mockMicrovmClient.commandCalls(CreateMicrovmImageCommand)).toHaveLength(0);
    });

    test('Requires S3 storage', async () => {
      initBinaryStorage('file:' + process.cwd());
      await expect(deployBotMicrovmImage(bot, binary)).rejects.toThrow('requires S3 storage');
      expect(mockMicrovmClient.commandCalls(CreateMicrovmImageCommand)).toHaveLength(0);
    });

    test('Rejects SSE-C storage', async () => {
      getConfig().sseCustomerKey = Buffer.alloc(32).toString('base64');
      initBinaryStorage('s3:my-bucket');

      await expect(deployBotMicrovmImage(bot, binary)).rejects.toThrow('does not support SSE-C');
      expect(mockS3Client.commandCalls(CopyObjectCommand)).toHaveLength(0);
      expect(mockMicrovmClient.commandCalls(CreateMicrovmImageCommand)).toHaveLength(0);
    });

    test('Does not build when the artifact copy fails', async () => {
      mockS3Client.on(CopyObjectCommand).rejects(new Error('Access Denied'));
      await expect(deployBotMicrovmImage(bot, binary)).rejects.toThrow('Access Denied');
      expect(mockMicrovmClient.commandCalls(CreateMicrovmImageCommand)).toHaveLength(0);
    });
  });

  describe('executeMicrovmBot', () => {
    const context: BotExecutionContext = {
      bot,
      runAs: { resourceType: 'ProjectMembership' } as WithId<ProjectMembership>,
      requester: { reference: 'Practitioner/123' },
      input: { hello: 'world' },
      contentType: 'application/json',
      accessToken: 'access-token',
      secrets: {},
    };

    let repo: { createResource: ReturnType<typeof vi.fn>; updateResource: ReturnType<typeof vi.fn> };

    beforeEach(() => {
      repo = {
        createResource: vi.fn(async (job: AsyncJob) => ({ ...job, id: 'job-1' })),
        updateResource: vi.fn(async (job: AsyncJob) => job),
      };
      repoMocks.getProjectSystemRepo.mockResolvedValue(repo);
      mockMicrovmClient.on(GetMicrovmImageCommand).resolves({ imageArn: 'arn:image' });
    });

    test('Starts a MicroVM and returns an active AsyncJob', async () => {
      mockMicrovmClient
        .on(RunMicrovmCommand)
        .resolves({ microvmId: 'vm-1', state: 'RUNNING', endpoint: 'https://vm-1.example.com' });

      const result = await executeMicrovmBot(context);

      expect(result.success).toBe(true);
      expect(result.logResult).toBe('MicroVM vm-1 started');
      expect(result.asyncJob).toMatchObject({
        id: 'job-1',
        type: MICROVM_ASYNC_JOB_TYPE,
        status: 'active',
        meta: { project: 'project-1' },
      });
      expect(getMicrovmId(result.asyncJob as AsyncJob)).toBe('vm-1');
      expect(repoMocks.getProjectSystemRepo).toHaveBeenCalledWith('project-1');

      // The AsyncJob is created before the MicroVM starts, as the idempotency token
      expect(repo.createResource).toHaveBeenCalledWith(expect.objectContaining({ status: 'accepted' }));
      const input = mockMicrovmClient.commandCalls(RunMicrovmCommand)[0].args[0].input;
      expect(input).toMatchObject({
        imageIdentifier: 'arn:image',
        clientToken: 'job-1',
        maximumDurationInSeconds: 3600,
      });

      const payload = JSON.parse(input.runHookPayload as string);
      expect(payload).toMatchObject({
        bot: { reference: 'Bot/bot-123' },
        input: { hello: 'world' },
        accessToken: 'access-token',
        asyncJob: { reference: 'AsyncJob/job-1' },
      });
    });

    test('Looks up the image by bot name', async () => {
      mockMicrovmClient.on(RunMicrovmCommand).resolves({ microvmId: 'vm-1', state: 'RUNNING' });
      await executeMicrovmBot(context);
      expect(mockMicrovmClient.commandCalls(GetMicrovmImageCommand)[0].args[0].input).toEqual({
        imageIdentifier: 'medplum-bot-microvm-bot-123',
      });
    });

    test('Fails without creating an AsyncJob when the image is not deployed', async () => {
      mockMicrovmClient.on(GetMicrovmImageCommand).resolves({});

      const result = await executeMicrovmBot(context);

      expect(result).toEqual({ success: false, logResult: 'MicroVM image is not deployed' });
      expect(repo.createResource).not.toHaveBeenCalled();
      expect(mockMicrovmClient.commandCalls(RunMicrovmCommand)).toHaveLength(0);
    });

    test('Records the error on the AsyncJob when the MicroVM fails to start', async () => {
      mockMicrovmClient.on(RunMicrovmCommand).rejects(new Error('Capacity exceeded'));

      const result = await executeMicrovmBot(context);

      expect(result).toEqual({ success: false, logResult: 'Capacity exceeded' });
      expect(result.asyncJob).toBeUndefined();
      expect(repo.updateResource).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'job-1',
          status: 'error',
          transactionTime: expect.any(String),
          output: { resourceType: 'Parameters', parameter: [{ name: 'error', valueString: 'Capacity exceeded' }] },
        })
      );
    });
  });

  describe('reconcileMicrovmJob', () => {
    test('Records a terminated MicroVM with a conditional update', async () => {
      mockMicrovmClient.on(GetMicrovmCommand).resolves({ microvmId: 'vm-1', state: 'TERMINATED' });
      const updateResource = vi.fn(async (job: AsyncJob) => job);
      const repo = { updateResource } as unknown as RepoModule.Repository;

      const result = await reconcileMicrovmJob(repo, activeJob);

      expect(result.status).toBe('error');
      expect(result.transactionTime).toBeDefined();
      expect(updateResource).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' }), { ifMatch: 'v1' });
    });

    test('Records a MicroVM state change while it is still running', async () => {
      mockMicrovmClient.on(GetMicrovmCommand).resolves({ microvmId: 'vm-1', state: 'SUSPENDED' });
      const updateResource = vi.fn(async (job: AsyncJob) => job);
      const repo = { updateResource } as unknown as RepoModule.Repository;

      const result = await reconcileMicrovmJob(repo, activeJob);

      expect(result.status).toBe('active');
      expect(result.transactionTime).toBeUndefined();
      expect(result.output?.parameter).toContainEqual({ name: 'state', valueString: 'SUSPENDED' });
    });

    test('Skips the write when the MicroVM state is unchanged', async () => {
      mockMicrovmClient.on(GetMicrovmCommand).resolves({ microvmId: 'vm-1', state: 'RUNNING' });
      const updateResource = vi.fn();
      const repo = { updateResource } as unknown as RepoModule.Repository;

      await expect(reconcileMicrovmJob(repo, activeJob)).resolves.toBe(activeJob);
      expect(updateResource).not.toHaveBeenCalled();
    });

    test('Does not clobber a job the agent completed concurrently', async () => {
      mockMicrovmClient.on(GetMicrovmCommand).resolves({ microvmId: 'vm-1', state: 'TERMINATED' });
      const completedJob: WithId<AsyncJob> = { ...activeJob, meta: { versionId: 'v2' }, status: 'completed' };
      const repo = {
        updateResource: vi.fn().mockRejectedValue(new OperationOutcomeError(preconditionFailed)),
        readResource: vi.fn().mockResolvedValue(completedJob),
      } as unknown as RepoModule.Repository;

      await expect(reconcileMicrovmJob(repo, activeJob)).resolves.toBe(completedJob);
    });

    test('Rethrows other update errors', async () => {
      mockMicrovmClient.on(GetMicrovmCommand).resolves({ microvmId: 'vm-1', state: 'TERMINATED' });
      const repo = {
        updateResource: vi.fn().mockRejectedValue(new OperationOutcomeError(badRequest('Invalid'))),
      } as unknown as RepoModule.Repository;

      await expect(reconcileMicrovmJob(repo, activeJob)).rejects.toThrow('Invalid');
    });

    test('Leaves the job alone when it has no MicroVM', async () => {
      const acceptedJob: WithId<AsyncJob> = { ...activeJob, status: 'accepted', output: undefined };
      const repo = { updateResource: vi.fn() } as unknown as RepoModule.Repository;

      await expect(reconcileMicrovmJob(repo, acceptedJob)).resolves.toBe(acceptedJob);
      expect(mockMicrovmClient.commandCalls(GetMicrovmCommand)).toHaveLength(0);
    });

    test('Leaves the job alone when the MicroVM state cannot be read', async () => {
      mockMicrovmClient.on(GetMicrovmCommand).rejects(new Error('Throttling'));
      const updateResource = vi.fn();
      const repo = { updateResource } as unknown as RepoModule.Repository;

      await expect(reconcileMicrovmJob(repo, activeJob)).resolves.toBe(activeJob);
      expect(updateResource).not.toHaveBeenCalled();
    });
  });

  describe('terminateMicrovm', () => {
    test('Terminates the MicroVM behind the job', async () => {
      mockMicrovmClient.on(TerminateMicrovmCommand).resolves({});
      await terminateMicrovm(activeJob);
      expect(mockMicrovmClient.commandCalls(TerminateMicrovmCommand)[0].args[0].input).toEqual({
        microvmIdentifier: 'vm-1',
      });
    });

    test('Does nothing when the job has no MicroVM', async () => {
      await terminateMicrovm({ ...activeJob, output: undefined });
      expect(mockMicrovmClient.commandCalls(TerminateMicrovmCommand)).toHaveLength(0);
    });
  });
});
