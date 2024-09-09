import {
  CloudFormationClient,
  DescribeStackResourcesCommand,
  DescribeStacksCommand,
  ListStacksCommand,
} from '@aws-sdk/client-cloudformation';
import { ECSClient, UpdateServiceCommand } from '@aws-sdk/client-ecs';
import { MedplumClient } from '@medplum/core';
import { mockClient } from 'aws-sdk-client-mock';
import fetch from 'node-fetch';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { unlinkSync, writeFileSync } from 'node:fs';
import { main } from '../index';
import { createMedplumClient } from '../util/client';

jest.mock('node-fetch');
jest.mock('node:child_process');
jest.mock('../util/client');

describe('update-server command', () => {
  const currentVersion = '2.4.17';
  const patchVersion = '2.4.18';
  const nextVersion = '2.5.0';
  const finalVersion = '2.6.0';

  const cfMock = mockClient(CloudFormationClient);
  let medplum: MedplumClient;
  let processError: jest.SpyInstance;

  beforeAll(() => {
    const ecsMock = mockClient(ECSClient);
    ecsMock.on(UpdateServiceCommand).resolves({});
    process.exit = jest.fn<never, any>().mockImplementation(function exit(exitCode: number) {
      throw new Error(`Process exited with exit code ${exitCode}`);
    }) as unknown as typeof process.exit;
    processError = jest.spyOn(process.stderr, 'write').mockImplementation(jest.fn());
  });

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    (fetch as unknown as jest.Mock).mockResolvedValue({
      json: jest
        .fn()
        .mockResolvedValue([
          { tag_name: finalVersion },
          { tag_name: nextVersion },
          { tag_name: patchVersion },
          { tag_name: currentVersion },
        ]),
    });

    cfMock.reset();
    cfMock.on(ListStacksCommand).resolves({
      StackSummaries: [
        {
          StackId: '123',
          StackName: 'medplum-dev',
          StackStatus: 'CREATE_COMPLETE',
          CreationTime: new Date(),
        },
      ],
    });

    cfMock.on(DescribeStacksCommand, { StackName: 'medplum-dev' }).resolves({
      Stacks: [
        {
          StackId: '123',
          StackName: 'medplum-dev',
          StackStatus: 'CREATE_COMPLETE',
          CreationTime: new Date(),
          Tags: [
            {
              Key: 'medplum:environment',
              Value: 'dev',
            },
          ],
        },
      ],
    });

    cfMock.on(DescribeStackResourcesCommand, { StackName: 'medplum-dev' }).resolves({
      StackResources: [
        {
          ResourceType: 'AWS::ECS::Cluster',
          ResourceStatus: 'CREATE_COMPLETE',
          LogicalResourceId: 'MedplumEcsCluster',
          PhysicalResourceId: 'medplum-dev-MedplumEcsCluster-123',
          Timestamp: new Date(),
        },
        {
          ResourceType: 'AWS::ECS::Service',
          ResourceStatus: 'CREATE_COMPLETE',
          LogicalResourceId: 'MedplumEcsService',
          PhysicalResourceId: 'medplum-dev-MedplumEcsService-123',
          Timestamp: new Date(),
        },
      ],
    });

    (spawnSync as unknown as jest.Mock).mockReturnValue({ status: 0 });

    console.log = jest.fn();

    medplum = {
      startAsyncRequest: jest.fn(),
      get: jest.fn().mockResolvedValue({ version: '2.4.17-b27a9f' }),
    } as unknown as MedplumClient;
    (createMedplumClient as unknown as jest.Mock).mockResolvedValue(medplum);
  });

  test('Update server command', async () => {
    const tag = randomUUID();
    const configFile = `medplum.${tag}.config.json`;
    writeFileSync(configFile, JSON.stringify({ serverImage: `medplum-server:${currentVersion}`, region: 'us-west-2' }));

    await main(['node', 'index.js', 'aws', 'update-server', tag]);
    expect(console.log).toHaveBeenCalledWith('Performing update to v2.5.0');
    expect(spawnSync).toHaveBeenCalledTimes(2);
    expect(spawnSync).toHaveBeenCalledWith(`npx cdk deploy -c config=medplum.${tag}.config.json --all`, {
      stdio: 'inherit',
    });
    expect(medplum.startAsyncRequest).toHaveBeenCalledTimes(2);
    expect(medplum.startAsyncRequest).toHaveBeenCalledWith('/admin/super/migrate');

    unlinkSync(configFile);
  });

  test('Update server not found', async () => {
    await expect(main(['node', 'index.js', 'aws', 'update-server', 'not-found'])).rejects.toThrow(
      'Process exited with exit code 1'
    );
    expect(console.log).toHaveBeenCalledWith('Configuration file medplum.not-found.config.json not found');
    expect(processError).toHaveBeenCalledWith('Error: Config not found: not-found\n');
    expect(spawnSync).not.toHaveBeenCalled();
    expect(medplum.startAsyncRequest).not.toHaveBeenCalled();
  });

  test('Update server config custom filename not found', async () => {
    await expect(main(['node', 'index.js', 'aws', 'update-server', 'not-found', '--file', 'foo.json'])).rejects.toThrow(
      'Process exited with exit code 1'
    );
    expect(console.log).toHaveBeenCalledWith('Config not found: not-found (foo.json)');
    expect(processError).toHaveBeenCalledWith('Error: Config not found: not-found\n');
    expect(spawnSync).not.toHaveBeenCalled();
    expect(medplum.startAsyncRequest).not.toHaveBeenCalled();
  });

  test('Update server from latest', async () => {
    const tag = randomUUID();
    const configFile = `medplum.${tag}.config.json`;
    writeFileSync(configFile, JSON.stringify({ serverImage: `medplum-server:latest`, region: 'us-west-2' }));

    await main(['node', 'index.js', 'aws', 'update-server', tag]);
    unlinkSync(configFile);
    expect(console.log).toHaveBeenCalledWith('Performing update to v2.5.0');
    expect(spawnSync).toHaveBeenCalledTimes(2);
    expect(spawnSync).toHaveBeenCalledWith(`npx cdk deploy -c config=medplum.${tag}.config.json --all`, {
      stdio: 'inherit',
    });
    expect(medplum.startAsyncRequest).toHaveBeenCalledTimes(2);
    expect(medplum.startAsyncRequest).toHaveBeenCalledWith('/admin/super/migrate');
  });

  test('Update to specific version', async () => {
    const tag = randomUUID();
    const configFile = `medplum.${tag}.config.json`;
    writeFileSync(configFile, JSON.stringify({ serverImage: `medplum-server:latest`, region: 'us-west-2' }));

    await main(['node', 'index.js', 'aws', 'update-server', tag, '--to-version', '2.7.13']);
    unlinkSync(configFile);
    expect(console.log).toHaveBeenCalledWith('Performing update to v2.5.0');
  });
});
