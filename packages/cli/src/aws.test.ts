import {
  CloudFormationClient,
  DescribeStackResourcesCommand,
  DescribeStacksCommand,
  ListStacksCommand,
} from '@aws-sdk/client-cloudformation';
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { ECSClient, UpdateServiceCommand } from '@aws-sdk/client-ecs';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { MockClient } from '@medplum/mock';
import { mockClient } from 'aws-sdk-client-mock';
import fetch from 'node-fetch';
import { Readable, Writable } from 'stream';
import tar from 'tar';
import { main } from '.';
import fastGlob from 'fast-glob';

jest.mock('fast-glob', () => ({
  sync: jest.fn(() => []),
}));

jest.mock('fs', () => ({
  createReadStream: jest.fn(),
  existsSync: jest.fn(),
  mkdtempSync: jest.fn(() => '/tmp/'),
  readdirSync: jest.fn(() => []),
  readFileSync: jest.fn(),
  rmSync: jest.fn(),
  writeFileSync: jest.fn(),
  constants: {
    O_CREAT: 0,
  },
  promises: {
    readFile: jest.fn(async () => '{}'),
  },
}));

jest.mock('node-fetch', () => jest.fn());

jest.mock('tar', () => ({
  x: jest.fn(),
}));

const { Response: NodeFetchResponse } = jest.requireActual('node-fetch');

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
        {
          StackId: '144',
          StackName: 'medplum-in-progress',
          StackStatus: 'UPDATE_IN_PROGRESS',
          CreationTime: new Date(),
        },
        {
          StackId: '456',
          StackName: 'deleted-stack',
          StackStatus: 'DELETE_COMPLETE',
          CreationTime: new Date(),
        },
        {
          StackId: '789',
          StackName: 'no-details-stack',
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

    const ecsMock = mockClient(ECSClient);
    ecsMock.on(UpdateServiceCommand).resolves({});

    const s3Mock = mockClient(S3Client);
    s3Mock.on(PutObjectCommand).resolves({});

    const cloudFrontMock = mockClient(CloudFrontClient);
    cloudFrontMock.on(CreateInvalidationCommand).resolves({});
  });

  afterEach(() => {
    (fetch as jest.MockedFunction<typeof fetch>).mockReset();
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

  test('Describe not found', async () => {
    console.log = jest.fn();
    await main(medplum, ['node', 'index.js', 'aws', 'describe', 'not-found']);
    expect(console.log).toBeCalledWith('Stack not found');
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

  test('Update app command', async () => {
    console.log = jest.fn();

    // Mock the 2 fetch requests
    (fetch as jest.MockedFunction<typeof fetch>)
      // First request is for the package metadata
      .mockResolvedValueOnce(
        new NodeFetchResponse('{"dist":{"tarball":"https://example.com/tarball.tar.gz"}}', { status: 200 })
      )
      // Second request is for the tarball
      .mockResolvedValueOnce(
        new NodeFetchResponse(
          new Readable({
            read() {
              this.push(null); // Signal the end of the stream
            },
          }),
          { status: 200 }
        )
      );

    // Mock the tar extract
    (tar.x as jest.Mock).mockReturnValueOnce(
      new Writable({
        write(_chunk, _encoding, callback) {
          callback();
        },
      })
    );

    // Mock the glob search for files to upload
    (fastGlob.sync as jest.Mock).mockReturnValueOnce(['index.html']);

    await main(medplum, ['node', 'index.js', 'aws', 'update-app', 'dev']);

    expect(fetch).toHaveBeenNthCalledWith(1, 'https://registry.npmjs.org/@medplum/app/latest');
    expect(fetch).toHaveBeenNthCalledWith(2, 'https://example.com/tarball.tar.gz');
    expect(console.log).toBeCalledWith('Done');
  });

  test('Update app not found', async () => {
    console.log = jest.fn();
    await main(medplum, ['node', 'index.js', 'aws', 'update-app', 'not-found']);
    expect(console.log).toBeCalledWith('Stack not found');
  });
});
