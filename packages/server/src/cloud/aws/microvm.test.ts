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
import type { AsyncJob, Binary, Bot, ProjectMembership } from '@medplum/fhirtypes';
import type { AwsClientStub } from 'aws-sdk-client-mock';
import { mockClient } from 'aws-sdk-client-mock';
import { initAppServices, shutdownApp } from '../../app';
import type { BotExecutionContext } from '../../bots/types';
import { getConfig, loadTestConfig } from '../../config/loader';
import type { Repository } from '../../fhir/repo';
import { getProjectSystemRepo } from '../../fhir/repo';
import { initBinaryStorage } from '../../storage/loader';
import { createTestProject } from '../../test.setup';
import {
  deployBotMicrovmImage,
  executeMicrovmBot,
  getMicrovmId,
  MICROVM_ASYNC_JOB_TYPE,
  reconcileMicrovmJob,
  terminateMicrovm,
} from './microvm';

describe('MicroVM', () => {
  let projectId: string;
  let membership: WithId<ProjectMembership>;
  let systemRepo: Repository;
  let bot: WithId<Bot>;
  let binary: WithId<Binary>;

  let mockS3Client: AwsClientStub<S3Client>;
  let mockMicrovmClient: AwsClientStub<LambdaMicrovmsClient>;

  /**
   * Creates an AsyncJob for a MicroVM that was last seen running.
   * @param withMicrovm - False for a job whose MicroVM never started.
   * @returns The new AsyncJob.
   */
  function createMicrovmJob(withMicrovm = true): Promise<WithId<AsyncJob>> {
    return systemRepo.createResource<AsyncJob>({
      resourceType: 'AsyncJob',
      meta: { project: projectId },
      type: MICROVM_ASYNC_JOB_TYPE,
      status: withMicrovm ? 'active' : 'accepted',
      request: `Bot/${bot.id}/$execute`,
      requestTime: new Date().toISOString(),
      output: withMicrovm
        ? {
            resourceType: 'Parameters',
            parameter: [
              { name: 'microvmId', valueString: 'vm-1' },
              { name: 'state', valueString: 'RUNNING' },
            ],
          }
        : undefined,
    });
  }

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);

    const testProject = await createTestProject({ withClient: true });
    projectId = testProject.project.id;
    membership = testProject.membership;
    systemRepo = await getProjectSystemRepo(projectId);

    bot = await systemRepo.createResource<Bot>({
      resourceType: 'Bot',
      meta: { project: projectId },
      name: 'MicroVM Bot',
      runtimeVersion: 'awslambdamicrovm',
      timeout: 3600,
    });
    binary = await systemRepo.createResource<Binary>({
      resourceType: 'Binary',
      meta: { project: projectId },
      contentType: 'application/zip',
    });
  });

  afterAll(async () => {
    await shutdownApp();
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
  });

  describe('deployBotMicrovmImage', () => {
    test('Builds from a copy in the artifact prefix', async () => {
      const key = `${binary.id}/${binary.meta?.versionId}`;

      await expect(deployBotMicrovmImage(bot, binary)).resolves.toBe('arn:image');

      expect(mockS3Client.commandCalls(CopyObjectCommand)[0].args[0].input).toMatchObject({
        CopySource: `my-bucket/binary/${key}`,
        Bucket: 'my-bucket',
        Key: `bot-microvm/${bot.id}/${key}`,
      });
      expect(mockMicrovmClient.commandCalls(CreateMicrovmImageCommand)[0].args[0].input).toMatchObject({
        name: `medplum-bot-microvm-${bot.id}`,
        baseImageArn: 'arn:base-image',
        buildRoleArn: 'arn:build-role',
        codeArtifact: { uri: `s3://my-bucket/bot-microvm/${bot.id}/${key}` },
        logging: { cloudWatch: { logGroup: `/aws/lambda-microvms/medplum-bot-${bot.id}` } },
      });
    });

    test('Rejects configuration it cannot build with', async () => {
      const config = getConfig();

      config.awsLambdaMicrovmBaseImageArn = undefined;
      await expect(deployBotMicrovmImage(bot, binary)).rejects.toThrow('Missing AWS Lambda MicroVM base image ARN');
      config.awsLambdaMicrovmBaseImageArn = 'arn:base-image';

      config.awsLambdaMicrovmBuildRoleArn = undefined;
      await expect(deployBotMicrovmImage(bot, binary)).rejects.toThrow('Missing AWS Lambda MicroVM build role ARN');
      config.awsLambdaMicrovmBuildRoleArn = 'arn:build-role';

      initBinaryStorage('file:' + process.cwd());
      await expect(deployBotMicrovmImage(bot, binary)).rejects.toThrow('requires S3 storage');

      config.sseCustomerKey = Buffer.alloc(32).toString('base64');
      initBinaryStorage('s3:my-bucket');
      await expect(deployBotMicrovmImage(bot, binary)).rejects.toThrow('does not support SSE-C');

      expect(mockS3Client.commandCalls(CopyObjectCommand)).toHaveLength(0);
      expect(mockMicrovmClient.commandCalls(CreateMicrovmImageCommand)).toHaveLength(0);
    });
  });

  describe('executeMicrovmBot', () => {
    let context: BotExecutionContext;

    beforeEach(() => {
      context = {
        bot,
        runAs: membership,
        requester: membership.profile,
        input: { hello: 'world' },
        contentType: 'application/json',
        accessToken: 'access-token',
        secrets: {},
      };
      mockMicrovmClient.on(GetMicrovmImageCommand).resolves({ imageArn: 'arn:image' });
    });

    test('Starts a MicroVM and returns an active AsyncJob', async () => {
      mockMicrovmClient
        .on(RunMicrovmCommand)
        .resolves({ microvmId: 'vm-1', state: 'RUNNING', endpoint: 'https://vm-1.example.com' });

      const result = await executeMicrovmBot(context);

      expect(result.success).toBe(true);
      expect(result.logResult).toBe('MicroVM vm-1 started');
      expect(mockMicrovmClient.commandCalls(GetMicrovmImageCommand)[0].args[0].input).toEqual({
        imageIdentifier: `medplum-bot-microvm-${bot.id}`,
      });

      const asyncJob = await systemRepo.readResource<AsyncJob>('AsyncJob', result.asyncJob?.id as string);
      expect(asyncJob).toMatchObject({ type: MICROVM_ASYNC_JOB_TYPE, status: 'active', meta: { project: projectId } });
      expect(getMicrovmId(asyncJob)).toBe('vm-1');

      // The AsyncJob is created before the MicroVM starts, as the idempotency token
      const history = await systemRepo.readHistory<AsyncJob>('AsyncJob', asyncJob.id);
      expect(history.entry?.at(-1)?.resource?.status).toBe('accepted');

      const input = mockMicrovmClient.commandCalls(RunMicrovmCommand)[0].args[0].input;
      expect(input).toMatchObject({
        imageIdentifier: 'arn:image',
        clientToken: asyncJob.id,
        maximumDurationInSeconds: 3600,
      });
      expect(JSON.parse(input.runHookPayload as string)).toMatchObject({
        bot: { reference: `Bot/${bot.id}` },
        input: { hello: 'world' },
        accessToken: 'access-token',
        asyncJob: { reference: `AsyncJob/${asyncJob.id}` },
      });
    });

    test('Fails when the image is not deployed', async () => {
      mockMicrovmClient.on(GetMicrovmImageCommand).resolves({});

      const result = await executeMicrovmBot(context);

      expect(result).toEqual({ success: false, logResult: 'MicroVM image is not deployed' });
      expect(mockMicrovmClient.commandCalls(RunMicrovmCommand)).toHaveLength(0);
    });

    test('Records the error on the AsyncJob when the MicroVM fails to start', async () => {
      mockMicrovmClient.on(RunMicrovmCommand).rejects(new Error('Capacity exceeded'));

      const result = await executeMicrovmBot(context);

      expect(result).toEqual({ success: false, logResult: 'Capacity exceeded' });
      const jobId = mockMicrovmClient.commandCalls(RunMicrovmCommand)[0].args[0].input.clientToken as string;
      const asyncJob = await systemRepo.readResource<AsyncJob>('AsyncJob', jobId);
      expect(asyncJob).toMatchObject({
        status: 'error',
        transactionTime: expect.any(String),
        output: { resourceType: 'Parameters', parameter: [{ name: 'error', valueString: 'Capacity exceeded' }] },
      });
    });
  });

  describe('reconcileMicrovmJob', () => {
    test('Tracks MicroVM state changes, writing only when the state changed', async () => {
      const job = await createMicrovmJob();

      mockMicrovmClient.on(GetMicrovmCommand).resolves({ microvmId: 'vm-1', state: 'RUNNING' });
      await expect(reconcileMicrovmJob(systemRepo, job)).resolves.toBe(job);

      mockMicrovmClient.on(GetMicrovmCommand).resolves({ microvmId: 'vm-1', state: 'SUSPENDED' });
      const suspended = await reconcileMicrovmJob(systemRepo, job);
      expect(suspended.meta?.versionId).not.toBe(job.meta?.versionId);
      expect(suspended.status).toBe('active');
      expect(suspended.output?.parameter).toContainEqual({ name: 'state', valueString: 'SUSPENDED' });

      mockMicrovmClient.on(GetMicrovmCommand).resolves({ microvmId: 'vm-1', state: 'TERMINATED' });
      const terminated = await reconcileMicrovmJob(systemRepo, suspended);
      expect(terminated.status).toBe('error');
      expect(terminated.transactionTime).toBeDefined();
    });

    test('Does not clobber a job the agent completed concurrently', async () => {
      mockMicrovmClient.on(GetMicrovmCommand).resolves({ microvmId: 'vm-1', state: 'TERMINATED' });
      const staleJob = await createMicrovmJob();
      await systemRepo.updateResource<AsyncJob>({ ...staleJob, status: 'completed' });

      const result = await reconcileMicrovmJob(systemRepo, staleJob);

      expect(result.status).toBe('completed');
      expect(await systemRepo.readResource<AsyncJob>('AsyncJob', staleJob.id)).toMatchObject({ status: 'completed' });
    });

    test('Leaves the job alone when the MicroVM state cannot be read', async () => {
      mockMicrovmClient.on(GetMicrovmCommand).rejects(new Error('Throttling'));
      const job = await createMicrovmJob();

      await expect(reconcileMicrovmJob(systemRepo, job)).resolves.toBe(job);
    });
  });

  describe('terminateMicrovm', () => {
    test('Terminates the MicroVM behind the job', async () => {
      mockMicrovmClient.on(TerminateMicrovmCommand).resolves({});
      await terminateMicrovm(await createMicrovmJob());
      expect(mockMicrovmClient.commandCalls(TerminateMicrovmCommand)[0].args[0].input).toEqual({
        microvmIdentifier: 'vm-1',
      });
    });
  });

  test('Ignores jobs whose MicroVM never started', async () => {
    const job = await createMicrovmJob(false);

    await expect(reconcileMicrovmJob(systemRepo, job)).resolves.toBe(job);
    await terminateMicrovm(job);
    expect(mockMicrovmClient.calls()).toHaveLength(0);
  });
});
