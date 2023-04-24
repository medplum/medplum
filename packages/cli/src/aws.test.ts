import {
  CloudFormationClient,
  DescribeStackResourcesCommand,
  DescribeStacksCommand,
  ListStacksCommand,
} from '@aws-sdk/client-cloudformation';
import { ECSClient, UpdateServiceCommand } from '@aws-sdk/client-ecs';
import { MockClient } from '@medplum/mock';
import { mockClient } from 'aws-sdk-client-mock';
import { main } from '.';

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  promises: {
    readFile: jest.fn(async () => '{}'),
  },
}));

const medplum = new MockClient();

describe('AWS commands', () => {
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
      ],
    });

    cfMock.on(DescribeStacksCommand).resolves({
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

    cfMock.on(DescribeStackResourcesCommand).resolves({
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

    const ecsMock = mockClient(ECSClient);
    ecsMock.on(UpdateServiceCommand).resolves({});
  });

  test('List command', async () => {
    console.log = jest.fn();
    await main(medplum, ['node', 'index.js', 'aws', 'list']);
    expect(console.log).toBeCalledWith('Stack ID:        123');
  });

  test('Describe command', async () => {
    console.log = jest.fn();
    await main(medplum, ['node', 'index.js', 'aws', 'describe', 'dev']);
    expect(console.log).toBeCalledWith('Stack ID:        123');
  });

  test('Update server command', async () => {
    console.log = jest.fn();
    await main(medplum, ['node', 'index.js', 'aws', 'update-server', 'dev']);
    expect(console.log).toBeCalledWith('Service "medplum-dev-MedplumEcsService-123" updated successfully.');
  });
});
