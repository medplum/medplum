import {
  CloudFormationClient,
  DescribeStackResourcesCommand,
  DescribeStacksCommand,
  ListStacksCommand,
} from '@aws-sdk/client-cloudformation';
import { ECSClient, UpdateServiceCommand } from '@aws-sdk/client-ecs';
import { mockClient } from 'aws-sdk-client-mock';
import { main } from '../index';

describe('update-server command', () => {
  beforeAll(() => {
    const cfMock = mockClient(CloudFormationClient);

    cfMock.on(ListStacksCommand).resolves({
      StackSummaries: [
        {
          StackId: '123',
          StackName: 'medplum-dev',
          StackStatus: 'CREATE_COMPLETE',
          CreationTime: new Date(),
        },
        {
          StackId: '124',
          StackName: 'medplum-incomplete',
          StackStatus: 'UPDATE_IN_PROGRESS',
          CreationTime: new Date(),
        },
        {
          StackId: '125',
          StackName: 'medplum-missing-service',
          StackStatus: 'UPDATE_IN_PROGRESS',
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

    cfMock.on(DescribeStacksCommand, { StackName: 'medplum-incomplete' }).resolves({
      Stacks: [
        {
          StackId: '123',
          StackName: 'medplum-incomplete',
          StackStatus: 'UPDATE_IN_PROGRESS',
          CreationTime: new Date(),
          Tags: [
            {
              Key: 'medplum:environment',
              Value: 'incomplete',
            },
          ],
        },
      ],
    });

    cfMock.on(DescribeStackResourcesCommand, { StackName: 'medplum-incomplete' }).resolves({
      StackResources: [],
    });

    cfMock.on(DescribeStacksCommand, { StackName: 'medplum-missing-service' }).resolves({
      Stacks: [
        {
          StackId: '123',
          StackName: 'medplum-dev',
          StackStatus: 'CREATE_COMPLETE',
          CreationTime: new Date(),
          Tags: [
            {
              Key: 'medplum:environment',
              Value: 'missing-service',
            },
          ],
        },
      ],
    });

    cfMock.on(DescribeStackResourcesCommand, { StackName: 'medplum-missing-service' }).resolves({
      StackResources: [
        {
          ResourceType: 'AWS::ECS::Cluster',
          ResourceStatus: 'CREATE_COMPLETE',
          LogicalResourceId: 'MedplumEcsCluster',
          PhysicalResourceId: 'medplum-dev-MedplumEcsCluster-125',
          Timestamp: new Date(),
        },
        {
          ResourceType: 'AWS::ECS::Service',
          ResourceStatus: 'CREATE_COMPLETE',
          LogicalResourceId: 'MedplumEcsService',
          Timestamp: new Date(),
        },
      ],
    });

    const ecsMock = mockClient(ECSClient);
    ecsMock.on(UpdateServiceCommand).resolves({});
  });

  test('Update server command', async () => {
    console.log = jest.fn();
    await main(['node', 'index.js', 'aws', 'update-server', 'dev']);
    expect(console.log).toBeCalledWith('Service "medplum-dev-MedplumEcsService-123" updated successfully.');
  });

  test('Update server not found', async () => {
    console.log = jest.fn();
    await main(['node', 'index.js', 'aws', 'update-server', 'not-found']);
    expect(console.log).toBeCalledWith('Stack not found');
  });

  test('Update server stack incomplete', async () => {
    console.log = jest.fn();
    await main(['node', 'index.js', 'aws', 'update-server', 'incomplete']);
    expect(console.log).toBeCalledWith('ECS Cluster not found');
  });

  test('Update server stack missing service', async () => {
    console.log = jest.fn();
    await main(['node', 'index.js', 'aws', 'update-server', 'missing-service']);
    expect(console.log).toBeCalledWith('ECS Service not found');
  });
});
