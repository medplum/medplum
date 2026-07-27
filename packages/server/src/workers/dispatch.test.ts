// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { DeleteFunctionCommand, LambdaClient, ResourceNotFoundException } from '@aws-sdk/client-lambda';
import { createReference } from '@medplum/core';
import type { Bot, Patient } from '@medplum/fhirtypes';
import type { AwsClientStub } from 'aws-sdk-client-mock';
import { mockClient } from 'aws-sdk-client-mock';
import { vi } from 'vitest';
import { initAppServices, shutdownApp } from '../app';
import { getConfig, loadTestConfig } from '../config/loader';
import { Repository } from '../fhir/repo';
import { getLogger } from '../logger';
import { createTestProject, withTestContext } from '../test.setup';
import { findAndExecDispatchJob } from './test-utils';

describe('Dispatch Worker', () => {
  let botRepo: Repository;
  let mockLambdaClient: AwsClientStub<LambdaClient>;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);

    const botProjectDetails = await createTestProject({ withClient: true });
    botRepo = new Repository({
      extendedMode: true,
      projects: [botProjectDetails.project],
      author: createReference(botProjectDetails.client),
    });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  beforeEach(() => {
    getConfig().dispatchEnabled = true;
    mockLambdaClient = mockClient(LambdaClient);
    mockLambdaClient.on(DeleteFunctionCommand).resolves({});
  });

  afterEach(() => {
    mockLambdaClient.restore();
  });

  test('deletes corresponding Lambda when an awslambda Bot is deleted', async () => {
    const bot = await withTestContext(() =>
      botRepo.createResource<Bot>({
        resourceType: 'Bot',
        name: 'lambda-bot',
        runtimeVersion: 'awslambda',
      })
    );

    await withTestContext(() => botRepo.deleteResource('Bot', bot.id));
    await findAndExecDispatchJob(bot, 'delete');

    const expectedName = `medplum-bot-lambda-${bot.id}`;
    expect(mockLambdaClient.commandCalls(DeleteFunctionCommand, { FunctionName: expectedName })).toHaveLength(1);
    expect(mockLambdaClient.commandCalls(DeleteFunctionCommand)).toHaveLength(1);
  });

  test('does not dispatch jobs when disabled', async () => {
    getConfig().dispatchEnabled = false;

    const bot = await withTestContext(() =>
      botRepo.createResource<Bot>({
        resourceType: 'Bot',
        name: 'lambda-bot-disabled',
        runtimeVersion: 'awslambda',
      })
    );

    await withTestContext(() => botRepo.deleteResource('Bot', bot.id));
    await expect(findAndExecDispatchJob(bot, 'delete')).resolves.toBeUndefined();

    expect(mockLambdaClient.commandCalls(DeleteFunctionCommand)).toHaveLength(0);
  });

  test('does not interact with Lambda when Bot runtimeVersion is not awslambda', async () => {
    const bot = await withTestContext(() =>
      botRepo.createResource<Bot>({
        resourceType: 'Bot',
        name: 'vmcontext-bot',
        runtimeVersion: 'vmcontext',
      })
    );

    await withTestContext(() => botRepo.deleteResource('Bot', bot.id));
    await findAndExecDispatchJob(bot, 'delete');

    expect(mockLambdaClient.commandCalls(DeleteFunctionCommand)).toHaveLength(0);
  });

  test('does not interact with Lambda when a non-Bot resource is deleted', async () => {
    const patient = await withTestContext(() =>
      botRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ family: 'Test' }],
      })
    );

    await withTestContext(() => botRepo.deleteResource('Patient', patient.id));
    await findAndExecDispatchJob(patient, 'delete');

    expect(mockLambdaClient.commandCalls(DeleteFunctionCommand)).toHaveLength(0);
  });

  test('does not interact with Lambda when interaction is not delete', async () => {
    const bot = await withTestContext(() =>
      botRepo.createResource<Bot>({
        resourceType: 'Bot',
        name: 'lambda-bot-create',
        runtimeVersion: 'awslambda',
      })
    );

    await findAndExecDispatchJob(bot, 'create');

    expect(mockLambdaClient.commandCalls(DeleteFunctionCommand)).toHaveLength(0);
  });

  test('does not log error when Lambda does not exist (DeleteFunction throws ResourceNotFoundException)', async () => {
    const bot = await withTestContext(() =>
      botRepo.createResource<Bot>({
        resourceType: 'Bot',
        name: 'lambda-bot-missing',
        runtimeVersion: 'awslambda',
      })
    );

    const expectedName = `medplum-bot-lambda-${bot.id}`;

    mockLambdaClient
      .on(DeleteFunctionCommand)
      .rejects(new ResourceNotFoundException({ $metadata: {}, message: 'Function not found' }));

    const errorSpy = vi.spyOn(getLogger(), 'error').mockImplementation(() => undefined);

    await withTestContext(() => botRepo.deleteResource('Bot', bot.id));
    await expect(findAndExecDispatchJob(bot, 'delete')).resolves.toBeUndefined();

    expect(mockLambdaClient.commandCalls(DeleteFunctionCommand, { FunctionName: expectedName })).toHaveLength(1);
    expect(errorSpy).not.toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  test('logs but does not throw when DeleteFunction fails', async () => {
    const bot = await withTestContext(() =>
      botRepo.createResource<Bot>({
        resourceType: 'Bot',
        name: 'lambda-bot-error',
        runtimeVersion: 'awslambda',
      })
    );

    const expectedName = `medplum-bot-lambda-${bot.id}`;

    mockLambdaClient.on(DeleteFunctionCommand).rejects(new Error('Lambda blew up'));

    const errorSpy = vi.spyOn(getLogger(), 'error').mockImplementation(() => undefined);

    await withTestContext(() => botRepo.deleteResource('Bot', bot.id));
    await expect(findAndExecDispatchJob(bot, 'delete')).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(
      'Error deleting Lambda for Bot',
      expect.objectContaining({ botId: bot.id, lambdaName: expectedName })
    );

    errorSpy.mockRestore();
  });
});
