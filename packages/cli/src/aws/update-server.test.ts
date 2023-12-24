import {
  CloudFormationClient,
  DescribeStackResourcesCommand,
  DescribeStacksCommand,
  ListStacksCommand,
} from '@aws-sdk/client-cloudformation';
import { ECSClient, UpdateServiceCommand } from '@aws-sdk/client-ecs';
import { mockClient } from 'aws-sdk-client-mock';
import { main } from '../index';
import { unlinkSync, writeFileSync } from 'fs';
import { spawnSync } from 'child_process';
import fetch from 'node-fetch';
import { MedplumClient } from '@medplum/core';
import { createMedplumClient } from '../util/client';

jest.mock('node-fetch');
jest.mock('child_process');
jest.mock('../util/client');

describe('update-server command', () => {
  const configFile = 'medplum.dev.config.json';
  const currentVersion = '2.4.17';
  const patchVersion = '2.4.18';
  const nextVersion = '2.5.0';
  const finalVersion = '2.6.0';

  const cfMock = mockClient(CloudFormationClient);
  let medplum: MedplumClient;

  beforeAll(() => {
    const ecsMock = mockClient(ECSClient);
    ecsMock.on(UpdateServiceCommand).resolves({});
  });

  beforeEach(() => {
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
    writeFileSync(configFile, JSON.stringify({ serverImage: `medplum-server:${currentVersion}`, region: 'us-west-2' }));

    medplum = { startAsyncRequest: jest.fn() } as unknown as MedplumClient;
    (createMedplumClient as unknown as jest.Mock).mockResolvedValue(medplum);
  });

  afterEach(() => {
    unlinkSync(configFile);
  });

  test('Update server command', async () => {
    await main(['node', 'index.js', 'aws', 'update-server', 'dev']);
    expect(console.log).toBeCalledWith('Performing update to v2.5.0');
    expect(spawnSync).toHaveBeenCalledTimes(2);
    expect(spawnSync).toHaveBeenCalledWith(`npx cdk deploy -c config=medplum.dev.config.json --all`, {
      stdio: 'inherit',
    });
    expect(medplum.startAsyncRequest).toHaveBeenCalledTimes(2);
    expect(medplum.startAsyncRequest).toHaveBeenCalledWith('/admin/super/migrate');
  });

  test('Update config not found', async () => {
    await main(['node', 'index.js', 'aws', 'update-server', 'not-found']);
    expect(console.log).toBeCalledWith('Configuration file medplum.not-found.config.json not found');
    expect(spawnSync).not.toHaveBeenCalled();
    expect(medplum.startAsyncRequest).not.toHaveBeenCalled();
  });
});
