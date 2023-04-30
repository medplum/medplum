import {
  CloudFormationClient,
  DescribeStackResourcesCommand,
  DescribeStacksCommand,
  ListStacksCommand,
} from '@aws-sdk/client-cloudformation';
import { ECSClient, UpdateServiceCommand } from '@aws-sdk/client-ecs';
import { MockClient } from '@medplum/mock';
import { mockClient } from 'aws-sdk-client-mock';
import { main } from '../index';

const medplum = new MockClient();

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

    const ecsMock = mockClient(ECSClient);
    ecsMock.on(UpdateServiceCommand).resolves({});
  });

  test('Update server command', async () => {
    console.log = jest.fn();
    await main(medplum, ['node', 'index.js', 'aws', 'update-server', 'dev']);
    expect(console.log).toBeCalledWith('Service "medplum-dev-MedplumEcsService-123" updated successfully.');
  });

  test('Update server not found', async () => {
    console.log = jest.fn();
    await main(medplum, ['node', 'index.js', 'aws', 'update-server', 'not-found']);
    expect(console.log).toBeCalledWith('Stack not found');
  });

  test('Update server stack incomplete', async () => {
    console.log = jest.fn();
    await main(medplum, ['node', 'index.js', 'aws', 'update-server', 'incomplete']);
    expect(console.log).toBeCalledWith('ECS Cluster not found');
  });
});
