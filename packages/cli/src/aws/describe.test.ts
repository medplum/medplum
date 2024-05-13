import {
  CloudFormationClient,
  DescribeStackResourcesCommand,
  DescribeStacksCommand,
  ListStacksCommand,
} from '@aws-sdk/client-cloudformation';
import { mockClient } from 'aws-sdk-client-mock';
import { main } from '../index';

describe('describe command', () => {
  let processError: jest.SpyInstance;

  beforeAll(() => {
    process.exit = jest.fn<never, any>().mockImplementation(function exit(exitCode: number) {
      throw new Error(`Process exited with exit code ${exitCode}`);
    }) as unknown as typeof process.exit;
    processError = jest.spyOn(process.stderr, 'write').mockImplementation(jest.fn());

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
        {
          ResourceType: 'AWS::S3::Bucket',
          ResourceStatus: 'CREATE_COMPLETE',
          LogicalResourceId: 'FrontEndAppBucket',
          PhysicalResourceId: 'app.test.medplum.com',
          Timestamp: new Date(),
        },
        {
          ResourceType: 'AWS::S3::Bucket',
          ResourceStatus: 'CREATE_COMPLETE',
          LogicalResourceId: 'StorageStorageBucket',
          PhysicalResourceId: 'storage.test.medplum.com',
          Timestamp: new Date(),
        },
        {
          ResourceType: 'AWS::EC2::SecurityGroup',
          ResourceStatus: 'CREATE_COMPLETE',
          LogicalResourceId: 'SecurityGroup',
          PhysicalResourceId: 'sg-123',
          Timestamp: new Date(),
        },
        {
          ResourceType: 'AWS::CloudFront::Distribution',
          ResourceStatus: 'CREATE_COMPLETE',
          LogicalResourceId: 'FrontEndAppDistribution',
          PhysicalResourceId: '123',
          Timestamp: new Date(),
        },
      ],
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('Describe command', async () => {
    console.log = jest.fn();
    await main(['node', 'index.js', 'aws', 'describe', 'dev']);
    expect(console.log).toHaveBeenCalledWith('Stack ID:              123');
  });

  test('Describe not found', async () => {
    console.log = jest.fn();
    await expect(main(['node', 'index.js', 'aws', 'describe', 'not-found'])).rejects.toThrow(
      'Process exited with exit code 1'
    );
    expect(console.log).toHaveBeenCalledWith('Stack not found: not-found');
    expect(processError).toHaveBeenCalledWith(expect.stringContaining('Error: Stack not found: not-found'));
  });
});
